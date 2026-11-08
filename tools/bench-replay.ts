// 서버 리플레이 비용 측정(Node). Workers 무료 CPU 10ms 한도 안에 들도록 REPLAY_BUDGET_UNITS 를 정하는 근거.
import { replay, type SyncData } from '../src/engines/sync';
import { elizaData, markovModels, allMissions } from '../src/generated/server-data';
const t = () => performance.now();
for (const room of ['eliza', 'markov']) for (const loc of ['en', 'ko']) {
  const ms = allMissions.filter((m) => m.room === room && m.locale === loc);
  const data: SyncData = { eliza: elizaData, markov: markovModels };
  // 첫 실행(초기화 포함)
  let t0 = t(); replay(ms[0], ms[0].solution!, data); const first = t() - t0;
  // 이후 입력 1개당
  let n = 0; t0 = t();
  for (let k = 0; k < 20; k++) for (const m of ms) { replay(m, ['the old man said', 'my mother', '나는 엄마가 싫어', 'hello there'].slice(0, 2), data); n += 2; }
  console.log(`${room}-${loc}: first(init) ${first.toFixed(2)}ms, per input ${((t() - t0) / n).toFixed(3)}ms`);
}
