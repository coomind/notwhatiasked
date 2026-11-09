// Functions 로직을 진짜 SQLite(node:sqlite)로 돌려 본다. D1 스키마는 migrations/0001_init.sql 그대로.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleReport, handleStats, type D1Like, type D1Stmt } from '../src/server/api';
import { allMissions, elizaData, markovModels } from '../src/generated/server-data';
import { ENGINE_VERSION } from '../src/core/version';
import { totalChars } from '../src/core/text';
import { challengeView, computeStats, trim, statKey } from '../src/core/stats';

function fakeD1(): { db: D1Like; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync('migrations/0001_init.sql', 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): D1Stmt => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T,>() => (raw.prepare(sql).get(...(args as never[])) as T) ?? null,
    all: async <T,>() => ({ results: raw.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => raw.prepare(sql).run(...(args as never[])),
  });
  return { db: { prepare: (sql) => stmt(sql), batch: async (s) => { for (const x of s) await x.run(); return []; } }, raw };
}

const data = { eliza: elizaData, markov: markovModels };
const mission = (id: string) => allMissions.find((m) => m.id === id)!;
const result = (id: string, play: 'casual' | 'challenge', over: Record<string, unknown> = {}) => {
  const m = mission(id);
  const inputs = m.solution!;
  return { missionId: id, locale: m.locale, mode: 'local', play, cleared: true, inputs, attempts: inputs.length, chars: totalChars(inputs), engineVersion: ENGINE_VERSION, ...over };
};

describe('POST /api/report', () => {
  let d: ReturnType<typeof fakeD1>;
  beforeEach(() => { d = fakeD1(); });

  it('ELIZA·마르코프 클리어는 서버 리플레이로 검증(verified=1), 입력 원문은 저장 안 함', async () => {
    const o = await handleReport({ newVisitor: true, results: [result('eliza-en-01', 'challenge'), result('markov-ko-01', 'casual')] }, d.db, allMissions, data);
    expect(o).toMatchObject({ accepted: 2, verified: 2, dropped: 0, visitor: true });
    const rows = d.raw.prepare('SELECT * FROM clear_hist').all() as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.verified === 1 && r.count === 1)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(mission('eliza-en-01').solution![0]);
    expect((d.raw.prepare("SELECT value FROM counters WHERE name='visitors'").get() as { value: number }).value).toBe(1);
  });

  it('같은 칸은 행을 늘리지 않고 count+1 (히스토그램)', async () => {
    await handleReport({ results: [result('eliza-en-01', 'challenge')] }, d.db, allMissions, data);
    await handleReport({ results: [result('eliza-en-01', 'challenge')] }, d.db, allMissions, data);
    const rows = d.raw.prepare('SELECT count FROM clear_hist').all() as { count: number }[];
    expect(rows).toEqual([{ count: 2 }]);
  });

  it('조작(리플레이 불일치·금지어·글자 수 거짓·옛 버전)은 버린다', async () => {
    const o = await handleReport({ results: [
      result('eliza-en-01', 'challenge', { inputs: ['hello'], chars: 5, attempts: 1 }),
      result('eliza-en-02', 'challenge', { inputs: ['english'], chars: 7 }),
      result('eliza-en-03', 'challenge', { chars: 99 }),
      result('eliza-en-04', 'challenge', { engineVersion: 'old' }),
      { junk: true },
    ] }, d.db, allMissions, data);
    expect(o.accepted).toBe(0);
    expect(o.dropped).toBe(5);
  });

  it('같은 미션은 세션당 최초 1건만, 도전 실패는 fail_hist', async () => {
    const o = await handleReport({ results: [
      result('eliza-ko-01', 'challenge'), result('eliza-ko-01', 'challenge'),
      { ...result('eliza-ko-02', 'challenge'), cleared: false, attempts: 5 },
      { ...result('eliza-ko-03', 'casual'), cleared: false },
    ] }, d.db, allMissions, data);
    expect(o.accepted).toBe(1);
    expect(o.failsRecorded).toBe(1);
    expect(d.raw.prepare('SELECT * FROM fail_hist').all()).toHaveLength(1);
  });

  it('GPT-2는 서버에서 못 돌리므로 verified=0 으로 저장', async () => {
    const g = allMissions.find((m) => m.room === 'gpt2');
    if (!g) return;
    const o = await handleReport({ results: [result(g.id, 'challenge')] }, d.db, allMissions, data);
    expect(o).toMatchObject({ accepted: 1, verified: 0 });
  });

  it('리플레이 비용 한도를 넘는 건은 verified=0', async () => {
    // 전시실 미션(ELIZA·마르코프 × en·ko = 36개, 한 번에 받는 한도 50 이하)을 한꺼번에: 초기화 비용만 4번이라 한도를 넘는다
    const many = allMissions.filter((m) => m.room !== 'gpt2' && !m.set).map((m) => ({ ...result(m.id, 'casual'), locale: m.locale }));
    const o = await handleReport({ results: many }, d.db, allMissions, data);
    expect(o.accepted).toBe(many.length);
    expect(o.verified).toBeLessThan(many.length);
    expect(o.verified).toBeGreaterThan(0);
  });
});

describe('GET /api/stats', () => {
  it('계산해서 캐시 1행에 저장, 10분 안에는 캐시만 읽음', async () => {
    const d = fakeD1();
    await handleReport({ newVisitor: true, results: [result('eliza-en-01', 'challenge')] }, d.db, allMissions, data);
    const j1 = JSON.parse(await handleStats(d.db, allMissions, 1000));
    expect(j1.visitors).toBe(1);
    expect(j1.m[statKey('eliza-en-01', 'en', 'local')].c).toEqual([[1, mission('eliza-en-01').par, 1]]);
    await handleReport({ newVisitor: true, results: [] }, d.db, allMissions, data);
    expect(JSON.parse(await handleStats(d.db, allMissions, 1100)).visitors).toBe(1); // 캐시
    expect(JSON.parse(await handleStats(d.db, allMissions, 1000 + 601)).visitors).toBe(2); // 10분 뒤 재계산
  });

  it('백분위·클리어율: 표본 30 미만이면 숨김', () => {
    const m = mission('eliza-en-01');
    const s = computeStats([
      { mission_id: m.id, locale: 'en', mode: 'local', play: 'challenge', verified: 1, attempts: 1, chars: 8, count: 10 },
      { mission_id: m.id, locale: 'en', mode: 'local', play: 'challenge', verified: 1, attempts: 2, chars: 20, count: 10 },
      { mission_id: m.id, locale: 'en', mode: 'local', play: 'challenge', verified: 0, attempts: 1, chars: 3, count: 99 },
    ], [{ mission_id: m.id, locale: 'en', mode: 'local', count: 20 }], allMissions, 0, ENGINE_VERSION, 0);
    const ms = s.m[statKey(m.id, 'en', 'local')];
    expect(ms.c).toEqual([[1, 8, 10], [2, 20, 10]]); // 검증 안 된 기록은 빠짐
    const v = challengeView(ms, { attempts: 2, chars: 20 })!;
    expect(v.players).toBe(40);
    expect(v.clearRate).toBe(50);
    expect(v.topPct).toBe(28); // 10명이 더 잘함 → (10+1)/40
    expect(challengeView({ ...ms, f: 0, c: [[1, 8, 5]] }, null)).toBeNull();
  });

  it('GPT-2는 위아래 1% 잘라냄', () => {
    expect(trim([[1, 5, 1], [2, 9, 98], [5, 90, 1]], 0.01)).toEqual([[2, 9, 98]]);
  });
});
