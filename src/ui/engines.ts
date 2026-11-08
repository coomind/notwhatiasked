// 브라우저에서 엔진 만들기. 큰 데이터(마르코프 학습 글, 한국어 ELIZA 규칙)는 필요할 때만 받는다.
import type { Mission, Reply } from '../core/types';
import { createSession, type SyncData } from '../engines/sync';
import type { AggluData } from '../engines/eliza/agglu';
import type { MarkovModel } from '../engines/markov/markov';
import { gpt2Generate } from './gpt2client';

const elizaFiles = import.meta.glob('../../content/eliza/*.json', { import: 'default' }) as Record<string, () => Promise<AggluData>>;
const markovFiles = import.meta.glob('../generated/markov-*.json', { import: 'default' }) as Record<string, () => Promise<MarkovModel>>;

const data: SyncData = { eliza: {}, markov: {} };

async function ensureData(m: Mission) {
  if (m.room === 'eliza' && m.locale !== 'en' && !data.eliza[m.locale]) {
    const f = Object.entries(elizaFiles).find(([p]) => p.endsWith(`/${m.locale}.json`));
    if (f) data.eliza[m.locale] = await f[1]();
  }
  if (m.room === 'markov' && !data.markov[m.locale]) {
    const f = Object.entries(markovFiles).find(([p]) => p.endsWith(`markov-${m.locale}.json`));
    if (f) data.markov[m.locale] = await f[1]();
  }
}

/** 한 판(라운드)의 대화. reply 는 비동기(GPT-2 때문에) */
export interface Conversation { greeting?: string; reply(input: string): Promise<Reply> }

export async function startConversation(m: Mission): Promise<Conversation> {
  if (m.room === 'gpt2') {
    return { reply: async (input) => ({ text: await gpt2Generate(m.locale, input) }) };
  }
  await ensureData(m);
  const s = createSession(m, data);
  return { greeting: s.greeting, reply: async (input) => s.reply(input) };
}
