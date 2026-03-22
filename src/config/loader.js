// src/config/loader.js
import { readFileSync } from 'fs';
import { ConfigSchema } from './schema.js';

// 필수 환경 변수 목록
// 회사 내부 Claude API 게이트웨이 사용 (company_claude.txt 참고)
const REQUIRED_ENV = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
];

/**
 * config.json을 읽고 Zod ConfigSchema로 검증합니다.
 * 검증 실패 시 사람이 읽을 수 있는 에러를 출력하고 process.exit(1).
 * 스택 트레이스 없이 필드별 에러 메시지만 출력.
 *
 * @param {string} configPath - config.json 경로 (기본: './config.json')
 * @returns {object} 검증된 config 객체
 */
export function loadConfig(configPath = './config.json') {
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`[CONFIG ERROR] Cannot read ${configPath}: ${err.message}`);
    process.exit(1);
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error('[CONFIG ERROR] config.json validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

/**
 * 필수 환경 변수가 모두 존재하는지 확인합니다.
 * 누락된 변수가 있으면 목록을 출력하고 process.exit(1).
 * --env-file=.env 로드 후에 호출해야 합니다.
 */
export function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('[ENV ERROR] Missing required environment variables:');
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }
}

/**
 * 회사 내부 Claude API 클라이언트 설정을 반환합니다.
 * Phase 3 summarizer에서 Anthropic SDK 초기화 시 사용.
 *
 * @returns {{ apiKey: string, baseURL: string, defaultHeaders: object }}
 */
export function getAnthropicConfig() {
  const config = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    defaultHeaders: {},
  };

  if (process.env.ANTHROPIC_PROJECT_ID) {
    config.defaultHeaders['X-Project-Id'] = process.env.ANTHROPIC_PROJECT_ID;
  }

  return config;
}
