// docs/미션표.md (비공개 해법표 — public/ 에 넣지 말 것) 를 미션 JSON에서 만든다. npx tsx tools/mission-table.ts
import fs from 'node:fs';
import path from 'node:path';
import type { Mission } from '../src/core/types';

const out: string[] = ['# 미션표 (비공개 — 해법 포함, 게임 화면·public/ 에 넣지 말 것)', '', `자동 생성: tools/mission-table.ts · ${new Date().toISOString().slice(0, 10)}`, '', 'par = 개발자 해법 글자 수(자동 탐색으로 찾은 최단). 도전모드 개발자 기록 = 해법 입력 수 · par.', ''];
for (const loc of fs.readdirSync('content/missions')) {
  for (const room of ['eliza', 'markov', 'gpt2']) {
    const f = path.join('content/missions', loc, `${room}.json`);
    if (!fs.existsSync(f)) continue;
    const ms = JSON.parse(fs.readFileSync(f, 'utf8')) as Mission[];
    out.push(`## ${loc} · ${room} (${ms.length}개)`, '', '| id | 제목(ko) | 목표 | 금지어 | 턴 | 해법 | par |', '|---|---|---|---|---|---|---|');
    for (const m of ms) out.push(`| ${m.id} | ${m.title.ko} | ${m.target} | ${m.taboo.join(', ')} | ${m.maxTurns} | ${m.solution!.map((s) => '`' + s.replace(/\|/g, '\\|') + '`').join(' → ')} | ${m.par} |`);
    out.push('');
  }
}
// 자동 생성 풀은 개수만(전체 목록·해법은 content/missions/<locale>/pool.json)
for (const loc of fs.readdirSync('content/missions')) {
  const f = path.join('content/missions', loc, 'pool.json');
  if (!fs.existsSync(f)) continue;
  const ms = JSON.parse(fs.readFileSync(f, 'utf8')) as Mission[];
  const c = (set: string, room: string) => ms.filter((m) => m.set === set && m.room === room).length;
  out.push(`## ${loc} · 자동 생성 풀 (${ms.length}개, tools/gen-pool.ts)`, '',
    `- 오늘의 도전: ELIZA ${c('daily', 'eliza')} · 마르코프 ${c('daily', 'markov')}`,
    `- 끝없는 도전: ELIZA ${c('endless', 'eliza')} · 마르코프 ${c('endless', 'markov')}`,
    `- 오늘의 도전 첫 7일: ${ms.filter((m) => m.set === 'daily').slice(0, 7).map((m) => m.target).join(', ')}`, '');
}
fs.writeFileSync('docs/미션표.md', out.join('\n'));
console.log('docs/미션표.md');
