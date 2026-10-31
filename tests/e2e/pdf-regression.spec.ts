import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { calibrationHtml, comparePdfRaster, rasterizePdf } from '../visual/pdf';
test('PDF A4 calibration matches its pixelmatch baseline and detects a changed fixture', async ({
  page,
}, info) => {
  await page.route('**/*', (route) => route.abort());
  await page.setContent(calibrationHtml());
  const path = info.outputPath('calibration.pdf');
  const bytes = await page.pdf({
    path,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const actual = rasterizePdf(path, info.outputPath('calibration'));
  const baseline = info.snapshotPath('foundation-pdf.png');
  if (process.env.UPDATE_PDF_BASELINES === '1') {
    if (process.env.CI) throw new Error('Baseline updates are forbidden in CI');
    mkdirSync(dirname(baseline), { recursive: true });
    writeFileSync(baseline, actual);
  }
  expect(existsSync(baseline), 'PDF baseline must be explicitly generated and reviewed').toBe(true);
  const expected = readFileSync(baseline),
    comparison = comparePdfRaster(actual, expected);
  await info.attach('PDF pixel diff', { body: comparison.diff, contentType: 'image/png' });
  expect(comparison.width).toBe(794);
  expect(comparison.height).toBe(1123);
  expect(comparison.ratio, 'Changed PDF fixture must block CI at 0.1% difference').toBeLessThan(
    0.001,
  );
  await page.setContent(calibrationHtml('#9e2525'));
  const changedPath = info.outputPath('changed.pdf');
  await page.pdf({
    path: changedPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  const changed = rasterizePdf(changedPath, info.outputPath('changed'));
  expect(
    comparePdfRaster(changed, expected).ratio,
    'Harness must detect a real rendered colour regression',
  ).toBeGreaterThan(0.001);
});
