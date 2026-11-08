// 개발용: 엔진에 입력을 넣어 대답 보기. npx tsx tools/probe.ts <eliza-en|eliza-ko|markov-en|markov-ko> <missionId> "입력1" "입력2" ...
import { createElizaEn } from '../src/engines/eliza/en';
import { createElizaAgglu } from '../src/engines/eliza/agglu';
import { createMarkov, prepare } from '../src/engines/markov/markov';
import { elizaData, markovModels } from '../src/generated/server-data';
const [kind, mid, ...inputs] = process.argv.slice(2);
const s = kind === 'eliza-en' ? createElizaEn(mid, { noRandom: mid === 'norandom' }) : kind === 'eliza-ko' ? createElizaAgglu(mid, elizaData.ko) : createMarkov(mid, prepare(markovModels[kind.split('-')[1]]));
if (s.greeting) console.log('  ' + s.greeting);
for (const i of inputs) { const r = s.reply(i); console.log('> ' + i + '\n  ' + (r.unknownWord ? `[unknown: ${r.unknownWord}]` : r.text)); }
