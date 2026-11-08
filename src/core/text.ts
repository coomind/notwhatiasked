// 글자 수 세기, 금지어 판정, 목표 판정. 클라이언트·서버(Functions)·테스트가 같은 코드를 쓴다.

let graphemeSeg: Intl.Segmenter | null = null;
function seg(): Intl.Segmenter | null {
  if (graphemeSeg) return graphemeSeg;
  try { graphemeSeg = new Intl.Segmenter('und', { granularity: 'grapheme' }); } catch { graphemeSeg = null; }
  return graphemeSeg;
}

/** 글자 수 = grapheme(사람 눈에 보이는 글자) 개수, 공백 포함 */
export function graphemeCount(s: string): number {
  const sg = seg();
  if (!sg) return Array.from(s).length;
  let n = 0;
  for (const _ of sg.segment(s)) n++;  
  return n;
}

export function totalChars(inputs: readonly string[]): number {
  return inputs.reduce((a, s) => a + graphemeCount(s), 0);
}

/** 입력 정리: 앞뒤 공백 제거 + NFC (GPT-2 결과가 공백에 민감해서 모든 전시실에 같은 규칙) */
export function cleanInput(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

// 금지어 판정에서 지우는 글자: 공백·구두점·기호·제어/서식 문자
const STRIP = /[\p{White_Space}\p{P}\p{S}\p{Cc}\p{Cf}]/u;

/** 금지어 판정용 정규화: NFKC → 소문자 → 공백·구두점 제거 */
export function normTaboo(s: string): string {
  return Array.from(s.normalize('NFKC').toLowerCase()).filter((c) => !STRIP.test(c)).join('');
}

export interface TabooHit { word: string; start: number; end: number } // start/end = 원문 UTF-16 인덱스

/**
 * 입력 안의 금지어 위치(원문 기준)를 찾는다. `pine apple`, `p.i.n.e`, 전각 문자 우회도 잡는다.
 * 정규화 문자열의 각 글자가 원문의 어느 위치에서 왔는지 기록해 두었다가 되돌린다.
 */
export function findTaboo(input: string, taboo: readonly string[]): TabooHit[] {
  let norm = '';
  const from: number[] = []; // norm 의 각 UTF-16 단위 → 원문 시작 인덱스
  const fromEnd: number[] = [];
  let i = 0;
  for (const ch of input) {
    const n = ch.normalize('NFKC').toLowerCase();
    for (const c of n) {
      if (STRIP.test(c)) continue;
      for (let k = 0; k < c.length; k++) { from.push(i); fromEnd.push(i + ch.length); }
      norm += c;
    }
    i += ch.length;
  }
  // NFKC는 글자를 합칠 수 있으므로(한글 자모 등) 전체를 한 번 더 정규화해서도 검사
  const normFull = normTaboo(input);
  const hits: TabooHit[] = [];
  for (const w of taboo) {
    const nw = normTaboo(w);
    if (!nw) continue;
    let p = norm.indexOf(nw);
    let found = false;
    while (p >= 0) {
      found = true;
      hits.push({ word: w, start: from[p], end: fromEnd[p + nw.length - 1] });
      p = norm.indexOf(nw, p + 1);
    }
    if (!found && normFull.includes(nw)) hits.push({ word: w, start: 0, end: input.length });
  }
  return hits.sort((a, b) => a.start - b.start);
}

export function hasTaboo(input: string, taboo: readonly string[]): boolean {
  return findTaboo(input, taboo).length > 0;
}

/** 목표 판정용 정규화: NFKC + 소문자 (공백·구두점은 그대로) */
export function normTarget(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

export function hitsTarget(reply: string, target: string): boolean {
  return normTarget(reply).includes(normTarget(target));
}
