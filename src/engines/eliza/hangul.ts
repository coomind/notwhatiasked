// 한글 음절 조작 도우미(받침 확인·변경)

const BASE = 0xac00;
const LAST = 0xd7a3;
export const J_NONE = 0, J_N = 4, J_L = 8, J_B = 17, J_SS = 20;

export function isSyllable(c: string | undefined): boolean {
  if (!c) return false;
  const x = c.charCodeAt(0);
  return x >= BASE && x <= LAST;
}

/** 받침 번호(0=없음). 한글 음절이 아니면 -1 */
export function jong(c: string | undefined): number {
  if (!isSyllable(c)) return -1;
  return (c!.charCodeAt(0) - BASE) % 28;
}

export function withJong(c: string, j: number): string {
  const x = c.charCodeAt(0) - BASE;
  return String.fromCharCode(BASE + x - (x % 28) + j);
}

/** 끝 글자에 받침이 있나 (숫자·영문은 대충 판단: 받침 있는 숫자 0136780, 영문은 없음으로) */
export function endsWithConsonant(s: string): boolean {
  const t = s.replace(/[\s"'”’)\]]+$/u, '');
  const c = t[t.length - 1];
  if (!c) return false;
  const j = jong(c);
  if (j >= 0) return j !== 0;
  if (/[0136-8]/.test(c)) return true;
  if (/[lmnLMN]/.test(c)) return true;
  return false;
}

export function endsWithRieul(s: string): boolean {
  const t = s.replace(/[\s"'”’)\]]+$/u, '');
  return jong(t[t.length - 1]) === J_L;
}

/** "{이/가}" 같은 조사 표시를 앞 글자 받침에 맞게 고른다. {으로/로}는 ㄹ 받침이면 로 */
export function fixJosa(s: string): string {
  return s.replace(/\{([^/{}]+)\/([^/{}]*)\}/g, (_m, a: string, b: string, off: number) => {
    const before = s.slice(0, off);
    if (a === '으로' && endsWithRieul(before)) return b;
    return endsWithConsonant(before) ? a : b;
  });
}
