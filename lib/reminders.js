// lib/reminders.js — Logic nhắc lịch tự động (gửi trước 24h và 1h).
// Thiết kế chịu được việc Render ngủ: dùng "cửa sổ thời gian" + cờ đã-gửi,
// nên dù cron chạy thưa hay service vừa thức dậy thì vẫn gửi đúng, không gửi trùng.
const { readCSV, writeCSV, withLock } = require('./csv');
const { apptInstant } = require('./schedule');
const { sendMail, reminderEmail } = require('./mailer');

const APPT_COLUMNS = [
  'id', 'patient_name', 'patient_email', 'patient_phone', 'insurance',
  'province', 'district', 'ward', 'address_detail',
  'clinic_id', 'clinic_name', 'clinic_address',
  'doctor_id', 'doctor_name', 'specialty', 'symptom',
  'date', 'slot', 'status', 'reminder_24h_sent', 'reminder_1h_sent', 'created_at',
];

const HOUR = 3600 * 1000;

async function runReminders() {
  return withLock('appointments.csv', async () => {
    const rows = readCSV('appointments.csv');
    const now = Date.now();
    let sent24 = 0, sent1 = 0, changed = false;

    for (const a of rows) {
      if (a.status !== 'confirmed') continue;
      const t = apptInstant(a.date, a.slot).getTime();
      const diff = t - now; // ms còn lại tới giờ hẹn
      if (diff <= 0) continue; // đã qua

      // Nhắc 24h: khi còn <=24h và >1h, chưa gửi
      if (diff <= 24 * HOUR && diff > 1 * HOUR && a.reminder_24h_sent !== 'yes') {
        const emailData24 = reminderEmail(a, '24h');
        const r = await sendMail({ to: a.patient_email, ...emailData24 });
        if (r.ok) { a.reminder_24h_sent = 'yes'; changed = true; sent24++; }
      }
      // Nhắc 1h: khi còn <=1h và >0, chưa gửi
      if (diff <= 1 * HOUR && diff > 0 && a.reminder_1h_sent !== 'yes') {
        const emailData1h = reminderEmail(a, '1h');
        const r = await sendMail({ to: a.patient_email, ...emailData1h });
        if (r.ok) { a.reminder_1h_sent = 'yes'; changed = true; sent1++; }
      }
    }

    if (changed) writeCSV('appointments.csv', rows, APPT_COLUMNS);
    return { ok: true, sent24, sent1, scanned: rows.length, at: new Date().toISOString() };
  });
}

module.exports = { runReminders, APPT_COLUMNS };
