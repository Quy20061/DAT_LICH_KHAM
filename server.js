require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const cron = require('node-cron');

const { readCSV, writeCSV, appendCSV, withLock } = require('./lib/csv');
const { sendMail, confirmationEmail } = require('./lib/mailer');
const { validateBooking } = require('./lib/schedule');
const { runReminders, APPT_COLUMNS } = require('./lib/reminders');

const app = express();
const PORT = process.env.PORT || 3000;

const USER_COLUMNS = ['id', 'name', 'email', 'phone', 'password_hash', 'role', 'created_at'];
const BLOCK_COLUMNS = ['doctor_id', 'date', 'slot', 'reason', 'created_at'];

// Email admin lấy từ env (phân tách bằng dấu phẩy). Vd: ADMIN_EMAILS=admin@pk.vn,quanly@pk.vn
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const isAdminEmail = (email) => ADMIN_EMAILS.includes((email || '').toLowerCase());

// ── MIDDLEWARE ──────────────────────────────────────────────
app.set('trust proxy', 1); // cần khi chạy sau proxy của Render để cookie hoạt động
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_only_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production', // chỉ gửi cookie qua HTTPS khi production
    sameSite: 'lax',
  },
}));

// ── PASSWORD HELPERS ────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const calc = crypto.createHmac('sha256', salt).update(password).digest('hex');
  const a = Buffer.from(calc), b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone || '', role: isAdminEmail(u.email) ? 'admin' : 'patient' };
}
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ dành cho quản trị' });
  next();
}

// ── VALIDATE ────────────────────────────────────────────────
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
const isPhoneVN = (p) => /^0\d{9}$/.test((p || '').replace(/\s/g, ''));

// ── AUTH ROUTES ─────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.json({ ok: false, error: 'Thiếu thông tin bắt buộc' });
  if (!isEmail(email)) return res.json({ ok: false, error: 'Email không hợp lệ' });
  if (phone && !isPhoneVN(phone)) return res.json({ ok: false, error: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0' });
  if (password.length < 6) return res.json({ ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự' });

  const users = readCSV('users.csv');
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase()))
    return res.json({ ok: false, error: 'Email này đã được đăng ký' });

  const newUser = {
    id: 'U' + Date.now(),
    name, email: email.toLowerCase(), phone: phone || '',
    password_hash: hashPassword(password),
    role: isAdminEmail(email) ? 'admin' : 'patient',
    created_at: new Date().toISOString(),
  };
  appendCSV('users.csv', newUser, USER_COLUMNS);
  req.session.user = sessionUser(newUser);
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, error: 'Thiếu email hoặc mật khẩu' });
  const users = readCSV('users.csv');
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash))
    return res.json({ ok: false, error: 'Email hoặc mật khẩu không đúng' });
  req.session.user = sessionUser(user);
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

// ── DATA ROUTES ─────────────────────────────────────────────
app.get('/api/clinics', (req, res) => {
  const clinics = readCSV('clinics.csv').map((r) => ({
    id: +r.id, name: r.name, address: r.address,
    distance: +r.distance, rating: +r.rating,
    specialties: r.specialties.split(',').map((s) => s.trim()),
  }));
  res.json(clinics);
});

app.get('/api/doctors', (req, res) => {
  const doctors = readCSV('doctors.csv').map((r) => ({
    id: +r.id, name: r.name, specialty: r.specialty, clinicId: +r.clinic_id,
    rating: +r.rating, exp: r.experience, initials: r.initials,
    slots: r.slots.split(',').map((s) => s.trim()),
  }));
  res.json(doctors);
});

// Khung giờ đã đặt + bị khóa (cho 1 bác sĩ trong 1 ngày)
app.get('/api/appointments/booked', (req, res) => {
  const { doctorId, date } = req.query;
  const booked = readCSV('appointments.csv')
    .filter((r) => +r.doctor_id === +doctorId && r.date === date && r.status !== 'cancelled')
    .map((r) => r.slot);
  const blocked = readCSV('blocked_slots.csv')
    .filter((r) => +r.doctor_id === +doctorId && r.date === date)
    .map((r) => r.slot);
  res.json({ booked, blocked });
});

app.get('/api/appointments', requireAuth, (req, res) => {
  const mine = readCSV('appointments.csv')
    .filter((r) => r.patient_email === req.session.user.email)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(mine);
});

// ĐẶT LỊCH — bọc trong khóa để chống 2 người đặt cùng giờ đồng thời
app.post('/api/appointments', requireAuth, async (req, res) => {
  const b = req.body;
  if (!isPhoneVN(b.patientPhone)) return res.json({ ok: false, error: 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).' });

  const doctors = readCSV('doctors.csv').map((r) => ({ id: +r.id, slots: r.slots.split(',').map((s) => s.trim()) }));
  const doctor = doctors.find((d) => d.id === +b.doctorId);

  try {
    const result = await withLock('appointments.csv', () => {
      const rows = readCSV('appointments.csv');
      const bookedSlots = rows
        .filter((r) => +r.doctor_id === +b.doctorId && r.date === b.date && r.status !== 'cancelled')
        .map((r) => r.slot);
      const blockedSlots = readCSV('blocked_slots.csv')
        .filter((r) => +r.doctor_id === +b.doctorId && r.date === b.date)
        .map((r) => r.slot);

      const v = validateBooking({ date: b.date, slot: b.slot, doctor, bookedSlots, blockedSlots });
      if (!v.ok) return { ok: false, error: v.error };

      const appt = {
        id: 'A' + Date.now().toString(36).toUpperCase(),
        patient_name: req.session.user.name,
        patient_email: req.session.user.email,
        patient_phone: b.patientPhone,
        insurance: b.insurance || 'Không',
        province: b.province || '', district: b.district || '', ward: b.ward || '',
        address_detail: b.addressDetail || '',
        clinic_id: b.clinicId, clinic_name: b.clinicName, clinic_address: b.clinicAddress,
        doctor_id: b.doctorId, doctor_name: b.doctorName,
        specialty: b.specialty, symptom: b.symptom,
        date: b.date, slot: b.slot, status: 'confirmed',
        reminder_24h_sent: '', reminder_1h_sent: '',
        created_at: new Date().toISOString(),
      };
      rows.push(appt);
      writeCSV('appointments.csv', rows, APPT_COLUMNS);
      return { ok: true, appointment: appt };
    });

    if (!result.ok) return res.json(result);

    // Gửi email xác nhận từ phía SERVER (không lộ secret ra client)
    const { subject, html } = confirmationEmail(result.appointment);
    const mail = await sendMail({ to: result.appointment.patient_email, subject, html });
    res.json({ ok: true, appointment: result.appointment, email: mail.ok, emailError: mail.error || null });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: 'Lỗi máy chủ khi đặt lịch.' });
  }
});

// Hủy lịch (chủ lịch hoặc admin)
app.post('/api/appointments/:id/cancel', requireAuth, async (req, res) => {
  const out = await withLock('appointments.csv', () => {
    const rows = readCSV('appointments.csv');
    const appt = rows.find((r) => r.id === req.params.id);
    if (!appt) return { ok: false, error: 'Không tìm thấy lịch hẹn.' };
    if (appt.patient_email !== req.session.user.email && req.session.user.role !== 'admin')
      return { ok: false, error: 'Bạn không có quyền hủy lịch này.' };
    appt.status = 'cancelled';
    writeCSV('appointments.csv', rows, APPT_COLUMNS);
    return { ok: true };
  });
  res.json(out);
});

// ── ADMIN ROUTES ────────────────────────────────────────────
app.get('/api/admin/appointments', requireAdmin, (req, res) => {
  const rows = readCSV('appointments.csv').sort((a, b) =>
    (a.date + a.slot).localeCompare(b.date + b.slot));
  res.json(rows);
});

app.get('/api/admin/blocked', requireAdmin, (req, res) => {
  const { doctorId, date } = req.query;
  const blocked = readCSV('blocked_slots.csv')
    .filter((r) => +r.doctor_id === +doctorId && r.date === date)
    .map((r) => r.slot);
  res.json(blocked);
});

app.post('/api/admin/block', requireAdmin, async (req, res) => {
  const { doctorId, date, slot, reason } = req.body;
  const out = await withLock('blocked_slots.csv', () => {
    const rows = readCSV('blocked_slots.csv');
    if (rows.find((r) => +r.doctor_id === +doctorId && r.date === date && r.slot === slot))
      return { ok: true };
    rows.push({ doctor_id: doctorId, date, slot, reason: reason || 'Khóa bởi phòng khám', created_at: new Date().toISOString() });
    writeCSV('blocked_slots.csv', rows, BLOCK_COLUMNS);
    return { ok: true };
  });
  res.json(out);
});

app.post('/api/admin/unblock', requireAdmin, async (req, res) => {
  const { doctorId, date, slot } = req.body;
  const out = await withLock('blocked_slots.csv', () => {
    let rows = readCSV('blocked_slots.csv');
    rows = rows.filter((r) => !(+r.doctor_id === +doctorId && r.date === date && r.slot === slot));
    writeCSV('blocked_slots.csv', rows, BLOCK_COLUMNS);
    return { ok: true };
  });
  res.json(out);
});

// ── CRON: NHẮC LỊCH ─────────────────────────────────────────
// Gọi từ ngoài (GitHub Actions / UptimeRobot / Render Cron) — bảo vệ bằng CRON_SECRET.
// Việc gọi này cũng "đánh thức" Render free khi đang ngủ.
async function cronHandler(req, res) {
  const key = req.query.key || req.headers['x-cron-key'];
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET)
    return res.status(403).json({ ok: false, error: 'Sai CRON_SECRET' });
  const result = await runReminders();
  res.json(result);
}
app.get('/api/cron/run-reminders', cronHandler);
app.post('/api/cron/run-reminders', cronHandler);

// Backup nội bộ: nếu service đang thức, tự quét mỗi 5 phút.
if (process.env.ENABLE_INTERNAL_CRON !== 'false') {
  cron.schedule('*/5 * * * *', () => {
    runReminders().then((r) => {
      if (r.sent24 || r.sent1) console.log('⏰ Nhắc lịch nội bộ:', r);
    }).catch((e) => console.error('Cron nội bộ lỗi:', e.message));
  }, { timezone: 'Asia/Ho_Chi_Minh' });
}

// ── SERVE APP ───────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`✅ Server chạy tại http://localhost:${PORT}`));
