# 마르코프 체인 학습 글 (퍼블릭 도메인만)

`tools/prepare-corpora.ts` 가 원문에서 머리말·틀·링크 표기만 지우고 본문을 그대로 저장했다. 출처를 확인할 수 없는 텍스트는 쓰지 않았다.
빌드 때 `tools/build-data.ts` 가 이 폴더의 `<언어>/*.txt` 를 토큰 배열(`src/generated/markov-<언어>.json`)로 바꾼다.

## 영어 (en)

| 파일 | 작품 | 저자 | 판본·출처 | 저작권 |
|---|---|---|---|---|
| alice.txt | Alice's Adventures in Wonderland (1865) | Lewis Carroll (1832–1898) | Project Gutenberg eBook #11 (https://www.gutenberg.org/ebooks/11), 본문 1장부터 끝까지, 장 제목 줄 제외 | 미국·한국 퍼블릭 도메인 |
| grimm.txt | Grimms' Fairy Tales 중 12편: Hansel and Gretel, Rapunzel, Rumpelstiltskin, The Frog-Prince, Briar Rose, Ashputtel, The Golden Goose, The Travelling Musicians, The Elves and the Shoemaker, The Wolf and the Seven Little Kids, Snowdrop, The Fisherman and His Wife | Jacob & Wilhelm Grimm, 영역 Edgar Taylor & Marian Edwardes (19세기 번역) | Project Gutenberg eBook #2591 (https://www.gutenberg.org/ebooks/2591) | 퍼블릭 도메인(19세기 출판 번역본, Project Gutenberg 미국 PD 확인본) |

Project Gutenberg 라이선스 문구·상표는 본문에서 제거했다(구텐베르크 규정상 상표를 빼면 퍼블릭 도메인 본문은 자유롭게 쓸 수 있음).

## 한국어 (ko)

저자 사망 1962년 이전 → 한국 저작권 보호기간 만료(구 저작권법상 사후 50년이 2013년 이전에 끝남). 출처: 한국어 위키문헌(ko.wikisource.org) 각 문서의 원문(`?action=raw`), 위키문헌 문서에 PD 표시.

| 파일 | 작품 | 저자(사망) | 출처 |
|---|---|---|---|
| unsu.txt | 운수 좋은 날 (1924) | 현진건 (1943) | https://ko.wikisource.org/wiki/운수_좋은_날 |
| bsagam.txt | B사감과 러브레터 (1925) | 현진건 (1943) | https://ko.wikisource.org/wiki/B사감과_러브레터 |
| sul.txt | 술 권하는 사회 (1921) | 현진건 (1943) | https://ko.wikisource.org/wiki/술_권하는_사회 |
| dongbaek.txt | 동백꽃 (1936) | 김유정 (1937) | https://ko.wikisource.org/wiki/동백꽃 |
| memil.txt | 메밀꽃 필 무렵 (1936) | 이효석 (1942) | https://ko.wikisource.org/wiki/메밀꽃_필_무렵 |
| nalgae.txt | 날개 (1936) | 이상 (1937) | https://ko.wikisource.org/wiki/날개 |

참고: 나도향 「벙어리 삼룡이」는 위키문헌 원문이 스캔 이미지 색인(<pages>)뿐이라 본문을 얻을 수 없어 빼고, 대신 이효석 「메밀꽃 필 무렵」을 넣었다(저자 1942년 사망, 기준 충족).
