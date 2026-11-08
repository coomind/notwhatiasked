// GPT-2 비교 테스트용 프롬프트: 미션 해법 + 기획서에서 확인한 것 + 몇 가지 (12개 이상)
import fs from 'node:fs';
import path from 'node:path';

const sols = (JSON.parse(fs.readFileSync(path.resolve('content/missions/en/gpt2.json'), 'utf8')) as { solution: string[] }[]).map((m) => m.solution[0]);
export const GPT2_PROMPTS: string[] = [
  ...sols,
  'Hawaiian pizza has ham and',
  'Fruit salad: banana, mango, kiwi,',
  'The yellow tropical fruit with spiky skin is called a',
  'Once upon a time',
  'The capital of Japan is',
  'My favourite colour is',
  'In 1966, a computer program called ELIZA',
  'Ingredients: flour, sugar, eggs,',
  'Q: What is the best fruit?\nA:',
  '1, 2, 3, 4,',
];
