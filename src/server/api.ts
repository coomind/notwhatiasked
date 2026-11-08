/**
 * Pages Functions 공용 로직(테스트에서 가짜 DB로 그대로 돌림).
 *  - handleStats : stats_cache 1행 읽기, 10분 넘었으면 그 요청에서만 다시 계산
 *  - handleReport: 세션 기록 묶음 → 검증 → clear_hist/fail_hist 카운터 +1 (입력 원문은 저장하지 않음)
 */
import type { Mission } from '../core/types';
import { CHALLENGE_MAX } from '../core/types';
import { ENGINE_VERSION } from '../core/version';
import { computeStats, type ClearRow, type FailRow } from '../core/stats';
import { hasTaboo, hitsTarget, totalChars } from '../core/text';
import { replay, type SyncData } from '../engines/sync';

export interface D1Stmt { bind(...v: unknown[]): D1Stmt; first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<{ results: T[] }>; run(): Promise<unknown> }
export interface D1Like { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<unknown> }

export const STATS_TTL_SEC = 600;

export async function handleStats(db: D1Like, missions: Mission[], nowSec: number): Promise<string> {
  const row = await db.prepare('SELECT engine_version, json, updated_at FROM stats_cache WHERE id = 1').first<{ engine_version: string; json: string; updated_at: number }>();
  if (row && row.engine_version === ENGINE_VERSION && nowSec - row.updated_at < STATS_TTL_SEC) return row.json;
  const clears = (await db.prepare('SELECT mission_id, locale, mode, play, verified, attempts, chars, count FROM clear_hist WHERE engine_version = ?').bind(ENGINE_VERSION).all<ClearRow>()).results;
  const fails = (await db.prepare('SELECT mission_id, locale, mode, count FROM fail_hist WHERE engine_version = ?').bind(ENGINE_VERSION).all<FailRow>()).results;
  const v = await db.prepare("SELECT value FROM counters WHERE name = 'visitors'").first<{ value: number }>();
  const json = JSON.stringify(computeStats(clears, fails, missions, v?.value ?? 0, ENGINE_VERSION, nowSec));
  await db.prepare('INSERT INTO stats_cache (id, engine_version, json, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET engine_version = excluded.engine_version, json = excluded.json, updated_at = excluded.updated_at')
    .bind(ENGINE_VERSION, json, nowSec).run();
  return json;
}

export interface ReportItem { missionId: string; locale: string; mode: string; play: string; cleared: boolean; inputs: string[]; attempts: number; chars: number; engineVersion: string }
export interface ReportOutcome { accepted: number; verified: number; dropped: number; failsRecorded: number; visitor: boolean }

/**
 * 리플레이 비용 한도. Workers 무료 CPU 10ms 안에 끝내야 한다. Workers 안에서는 요청 중에 시계가 흐르지 않아
 * (Date.now 고정) 직접 잴 수 없으므로, Node에서 잰 값(tools/bench-replay.ts: 초기화 2~3ms, 입력 1개 0.02~0.1ms)에
 * 여유를 2배쯤 두고 '예상 ms'를 더해 가며 한도를 넘는 건은 리플레이하지 않고 verified=0 으로 기록한다.
 */
export const REPLAY_BUDGET_MS = 7;
const INIT_MS: Record<string, number> = { eliza: 3, markov: 3.5 };
const PER_INPUT_MS = 0.15;

const LOCALE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

export function validItem(x: unknown): x is ReportItem {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.missionId === 'string' && r.missionId.length < 40
    && typeof r.locale === 'string' && LOCALE_RE.test(r.locale)
    && (r.mode === 'local' || r.mode === 'original')
    && (r.play === 'casual' || r.play === 'challenge')
    && typeof r.cleared === 'boolean'
    && Array.isArray(r.inputs) && r.inputs.length <= 10 && r.inputs.every((s) => typeof s === 'string' && s.length <= 300)
    && Number.isInteger(r.attempts) && (r.attempts as number) >= 1 && (r.attempts as number) <= 999
    && Number.isInteger(r.chars) && (r.chars as number) >= 0 && (r.chars as number) <= 3000
    && typeof r.engineVersion === 'string';
}

export async function handleReport(body: unknown, db: D1Like, missions: Mission[], data: SyncData): Promise<ReportOutcome> {
  const out: ReportOutcome = { accepted: 0, verified: 0, dropped: 0, failsRecorded: 0, visitor: false };
  const b = (body && typeof body === 'object' ? body : {}) as { newVisitor?: unknown; results?: unknown };
  const results = Array.isArray(b.results) ? b.results.slice(0, 50) : [];
  const byId = new Map(missions.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const stmts: D1Stmt[] = [];
  let budget = REPLAY_BUDGET_MS;
  const inited = new Set<string>();

  for (const raw of results) {
    if (!validItem(raw)) { out.dropped++; continue; }
    const r = raw;
    const m = byId.get(r.missionId);
    if (!m || r.engineVersion !== ENGINE_VERSION) { out.dropped++; continue; }
    const key = `${r.missionId}|${r.play}`;
    if (seen.has(key)) { out.dropped++; continue; } // 같은 미션은 세션당 최초 1건만
    seen.add(key);

    if (!r.cleared) {
      if (r.play !== 'challenge' || r.attempts > CHALLENGE_MAX) { out.dropped++; continue; }
      stmts.push(db.prepare('INSERT INTO fail_hist (mission_id, locale, mode, engine_version, count) VALUES (?, ?, ?, ?, 1) ON CONFLICT(mission_id, locale, mode, engine_version) DO UPDATE SET count = count + 1')
        .bind(m.id, r.locale, r.mode, ENGINE_VERSION));
      out.failsRecorded++;
      continue;
    }

    // 클리어 검증
    const inputs = r.inputs;
    if (!inputs.length) { out.dropped++; continue; }
    if (r.play === 'challenge' && (r.attempts > CHALLENGE_MAX || inputs.length !== r.attempts)) { out.dropped++; continue; }
    if (r.play === 'casual' && (r.attempts < inputs.length || inputs.length > Math.max(m.maxTurns, CHALLENGE_MAX))) { out.dropped++; continue; }
    if (totalChars(inputs) !== r.chars) { out.dropped++; continue; }
    if (r.chars < m.par * 0.3) { out.dropped++; continue; } // 불가능한 값
    if (inputs.some((s) => hasTaboo(s, m.taboo))) { out.dropped++; continue; }

    let verified = 0;
    if (m.room === 'eliza' || m.room === 'markov') {
      const cost = inputs.length * PER_INPUT_MS + (inited.has(m.room + m.locale) ? 0 : INIT_MS[m.room]);
      if (cost <= budget) {
        budget -= cost;
        inited.add(m.room + m.locale);
        let ok = false;
        try {
          const rr = replay(m, inputs, data);
          ok = rr.clearedAt === inputs.length - 1 && hitsTarget(rr.replies[inputs.length - 1].text, m.target);
        } catch { ok = false; }
        if (!ok) { out.dropped++; continue; } // 리플레이가 안 맞으면 조작으로 보고 버림
        verified = 1;
        out.verified++;
      }
    }
    stmts.push(db.prepare('INSERT INTO clear_hist (mission_id, locale, mode, play, engine_version, verified, attempts, chars, count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(mission_id, locale, mode, play, engine_version, verified, attempts, chars) DO UPDATE SET count = count + 1')
      .bind(m.id, r.locale, r.mode, r.play, ENGINE_VERSION, verified, r.attempts, r.chars));
    out.accepted++;
  }
  if (b.newVisitor === true) {
    stmts.push(db.prepare("INSERT INTO counters (name, value) VALUES ('visitors', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1"));
    out.visitor = true;
  }
  if (stmts.length) await db.batch(stmts);
  return out;
}
