const { chromium } = require('../client/node_modules/playwright');
const path = require('path');
const OUT = __dirname;

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const ctx  = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('.card', { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, '01-initial.png') });
  console.log('1: initial page');

  await page.fill('#originZip', '30301');
  await page.fill('#destinationZip', '90001');
  await page.click('label:has-text("Flatbed")');
  await page.screenshot({ path: path.join(OUT, '02-filled.png') });
  console.log('2: form filled');

  await page.click('.submit-btn');
  await page.waitForSelector('.result', { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, '03-quote.png'), fullPage: true });
  console.log('3: quote result');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(OUT, '04-mobile.png'), fullPage: true });
  console.log('4: mobile view');

  await browser.close();
  console.log('Done — screenshots in', OUT);
})().catch(e => { console.error(e.message); process.exit(1); });
