/**
 * 결정론 엔진(ELIZA·마르코프) 공용 실행기. 브라우저·Functions(서버 리플레이 검증)·테스트·해법 탐색이 모두 이걸 쓴다.
 * 데이터는 호출하는 쪽이 넘긴다(브라우저는 필요할 때 나눠 받고, 서버는 정적으로 묶음).
 */
import type { Mission, Reply } from '../core/types';
import { hasTaboo, hitsTarget } from '../core/text';
import { createElizaEn } from './eliza/en';
import { createElizaAgglu, type AggluData } from './eliza/agglu';
import { createMarkov, prepare, type MarkovModel, type PreparedModel } from './markov/markov';
import type { ChatSession } from './types';

export interface SyncData {
  eliza: Record<string, AggluData>;
  markov: Record<string, MarkovModel>;
}

const prepared = new WeakMap<MarkovModel, PreparedModel>();
export function preparedMarkov(m: MarkovModel): PreparedModel {
  let p = prepared.get(m);
  if (!p) { p = prepare(m); prepared.set(m, p); }
  return p;
}

/** 이 미션 언어에서 이 전시실 엔진을 쓸 수 있나 */
export function syncEngineAvailable(room: string, locale: string, data: SyncData): boolean {
  if (room === 'eliza') return locale === 'en' || !!data.eliza[locale];
  if (room === 'markov') return !!data.markov[locale];
  return false;
}

export function createSession(m: Mission, data: SyncData): ChatSession {
  if (m.room === 'eliza') {
    if (m.locale === 'en') return createElizaEn(m.id);
    const d = data.eliza[m.locale];
    if (!d) throw new Error('no eliza data for ' + m.locale);
    return createElizaAgglu(m.id, d);
  }
  if (m.room === 'markov') {
    const mm = data.markov[m.locale];
    if (!mm) throw new Error('no markov corpus for ' + m.locale);
    return createMarkov(m.id, preparedMarkov(mm));
  }
  throw new Error('not a sync room: ' + m.room);
}

export interface ReplayResult { replies: Reply[]; clearedAt: number; tabooAt: number }

/** 입력을 처음부터 다시 돌린다. clearedAt = 목표가 처음 나온 입력 번호(0부터), 없으면 -1 */
export function replay(m: Mission, inputs: readonly string[], data: SyncData): ReplayResult {
  const s = createSession(m, data);
  const replies: Reply[] = [];
  let clearedAt = -1, tabooAt = -1;
  inputs.forEach((inp, i) => {
    if (tabooAt < 0 && hasTaboo(inp, m.taboo)) tabooAt = i;
    const r = s.reply(inp);
    replies.push(r);
    if (clearedAt < 0 && hitsTarget(r.text, m.target)) clearedAt = i;
  });
  return { replies, clearedAt, tabooAt };
}
