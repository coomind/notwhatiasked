/**
 * GPT-2 미션 해법 탐색: NOVA API(OpenAI 호환, 키는 환경변수 NOVA_API_KEY)로 프롬프트 후보를 대량 생성 →
 * 헤드리스 Chrome(플레이어와 같은 WASM 경로, tools/lib/gpt2-browser.ts)에서 GPT-2(탐욕 디코딩)로 실제 실행 → 목표가 나온 것 중 최단을 par 로. 성공한 프롬프트는 낱말을 빼 보며 더 줄인다.
 *   npx tsx tools/gpt2-search.ts [missionId...]
 * 로그: tools/search-logs/gpt2-en.log, 결과: content/missions/en/gpt2.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { gpt2En, type Spec } from './mission-specs';
import { hasTaboo, hitsTarget, totalChars, cleanInput } from '../src/core/text';
import { createBrowserGpt2 } from './lib/gpt2-browser';
import type { Mission } from '../src/core/types';

const KEY = process.env.NOVA_API_KEY;
const BASE = 'https://factchat-cloud.mindlogic.ai/v1/gateway';
const MODEL = process.env.NOVA_MODEL ?? 'claude-opus-5-5';
const only = process.argv.slice(2);
const logPath = path.resolve(`tools/search-logs/gpt2-en${process.env.LOG_SUFFIX ?? ''}.log`);
const outPath = path.resolve('content/missions/en/gpt2.json');
const resDir = path.resolve('tools/search-logs/gpt2-results');
fs.mkdirSync(resDir, { recursive: true });
const log = (s: string) => { fs.appendFileSync(logPath, s + '\n'); };

async function nova(prompt: string): Promise<string[]> {
  if (!KEY) throw new Error('NOVA_API_KEY 없음');
  for (let tries = 0; tries < 3; tries++) {
    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 1, max_tokens: 4000 }),
      });
      if (!r.ok) { log(`  nova http ${r.status}`); continue; }
      const j = (await r.json()) as { choices: { message: { content: string } }[] };
      const txt = j.choices?.[0]?.message?.content ?? '';
      const m = txt.match(/\[[\s\S]*\]/);
      if (!m) continue;
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string');
    } catch (e) { log(`  nova error ${(e as Error).message}`); }
  }
  return [];
}

function ask(spec: Spec, n: number, feedback: string): string {
  return `You are helping design a puzzle game. The player must make the small 2019 GPT-2 model (124M, greedy decoding, continues text for 25 tokens) output the word "${spec.target}" in its continuation.
The player's prompt must NOT contain any of these forbidden strings (checked case-insensitively after removing all spaces and punctuation): ${spec.taboo.map((t) => JSON.stringify(t)).join(', ')}.
Shorter prompts are better (score = number of characters). GPT-2 is not a chatbot: it simply continues text, loves lists, repetition, news style, Wikipedia style, recipes, Q&A forum style.
${feedback}
Give ${n} diverse candidate prompts, most of them very short (2-8 words), some longer and cleverly structured. Prompts should not end with a trailing space.
Answer ONLY with a JSON array of strings.`;
}

async function main() {
  const browser = await createBrowserGpt2();
  const gen = browser.gen;
  log(`\n# GPT-2 해법 탐색 ${new Date().toISOString()} model=${MODEL}`);
  for (const spec of gpt2En) {
    if (only.length && !only.includes(spec.id)) continue;
    log(`\n## ${spec.id} target=${spec.target} taboo=${JSON.stringify(spec.taboo)}`);
    const tried = new Map<string, string>();
    const hits: string[] = [];
    const run = async (p: string) => {
      p = cleanInput(p);
      if (!p || tried.has(p) || hasTaboo(p, spec.taboo) || totalChars([p]) > 120) return;
      const out = await gen(p);
      tried.set(p, out);
      const ok = hitsTarget(out, spec.target);
      if (ok) hits.push(p);
      log(`  ${ok ? 'HIT ' : '    '}${JSON.stringify(p)} -> ${JSON.stringify(out.slice(0, 90))}`);
    };
    for (const p of spec.candidates?.flat() ?? []) await run(p);
    let feedback = '';
    for (let round = 0; round < 4; round++) {
      const cands = await nova(ask(spec, 60, feedback));
      log(`  [round ${round}] ${cands.length} candidates`);
      for (const c of cands) await run(c);
      const best = [...hits].sort((a, b) => totalChars([a]) - totalChars([b]));
      if (best.length >= 3 && round >= 1) break;
      const near = [...tried.entries()].slice(-12).map(([p, o]) => `prompt ${JSON.stringify(p)} -> GPT-2 wrote ${JSON.stringify(o.slice(0, 70))}`).join('\n');
      feedback = `${best.length ? `These prompts WORKED (try to find even shorter ones): ${best.slice(0, 5).map((x) => JSON.stringify(x)).join(', ')}` : 'None of the previous attempts worked yet.'}\nSome recent attempts and what GPT-2 actually wrote:\n${near}`;
    }
    // 줄이기: 가장 짧은 성공 몇 개만 골라 앞·뒤 낱말/낱말 하나씩 빼 보기(최대 150번 실행)
    let shrinkRuns = 0;
    const shrinkQueue = [...new Set(hits)].sort((a, b) => totalChars([a]) - totalChars([b])).slice(0, 8);
    for (let i = 0; i < shrinkQueue.length && shrinkRuns < 150; i++) {
      const w = shrinkQueue[i].split(' ');
      if (w.length < 2) continue;
      const vars = new Set<string>();
      for (let k = 0; k < w.length; k++) vars.add(w.filter((_, j) => j !== k).join(' '));
      vars.add(w.slice(1).join(' ')); vars.add(w.slice(0, -1).join(' '));
      for (const v of vars) { if (tried.has(cleanInput(v))) continue; shrinkRuns++; const before = hits.length; await run(v); if (hits.length > before) shrinkQueue.splice(i + 1, 0, v); }
    }
    const best = [...new Set(hits)].sort((a, b) => totalChars([a]) - totalChars([b]) || a.localeCompare(b));
    if (!best.length) { log('  !! 해법 없음 → 미션 제외'); console.log(`✗ ${spec.id} 해법 없음`); fs.writeFileSync(path.join(resDir, spec.id + '.json'), 'null'); continue; }
    const { candidates: _c, ...rest } = spec;  
    const mission: Mission = { ...rest, par: totalChars([best[0]]), parTurns: 1, solution: [best[0]] };
    fs.writeFileSync(path.join(resDir, spec.id + '.json'), JSON.stringify(mission));
    log(`  BEST ${totalChars([best[0]])}자 ${JSON.stringify(best[0])} (hits ${best.length}, tried ${tried.size})`);
    console.log(`✓ ${spec.id} par=${totalChars([best[0]])} ${JSON.stringify(best[0])} (tried ${tried.size})`);
    merge();
  }
  merge();
  await browser.close();
}

/** 미션별 결과 파일을 모아 content/missions/en/gpt2.json (설계 순서대로, 해법 없는 미션은 뺌) */
function merge() {
  const ordered = gpt2En.map((s) => {
    const f = path.join(resDir, s.id + '.json');
    return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Mission | null) : null;
  }).filter(Boolean);
  fs.writeFileSync(outPath, JSON.stringify(ordered, null, 2) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
