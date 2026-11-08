/**
 * 화면 스크린샷 5장 → docs/screenshots/ : 로비, ELIZA·마르코프·GPT-2 전시실(실제 플레이), 공유 카드(PNG)
 *   npx tsx tools/screenshots.ts [--url https://notwhatiasked.pages.dev] [--lang ko]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import type { Mission } from '../src/core/types';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = arg('url', 'http://localhost:4173');
const lang = arg('lang', 'ko');
const outDir = path.resolve('docs/screenshots');
fs.mkdirSync(outDir, { recursive: true });
const ms = (loc: string, room: string) => JSON.parse(fs.readFileSync(`content/missions/${loc}/${room}.json`, 'utf8')) as Mission[];

async function play(page: Page, inputs: string[]) {
  for (const s of inputs) {
    await page.getByRole('textbox').fill(s);
    await page.getByRole('button', { name: /^(Send|보내기)$/ }).click();
    for (let i = 0; i < 200; i++) { if (!(await page.locator('.caret, .thinking').count())) break; await page.waitForTimeout(150); }
    await page.waitForTimeout(300);
  }
}

async function main() {
  const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'notwhatiasked-chrome-profile', 'shots'), {
    channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
  });
  // 실제 통계에 안 섞이게(sendBeacon 은 route 로 못 막을 때가 있어 빈 함수로)
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'sendBeacon', { value: () => true, configurable: true }); });
  await ctx.route('**/api/report', (r) => r.fulfill({ status: 204 }));
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${base}/?lang=${lang}`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('nwia:progress:v1', JSON.stringify({ cleared: { 'eliza-ko-01': { attempts: 1, chars: 2 }, 'eliza-en-01': { attempts: 1, chars: 8 } }, challenge: {}, freeTour: false, original: false, sound: false })); });
  await page.reload();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, '1-lobby.png'), fullPage: true });

  const el = ms(lang, 'eliza')[5] ?? ms('en', 'eliza')[5];
  await page.goto(`${base}/?lang=${lang}#/m/${el.id}`);
  await play(page, ['안녕하세요', ...el.solution!]);
  await page.screenshot({ path: path.join(outDir, '2-eliza.png') });

  const mk = ms(lang, 'markov')[1] ?? ms('en', 'markov')[1];
  await page.goto(`${base}/?lang=${lang}#/m/${mk.id}`);
  await play(page, [lang === 'ko' ? '나는' : 'the queen said', ...mk.solution!]);
  await page.screenshot({ path: path.join(outDir, '3-markov.png') });

  const g = ms('en', 'gpt2')[7];
  await page.goto(`${base}/?lang=${lang}#/m/${g.id}`);
  const dl = page.getByRole('button', { name: /Download and enter|내려받고 입장/ });
  if (await dl.count()) await dl.click();
  await page.getByRole('textbox').waitFor({ timeout: 300_000 });
  await play(page, ['The yellow tropical fruit with spiky skin is called a', ...g.solution!]);
  await page.screenshot({ path: path.join(outDir, '4-gpt2.png') });

  // 공유 카드: 내려받기 경로로 PNG 저장
  await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); });
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: /Share card|카드 공유/ }).click();
  const d = await wait;
  await d.saveAs(path.join(outDir, '5-share-card.png'));
  await ctx.close();
  console.log('docs/screenshots: 5 files');
}
main().catch((e) => { console.error(e); process.exit(1); });
