// 엔진·미션 데이터 지문 갱신: ENGINE_VERSION 을 올린 뒤 실행 (tests/content.test.ts 가 검사)
import fs from 'node:fs';
import { fingerprint } from './lib/fingerprint';
import { ENGINE_VERSION } from '../src/core/version';
fs.writeFileSync('tests/fingerprint.json', JSON.stringify({ version: ENGINE_VERSION, hash: fingerprint() }, null, 2) + '\n');
console.log('fingerprint', ENGINE_VERSION, fingerprint());
