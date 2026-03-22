// src/cli.js
// 뉴스레터 CLI 진입점.
// Phase 1: config + env 검증, 시작 로그 기록, 정상 종료.
// Phase 2~4에서 파이프라인 단계가 순서대로 연결됩니다.

import { parseArgs } from 'util';
import { loadConfig, validateEnv } from './config/loader.js';
import { log } from './logger.js';

// ---------------------------------------------------------------------------
// 플래그 파싱 (util.parseArgs — Node 22+ 내장, 외부 패키지 불필요)
//
// 지원 플래그:
//   --dry-run           SMTP 미발송, HTML 미리보기를 output/에 저장
//   --config <path>     config.json 경로 지정 (기본: ./config.json)
//
// 지원 커맨드 (positional):
//   run                 뉴스레터 파이프라인 실행 (기본)
// ---------------------------------------------------------------------------
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'dry-run': { type: 'boolean', default: false },
    'config':  { type: 'string',  default: './config.json' },
  },
  allowPositionals: true,
});

const command    = positionals[0] ?? 'run';
const isDryRun   = values['dry-run'];
const configPath = values['config'];

// ---------------------------------------------------------------------------
// 시작 검증 (순서 중요)
//   1. 환경 변수 먼저 — 시크릿 누락 시 config 읽을 필요 없음
//   2. Config 검증 — 피드/스케줄/이메일 구조 검사
//   3. 검증 통과 후 로그 기록
// ---------------------------------------------------------------------------
validateEnv();

const config = loadConfig(configPath);

log.info('Startup validation passed', {
  command,
  isDryRun,
  configPath,
  feedCount: config.feeds.length,
});

// ---------------------------------------------------------------------------
// 커맨드 디스패치
// ---------------------------------------------------------------------------
if (command === 'run') {
  log.info('Pipeline starting', { feedCount: config.feeds.length });

  // Phase 1 스텁 — 파이프라인 미구현 상태.
  // Phase 2~4에서 아래 블록을 순서대로 교체:
  //   const articles   = await fetchFeeds(config.feeds);
  //   const filtered   = await filterArticles(articles);
  //   const summarized = await summarizeArticles(filtered, config);
  //   await sendNewsletter(summarized, config, { isDryRun });

  log.info('Pipeline complete (Phase 1 스텁 — 파이프라인 미연결)', { exitCode: 0 });
  process.exit(0);
} else {
  log.error('Unknown command', { command });
  console.error('Usage: node src/cli.js [--dry-run] [--config <path>] run');
  process.exit(1);
}
