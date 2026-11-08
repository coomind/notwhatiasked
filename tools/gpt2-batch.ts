// 프롬프트 목록(JSON 파일) → Node GPT-2 출력 목록(JSON, stdout). E2E 비교 테스트용.
import fs from 'node:fs';
import { createNodeGpt2 } from './lib/gpt2-node';
const prompts = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as string[];
const gen = await createNodeGpt2('en');
const out: string[] = [];
for (const p of prompts) out.push(await gen(p));
process.stdout.write('\n@@JSON@@' + JSON.stringify(out));
