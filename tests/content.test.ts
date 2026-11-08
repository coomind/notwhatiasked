import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_VERSION } from '../src/core/version';
import { fingerprint } from '../tools/lib/fingerprint';

const i18nDir = path.resolve('content/i18n');
const dicts = Object.fromEntries(fs.readdirSync(i18nDir).map((f) => [f.replace('.json', ''), JSON.parse(fs.readFileSync(path.join(i18nDir, f), 'utf8'))]));

describe('번역 파일', () => {
  it('모든 언어가 영어와 같은 키를 갖는다', () => {
    const keys = Object.keys(dicts.en).sort();
    for (const [l, d] of Object.entries(dicts)) expect(Object.keys(d).sort(), l).toEqual(keys);
  });
  it('자리표시자({n} 등)가 언어마다 같다', () => {
    const ph = (s: string) => [...new Set(s.match(/\{(\w+)[}|]/g)?.map((x) => x.slice(1, -1)) ?? [])].sort();
    for (const [l, d] of Object.entries(dicts)) for (const k of Object.keys(dicts.en)) {
      if (!dicts.en[k] || !d[k]) continue;
      expect(ph(d[k]), `${l}:${k}`).toEqual(ph(dicts.en[k]));
    }
  });
});

describe('엔진 버전', () => {
  it('엔진·미션 데이터가 바뀌면 ENGINE_VERSION 을 올리고 지문을 갱신해야 한다', () => {
    const fp = JSON.parse(fs.readFileSync(path.resolve('tests/fingerprint.json'), 'utf8')) as { version: string; hash: string };
    const h = fingerprint();
    if (fp.hash !== h) expect.fail(`데이터 지문이 바뀜. ENGINE_VERSION(${ENGINE_VERSION})을 올리고 npx tsx tools/fingerprint.ts 실행`);
    expect(fp.version).toBe(ENGINE_VERSION);
  });
});

