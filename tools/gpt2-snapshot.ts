// e2e/gpt2-snapshot.json 만들기: 별도 헤드리스 Chrome 세션에서 GPT-2 출력을 기록(E2E가 다른 세션 출력과 글자 단위로 비교)
import fs from 'node:fs';
import { createBrowserGpt2 } from './lib/gpt2-browser';
import { GPT2_PROMPTS } from '../e2e/gpt2-prompts';

const g = await createBrowserGpt2('en');
const out: { prompt: string; out: string }[] = [];
for (const p of GPT2_PROMPTS) out.push({ prompt: p, out: await g.gen(p) });
await g.close();
fs.writeFileSync('e2e/gpt2-snapshot.json', JSON.stringify(out, null, 2) + '\n');
console.log(`e2e/gpt2-snapshot.json: ${out.length} prompts`);
