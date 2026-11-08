// GPT-2 워커와 주고받기. 모델은 동의 버튼을 누른 뒤에만 받는다.
import { useSyncExternalStore } from 'react';

export interface Gpt2State { status: 'idle' | 'loading' | 'ready' | 'error'; loaded: number; total: number; error?: string }
let state: Gpt2State = { status: 'idle', loaded: 0, total: 0 };
const listeners = new Set<() => void>();
const set = (s: Partial<Gpt2State>) => { state = { ...state, ...s }; listeners.forEach((f) => f()); };
export const useGpt2 = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);

const LS = 'nwia:gpt2-downloaded';
export const wasDownloaded = () => { try { return localStorage.getItem(LS) === '1'; } catch { return false; } };

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { ok: (v: string) => void; err: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../engines/gpt2/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent) => {
    const d = ev.data as { type: string; id?: number; text?: string; message?: string; loaded?: number; total?: number };
    if (d.type === 'progress') { set({ loaded: d.loaded ?? 0, total: d.total ?? 0 }); return; }
    const w = d.id !== undefined ? waiting.get(d.id) : undefined;
    if (!w) return;
    waiting.delete(d.id!);
    if (d.type === 'error') w.err(new Error(d.message)); else w.ok(d.text ?? '');
  };
  worker.onerror = (e) => { set({ status: 'error', error: e.message }); };
  return worker;
}

function call(type: 'load' | 'gen', locale: string, prompt?: string): Promise<string> {
  const id = nextId++;
  return new Promise((ok, err) => { waiting.set(id, { ok, err }); getWorker().postMessage({ type, id, locale, prompt }); });
}

export async function loadGpt2(locale: string): Promise<void> {
  if (state.status === 'ready') return;
  set({ status: 'loading', error: undefined });
  try {
    await call('load', locale);
    try { localStorage.setItem(LS, '1'); } catch { /* */ }
    set({ status: 'ready' });
  } catch (e) {
    set({ status: 'error', error: (e as Error).message });
    throw e;
  }
}

/** 생성 요청은 하나씩(워커 안에서도 순서대로 처리되지만, 겹치지 않게 줄 세움) */
let queue: Promise<unknown> = Promise.resolve();
export function gpt2Generate(locale: string, prompt: string): Promise<string> {
  const p = queue.then(() => call('gen', locale, prompt));
  queue = p.catch(() => undefined);
  return p;
}

// E2E(브라우저 ↔ Node 결과 비교 테스트)에서 쓰는 손잡이
if (typeof window !== 'undefined') (window as unknown as { __nwia?: unknown }).__nwia = { loadGpt2, gpt2Generate };
