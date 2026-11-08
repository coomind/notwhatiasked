/**
 * 교착어(한국어 등)용 ELIZA 엔진. elizabot.js 의 구조(keywords·decomp·reasmb·$기억·goto·synons·pres·quits·
 * initials·finals·lastchoice 순환)를 그대로 따르되, 정규식 \b 대신 '어절 토큰' 단위로 매칭한다.
 *  - 조사 분리: "엄마가", "엄마는" → 어간 '엄마'로 매칭 (조사 목록·받침 조건은 데이터)
 *  - 대명사 반사: 나/내/저/제 ↔ 당신, 너/네 → 저/제 (조사는 새 낱말 받침에 맞춰 다시 붙임)
 *  - 어미 정리: 존댓말·반말 어미를 기본형으로 바꿔 "~다고", "~다는" 꼴로 되묻는다
 * 규칙 데이터는 content/eliza/<locale>.json. 새 언어(일본어 등)는 데이터 파일만 추가하면 된다.
 */
import { fixJosa, jong, withJong, isSyllable, J_NONE, J_L, J_SS, J_B, J_N } from './hangul';
import { mulberry32, hashStr, rngFor } from '../../core/prng';
import type { ChatSession } from '../types';

export interface AggluData {
  initials: string[];
  finals: string[];
  quits: string[];
  /** "조사:조건" — 조건 C=받침 뒤, V=모음 뒤, L=모음 또는 ㄹ 뒤, *=아무 데나 */
  particles: string[];
  /** 매칭 전 어절 치환(어간 기준) */
  pres: Record<string, string>;
  /** 어간 반사 (조사는 다시 붙임) */
  reflect: Record<string, string>;
  /** 어절 통째 반사 */
  reflectRaw: Record<string, string>;
  synons: Record<string, string[]>;
  /** 어미 → 어간 */
  stems: { exact: Record<string, string>; suffix: [string, string][] };
  /** 형용사 어간(현재형 '-다'), 나머지 용언은 동사로 보고 '-ㄴ다/-는다' */
  adjectives: string[];
  /** 이 글자가 하나도 없으면 외국어로 보고 xforeign 규칙 */
  nativeScript: string;
  sentenceSplit: string;
  keywords: [string, number, [string, string[]][]][];
  fallback: string;
}

interface Tok { raw: string; stem: string; josa: string }
interface Particle { p: string; cond: string }
interface Decomp { parts: string[]; reasmb: string[]; mem: boolean }
interface Rule { key: string; rank: number; idx: number; decomps: Decomp[] }

function lastChar(s: string): string { return s[s.length - 1]; }

function condOk(stem: string, cond: string): boolean {
  if (cond === '*') return true;
  const j = jong(lastChar(stem));
  if (j < 0) return cond === '*';
  if (cond === 'C') return j !== J_NONE;
  if (cond === 'V') return j === J_NONE;
  if (cond === 'L') return j === J_NONE || j === J_L;
  return true;
}

export class AggluEliza {
  private particles: Particle[];
  private rules: Rule[];
  private lastchoice: number[][];
  private mem: string[] = [];
  private native: RegExp;
  private split: RegExp;
  private adjSet: Set<string>;
  rng: () => number = () => 0;
  quit = false;

  constructor(private d: AggluData) {
    this.particles = d.particles.map((x) => { const [p, cond] = x.split(':'); return { p, cond: cond ?? '*' }; })
      .sort((a, b) => b.p.length - a.p.length);
    this.rules = d.keywords.map(([key, rank, decomps], idx) => ({
      key, rank, idx,
      decomps: decomps.map(([pat, reasmb]) => {
        const mem = pat.startsWith('$');
        return { parts: pat.replace(/^\$\s*/, '').trim().split(/\s+/), reasmb, mem };
      }),
    })).sort((a, b) => b.rank - a.rank || a.idx - b.idx);
    this.lastchoice = this.rules.map((r) => r.decomps.map(() => -1));
    this.native = new RegExp(d.nativeScript, 'u');
    this.split = new RegExp(d.sentenceSplit, 'gu');
    this.adjSet = new Set(d.adjectives);
  }

  private pick<T>(arr: T[]): T { return arr[Math.floor(this.rng() * arr.length)]; }
  getInitial(): string { return this.pick(this.d.initials); }
  getFinal(): string { return this.pick(this.d.finals); }

  /** 어절 → {원형, 어간, 조사} */
  tokenize(word: string): Tok {
    for (const { p, cond } of this.particles) {
      if (word.length > p.length && word.endsWith(p)) {
        const stem = word.slice(0, -p.length);
        if (condOk(stem, cond)) return { raw: word, stem, josa: p };
      }
    }
    return { raw: word, stem: word, josa: '' };
  }

  private preprocess(part: string): Tok[] {
    // pres 는 어절 통째로만 바꾼다(조사 붙은 꼴까지 바꾸면 '우리는'→'내는' 같은 오류가 생김)
    return part.split(/\s+/).filter(Boolean).map((w) => this.tokenize(this.d.pres[w] ?? w));
  }

  private litMatch(t: Tok, lit: string): boolean {
    if (lit.endsWith('*')) { const pre = lit.slice(0, -1); return t.raw.startsWith(pre) || t.stem.startsWith(pre); }
    return t.raw === lit || t.stem === lit;
  }

  private elemMatch(t: Tok, el: string): boolean {
    if (el.startsWith('@')) {
      const name = el.slice(1);
      const group = [name, ...(this.d.synons[name] ?? [])];
      return group.some((g) => this.litMatch(t, g));
    }
    return this.litMatch(t, el);
  }

  /** 토큰 배열을 패턴에 맞춘다. 캡처: '*'(0개 이상), '+'(1개 이상), '@그룹'(1개) */
  private matchPattern(toks: Tok[], parts: string[]): Tok[][] | null {
    const caps: Tok[][] = [];
    const go = (ti: number, pi: number): boolean => {
      if (pi === parts.length) return ti === toks.length;
      const el = parts[pi];
      if (el === '*' || el === '+') {
        const min = el === '+' ? 1 : 0;
        for (let k = toks.length; k >= ti + min; k--) { // 욕심쟁이(elizabot의 .* 와 같게)
          caps.push(toks.slice(ti, k));
          if (go(k, pi + 1)) return true;
          caps.pop();
        }
        return false;
      }
      if (ti >= toks.length || !this.elemMatch(toks[ti], el)) return false;
      if (el.startsWith('@')) caps.push([toks[ti]]);
      if (go(ti + 1, pi + 1)) return true;
      if (el.startsWith('@')) caps.pop();
      return false;
    };
    return go(0, 0) ? caps : null;
  }

  // ---------- 반사·어미 ----------

  private reattach(stem: string, josa: string): string {
    if (!josa) return stem;
    // 같은 뜻의 짝 조사로 바꿔 붙이기
    const pairs: [string, string][] = [['이', '가'], ['은', '는'], ['을', '를'], ['과', '와'], ['이랑', '랑'], ['이야', '야'], ['으로', '로'], ['아', '야'], ['이나', '나']];
    for (const [c, v] of pairs) {
      if (josa === c || josa === v) {
        if (c === '으로') return stem + (jong(lastChar(stem)) === J_NONE || jong(lastChar(stem)) === J_L ? v : c);
        return stem + (jong(lastChar(stem)) > 0 ? c : v);
      }
    }
    return stem + josa;
  }

  reflectTok(t: Tok): string {
    if (this.d.reflectRaw[t.raw] !== undefined) return this.d.reflectRaw[t.raw];
    if (t.josa && this.d.reflect[t.stem] !== undefined) return this.reattach(this.d.reflect[t.stem], t.josa);
    if (this.d.reflect[t.raw] !== undefined) return this.d.reflect[t.raw];
    return t.raw;
  }

  /** 마지막 어절의 어미 → {어간, 과거형?, 서술격?}. 모르면 null */
  private stemOf(word: string): { stem: string; kind: 'verb' | 'adj' | 'past' | 'copula' } | null {
    const ex = this.d.stems.exact[word];
    const kindOf = (stem: string) => (this.adjSet.has(stem) ? 'adj' : 'verb') as 'adj' | 'verb';
    if (ex !== undefined) {
      if (ex.endsWith('=')) return { stem: ex.slice(0, -1), kind: 'copula' };
      return { stem: ex, kind: kindOf(ex) };
    }
    const w = word;
    for (const [suf, rep] of this.d.stems.suffix) {
      if (w.length > suf.length && w.endsWith(suf)) {
        const base = w.slice(0, -suf.length) + rep.replace(/=$/, '');
        if (rep.endsWith('=')) return { stem: base, kind: 'copula' };
        if (rep === '#') { // 어미만 떼고 다시 시도(예: '요')
          return this.stemOf(w.slice(0, -suf.length));
        }
        const stem = w.slice(0, -suf.length) + rep;
        if (isSyllable(lastChar(stem)) && jong(lastChar(stem)) === J_SS) return { stem, kind: 'past' };
        return { stem, kind: kindOf(stem) };
      }
    }
    // 'ㅂ니다/ㅂ니까': 앞 글자 받침 ㅂ 떼기
    if (/니다$|니까$/.test(w) && w.length >= 3 && jong(w[w.length - 3]) === J_B) {
      const c = w[w.length - 3];
      const stem = w.slice(0, -3) + withJong(c, J_NONE);
      return { stem, kind: kindOf(stem) };
    }
    // 받침 있는 음절 + 어/아 → 어간 (먹어→먹, 좋아→좋, 갔어→갔)
    const m = /^(.*)([어아])$/.exec(w);
    if (m && m[1] && jong(lastChar(m[1])) > 0) {
      const stem = m[1];
      if (jong(lastChar(stem)) === J_SS) return { stem, kind: 'past' };
      return { stem, kind: kindOf(stem) };
    }
    if (/다$/.test(w) && w.length >= 2) return { stem: w.slice(0, -1), kind: 'adj' }; // 이미 기본형
    if (jong(lastChar(w)) === J_SS) return { stem: w, kind: 'past' }; // 먹었(거든) 등
    return null;
  }

  /** 기본형(평서 현재) 만들기: 먹→먹는다, 가→간다, 살→산다, 좋→좋다, 갔→갔다, 바보= → 바보이다 */
  private plain(stem: string, kind: string): string {
    if (kind === 'copula') return stem + '이다';
    if (kind === 'adj' || kind === 'past') return stem + '다';
    const c = lastChar(stem);
    const j = jong(c);
    if (j < 0) return stem + '다';
    if (j === J_NONE) return stem.slice(0, -1) + withJong(c, J_N) + '다';
    if (j === J_L) return stem.slice(0, -1) + withJong(c, J_N) + '다';
    return stem + '는다';
  }

  /** 캡처를 반사한 뒤 어미를 바꾼 형태들 */
  private forms(toks: Tok[]): { raw: string; quote: string; adn: string } {
    const words = toks.map((t) => this.reflectTok(t));
    const raw = words.join(' ').trim();
    if (!words.length) return { raw: '', quote: '', adn: '' };
    const last = words[words.length - 1];
    const s = this.stemOf(last);
    if (!s) return { raw, quote: `“${raw}”라고`, adn: `“${raw}”라는` };
    const head = words.slice(0, -1).join(' ');
    const p = this.plain(s.stem, s.kind);
    const full = (head ? head + ' ' : '') + p;
    if (s.kind === 'copula') {
      const base = full.slice(0, -2);
      const cons = jong(lastChar(base)) > 0;
      return { raw, quote: base + (cons ? '이라고' : '라고'), adn: base + (cons ? '이라는' : '라는') };
    }
    return { raw, quote: full + '고', adn: full + '는' };
  }

  private assemble(tpl: string, caps: Tok[][]): string | null {
    let bad = false;
    const out = tpl.replace(/\((\d+)(?::(고|는|s))?\)/g, (_m, n: string, f?: string) => {
      const c = caps[parseInt(n, 10) - 1];
      if (!c || !c.length) { bad = true; return ''; }
      if (f === 's') return c.map((t) => { const r = this.reflectTok({ raw: t.stem, stem: t.stem, josa: '' }); return r; }).join(' ');
      const fm = this.forms(c);
      return f === '고' ? fm.quote : f === '는' ? fm.adn : fm.raw;
    });
    if (bad) return null;
    return fixJosa(out).replace(/\s{2,}/g, ' ').trim();
  }

  private ruleIndex(key: string): number { return this.rules.findIndex((r) => r.key === key); }

  private execRule(k: number, toks: Tok[], depth = 0): string {
    if (depth > 5) return '';
    const rule = this.rules[k];
    for (let i = 0; i < rule.decomps.length; i++) {
      const dc = rule.decomps[i];
      const caps = this.matchPattern(toks, dc.parts);
      if (!caps) continue;
      // elizabot 과 같은 방식으로 고르기: 무작위, 직전 선택과 같으면 다음 것
      let ri = Math.floor(this.rng() * dc.reasmb.length);
      if (this.lastchoice[k][i] === ri) {
        ri = ++this.lastchoice[k][i];
        if (ri >= dc.reasmb.length) { ri = 0; this.lastchoice[k][i] = -1; }
      } else this.lastchoice[k][i] = ri;
      // 캡처가 비어 쓸 수 없는 대답이면 순서대로 다음 대답
      let rpl: string | null = null;
      for (let t = 0; t < dc.reasmb.length && rpl === null; t++) {
        const tpl = dc.reasmb[(ri + t) % dc.reasmb.length];
        if (/^goto\s+/.test(tpl)) {
          const ki = this.ruleIndex(tpl.replace(/^goto\s+/, '').trim());
          if (ki >= 0) return this.execRule(ki, toks, depth + 1);
          continue;
        }
        rpl = this.assemble(tpl, caps);
      }
      if (rpl === null) continue;
      if (dc.mem) { this.mem.push(rpl); if (this.mem.length > 20) this.mem.shift(); continue; }
      return rpl;
    }
    return '';
  }

  private memGet(): string {
    if (!this.mem.length) return '';
    const n = Math.floor(this.rng() * this.mem.length);
    const r = this.mem[n];
    this.mem.splice(n, 1);
    return r;
  }

  transform(input: string): string {
    this.quit = false;
    const text = input.normalize('NFKC').trim();
    const bare = text.replace(/[\p{P}\p{S}\s]+/gu, '');
    if (this.d.quits.includes(bare)) { this.quit = true; return this.getFinal(); }
    if (/\p{L}/u.test(text) && !this.native.test(text)) {
      const k = this.ruleIndex('xforeign');
      if (k >= 0) { const r = this.execRule(k, this.preprocess(text)); if (r) return r; }
    }
    const parts = text.replace(/[“”"'‘’()[\]{}<>~]/g, ' ').split(this.split).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const toks = this.preprocess(part);
      for (let k = 0; k < this.rules.length; k++) {
        const key = this.rules[k].key;
        if (key.startsWith('x')) continue; // xnone, xforeign 은 키워드가 아니라 특수 규칙
        if (!toks.some((t) => this.elemMatch(t, key))) continue;
        const r = this.execRule(k, toks);
        if (r) return r;
      }
    }
    const m = this.memGet();
    if (m) return m;
    const k = this.ruleIndex('xnone');
    if (k >= 0) { const r = this.execRule(k, []); if (r) return r; }
    return this.d.fallback;
  }
}

export function createElizaAgglu(missionId: string, data: AggluData): ChatSession {
  const bot = new AggluEliza(data);
  bot.rng = mulberry32(hashStr(missionId));
  const greeting = bot.getInitial();
  const history: string[] = [];
  return {
    greeting,
    reply(input: string) {
      history.push(input);
      bot.rng = rngFor(missionId, history);
      return { text: bot.transform(input) };
    },
  };
}
