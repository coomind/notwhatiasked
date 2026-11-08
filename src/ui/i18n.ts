// 언어: content/i18n/<locale>.json 파일이 있으면 그 언어를 지원한다(파일 추가 = 언어 추가).
// 결정 순서: ① URL ?lang= → ② 사용자가 고른 값(localStorage) → ③ 브라우저 언어(navigator.languages) → ④ 영어
import { useSyncExternalStore } from 'react';
import type { Localized } from '../core/types';

const files = import.meta.glob('../../content/i18n/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, string>>;
export const DICTS: Record<string, Record<string, string>> = {};
for (const [p, d] of Object.entries(files)) DICTS[p.replace(/^.*\/([^/]+)\.json$/, '$1')] = d;
export const LANGS = Object.keys(DICTS).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
const LS_KEY = 'nwia:lang';

function match(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const t = tag.toLowerCase();
  if (DICTS[t]) return t;
  const base = t.split('-')[0];
  return DICTS[base] ? base : null;
}

export function detectLang(): string {
  try {
    const q = match(new URLSearchParams(location.search).get('lang'));
    if (q) return q;
    // 언어별 입구 주소(/ko/ 등)도 URL 지정으로 본다
    const p = match(location.pathname.split('/')[1]);
    if (p) return p;
  } catch { /* SSR 없음 */ }
  try { const s = match(localStorage.getItem(LS_KEY)); if (s) return s; } catch { /* 저장소 막힘 */ }
  try { for (const l of navigator.languages ?? [navigator.language]) { const m = match(l); if (m) return m; } } catch { /* */ }
  return 'en';
}

let current = detectLang();
const listeners = new Set<() => void>();
export function getLang() { return current; }
export function setLang(l: string) {
  if (!DICTS[l]) return;
  current = l;
  try { localStorage.setItem(LS_KEY, l); } catch { /* */ }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
export function useLang(): string {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => current);
}

/** t('key', {n: 3}) — 없으면 영어, 그것도 없으면 키 */
export function t(key: string, vars?: Record<string, string | number>, lang = current): string {
  let s = DICTS[lang]?.[key] ?? DICTS.en?.[key] ?? key;
  if (vars) {
    // {n|단수|복수}: 숫자가 1이면 단수
    s = s.replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_m, k: string, one: string, many: string) => (Number(vars[k]) === 1 ? one : many));
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export function loc(m: Localized | undefined, lang = current): string {
  if (!m) return '';
  return m[lang] ?? m.en ?? Object.values(m)[0] ?? '';
}

/** 언어 고유 이름(토글에 표시) */
export function langName(l: string): string { return DICTS[l]?.['lang.name'] ?? l; }
