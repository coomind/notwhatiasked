// POST /api/report — 세션당 1회(sendBeacon). 이번 세션의 클리어를 묶어서 받아 검증 후 카운터 +1.
import { handleReport, type D1Like } from '../../src/server/api';
import { allMissions, elizaData, markovModels } from '../../src/generated/server-data';

interface Env { DB: D1Like }
const data = { eliza: elizaData, markov: markovModels };

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  let body: unknown = null;
  try {
    const text = await request.text();
    if (text.length > 64_000) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    await handleReport(body, env.DB, allMissions, data);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
