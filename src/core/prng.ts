// 결정론용 시드 PRNG. 게임 안의 모든 랜덤은 여기서만 나온다(Math.random 금지 — eslint 규칙으로 막음).

/** 문자열 → 32비트 정수 해시 (cyrb53의 하위 32비트). 브라우저·Node·Workers에서 같은 값. */
export function hashStr(str: string): number {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** mulberry32: 0 이상 1 미만 실수를 내는 시드 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** seed = hash(missionId + 지금까지의 입력들) */
export function seedFor(missionId: string, inputs: readonly string[]): number {
  return hashStr(missionId + '\u0000' + inputs.join('\u0001'));
}

export function rngFor(missionId: string, inputs: readonly string[]): () => number {
  return mulberry32(seedFor(missionId, inputs));
}
