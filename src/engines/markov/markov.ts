/**
 * 1980s 말 이어붙이는 기계: 2차(앞 두 단어 → 다음 단어) 단어 단위 마르코프 체인.
 * 학습 글(퍼블릭 도메인)은 빌드 때 토큰 배열로 만들어 둔다(src/generated/markov-<locale>.json).
 * 다음 단어 = 학습 글에서 (앞 두 단어)가 나온 모든 자리의 '그다음 단어' 중 하나를 시드 PRNG로 고름 → 자주 나온 단어일수록 잘 뽑힘.
 * (앞 두 단어) 조합이 학습 글에 없으면 1차(앞 한 단어)로 물러서고, 그 단어도 모르면 멈춘다.
 * 문장이 끝나면(. ! ?) 또는 30단어가 되면 멈춘다.
 */
import { rngFor } from '../../core/prng';
import { MARKOV_MAX_INPUT_WORDS, MARKOV_MAX_OUTPUT_WORDS } from '../../core/types';
import type { ChatSession } from '../types';

export interface MarkovModel { v: string[]; t: number[] }

export interface PreparedModel {
  vocab: string[];
  index: Map<string, number>;
  tok: Int32Array;
  first: Int32Array; // 단어 id → 처음 나온 위치
  next: Int32Array;  // 위치 → 같은 단어가 다음에 나온 위치
}

/** 단어·구두점 토큰. 클라이언트·서버·빌드가 같은 규칙(브라우저마다 다른 Intl.Segmenter 결과를 피하려고 정규식 사용) */
const TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*|[.,!?;:]/gu;
export function tokenize(text: string): string[] {
  return (text.normalize('NFKC').toLowerCase().replace(/’/g, "'").match(TOKEN_RE) ?? []);
}
export const isWord = (t: string) => !/^[.,!?;:]$/.test(t);
const SENTENCE_END = new Set(['.', '!', '?']);

export function prepare(m: MarkovModel): PreparedModel {
  const n = m.t.length;
  const tok = Int32Array.from(m.t);
  const first = new Int32Array(m.v.length).fill(-1);
  const last = new Int32Array(m.v.length).fill(-1);
  const next = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const w = tok[i];
    if (first[w] < 0) first[w] = i; else next[last[w]] = i;
    last[w] = i;
  }
  const index = new Map<string, number>();
  m.v.forEach((w, i) => index.set(w, i));
  return { vocab: m.v, index, tok, first, next };
}

function successors(p: PreparedModel, a: number, b: number): number[] {
  const out: number[] = [];
  const n = p.tok.length;
  for (let pos = p.first[b]; pos >= 0; pos = p.next[pos]) {
    if (pos + 1 >= n) continue;
    if (a >= 0 && (pos === 0 || p.tok[pos - 1] !== a)) continue;
    out.push(p.tok[pos + 1]);
  }
  return out;
}

export interface MarkovOutput { tokens: string[]; unknownWord?: string; order: 0 | 1 | 2 }

export function generate(p: PreparedModel, input: string, rng: () => number, maxWords = MARKOV_MAX_OUTPUT_WORDS): MarkovOutput {
  const words = tokenize(input).slice(-MARKOV_MAX_INPUT_WORDS * 2);
  if (!words.length) return { tokens: [], order: 0 };
  const ids = words.map((w) => p.index.get(w) ?? -1);
  let b = ids[ids.length - 1];
  let a = ids.length > 1 ? ids[ids.length - 2] : -1;
  if (b < 0) return { tokens: [], unknownWord: words[words.length - 1], order: 0 };
  const out: string[] = [];
  let order: 0 | 1 | 2 = 2;
  let count = 0;
  let guard = 0;
  while (count < maxWords && guard++ < maxWords * 3) {
    let cands = a >= 0 ? successors(p, a, b) : [];
    if (!cands.length) { cands = successors(p, -1, b); if (out.length === 0) order = 1; }
    if (!cands.length) break;
    const nx = cands[Math.floor(rng() * cands.length)];
    out.push(p.vocab[nx]);
    if (isWord(p.vocab[nx])) count++;
    else if (SENTENCE_END.has(p.vocab[nx]) && count > 0) break; // 문장이 끝나면 멈춤
    a = b; b = nx;
  }
  return { tokens: out, order };
}

/** 토큰을 글로: 구두점 앞 공백 없음 */
export function detok(tokens: string[]): string {
  let s = '';
  for (const t of tokens) s += (s && isWord(t) ? ' ' : '') + t;
  return s;
}

export function countWords(input: string): number { return tokenize(input).filter(isWord).length; }

export function createMarkov(missionId: string, model: PreparedModel): ChatSession {
  const history: string[] = [];
  return {
    reply(input: string) {
      history.push(input);
      const r = generate(model, input, rngFor(missionId, history));
      if (r.unknownWord) return { text: '', unknownWord: r.unknownWord };
      return { text: detok(r.tokens) };
    },
  };
}
