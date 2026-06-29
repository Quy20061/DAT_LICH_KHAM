// lib/mailer.js — Gửi email THẬT qua SMTP. Mọi khóa/secret lấy từ biến môi trường.
// Hỗ trợ Gmail App Password hoặc SendGrid (hoặc bất kỳ SMTP nào).
const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,      // 'true' nếu dùng cổng 465
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
} = process.env;

let transporter = null;
let MODE = 'console'; // 'smtp' | 'console'

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE) === 'true', // true cho 465, false cho 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  MODE = 'smtp';
  console.log(`📧 Mailer: SMTP đã bật (host=${SMTP_HOST})`);
} else {
  console.log('📧 Mailer: chưa cấu hình SMTP → chạy chế độ CONSOLE (chỉ in ra log, không gửi thật).');
}

const FROM = MAIL_FROM || SMTP_USER || 'no-reply@datlichkham.vn';

async function sendMail({ to, subject, html, text }) {
  if (MODE === 'console') {
    console.log('────── EMAIL (console mode) ──────');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log((text || html || '').slice(0, 400));
    console.log('──────────────────────────────────');
    return { ok: true, mode: 'console' };
  }
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html, text });
    return { ok: true, mode: 'smtp', id: info.messageId };
  } catch (err) {
    console.error('❌ Gửi email lỗi:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── MẪU EMAIL ───────────────────────────────────────────────────────
function shell(title, bodyHtml) {
  return `
  <div style="font-family:'Times New Roman',Georgia,serif;max-width:560px;margin:0 auto;color:#1e293b">
    <div style="background:#0d3b66;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">
      <div style="font-size:20px;font-weight:bold">🏥 Phòng khám trực tuyến</div>
      <div style="font-size:13px;opacity:.85">${title}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px">
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
      <div style="font-size:12px;color:#64748b">Email tự động, vui lòng không trả lời. Cần hỗ trợ xin liên hệ phòng khám.</div>
    </div>
  </div>`;
}

function apptRows(a) {
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#64748b">${k}</td><td style="padding:6px 0;text-align:right;font-weight:bold">${v}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:15px;margin:8px 0">
    ${row('Mã lịch hẹn', a.id)}
    ${row('Bác sĩ', a.doctor_name)}
    ${row('Chuyên khoa', a.specialty)}
    ${row('Phòng khám', a.clinic_name)}
    ${row('Địa chỉ', a.clinic_address)}
    ${row('Ngày khám', a.date)}
    ${row('Giờ khám', a.slot)}
  </table>`;
}

function confirmationEmail(a) {
  return {
    subject: `Xác nhận lịch khám ${a.date} ${a.slot} — Mã ${a.id}`,
    html: shell('Xác nhận đặt lịch thành công', `
      <p>Chào <b>${a.patient_name}</b>,</p>
      <p>Lịch khám của bạn đã được đặt thành công. Chi tiết:</p>
      ${apptRows(a)}
      <p>Vui lòng đến trước giờ hẹn 15 phút. Mang theo CCCD${a.insurance && a.insurance !== 'Không' ? ' và thẻ BHYT' : ''}.</p>`),
  };
}

function reminderEmail(a, hoursLeft) {
  const when = hoursLeft >= 24 ? 'ngày mai' : 'trong khoảng 1 giờ tới';
  return {
    subject: `Nhắc lịch khám ${when}: ${a.date} ${a.slot} — Mã ${a.id}`,
    html: shell(`Nhắc lịch khám (${when})`, `
      <p>Chào <b>${a.patient_name}</b>,</p>
      <p>Đây là email nhắc bạn có lịch khám <b>${when}</b>:</p>
      ${apptRows(a)}
      <p>Nếu bận, vui lòng liên hệ phòng khám để dời lịch.</p>`),
  };
}

module.exports = { sendMail, confirmationEmail, reminderEmail, MODE: () => MODE };
