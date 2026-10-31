import chromium from '@sparticuz/chromium';
export default async function setup() {
  await chromium.executablePath();
}
