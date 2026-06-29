// scripts/run-reminders.js — Chạy quét nhắc lịch MỘT LẦN rồi thoát.
// Dùng cho: `npm run reminders`, hoặc Render Cron Job, hoặc cron máy chủ.
// (Khác với endpoint HTTP /api/cron/run-reminders dùng cho dịch vụ ping bên ngoài.)
require('dotenv').config();
const { runReminders } = require('../lib/reminders');

runReminders()
  .then((r) => { console.log('Kết quả nhắc lịch:', r); process.exit(0); })
  .catch((e) => { console.error('Lỗi nhắc lịch:', e); process.exit(1); });
