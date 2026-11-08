import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Mission, PlayMode, Reply } from '../core/types';
import { CHALLENGE_MAX, MARKOV_MAX_INPUT_WORDS, MAX_INPUT_CHARS } from '../core/types';
import { cleanInput, findTaboo, graphemeCount, hitsTarget, normTarget, totalChars } from '../core/text';
import { countWords } from '../engines/markov/markov';
import { ENGINE_VERSION } from '../core/version';
import { challengeView, statKey, MIN_SAMPLE } from '../core/stats';
import { t, loc } from './i18n';
import { modeFor, roomSet } from './content';
import { startConversation, type Conversation } from './engines';
import { useProgress, updateProgress, recordClear, challengeKey } from './store';
import { queueResult, useStats } from './stats';
import { useGpt2, loadGpt2, wasDownloaded } from './gpt2client';
import { GPT2_MODELS, REDACTED } from '../engines/gpt2/shared';
import { shareCard, shareUrl, copyLink, type CardTurn } from './share';
import { tick } from './sound';
import { go } from './router';

interface Turn { input: string; reply: Reply | null; done: boolean }
type Outcome = null | 'cleared' | 'failed';

const CARE_RE = /\b(kill myself|killing myself|suicide|suicidal|end my life|want to die|hurt myself|self[- ]harm)\b|자살|죽고\s*싶|자해|목숨을\s*끊/i;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** 글자가 한 자씩 찍히는 효과(유일한 애니메이션). 누르면 바로 다 보임 */
function TypeOut({ text, room, sound, onDone, skip }: { text: string; room: Mission['room']; sound: boolean; onDone: () => void; skip: boolean }) {
  const chars = useMemo(() => Array.from(text), [text]);
  const [n, setN] = useState(reducedMotion() ? chars.length : 0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (skip) setN(chars.length);
  }, [skip, chars.length]);
  useEffect(() => {
    if (n >= chars.length) { if (!doneRef.current) { doneRef.current = true; onDone(); } return; }
    const speed = room === 'eliza' ? 32 : room === 'markov' ? 18 : 12;
    const id = setTimeout(() => { setN((x) => Math.min(chars.length, x + (room === 'gpt2' ? 2 : 1))); if (sound && chars[n] !== ' ') tick(room); }, speed);
    return () => clearTimeout(id);
  }, [n, chars, room, sound, onDone]);
  return <>{chars.slice(0, n).join('')}{n < chars.length && <span className="caret" aria-hidden="true">▌</span>}</>;
}

/** 목표 단어를 표시(색 + 밑줄 + 굵게: 색만으로 구분하지 않음) */
function markTarget(text: string, target: string, on: boolean): ReactNode {
  if (!on) return text;
  const i = normTarget(text).indexOf(normTarget(target));
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="hit">{text.slice(i, i + target.length)}</mark>{text.slice(i + target.length)}</>;
}

function renderRedacted(text: string): ReactNode {
  if (!text.includes(REDACTED)) return text;
  const parts = text.split(REDACTED);
  return parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <span className="redacted">{REDACTED}</span>}</span>);
}

export function MissionView({ mission, lang, launch }: { mission: Mission; lang: string; launch: { replay?: string[]; challenge?: boolean } | null }) {
  const prog = useProgress();
  const stats = useStats();
  const gpt2 = useGpt2();
  const mode = modeFor(mission, lang);
  const ckey = challengeKey(mission.id, lang);
  const [play, setPlay] = useState<PlayMode>(launch?.challenge ? 'challenge' : 'casual');
  const practice = play === 'challenge' && !!prog.challenge[ckey];
  const [round, setRound] = useState(0);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [attempts, setAttempts] = useState(0);
  const [input, setInput] = useState('');
  const [hint, setHint] = useState(false);
  const [skip, setSkip] = useState(false);
  const [replay, setReplay] = useState<string[] | null>(launch?.replay && !launch.challenge ? launch.replay : null);
  const [toast, setToast] = useState('');
  const [care, setCare] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const needsModel = mission.room === 'gpt2' && gpt2.status !== 'ready';
  const limit = play === 'challenge' ? CHALLENGE_MAX : mission.maxTurns;
  const typing = turns.some((x) => !x.done);
  const set = roomSet(mission.room, lang, mission.locale !== lang);
  const idx = set.missions.findIndex((m) => m.id === mission.id);
  const next = idx >= 0 ? set.missions[idx + 1] : undefined;

  // GPT-2: 이미 받은 적 있으면 바로(캐시에서) 불러오기
  useEffect(() => {
    if (mission.room === 'gpt2' && gpt2.status === 'idle' && wasDownloaded()) loadGpt2(mission.locale).catch(() => undefined);
  }, [mission.room, mission.locale, gpt2.status]);

  // 새 판 시작
  useEffect(() => {
    let alive = true;
    setConv(null); setTurns([]); setOutcome(null); setBusy(false); setSkip(false); setCare(false);
    if (needsModel) return;
    startConversation(mission).then((c) => { if (alive) setConv(c); }).catch(() => { if (alive) setToast(t('err.engine')); });
    return () => { alive = false; };
  }, [mission, round, needsModel]);

  // 공유 링크 재생: 입력을 차례로 자동 전송
  useEffect(() => {
    if (!replay || !conv || busy || typing || outcome) return;
    const i = turns.length;
    if (i < replay.length) void send(replay[i], true);
  }, [replay, conv, busy, typing, outcome, turns.length]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [turns, outcome]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id); }, [toast]);

  const clean = cleanInput(input);
  const hits = findTaboo(input, mission.taboo);
  const tooLong = graphemeCount(clean) > MAX_INPUT_CHARS;
  const words = mission.room === 'markov' ? countWords(clean) : 0;
  const tooManyWords = mission.room === 'markov' && words > MARKOV_MAX_INPUT_WORDS;
  const canSend = !!conv && !busy && !typing && !outcome && !!clean && !hits.length && !tooLong && !tooManyWords && turns.length < limit && !replay;

  async function send(raw: string, isReplay = false) {
    const inp = cleanInput(raw);
    if (!conv || !inp || sendingRef.current) return;
    sendingRef.current = true;
    try { await doSend(inp, isReplay); } finally { sendingRef.current = false; }
  }

  async function doSend(inp: string, isReplay: boolean) {
    if (!conv) return;
    if (!isReplay && (findTaboo(inp, mission.taboo).length || turns.length >= limit)) return;
    if (CARE_RE.test(inp)) setCare(true);
    setBusy(true); setSkip(false);
    const roundInputs = [...turns.map((x) => x.input), inp];
    setTurns((ts) => [...ts, { input: inp, reply: null, done: false }]);
    let reply: Reply;
    try { reply = await conv.reply(inp); } catch { setBusy(false); setToast(t('err.engine')); setTurns((ts) => ts.slice(0, -1)); return; }
    setTurns((ts) => ts.map((x, i) => (i === ts.length - 1 ? { ...x, reply, done: false } : x)));
    setBusy(false);
    if (!isReplay) setInput('');
    const hit = hitsTarget(reply.text, mission.target);
    const n = isReplay ? roundInputs.length : attempts + 1;
    if (!isReplay) setAttempts(n);
    const chars = totalChars(roundInputs);
    const base = { missionId: mission.id, locale: lang, mode, engineVersion: ENGINE_VERSION, inputs: roundInputs, attempts: n, chars };
    if (hit) {
      setOutcome('cleared');
      if (isReplay) return;
      recordClear(mission.id, n, chars);
      if (play === 'challenge' && !practice) {
        updateProgress((p) => ({ ...p, challenge: { ...p.challenge, [ckey]: { cleared: true, attempts: n, chars } } }));
        queueResult({ ...base, play: 'challenge', cleared: true });
      } else if (play === 'casual') queueResult({ ...base, play: 'casual', cleared: true });
    } else if (roundInputs.length >= limit) {
      setOutcome('failed');
      if (isReplay) return;
      if (play === 'challenge' && !practice) {
        updateProgress((p) => ({ ...p, challenge: { ...p.challenge, [ckey]: { cleared: false, attempts: n, chars } } }));
        queueResult({ ...base, play: 'challenge', cleared: false });
      }
    }
  }

  function newRound(resetAttempts = false) {
    if (resetAttempts) setAttempts(0);
    setRound((r) => r + 1);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  /** 도전 중에 그만두면 실패 처리 */
  function abandonChallenge(): boolean {
    if (play === 'challenge' && !practice && turns.length > 0 && !outcome) {
      if (!window.confirm(t('challenge.resetConfirm'))) return false;
      const ins = turns.map((x) => x.input);
      updateProgress((p) => ({ ...p, challenge: { ...p.challenge, [ckey]: { cleared: false, attempts: ins.length, chars: totalChars(ins) } } }));
      queueResult({ missionId: mission.id, locale: lang, mode, engineVersion: ENGINE_VERSION, inputs: ins, attempts: ins.length, chars: totalChars(ins), play: 'challenge', cleared: false });
    }
    return true;
  }

  function switchPlay(p: PlayMode) {
    if (p === play) return;
    if (!abandonChallenge()) return;
    setPlay(p); setHint(false); setReplay(null); newRound(true);
  }

  const doneTurns: CardTurn[] = turns.filter((x) => x.reply).map((x) => ({ input: x.input, reply: x.reply!.unknownWord ? t('markov.unknown', { w: x.reply!.unknownWord }) : x.reply!.text }));
  const roundInputs = turns.map((x) => x.input);
  const myChars = totalChars(roundInputs);
  const sKey = statKey(mission.id, lang, mode);
  const cv = play === 'challenge' && outcome ? challengeView(stats?.m?.[sKey], outcome === 'cleared' ? { attempts, chars: myChars } : null) : null;
  const casualStat = stats?.m?.[sKey];
  const card = { mission, play, cleared: outcome === 'cleared', attempts: play === 'challenge' || replay ? roundInputs.length : attempts, chars: myChars, turns: doneTurns, topPct: cv?.topPct ?? null, lang };
  const url = shareUrl(mission, play, roundInputs);

  async function onShare() {
    const r = await shareCard(card, url);
    if (r === 'downloaded') setToast(t('share.downloaded'));
    if (r === 'failed') setToast(t('share.failed'));
  }
  async function onCopy() { setToast((await copyLink(url)) ? t('share.copied') : url); }

  // 입력창 미러(금지어 빨간 밑줄)
  const mirror = useMemo(() => {
    if (!hits.length) return input;
    const out: ReactNode[] = [];
    let p = 0;
    hits.forEach((h, i) => { if (h.start > p) out.push(input.slice(p, h.start)); out.push(<span key={i} className="taboo-hit">{input.slice(Math.max(p, h.start), h.end)}</span>); p = Math.max(p, h.end); });
    out.push(input.slice(p));
    return out;
  }, [input, hits]);

  const greeting = conv?.greeting;
  const room = mission.room;
  const ending = outcome && !typing;

  return (
    <div className={`mission skin-${room}`} onClick={() => typing && setSkip(true)}>
      <header className="mbar">
        <button className="link" onClick={() => { if (abandonChallenge()) go(`room/${room}`); }}>← {t(`room.${room}.name`)}</button>
        <div className="seg" role="group" aria-label={t('play.label')}>
          <button aria-pressed={play === 'casual'} onClick={() => switchPlay('casual')}>{t('play.casual')}</button>
          <button aria-pressed={play === 'challenge'} onClick={() => switchPlay('challenge')}>{t('play.challenge')}</button>
        </div>
      </header>

      <section className="mcard" aria-labelledby="mtitle">
        <h1 id="mtitle">{loc(mission.title, lang)}</h1>
        <p className="goal">{t('mission.goal')} <b className="target">{mission.target}</b>{mission.gloss ? ` (${loc(mission.gloss, lang)})` : ''}</p>
        <p className="taboo-list">{t('mission.taboo')} {mission.taboo.map((w) => <span key={w} className="chip">{w}</span>)}</p>
        <p className="meta">
          {play === 'challenge' ? t('mission.challengeRule', { n: CHALLENGE_MAX }) : t('mission.turns', { n: mission.maxTurns })}
          {' · '}{t('mission.dev', { n: mission.parTurns ?? 1, chars: mission.par })}
          {mode === 'original' && <> · <span className="badge">{t('mode.original')}</span></>}
          {practice && <> · <span className="badge">{t('challenge.practice')}</span></>}
        </p>
        {play === 'challenge' && !practice && turns.length === 0 && <p className="notice">{t('challenge.intro', { n: CHALLENGE_MAX })}</p>}
        {play === 'casual' && (
          <p className="hintrow">
            <button className="link" aria-expanded={hint} onClick={() => setHint((h) => !h)}>{hint ? t('hint.hide') : t('hint.show')}</button>
            {hint && <span className="hint"> {loc(mission.hint, lang)}</span>}
          </p>
        )}
      </section>

      {needsModel ? (
        <section className="gate">
          {gpt2.status === 'loading' ? (
            <>
              <p>{t('gpt2.loading')}</p>
              <progress max={gpt2.total || 1} value={gpt2.loaded} aria-label={t('gpt2.loading')} />
              <p className="meta">{gpt2.total ? `${Math.round(gpt2.loaded / 1048576)} / ${Math.round(gpt2.total / 1048576)} MB` : ''}</p>
            </>
          ) : (
            <>
              <p className="big">{t('gpt2.consent', { mb: GPT2_MODELS[mission.locale]?.sizeMB ?? 128 })}</p>
              {gpt2.status === 'error' && <p className="err">{t('gpt2.error')}</p>}
              <button className="primary" onClick={() => loadGpt2(mission.locale).catch(() => undefined)}>{t('gpt2.download')}</button>
            </>
          )}
        </section>
      ) : (
        <section className="log" ref={logRef} aria-live="polite" aria-label={t('log.label')}>
          {room === 'eliza' && greeting && <p className="ai">{lang === 'en' || mission.locale === 'en' ? greeting.toUpperCase() : greeting}</p>}
          {room === 'markov' && turns.length === 0 && <p className="ai dim">{t('markov.ready')}</p>}
          {room === 'gpt2' && turns.length === 0 && <p className="ai dim">{t('gpt2.ready')}</p>}
          {turns.map((tr, i) => {
            const last = i === turns.length - 1;
            const rep = tr.reply;
            const text = rep ? (rep.unknownWord ? t('markov.unknown', { w: rep.unknownWord }) : rep.text || t('ai.empty')) : '';
            const shown = rep ? (tr.done || !last ? <>{renderRedacted(text)}</> : <TypeOut text={text} room={room} sound={prog.sound} skip={skip} onDone={() => setTurns((ts) => ts.map((x, j) => (j === i ? { ...x, done: true } : x)))} />) : <span className="thinking">{t('ai.thinking')}</span>;
            const finalText = tr.done || !last ? markTarget(text, mission.target, outcome === 'cleared' && last) : shown;
            if (room === 'gpt2') return (
              <div className="cell" key={i}>
                <div className="cin"><span className="lbl">In [{i + 1}]:</span><span className="code">{tr.input}</span></div>
                <div className="cout"><span className="lbl">Out[{i + 1}]:</span><span><span className="echo">{tr.input}</span>{tr.done || !last ? renderRedactedMark(text, mission.target, outcome === 'cleared' && last) : shown}</span></div>
              </div>
            );
            if (room === 'markov') return (
              <p className="turn" key={i}><span className="you">&gt; {tr.input}</span>{' '}<span className="ai">{finalText}</span></p>
            );
            const upper = mission.locale === 'en';
            return (
              <div className="turn" key={i}>
                <p className="you">&gt; {upper ? tr.input.toUpperCase() : tr.input}</p>
                <p className={`ai${upper ? ' upper' : ''}`}>{finalText}</p>
              </div>
            );
          })}
          {care && <p className="care" role="note">{t('care.note')}</p>}
          {replay && !busy && !typing && (turns.length >= replay.length || outcome) && (
            <div className="replay-end">
              <p>{t('replay.done')}</p>
              <button className="primary" onClick={() => { setReplay(null); newRound(true); }}>{t('replay.try')}</button>
            </div>
          )}
          {ending && !replay && (
            <div className={`result ${outcome}`} role="status">
              {outcome === 'cleared' ? (
                <>
                  <p className="big">{t('result.cleared', { n: play === 'challenge' ? roundInputs.length : attempts })}</p>
                  <p>{t('result.chars', { chars: myChars })}{play === 'challenge' && practice ? ` · ${t('challenge.practice')}` : ''}</p>
                  {cv && <p>{[cv.topPct ? t('result.top', { pct: cv.topPct }) : '', t('result.clearRate', { pct: cv.clearRate })].filter(Boolean).join(' · ')}</p>}
                  {cv && stats?.m?.[sKey] && <p className="meta">{t('result.beatDev', { pct: stats.m[sKey].pb })}</p>}
                  {play === 'casual' && casualStat && casualStat.n >= MIN_SAMPLE && <p className="meta">{t('result.casualAvg', { a: casualStat.a, n: casualStat.n })}</p>}
                </>
              ) : (
                <>
                  <p className="stamp" aria-label={t('title')}>{t('title')}</p>
                  <p>{t('result.failed', { target: mission.target })}</p>
                  {cv && <p>{t('result.clearRate', { pct: cv.clearRate })}</p>}
                </>
              )}
              <div className="actions">
                <button className="primary" onClick={onShare}>{outcome === 'cleared' ? t('share.card') : t('share.failCard')}</button>
                <button onClick={onCopy}>{t('share.link')}</button>
                {outcome === 'failed' && play === 'casual' && <button onClick={() => newRound()}>{t('again')}</button>}
                {outcome === 'cleared' && play === 'casual' && <button onClick={() => newRound(true)}>{t('again.better')}</button>}
                {play === 'challenge' && <button onClick={() => newRound(true)}>{t('challenge.retry')}</button>}
                {next ? <button onClick={() => go(`m/${next.id}`)}>{t('next')} →</button> : <button onClick={() => go(room === 'gpt2' ? 'ending' : '')}>{room === 'gpt2' ? t('to.ending') : t('to.lobby')} →</button>}
              </div>
            </div>
          )}
        </section>
      )}

      {!needsModel && !ending && (
        <form className="inputbar" onSubmit={(e) => { e.preventDefault(); if (canSend) void send(input); }}>
          <div className="field">
            <div className="mirror" ref={mirrorRef} aria-hidden="true">{mirror}</div>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onScroll={(e) => { if (mirrorRef.current) mirrorRef.current.scrollLeft = (e.target as HTMLInputElement).scrollLeft; }}
              placeholder={replay ? t('replay.playing') : outcome ? '' : t(`input.ph.${room}`)}
              aria-label={t('input.label')}
              aria-invalid={hits.length > 0}
              aria-describedby="inputhelp"
              disabled={!conv || !!outcome || !!replay}
              maxLength={300}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              enterKeyHint="send"
            />
          </div>
          <button type="submit" className="primary" disabled={!canSend}>{t('send')}</button>
          {play === 'casual' && turns.length > 0 && !outcome && !replay && <button type="button" onClick={() => newRound()} title={t('reset')}>{t('reset')}</button>}
          <p id="inputhelp" className={`help${hits.length ? ' bad' : ''}`}>
            {hits.length ? t('taboo.hit', { w: [...new Set(hits.map((h) => h.word))].join(', ') })
              : tooLong ? t('input.tooLong', { n: MAX_INPUT_CHARS })
              : tooManyWords ? t('markov.tooMany', { n: MARKOV_MAX_INPUT_WORDS })
              : t('input.status', { used: turns.length, limit, chars: graphemeCount(clean) }) + (room === 'markov' ? ` · ${t('markov.words', { n: words, max: MARKOV_MAX_INPUT_WORDS })}` : '')}
          </p>
        </form>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function renderRedactedMark(text: string, target: string, on: boolean): ReactNode {
  if (on && hitsTarget(text, target)) return markTarget(text, target, true);
  return renderRedacted(text);
}
