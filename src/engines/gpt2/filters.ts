// 필터 목록(content/filters/*.txt). 영어는 낱말 단위, 나머지 언어는 글자열 단위.
import { compileFilter } from './shared';
const files = import.meta.glob('../../../content/filters/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const FILTERS = Object.entries(files).map(([p, t]) => compileFilter(t, /\/en\.txt$/.test(p)));
