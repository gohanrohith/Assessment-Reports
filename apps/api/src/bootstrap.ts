import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID, createHash } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { Database } from './database';
import { AuthRequest } from './security';
export function configure(app: INestApplication) {
  const settings = config();
  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: settings.origin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const db = app.get(Database);
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const cid = randomUUID();
    (req as AuthRequest).correlationId = cid;
    res.setHeader('X-Correlation-ID', cid);
    res.setHeader('Cache-Control', 'no-store');
    if (
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== settings.origin
    ) {
      res.status(403).json({ message: 'Origin denied' });
      return;
    }
    if (req.path.startsWith('/v1/') && req.path !== '/v1/health') {
      const auth = req.path.startsWith('/v1/auth');
      // Shared PostgreSQL counter: spoofed forwarding headers are deliberately ignored.
      const ip = req.socket.remoteAddress ?? 'unknown';
      const key = createHash('sha256')
        .update(ip + ':' + (auth ? 'auth' : 'api') + ':' + Math.floor(Date.now() / 60000))
        .digest('hex');
      try {
        const bucket = await db.rateBucket.upsert({
          where: { key },
          create: { key, resetsAt: new Date(Date.now() + 120000) },
          update: { hits: { increment: 1 } },
        });
        if (bucket.hits > (auth ? 60 : 300)) {
          res.setHeader('Retry-After', '60');
          res.status(429).json({ message: 'Too many requests' });
          return;
        }
      } catch {
        res.status(503).json({ message: 'Authentication unavailable' });
        return;
      }
    }
    next();
  });
  const spec = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Assessment Foundation')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  // Expose docs only in development; public health remains the only anonymous non-auth route.
  if (!settings.production) SwaggerModule.setup('openapi', app, spec);
  app.enableShutdownHooks();
  return spec;
}
