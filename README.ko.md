# 데일리 뉴스레터 생성기

관심 RSS 피드를 수집하고, Claude AI로 한국어 요약을 만들어 매일 Gmail로 발송하는 개인용 CLI입니다.

**English docs:** [README.md](./README.md)

---

## 동작 방식

```
RSS 피드 수집 (병렬, 10초 타임아웃)
    ↓
필터링: 25시간 창 · 중복 제거 · UTM 제거
    ↓
Claude AI: 카테고리별 한국어 요약
    ↓
Gmail SMTP 발송 → 발송 확인 후 상태 저장
```

---

## 사전 요구사항

| 항목 | 버전/조건 |
|------|-----------|
| Node.js | 24.0.0 이상 |
| Gmail 계정 | 2단계 인증 필수 |
| Anthropic API 키 | Claude API 또는 내부 게이트웨이 |

---

## 설치

```bash
git clone <repo-url>
cd newsletter-cli
npm install
```

---

## 설정

### 1. 환경 변수

```bash
copy .env.example .env
```

`.env` 파일 편집:

```env
ANTHROPIC_API_KEY=발급받은_API_키
ANTHROPIC_BASE_URL=https://api.anthropic.com   # 또는 내부 게이트웨이 URL
ANTHROPIC_PROJECT_ID=                           # 선택 사항

GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

**Gmail 앱 비밀번호 생성:**

1. [Google 계정 → 보안](https://myaccount.google.com/security) 접속
2. **2단계 인증** 활성화 (필수)
3. **앱 비밀번호** 검색 → `Newsletter CLI` 이름으로 생성
4. 16자리 비밀번호를 `GMAIL_APP_PASSWORD`에 입력

> ⚠️ 일반 Google 계정 비밀번호가 아닌 **앱 비밀번호**를 사용해야 합니다.

SMTP 연결 사전 확인:
```bash
node --env-file=.env scripts/test-smtp.js
```

### 2. 피드 및 이메일 설정

```bash
copy config.example.json config.json
```

`config.json` 편집:

```json
{
  "feeds": [
    { "url": "https://news.ycombinator.com/rss", "category": "개발" },
    { "url": "https://feeds.feedburner.com/ThePragmaticEngineer", "category": "개발" },
    { "url": "https://www.technologyreview.com/feed/", "category": "AI" },
    { "url": "https://huggingface.co/blog/feed.xml", "category": "AI" },
    { "url": "https://techcrunch.com/feed/", "category": "비즈니스" }
  ],
  "schedule": { "hour": 7 },
  "email": { "to": "your@gmail.com" }
}
```

---

## 사용법

### 지금 바로 발송

```bash
node --env-file=.env src/cli.js run
```

또는 **`run-newsletter.bat`** 더블클릭 (Windows).

### 미리보기 (발송 없음)

```bash
node --env-file=.env src/cli.js run --dry-run
```

`output/preview-<timestamp>.html` 파일이 생성됩니다. 이메일은 발송되지 않고 상태도 업데이트되지 않습니다.

### npm 스크립트

```bash
npm start        # 라이브 발송
npm run dry-run  # 미리보기만
```

---

## 자동화 (Windows Task Scheduler)

### PowerShell로 빠른 설정 (관리자 권한)

```powershell
$action = New-ScheduledTaskAction `
    -Execute 'C:\Program Files\nodejs\node.exe' `
    -Argument '--env-file=.env src/cli.js run' `
    -WorkingDirectory 'C:\경로\newsletter-cli'   # ← 실제 경로로 변경

$trigger = New-ScheduledTaskTrigger -Daily -At '07:00'

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask `
    -TaskName 'Daily Newsletter' `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Daily newsletter via Claude AI'
```

> **중요:** `-WorkingDirectory`는 반드시 프로젝트 폴더의 절대 경로를 입력해야 합니다. 없으면 `config.json`, `.env`, `data/`, `logs/` 경로를 찾지 못합니다.

### 자동 발송 켜기 / 끄기

포함된 배치 파일을 더블클릭하세요:

| 파일 | 동작 |
|------|------|
| `newsletter-on.bat` | 매일 자동 발송 켜기 |
| `newsletter-off.bat` | 매일 자동 발송 끄기 |
| `run-newsletter.bat` | 지금 즉시 발송 |

명령어로도 가능:
```cmd
schtasks /Change /TN "Daily Newsletter" /ENABLE
schtasks /Change /TN "Daily Newsletter" /DISABLE
```

### GUI 설정

`Win + R` → `taskschd.msc`

| 탭 | 설정값 |
|----|--------|
| 일반 | 이름: `Daily Newsletter` |
| 트리거 | 매일 오전 07:00 |
| 동작 | 프로그램: `node.exe` · 인수: `--env-file=.env src/cli.js run` · **시작 위치: `<프로젝트 폴더>`** |
| 설정 | 이미 실행 중이면: **새 인스턴스를 시작하지 않음** |

---

## 문제 해결

### 실행했는데 메일이 안 와요

**오늘 이미 발송한 경우 정상 동작입니다.**

중복 제거 시스템이 발송한 기사를 `data/sent-articles.json`에 기록합니다. 현재 25시간 창 안의 기사가 이미 모두 발송된 경우, 파이프라인이 다음 메시지를 남기고 종료합니다:

```
No new articles — skipping send
```

중복 이메일을 방지하기 위한 의도된 동작입니다.

**강제로 다시 발송하려면 (테스트 목적):**

```cmd
del data\sent-articles.json
```

이후 다시 실행하면 메일이 발송됩니다. 다음 성공적인 발송 후 상태 파일이 새로 만들어집니다.

---

### 기타 오류

| 증상 | 원인 | 해결 |
|------|------|------|
| `[ENV ERROR] Missing required environment variables` | `.env` 미로드 | `--env-file=.env` 플래그 확인 |
| `EAUTH 535` (SMTP 테스트) | 잘못된 비밀번호 | 앱 비밀번호 사용 (Google 계정 비밀번호 ❌) |
| `EAUTH 534` (SMTP 테스트) | 2단계 인증 미활성화 | Google 계정에서 2단계 인증 먼저 활성화 |
| `ECONNREFUSED` (SMTP 테스트) | 포트 587 차단 | 방화벽 / VPN 확인 |
| Task Scheduler 결과 `0x1` | 파이프라인 오류 | `logs/YYYY-MM-DD.log`의 `ERROR` 항목 확인 |
| Task Scheduler 결과 `0x41301` | 아직 실행 중 | 대기 (AI 요약 시간 소요) |

### Task Scheduler 마지막 실행 결과 코드

| 코드 | 의미 |
|------|------|
| `0x0` | 정상 완료 |
| `0x1` | 오류 — 로그 확인 필요 |
| `0x41301` | 실행 중 |
| `0x41303` | 아직 실행된 적 없음 |

### 로그 확인

```powershell
# 오늘 로그 전체
Get-Content logs\2026-03-23.log

# 오류/경고만 필터
Select-String "ERROR|WARN" logs\2026-03-23.log
```

---

## 프로젝트 구조

```
newsletter-cli/
├── src/
│   ├── cli.js              # 진입점 — 파이프라인 오케스트레이션
│   ├── logger.js           # 구조화 로그 → logs/YYYY-MM-DD.log
│   ├── config/
│   │   ├── schema.js       # Zod 스키마
│   │   └── loader.js       # config.json + .env 로더
│   ├── fetcher/            # RSS 병렬 수집 (rss-parser, 10초 타임아웃)
│   ├── state/              # 발송 상태 관리 (data/sent-articles.json)
│   ├── filter/             # 25시간 필터 · 중복 제거 · UTM 제거
│   ├── summarizer/         # Claude AI 요약 (카테고리별 배치)
│   ├── renderer/           # HTML + 텍스트 이메일 렌더링
│   └── mailer/             # Gmail SMTP 발송 (nodemailer)
├── scripts/
│   └── test-smtp.js        # SMTP 연결 테스트
├── data/
│   └── sent-articles.json  # 자동 생성, gitignore
├── logs/
│   └── YYYY-MM-DD.log      # 자동 생성, gitignore
├── output/
│   └── preview-*.html      # --dry-run 미리보기, gitignore
├── newsletter-on.bat        # 자동 발송 켜기
├── newsletter-off.bat       # 자동 발송 끄기
├── run-newsletter.bat       # 지금 즉시 발송
├── config.json              # 피드 설정 (gitignore — 개인 정보 포함)
├── config.example.json      # 설정 템플릿 (커밋됨)
├── .env                     # API 키, Gmail 비밀번호 (gitignore)
└── .env.example             # 환경 변수 템플릿 (커밋됨)
```

---

## 기술 스택

- **런타임:** Node.js 24 (ESM)
- **AI:** `@anthropic-ai/sdk` — Claude Sonnet
- **RSS:** `rss-parser`
- **이메일:** `nodemailer` — Gmail SMTP 포트 587 STARTTLS
- **검증:** `zod`
- **스케줄러:** Windows Task Scheduler (상주 프로세스 없음)
