// scripts/test-smtp.js
// Gmail SMTP 연결 및 앱 비밀번호 검증 스크립트.
// Phase 2 진행 전 반드시 이 테스트를 통과해야 합니다.
//
// 실행 방법:
//   node --env-file=.env scripts/test-smtp.js
//
// 성공 시 출력:
//   SMTP connection verified — credentials accepted
//   Message sent: <message-id>
//   [SMTP TEST] PASSED — check your Gmail inbox
//
// 필요 환경 변수 (.env):
//   GMAIL_USER          — 발송에 사용할 Gmail 주소
//   GMAIL_APP_PASSWORD  — 16자리 앱 비밀번호 (Google 계정 비밀번호 아님!)
//
// Gmail 앱 비밀번호 설정:
//   1. Google 계정 > 보안 > 2단계 인증 활성화 (필수)
//   2. Google 계정 > 보안 > 2단계 인증 > 앱 비밀번호
//   3. "Newsletter CLI" 이름으로 앱 비밀번호 생성
//   4. 16자리 복사 (공백 제거 또는 그대로 사용 가능)
//
// 주요 에러 코드:
//   EAUTH 535  — 앱 비밀번호 틀림 또는 Google 계정 비밀번호 사용 → 앱 비밀번호 재생성
//   EAUTH 534  — 2단계 인증 미활성화 → Google 계정에서 2단계 인증 먼저 활성화
//   ECONNREFUSED — 포트 587 차단 → 방화벽/VPN 확인
//   ETIMEDOUT  — 포트 587 아웃바운드 차단 → Windows 방화벽 확인

import nodemailer from 'nodemailer';

// 필수 환경 변수 확인
const requiredVars = ['GMAIL_USER', 'GMAIL_APP_PASSWORD'];
const missingVars = requiredVars.filter((k) => !process.env[k]);
if (missingVars.length > 0) {
  console.error('[SMTP TEST] Missing env vars:', missingVars.join(', '));
  console.error('Run with: node --env-file=.env scripts/test-smtp.js');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,  // false = STARTTLS (포트 587). true는 SSL 포트 465 전용.
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Step 1: 연결 검증 (메일 발송 없이 인증만 확인)
try {
  await transporter.verify();
  console.log('SMTP connection verified — credentials accepted');
} catch (err) {
  console.error('[SMTP TEST] Connection verification failed:', err.message);
  console.error('Error code:', err.code);
  process.exit(1);
}

// Step 2: 본인에게 테스트 메일 발송
try {
  const info = await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    subject: 'Newsletter CLI — SMTP smoke test',
    text: 'If you can read this, SMTP is working correctly.',
  });
  console.log('Message sent:', info.messageId);
  console.log('[SMTP TEST] PASSED — check your Gmail inbox');
} catch (err) {
  console.error('[SMTP TEST] Send failed:', err.message);
  process.exit(1);
}
