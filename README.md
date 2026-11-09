# 아니 그거 말고 · Not What I Asked

옛날 AI(1966 ELIZA, 1980년대 마르코프 체인, 2019 GPT-2)가 **목표 단어를 말하게 만드는 게임**.
단, 목표 단어(금지어)는 직접 입력할 수 없다. 이 AI들은 멍청해서 말이 안 통한다 — 그 답답함이 재미다.

- 주소: https://notwhatiasked.pages.dev (한국어 입구: https://notwhatiasked.pages.dev/ko/)
- 언어: 한국어, English (`content/i18n/<언어>.json` 을 추가하면 언어가 늘어난다)
- 무료·광고 없음·비상업

## 구조

| 폴더 | 내용 |
|---|---|
| `src/core` | 시드 PRNG(mulberry32), 금지어·목표 판정(NFKC·소문자·공백/구두점 제거), 글자 수(grapheme), 통계 계산 |
| `src/engines/eliza` | 영어: `vendor/elizabot.js`(N. Landsteiner, 원본 규칙, 랜덤만 시드 PRNG로) · 한국어 등: `agglu.ts`(조사 분리·대명사 반사·어미 정리·기억, 규칙은 `content/eliza/<언어>.json`) |
| `src/engines/markov` | 2차 단어 마르코프 체인(학습 글: `content/corpora`, 퍼블릭 도메인만) |
| `src/engines/gpt2` | Transformers.js + Xenova/gpt2(q8) 를 Web Worker·WASM(스레드 1개)으로. 탐욕 디코딩 → 결정론 |
| `src/ui` | React 화면(로비·명판·미션·엔딩·크레딧), 공유 카드(캔버스 PNG), 통계·기록 전송 |
| `src/server` + `functions/api` | Cloudflare Pages Functions: `GET /api/stats`, `POST /api/report` (D1, 히스토그램 카운터) |
| `content/missions/<언어>/<전시실>.json` | 미션(목표·금지어·턴·par·개발자 해법). 해법은 빌드 때 클라이언트 번들에서 지워진다 |
| `tools/` | 해법 자동 탐색(`solve.ts`, `gpt2-search.ts`), 미션 검증(`test-missions.ts`), 배포 |

## 명령

```bash
npm install
npm run dev            # 개발 서버
npm run test           # eslint(Math.random 금지 포함) + vitest
npm run test:missions  # 모든 미션이 개발자 해법으로 실제 클리어되는지(GPT-2는 Node에서 실제 실행)
npm run e2e            # Playwright(시스템 Chrome): 모바일 360×740 · PC 1440×900
npm run deploy         # 빌드 → test → test:missions → Cloudflare Pages 배포
```

해법 다시 찾기: `npx tsx tools/solve.ts [eliza|markov]`, `npx tsx tools/gpt2-search.ts [missionId…]`(환경변수 `NOVA_API_KEY` 필요).
엔진·미션 데이터를 바꾸면 `src/core/version.ts` 의 `ENGINE_VERSION` 을 올리고 `npx tsx tools/fingerprint.ts`.

## 기록·통계 (무료 한도 지키기)

- Functions 호출은 세션당 최대 2번: 통계 조회 1번(1시간 브라우저 캐시), 떠날 때 기록 묶음 전송 1번(sendBeacon).
- D1: 클리어 1건 = (미션, 언어, 모드, 시도, 글자 수…) 칸의 count + 1. 통계는 계산된 JSON 1행을 10분마다 갱신.
- ELIZA·마르코프 기록은 서버에서 입력을 리플레이해 검증(verified=1). **입력 원문은 저장하지 않는다.**
- API가 실패해도 게임은 그대로 돌아간다(통계만 숨김).

## 라이선스·크레딧

- ELIZA: elizabot.js v1.1 © Norbert Landsteiner 2005 (free software), 원작 Joseph Weizenbaum (1966). masswerk.at 페이지 디자인은 쓰지 않음.
- GPT-2: OpenAI (2019, MIT), ONNX 변환 Xenova. Transformers.js (Apache-2.0), ONNX Runtime Web (MIT).
- **한국어 GPT-2 관: SK텔레콤 KoGPT2(skt/kogpt2-base-v2, CC BY-NC-SA 4.0, 비상업) — 광고·후원 도입 시 교체 필요.** 브라우저용 ONNX q8 변환본: [coomind/kogpt2-base-v2-onnx](https://huggingface.co/coomind/kogpt2-base-v2-onnx)(같은 라이선스, 변환 도구 `tools/kogpt2/`).
- 마르코프 학습 글: `content/corpora/README.md` (작품·저자·출처).
- 글꼴: IBM Plex Mono, Nanum Gothic Coding (SIL OFL 1.1).
- 이 저장소의 코드: MIT. (단, vendor·학습 글·모델은 각자의 라이선스)
