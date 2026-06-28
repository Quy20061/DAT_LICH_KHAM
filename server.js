const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// ── MIDDLEWARE ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'dlk_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 ngày
}));

// ── CSV HELPERS ─────────────────────────────────────────────
function readCSV(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.trim()) return [];
  return parse(content, { columns: true, skip_empty_lines: true, bom: true });
}

function writeCSV(filename, records, columns) {
  const file = path.join(DATA_DIR, filename);
  const out = stringify(records, { header: true, columns });
  fs.writeFileSync(file, out, 'utf-8');
}

function appendCSV(filename, record, columns) {
  const records = readCSV(filename);
  records.push(record);
  writeCSV(filename, records, columns);
}

// ── PASSWORD HELPERS ────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = (stored||'').split(':');
  if (!salt||!hash) return false;
  return crypto.createHmac('sha256', salt).update(password).digest('hex') === hash;
}


function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  next();
}

// ── AUTH ROUTES ─────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.json({ ok: false, error: 'Thiếu thông tin' });
  if (password.length < 6) return res.json({ ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự' });

  const users = readCSV('users.csv');
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.json({ ok: false, error: 'Email này đã được đăng ký' });

  const hash = hashPassword(password);
  const newUser = {
    id: 'U' + Date.now(),
    name, email: email.toLowerCase(),
    password_hash: hash,
    created_at: new Date().toISOString()
  };
  appendCSV('users.csv', newUser, ['id','name','email','password_hash','created_at']);
  req.session.user = { id: newUser.id, name: newUser.name, email: newUser.email };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, error: 'Thiếu email hoặc mật khẩu' });

  const users = readCSV('users.csv');
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.json({ ok: false, error: 'Email hoặc mật khẩu không đúng' });

  const match = verifyPassword(password, user.password_hash);
  if (!match) return res.json({ ok: false, error: 'Email hoặc mật khẩu không đúng' });

  req.session.user = { id: user.id, name: user.name, email: user.email };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// ── DATA ROUTES ─────────────────────────────────────────────
app.get('/api/clinics', (req, res) => {
  const rows = readCSV('clinics.csv');
  const clinics = rows.map(r => ({
    id: +r.id,
    name: r.name,
    address: r.address,
    distance: +r.distance,
    rating: +r.rating,
    specialties: r.specialties.split(',').map(s => s.trim())
  }));
  res.json(clinics);
});

app.get('/api/doctors', (req, res) => {
  const rows = readCSV('doctors.csv');
  const doctors = rows.map(r => ({
    id: +r.id,
    name: r.name,
    specialty: r.specialty,
    clinicId: +r.clinic_id,
    rating: +r.rating,
    exp: r.experience,
    initials: r.initials,
    slots: r.slots.split(',').map(s => s.trim())
  }));
  res.json(doctors);
});

app.get('/api/appointments', requireAuth, (req, res) => {
  const rows = readCSV('appointments.csv');
  // Chỉ trả về lịch của user hiện tại (hoặc tất cả nếu muốn)
  const mine = rows.filter(r => r.patient_email === req.session.user.email);
  res.json(mine);
});

app.get('/api/appointments/booked', (req, res) => {
  const { doctorId, date } = req.query;
  const rows = readCSV('appointments.csv');
  const slots = rows
    .filter(r => +r.doctor_id === +doctorId && r.date === date && r.status !== 'cancelled')
    .map(r => r.slot);
  res.json(slots);
});

app.post('/api/appointments', requireAuth, (req, res) => {
  const { clinicId, clinicName, clinicAddress, doctorId, doctorName,
          specialty, symptom, date, slot } = req.body;

  // Kiểm tra trùng lịch
  const rows = readCSV('appointments.csv');
  const conflict = rows.find(r =>
    +r.doctor_id === +doctorId && r.date === date &&
    r.slot === slot && r.status !== 'cancelled'
  );
  if (conflict) return res.json({ ok: false, error: 'Giờ này đã được đặt' });

  const id = 'A' + Date.now().toString(36).toUpperCase();
  const appt = {
    id, patient_name: req.session.user.name,
    patient_email: req.session.user.email,
    clinic_id: clinicId, clinic_name: clinicName, clinic_address: clinicAddress,
    doctor_id: doctorId, doctor_name: doctorName,
    specialty, symptom, date, slot,
    status: 'confirmed',
    created_at: new Date().toISOString()
  };
  appendCSV('appointments.csv', appt, [
    'id','patient_name','patient_email','clinic_id','clinic_name','clinic_address',
    'doctor_id','doctor_name','specialty','symptom','date','slot','status','created_at'
  ]);
  res.json({ ok: true, appointment: appt });
});

// ── SERVE APP ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
});
