/**
 * 빌드 전 데이터 생성 (npm run data, build 때 자동):
 *  - content/corpora/<locale>/*.txt → src/generated/markov-<locale>.json (토큰 배열)
 *  - src/generated/server-data.ts : Functions(서버 리플레이 검증)가 정적으로 import 할 데이터 목록
 * 새 언어 추가 = content 아래에 데이터 파일만 넣고 다시 빌드. 코드 수정 없음.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tokenize } from '../src/engines/markov/markov';

const root = process.cwd();
const gen = path.join(root, 'src/generated');
fs.mkdirSync(gen, { recursive: true });

const corpusLocales = fs.readdirSync(path.join(root, 'content/corpora'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const loc of corpusLocales) {
  const dir = path.join(root, 'content/corpora', loc);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  const vocab: string[] = [];
  const idx = new Map<string, number>();
  const t: number[] = [];
  for (const f of files) {
    for (const w of tokenize(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      let i = idx.get(w);
      if (i === undefined) { i = vocab.length; vocab.push(w); idx.set(w, i); }
      t.push(i);
    }
  }
  fs.writeFileSync(path.join(gen, `markov-${loc}.json`), JSON.stringify({ v: vocab, t }));
  console.log(`markov-${loc}: ${t.length} tokens, ${vocab.length} types`);
}

const elizaLocales = fs.readdirSync(path.join(root, 'content/eliza')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const missionFiles: string[] = [];
for (const loc of fs.readdirSync(path.join(root, 'content/missions')).sort()) {
  for (const f of fs.readdirSync(path.join(root, 'content/missions', loc)).sort()) if (f.endsWith('.json')) missionFiles.push(`${loc}/${f}`);
}

const lines: string[] = ['// 자동 생성: tools/build-data.ts — 직접 고치지 마세요', "import type { MarkovModel } from '../engines/markov/markov';", "import type { AggluData } from '../engines/eliza/agglu';", "import type { Mission } from '../core/types';"];
corpusLocales.forEach((l, i) => lines.push(`import markov${i} from './markov-${l}.json';`));
elizaLocales.forEach((l, i) => lines.push(`import eliza${i} from '../../content/eliza/${l}.json';`));
missionFiles.forEach((f, i) => lines.push(`import missions${i} from '../../content/missions/${f}';`));
lines.push(`export const markovModels: Record<string, MarkovModel> = { ${corpusLocales.map((l, i) => `${JSON.stringify(l)}: markov${i} as MarkovModel`).join(', ')} };`);
lines.push(`export const elizaData: Record<string, AggluData> = { ${elizaLocales.map((l, i) => `${JSON.stringify(l)}: eliza${i} as unknown as AggluData`).join(', ')} };`);
lines.push(`export const allMissions: Mission[] = [${missionFiles.map((_, i) => `...(missions${i} as unknown as Mission[])`).join(', ')}];`);
fs.writeFileSync(path.join(gen, 'server-data.ts'), lines.join('\n') + '\n');
console.log(`server-data: ${missionFiles.length} mission files, eliza: ${elizaLocales.join(',')}`);
