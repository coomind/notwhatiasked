import { defineConfig } from '@playwright/test';

// 시스템 Chrome 사용(브라우저 내려받기 없음). E2E_URL 을 주면 배포 주소에서 돈다.
const url = process.env.E2E_URL ?? 'http://localhost:4173';
export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: url, channel: 'chrome', locale: 'en-US', trace: 'off' },
  webServer: process.env.E2E_URL ? undefined : { command: 'npx vite preview --port 4173 --strictPort', url, reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'mobile', use: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
