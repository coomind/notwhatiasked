/**
 * 미션 풀 자동 생성 → content/missions/<locale>/pool.json (오늘의 도전 + 끝없는 도전에 쓰임)
 *   npx tsx tools/gen-pool.ts [ko|en|all]
 *
 * 1) 후보 목표 단어를 엔진 데이터에서 뽑는다
 *    - ELIZA: 대답 틀(reasmb)에 들어 있는 낱말 → ELIZA가 실제로 말할 수 있는 말만
 *    - 마르코프: 학습 글(퍼블릭 도메인 소설)에 3~40번 나온 명사 같은 낱말
 * 2) 금지어 = 목표(+ 한국어 3글자 이상은 두 글자 조각, 영어는 어간)
 * 3) 엔진으로 최단 해법을 찾고(없으면 버림), 운으로 깨지는 비율(luck)과 요령이 통하는 비율(trick)을 잰다
 *    - luck: 아무 단어나 하나 넣었을 때 클리어되는 비율. 너무 높으면 시시해서 버림
 *    - trick(마르코프): 책에서 목표 바로 앞에 있던 두 단어를 넣었을 때 클리어되는 비율. 너무 낮으면 순전히 운이라 버림
 * 4) 기존 pool.json 항목은 그대로 둔다(id·순서 고정 → 공유 링크·통계·날짜별 미션이 안 바뀜). 새 것만 뒤에 붙인다.
 * 힌트는 엔진 데이터에서 그대로 가져온다: ELIZA는 그 대답 틀, 마르코프는 책 속 문장(목표 단어를 ○로 가림)과 작품 제목.
 */
import fs from 'node:fs';
import path from 'node:path';
import { replay } from '../src/engines/sync';
import { tokenize, isWord } from '../src/engines/markov/markov';
import { hasTaboo, normTarget, totalChars } from '../src/core/text';
import { hashStr, mulberry32 } from '../src/core/prng';
import { elizaData, markovModels } from '../src/generated/server-data';
// @ts-expect-error vendor JS
import elizaDataEn from '../src/engines/eliza/vendor/elizadata.js';
import type { Mission, RoomId } from '../src/core/types';
import { data, elizaCandidates } from './lib/solver';

const which = process.argv[2] ?? 'all';
const LUCK_MAX = { eliza: 0.03, markov: 0.1 };
/** 사람이 보고 뺀 낱말(조사·어미 조각, 뜻이 애매한 것). tools/pool-blocklist.json */
const BLOCK: Record<string, string[]> = fs.existsSync('tools/pool-blocklist.json') ? JSON.parse(fs.readFileSync('tools/pool-blocklist.json', 'utf8')) : {};
const TRICK_MIN = 0.2;
const SAMPLE = 160;

type PoolMission = Mission & { set: 'daily' | 'endless' };
const L = (en: string, ko: string) => ({ en, ko });

// ---------- 공통 ----------
const hangul = (s: string) => /^[가-힣]+$/.test(s);
const PARTICLES = ['에게서', '한테서', '으로부터', '로부터', '에서는', '에서도', '에서', '에게', '한테', '께서', '으로', '이랑', '하고', '처럼', '보다', '부터', '까지', '이나', '에는', '에도', '와', '과', '은', '는', '이', '가', '을', '를', '의', '에', '도', '만', '로', '랑'];
function splitParticle(w: string): [string, string] {
  for (const p of PARTICLES) if (w.length > p.length + 1 && w.endsWith(p)) return [w.slice(0, -p.length), p];
  return [w, ''];
}
const EN_STOP = new Set(('a about above after again against all also am an and any are aren as at be because been before being below between both but by can cannot could did do does doing down during each else ever every few for from further had has have having he her here hers herself him himself his how however i if in into is it its itself just let like made make many may me might more most much must my myself never no nor not now of off often on once one only or other ought our ours ourselves out over own perhaps rather really said same say says see seem seems shall she should since so some such than that the their theirs them themselves then there these they this those though through thus till to too under until up upon us very was we were what when where which while who whom whose why will with without would yes yet you your yours yourself yourselves ' +
  'come came went gone going know knew think thought tell told feel felt want wanted look looked thing things something anything nothing everything way time times quite little great good well back away again began began another enough even still always last next first long large small away round right left whole half last like little moment minute minutes').split(/\s+/));
const KO_STOP = new Set(['당신', '그것', '무엇', '어떤', '정말', '혹시', '조금', '다른', '이런', '그런', '저런', '말씀', '지금', '우리', '어떻게', '그래서', '그러나', '하지만', '그리고', '이야기', '생각', '때문', '사람', '그녀', '자기', '하나', '모두', '아무', '무슨', '이것', '저것', '거기', '여기', '그때', '이때', '그날', '오늘', '자꾸', '얼마', '마음']);

function shuffle<T>(a: T[], seed: string): T[] {
  const r = mulberry32(hashStr(seed));
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function tabooFor(target: string, locale: string): string[] {
  const t = target.toLowerCase();
  if (locale === 'ko') {
    const out = [t];
    if (t.length >= 3) for (let i = 0; i + 2 <= t.length; i++) out.push(t.slice(i, i + 2));
    return [...new Set(out)];
  }
  const stem = t.length >= 6 ? t.replace(/(ies|es|s|ed|ing)$/, '') : t;
  return [stem.length >= 4 ? stem : t];
}

function cleared(m: Mission, inputs: string[]): boolean {
  if (inputs.some((s) => hasTaboo(s, m.taboo))) return false;
  try { return replay(m, inputs, data).clearedAt === inputs.length - 1; } catch { return false; }
}

/** 글자 수 순으로 하나씩 넣어 보고 처음 통한 것 = 최단 해법 */
function firstSolution(m: Mission, singles: string[], pairs: [string, string][] = []): string[] | null {
  for (const s of singles) if (cleared(m, [s])) return [s];
  for (const [a, b] of pairs) if (cleared(m, [a, b])) return [a, b];
  return null;
}

function luck(m: Mission, pool: string[]): number {
  const r = mulberry32(hashStr('luck' + m.id));
  let ok = 0, n = 0;
  for (let i = 0; i < SAMPLE * 3 && n < SAMPLE; i++) {
    const s = pool[Math.floor(r() * pool.length)];
    if (hasTaboo(s, m.taboo)) continue;
    n++;
    if (cleared(m, [s])) ok++;
  }
  return n ? ok / n : 1;
}

// ---------- ELIZA ----------
type Reasmb = { text: string; key: string };
function elizaTemplates(locale: string): Reasmb[] {
  const out: Reasmb[] = [];
  const kws = locale === 'en' ? (elizaDataEn as { elizaKeywords: [string, number, [string, string[]][]][] }).elizaKeywords : (elizaData[locale] as unknown as { keywords: [string, number, [string, string[]][]][] }).keywords;
  for (const [key, , decs] of kws) for (const [, rs] of decs) for (const r of rs) if (!/^goto\b/.test(r)) out.push({ text: r, key });
  return out;
}
const placeholder = (s: string) => s.replace(/\(\d+(:[^)]*)?\)/g, '…').replace(/\{[^}]*\}/g, '').replace(/\s+([?.!,])/g, '$1');

function elizaTargets(locale: string): { target: string; template: string }[] {
  const seen = new Map<string, string>();
  const all = elizaTemplates(locale);
  // 아무 말에나 나오는 대답(xnone)에 든 낱말은 너무 쉬워서 뺀다
  const generic = all.filter((r) => r.key === 'xnone').map((r) => placeholder(r.text).toLowerCase()).join(' ');
  for (const { text, key } of all) {
    if (key === 'xnone') continue;
    const plain = placeholder(text);
    if (locale === 'en') {
      for (const w of plain.toLowerCase().match(/[a-z]+/g) ?? []) if (w.length >= 4 && !EN_STOP.has(w) && !seen.has(w)) seen.set(w, plain);
    } else {
      for (const raw of plain.split(/[\s.,!?…“”"'()]+/)) {
        if (!raw) continue;
        // 명사만: 조사가 붙어 있던 낱말, 또는 '~하다/~되다' 앞의 명사(사과하다 → 사과)
        const [stem, p] = splitParticle(raw);
        const verbStem = raw.match(/^([가-힣]{2,4}?)(하|해|했|할|한|합|하시|되|돼|된|될)/)?.[1];
        for (const s of [p ? stem : '', verbStem]) if (s && hangul(s) && s.length >= 2 && s.length <= 4 && !KO_STOP.has(s) && !seen.has(s)) seen.set(s, plain);
      }
    }
  }
  return [...seen].filter(([t]) => !generic.includes(t) && !BLOCK[locale]?.includes(t)).map(([target, template]) => ({ target, template }));
}

function elizaMission(locale: string, target: string, template: string, id: string): Mission {
  const blank = locale === 'en' ? template.replace(new RegExp(target, 'ig'), '___') : template.split(target).join('○'.repeat(target.length));
  return {
    id, room: 'eliza', locale, target, taboo: tabooFor(target, locale), maxTurns: 3, par: 0,
    title: L(`Make her say “${target}”`, `“${target}” 소리 하게 하기`),
    hint: L(`She has a line that goes: “${blank}” What makes her say it?`, `ELIZA가 가끔 이런 말을 해요: “${blank}” 무슨 말에 이게 나올까요?`),
  };
}

// ---------- 마르코프 ----------
const WORKS: Record<string, Record<string, { ko: string; en: string }>> = {
  ko: {
    unsu: { ko: '현진건 「운수 좋은 날」', en: 'Hyeon Jin-geon, “A Lucky Day”' },
    bsagam: { ko: '현진건 「B사감과 러브레터」', en: 'Hyeon Jin-geon, “B-sagam and the Love Letters”' },
    sul: { ko: '현진건 「술 권하는 사회」', en: 'Hyeon Jin-geon, “A Society That Drives You to Drink”' },
    dongbaek: { ko: '김유정 「동백꽃」', en: 'Kim Yu-jeong, “Camellias”' },
    memil: { ko: '이효석 「메밀꽃 필 무렵」', en: 'Yi Hyo-seok, “When the Buckwheat Blooms”' },
    nalgae: { ko: '이상 「날개」', en: 'Yi Sang, “Wings”' },
  },
  en: {
    alice: { ko: '루이스 캐럴 『이상한 나라의 앨리스』', en: 'Lewis Carroll, Alice’s Adventures in Wonderland' },
    grimm: { ko: '『그림 동화』', en: 'Grimms’ Fairy Tales' },
  },
};

function corpusSentences(locale: string): { work: string; s: string }[] {
  const dir = path.resolve('content/corpora', locale);
  const out: { work: string; s: string }[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '');
    // 문단(빈 줄) 단위로 줄바꿈을 이어 붙인 뒤 문장으로 자른다(구텐베르크 원문은 70자마다 줄바꿈)
    for (const para of txt.split(/\n\s*\n/)) {
      const flat = para.replace(/\s+/g, ' ').trim();
      for (const s of flat.split(/(?<=[.!?][”’"]?)\s+/)) {
        const x = s.trim().replace(/^[“"‘'(]+|[”"’')]+$/g, '').trim();
        if (x) out.push({ work: f.replace('.txt', ''), s: x });
      }
    }
  }
  return out;
}

function markovTargets(locale: string): string[] {
  const model = markovModels[locale];
  const toks = model.t.map((i) => model.v[i]);
  if (locale === 'en') {
    const cnt = new Map<string, number>();
    for (const w of toks) if (/^[a-z]{4,}$/.test(w) && !EN_STOP.has(w)) cnt.set(w, (cnt.get(w) ?? 0) + 1);
    return [...cnt].filter(([w, n]) => n >= 3 && n <= 40 && !BLOCK.en?.includes(w)).map(([w]) => w);
  }
  const cnt = new Map<string, { n: number; suf: Set<string> }>();
  for (const w of toks) {
    if (!hangul(w)) continue;
    const [stem, p] = splitParticle(w);
    if (stem.length < 2 || stem.length > 4 || KO_STOP.has(stem)) continue;
    const e = cnt.get(stem) ?? { n: 0, suf: new Set() };
    e.n++; e.suf.add(p); cnt.set(stem, e);
  }
  // 조사가 두 가지 이상 붙어 나온 것 = 명사일 가능성이 높다
  return [...cnt].filter(([w, e]) => e.n >= 3 && e.n <= 40 && e.suf.size >= 2 && [...e.suf].some((x) => x) && !BLOCK[locale]?.includes(w)).map(([w]) => w);
}

function markovHint(locale: string, target: string, sents: { work: string; s: string }[]): { en: string; ko: string } | null {
  // 목표가 낱말 첫머리에 오는 문장만(‘계집애인’ 속 ‘애인’ 같은 우연은 힌트로 안 씀). 영어는 대문자로 시작하는 온전한 문장만
  const at = locale === 'en' ? new RegExp(`\\b${target}`, 'i') : new RegExp(`(^|[\\s“"‘'(])${target}`);
  const hits = sents.filter((x) => at.test(x.s) && x.s.length >= 15 && x.s.length <= 90 && x.s.split(' ').length >= 4 && (locale !== 'en' || /^[A-Z]/.test(x.s)))
    .sort((a, b) => a.s.length - b.s.length);
  const h = hits[0];
  if (!h) return null;
  const blank = locale === 'en' ? h.s.replace(new RegExp(`\\b${target}\\w*`, 'ig'), '___') : h.s.split(target).join('○'.repeat(target.length));
  const w = WORKS[locale][h.work];
  return L(`From ${w.en}: “${blank}”`, `${w.ko}에 이런 문장이 있어요: “${blank}”`);
}

function trickRate(m: Mission, toks: string[]): number {
  const ctx = new Set<string>();
  for (let i = 2; i < toks.length && ctx.size < 30; i++) {
    if (!normTarget(toks[i]).includes(m.target)) continue;
    const a = toks[i - 2], b = toks[i - 1];
    if (isWord(a) && isWord(b)) ctx.add(`${a} ${b}`);
  }
  const list = [...ctx].filter((s) => !hasTaboo(s, m.taboo));
  if (!list.length) return 0;
  return list.filter((s) => cleared(m, [s])).length / list.length;
}

// ---------- 생성 ----------
function gen(locale: string) {
  const file = path.resolve('content/missions', locale, 'pool.json');
  const prev: PoolMission[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const handMade = ['eliza', 'markov', 'gpt2'].flatMap((r) => { const p = path.resolve('content/missions', locale, `${r}.json`); return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as Mission[]) : []; });
  // 같은 목표·같은 어간(dream/dreams/dreamed)은 한 번만
  const used = new Set([...handMade, ...prev].flatMap((m) => [m.target.toLowerCase(), m.taboo[0]]));
  const dup = (target: string) => used.has(target.toLowerCase()) || used.has(tabooFor(target, locale)[0]);
  const take = (target: string) => { used.add(target.toLowerCase()); used.add(tabooFor(target, locale)[0]); };
  const counters: Record<RoomId, number> = { eliza: 0, markov: 0, gpt2: 0 };
  for (const m of prev) counters[m.room]++;
  const fresh: { m: Mission; luck: number; trick?: number }[] = [];
  const log: string[] = [];

  // ELIZA
  const c = elizaCandidates(locale);
  const singles = [...new Set(c.one.flatMap((s) => [s, s + '!', s + '?']))].sort((a, b) => totalChars([a]) - totalChars([b]) || a.localeCompare(b));
  const pairs: [string, string][] = c.mem.flatMap((a) => c.fill.map((b) => [a, b] as [string, string])).sort((x, y) => totalChars(x) - totalChars(y));
  const et = elizaTargets(locale);
  console.log(`[${locale}] ELIZA 후보 ${et.length}개`);
  for (const { target, template } of et) {
    if (dup(target)) continue;
    const m = elizaMission(locale, target, template, `p-${locale}-e${String(counters.eliza + 1).padStart(3, '0')}`);
    if (!hasTaboo(m.target, m.taboo)) continue;
    const lk = luck(m, c.one);
    if (lk > LUCK_MAX.eliza) { log.push(`eliza ✗ ${target} luck=${lk.toFixed(2)}`); continue; }
    const sol = firstSolution(m, singles, pairs.slice(0, 4000));
    if (!sol) { log.push(`eliza ✗ ${target} 해법 없음`); continue; }
    counters.eliza++;
    take(target);
    fresh.push({ m: { ...m, par: totalChars(sol), parTurns: sol.length, solution: sol }, luck: lk });
    log.push(`eliza ✓ ${target} luck=${lk.toFixed(2)} sol=${JSON.stringify(sol)}`);
  }

  // 마르코프
  const model = markovModels[locale];
  const toks = model.t.map((i) => model.v[i]);
  const words = [...new Set(toks.filter(isWord))];
  const cand = new Set<string>(words);
  for (let i = 0; i + 1 < toks.length; i++) if (isWord(toks[i]) && isWord(toks[i + 1])) cand.add(toks[i] + ' ' + toks[i + 1]);
  const mList = [...cand].filter((s) => tokenize(s).length > 0).sort((a, b) => totalChars([a]) - totalChars([b]) || a.localeCompare(b));
  const sents = corpusSentences(locale);
  const mt = markovTargets(locale);
  console.log(`[${locale}] 마르코프 후보 ${mt.length}개`);
  for (const target of mt) {
    if (dup(target)) continue;
    const hint = markovHint(locale, target, sents);
    if (!hint) continue;
    const m: Mission = {
      id: `p-${locale}-m${String(counters.markov + 1).padStart(3, '0')}`, room: 'markov', locale, target, taboo: tabooFor(target, locale), maxTurns: 5, par: 0,
      title: L(`Make it write “${target}”`, `“${target}” 쓰게 하기`), hint,
    };
    if (!hasTaboo(m.target, m.taboo)) continue;
    const lk = luck(m, words);
    if (lk > LUCK_MAX.markov) { log.push(`markov ✗ ${target} luck=${lk.toFixed(2)}`); continue; }
    const tr = trickRate(m, toks);
    if (tr < TRICK_MIN) { log.push(`markov ✗ ${target} trick=${tr.toFixed(2)}`); continue; }
    const sol = firstSolution(m, mList.filter((s) => !hasTaboo(s, m.taboo)).slice(0, 20000));
    if (!sol) { log.push(`markov ✗ ${target} 해법 없음`); continue; }
    counters.markov++;
    take(target);
    fresh.push({ m: { ...m, par: totalChars(sol), parTurns: 1, solution: sol }, luck: lk, trick: tr });
    log.push(`markov ✓ ${target} luck=${lk.toFixed(2)} trick=${tr.toFixed(2)} sol=${JSON.stringify(sol)}`);
  }

  // 오늘의 도전 : 끝없는 도전 = 4 : 6. 오늘의 도전 순서는 ELIZA·마르코프를 번갈아
  const byRoom = (r: RoomId) => shuffle(fresh.filter((x) => x.m.room === r).map((x) => x.m), `pool-${locale}-${r}-${prev.length}`);
  // 한 번에 풀리는 문제를 앞쪽 날짜에(첫날부터 너무 어려우면 안 돌아옴)
  const easyFirst = (a: Mission[]) => [...a.filter((m) => (m.parTurns ?? 1) === 1), ...a.filter((m) => (m.parTurns ?? 1) > 1)];
  const E = easyFirst(byRoom('eliza')), M = easyFirst(byRoom('markov'));
  const dE = Math.round(E.length * 0.4), dM = Math.round(M.length * 0.4);
  const daily: Mission[] = [];
  for (let i = 0; i < Math.max(dE, dM); i++) { if (i < dE) daily.push(E[i]); if (i < dM) daily.push(M[i]); }
  const endless = [...E.slice(dE), ...M.slice(dM)];
  const out: PoolMission[] = [
    ...prev,
    ...daily.map((m) => ({ ...m, set: 'daily' as const })),
    ...endless.map((m) => ({ ...m, set: 'endless' as const })),
  ];
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  fs.mkdirSync('tools/search-logs', { recursive: true });
  fs.writeFileSync(`tools/search-logs/pool-${locale}.log`, log.join('\n') + '\n');
  console.log(`[${locale}] 새로 ${fresh.length}개 (ELIZA ${E.length} · 마르코프 ${M.length}) → 오늘의 도전 ${daily.length} · 끝없는 도전 ${endless.length} · 전체 ${out.length}`);
}

const listOnly = process.argv.includes('--list');
for (const l of which === 'all' ? ['ko', 'en'] : [which]) {
  if (listOnly) { console.log(`${l} eliza:`, elizaTargets(l).map((x) => x.target).join(' ')); console.log(`${l} markov:`, markovTargets(l).join(' ')); continue; }
  gen(l);
}
