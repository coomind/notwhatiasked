/**
 * GPT-2 결정론 확인.
 *  1) [필수] 이 브라우저 출력 == 다른 브라우저 세션(tools/gpt2-snapshot.ts 가 따로 띄운 헤드리스 Chrome)에서 기록한 출력, 글자 하나까지
 *  2) [필수] 미션 해법을 브라우저에서 돌리면 목표 단어가 나온다
 *  3) [참고] Node(onnxruntime-node 네이티브 CPU) 출력과 비교 → tools/search-logs/gpt2-node-vs-browser.json 에 일치 수 기록(실패로 보지 않음, 작업노트 참고)
 */
import { test, expect, missions } from './fixtures';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { GPT2_PROMPTS } from './gpt2-prompts';
import { hitsTarget } from '../src/core/text';

test('GPT-2: 브라우저 출력이 기록과 똑같고, 미션 해법이 통한다 (+ Node 비교 기록)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(900_000);
  await page.goto('/?lang=en');
  await page.waitForFunction(() => !!(window as unknown as { __nwia?: unknown }).__nwia);
  await page.evaluate(async () => { await (window as unknown as { __nwia: { loadGpt2: (l: string) => Promise<void> } }).__nwia.loadGpt2('en'); });
  const gen = (p: string) => page.evaluate(async (pp) => (window as unknown as { __nwia: { gpt2Generate: (l: string, p: string) => Promise<string> } }).__nwia.gpt2Generate('en', pp), p);
  const got: string[] = [];
  for (const p of GPT2_PROMPTS) got.push(await gen(p));

  // 1) 기록과 비교
  const snap = JSON.parse(fs.readFileSync('e2e/gpt2-snapshot.json', 'utf8')) as { prompt: string; out: string }[];
  expect(GPT2_PROMPTS.length).toBeGreaterThanOrEqual(12);
  const mismatch = GPT2_PROMPTS.map((p, i) => ({ p, want: snap.find((s) => s.prompt === p)?.out, got: got[i] })).filter((x) => x.want !== x.got);
  expect(mismatch, JSON.stringify(mismatch, null, 2)).toEqual([]);

  // 2) 미션 해법
  for (const m of missions('en', 'gpt2')) expect(hitsTarget(got[GPT2_PROMPTS.indexOf(m.solution![0])], m.target), m.id).toBe(true);

  // 3) Node 네이티브와 비교(참고)
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/gpt2-prompts.json', JSON.stringify(GPT2_PROMPTS));
  try {
    const stdout = execSync('npx tsx tools/gpt2-batch.ts test-results/gpt2-prompts.json', { encoding: 'utf8', maxBuffer: 1 << 24 });
    const node = JSON.parse(stdout.slice(stdout.indexOf('@@JSON@@') + 8)) as string[];
    const report = GPT2_PROMPTS.map((p, i) => ({ prompt: p, node: node[i], browser: got[i], same: node[i] === got[i] }));
    fs.writeFileSync('tools/search-logs/gpt2-node-vs-browser.json', JSON.stringify(report, null, 2));
    info.annotations.push({ type: 'node-vs-browser', description: `${report.filter((r) => r.same).length}/${report.length} identical` });
  } catch (e) {
    info.annotations.push({ type: 'node-vs-browser', description: `skipped: ${(e as Error).message.slice(0, 100)}` });
  }
});
