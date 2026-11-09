/**
 * ELIZA·마르코프 미션의 최단 해법을 brute-force로 찾아 par 로 정하고 content/missions/<locale>/<room>.json 을 쓴다.
 *   npx tsx tools/solve.ts [eliza|markov|all]
 * 로그: tools/search-logs/<room>-<locale>.log (미션마다 찾은 짧은 해법 상위 몇 개)
 */
import fs from 'node:fs';
import path from 'node:path';
import { elizaEn, elizaKo, markovEn, markovKo, type Spec } from './mission-specs';
import type { Mission } from '../src/core/types';
import { solveEliza, solveMarkov, type Sol } from './lib/solver';

const which = process.argv[2] ?? 'all';
const logDir = path.resolve('tools/search-logs');
fs.mkdirSync(logDir, { recursive: true });

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
