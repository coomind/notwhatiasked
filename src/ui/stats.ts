/**
 * 서버 통계·기록 보내기. Functions 호출은 세션당 최대 2번:
 *  - GET /api/stats  : 세션당 1회, 응답을 localStorage 에 1시간 보관(1시간 안에 다시 오면 호출 안 함)
 *  - POST /api/report: 세션당 1회, 페이지를 떠날 때(visibilitychange→hidden) sendBeacon 으로 이번 세션 기록을 한 번에
 * 실패하거나 한도에 걸려도 게임은 그대로(통계만 조용히 숨김).
 */
import { useSyncExternalStore } from 'react';
import type { StatsPayload } from '../core/stats';
import type { RunResult } from '../core/types';

const STATS_KEY = 'nwia:stats';
const PENDING_KEY = 'nwia:pending';
const VISITOR_KEY = 'nwia:visitor-reported';
const HOUR = 3600_000;

let stats: StatsPayload | null = null;
const listeners = new Set<() => void>();
export const useStats = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => stats);
export const getStats = () => stats;

const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* */ } },
};
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } },
};

export async function loadStats(): Promise<void> {
  try {
    const cached = JSON.parse(ls.get(STATS_KEY) ?? 'null') as { t: number; d: StatsPayload } | null;
    if (cached && Date.now() - cached.t < HOUR) { stats = cached.d; listeners.forEach((f) => f()); return; }
  } catch { /* */ }
  if (ss.get('nwia:stats-tried')) return;
  ss.set('nwia:stats-tried', '1');
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch('/api/stats', { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return;
    const d = (await r.json()) as StatsPayload;
    if (!d || typeof d !== 'object' || !d.m) return;
    stats = d;
    ls.set(STATS_KEY, JSON.stringify({ t: Date.now(), d }));
    listeners.forEach((f) => f());
  } catch { /* 조용히 */ }
}

function pending(): RunResult[] {
  try { return JSON.parse(ls.get(PENDING_KEY) ?? '[]') as RunResult[]; } catch { return []; }
}

/** 기록 대기열에 넣기(같은 미션·같은 모드는 세션당 처음 한 번만) */
export function queueResult(r: RunResult) {
  const list = pending();
  if (list.some((x) => x.missionId === r.missionId && x.play === r.play && x.locale === r.locale)) return;
  list.push(r);
  ls.set(PENDING_KEY, JSON.stringify(list.slice(-50)));
}

export function flushReport(): boolean {
  if (ss.get('nwia:reported')) return false;
  const results = pending();
  const newVisitor = !ls.get(VISITOR_KEY);
  if (!results.length && !newVisitor) return false;
  const body = JSON.stringify({ newVisitor, results: results.slice(0, 50) });
  let ok = false;
  try {
    ok = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/report', new Blob([body], { type: 'text/plain' }));
  } catch { ok = false; }
  if (ok) {
    ss.set('nwia:reported', '1');
    ls.set(PENDING_KEY, '[]');
    if (newVisitor) ls.set(VISITOR_KEY, '1');
  }
  return ok;
}

export function installReporter() {
  const onHide = () => { if (document.visibilityState === 'hidden') flushReport(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => flushReport());
}
