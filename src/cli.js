// src/cli.js
// 뉴스레터 CLI 진입점.
// Phase 1: config + env 검증, 시작 로그 기록.
// Phase 2: 피드 수집, 상태 로드, 기사 필터링.
// Phase 3: Claude AI 요약 (카테고리별 배치).
// Phase 4: HTML 렌더링 + Gmail SMTP 발송 (또는 --dry-run 미리보기).

import { parseArgs } from 'util';
import { loadConfig, validateEnv } from './config/loader.js';
import { log } from './logger.js';
import { fetchAllFeeds } from './fetcher/index.js';
import { loadState, saveState, markSent } from './state/index.js';
import { filterArticles } from './filter/index.js';
import { summarizeArticles } from './summarizer/index.js';
import { renderEmail } from './renderer/index.js';
import { sendNewsletter, saveDryRun } from './mailer/index.js';

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
  runPipeline().catch(err => {
    log.error('Unhandled pipeline error', { error: err.message, stack: err.stack });
    process.exit(1);
  });
} else {
  log.error('Unknown command', { command });
  console.error('Usage: node src/cli.js [--dry-run] [--config <path>] run');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 파이프라인 (async)
// ---------------------------------------------------------------------------
async function runPipeline() {
  log.info('Pipeline starting', { feedCount: config.feeds.length, isDryRun });

  // ── Phase 2: Feed Fetching & Deduplication ───────────────────────────────

  // Step 1: Fetch all feeds concurrently (FETC-01, FETC-02)
  const { articles: rawArticles, errors: feedErrors } = await fetchAllFeeds(config.feeds);

  // Step 2: Load state and prune old entries (FETC-03)
  const { state } = await loadState();

  // Step 3: Filter — UTM strip, ID derivation, 25h window, state dedup (FETC-03~05)
  const articles = filterArticles(rawArticles, state);

  // Step 4: Zero-article guard (MAIL-08)
  if (articles.length === 0) {
    log.info('No new articles — skipping send', { feedErrors: feedErrors.length });
    process.exit(0);
  }

  if (feedErrors.length > 0) {
    log.warn('Feed errors summary', { errors: feedErrors });
  }

  // ── Phase 3: AI Summarization ────────────────────────────────────────────

  const summarized = await summarizeArticles(articles);

  // ── Phase 4: Email Rendering & Sending ───────────────────────────────────

  // Render HTML + plain-text (MAIL-01~05)
  const rendered = renderEmail(summarized, { feedErrors });

  if (isDryRun) {
    // DEVX-01: save preview, skip SMTP, skip state commit
    const previewPath = await saveDryRun(rendered.html);
    log.info('Dry-run complete — email not sent', {
      previewPath,
      articleCount:  summarized.length,
      fallbackCount: summarized.filter(a => a.fallback).length,
    });
    process.exit(0);
  }

  // Live send (MAIL-06)
  await sendNewsletter(rendered, config);

  // MAIL-07: state committed ONLY after confirmed SMTP delivery
  const updatedState = markSent(state, summarized);
  await saveState(updatedState);

  log.info('Pipeline complete', {
    articleCount:  summarized.length,
    fallbackCount: summarized.filter(a => a.fallback).length,
    feedErrors:    feedErrors.length,
    exitCode: 0,
  });
  process.exit(0);
}
