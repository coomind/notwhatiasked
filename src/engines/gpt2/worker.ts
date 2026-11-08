/// <reference lib="webworker" />
// GPT-2 를 브라우저 Web Worker 에서 돌린다(화면 멈춤 방지). 결정론을 위해 WASM 백엔드·스레드 1개로 고정(WebGPU 안 씀).
import { pipeline, env, type TextGenerationPipeline } from '@huggingface/transformers';
import { GPT2_MODELS, GEN_OPTIONS, redact } from './shared';
import { FILTERS } from './filters';

env.allowLocalModels = false;
const wasm = env.backends?.onnx?.wasm as { numThreads?: number; proxy?: boolean } | undefined;
if (wasm) { wasm.numThreads = 1; wasm.proxy = false; }

const pipes = new Map<string, Promise<TextGenerationPipeline>>();

function load(locale: string): Promise<TextGenerationPipeline> {
  let p = pipes.get(locale);
  if (p) return p;
  const m = GPT2_MODELS[locale];
  if (!m) return Promise.reject(new Error('no model for ' + locale));
  const files = new Map<string, { loaded: number; total: number }>();
  p = pipeline('text-generation', m.model, {
    dtype: m.dtype as 'q8',
    model_file_name: m.model_file_name,
    device: 'wasm',
    progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status === 'progress' && e.file) {
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        postMessage({ type: 'progress', locale, loaded, total });
      }
    },
  } as never) as unknown as Promise<TextGenerationPipeline>;
  pipes.set(locale, p);
  p.catch(() => pipes.delete(locale));
  return p;
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as { type: 'load' | 'gen'; id: number; locale: string; prompt?: string };
  try {
    const gen = await load(msg.locale);
    if (msg.type === 'load') { postMessage({ type: 'ready', id: msg.id, locale: msg.locale }); return; }
    const out = (await gen(msg.prompt ?? '', { ...GEN_OPTIONS, return_full_text: false } as never)) as { generated_text: string }[];
    postMessage({ type: 'result', id: msg.id, text: redact(out[0].generated_text, FILTERS) });
  } catch (e) {
    postMessage({ type: 'error', id: msg.id, message: (e as Error).message ?? String(e) });
  }
};
