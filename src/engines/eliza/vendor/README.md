# vendor: elizabot.js v1.1

- 원저작: **elizabot.js v1.1 — © Norbert Landsteiner 2005** (free software, www.masswerk.at). 원 프로그램 Joseph Weizenbaum (MIT, 1966).
- 가져온 곳: npm 패키지 `elizabot@0.0.3` (Tomas Kafka의 Node.js 포장, https://github.com/tkafka/node-elizabot). 파일 `elizabot.js`, `elizadata.js`.
- 원저작 헤더 주석은 그대로 둠. **masswerk.at 웹페이지의 화면·디자인·폰트는 쓰지 않음**(All rights reserved). 라이브러리 코드만 사용.

## 이 게임에서 고친 것 (전부 `[notwhatiasked]` 주석으로 표시)

1. **랜덤 주입**: `Math.random()` 4곳(대답 고르기, 기억 꺼내기, 첫인사, 끝인사)을 `this.rng()` 로 바꿈. 생성자에 두 번째 인자 `rng`(시드 PRNG 함수)를 받도록 함.
   → 같은 미션 + 같은 입력이면 어느 브라우저·서버에서든 같은 대답(공유 링크 재생·서버 리플레이 검증에 필요).
2. **ES 모듈로 감쌈**: `elizabot.js` 의 `require('./elizadata')` → `import`, `module.exports` → `export default`.
   `elizadata.js` 는 원래의 `exports.xxx = ...` 줄을 그대로 두고, 맨 위에 `var exports = {};`, 맨 아래에 `export default exports;` 만 추가.
3. 규칙 데이터(elizadata.js)의 내용은 바꾸지 않음.
