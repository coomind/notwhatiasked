import type { Reply } from '../core/types';

/** 동기 대화 엔진(ELIZA·마르코프). 같은 missionId + 같은 입력 순서 → 항상 같은 대답 */
export interface ChatSession {
  greeting?: string;
  reply(input: string): Reply;
}
