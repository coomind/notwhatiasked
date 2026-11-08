export type RoomId = 'eliza' | 'markov' | 'gpt2';
export const ROOMS: RoomId[] = ['eliza', 'markov', 'gpt2'];
export type PlayMode = 'casual' | 'challenge';
/** local = 그 언어용 AI, original = 영어 원본 AI */
export type AiMode = 'local' | 'original';

export type Localized = Record<string, string>;

export interface Mission {
  id: string;
  room: RoomId;
  locale: string;
  target: string;
  taboo: string[];
  maxTurns: number;
  par: number;
  /** 개발자 해법 — 클라이언트 번들에서는 빌드 때 지워진다 */
  solution?: string[];
  /** 해법의 입력 개수(도전모드 개발자 기록 표시용, solution 이 지워져도 남는다) */
  parTurns?: number;
  hint: Localized;
  title: Localized;
  /** 목표 단어 번역(원본 모드에서 뜻 보여주기용, 선택) */
  gloss?: Localized;
}

export const CHALLENGE_MAX = 5;
export const MAX_INPUT_CHARS = 120;
export const MARKOV_MAX_INPUT_WORDS = 8;
export const MARKOV_MAX_OUTPUT_WORDS = 30;

/** 한 번의 AI 대답. text 가 화면·목표판정에 쓰인다 */
export interface Reply {
  text: string;
  /** 마르코프: 모르는 단어 때문에 멈춤 */
  unknownWord?: string;
}

export interface RunResult {
  missionId: string;
  locale: string;
  mode: AiMode;
  play: PlayMode;
  cleared: boolean;
  inputs: string[];
  attempts: number;
  chars: number;
  engineVersion: string;
}
