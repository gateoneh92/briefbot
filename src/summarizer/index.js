// src/summarizer/index.js
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicConfig } from '../config/loader.js';
import { log } from '../logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INPUT_CHARS  = 1500;      // SUMM-02: per-article content truncation
const MAX_TOKENS       = 2048;      // SUMM-02: always set on every API call
const MAX_BATCH_SIZE   = 8;         // articles per API call — keeps output within MAX_TOKENS
const MODEL           = 'claude-sonnet-4-6';
const RETRY_DELAYS_MS = [2000, 4000, 8000]; // SUMM-03: 2s / 4s / 8s backoff

// ---------------------------------------------------------------------------
// SDK — initialized once at module level with company internal API gateway
// ---------------------------------------------------------------------------

const client = new Anthropic(getAnthropicConfig());

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Summarize articles grouped by category, one Claude API call per group.
 * SUMM-01: batched by category.
 * SUMM-02: 1,500-char input truncation + max_tokens always set.
 * SUMM-03: exponential backoff retry on 429/529.
 * SUMM-04: contentSnippet fallback with fallback: true marker on failure.
 *
 * @param {Article[]} articles — Phase 2 output (summary: null, fallback: false)
 * @returns {Promise<Article[]>} — same shape with .summary and .fallback populated
 */
export async function summarizeArticles(articles) {
  // Group articles by category preserving original order
  const byCategory = new Map();
  for (const article of articles) {
    if (!byCategory.has(article.category)) {
      byCategory.set(article.category, []);
    }
    byCategory.get(article.category).push(article);
  }

  log.info('Summarization starting', {
    totalArticles: articles.length,
    categories: [...byCategory.keys()],
  });

  const results = [];
  for (const [category, group] of byCategory) {
    log.info('Summarizing category', { category, count: group.length });
    const summarized = await summarizeCategory(category, group);
    results.push(...summarized);
  }

  const fallbackCount = results.filter(a => a.fallback).length;
  log.info('Summarization complete', {
    totalArticles:  results.length,
    summarized:     results.length - fallbackCount,
    fallbackCount,
  });

  return results;
}

// ---------------------------------------------------------------------------
// Category-level summarization
// ---------------------------------------------------------------------------

/**
 * Summarize all articles in a single category.
 * Large categories are split into chunks of MAX_BATCH_SIZE to stay within MAX_TOKENS.
 *
 * @param {string}    category
 * @param {Article[]} articles
 * @returns {Promise<Article[]>}
 */
async function summarizeCategory(category, articles) {
  const results = [];
  const chunks = chunkArray(articles, MAX_BATCH_SIZE);

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const batchLabel = chunks.length > 1 ? ` (batch ${ci + 1}/${chunks.length})` : '';
    log.info(`Summarizing batch${batchLabel}`, { category, batchSize: chunk.length });

    const summarized = await summarizeBatch(category, chunk);
    results.push(...summarized);
  }

  return results;
}

/**
 * Summarize a single batch of articles with one Claude API call.
 * Falls back entire batch if all retries are exhausted.
 *
 * @param {string}    category
 * @param {Article[]} batch
 * @returns {Promise<Article[]>}
 */
async function summarizeBatch(category, batch) {
  const prompt = buildPrompt(batch);

  let rawText;
  try {
    rawText = await callWithRetry(prompt, category);
  } catch (err) {
    log.warn('Summarization failed for batch — using contentSnippet fallback', {
      category,
      error: err.message,
    });
    return batch.map(article => ({
      ...article,
      summary:  truncate(article.contentSnippet, MAX_INPUT_CHARS) || article.title,
      fallback: true,
    }));
  }

  const summaries = parseResponse(rawText, batch.length);

  return batch.map((article, i) => {
    const summary = summaries[i];
    if (summary) {
      return { ...article, summary, fallback: false };
    }
    log.warn('Missing summary for article — using contentSnippet fallback', { id: article.id });
    return {
      ...article,
      summary:  truncate(article.contentSnippet, MAX_INPUT_CHARS) || article.title,
      fallback: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build the Claude prompt for a batch of articles.
 * Each article's content is truncated to MAX_INPUT_CHARS (SUMM-02).
 *
 * @param {Article[]} articles
 * @returns {string}
 */
function buildPrompt(articles) {
  const items = articles.map((article, i) => {
    const content = truncate(article.contentSnippet || '', MAX_INPUT_CHARS) || article.title;
    return `[${i}] 제목: ${article.title}\n내용: ${content}`;
  }).join('\n\n');

  return (
    '당신은 뉴스레터 에디터입니다. 아래 기사들을 각각 1~3문장의 한국어로 간결하게 요약해 주세요.\n\n' +
    '반드시 다음 JSON 배열 형식으로만 응답하세요 (설명이나 다른 텍스트 없이):\n' +
    '[{"index":0,"summary":"..."},{"index":1,"summary":"..."}]\n\n' +
    '기사 목록:\n' + items
  );
}

// ---------------------------------------------------------------------------
// API call with retry (SUMM-03)
// ---------------------------------------------------------------------------

/**
 * Call Claude API with up to 3 retries on HTTP 429/529 responses.
 * Delays: 2s → 4s → 8s.
 * Logs token usage on success, retry details on rate limit.
 *
 * @param {string} prompt
 * @param {string} category — for logging context
 * @returns {Promise<string>} — raw response text
 */
async function callWithRetry(prompt, category) {
  let lastErr;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await client.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        messages:   [{ role: 'user', content: prompt }],
      });

      log.info('Claude API call succeeded', {
        category,
        attempt:      attempt + 1,
        inputTokens:  response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      return response.content[0].text;

    } catch (err) {
      lastErr = err;
      const status = err.status;
      const isRateLimited = status === 429 || status === 529;

      if (isRateLimited && attempt < RETRY_DELAYS_MS.length) {
        const delayMs = RETRY_DELAYS_MS[attempt];
        log.warn('Claude API rate limited — retrying', {
          category,
          attempt:  attempt + 1,
          delayMs,
          status,
        });
        await sleep(delayMs);
      } else {
        // Non-rate-limit error, or retries exhausted
        throw err;
      }
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Extract summaries from Claude's JSON response.
 * Returns an array of length `expectedCount` where missing entries are null.
 *
 * @param {string} text
 * @param {number} expectedCount
 * @returns {Array<string|null>}
 */
function parseResponse(text, expectedCount) {
  try {
    // Claude may include preamble — extract the JSON array portion
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array found in response');

    const parsed = JSON.parse(match[0]);
    const summaries = new Array(expectedCount).fill(null);

    for (const item of parsed) {
      if (
        typeof item.index === 'number' &&
        item.index >= 0 &&
        item.index < expectedCount &&
        typeof item.summary === 'string' &&
        item.summary.trim()
      ) {
        summaries[item.index] = item.summary.trim();
      }
    }

    return summaries;
  } catch (err) {
    log.warn('Failed to parse Claude response as JSON — will fall back all articles', {
      error: err.message,
      responsePreview: text.slice(0, 300),
    });
    return new Array(expectedCount).fill(null);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate text to maxChars, appending ellipsis if truncated.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
function truncate(text, maxChars) {
  if (!text) return '';
  return text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Split an array into chunks of at most `size` elements.
 *
 * @param {Array} arr
 * @param {number} size
 * @returns {Array[]}
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
