// 모바일(360×740)·PC(1440×900)에서: 각 전시실 1개씩 클리어(한·영), 공유 링크 재생, 도전 링크, 언어 토글, API 꺼짐, 공유 카드
import { test, expect, missions, say, waitResult } from './fixtures';
import { encodeInputs } from '../src/core/codec';

for (const lang of ['en', 'ko'] as const) {
  for (const room of ['eliza', 'markov'] as const) {
    test(`${lang} ${room}: 첫 미션 클리어`, async ({ page, errors }) => {
      const m = missions(lang, room)[0];
      await page.goto(`/?lang=${lang}#/m/${m.id}`);
      for (const s of m.solution!) {
        await say(page, s);
        await page.waitForTimeout(150);
        await page.locator('.log').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('.thinking')).toHaveCount(0);
      }
      const r = await waitResult(page);
      await expect(r).toContainText(lang === 'en' ? 'CLEAR' : '클리어');
      await expect(page.locator('mark.hit')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
}

test('en gpt2: 동의 → 모델 내려받기 → 첫 미션 클리어', async ({ page, errors }) => {
  const m = missions('en', 'gpt2')[0];
  await page.goto(`/?lang=en#/m/${m.id}`);
  await page.getByRole('button', { name: 'Download and enter' }).click();
  await expect(page.getByRole('textbox')).toBeVisible({ timeout: 280_000 });
  await say(page, m.solution![0]);
  const r = await waitResult(page);
  await expect(r).toContainText('CLEAR');
  expect(errors).toEqual([]);
});

test('ko gpt2: 한국어 GPT-2 가 없으면 영어 원본 모드로 열림', async ({ page }) => {
  await page.goto('/?lang=ko#/room/gpt2');
  await page.evaluate(() => localStorage.setItem('nwia:progress:v1', JSON.stringify({ cleared: {}, challenge: {}, freeTour: true, original: false, sound: false })));
  await page.reload();
  await expect(page.locator('.notice')).toContainText('영어 원본');
  await expect(page.locator('.mrow').first()).toContainText('GPT-2');
});

test('금지어: 빨간 밑줄 + 보내기 막힘 + 글로도 알림', async ({ page }) => {
  await page.goto('/?lang=en#/m/eliza-en-01');
  await page.getByRole('textbox').fill('I hate C.O.M.P.U.T.E.R.S');
  await expect(page.locator('.taboo-hit')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  await expect(page.locator('#inputhelp')).toContainText('Forbidden');
});

test('공유 링크(일반): 대화가 그대로 재생되고 "나도 해보기"', async ({ page, errors }) => {
  const m = missions('ko', 'eliza')[0];
  await page.goto(`/?lang=ko&m=${m.id}&r=${encodeInputs(m.solution!)}`);
  const end = await waitResult(page);
  await expect(end).toContainText('그대로 재생');
  await expect(page.locator('mark.hit')).toHaveCount(1);
  await page.getByRole('button', { name: '나도 해보기' }).click();
  await expect(page.getByRole('textbox')).toBeEnabled();
  await expect(page.locator('.turn')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('공유 링크(도전): 입력 재생 없이 도전모드로 시작', async ({ page }) => {
  await page.goto('/?lang=en&m=eliza-en-02&c=1');
  await expect(page.getByRole('button', { name: 'Challenge' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.turn')).toHaveCount(0);
  await expect(page.locator('.notice')).toContainText('5 tries');
  expect(page.url()).not.toContain('c=1');
});

test('도전모드 클리어 → 공유 카드(입력 가림) 내려받기', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined }); Object.defineProperty(navigator, 'canShare', { value: undefined }); });
  const m = missions('en', 'eliza')[1];
  await page.goto(`/?lang=en&m=${m.id}&c=1`);
  for (const s of m.solution!) await say(page, s);
  const r = await waitResult(page);
  await expect(r).toContainText('CLEAR');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share card' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/\.png$/);
  // 도전 기록은 첫 도전만: 다시 들어오면 '연습'
  await page.goto(`/?lang=en#/m/${m.id}`);
  await page.getByRole('button', { name: 'Challenge' }).click();
  await expect(page.locator('.mcard')).toContainText('Practice');
});

test('언어 토글 + 전시실 순서대로 열림 + 자유 관람', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Not What I Asked');
  await page.getByLabel('Language').first().selectOption('ko');
  await expect(page.locator('h1')).toHaveText('아니 그거 말고');
  await expect(page.locator('.r-markov')).toBeDisabled();
  await page.getByRole('button', { name: '자유 관람: 모든 전시실 열기' }).click();
  await expect(page.locator('.r-markov')).toBeEnabled();
  await expect(page.locator('.r-gpt2')).toBeEnabled();
  await page.reload();
  await expect(page.locator('h1')).toHaveText('아니 그거 말고'); // 고른 언어 기억
});

test('API 가 꺼져 있어도 게임은 정상', async ({ page, errors }) => {
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/?lang=en');
  await expect(page.locator('h1')).toHaveText('Not What I Asked');
  const m = missions('en', 'eliza')[0];
  await page.goto(`/?lang=en#/m/${m.id}`);
  for (const s of m.solution!) await say(page, s);
  await expect(await waitResult(page)).toContainText('CLEAR');
  // 페이지를 떠날 때 기록 보내기 시도(실패해도 조용히)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.goto('/?lang=en#/ending');
  await expect(page.locator('h1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('모바일: 입력창이 화면 안에 보임', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/?lang=ko#/m/eliza-ko-01');
  const box = await page.locator('.inputbar').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(740 + 1);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(360);
});
