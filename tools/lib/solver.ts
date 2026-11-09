// ELIZA·마르코프 해법 brute-force 탐색(tools/solve.ts, tools/gen-pool.ts 공용)
import { replay, type SyncData } from '../../src/engines/sync';
import { tokenize, isWord } from '../../src/engines/markov/markov';
import { hasTaboo, totalChars } from '../../src/core/text';
import { elizaData, markovModels } from '../../src/generated/server-data';
// @ts-expect-error vendor JS
import elizaDataEn from '../../src/engines/eliza/vendor/elizadata.js';
import type { Mission } from '../../src/core/types';
import type { Spec } from '../mission-specs';

export const data: SyncData = { eliza: elizaData, markov: markovModels };

export type Sol = { inputs: string[]; chars: number };
export const better = (a: Sol, b: Sol) => a.chars - b.chars || a.inputs.length - b.inputs.length || a.inputs.join('|').localeCompare(b.inputs.join('|'));

export function tryInputs(m: Mission, inputs: string[]): boolean {
  if (inputs.some((i) => hasTaboo(i, m.taboo))) return false;
  const r = replay(m, inputs, data);
  return r.clearedAt === inputs.length - 1;
}

function uniq(a: string[]): string[] { return [...new Set(a.map((s) => s.trim()).filter(Boolean))]; }

export function elizaCandidates(locale: string): { one: string[]; mem: string[]; fill: string[] } {
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

export function solveEliza(spec: Spec): { best: Sol | null; top: Sol[] } {
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

export function solveMarkov(spec: Spec, maxTries = Infinity): { best: Sol | null; top: Sol[] } {
  const m = spec as Mission;
  const model = markovModels[m.locale];
  const toks = model.t.map((i) => model.v[i]);
  const cand = new Set<string>();
  for (const w of model.v) if (isWord(w)) cand.add(w);
  for (let i = 0; i + 1 < toks.length; i++) if (isWord(toks[i]) && isWord(toks[i + 1])) cand.add(toks[i] + ' ' + toks[i + 1]);
  const list = [...cand].filter((s) => !hasTaboo(s, m.taboo) && tokenize(s).length > 0).sort((a, b) => totalChars([a]) - totalChars([b]) || a.localeCompare(b));
  const found: Sol[] = [];
  let bestLen = Infinity;
  let tries = 0;
  for (const s of list) {
    if (++tries > maxTries) break;
    const len = totalChars([s]);
    if (len > bestLen + 3 && found.length >= 5) break;
    if (tryInputs(m, [s])) { found.push({ inputs: [s], chars: len }); bestLen = Math.min(bestLen, len); }
  }
  found.sort(better);
  return { best: found[0] ?? null, top: found.slice(0, 8) };
}

