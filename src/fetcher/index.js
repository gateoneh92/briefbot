// src/fetcher/index.js
import Parser from 'rss-parser';
import { log } from '../logger.js';

// Single parser instance — timeout applies to every parseURL() call.
// FETC-02: 10-second per-request timeout via rss-parser built-in option.
const parser = new Parser({ timeout: 10_000 });

/**
 * Fetch all RSS feeds concurrently. Failed feeds are logged and skipped.
 * FETC-01: Promise.allSettled ensures one feed failure cannot abort the pipeline.
 *
 * @param {Array<{ url: string, category: string }>} feeds
 * @returns {Promise<{
 *   articles: Array<{
 *     feedTitle: string,
 *     feedUrl: string,
 *     category: string,
 *     raw: object,
 *   }>,
 *   errors: Array<{ url: string, error: string }>
 * }>}
 */
export async function fetchAllFeeds(feeds) {
  const results = await Promise.allSettled(
    feeds.map(feed => fetchOneFeed(feed))
  );

  const articles = [];
  const errors   = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feed   = feeds[i];

    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      const errorMessage = result.reason?.message ?? String(result.reason);
      errors.push({ url: feed.url, error: errorMessage });
      log.warn('Feed fetch failed', { url: feed.url, error: errorMessage });
    }
  }

  log.info('Feed fetch complete', {
    total:           feeds.length,
    succeeded:       feeds.length - errors.length,
    failed:          errors.length,
    rawArticleCount: articles.length,
  });

  return { articles, errors };
}

/**
 * Fetch and parse a single RSS feed.
 * Throws on any error — caught by Promise.allSettled in fetchAllFeeds.
 *
 * @param {{ url: string, category: string }} feed
 * @returns {Promise<Array<{ feedTitle: string, feedUrl: string, category: string, raw: object }>>}
 */
async function fetchOneFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  const items  = parsed.items ?? [];

  return items.map(item => ({
    feedTitle: parsed.title ?? feed.url,
    feedUrl:   feed.url,
    category:  feed.category,
    raw:       item,
  }));
}
