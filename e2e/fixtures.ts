// E2E 공용: 워커별 고정 브라우저 프로필(GPT-2 모델 128MB를 브라우저 캐시에 한 번만 받기) + 테스트마다 저장소 비우기 + 콘솔 오류 수집
import { test as base, expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Mission } from '../src/core/types';

export const test = base.extend<{ errors: string[] }, { profile: BrowserContext }>({
  // 워커 하나가 프로필 하나를 계속 씀 → 모델 캐시가 남는다
  profile: [async ({}, use, workerInfo) => { // eslint-disable-line no-empty-pattern
    const p = workerInfo.project.use;
    const dir = path.join(os.tmpdir(), 'notwhatiasked-chrome-profile', `${workerInfo.project.name}-${workerInfo.parallelIndex}`);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(dir, {
      channel: 'chrome', headless: true, viewport: p.viewport, isMobile: p.isMobile, hasTouch: p.hasTouch,
      deviceScaleFactor: p.deviceScaleFactor, locale: p.locale, baseURL: p.baseURL, acceptDownloads: true,
    });
    await use(ctx);
    await ctx.close();
  }, { scope: 'worker' }],
  context: async ({ profile, baseURL }, use) => {
    // 이전 테스트의 진행 상황(localStorage·sessionStorage) 지우기. Cache Storage(모델)는 남김
    const p = await profile.newPage();
    await p.goto(`${baseURL}/robots.txt`);
    await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await p.close();
    // 배포 주소에서 돌 때는 실제 통계를 더럽히지 않도록 기록 전송만 막는다(통계 조회는 그대로)
    if (process.env.E2E_URL && !process.env.E2E_ALLOW_REPORT) await profile.route('**/api/report', (r) => r.fulfill({ status: 204 }));
    await use(profile);
    await profile.clearCookies();
    for (const pg of profile.pages()) await pg.close().catch(() => undefined);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/api\/(stats|report)|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
    await use(errors);
  },
});
export { expect };

export function missions(locale: string, room: string): Mission[] {
  return JSON.parse(fs.readFileSync(path.resolve('content/missions', locale, `${room}.json`), 'utf8')) as Mission[];
}

/** 입력창에 쓰고 보내기 */
export async function say(page: Page, text: string) {
  const input = page.getByRole('textbox');
  await input.fill(text);
  await page.getByRole('button', { name: /^(Send|보내기)$/ }).click();
}

/** 타자 효과를 건너뛰며 결과 상자 기다리기 */
export async function waitResult(page: Page) {
  const box = page.locator('.result, .replay-end');
  for (let i = 0; i < 160 && !(await box.count()); i++) {
    await page.locator('.log').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
  await expect(box.first()).toBeVisible();
  return box.first();
}
