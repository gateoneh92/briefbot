// src/logger.js
import { appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM에서 __dirname 대체 (import.meta.url 사용)
const __dirname = dirname(fileURLToPath(import.meta.url));

// 프로젝트 루트의 logs/ 디렉토리 절대 경로
const LOG_DIR = join(__dirname, '..', 'logs');

/**
 * 오늘 날짜(UTC)의 로그 파일 경로를 반환합니다.
 * 예: /path/to/project/logs/2026-03-20.log
 */
function getLogPath() {
  const date = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC 기준
  return join(LOG_DIR, `${date}.log`);
}

/**
 * 로그 엔트리를 포맷합니다.
 * 형식: [ISO-timestamp] LEVEL message {"optional":"json"}
 *
 * 예시:
 *   [2026-03-20T07:01:00.123Z] INFO  Config loaded {"feedCount":3}
 *   [2026-03-20T07:01:01.200Z] WARN  Feed fetch failed {"url":"...","error":"ETIMEDOUT"}
 */
function formatEntry(level, message, data) {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level.padEnd(5)} ${message}`;
  return data ? `${base} ${JSON.stringify(data)}` : base;
}

/**
 * 로그 라인을 파일에 추가합니다.
 * logs/ 디렉토리가 없으면 자동 생성.
 * 로거 자체 에러는 삼켜서 파이프라인을 중단하지 않습니다.
 */
function write(line) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(getLogPath(), line + '\n', 'utf8');
  } catch (err) {
    console.error('[LOGGER FAULT]', err.message);
  }
}

/**
 * 구조화된 로거.
 * 모든 메서드는 콘솔과 일별 로그 파일에 동시에 기록합니다.
 *
 * 사용법:
 *   import { log } from '../logger.js';
 *   log.info('Config loaded', { feedCount: 3 });
 *   log.warn('Feed fetch failed', { url, error: err.message });
 *   log.error('SMTP send failed', { code: err.code });
 */
export const log = {
  info(message, data) {
    const line = formatEntry('INFO', message, data);
    console.log(line);
    write(line);
  },

  warn(message, data) {
    const line = formatEntry('WARN', message, data);
    console.warn(line);
    write(line);
  },

  error(message, data) {
    const line = formatEntry('ERROR', message, data);
    console.error(line);
    write(line);
  },
};
