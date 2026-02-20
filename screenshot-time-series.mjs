import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3001/t/5420', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'time-series-screenshot.png', fullPage: true });
await browser.close();
console.log('Screenshot saved to time-series-screenshot.png');
