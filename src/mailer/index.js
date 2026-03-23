// src/mailer/index.js
import nodemailer from 'nodemailer';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { log } from '../logger.js';

// ---------------------------------------------------------------------------
// SMTP transporter — Gmail port 587 STARTTLS (MAIL-06)
// Env vars guaranteed by validateEnv() before any pipeline code runs.
// ---------------------------------------------------------------------------

const transporter = nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:   587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Send the newsletter via Gmail SMTP.
 * MAIL-06: port 587, STARTTLS, App Password.
 * Caller must commit state AFTER this resolves (MAIL-07).
 *
 * @param {{ subject: string, html: string, text: string }} rendered
 * @param {{ email: { to: string } }} config
 * @returns {Promise<object>} nodemailer info object
 */
export async function sendNewsletter({ subject, html, text }, config) {
  const to = Array.isArray(config.email.to) ? config.email.to.join(', ') : config.email.to;
  log.info('Sending email', { to, subject });

  const info = await transporter.sendMail({
    from:    process.env.GMAIL_USER,
    to,
    subject,
    text,
    html,
  });

  log.info('Email sent', {
    messageId: info.messageId,
    to:        config.email.to,
    subject,
  });

  return info;
}

/**
 * Save rendered HTML to output/preview-<timestamp>.html instead of sending.
 * DEVX-01: --dry-run mode.
 *
 * @param {string} html
 * @returns {Promise<string>} absolute path of the saved file
 */
export async function saveDryRun(html) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = 'output';
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, `preview-${timestamp}.html`);
  await writeFile(filePath, html, 'utf8');
  log.info('Dry-run preview saved', { path: filePath });
  return filePath;
}
