/**
 * npm run test:missions — 모든 미션이 개발자 해법으로 실제 클리어되는지 증명한다. 하나라도 실패하면 exit 1(빌드 실패).
 *  1) solution 에 금지어가 없는지
 *  2) solution 을 엔진에 넣으면 마지막 입력에서 target 이 나오는지(ELIZA·마르코프는 시드 리플레이, GPT-2는 헤드리스 Chrome에서 실제 실행)
 *  3) solution 글자 수 == par, 입력 개수 == parTurns
 *  + 형식 검사(필수 칸, 제목·힌트 번역, id 중복, 목표가 금지어로 막혀 있는지)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Mission } from '../src/core/types';
import { CHALLENGE_MAX } from '../src/core/types';
import { hasTaboo, hitsTarget, totalChars } from '../src/core/text';
import { replay } from '../src/engines/sync';
import { elizaData, markovModels } from '../src/generated/server-data';

const root = path.resolve('content/missions');
const uiLangs = fs.readdirSync(path.resolve('content/i18n')).map((f) => f.replace('.json', ''));
const errors: string[] = [];
const all: Mission[] = [];
for (const loc of fs.readdirSync(root)) {
  for (const f of fs.readdirSync(path.join(root, loc))) {
    const room = f.replace('.json', '');
    const list = JSON.parse(fs.readFileSync(path.join(root, loc, f), 'utf8')) as Mission[];
    for (const m of list) {
      if (m.locale !== loc || (room === 'pool' ? !m.set : m.room !== room || m.set)) errors.push(`${m.id}: 파일 위치(${loc}/${f})와 locale/room/set 불일치`);
      all.push(m);
    }
  }
}
const ids = new Set<string>();
for (const m of all) {
  const e = (s: string) => errors.push(`${m.id}: ${s}`);
  if (ids.has(m.id)) e('id 중복');
  ids.add(m.id);
  for (const k of ['id', 'room', 'locale', 'target', 'taboo', 'maxTurns', 'par', 'solution', 'hint', 'title'] as const) if (m[k] === undefined) e(`${k} 없음`);
  for (const l of uiLangs) { if (!m.title?.[l]) e(`title.${l} 없음`); if (!m.hint?.[l]) e(`hint.${l} 없음`); }
  if (!hasTaboo(m.target, m.taboo)) e('목표 단어가 금지어로 막혀 있지 않음(정공법이 열려 있음)');
  const sol = m.solution ?? [];
  if (!sol.length) { e('solution 비어 있음'); continue; }
  if (sol.length > m.maxTurns || sol.length > CHALLENGE_MAX) e(`solution 입력 ${sol.length}개 > 턴 한도`);
  sol.forEach((s, i) => { if (hasTaboo(s, m.taboo)) e(`solution[${i}]에 금지어`); });
  if (totalChars(sol) !== m.par) e(`par ${m.par} ≠ solution 글자 수 ${totalChars(sol)}`);
  if ((m.parTurns ?? 1) !== sol.length) e(`parTurns ${m.parTurns} ≠ solution 입력 수 ${sol.length}`);
}

async function main() {
  // 언어별 GPT-2(영어 GPT-2 / 한국어 KoGPT2)를 따로 띄운다
  const gpt2s = new Map<string, { gen: (p: string) => Promise<string>; close: () => Promise<void> }>();
  let ok = 0;
  for (const m of all) {
    const sol = m.solution ?? [];
    if (!sol.length) continue;
    if (m.room === 'gpt2') {
      // 플레이어와 같은 경로(브라우저 WASM)로 확인. Node 네이티브 ONNX는 근소한 동점에서 다른 토큰을 고를 수 있음
      // 같은 브라우저 프로필은 한 번에 하나만 열 수 있어서, 언어가 바뀌면 앞의 것을 닫고 새로 띄운다
      if (!gpt2s.has(m.locale)) {
        for (const g of gpt2s.values()) await g.close();
        gpt2s.clear();
        const { createBrowserGpt2 } = await import('./lib/gpt2-browser');
        gpt2s.set(m.locale, await createBrowserGpt2(m.locale));
      }
      const out = await gpt2s.get(m.locale)!.gen(sol[sol.length - 1]);
      if (!hitsTarget(out, m.target)) errors.push(`${m.id}: GPT-2 출력에 목표 없음 — ${JSON.stringify(out)}`); else ok++;
      continue;
    }
    const r = replay(m, sol, { eliza: elizaData, markov: markovModels });
    if (r.clearedAt !== sol.length - 1) errors.push(`${m.id}: 해법이 클리어하지 못함(clearedAt=${r.clearedAt}) — ${JSON.stringify(r.replies.map((x) => x.text))}`); else ok++;
  }
  for (const g of gpt2s.values()) await g.close();
  const count = (room: string, loc: string) => all.filter((m) => m.room === room && m.locale === loc && !m.set).length;
  console.log(`미션 ${all.length}개 · 해법 확인 ${ok}개`);
  const pool = (set: string, loc: string) => all.filter((m) => m.set === set && m.locale === loc).length;
  for (const loc of ['en', 'ko']) console.log(`  ${loc}: 전시실 eliza ${count('eliza', loc)} · markov ${count('markov', loc)} · gpt2 ${count('gpt2', loc)} / 오늘의 도전 ${pool('daily', loc)} · 끝없는 도전 ${pool('endless', loc)}`);
  if (errors.length) { console.error('\n실패:\n' + errors.map((x) => '  ✗ ' + x).join('\n')); process.exit(1); }
  console.log('✓ test:missions 통과');
}
main().catch((e) => { console.error(e); process.exit(1); });
