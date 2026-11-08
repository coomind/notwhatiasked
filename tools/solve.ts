/**
 * ELIZA·마르코프 미션의 최단 해법을 brute-force로 찾아 par 로 정하고 content/missions/<locale>/<room>.json 을 쓴다.
 *   npx tsx tools/solve.ts [eliza|markov|all]
 * 로그: tools/search-logs/<room>-<locale>.log (미션마다 찾은 짧은 해법 상위 몇 개)
 */
import fs from 'node:fs';
import path from 'node:path';
import { elizaEn, elizaKo, markovEn, markovKo, type Spec } from './mission-specs';
import { replay, type SyncData } from '../src/engines/sync';
import { tokenize, isWord } from '../src/engines/markov/markov';
import { hasTaboo, totalChars } from '../src/core/text';
import { elizaData, markovModels } from '../src/generated/server-data';
// @ts-expect-error vendor JS
import elizaDataEn from '../src/engines/eliza/vendor/elizadata.js';
import type { Mission } from '../src/core/types';

const data: SyncData = { eliza: elizaData, markov: markovModels };
const which = process.argv[2] ?? 'all';
const logDir = path.resolve('tools/search-logs');
fs.mkdirSync(logDir, { recursive: true });

type Sol = { inputs: string[]; chars: number };
const better = (a: Sol, b: Sol) => a.chars - b.chars || a.inputs.length - b.inputs.length || a.inputs.join('|').localeCompare(b.inputs.join('|'));

function tryInputs(m: Mission, inputs: string[]): boolean {
  if (inputs.some((i) => hasTaboo(i, m.taboo))) return false;
  const r = replay(m, inputs, data);
  return r.clearedAt === inputs.length - 1;
}

function uniq(a: string[]): string[] { return [...new Set(a.map((s) => s.trim()).filter(Boolean))]; }

function elizaCandidates(locale: string): { one: string[]; mem: string[]; fill: string[] } {
  if (locale === 'en') {
    const d = elizaDataEn as { elizaKeywords: [string][]; elizaSynons: Record<string, string[]>; elizaPres: string[] };
    const keys = d.elizaKeywords.map((k) => k[0]).filter((k) => !k.startsWith('x'));
    const W = uniq([...keys, ...Object.keys(d.elizaSynons), ...Object.values(d.elizaSynons).flat(), ...d.elizaPres,
      ...'abcdefghijklmnopqrstuvwxyz'.split(''), 'hi', 'ok', 'so', 'me', 'it', 'cat', 'dog', 'mom', 'dad', 'car', 'job', 'boss', 'pie', 'tv', 'pc',
      'robot', 'sad', 'crazy', 'genius', 'smart', 'dumb', 'mad', 'ill', 'bad', 'good', 'love', 'hug', 'hate', 'kiss', 'need', 'want', 'keys', 'name', 'pal']);
    const T = (w: string) => [w, `my ${w}`, `i am ${w}`, `i'm ${w}`, `you are ${w}`, `you're ${w}`, `are you ${w}`, `i ${w} you`, `you ${w} me`,
      `i forget ${w}`, `i feel ${w}`, `i ${w}`, `you ${w}`, `you are a ${w}`, `i am a ${w}`, `${w} me`, `my ${w} is`, `i forgot ${w}`];
    const one = uniq(W.flatMap(T));
    return { one, mem: one.filter((s) => /\bmy\b/.test(s)), fill: uniq(['a', 'x', 'k', 'ok', 'hm', 'so', 'oh', 'eh', 'no', 'yes', 'hmm', 'well', 'b', 'c', 'z', 'q']) };
  }
  const d = elizaData[locale];
  const strip = (s: string) => s.replace(/\*$/, '').replace(/^@/, '');
  const W = uniq([...d.keywords.map((k) => strip(k[0])).filter((k) => !k.startsWith('x')), ...Object.keys(d.synons), ...Object.values(d.synons).flat().map(strip),
    ...Object.keys(d.pres), '나', '너', '내', '엄마', '아빠', '기계', '로봇', '미안', '아니', '응', '바보', '천재', '고양이', '개', '공부', '숙제', '학교',
    '배고파', '좋아해', '싫어', '슬퍼', '꿈', '돈', '친구', '사랑해', 'a', 'x', 'hi', 'ㅋ', '음', '아', '뭐', '왜']);
  const T = (w: string) => [w, `내 ${w}`, `나는 ${w}`, `난 ${w}`, `너는 ${w}`, `넌 ${w}`, `너는 ${w}야`, `넌 ${w}야`, `${w}야`, `${w}해`, `나 ${w}`, `너 ${w}`, `내 ${w}가`, `내 ${w}이`, `${w}해요`, `${w}요`];
  const one = uniq(W.flatMap(T));
  return { one, mem: one.filter((s) => /(^|\s)(내|나의|제|우리)\s/.test(s)), fill: uniq(['음', '아', '어', '흠', 'ㅋ', 'ㅎ', '응', '네', '예', '글쎄', '뭐', '그냥', '헐', '와']) };
}

function solveEliza(spec: Spec): { best: Sol | null; top: Sol[] } {
  const m = spec as Mission;
  const c = elizaCandidates(m.locale);
  const found: Sol[] = [];
  const variants = (s: string) => [s, s + '!', s + '.', s[0].toUpperCase() + s.slice(1), s + '?'];
  for (const s0 of c.one) for (const s of variants(s0)) if (tryInputs(m, [s])) found.push({ inputs: [s], chars: totalChars([s]) });
  for (const a of c.mem) for (const b of c.fill) if (tryInputs(m, [a, b])) found.push({ inputs: [a, b], chars: totalChars([a, b]) });
  if (m.maxTurns >= 3 && !found.length) {
    for (const a of c.mem.slice(0, 300)) for (const b of c.fill) for (const x of c.fill.slice(0, 6)) if (tryInputs(m, [a, b, x])) found.push({ inputs: [a, b, x], chars: totalChars([a, b, x]) });
  }
  found.sort(better);
  return { best: found[0] ?? null, top: found.slice(0, 8) };
}

function solveMarkov(spec: Spec): { best: Sol | null; top: Sol[] } {
  const m = spec as Mission;
  const model = markovModels[m.locale];
  const toks = model.t.map((i) => model.v[i]);
  const cand = new Set<string>();
  for (const w of model.v) if (isWord(w)) cand.add(w);
  for (let i = 0; i + 1 < toks.length; i++) if (isWord(toks[i]) && isWord(toks[i + 1])) cand.add(toks[i] + ' ' + toks[i + 1]);
  const list = [...cand].filter((s) => !hasTaboo(s, m.taboo) && tokenize(s).length > 0).sort((a, b) => totalChars([a]) - totalChars([b]) || a.localeCompare(b));
  const found: Sol[] = [];
  let bestLen = Infinity;
  for (const s of list) {
    const len = totalChars([s]);
    if (len > bestLen + 3 && found.length >= 5) break;
    if (tryInputs(m, [s])) { found.push({ inputs: [s], chars: len }); bestLen = Math.min(bestLen, len); }
  }
  found.sort(better);
  return { best: found[0] ?? null, top: found.slice(0, 8) };
}

function writeRoom(room: string, locale: string, specs: Spec[], solver: (s: Spec) => { best: Sol | null; top: Sol[] }) {
  const out: Mission[] = [];
  const log: string[] = [`# ${room}-${locale} 해법 탐색 ${new Date().toISOString()}`];
  for (const s of specs) {
    const t0 = Date.now();
    const { best, top } = solver(s);
    log.push(`\n## ${s.id} target=${JSON.stringify(s.target)} taboo=${JSON.stringify(s.taboo)} (${Date.now() - t0}ms)`);
    for (const t of top) log.push(`  ${t.chars}자  ${JSON.stringify(t.inputs)}`);
    if (!best) { log.push('  !! 해법 없음 → 미션 제외'); console.log(`✗ ${s.id} 해법 없음 (제외)`); continue; }
    const { candidates: _c, ...rest } = s;  
    out.push({ ...rest, par: best.chars, parTurns: best.inputs.length, solution: best.inputs });
    console.log(`✓ ${s.id} par=${best.chars} ${JSON.stringify(best.inputs)}`);
  }
  fs.mkdirSync(path.resolve('content/missions', locale), { recursive: true });
  fs.writeFileSync(path.resolve('content/missions', locale, `${room}.json`), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(logDir, `${room}-${locale}.log`), log.join('\n') + '\n');
}

if (which === 'eliza' || which === 'all') {
  writeRoom('eliza', 'en', elizaEn, solveEliza);
  writeRoom('eliza', 'ko', elizaKo, solveEliza);
}
if (which === 'markov' || which === 'all') {
  writeRoom('markov', 'en', markovEn, solveMarkov);
  writeRoom('markov', 'ko', markovKo, solveMarkov);
}
