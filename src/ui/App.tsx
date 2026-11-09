import { useEffect } from 'react';
import type { RoomId } from '../core/types';
import { ROOMS } from '../core/types';
import { decodeInputs } from '../core/codec';
import { t, loc, useLang, setLang, LANGS, langName } from './i18n';
import { roomSet, missionById, ROOM_YEAR, MISSIONS } from './content';
import { useProgress, updateProgress, type Progress } from './store';
import { loadStats, installReporter, useStats } from './stats';
import { useRoute, go, setLaunch, takeLaunch } from './router';
import { MissionView } from './Mission';
import { DailyView, Archive, Endless, PlayCards } from './Daily';
import { GPT2_MODELS } from '../engines/gpt2/shared';

// 공유 링크(?m=…&r=… / ?m=…&c=1)로 들어오면 미션 화면으로 옮기고 주소창은 깨끗하게
function consumeQuery() {
  const q = new URLSearchParams(location.search);
  const keep0 = q.get('lang') ? `?lang=${q.get('lang')}` : '';
  // ?d=12 → 오늘의 도전 #12, ?e=1 → 끝없는 도전
  if (q.get('d')) { history.replaceState(null, '', `${location.pathname}${keep0}#/d/${encodeURIComponent(q.get('d')!)}`); return; }
  if (q.get('e')) { history.replaceState(null, '', `${location.pathname}${keep0}#/endless`); return; }
  const id = q.get('m');
  if (!id || !missionById(id)) return;
  const replay = q.get('r') ? decodeInputs(q.get('r')!) ?? undefined : undefined;
  setLaunch({ missionId: id, replay, challenge: q.get('c') === '1' });
  const keep = q.get('lang') ? `?lang=${q.get('lang')}` : '';
  history.replaceState(null, '', `${location.pathname}${keep}#/m/${encodeURIComponent(id)}`);
}
consumeQuery();

function unlocked(p: Progress, lang: string): Record<RoomId | 'ending', boolean> {
  const out = {} as Record<RoomId | 'ending', boolean>;
  let prevCleared = true;
  for (const r of ROOMS) {
    out[r] = p.freeTour || prevCleared;
    prevCleared = roomSet(r, lang, p.original).missions.some((m) => p.cleared[m.id]);
  }
  out.ending = p.freeTour || prevCleared;
  return out;
}

function Toggles() {
  const lang = useLang();
  const p = useProgress();
  return (
    <div className="toggles">
      <label>
        <span>{t('lang.label')}</span>{' '}
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('lang.label')}>
          {LANGS.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
        </select>
      </label>
      {lang !== 'en' && (
        <label><input type="checkbox" checked={p.original} onChange={(e) => updateProgress((x) => ({ ...x, original: e.target.checked }))} /> {t('mode.originalToggle')}</label>
      )}
      <label><input type="checkbox" checked={p.sound} onChange={(e) => updateProgress((x) => ({ ...x, sound: e.target.checked }))} /> {t('sound')}</label>
    </div>
  );
}

function Lobby() {
  const lang = useLang();
  const p = useProgress();
  const stats = useStats();
  const un = unlocked(p, lang);
  const visitor = p.visitorNo;
  const row = (r: RoomId) => {
    const set = roomSet(r, lang, p.original);
    const done = set.missions.filter((m) => p.cleared[m.id]).length;
    return (
      <li key={r}>
        <button className={`room-row r-${r}`} disabled={!un[r]} onClick={() => go(`room/${r}`)}>
          <span className="year">{ROOM_YEAR[r]}</span>
          <span className="rname">{t(`room.${r}.name`)}<small> — {t(`room.${r}.ai`)}</small></span>
          <span className="rstat">{un[r] ? t('lobby.cleared', { n: done, total: set.missions.length }) : `🔒 ${t('lobby.locked')}`}</span>
        </button>
      </li>
    );
  };
  return (
    <main className="lobby">
      <h1 className="title">{t('title')}</h1>
      <p className="sub">{t('subtitle')}</p>
      <ol className="rules">
        <li>{t('rules.1')}</li>
        <li>{t('rules.2')}</li>
        <li>{t('rules.3')}</li>
      </ol>
      <PlayCards />
      <h2 className="section">{t('lobby.rooms')}</h2>
      <p className="meta">{t('lobby.roomsSub')}</p>
      <ul className="rooms">
        {row('eliza')}
        {row('markov')}
        <li><div className="room-row soon"><span className="year">2000s</span><span className="rname">{t('room.messenger.name')}</span><span className="rstat">{t('lobby.soon')}</span></div></li>
        <li><div className="room-row soon"><span className="year">2010s</span><span className="rname">{t('room.autocomplete.name')}</span><span className="rstat">{t('lobby.soon')}</span></div></li>
        {row('gpt2')}
        <li>
          <button className="room-row r-ending" disabled={!un.ending} onClick={() => go('ending')}>
            <span className="year">2020s</span><span className="rname">{t('room.ending.name')}</span><span className="rstat">{un.ending ? '' : `🔒 ${t('lobby.locked')}`}</span>
          </button>
        </li>
      </ul>
      {!p.freeTour && <button className="link" onClick={() => updateProgress((x) => ({ ...x, freeTour: true }))}>{t('lobby.freeTour')}</button>}
      <p className="meta">{t('lobby.unlockRule')}</p>
      <Toggles />
      {visitor && stats && <p className="visitor">{t('lobby.visitor', { n: visitor.toLocaleString(lang) })}</p>}
      <footer><button className="link" onClick={() => go('credits')}>{t('credits')}</button></footer>
    </main>
  );
}

function Room({ room }: { room: RoomId }) {
  const lang = useLang();
  const p = useProgress();
  const set = roomSet(room, lang, p.original);
  return (
    <main className={`room skin-${room}`}>
      <button className="link" onClick={() => go('')}>← {t('to.lobby')}</button>
      <section className="plaque" aria-labelledby="ptitle">
        <p className="year">{ROOM_YEAR[room]}</p>
        <h1 id="ptitle">{t(`room.${room}.name`)}</h1>
        <p className="maker">{t(room === 'gpt2' && set.locale === 'ko' ? 'room.gpt2ko.maker' : `room.${room}.maker`)}</p>
        <ol>
          <li>{t(room === 'gpt2' && set.locale === 'ko' ? 'room.gpt2ko.how1' : `room.${room}.how1`)}</li>
          <li>{t(`room.${room}.how2`)}</li>
          <li>{t(`room.${room}.how3`)}</li>
        </ol>
        {room === 'gpt2' && <p className="meta">{t('gpt2.model', { name: GPT2_MODELS[set.locale]?.name ?? 'GPT-2' })}</p>}
      </section>
      {set.forcedOriginal && <p className="notice">{t(`room.${room}.noLocal`)}</p>}
      {set.mode === 'original' && !set.forcedOriginal && <p className="notice">{t('mode.originalOn')}</p>}
      <ol className="missions">
        {set.missions.map((m, i) => {
          const c = p.cleared[m.id];
          const ch = p.challenge[`${m.id}|${lang}`];
          return (
            <li key={m.id}>
              <button className="mrow" onClick={() => go(`m/${m.id}`)}>
                <span className="no">{String(i + 1).padStart(2, '0')}</span>
                <span className="mt">{loc(m.title, lang)}</span>
                <span className="ms">
                  {c ? `✓ ${t('room.clearedIn', { n: c.attempts })}` : ''}
                  {ch ? ` · ${ch.cleared ? t('room.challengeOk', { n: ch.attempts }) : t('room.challengeFail')}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

function Ending() {
  const lang = useLang();
  const p = useProgress();
  const recs = Object.entries(p.challenge).filter(([k, v]) => k.endsWith(`|${lang}`) && v.cleared);
  const avg = recs.length ? Math.round((recs.reduce((a, [, v]) => a + v.attempts, 0) / recs.length) * 10) / 10 : null;
  const lines = ROOMS.map((r) => {
    const set = roomSet(r, lang, p.original);
    return `${ROOM_YEAR[r]} ${t(`room.${r}.name`)}: ${t('lobby.cleared', { n: set.missions.filter((m) => p.cleared[m.id]).length, total: set.missions.length })}`;
  });
  const total = MISSIONS.filter((m) => p.cleared[m.id]).length;
  const text = [t('ending.cardTitle'), ...lines, avg !== null ? t('ending.avg', { a: avg }) : '', p.visitorNo ? t('lobby.visitor', { n: p.visitorNo.toLocaleString(lang) }) : '', location.origin].filter(Boolean).join('\n');
  return (
    <main className="ending">
      <p className="year">2020s</p>
      <h1>{t('room.ending.name')}</h1>
      <p className="empty-room">{t('ending.empty')}</p>
      <p className="big">{t('ending.line')}</p>
      <section className="record" aria-label={t('ending.cardTitle')}>
        <h2>{t('ending.cardTitle')}</h2>
        <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
        <p>{t('ending.total', { n: total })}</p>
        {avg !== null && <p>{t('ending.avg', { a: avg })}</p>}
        {p.visitorNo && <p>{t('lobby.visitor', { n: p.visitorNo.toLocaleString(lang) })}</p>}
      </section>
      <div className="actions">
        <button className="primary" onClick={async () => {
          try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
          try { await navigator.clipboard.writeText(text); alert(t('share.copied')); } catch { /* */ }
        }}>{t('ending.share')}</button>
        <button onClick={() => go('')}>{t('to.lobby')}</button>
      </div>
    </main>
  );
}

function Credits() {
  return (
    <main className="credits">
      <button className="link" onClick={() => go('')}>← {t('to.lobby')}</button>
      <h1>{t('credits')}</h1>
      <h2>ELIZA (1966)</h2>
      <p>Joseph Weizenbaum, “ELIZA — A Computer Program For the Study of Natural Language Communication Between Man and Machine”, CACM 9(1), 1966.</p>
      <p>elizabot.js v1.1 © Norbert Landsteiner 2005 (free software, www.masswerk.at). Node packaging: elizabot npm (Tomas Kafka). {t('credits.elizaMod')}</p>
      <p>{t('credits.elizaKo')}</p>
      <h2>{t('room.markov.name')}</h2>
      <p>{t('credits.markov')}</p>
      <ul>
        <li>Lewis Carroll, <i>Alice’s Adventures in Wonderland</i> (1865) — Project Gutenberg eBook #11</li>
        <li>Jacob &amp; Wilhelm Grimm, <i>Grimms’ Fairy Tales</i>, tr. Edgar Taylor &amp; Marian Edwardes — Project Gutenberg eBook #2591 (12 tales)</li>
        <li>현진건 「운수 좋은 날」(1924), 「B사감과 러브레터」(1925), 「술 권하는 사회」(1921) — 위키문헌</li>
        <li>김유정 「동백꽃」(1936) — 위키문헌</li>
        <li>이효석 「메밀꽃 필 무렵」(1936) — 위키문헌</li>
        <li>이상 「날개」(1936) — 위키문헌</li>
      </ul>
      <h2>GPT-2 (2019)</h2>
      <p>OpenAI GPT-2 small (2019), MIT license. ONNX conversion: Xenova (Hugging Face). Runs in your browser with Transformers.js (Hugging Face, Apache-2.0) and ONNX Runtime Web (Microsoft, MIT).</p>
      <p>{t('credits.kogpt2')} SK Telecom, KoGPT2 — https://github.com/SKT-AI/KoGPT2</p>
      <h2>{t('credits.fonts')}</h2>
      <p>IBM Plex Mono (SIL OFL 1.1) · Nanum Gothic Coding (SIL OFL 1.1)</p>
      <h2>{t('credits.made')}</h2>
      <p>{t('credits.madeBy')}</p>
      <p className="meta">{t('credits.privacy')}</p>
    </main>
  );
}

export function App() {
  const lang = useLang();
  const route = useRoute();
  const stats = useStats();
  useEffect(() => { document.documentElement.lang = lang; document.title = `${t('title')} — ${t('subtitle.short')}`; }, [lang]);
  useEffect(() => { void loadStats(); installReporter(); }, []);
  useEffect(() => {
    if (stats && !stats.v) return;
    if (stats && typeof stats.visitors === 'number') updateProgress((p) => (p.visitorNo ? p : { ...p, visitorNo: stats.visitors + 1 }));
  }, [stats]);

  if (route.name === 'room' && (ROOMS as string[]).includes(route.room)) return <Room room={route.room as RoomId} />;
  if (route.name === 'mission') {
    const m = missionById(route.id);
    // 풀 미션(오늘의 도전·끝없는 도전)을 공유 링크로 열면 뒤로 가기는 로비로
    if (m) return <MissionView key={`${m.id}|${lang}`} mission={m} lang={lang} launch={takeLaunch(m.id)} frame={m.set ? { back: { label: t('to.lobby'), go: () => go('') } } : undefined} />;
  }
  if (route.name === 'daily') return <DailyView key={`${route.n ?? 'today'}|${lang}`} n={route.n} />;
  if (route.name === 'archive') return <Archive />;
  if (route.name === 'endless') return <Endless key={lang} />;
  if (route.name === 'ending') return <Ending />;
  if (route.name === 'credits') return <Credits />;
  return <Lobby />;
}
