# Daily Newsletter Generator

## What This Is

매일 아침 개발/기술, AI/ML, 비즈니스/스타트업 분야의 RSS 피드를 자동으로 수집하고, Claude AI로 각 아티클을 요약하여 Gmail로 발송하는 개인용 CLI 도구. 설정 파일에 RSS URL을 관리하고 Node.js 스케줄러로 자동 실행한다.

## Core Value

매일 아침 관심 분야의 핵심 뉴스를 AI 요약으로 빠르게 파악할 수 있어야 한다 — 읽지 않은 아티클이 쌓이는 게 아니라, 실제로 소화할 수 있는 형태로 도착해야 한다.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] RSS 피드 URL을 설정 파일(JSON)에 등록/관리
- [ ] 등록된 RSS 피드에서 최신 아티클 수집 (지난 24시간 기준)
- [ ] Claude AI API로 각 아티클 1~3문장 한국어 요약
- [ ] 카테고리(개발/AI/비즈니스)별로 그룹화된 HTML 메일 생성
- [ ] Gmail SMTP로 본인 이메일에 자동 발송
- [ ] 매일 지정 시각에 자동 실행 (Windows Task Scheduler 또는 node-cron)
- [ ] 아티클이 없는 날은 발송 스킵

### Out of Scope

- 구독자 관리 / 다수 수신자 발송 — 개인용 도구이므로
- 웹 대시보드 — CLI로 충분
- OPML 가져오기 — 설정 파일 직접 편집으로 단순화
- 소셜 공유 기능 — 개인 소비 목적

## Context

- **플랫폼:** Windows 10, Node.js v24
- **AI:** Anthropic Claude API (claude-sonnet-4-6)
- **이메일:** Gmail SMTP (앱 비밀번호 방식)
- **RSS 관심 분야:** 개발/기술, AI/ML, 비즈니스/스타트업
- **발송 주기:** 매일 (지정 시각)
- **수신자:** 본인만

## Constraints

- **Tech Stack:** Node.js — 이미 설치된 환경
- **Email:** Gmail SMTP — 별도 서비스 가입 불필요
- **API:** Anthropic API 키 필요 — 환경변수(.env)로 관리
- **비용:** Claude API 호출 비용 발생 — 요약 길이/횟수 최적화 필요

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude AI 요약 | 단순 헤드라인 모음보다 실제 읽기 가치 높음 | — Pending |
| Gmail SMTP | 별도 서비스 없이 바로 사용 가능 | — Pending |
| Node.js CLI | Windows 환경, 설치된 런타임 활용 | — Pending |
| 설정 파일 방식 | OPML보다 단순, 직접 편집으로 충분 | — Pending |

---
*Last updated: 2026-03-20 after initialization*
