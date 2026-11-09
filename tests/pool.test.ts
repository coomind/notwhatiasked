import { describe, it, expect } from 'vitest';
import { dayNumber, dailyMission, dailyList, dailyNumberOf, endlessOrder, endlessList, msToNextDay, fmtCountdown } from '../src/ui/pool';
import { handleReport } from '../src/server/api';
import { ENGINE_VERSION } from '../src/core/version';
import { allMissions, elizaData, markovModels } from '../src/generated/server-data';

describe('오늘의 도전', () => {
  it('2026-11-09 가 1번, 하루 지나면 2번, 그 전 날짜도 1번', () => {
    expect(dayNumber(new Date(2026, 10, 9, 0, 0, 1))).toBe(1);
    expect(dayNumber(new Date(2026, 10, 9, 23, 59, 59))).toBe(1);
    expect(dayNumber(new Date(2026, 10, 10, 0, 0, 0))).toBe(2);
    expect(dayNumber(new Date(2026, 0, 1))).toBe(1);
  });
  it('자정까지 남은 시간', () => {
    expect(msToNextDay(new Date(2026, 10, 9, 23, 0, 0))).toBe(3600000);
    expect(fmtCountdown(3661000)).toBe('01:01:01');
  });
  it('날마다 다른 미션, 풀을 다 쓰면 처음부터 다시', () => {
    for (const loc of ['ko', 'en']) {
      const n = dailyList(loc).length;
      expect(n).toBeGreaterThan(60);
      expect(dailyMission(1, loc)!.id).not.toBe(dailyMission(2, loc)!.id);
      expect(dailyMission(1 + n, loc)!.id).toBe(dailyMission(1, loc)!.id);
      expect(dailyNumberOf(dailyMission(3, loc)!, 5)).toBe(3);
      expect(dailyNumberOf(dailyMission(9, loc)!, 5)).toBeNull(); // 아직 안 열린 날
    }
  });
  it('끝없는 도전: 안 깬 미션이 먼저, 판마다 순서가 다름', () => {
    const list = endlessList('ko');
    const cleared = { [list[0].id]: {}, [list[1].id]: {} };
    const o = endlessOrder('ko', cleared, 42);
    expect(o.length).toBe(list.length);
    expect(o.slice(-2).sort()).toEqual([list[0].id, list[1].id].sort());
    expect(endlessOrder('ko', {}, 1).join()).not.toBe(endlessOrder('ko', {}, 2).join());
  });
  it('서버가 풀 미션 클리어를 리플레이로 검증한다', async () => {
    const m = dailyMission(1, 'ko')!;
    const rows: unknown[][] = [];
    const db = { prepare: () => { const s = { bind: (...v: unknown[]) => { rows.push(v); return s; }, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }; return s; }, batch: async () => ({}) };
    const sol = allMissions.find((x) => x.id === m.id)!.solution!;
    const chars = Array.from(sol.join('')).length;
    const o = await handleReport({ results: [{ missionId: m.id, locale: 'ko', mode: 'local', play: 'casual', cleared: true, inputs: sol, attempts: sol.length, chars, engineVersion: ENGINE_VERSION }] }, db as never, allMissions, { eliza: elizaData, markov: markovModels });
    expect(o).toMatchObject({ accepted: 1, verified: 1 });
  });
});
