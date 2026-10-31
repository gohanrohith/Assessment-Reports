import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
export function rasterizePdf(pdfPath: string, prefix: string): Buffer {
  execFileSync('pdftoppm', ['-r', '96', '-singlefile', '-png', pdfPath, prefix], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return readFileSync(prefix + '.png');
}
export function comparePdfRaster(actualBytes: Buffer, expectedBytes: Buffer) {
  const actual = PNG.sync.read(actualBytes),
    expected = PNG.sync.read(expectedBytes);
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new Error('PDF page dimensions changed');
  const diff = new PNG({ width: actual.width, height: actual.height });
  const count = pixelmatch(actual.data, expected.data, diff.data, actual.width, actual.height, {
    threshold: 0.1,
    includeAA: false,
  });
  return {
    ratio: count / (actual.width * actual.height),
    diff: PNG.sync.write(diff),
    width: actual.width,
    height: actual.height,
  };
}
export function calibrationHtml(color = '#17362d') {
  // Synthetic calibration only: no report engine, student data, fonts, or network resources.
  return `<!doctype html><html><head><style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:white}.header{position:absolute;left:48px;top:48px;width:696px;height:96px;background:${color}}.frame{position:absolute;left:48px;top:192px;width:696px;height:720px;border:2px solid #17362d;box-sizing:border-box}.stripe{position:absolute;left:96px;top:240px;width:600px;height:96px;background:#c58a1b}.footer{position:absolute;left:48px;top:996px;width:696px;height:48px;background:#526b60}</style></head><body><div class="header"></div><div class="frame"></div><div class="stripe"></div><div class="footer"></div></body></html>`;
}
