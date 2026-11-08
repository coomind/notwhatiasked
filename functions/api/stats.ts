// GET /api/stats — 세션당 1회. stats_cache 1행만 읽고, 10분 지났으면 그 요청에서만 다시 계산.
import { handleStats, type D1Like } from '../../src/server/api';
import { allMissions } from '../../src/generated/server-data';

interface Env { DB: D1Like }

export async function onRequestGet({ env }: { env: Env }): Promise<Response> {
  try {
    const json = await handleStats(env.DB, allMissions, Math.floor(Date.now() / 1000));
    return new Response(json, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  } catch {
    return new Response('{}', { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}
