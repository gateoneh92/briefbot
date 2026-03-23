// src/filter/index.js
import { createHash } from 'crypto';
import { log } from '../logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_MS = 25 * 60 * 60 * 1000; // 25 hours in milliseconds

const UTM_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
]);

// ---------------------------------------------------------------------------
// UTM stripping — FETC-05
// ---------------------------------------------------------------------------

/**
 * Strip UTM and ad-tracking parameters from a URL string.
 * Uses the built-in URL class — handles encoded params correctly.
 * Returns the input unchanged if falsy or not a valid absolute URL.
 *
 * @param {string | undefined | null} rawUrl
 * @returns {string}
 */
export function stripUtmParams(rawUrl) {
  if (!rawUrl) return rawUrl;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // Not a valid absolute URL — return as-is; ID derivation will handle it
    return rawUrl;
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (UTM_PARAMS.has(key)) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// Article ID derivation — FETC-03
// ---------------------------------------------------------------------------

/**
 * Derive a stable dedup key for an rss-parser item.
 * Assumes item.link has already been UTM-stripped before this call.
 *
 * Chain:
 *   1. guid:  — RSS <guid>
 *   2. id:    — Atom <id>
 *   3. link:  — UTM-stripped canonical URL
 *   4. hash:  — SHA-256(title|isoDate) first 16 hex chars
 *   5. random — last resort; will not dedup across runs
 *
 * @param {{ guid?: string, id?: string, link?: string, title?: string, isoDate?: string, pubDate?: string }} item
 * @returns {string}
 */
export function deriveArticleId(item) {
  // 1. RSS <guid>
  if (item.guid && typeof item.guid === 'string' && item.guid.trim()) {
    return `guid:${item.guid.trim()}`;
  }

  // 2. Atom <id>
  if (item.id && typeof item.id === 'string' && item.id.trim()) {
    return `id:${item.id.trim()}`;
  }

  // 3. UTM-stripped canonical link (must be stripped before calling this function)
  if (item.link && typeof item.link === 'string' && item.link.trim()) {
    return `link:${item.link.trim()}`;
  }

  // 4. SHA-256 hash of title + pubDate (first 16 hex chars)
  const titlePart = (item.title || '').trim();
  const datePart  = (item.isoDate || item.pubDate || '').trim();
  if (titlePart) {
    const hash = createHash('sha256')
      .update(`${titlePart}|${datePart}`)
      .digest('hex')
      .slice(0, 16);
    return `hash:${hash}`;
  }

  // 5. Random fallback — will not dedup across runs, but prevents crashes
  return `random:${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Time window filter — FETC-04
// ---------------------------------------------------------------------------

/**
 * Return true if the article's publishedAt falls within the 25-hour window.
 * Articles with no parseable date are included (fail-open) with a WARN log.
 *
 * @param {{ id: string, publishedAt: string, _dateOk: boolean }} article
 * @param {number} nowMs — Date.now() — provided for testability
 * @returns {boolean}
 */
function isWithinWindow(article, nowMs) {
  if (!article._dateOk) {
    log.warn('Article missing or unparseable date — including with caution', { id: article.id });
    return true;
  }
  const pubMs  = new Date(article.publishedAt).getTime();
  const cutoff = nowMs - WINDOW_MS;
  return pubMs >= cutoff;
}

// ---------------------------------------------------------------------------
// Main export — filterArticles
// ---------------------------------------------------------------------------

/**
 * Transform raw fetcher output into normalized Article objects.
 * Applies: UTM strip → ID derivation → 25-hour window → state dedup.
 * FETC-03, FETC-04, FETC-05.
 *
 * @param {Array<{ feedTitle: string, feedUrl: string, category: string, raw: object }>} rawArticles
 * @param {Record<string, string>} state — map of article id → ISO send timestamp (already loaded)
 * @returns {Article[]}
 */
export function filterArticles(rawArticles, state) {
  const nowMs      = Date.now();
  const cutoffMs   = nowMs - WINDOW_MS;
  const cutoffUTC  = new Date(cutoffMs).toISOString();
  const cutoffLocal = new Date(cutoffMs).toLocaleString();

  log.info('Article window cutoff', {
    cutoffUTC,
    cutoffLocal,
    windowHours: 25,
    rawCount: rawArticles.length,
  });

  // Step 1: Normalize all raw items into Article shape
  const normalized = rawArticles.map(({ feedTitle, feedUrl, category, raw }) => {
    // Strip UTM params from link before ID derivation
    const cleanLink = stripUtmParams(raw.link || '');

    // Build a temporary item with the clean link for ID derivation
    const itemForId = { ...raw, link: cleanLink };
    const id        = deriveArticleId(itemForId);

    // Resolve publishedAt — prefer isoDate (already ISO 8601), fall back to pubDate parse
    let publishedAt;
    let dateOk = false;

    if (raw.isoDate) {
      const ts = new Date(raw.isoDate).getTime();
      if (!Number.isNaN(ts)) {
        publishedAt = raw.isoDate;
        dateOk      = true;
      }
    }

    if (!dateOk && raw.pubDate) {
      const ts = new Date(raw.pubDate).getTime();
      if (!Number.isNaN(ts)) {
        publishedAt = new Date(raw.pubDate).toISOString();
        dateOk      = true;
      }
    }

    if (!dateOk) {
      publishedAt = new Date().toISOString(); // fallback — enables fail-open window check
    }

    return {
      id,
      title:          (raw.title          || '').trim(),
      link:           cleanLink,
      category,
      feedTitle,
      feedUrl,
      publishedAt,
      contentSnippet: (raw.contentSnippet || '').trim(),
      fallback:       false,
      summary:        null,
      _dateOk:        dateOk, // internal flag removed before returning
    };
  });

  // Step 2: Deduplicate within this batch (same article from multiple feeds)
  const seenInBatch = new Set();
  const deduped = normalized.filter(article => {
    if (seenInBatch.has(article.id)) return false;
    seenInBatch.add(article.id);
    return true;
  });

  const batchDuplicates = normalized.length - deduped.length;

  // Step 3: Apply 25-hour window filter
  const inWindow = deduped.filter(article => isWithinWindow(article, nowMs));
  const windowRemoved = deduped.length - inWindow.length;

  // Step 4: Deduplicate against persistent state (already-sent articles)
  const newArticles = inWindow.filter(article => !state[article.id]);
  const stateRemoved = inWindow.length - newArticles.length;

  log.info('Filter complete', {
    rawCount:        rawArticles.length,
    afterBatchDedup: deduped.length,
    batchDuplicates,
    afterWindow:     inWindow.length,
    windowRemoved,
    afterStateDedup: newArticles.length,
    stateRemoved,
  });

  // Remove internal flag before returning
  return newArticles.map(({ _dateOk, ...article }) => article);
}
