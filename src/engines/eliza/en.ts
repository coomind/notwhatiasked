// 영어 ELIZA = elizabot.js v1.1 (N. Landsteiner) 원본 규칙 그대로. 랜덤만 시드 PRNG로 바꿈.
// @ts-expect-error vendor JS (타입 없음)
import ElizaBot from './vendor/elizabot.js';
import { mulberry32, hashStr, rngFor } from '../../core/prng';
import type { ChatSession } from '../types';

interface Bot {
  rng: () => number;
  transform(s: string): string;
  getInitial(): string;
}

export function createElizaEn(missionId: string, opts: { noRandom?: boolean } = {}): ChatSession {
  const bot = new ElizaBot(!!opts.noRandom, mulberry32(hashStr(missionId))) as Bot;
  const greeting = bot.getInitial();
  const history: string[] = [];
  return {
    greeting,
    reply(input: string) {
      history.push(input);
      bot.rng = rngFor(missionId, history);
      return { text: bot.transform(input) };
    },
  };
}
