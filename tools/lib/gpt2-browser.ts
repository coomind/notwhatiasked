/**
 * '브라우저와 똑같은' GPT-2: 헤드리스 Chrome(시스템 설치본)에서 이 게임의 GPT-2 워커(WASM·스레드 1개)를 그대로 돌린다.
 * Node의 onnxruntime-node(CPU)는 양자화 모델의 근소한 동점에서 브라우저 WASM과 다른 토큰을 고를 때가 있어(18개 중 4개 다름, 작업노트 참고),
 * 해법 탐색과 test:missions 는 플레이어가 실제로 쓰는 이 경로를 기준으로 삼는다.
 * 모델(128MB)은 OS 임시 폴더의 브라우저 프로필 캐시에 한 번만 받는다(OneDrive 동기화 폴더 밖).
 */
import path from 'node:path';
import os from 'node:os';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { preview } from 'vite';

export interface BrowserGpt2 { gen: (prompt: string) => Promise<string>; close: () => Promise<void> }

export async function createBrowserGpt2(locale = 'en'): Promise<BrowserGpt2> {
  // 빌드된 dist 를 띄운다(개발 서버는 의존성 최적화로 페이지를 새로고침해 버림). dist 가 없으면 빌드
  if (!fs.existsSync(path.resolve('dist/index.html'))) execSync('npx vite build', { stdio: 'ignore' });
  const server = await preview({ configFile: path.resolve('vite.config.ts'), preview: { port: 0, strictPort: false }, logLevel: 'error' });
  const url = server.resolvedUrls?.local[0] ?? 'http://localhost:4173/';
  const ctx: BrowserContext = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'notwhatiasked-chrome-profile', 'tools'), { channel: 'chrome', headless: true });
  const page: Page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${url}?lang=en`);
  await page.waitForFunction(() => !!(window as unknown as { __nwia?: unknown }).__nwia, undefined, { timeout: 120_000 });
  await page.evaluate(async (l) => { await (window as unknown as { __nwia: { loadGpt2: (l: string) => Promise<void> } }).__nwia.loadGpt2(l); }, locale);
  return {
    gen: (prompt: string) => page.evaluate(async ([l, p]) => (window as unknown as { __nwia: { gpt2Generate: (l: string, p: string) => Promise<string> } }).__nwia.gpt2Generate(l, p), [locale, prompt] as const),
    close: async () => { await ctx.close(); await new Promise<void>((r) => server.httpServer.close(() => r())); },
  };
}
