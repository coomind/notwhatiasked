// 오늘의 도전 · 끝없는 도전: 자동 생성 풀(content/missions/<locale>/pool.json)에서 고른다.
import type { Mission } from '../core/types';
import { MISSIONS } from './content';

/** 오늘의 도전 #1 = 이 날(그 사람 시계 기준 자정에 바뀜) */
export const LAUNCH = { y: 2026, m: 11, d: 9 };
const DAY_MS = 86400000;

export function dayNumber(now = new Date()): number {
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(LAUNCH.y, LAUNCH.m - 1, LAUNCH.d);
  return Math.max(1, Math.floor((a - b) / DAY_MS) + 1);
}

export function msToNextDay(now = new Date()): number {
  const n = new Date(now);
  n.setHours(24, 0, 0, 0);
  return n.getTime() - now.getTime();
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

const poolOf = (set: 'daily' | 'endless', locale: string) => MISSIONS.filter((m) => m.set === set && m.locale === locale);

/** 이 화면 언어로 된 풀이 있으면 그걸, 없거나 원본 모드면 영어 풀 */
export function poolLocale(uiLang: string, original: boolean): string {
  return !original && poolOf('daily', uiLang).length ? uiLang : 'en';
}

export function dailyList(locale: string): Mission[] { return poolOf('daily', locale); }
export function endlessList(locale: string): Mission[] { return poolOf('endless', locale); }

/** n번째 날의 미션. 풀을 다 쓰면 처음부터 다시 돈다(그 전에 tools/gen-pool.ts 로 늘리면 됨) */
export function dailyMission(n: number, locale: string): Mission | undefined {
  const list = dailyList(locale);
  return list.length ? list[(n - 1) % list.length] : undefined;
}

/** 이 미션이 오늘의 도전 몇 번이었나(오늘 이하 중 가장 최근). 아니면 null */
export function dailyNumberOf(m: Mission, today = dayNumber()): number | null {
  if (m.set !== 'daily') return null;
  const list = dailyList(m.locale);
  const i = list.indexOf(m);
  if (i < 0) return null;
  let n = i + 1;
  if (n > today) return null; // 아직 안 열린 날
  while (n + list.length <= today) n += list.length;
  return n;
}

/** 끝없는 도전 출제 순서: 아직 안 깬 미션 먼저, 그 안에서는 섞어서 */
export function endlessOrder(locale: string, cleared: Record<string, unknown>, seed: number): string[] {
  const list = endlessList(locale).map((m) => m.id);
  let a = seed >>> 0 || 1;
  const rnd = () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
  const shuffle = (x: string[]) => { for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  return [...shuffle(list.filter((id) => !cleared[id])), ...shuffle(list.filter((id) => cleared[id]))];
}

/** 판마다 다른 순서(게임 결정론과 무관한 곳이라 crypto 사용) */
export function freshSeed(): number {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return Date.now() >>> 0; }
}
