// 브라우저 저장소(localStorage)에 남기는 진행 상황. 저장소가 막혀 있어도 게임은 돈다(메모리에만).
import { useSyncExternalStore } from 'react';

export interface ChallengeRecord { cleared: boolean; attempts: number; chars: number }
export interface Progress {
  cleared: Record<string, { attempts: number; chars: number }>; // missionId → 가장 좋은 일반 기록
  challenge: Record<string, ChallengeRecord>;                      // missionId|lang → 첫 도전 결과(순위 반영분)
  freeTour: boolean;
  original: boolean;
  sound: boolean;
  visitorNo?: number;
}

const KEY = 'nwia:progress:v1';
const empty = (): Progress => ({ cleared: {}, challenge: {}, freeTour: false, original: false, sound: false });

function load(): Progress {
  try { const s = localStorage.getItem(KEY); if (s) return { ...empty(), ...JSON.parse(s) }; } catch { /* */ }
  return empty();
}

let state = load();
const listeners = new Set<() => void>();
export function getProgress(): Progress { return state; }
export function updateProgress(f: (p: Progress) => Progress) {
  state = f(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* */ }
  listeners.forEach((l) => l());
}
export function useProgress(): Progress {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

export function recordClear(missionId: string, attempts: number, chars: number) {
  updateProgress((p) => {
    const prev = p.cleared[missionId];
    if (prev && (prev.attempts < attempts || (prev.attempts === attempts && prev.chars <= chars))) return p;
    return { ...p, cleared: { ...p.cleared, [missionId]: { attempts, chars } } };
  });
}

export const challengeKey = (missionId: string, lang: string) => `${missionId}|${lang}`;
