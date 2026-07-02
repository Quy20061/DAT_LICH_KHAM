// lib/mailer.js - EmailJS với 1 template, nội dung render từ Node.js

const https = require('https');

const EMAILJS_SERVICE_ID  = process.env.EMAILJS_SERVICE_ID  || 'service_wj2e8p1';
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || 'template_u20tyjq';
const EMAILJS_USER_ID     = process.env.EMAILJS_USER_ID     || 'vJsDA36FftetIb3k6';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || 'dN6eEnEKvSrAVhntYKMc';

const MAIL_FROM_NAME  = process.env.MAIL_FROM_NAME  || 'Phòng khám Online';
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || 'hiyava3@gmail.com';

console.log('✅ EmailJS đã được cấu hình (service:', EMAILJS_SERVICE_ID, ')');

function emailjsPost(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.emailjs.com',
      path: '/api/v1.0/email/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'origin': 'http://localhost',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) resolve({ statusCode: res.statusCode, body: data });
        else reject(new Error(`EmailJS ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendMail(options) {
  try {
    const payload = {
      service_id:   EMAILJS_SERVICE_ID,
      template_id:  EMAILJS_TEMPLATE_ID,
      user_id:      EMAILJS_USER_ID,
      accessToken:  EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email:  options.to,
        to_name:   options.to_name || options.to,
        from_name: MAIL_FROM_NAME,
        reply_to:  MAIL_FROM_EMAIL,
        subject:   options.subject,
        // Toàn bộ nội dung HTML render sẵn từ Node.js → đưa vào {{content}}
        content:   options.html || options.text || '',
      },
    };
    await emailjsPost(payload);
    console.log(`✅ Email đã gửi đến ${options.to} | ${options.subject}`);
    return { ok: true };
  } catch (error) {
    console.error('❌ Lỗi gửi email:', error.message);
    return { ok: false, error: error.message };
  }
}

// ── Shared style ──────────────────────────────────────────────────────────────
const tableRow = (label, value) => `
  <tr>
    <td style="padding:8px 12px;color:#888;white-space:nowrap;">${label}</td>
    <td style="padding:8px 12px;color:#2c3e50;font-weight:600;">${value || '—'}</td>
  </tr>`;

const apptTable = (a) => `
  <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:12px;font-size:14px;">
    ${tableRow('Mã lịch hẹn', a.id)}
    ${tableRow('Bác sĩ', a.doctor_name)}
    ${tableRow('Chuyên khoa', a.specialty)}
    ${tableRow('Phòng khám', a.clinic_name || 'Phòng khám Online')}
    ${tableRow('Địa chỉ', a.clinic_address || 'Đang cập nhật')}
    ${tableRow('Ngày khám', a.date)}
    ${tableRow('Giờ khám', a.slot)}
  </table>`;

const emailWrap = (headerColor, icon, title, body) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:${headerColor};padding:20px 24px;border-radius:8px 8px 0 0;">
    <div style="color:#fff;font-size:18px;font-weight:700;">${icon} ${title}</div>
  </div>
  <div style="border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    ${body}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="color:#aaa;font-size:12px;text-align:center;margin:0;">
      Email này được gửi tự động. Vui lòng không trả lời.<br>
      © ${new Date().getFullYear()} Phòng khám Online
    </p>
  </div>
</div>`;

// ── confirmationEmail ─────────────────────────────────────────────────────────
function confirmationEmail(a) {
  const subject = `✅ Xác nhận đặt lịch khám - ${a.date} ${a.slot} — Mã ${a.id}`;
  const html = emailWrap(
    '#2c6b3f', '🏥', 'Xác nhận đặt lịch khám',
    `<p style="color:#2c3e50;">Kính gửi <strong>${a.patient_name}</strong>,</p>
     <p style="color:#555;">Lịch khám của bạn tại <strong>${a.clinic_name || 'Phòng khám Online'}</strong> đã được xác nhận thành công.</p>
     ${apptTable(a)}
     ${a.symptom ? tableRow('Triệu chứng', a.symptom) : ''}
     ${a.insurance ? tableRow('Mã thẻ BHYT', a.insurance) : ''}
     <p style="margin-top:16px;color:#555;font-size:14px;">⚠️ Vui lòng đến trước giờ hẹn <strong>15 phút</strong>.</p>`
  );
  return { subject, html, to_name: a.patient_name };
}

// ── reminderEmail ─────────────────────────────────────────────────────────────
function reminderEmail(a, type) {
  const is24h = type === '24h';
  const subject = is24h
    ? `⏰ Nhắc lịch khám ngày mai: ${a.date} ${a.slot} — Mã ${a.id}`
    : `⏰ Nhắc lịch khám trong 1 giờ tới: ${a.date} ${a.slot} — Mã ${a.id}`;
  const html = emailWrap(
    '#e67e22', '⏰', is24h ? 'Nhắc lịch khám (ngày mai)' : 'Nhắc lịch khám (1 giờ tới)',
    `<p style="color:#2c3e50;">Kính gửi <strong>${a.patient_name}</strong>,</p>
     <p style="color:#555;">${is24h
       ? 'Đây là lời nhắc bạn có lịch khám vào <strong>ngày mai</strong>.'
       : 'Bạn có lịch khám trong <strong>1 giờ tới</strong>. Vui lòng chuẩn bị!'}</p>
     ${apptTable(a)}
     <p style="margin-top:16px;color:#555;font-size:14px;">⚠️ Vui lòng đến trước giờ hẹn <strong>15 phút</strong>. Nếu cần hủy, vui lòng liên hệ phòng khám.</p>`
  );
  return { subject, html, to_name: a.patient_name };
}

// ── cancellationEmail ─────────────────────────────────────────────────────────
function cancellationEmail(a, cancelledBy) {
  const isSelf = cancelledBy === 'patient';
  const subject = `❌ Lịch khám đã bị hủy - ${a.date} ${a.slot} — Mã ${a.id}`;
  const html = emailWrap(
    '#c0392b', '❌', 'Thông báo hủy lịch khám',
    `<p style="color:#2c3e50;">Kính gửi <strong>${a.patient_name}</strong>,</p>
     <p style="color:#555;">${isSelf
       ? 'Lịch khám dưới đây đã được <strong>hủy thành công</strong> theo yêu cầu của bạn.'
       : 'Lịch khám dưới đây đã bị <strong>hủy bởi phòng khám</strong>. Vui lòng liên hệ để biết thêm chi tiết.'}</p>
     ${apptTable(a)}
     <p style="margin-top:16px;color:#555;font-size:14px;">Nếu muốn đặt lịch mới, vui lòng truy cập hệ thống và đặt lại.</p>`
  );
  return { subject, html, to_name: a.patient_name };
}

module.exports = { sendMail, confirmationEmail, reminderEmail, cancellationEmail };