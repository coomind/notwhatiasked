// 아주 작은 해시 라우터: #/ · #/room/eliza · #/m/<id> · #/ending · #/credits
import { useSyncExternalStore } from 'react';

export type Route = { name: 'lobby' } | { name: 'room'; room: string } | { name: 'mission'; id: string } | { name: 'ending' } | { name: 'credits' };

export function parseHash(h: string): Route {
  const p = h.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (p[0] === 'room' && p[1]) return { name: 'room', room: p[1] };
  if (p[0] === 'm' && p[1]) return { name: 'mission', id: p[1] };
  if (p[0] === 'ending') return { name: 'ending' };
  if (p[0] === 'credits') return { name: 'credits' };
  return { name: 'lobby' };
}

const listeners = new Set<() => void>();
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => listeners.forEach((f) => f()));

export function useRoute(): Route {
  // 주소는 매번 location.hash 에서 읽는다(history.replaceState 로 바뀐 것도 반영)
  const h = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => location.hash);
  return parseHash(h);
}

export function go(path: string) {
  const h = '#/' + path.replace(/^\//, '');
  launch = null; // 앱 안에서 이동하면 공유 링크 정보는 버림
  if (location.hash === h) return;
  location.hash = h;
  window.scrollTo(0, 0);
}

/** 공유 링크로 들어왔을 때 미션 화면에 넘길 정보 */
export interface Launch { missionId: string; replay?: string[]; challenge?: boolean }
let launch: Launch | null = null;
export function setLaunch(l: Launch | null) { launch = l; }
/** 렌더 중에 여러 번 불려도 같은 값(StrictMode 이중 렌더 대비). 앱 안에서 이동(go)하면 사라짐 */
export function takeLaunch(id: string): Launch | null {
  return launch && launch.missionId === id ? launch : null;
}
