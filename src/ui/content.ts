// 미션 목록과 전시실 정보. 미션 파일(content/missions/<locale>/<room>.json)이 있으면 그 언어 전시실이 열린다.
import type { AiMode, Mission, RoomId } from '../core/types';
import { ROOMS } from '../core/types';
import { GPT2_MODELS } from '../engines/gpt2/shared';

const files = import.meta.glob('../../content/missions/*/*.json', { eager: true, import: 'default' }) as Record<string, Mission[]>;
export const MISSIONS: Mission[] = Object.values(files).flat();
const byId = new Map(MISSIONS.map((m) => [m.id, m]));
export const missionById = (id: string) => byId.get(id);

const elizaLocales = new Set(Object.keys(import.meta.glob('../../content/eliza/*.json')).map((p) => p.replace(/^.*\/([^/]+)\.json$/, '$1')).concat('en'));
const markovLocales = new Set(Object.keys(import.meta.glob('../generated/markov-*.json')).map((p) => p.replace(/^.*markov-([^/]+)\.json$/, '$1')));

export function engineAvailable(room: RoomId, locale: string): boolean {
  if (room === 'eliza') return elizaLocales.has(locale);
  if (room === 'markov') return markovLocales.has(locale);
  return !!GPT2_MODELS[locale];
}

function missionsFor(room: RoomId, locale: string): Mission[] {
  return MISSIONS.filter((m) => m.room === room && m.locale === locale);
}

export interface RoomSet { room: RoomId; locale: string; mode: AiMode; missions: Mission[]; forcedOriginal: boolean }

/** 이 화면 언어·원본 모드 설정에서 전시실이 쓸 미션 묶음. 그 언어 AI가 없으면 영어 원본으로 연다 */
export function roomSet(room: RoomId, uiLang: string, original: boolean): RoomSet {
  const localOk = engineAvailable(room, uiLang) && missionsFor(room, uiLang).length > 0;
  const useEn = original || !localOk;
  const locale = useEn ? 'en' : uiLang;
  return { room, locale, mode: locale === uiLang ? 'local' : 'original', missions: missionsFor(room, locale), forcedOriginal: !original && !localOk && uiLang !== 'en' };
}

export function modeFor(m: Mission, uiLang: string): AiMode { return m.locale === uiLang ? 'local' : 'original'; }

export const ROOM_YEAR: Record<RoomId, string> = { eliza: '1966', markov: '1980s', gpt2: '2019' };
export { ROOMS };
