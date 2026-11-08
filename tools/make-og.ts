/**
 * OG 이미지(1200×630) 만들기: 글자·배경색·테두리만으로 된 HTML을 시스템 Chrome으로 찍는다.
 *   npx tsx tools/make-og.ts  → public/og-en.png, public/og-ko.png
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const font = (pkg: string, file: string) => 'data:font/woff2;base64,' + fs.readFileSync(path.resolve('node_modules/@fontsource', pkg, 'files', file)).toString('base64');
const plex = font('ibm-plex-mono', 'ibm-plex-mono-latin-700-normal.woff2');

const pages: Record<string, { title: string; sub: string; lines: [string, string][] }> = {
  en: { title: 'Not What I Asked', sub: 'Make vintage AIs say the word — without typing it.', lines: [['1966', 'ELIZA'], ['1980s', 'Markov chain'], ['2019', 'GPT-2']] },
  ko: { title: '아니 그거 말고', sub: '옛날 AI한테 원하는 말 시키기. 단, 그 말은 입력 금지.', lines: [['1966', 'ELIZA'], ['1980s', '마르코프 체인'], ['2019', 'GPT-2']] },
};

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const [lang, p] of Object.entries(pages)) {
    const html = `<!doctype html><meta charset=utf-8><style>
@font-face{font-family:Plex;src:url(${plex});font-weight:700}
body{margin:0;width:1200px;height:630px;background:#f1e8c9;color:#22201a;font-family:Plex,"Nanum Gothic Coding","Malgun Gothic",monospace;display:flex;flex-direction:column;justify-content:center;padding:0 80px;box-sizing:border-box;border:18px solid #22201a}
h1{font-size:${lang === 'ko' ? 96 : 88}px;margin:0 0 10px;letter-spacing:-2px}
p{font-size:32px;margin:0 0 40px}
.row{display:flex;gap:0;font-size:30px;font-weight:700;white-space:nowrap}
.row div{border:4px solid #22201a;padding:12px 22px;margin-right:-4px}
.row div:nth-child(2){background:#061006;color:#5cff7a}
.row div:nth-child(3){background:#fff}
.taboo{position:absolute;right:110px;top:90px;transform:rotate(-8deg);border:6px solid #a3271f;color:#a3271f;font-size:40px;font-weight:700;padding:6px 18px}
</style><div class=taboo>${lang === 'ko' ? '입력 금지' : 'FORBIDDEN'}</div><h1>${p.title}</h1><p>${p.sub}</p><div class=row>${p.lines.map(([y, n]) => `<div>${y} · ${n}</div>`).join('')}</div>`;
    await page.setContent(html);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve('public', `og-${lang}.png`) });
    console.log('wrote', `public/og-${lang}.png`);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
