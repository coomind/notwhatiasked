// 공유 카드(PNG, 브라우저에서 캔버스로 그림·서버 저장 없음)와 공유 링크·문구.
import type { Mission, PlayMode, RoomId } from '../core/types';
import { encodeInputs } from '../core/codec';
import { t, loc } from './i18n';

export interface CardTurn { input: string; reply: string }
export interface CardInfo {
  mission: Mission;
  play: PlayMode;
  cleared: boolean;
  attempts: number;
  chars: number;
  turns: CardTurn[];
  topPct?: number | null;
  lang: string;
}

const THEME: Record<RoomId, { bg: string; fg: string; dim: string; accent: string; font: string; upper: boolean }> = {
  eliza: { bg: '#f4efe1', fg: '#1d1b16', dim: '#6b6455', accent: '#a3271f', font: '"IBM Plex Mono", "Nanum Gothic Coding", monospace', upper: true },
  markov: { bg: '#071108', fg: '#5cff7a', dim: '#2f8f45', accent: '#b6ffc2', font: '"IBM Plex Mono", "Nanum Gothic Coding", monospace', upper: false },
  gpt2: { bg: '#ffffff', fg: '#1f2328', dim: '#6e7781', accent: '#0b57d0', font: '"IBM Plex Mono", "Nanum Gothic Coding", monospace', upper: false },
};

export function shareUrl(m: Mission, play: PlayMode, inputs: string[]): string {
  const base = `${location.origin}/`;
  if (play === 'challenge') return `${base}?m=${encodeURIComponent(m.id)}&c=1`;
  return `${base}?m=${encodeURIComponent(m.id)}&r=${encodeInputs(inputs)}`;
}

export function aiName(room: RoomId, lang: string): string { return t(`ai.${room}`, undefined, lang); }

export function shareText(c: CardInfo): string {
  const vars = { ai: aiName(c.mission.room, c.lang), target: c.mission.target, n: c.attempts, pct: c.topPct ?? '' };
  if (!c.cleared) return t('share.fail', vars, c.lang);
  if (c.play === 'challenge' && c.topPct) return t('share.challengeTop', vars, c.lang);
  return t('share.clear', vars, c.lang);
}

/** 도전모드는 입력을 가린다(스포일러 방지) */
export const mask = (s: string) => '■'.repeat(Math.max(3, Math.min(8, Math.ceil(s.length / 3))));

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of Array.from(para)) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        const sp = line.lastIndexOf(' ');
        if (sp > line.length * 0.5) { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { out.push(line); line = ch; }
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/** 1080×1350 카드. 그 전시실 스킨 그대로: 대화 + 제목 + 기록 */
export async function drawCard(c: CardInfo): Promise<Blob | null> {
  const W = 1080, H = 1350, P = 72;
  const th = THEME[c.mission.room];
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  try { await document.fonts?.ready; } catch { /* */ }
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  if (c.mission.room === 'markov') { // 스캔라인
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  }
  if (c.mission.room === 'eliza') { // 연속 용지 줄무늬 + 구멍 자리
    ctx.fillStyle = 'rgba(120,160,110,0.10)';
    for (let y = 0; y < H; y += 120) ctx.fillRect(0, y, W, 60);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 30; y < H; y += 60) { ctx.beginPath(); ctx.arc(26, y, 9, 0, 7); ctx.arc(W - 26, y, 9, 0, 7); ctx.fill(); }
  }
  let y = P;
  ctx.fillStyle = th.dim;
  ctx.font = `600 30px ${th.font}`;
  ctx.fillText(`${t('title', undefined, c.lang)} · ${aiName(c.mission.room, c.lang)}`, P, y);
  y += 56;
  ctx.fillStyle = th.fg;
  ctx.font = `700 46px ${th.font}`;
  for (const l of wrap(ctx, loc(c.mission.title, c.lang), W - 2 * P)) { ctx.fillText(l, P, y); y += 58; }
  y += 18;
  // 대화(마지막 몇 턴)
  const fs = 36, lh = 50;
  ctx.font = `400 ${fs}px ${th.font}`;
  const turns = c.cleared ? c.turns.slice(-3) : [pickFunniest(c.turns)].filter(Boolean) as CardTurn[];
  const lines: { s: string; color: string; bold?: boolean }[] = [];
  for (const tr of turns) {
    const inp = c.play === 'challenge' ? mask(tr.input) : tr.input;
    const label = c.mission.room === 'gpt2' ? 'In: ' : '> ';
    for (const l of wrap(ctx, label + inp, W - 2 * P)) lines.push({ s: l, color: th.dim });
    const rep = th.upper ? tr.reply.toUpperCase() : tr.reply;
    for (const l of wrap(ctx, (c.mission.room === 'gpt2' ? 'Out: ' : '') + rep, W - 2 * P)) lines.push({ s: l, color: th.fg, bold: true });
    lines.push({ s: '', color: th.fg });
  }
  const maxLines = Math.floor((H - y - 330) / lh);
  for (const l of lines.slice(-maxLines)) {
    ctx.fillStyle = l.color;
    ctx.font = `${l.bold ? 600 : 400} ${fs}px ${th.font}`;
    ctx.fillText(l.s, P, y); y += lh;
  }
  // 결과
  y = H - 300;
  ctx.fillStyle = th.accent;
  ctx.font = `800 64px ${th.font}`;
  if (c.cleared) {
    ctx.fillText(t('card.cleared', { n: c.attempts }, c.lang), P, y);
    y += 60;
    ctx.font = `500 34px ${th.font}`;
    ctx.fillStyle = th.fg;
    const sub = c.play === 'challenge' ? [t('card.challenge', undefined, c.lang), c.topPct ? t('card.top', { pct: c.topPct }, c.lang) : ''].filter(Boolean).join(' · ') : t('card.casual', { chars: c.chars }, c.lang);
    ctx.fillText(sub, P, y);
  } else {
    // "아니 그거 말고" 도장
    ctx.save();
    ctx.translate(W - P - 230, y - 20);
    ctx.rotate(-0.12);
    ctx.strokeStyle = th.accent; ctx.lineWidth = 8;
    ctx.font = `900 52px ${th.font}`;
    const stamp = t('title', undefined, c.lang);
    const sw = ctx.measureText(stamp).width;
    ctx.strokeRect(-sw / 2 - 26, -62, sw + 52, 90);
    ctx.fillStyle = th.accent;
    ctx.textAlign = 'center';
    ctx.fillText(stamp, 0, 0);
    ctx.restore();
    ctx.font = `500 34px ${th.font}`;
    ctx.fillStyle = th.fg;
    ctx.fillText(t('card.failed', { target: c.mission.target }, c.lang), P, y + 70);
  }
  ctx.fillStyle = th.dim;
  ctx.font = `500 30px ${th.font}`;
  ctx.fillText(t('card.cta', undefined, c.lang), P, H - P - 42);
  ctx.fillText(location.host || 'notwhatiasked.pages.dev', P, H - P);
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

/** 실패 카드에 쓸 '가장 웃긴 대답': 반복이 가장 심하거나 가장 긴 것 */
export function pickFunniest(turns: CardTurn[]): CardTurn | undefined {
  let best: CardTurn | undefined, score = -1;
  for (const tr of turns) {
    const words = tr.reply.toLowerCase().split(/\s+/).filter(Boolean);
    const rep = words.length - new Set(words).size;
    const s = rep * 3 + tr.reply.length / 10;
    if (s > score) { score = s; best = tr; }
  }
  return best;
}

export async function shareCard(c: CardInfo, url: string): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob = await drawCard(c);
  const text = shareText(c);
  const file = blob ? new File([blob], `notwhatiasked-${c.mission.id}.png`, { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text} ${url}` });
      return 'shared';
    }
  } catch (e) { if ((e as Error).name === 'AbortError') return 'failed'; }
  if (blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notwhatiasked-${c.mission.id}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  try { await navigator.clipboard?.writeText(`${text} ${url}`); } catch { /* */ }
  return blob ? 'downloaded' : 'failed';
}

export async function copyLink(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
