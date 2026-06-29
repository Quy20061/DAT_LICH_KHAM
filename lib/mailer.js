// lib/mailer.js
const sgMail = require('@sendgrid/mail');

// Kiểm tra API Key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || `Phòng khám Online <${process.env.MAIL_FROM_EMAIL || 'hiyava3@gmail.com'}>`;
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || 'hiyava3@gmail.com';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Phòng khám Online';

// Cấu hình SendGrid
if (SENDGRID_API_KEY && SENDGRID_API_KEY.startsWith('SG.')) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('✅ SendGrid đã được cấu hình');
} else {
  console.warn('⚠️ Mailer: chưa cấu hình SendGrid → chạy chế độ CONSOLE (chỉ in ra log, không gửi thật)');
}

/**
 * Gửi email qua SendGrid
 * @param {Object} options - { to, subject, text, html }
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function sendMail(options) {
  // Nếu không có API Key, chạy chế độ console
  if (!SENDGRID_API_KEY || !SENDGRID_API_KEY.startsWith('SG.')) {
    console.log('📧 [CONSOLE MODE] Gửi email đến:', options.to);
    console.log('📧 Subject:', options.subject);
    if (options.html) console.log('📧 HTML:', options.html.substring(0, 200) + '...');
    if (options.text) console.log('📧 Text:', options.text.substring(0, 200) + '...');
    console.log('📧 ' + '='.repeat(50));
    return { ok: true, mode: 'console' };
  }

  try {
    const msg = {
      to: options.to,
      from: {
        email: MAIL_FROM_EMAIL,
        name: MAIL_FROM_NAME
      },
      subject: options.subject,
      text: options.text || options.html?.replace(/<[^>]+>/g, '') || '',
      html: options.html || '',
    };

    const response = await sgMail.send(msg);
    console.log(`✅ Email đã gửi đến ${options.to} (${response[0].statusCode})`);
    return { ok: true, messageId: response[0].headers['x-message-id'] };
  } catch (error) {
    console.error('❌ Lỗi gửi email:', error.response?.body || error.message);
    return { ok: false, error: error.response?.body || error.message };
  }
}

/**
 * Tạo email xác nhận đặt lịch
 */
function confirmationEmail(appointment) {
  const subject = `✅ Xác nhận đặt lịch khám - ${appointment.date} ${appointment.slot}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2c6b3f;">🏥 Xác nhận đặt lịch khám</h2>
      <p>Kính gửi <strong>${appointment.patient_name}</strong>,</p>
      <p>Cảm ơn bạn đã đặt lịch khám tại <strong>${appointment.clinic_name || 'Phòng khám Online'}</strong>.</p>
      
      <h3 style="color: #2c6b3f;">📋 Thông tin lịch hẹn</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ngày khám</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.date}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Khung giờ</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.slot}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Bác sĩ</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.doctor_name}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Chuyên khoa</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.specialty}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Địa chỉ</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.clinic_address || 'Đang cập nhật'}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Triệu chứng</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.symptom || 'Không có'}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>BHYT</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.insurance || 'Không có'}</td></tr>
      </table>
      
      <p style="margin-top: 20px; color: #666; font-size: 14px;">
        <strong>⚠️ Lưu ý:</strong> Vui lòng đến đúng giờ hẹn. Nếu cần hủy lịch, vui lòng thực hiện trước ít nhất 2 giờ.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
      <p style="color: #999; font-size: 12px; text-align: center;">
        Email này được gửi tự động. Vui lòng không trả lời.<br>
        © ${new Date().getFullYear()} Phòng khám Online
      </p>
    </div>
  `;
  return { subject, html };
}

/**
 * Tạo email nhắc lịch
 */
function reminderEmail(appointment, type) {
  const is24h = type === '24h';
  const subject = is24h 
    ? `⏰ Nhắc lịch khám ngày mai - ${appointment.date}`
    : `⏰ Nhắc lịch khám trong 1 giờ tới - ${appointment.date}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #e67e22;">⏰ Nhắc lịch khám</h2>
      <p>Kính gửi <strong>${appointment.patient_name}</strong>,</p>
      <p>${is24h ? 'Đây là lời nhắc lịch khám của bạn vào ngày mai.' : 'Đây là lời nhắc lịch khám của bạn trong 1 giờ tới.'}</p>
      
      <h3 style="color: #e67e22;">📋 Thông tin lịch hẹn</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ngày khám</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.date}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Khung giờ</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.slot}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Bác sĩ</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.doctor_name}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Địa chỉ</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.clinic_address || 'Đang cập nhật'}</td></tr>
      </table>
      
      <p style="margin-top: 20px; color: #666; font-size: 14px;">
        <strong>⚠️ Lưu ý:</strong> Vui lòng đến đúng giờ hẹn. Nếu cần hủy lịch, vui lòng thực hiện trước ít nhất 2 giờ.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
      <p style="color: #999; font-size: 12px; text-align: center;">
        Email này được gửi tự động. Vui lòng không trả lời.<br>
        © ${new Date().getFullYear()} Phòng khám Online
      </p>
    </div>
  `;
  return { subject, html };
}

module.exports = { sendMail, confirmationEmail, reminderEmail };