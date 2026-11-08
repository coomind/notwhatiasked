// 통계 계산(서버)과 해석(클라이언트). 순수 함수라 테스트하기 쉽다.
import type { Mission } from './types';

/** c: 도전 클리어 분포 [시도, 글자, 인원] · f: 도전 실패 인원 · n: 일반 클리어 수 · a: 일반 평균 시도(소수 1자리) · pb: 개발자 기록 이상 비율(%) */
export interface MissionStats { c: [number, number, number][]; f: number; n: number; a: number; pb: number }
export interface StatsPayload { v: string; at: number; visitors: number; m: Record<string, MissionStats> }

export interface ClearRow { mission_id: string; locale: string; mode: string; play: string; verified: number; attempts: number; chars: number; count: number }
export interface FailRow { mission_id: string; locale: string; mode: string; count: number }

export const MIN_SAMPLE = 30;
export const statKey = (missionId: string, locale: string, mode: string) => `${missionId}|${locale}|${mode}`;

/** 정렬 기준: 시도 적을수록, 같으면 글자 적을수록 위 */
const cmp = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1];

export function computeStats(clears: ClearRow[], fails: FailRow[], missions: Mission[], visitors: number, version: string, now: number): StatsPayload {
  const room = new Map(missions.map((m) => [m.id, m]));
  const m: Record<string, MissionStats> = {};
  const get = (k: string) => (m[k] ??= { c: [], f: 0, n: 0, a: 0, pb: 0 });
  const casualSum: Record<string, number> = {};
  for (const r of clears) {
    const mission = room.get(r.mission_id);
    if (!mission) continue;
    // ELIZA·마르코프는 서버 리플레이 검증을 통과한 기록만
    if (mission.room !== 'gpt2' && r.verified !== 1) continue;
    const k = statKey(r.mission_id, r.locale, r.mode);
    const s = get(k);
    if (r.play === 'challenge') s.c.push([r.attempts, r.chars, r.count]);
    else { s.n += r.count; casualSum[k] = (casualSum[k] ?? 0) + r.attempts * r.count; }
  }
  for (const f of fails) { if (room.has(f.mission_id)) get(statKey(f.mission_id, f.locale, f.mode)).f += f.count; }
  for (const [k, s] of Object.entries(m)) {
    // 같은 칸 합치기 + 정렬
    const merged = new Map<string, [number, number, number]>();
    for (const [a, c, n] of s.c) { const key = a + ':' + c; const e = merged.get(key); if (e) e[2] += n; else merged.set(key, [a, c, n]); }
    s.c = [...merged.values()].sort(cmp);
    const mission = room.get(k.split('|')[0])!;
    if (mission.room === 'gpt2') s.c = trim(s.c, 0.01); // 서버 검증이 안 되므로 위아래 1% 잘라냄
    s.a = s.n ? Math.round((casualSum[k] ?? 0) / s.n * 10) / 10 : 0;
    const total = s.c.reduce((x, e) => x + e[2], 0);
    const parTurns = mission.parTurns ?? mission.solution?.length ?? 1;
    const beat = s.c.filter(([a, c]) => a < parTurns || (a === parTurns && c <= mission.par)).reduce((x, e) => x + e[2], 0);
    s.pb = total ? Math.round(beat / total * 100) : 0;
  }
  return { v: version, at: now, visitors, m };
}

/** 정렬된 분포의 위아래 frac 만큼(인원 기준) 잘라낸다. 표본이 100 미만이면 그대로 */
export function trim(c: [number, number, number][], frac: number): [number, number, number][] {
  const total = c.reduce((x, e) => x + e[2], 0);
  if (total < 100) return c;
  let lo = Math.floor(total * frac), hi = Math.floor(total * frac);
  const out = c.map((e) => [...e] as [number, number, number]);
  for (let i = 0; i < out.length && lo > 0; i++) { const d = Math.min(out[i][2], lo); out[i][2] -= d; lo -= d; }
  for (let i = out.length - 1; i >= 0 && hi > 0; i--) { const d = Math.min(out[i][2], hi); out[i][2] -= d; hi -= d; }
  return out.filter((e) => e[2] > 0);
}

export interface ChallengeView { players: number; clearRate: number; topPct: number | null }

/** 도전 결과 해석. 표본 30 미만이면 null. 내 기록(attempts, chars)이 없으면 topPct=null(실패) */
export function challengeView(s: MissionStats | undefined, mine: { attempts: number; chars: number } | null): ChallengeView | null {
  if (!s) return null;
  const clears = s.c.reduce((x, e) => x + e[2], 0);
  const players = clears + s.f;
  if (players < MIN_SAMPLE) return null;
  let topPct: number | null = null;
  if (mine) {
    const better = s.c.filter(([a, c]) => a < mine.attempts || (a === mine.attempts && c < mine.chars)).reduce((x, e) => x + e[2], 0);
    topPct = Math.max(1, Math.ceil(((better + 1) / players) * 100));
  }
  return { players, clearRate: Math.round((clears / players) * 100), topPct };
}
