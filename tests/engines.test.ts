import { describe, it, expect } from 'vitest';
import { createElizaEn } from '../src/engines/eliza/en';
import { createElizaAgglu } from '../src/engines/eliza/agglu';
import { createMarkov, generate, tokenize, detok, prepare } from '../src/engines/markov/markov';
import { elizaData, markovModels } from '../src/generated/server-data';
import { mulberry32 } from '../src/core/prng';
import { compileFilter, redact, REDACTED } from '../src/engines/gpt2/shared';

const talk = (s: { reply: (i: string) => { text: string } }, inputs: string[]) => inputs.map((i) => s.reply(i).text);

describe('ELIZA (영어, elizabot.js 원본 규칙)', () => {
  it('기획서에서 실제로 확인한 동작 (랜덤 끔 = 원조 순서)', () => {
    expect(talk(createElizaEn('t', { noRandom: true }), ['machines scare me'])).toEqual(['Do computers worry you ?']);
    expect(talk(createElizaEn('t', { noRandom: true }), ['deutsch'])).toEqual(['I speak only English.']);
    expect(talk(createElizaEn('t', { noRandom: true }), ['my cat ate my homework', 'hmm'])[1]).toBe('Does that have anything to do with the fact that you have your homework ?');
    expect(talk(createElizaEn('t', { noRandom: true }), ['you love me'])).toEqual(['Why do you think I love you ?']);
  });
  it('시드 랜덤: 같은 미션·같은 입력 → 항상 같은 대답', () => {
    const a = talk(createElizaEn('eliza-en-01'), ['machines scare me', 'my mom is mean', 'hmm', 'sorry']);
    const b = talk(createElizaEn('eliza-en-01'), ['machines scare me', 'my mom is mean', 'hmm', 'sorry']);
    expect(a).toEqual(b);
    expect(a[0]).toMatch(/computer|machine/i);
  });
});

describe('ELIZA (한국어 규칙)', () => {
  const ko = (inputs: string[], id = 'k') => talk(createElizaAgglu(id, elizaData.ko), inputs);
  it('조사 분리: 엄마가/엄마는 → 가족 키워드', () => {
    for (const s of ['엄마가', '엄마는 무서워', '어머니를 만났어']) expect(ko([s])[0]).toMatch(/가족|엄마|어머니/);
  });
  it('대명사 반사: 내 → 당신의, 너 → 제가', () => {
    const r = ko(['내 엄마'], 'eliza-ko-06')[0];
    expect(r).toMatch(/당신|가족/);
    expect(ko(['너는 바보야'], 'eliza-ko-07')[0]).toMatch(/제가 바보|저|제 이야기/);
  });
  it('어미 정리: 존댓말·반말 모두 기본형으로 되묻기', () => {
    const outs = [...ko(['나는 학생입니다'], 'a'), ...ko(['나는 학생이야'], 'a'), ...ko(['저는 밥을 먹습니다'], 'b'), ...ko(['나는 집에 가요'], 'c')].join(' / ');
    expect(outs).not.toMatch(/입니다고|이야고|먹습니다고|가요고/);
  });
  it('기억 기능: "내 ~"를 기억했다가 할 말이 없을 때 꺼냄', () => {
    const r = ko(['내 고양이가 숙제를 먹었어', '음', '음', '음'], 'mem');
    expect(r.slice(1).some((x) => /고양이가 숙제를 먹었/.test(x))).toBe(true);
  });
  it('외국어 → 한국어만 해요', () => {
    expect(ko(['hello'])[0]).toMatch(/한국어/);
    expect(ko(['ㅋㅋ'])[0]).not.toMatch(/한국어만|한국어밖에/);
  });
  it('결정론', () => {
    expect(ko(['기계가 무서워', '미안해'], 'x')).toEqual(ko(['기계가 무서워', '미안해'], 'x'));
  });
});

describe('마르코프 체인', () => {
  const en = prepare(markovModels.en);
  it('토큰화: 소문자, 구두점 분리', () => {
    expect(tokenize("Off with her head!")).toEqual(['off', 'with', 'her', 'head', '!']);
    expect(detok(['said', 'alice', ',', 'sadly', '.'])).toBe('said alice, sadly.');
  });
  it('결정론 + 최대 30단어 + 문장 끝에서 멈춤', () => {
    const a = generate(en, 'the white', mulberry32(7));
    const b = generate(en, 'the white', mulberry32(7));
    expect(a).toEqual(b);
    const words = a.tokens.filter((t) => /\p{L}/u.test(t));
    expect(words.length).toBeLessThanOrEqual(30);
    const last = a.tokens[a.tokens.length - 1];
    if (words.length < 30) expect(['.', '!', '?']).toContain(last);
  });
  it('모르는 단어로 끝나면 멈춘다', () => {
    expect(generate(en, 'i like pizza', mulberry32(1)).unknownWord).toBe('pizza');
  });
  it('mock → turtle (2차 체인이 학습 글을 따라감)', () => {
    const s = createMarkov('x', en);
    expect(s.reply('the mock').text.startsWith('turtle')).toBe(true);
  });
});

describe('GPT-2 유해 출력 필터', () => {
  it('낱말 단위로 가린다(부분 문자열 오탐 없음)', () => {
    const f = compileFilter('sex\nfuck*', true);
    expect(redact('Sussex is nice. fucking hell', [f])).toBe(`Sussex is nice. ${REDACTED} hell`);
    expect(redact('the sex scene', [f])).toBe(`the ${REDACTED} scene`);
  });
  it('한국어는 글자열 단위', () => {
    const f = compileFilter('# 주석\n씨발', false);
    expect(redact('아 씨발 진짜', [f])).toBe(`아 ${REDACTED} 진짜`);
  });
});
