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

test('ko gpt2: 한국어 GPT-2(KoGPT2) 전시실 → 동의 → 내려받기 → 첫 미션 클리어', async ({ page, errors }) => {
  await page.goto('/?lang=ko#/room/gpt2');
  await page.evaluate(() => localStorage.setItem('nwia:progress:v1', JSON.stringify({ cleared: {}, challenge: {}, freeTour: true, original: false, sound: false })));
  await page.reload();
  await expect(page.locator('.plaque')).toContainText('KoGPT2');
  await expect(page.locator('.notice')).toHaveCount(0); // 영어 원본으로 열렸다는 안내가 없어야 함
  const m = missions('ko', 'gpt2')[0];
  await page.locator('.mrow').first().click();
  const dl = page.getByRole('button', { name: '내려받고 입장' });
  if (await dl.count()) await dl.click();
  await expect(page.getByRole('textbox')).toBeVisible({ timeout: 280_000 });
  await say(page, m.solution![0]);
  const r = await waitResult(page);
  await expect(r).toContainText('클리어');
  expect(errors).toEqual([]);
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
  await expect(end).toContainText('그대로 다시 돌렸어요');
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

for (const lang of ['ko', 'en'] as const) {
  test(`${lang} 오늘의 도전: 로비 카드 → 오늘 문제 클리어 → 다음 문제까지 남은 시간`, async ({ page, errors }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 9, 12, 0, 0)); // 1일차
    const m = missions(lang, 'pool').filter((x) => x.set === 'daily')[0];
    await page.goto(`/?lang=${lang}`);
    await page.locator('.pcard.daily').click();
    await expect(page.locator('.kicker')).toContainText('#1');
    await expect(page.locator('#mtitle')).toContainText(m.target);
    for (const s of m.solution!) {
      await say(page, s);
      await page.waitForTimeout(150);
      await page.locator('.log').click({ position: { x: 5, y: 5 } });
      await expect(page.locator('.thinking')).toHaveCount(0);
    }
    const r = await waitResult(page);
    await expect(r).toContainText(lang === 'en' ? 'CLEAR' : '클리어');
    await expect(r.locator('.countdown')).toContainText('12:00:00');
    await page.getByRole('button', { name: lang === 'en' ? /Lobby/ : /로비로/ }).first().click();
    await expect(page.locator('.pcard.daily')).toContainText(lang === 'en' ? 'Cleared' : '깸');
    expect(errors).toEqual([]);
  });
}

test('지난 도전: 3일차엔 #3 #2 #1, 아직 안 열린 날은 오늘 문제로', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 11, 9, 0, 0));
  await page.goto('/?lang=ko#/archive');
  await expect(page.locator('.archive .mrow')).toHaveCount(3);
  await expect(page.locator('.archive .mrow').first()).toContainText('#3');
  await page.goto('/?lang=ko#/d/99');
  await expect(page.locator('.notice')).toContainText('아직 안 열린 날');
  await expect(page.locator('.kicker')).toContainText('#3');
});

test('끝없는 도전: 실패하면 목숨 −1, 넘기기도 −1, 다 잃으면 결과 화면', async ({ page, errors }) => {
  await page.goto('/?lang=ko#/endless');
  await expect(page.locator('.endless-bar')).toContainText('♥♥♥');
  // 한 판(턴 한도) 동안 아무 말이나: 마르코프는 모르는 단어면 멈추고, ELIZA는 딴소리
  for (let i = 0; i < 5 && !(await page.locator('.result').count()); i++) {
    await say(page, ['ㅋ', '음', '아', '흠', '헐'][i]);
    await page.waitForTimeout(150);
    await page.locator('.log').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.thinking')).toHaveCount(0);
  }
  const r = await waitResult(page);
  if (await r.getByText('목숨 하나').count()) {
    await expect(page.locator('.endless-bar')).toContainText('♥♥♡');
    await page.getByRole('button', { name: '다음 문제 →' }).click();
  } else {
    await page.getByRole('button', { name: '다음 문제 →' }).click(); // 운 좋게 깼으면 그냥 다음
  }
  while (await page.getByRole('button', { name: /넘기기/ }).count()) await page.getByRole('button', { name: /넘기기/ }).click();
  await expect(page.locator('.endless-over h1')).toContainText('끝!');
  await page.getByRole('button', { name: '다시 하기' }).click();
  await expect(page.locator('.endless-bar')).toContainText('♥♥♥');
  expect(errors).toEqual([]);
});
