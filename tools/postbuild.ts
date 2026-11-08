/**
 * 빌드 뒤: 언어별 입구 페이지(/ko/ 등)를 만든다. 링크 미리보기(OG)는 크롤러가 언어를 안 보내므로
 * 기본 주소(/)는 영어 OG, /<lang>/ 는 그 언어 OG + 그 언어로 시작. 공유 링크 자체에는 lang 을 넣지 않는다.
 * 새 언어 = content/i18n/<lang>.json 의 og.* 값 + public/og-<lang>.png 만 있으면 자동.
 */
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const base = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const site = 'https://notwhatiasked.pages.dev';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

for (const f of fs.readdirSync('content/i18n')) {
  const lang = f.replace('.json', '');
  if (lang === 'en') continue;
  const d = JSON.parse(fs.readFileSync(path.join('content/i18n', f), 'utf8')) as Record<string, string>;
  const img = fs.existsSync(path.join('public', `og-${lang}.png`)) ? `${site}/og-${lang}.png` : `${site}/og-en.png`;
  const title = `${d.title} — ${d['subtitle.short']}`;
  const html = base
    .replace('<html lang="en">', `<html lang="${lang}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(d.subtitle)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(d.subtitle)}`)
    .replace(/(<meta property="og:site_name" content=")[^"]*/, `$1${esc(d.title)}`)
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${img}`);
  fs.mkdirSync(path.join(dist, lang), { recursive: true });
  fs.writeFileSync(path.join(dist, lang, 'index.html'), html);
  console.log(`postbuild: dist/${lang}/index.html`);
}
