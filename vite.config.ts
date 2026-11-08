import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** 미션 JSON에서 개발자 해법(solution)을 지운다 → 클라이언트 번들에 정답이 안 들어감 */
function stripSolutions(): Plugin {
  return {
    name: 'nwia-strip-solutions',
    enforce: 'pre',
    transform(code, id) {
      if (process.env.VITEST) return null; // 테스트는 해법이 필요함
      if (!/[\\/]content[\\/]missions[\\/].+\.json$/.test(id.split('?')[0])) return null;
      const arr = JSON.parse(code) as Record<string, unknown>[];
      for (const m of arr) delete m.solution;
      return { code: JSON.stringify(arr), map: null };
    },
  };
}

/**
 * onnxruntime-web 의 .wasm(약 26MB)이 번들에 복사되는 걸 막는다. Cloudflare Pages 파일 한도(25MiB)를 넘고,
 * 실제로는 transformers.js 가 같은 버전의 wasm 을 jsDelivr CDN에서 받는다(env.backends.onnx.wasm.wasmPaths).
 */
function dropOrtWasm(): Plugin {
  return {
    name: 'nwia-drop-ort-wasm',
    apply: 'build',
    generateBundle(_o, bundle) {
      for (const k of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(k)) delete bundle[k];
    },
  };
}

export default defineConfig({
  plugins: [react(), stripSolutions(), dropOrtWasm()],
  worker: { format: 'es' },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
} as never);
