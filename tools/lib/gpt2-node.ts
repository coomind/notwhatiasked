// Node에서 GPT-2 실행(해법 탐색·미션 테스트용). 브라우저 워커와 같은 모델·설정·필터.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from '@huggingface/transformers';
import { GPT2_MODELS, GEN_OPTIONS, compileFilter, redact } from '../../src/engines/gpt2/shared';

const filterDir = path.resolve('content/filters');
const FILTERS = fs.readdirSync(filterDir).filter((f) => f.endsWith('.txt')).map((f) => compileFilter(fs.readFileSync(path.join(filterDir, f), 'utf8'), f === 'en.txt'));

export async function createNodeGpt2(locale = 'en'): Promise<(prompt: string) => Promise<string>> {
  const m = GPT2_MODELS[locale];
  const gen = await pipeline('text-generation', m.model, { dtype: m.dtype as 'q8', model_file_name: m.model_file_name, device: 'cpu' } as never);
  return async (prompt: string) => {
    const out = (await gen(prompt, { ...GEN_OPTIONS, return_full_text: false } as never)) as { generated_text: string }[];
    return redact(out[0].generated_text, FILTERS);
  };
}
