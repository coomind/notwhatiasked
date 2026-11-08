// 타자 소리: 아주 짧은 잡음 한 번(Web Audio로 만듦, 파일 없음). 기본 꺼짐.
let ctx: AudioContext | null = null;
let last = 0;

export function tick(kind: 'eliza' | 'markov' | 'gpt2') {
  const now = performance.now();
  if (now - last < 45) return;
  last = now;
  try {
    ctx ??= new AudioContext();
    const len = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // 결정론과 상관없는 소리라도 Math.random 대신 간단한 LCG
    let s = (now * 1000) | 0;
    for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = ((s / 0x7fffffff) * 2 - 1) * (1 - i / len); }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'eliza' ? 1800 : kind === 'markov' ? 3200 : 5000;
    const g = ctx.createGain();
    g.gain.value = kind === 'eliza' ? 0.5 : 0.18;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  } catch { /* 소리 실패는 무시 */ }
}
