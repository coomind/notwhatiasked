// GPT-2 공용 설정·필터(브라우저 워커와 Node 해법 탐색이 같은 걸 씀)
import models from '../../../content/gpt2/models.json';

export interface Gpt2Model { model: string; dtype: string; model_file_name: string; sizeMB: number; name: string; license: string; credit: string }
export const GPT2_MODELS = models as Record<string, Gpt2Model>;

/** 탐욕 디코딩(do_sample:false) → 같은 입력이면 같은 출력 */
export const GEN_OPTIONS = { max_new_tokens: 25, do_sample: false } as const;

export const REDACTED = '[REDACTED BY MUSEUM STAFF]';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 필터 목록 → 정규식. wordMode(영어): 낱말 단위(+s/es/ed/ing/y), 끝에 * 는 접두어. 아니면 글자열 단위 */
export function compileFilter(text: string, wordMode: boolean): RegExp | null {
  const words = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!words.length) return null;
  if (!wordMode) return new RegExp(words.map(esc).join('|'), 'giu');
  const parts = words.map((w) => (w.endsWith('*') ? esc(w.slice(0, -1)) + '\\p{L}*' : esc(w) + '(?:s|es|ed|ing|y)?'));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

export function redact(text: string, filters: (RegExp | null)[]): string {
  let t = text;
  for (const f of filters) if (f) t = t.replace(f, REDACTED);
  return t;
}
