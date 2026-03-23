// src/state/index.js
import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '..', '..', 'data');
const STATE_FILE = join(DATA_DIR, 'sent-articles.json');
const TMP_FILE   = join(DATA_DIR, 'sent-articles.json.tmp');

const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90일

/**
 * 상태 파일 로드 + 90일 이전 항목 정리.
 * 파일이 없거나 손상된 경우 빈 상태 반환 (fail-open).
 *
 * @returns {Promise<{ state: Record<string, string>, prunedCount: number }>}
 */
export async function loadState() {
  if (!existsSync(STATE_FILE)) {
    log.info('State file not found — starting fresh', { path: STATE_FILE });
    return { state: {}, prunedCount: 0 };
  }

  let raw;
  try {
    raw = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch (err) {
    log.warn('State file corrupt — starting fresh', { path: STATE_FILE, error: err.message });
    return { state: {}, prunedCount: 0 };
  }

  const cutoff = Date.now() - TTL_MS;
  const pruned = {};
  let prunedCount = 0;

  for (const [id, sentAt] of Object.entries(raw)) {
    const ts = new Date(sentAt).getTime();
    if (!Number.isNaN(ts) && ts >= cutoff) {
      pruned[id] = sentAt;
    } else {
      prunedCount++;
    }
  }

  if (prunedCount > 0) {
    log.info('State pruned old entries', { prunedCount, remainingCount: Object.keys(pruned).length });
  }

  log.info('State loaded', {
    totalEntries: Object.keys(pruned).length,
    prunedCount,
  });

  return { state: pruned, prunedCount };
}

/**
 * 상태를 디스크에 원자적으로 저장.
 * .tmp 파일에 먼저 쓴 후 rename (Windows NTFS 동일 드라이브 = 원자적).
 *
 * @param {Record<string, string>} state
 */
export async function saveState(state) {
  await mkdir(DATA_DIR, { recursive: true });
  const json = JSON.stringify(state, null, 2);
  await writeFile(TMP_FILE, json, 'utf8');
  await rename(TMP_FILE, STATE_FILE);
  log.info('State saved', { path: STATE_FILE, entryCount: Object.keys(state).length });
}

/**
 * 발송된 기사를 state에 추가한 새 객체 반환.
 * 입력 state를 변경하지 않음 (immutable).
 *
 * @param {Record<string, string>} state
 * @param {Array<{ id: string }>} articles
 * @returns {Record<string, string>}
 */
export function markSent(state, articles) {
  const now = new Date().toISOString();
  const updated = { ...state };
  for (const article of articles) {
    updated[article.id] = now;
  }
  return updated;
}
