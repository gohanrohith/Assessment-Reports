import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { configure } from './bootstrap';
async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  configure(app);
  await app.listen(Number(process.env.API_PORT ?? 4000), '0.0.0.0');
}
void main();
