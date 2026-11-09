// 오늘의 도전(매일 새 문제) · 지난 도전 · 끝없는 도전(목숨 3개)
import { useEffect, useState } from 'react';
import { t, loc, useLang } from './i18n';
import { missionById } from './content';
import { useProgress, getProgress, updateProgress } from './store';
import { go } from './router';
import { MissionView } from './Mission';
import { copyLink } from './share';
import { dayNumber, msToNextDay, fmtCountdown, poolLocale, dailyMission, endlessList, endlessOrder, freshSeed } from './pool';

const LIVES = 3;

/** 1초마다 '다음 문제까지' 시간을 다시 그림(자정이 지나면 오늘 번호도 바뀜) */
function useCountdown(): string {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  return fmtCountdown(msToNextDay());
}

/** 로비 맨 위 두 장: 오늘의 도전 / 끝없는 도전 */
export function PlayCards() {
  const lang = useLang();
  const p = useProgress();
  const left = useCountdown();
  const locale = poolLocale(lang, p.original);
  const today = dayNumber();
  const m = dailyMission(today, locale);
  const count = endlessList(locale).length;
  if (!m) return null;
  const c = p.cleared[m.id];
  const best = p.endlessBest?.[locale] ?? 0;
  return (
    <section className="play-cards" aria-label={`${t('daily.lobby')} · ${t('endless.lobby')}`}>
      <button className="pcard daily" onClick={() => go('d')}>
        <span className="pk">#{today} · {t(`ai.${m.room}`)}</span>
        <span className="pt">{t('daily.lobby')}</span>
        <span className="ps">{c ? `${t('daily.done', { n: c.attempts })} · ${t('daily.next', { time: left })}` : t('daily.sub')}</span>
      </button>
      {count > 0 && (
        <button className="pcard endless" onClick={() => go('endless')}>
          <span className="pk">{t('endless.count', { n: count })}{best ? ` · ${t('endless.best', { n: best })}` : ''}</span>
          <span className="pt">{t('endless.lobby')}</span>
          <span className="ps">{t('endless.sub')}</span>
        </button>
      )}
      <button className="link" onClick={() => go('archive')}>{t('daily.archive')} →</button>
    </section>
  );
}

export function DailyView({ n }: { n?: number }) {
  const lang = useLang();
  const p = useProgress();
  const left = useCountdown();
  const today = dayNumber();
  const notYet = !!n && n > today;
  const day = n && n <= today ? n : today;
  const m = dailyMission(day, poolLocale(lang, p.original));
  if (!m) { go(''); return null; }
  return (
    <MissionView key={`${m.id}|${lang}`} mission={m} lang={lang} launch={null} frame={{
      label: t('daily.title', { n: day }),
      daily: day,
      top: notYet ? <p className="notice">{t('daily.notYet')}</p> : undefined,
      back: { label: t('to.lobby'), go: () => go('') },
      actions: (o, again) => (
        <>
          {day === today && <p className="meta countdown">{t('daily.next', { time: left })}</p>}
          {o === 'failed' && <button className="primary" onClick={again}>{t('again')}</button>}
          <button className={o === 'cleared' ? 'primary' : ''} onClick={() => go('endless')}>{t('daily.toEndless')} →</button>
          <button onClick={() => go('archive')}>{t('daily.archive')}</button>
        </>
      ),
    }} />
  );
}

export function Archive() {
  const lang = useLang();
  const p = useProgress();
  const locale = poolLocale(lang, p.original);
  const today = dayNumber();
  const days = Array.from({ length: today }, (_, i) => today - i);
  return (
    <main className="room archive">
      <button className="link" onClick={() => go('')}>← {t('to.lobby')}</button>
      <h1>{t('daily.archive')}</h1>
      <p className="meta">{t('daily.archiveSub')}</p>
      <ol className="missions">
        {days.map((n) => {
          const m = dailyMission(n, locale);
          if (!m) return null;
          const c = p.cleared[m.id];
          return (
            <li key={n}>
              <button className="mrow" onClick={() => go(`d/${n}`)}>
                <span className="no">#{n}</span>
                <span className="mt">{loc(m.title, lang)}</span>
                <span className="ms">{t(`ai.${m.room}`)}{c ? ` · ✓ ${t('room.clearedIn', { n: c.attempts })}` : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

interface Run { order: string[]; i: number; score: number; lives: number; key: number; bestBefore: number }

export function Endless() {
  const lang = useLang();
  const p = useProgress();
  const locale = poolLocale(lang, p.original);
  const start = (): Run => ({ order: endlessOrder(locale, getProgress().cleared, freshSeed()), i: 0, score: 0, lives: LIVES, key: 0, bestBefore: getProgress().endlessBest?.[locale] ?? 0 });
  const [run, setRun] = useState<Run>(start);
  const [state, setState] = useState<null | 'cleared' | 'failed'>(null);
  const [showOver, setShowOver] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (run.score > (getProgress().endlessBest?.[locale] ?? 0)) updateProgress((x) => ({ ...x, endlessBest: { ...x.endlessBest, [locale]: run.score } }));
  }, [run.score, locale]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id); }, [toast]);

  const m = run.order.length ? missionById(run.order[run.i % run.order.length]) : undefined;
  if (!m) return <main className="room"><button className="link" onClick={() => go('')}>← {t('to.lobby')}</button><p>{t('endless.empty')}</p></main>;

  const next = () => { setState(null); setRun((r) => ({ ...r, i: r.i + 1, key: r.key + 1 })); };
  const skip = () => {
    setState(null);
    setRun((r) => ({ ...r, lives: r.lives - 1, i: r.i + 1, key: r.key + 1 }));
    if (run.lives - 1 <= 0) setShowOver(true);
  };
  const restart = () => { setState(null); setShowOver(false); setRun(start()); };
  const hearts = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(LIVES - Math.max(0, run.lives));

  if (showOver) {
    const text = t('endless.shareText', { n: run.score });
    const url = `${location.origin}/?e=1`;
    return (
      <main className="ending endless-over">
        <p className="year">{t('endless.lobby')}</p>
        <h1>{t('endless.over', { n: run.score })}</h1>
        {run.score > run.bestBefore && run.score > 0 && <p className="big">{t('endless.newBest')}</p>}
        <p className="meta">{t('endless.best', { n: Math.max(run.score, run.bestBefore) })}</p>
        <div className="actions">
          <button className="primary" onClick={restart}>{t('endless.again')}</button>
          <button onClick={async () => {
            try { if (navigator.share) { await navigator.share({ text, url }); return; } } catch { return; }
            setToast((await copyLink(`${text} ${url}`)) ? t('share.copied') : `${text} ${url}`);
          }}>{t('endless.share')}</button>
          <button onClick={() => go('')}>{t('to.lobby')}</button>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    );
  }

  return (
    <MissionView key={`${m.id}|${run.key}`} mission={m} lang={lang} launch={null} frame={{
      label: t('endless.lobby'),
      casualOnly: true,
      noShare: true,
      back: { label: t('to.lobby'), go: () => go('') },
      top: (
        <div className="endless-bar" role="status">
          <span>{t('endless.status', { score: run.score, lives: hearts })}</span>
          {!state && <button className="link" onClick={skip}>{t('endless.skip')}</button>}
        </div>
      ),
      onOutcome: (o) => {
        setState(o);
        if (o === 'cleared') setRun((r) => ({ ...r, score: r.score + 1 }));
        else setRun((r) => ({ ...r, lives: r.lives - 1 }));
      },
      actions: (o, again) => o === 'cleared'
        ? <button className="primary" onClick={next}>{t('endless.next')} →</button>
        : run.lives <= 0
          ? <button className="primary" onClick={() => setShowOver(true)}>{t('endless.over', { n: run.score })} →</button>
          : (
            <>
              <p className="meta">{t('endless.lost')}</p>
              <button className="primary" onClick={() => { setState(null); again(); }}>{t('endless.retry')}</button>
              <button onClick={next}>{t('endless.next')} →</button>
            </>
          ),
    }} />
  );
}
