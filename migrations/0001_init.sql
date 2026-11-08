-- 기록용: 이 스키마(버전 2)는 D1 notwhatiasked(c93305db-f0a3-4504-8a4b-02df1d79eb11)에 이미 적용돼 있다. 다시 실행하지 말 것.
-- 설계 원칙: 클리어 1건마다 행을 추가하지 않는다. (미션, 글자 수…)별 카운터를 +1 하는 히스토그램.

-- 클리어 히스토그램: 클리어 1건 = 해당 칸 count + 1 (UPSERT, 1행 쓰기)
CREATE TABLE clear_hist (
  mission_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  mode TEXT NOT NULL,              -- 'local' | 'original'(원본 영어 모드)
  play TEXT NOT NULL,              -- 'casual'(일반) | 'challenge'(도전)
  engine_version TEXT NOT NULL,
  verified INTEGER NOT NULL,       -- 1 = 서버 리플레이 검증 통과
  attempts INTEGER NOT NULL,       -- 클리어까지 시도 횟수
  chars INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (mission_id, locale, mode, play, engine_version, verified, attempts, chars)
) WITHOUT ROWID;

-- 도전모드 실패 수 (클리어율 계산용): 실패 1건 = count + 1
CREATE TABLE fail_hist (
  mission_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  mode TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (mission_id, locale, mode, engine_version)
) WITHOUT ROWID;

-- 관람객 수 등 카운터
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;

-- 계산된 통계 JSON을 1행에 캐시 (전 세계 공용, 10분마다 갱신)
CREATE TABLE IF NOT EXISTS stats_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  engine_version TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
-- counters에 ('visitors', 0) 행이 이미 있음
INSERT OR IGNORE INTO counters (name, value) VALUES ('visitors', 0);
