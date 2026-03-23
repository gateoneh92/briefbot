// src/renderer/index.js
import { log } from '../logger.js';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Render newsletter into subject + HTML + plain-text.
 * MAIL-01: grouped by category.
 * MAIL-02: title (link) + summary per article.
 * MAIL-03: subject = [뉴스레터] YYYY-MM-DD | 기사 N건.
 * MAIL-04: plain-text alternative.
 * MAIL-05: footer with feed errors and fallback count.
 *
 * @param {Article[]} articles
 * @param {{ feedErrors?: Array<{url:string, error:string}> }} options
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderEmail(articles, { feedErrors = [] } = {}) {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const subject = `[뉴스레터] ${dateStr} | 기사 ${articles.length}건`;

  // Group by category (preserving insertion order)
  const byCategory = new Map();
  for (const article of articles) {
    if (!byCategory.has(article.category)) {
      byCategory.set(article.category, []);
    }
    byCategory.get(article.category).push(article);
  }

  const html = buildHtml(articles, byCategory, feedErrors, dateStr);
  const text = buildText(articles, byCategory, feedErrors, dateStr);

  log.info('Email rendered', {
    subject,
    articleCount:  articles.length,
    categoryCount: byCategory.size,
    fallbackCount: articles.filter(a => a.fallback).length,
    feedErrorCount: feedErrors.length,
  });

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHtml(articles, byCategory, feedErrors, dateStr) {
  const fallbackArticles = articles.filter(a => a.fallback);

  // Category sections
  let categorySections = '';
  for (const [category, group] of byCategory) {
    const articleItems = group.map(article => {
      const pubLocal = formatDate(article.publishedAt);
      const fallbackBadge = article.fallback
        ? ' <span style="color:#c0392b;font-size:11px;font-weight:600;">[원문 발췌]</span>'
        : '';

      return `
      <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f0f0f0;">
        <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;line-height:1.4;">
          <a href="${escHtml(article.link)}" style="color:#1a1a2e;text-decoration:none;"
             target="_blank">${escHtml(article.title)}</a>
        </h3>
        <p style="margin:0 0 6px;font-size:13px;color:#444;line-height:1.7;">
          ${escHtml(article.summary)}${fallbackBadge}
        </p>
        <p style="margin:0;font-size:11px;color:#999;">
          ${escHtml(article.feedTitle)} · ${escHtml(pubLocal)}
        </p>
      </div>`;
    }).join('');

    categorySections += `
    <div style="margin-bottom:32px;">
      <h2 style="margin:0 0 16px;font-size:14px;font-weight:700;color:#fff;
                 background-color:#1a1a2e;padding:8px 12px;border-radius:4px;
                 letter-spacing:0.5px;">
        ${escHtml(category)}
        <span style="font-weight:400;font-size:12px;opacity:0.7;margin-left:6px;">${group.length}건</span>
      </h2>
      ${articleItems}
    </div>`;
  }

  // Footer
  let footerItems = '';

  if (feedErrors.length > 0) {
    const errorList = feedErrors
      .map(e => `<li style="margin-bottom:4px;">${escHtml(e.url)}</li>`)
      .join('');
    footerItems += `
      <p style="margin:0 0 8px;font-size:12px;color:#888;">
        <strong>수집 실패 피드 (${feedErrors.length}건):</strong>
        <ul style="margin:4px 0 0 16px;padding:0;">${errorList}</ul>
      </p>`;
  }

  if (fallbackArticles.length > 0) {
    footerItems += `
      <p style="margin:0;font-size:12px;color:#888;">
        ⚠ <strong>${fallbackArticles.length}건</strong>의 기사는 AI 요약에 실패하여 원문을 발췌했습니다.
        [원문 발췌] 표시로 확인할 수 있습니다.
      </p>`;
  }

  const footer = footerItems ? `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
      ${footerItems}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>뉴스레터 ${dateStr}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background-color:#1a1a2e;color:#fff;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Daily Newsletter</h1>
      <p style="margin:10px 0 0;font-size:13px;color:#a0a8c8;">
        ${dateStr} &nbsp;·&nbsp; 기사 ${articles.length}건
      </p>
    </div>

    <!-- Body -->
    <div style="background-color:#fff;padding:28px 24px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      ${categorySections}
      ${footer}
    </div>

    <!-- Bottom caption -->
    <p style="text-align:center;font-size:11px;color:#bbb;margin:16px 0 0;">
      자동 생성된 뉴스레터입니다 &nbsp;·&nbsp; Claude AI 요약
    </p>

  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Plain-text builder
// ---------------------------------------------------------------------------

function buildText(articles, byCategory, feedErrors, dateStr) {
  const line = '─'.repeat(40);
  let text = `Daily Newsletter — ${dateStr}\n기사 ${articles.length}건\n${line}\n\n`;

  for (const [category, group] of byCategory) {
    text += `【${category}】 (${group.length}건)\n${'─'.repeat(20)}\n\n`;
    for (const article of group) {
      const fallbackNote = article.fallback ? ' [원문 발췌]' : '';
      text += `▶ ${article.title}\n`;
      text += `   ${article.link}\n`;
      text += `   ${article.summary}${fallbackNote}\n`;
      text += `   ${article.feedTitle} · ${formatDate(article.publishedAt)}\n\n`;
    }
  }

  if (feedErrors.length > 0) {
    text += `${line}\n수집 실패 피드 (${feedErrors.length}건):\n`;
    for (const e of feedErrors) {
      text += `  - ${e.url}\n`;
    }
  }

  text += `\n${line}\n자동 생성된 뉴스레터 · Claude AI 요약\n`;
  return text;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleString('ko-KR', {
      timeZone:    'Asia/Seoul',
      month:       'short',
      day:         'numeric',
      hour:        '2-digit',
      minute:      '2-digit',
    });
  } catch {
    return isoString;
  }
}
