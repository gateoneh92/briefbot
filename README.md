# Daily Newsletter Generator

A personal CLI that collects RSS feeds, summarizes them in Korean using Claude AI, and delivers a daily digest to your Gmail inbox.

**한국어 문서:** [README.ko.md](./README.ko.md)

---

## How It Works

```
RSS feeds (parallel, 10s timeout)
    ↓
Filter: 25-hour window · dedup · UTM strip
    ↓
Claude AI: Korean summaries per category
    ↓
Gmail SMTP → state saved (only after delivery confirmed)
```

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 24.0.0+ |
| Gmail account | 2FA must be enabled |
| Anthropic API key | Claude API or internal gateway |

---

## Installation

```bash
git clone <repo-url>
cd newsletter-cli
npm install
```

---

## Configuration

### 1. Environment variables

```bash
copy .env.example .env   # Windows
cp .env.example .env     # macOS/Linux
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_BASE_URL=https://api.anthropic.com   # or your internal gateway URL
ANTHROPIC_PROJECT_ID=                           # optional

GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

**Getting a Gmail App Password:**

1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required)
3. Search for **App passwords** → create one named `Newsletter CLI`
4. Paste the 16-character password into `GMAIL_APP_PASSWORD`

Verify SMTP before first run:
```bash
node --env-file=.env scripts/test-smtp.js
```

### 2. Feed and email config

```bash
copy config.example.json config.json
```

Edit `config.json`:

```json
{
  "feeds": [
    { "url": "https://news.ycombinator.com/rss", "category": "Dev" },
    { "url": "https://feeds.feedburner.com/ThePragmaticEngineer", "category": "Dev" },
    { "url": "https://www.technologyreview.com/feed/", "category": "AI" },
    { "url": "https://huggingface.co/blog/feed.xml", "category": "AI" },
    { "url": "https://techcrunch.com/feed/", "category": "Business" }
  ],
  "schedule": { "hour": 7 },
  "email": { "to": "your@gmail.com" }
}
```

---

## Usage

### Send newsletter now

```bash
node --env-file=.env src/cli.js run
```

Or double-click **`run-newsletter.bat`** (Windows).

### Preview without sending

```bash
node --env-file=.env src/cli.js run --dry-run
```

Opens an HTML preview in `output/preview-<timestamp>.html`. No email is sent, state is not updated.

### npm scripts

```bash
npm start        # live send
npm run dry-run  # preview only
```

---

## Automation (Windows Task Scheduler)

### Quick setup via PowerShell (run as Administrator)

```powershell
$action = New-ScheduledTaskAction `
    -Execute 'C:\Program Files\nodejs\node.exe' `
    -Argument '--env-file=.env src/cli.js run' `
    -WorkingDirectory 'C:\path\to\newsletter-cli'

$trigger = New-ScheduledTaskTrigger -Daily -At '07:00'

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask `
    -TaskName 'Daily Newsletter' `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Daily newsletter via Claude AI'
```

> **Important:** Set `-WorkingDirectory` to the absolute path of your project folder. Without it, the task cannot find `config.json`, `.env`, or the `data/` and `logs/` directories.

### Enable / Disable the schedule

Double-click the included batch files:

| File | Action |
|------|--------|
| `newsletter-on.bat` | Enable daily schedule |
| `newsletter-off.bat` | Disable daily schedule |
| `run-newsletter.bat` | Send newsletter right now |

Or via command line:
```cmd
schtasks /Change /TN "Daily Newsletter" /ENABLE
schtasks /Change /TN "Daily Newsletter" /DISABLE
```

### Manual GUI setup

`Win + R` → `taskschd.msc`

| Tab | Setting |
|-----|---------|
| General | Name: `Daily Newsletter` |
| Triggers | Daily at 07:00 |
| Actions | Program: `node.exe` · Arguments: `--env-file=.env src/cli.js run` · **Start in: `<project folder>`** |
| Settings | If already running: **Do not start a new instance** |

---

## Troubleshooting

### "No email received" after running

**This is expected behavior if you already ran the newsletter today.**

The deduplication system tracks every sent article in `data/sent-articles.json`. If all articles in the current 25-hour window were already sent in a previous run, the pipeline logs:

```
No new articles — skipping send
```

and exits with code `0` without sending anything. This prevents duplicate emails.

**To force a send (e.g. for testing):**

```cmd
del data\sent-articles.json
```

Then run again. The state file will be rebuilt from scratch after the next successful send.

---

### Other common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[ENV ERROR] Missing required environment variables` | `.env` not loaded | Run with `--env-file=.env` flag |
| `EAUTH 535` on SMTP test | Wrong password | Use App Password, not Google account password |
| `EAUTH 534` on SMTP test | 2FA not enabled | Enable 2-Step Verification in Google account |
| `ECONNREFUSED` on SMTP test | Port 587 blocked | Check firewall / VPN |
| Task Scheduler result `0x1` | Pipeline error | Check `logs/YYYY-MM-DD.log` for `ERROR` entries |
| Task Scheduler result `0x41301` | Task still running | Wait; previous run may be slow (AI summarization) |

### Task Scheduler last run result codes

| Code | Meaning |
|------|---------|
| `0x0` | Success |
| `0x1` | Error — check log file |
| `0x41301` | Still running |
| `0x41303` | Never run |

### Reading logs

```powershell
# Today's log
Get-Content logs\2026-03-23.log

# Errors and warnings only
Select-String "ERROR|WARN" logs\2026-03-23.log
```

---

## Project Structure

```
newsletter-cli/
├── src/
│   ├── cli.js              # Entry point — pipeline orchestration
│   ├── logger.js           # Structured logger → logs/YYYY-MM-DD.log
│   ├── config/
│   │   ├── schema.js       # Zod schema
│   │   └── loader.js       # config.json + .env loader
│   ├── fetcher/            # Parallel RSS fetch (rss-parser, 10s timeout)
│   ├── state/              # Sent-article state (data/sent-articles.json)
│   ├── filter/             # 25h window · dedup · UTM strip
│   ├── summarizer/         # Claude AI summarization (batched by category)
│   ├── renderer/           # HTML + plain-text email builder
│   └── mailer/             # Gmail SMTP sender (nodemailer)
├── scripts/
│   └── test-smtp.js        # SMTP smoke test
├── data/
│   └── sent-articles.json  # Auto-generated, gitignored
├── logs/
│   └── YYYY-MM-DD.log      # Auto-generated, gitignored
├── output/
│   └── preview-*.html      # --dry-run previews, gitignored
├── newsletter-on.bat        # Enable Task Scheduler job
├── newsletter-off.bat       # Disable Task Scheduler job
├── run-newsletter.bat       # Run immediately
├── config.json              # Your feed config (gitignored)
├── config.example.json      # Config template (committed)
├── .env                     # Your secrets (gitignored)
└── .env.example             # Env template (committed)
```

---

## Tech Stack

- **Runtime:** Node.js 24 (ESM)
- **AI:** `@anthropic-ai/sdk` — Claude Sonnet
- **RSS:** `rss-parser`
- **Email:** `nodemailer` — Gmail SMTP port 587 STARTTLS
- **Validation:** `zod`
- **Scheduler:** Windows Task Scheduler (no always-on process)
