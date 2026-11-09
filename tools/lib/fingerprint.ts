// 엔진·미션 데이터 지문(tests/content.test.ts, tools/fingerprint.ts)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function fingerprint(): string {
  const h = crypto.createHash('sha256');
  const files = [
    // pool.json(자동 생성 풀)은 뒤에 붙이기만 하고 기존 항목은 안 바뀌므로 지문에서 뺀다(새 미션이 늘어도 예전 기록은 그대로 유효)
    ...fs.readdirSync('content/missions').flatMap((l) => fs.readdirSync(path.join('content/missions', l)).filter((f) => f !== 'pool.json').map((f) => path.join('content/missions', l, f))),
    ...fs.readdirSync('content/eliza').map((f) => path.join('content/eliza', f)),
    ...fs.readdirSync('content/corpora').filter((l) => !l.endsWith('.md')).flatMap((l) => fs.readdirSync(path.join('content/corpora', l)).map((f) => path.join('content/corpora', l, f))),
    'src/engines/eliza/vendor/elizabot.js', 'src/engines/eliza/vendor/elizadata.js', 'src/engines/eliza/agglu.ts', 'src/engines/markov/markov.ts', 'src/core/prng.ts', 'content/gpt2/models.json',
  ].sort();
  for (const f of files) {
    let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    if (f.includes('missions')) s = JSON.stringify((JSON.parse(s) as Record<string, unknown>[]).map(({ id, target, taboo, maxTurns, par, solution }) => ({ id, target, taboo, maxTurns, par, solution })));
    h.update(f.replace(/\\/g, '/') + '\n' + s);
  }
  return h.digest('hex').slice(0, 16);
}
