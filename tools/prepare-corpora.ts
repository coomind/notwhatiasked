/**
 * 1회용: 내려받은 퍼블릭 도메인 원문(구텐베르크 txt, 위키문헌 raw)을 정리해 content/corpora/<locale>/*.txt 로 저장한다.
 * 사용: npx tsx tools/prepare-corpora.ts <내려받은-폴더>
 * 내려받은 파일은 데이터로만 읽는다(실행하지 않음). 출처는 content/corpora/README.md 에 적는다.
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) { console.error('usage: tsx tools/prepare-corpora.ts <download-dir>'); process.exit(1); }
const out = path.resolve('content/corpora');

function gutenbergBody(t: string): string {
  t = t.replace(/\r/g, '');
  const s = t.indexOf('*** START OF');
  const e = t.indexOf('*** END OF');
  return t.slice(t.indexOf('\n', s) + 1, e);
}

function cleanEnglish(t: string): string {
  return t
    .replace(/^\s*CHAPTER [IVXL]+\.?.*$/gm, '')
    .replace(/^\s*\*(\s+\*)+\s*$/gm, '')
    .replace(/_/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Alice
{
  let t = gutenbergBody(fs.readFileSync(path.join(src, 'alice.txt'), 'utf8'));
  // 목차 건너뛰기: 본문 1장 시작부터
  const i = t.indexOf('Alice was beginning to get very tired');
  t = t.slice(i);
  fs.mkdirSync(path.join(out, 'en'), { recursive: true });
  fs.writeFileSync(path.join(out, 'en', 'alice.txt'), cleanEnglish(t) + '\n');
}

// Grimm (선택한 이야기만)
{
  const t = gutenbergBody(fs.readFileSync(path.join(src, 'grimm.txt'), 'utf8'));
  const lines = t.split('\n');
  const titleIdx: { title: string; line: number }[] = [];
  lines.forEach((l, i) => { if (/^[A-Z][A-Z ,'-]+$/.test(l.trim()) && l.trim().length > 3 && lines[i - 1]?.trim() === '' ) titleIdx.push({ title: l.trim(), line: i }); });
  const want = ['HANSEL AND GRETEL', 'RAPUNZEL', 'RUMPELSTILTSKIN', 'THE FROG-PRINCE', 'BRIAR ROSE', 'ASHPUTTEL',
    'THE GOLDEN GOOSE', 'THE TRAVELLING MUSICIANS', 'THE ELVES AND THE SHOEMAKER', 'THE WOLF AND THE SEVEN LITTLE KIDS',
    'SNOWDROP', 'THE FISHERMAN AND HIS WIFE'];
  const parts: string[] = [];
  for (const w of want) {
    const k = titleIdx.findIndex((x) => x.title === w);
    if (k < 0) throw new Error('tale not found: ' + w);
    const end = titleIdx[k + 1]?.line ?? lines.length;
    parts.push(lines.slice(titleIdx[k].line + 1, end).join('\n'));
  }
  fs.writeFileSync(path.join(out, 'en', 'grimm.txt'), cleanEnglish(parts.join('\n\n')) + '\n');
}

// 한국어 위키문헌
function cleanWiki(t: string): string {
  t = t.replace(/\r/g, '');
  // 머리말 등 틀 제거(중첩 단순 처리)
  for (let i = 0; i < 5; i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
  t = t
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[분류:[^\]]*\]\]/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/^=+.*=+\s*$/gm, '')
    .replace(/'''?/g, '')
    .replace(/[🙝🙟]/gu, '')
    .replace(/^[ \t]*[:*#]+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  return t.trim();
}
const koWorks: [string, string][] = [
  ['ko_운수_좋은_날.txt', 'unsu.txt'],
  ['ko_B사감과_러브레터.txt', 'bsagam.txt'],
  ['ko_술_권하는_사회.txt', 'sul.txt'],
  ['ko_동백꽃.txt', 'dongbaek.txt'],
  ['ko_메밀꽃_필_무렵.txt', 'memil.txt'],
  ['ko_날개.txt', 'nalgae.txt'],
];
fs.mkdirSync(path.join(out, 'ko'), { recursive: true });
for (const [from, to] of koWorks) {
  const t = cleanWiki(fs.readFileSync(path.join(src, from), 'utf8'));
  if (t.length < 2000) throw new Error('too short: ' + from);
  fs.writeFileSync(path.join(out, 'ko', to), t + '\n');
}
for (const l of ['en', 'ko']) for (const f of fs.readdirSync(path.join(out, l))) console.log(l, f, fs.statSync(path.join(out, l, f)).size);
