import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/generated/**', 'src/engines/eliza/vendor/**', '.wrangler/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', console: 'readonly', process: 'readonly' } },
    rules: {
      // 결정론: 게임 안의 모든 랜덤은 시드 PRNG(src/core/prng.ts)로만
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Math.random 금지 — src/core/prng.ts 의 시드 PRNG를 쓰세요(결정론).' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off',
    },
  },
);
