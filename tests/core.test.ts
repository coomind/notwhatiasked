import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hashStr, mulberry32, seedFor, rngFor } from '../src/core/prng';
import { graphemeCount, totalChars, findTaboo, hasTaboo, hitsTarget, normTaboo, cleanInput } from '../src/core/text';
import { encodeInputs, decodeInputs } from '../src/core/codec';

describe('시드 PRNG', () => {
  it('같은 시드 → 같은 수열, 고정된 값', () => {
    const a = mulberry32(42), b = mulberry32(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    // 브라우저·Node·Workers에서 같은 값이 나와야 한다(회귀 방지용 고정값)
    expect(hashStr('eliza-en-01')).toBe(hashStr('eliza-en-01'));
    expect(mulberry32(1)()).toBeCloseTo(0.6270739405881613, 12);
  });
  it('seed = hash(missionId + 입력들): 입력이 다르면 시드가 다름', () => {
    expect(seedFor('m', ['a', 'b'])).not.toBe(seedFor('m', ['ab']));
    expect(seedFor('m', ['a'])).not.toBe(seedFor('n', ['a']));
    expect(rngFor('m', ['x'])()).toBe(rngFor('m', ['x'])());
  });
  it('src 에 Math.random 이 없다(결정론)', () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const offenders = walk(path.resolve('src')).filter((f) => /\.(ts|tsx|js)$/.test(f) && /Math\.random\s*\(/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('글자 수', () => {
  it('grapheme 기준, 공백 포함', () => {
    expect(graphemeCount('abc')).toBe(3);
    expect(graphemeCount('a b')).toBe(3);
    expect(graphemeCount('한국어')).toBe(3);
    expect(graphemeCount('👍🏽x')).toBe(2);
    expect(graphemeCount('👨‍👩‍👧')).toBe(1);
    expect(totalChars(['machines scare me', 'hi'])).toBe(19);
  });
  it('입력 정리: 앞뒤 공백·연속 공백', () => {
    expect(cleanInput('  hello   world ')).toBe('hello world');
  });
});

describe('금지어', () => {
  const taboo = ['pineapple', 'pine', 'apple'];
  it('공백·구두점·대소문자·전각 우회를 막는다', () => {
    expect(hasTaboo('pine apple', taboo)).toBe(true);
    expect(hasTaboo('p.i.n.e', taboo)).toBe(true);
    expect(hasTaboo('P-I-N-E', taboo)).toBe(true);
    expect(hasTaboo('ｐｉｎｅ', taboo)).toBe(true);
    expect(hasTaboo('spiky fruit', taboo)).toBe(false);
    expect(normTaboo(' A.b, C ')).toBe('abc');
  });
  it('원문 위치를 돌려준다(빨간 밑줄용)', () => {
    const h = findTaboo('I like p.i.n.e trees', ['pine']);
    expect(h).toHaveLength(1);
    expect('I like p.i.n.e trees'.slice(h[0].start, h[0].end)).toBe('p.i.n.e');
  });
  it('한국어', () => {
    expect(hasTaboo('컴 퓨 터', ['컴퓨터'])).toBe(true);
    expect(hasTaboo('기계', ['컴퓨터'])).toBe(false);
  });
});

describe('목표 판정', () => {
  it('대소문자·NFKC 무시', () => {
    expect(hitsTarget('Do COMPUTERS worry you ?', 'computers')).toBe(true);
    expect(hitsTarget('ｃｏｍｐｕｔｅｒｓ', 'computers')).toBe(true);
    expect(hitsTarget('Do computer worry you', 'computers')).toBe(false);
  });
});

describe('공유 링크 인코딩', () => {
  it('왕복', () => {
    const x = ['my cat ate my homework', '음… 그래', '🍍?'];
    const e = encodeInputs(x);
    expect(e).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeInputs(e)).toEqual(x);
    expect(decodeInputs('!!!')).toBeNull();
  });
});
