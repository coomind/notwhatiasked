/**
 * npm run deploy: 빌드 → 테스트 전부(test, test:missions) → Cloudflare Pages(notwhatiasked) 배포.
 * E2E 는 시간이 오래 걸려(GPT-2 모델 128MB) 따로 `npm run e2e` 로 돌린 뒤 배포한다(작업노트 참고).
 * Functions(functions/)는 wrangler 가 같이 묶어 올린다. 바인딩은 wrangler.toml.
 */
import { spawnSync } from 'node:child_process';

const win = process.platform === 'win32';
const run = (cmd: string, args: string[]) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(win ? `${cmd}.cmd` : cmd, args, { stdio: 'inherit', shell: win });
  if (r.status !== 0) { console.error(`✗ 실패: ${cmd} ${args.join(' ')}`); process.exit(r.status ?? 1); }
};
const skipTests = process.argv.includes('--skip-tests');
run('npm', ['run', 'build']);
if (!skipTests) { run('npm', ['run', 'test']); run('npm', ['run', 'test:missions']); }
run('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', 'notwhatiasked', '--branch', 'main', '--commit-dirty=true']);
