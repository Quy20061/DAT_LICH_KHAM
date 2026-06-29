// lib/schedule.js — Múi giờ VN, ngày lễ, giờ làm việc và kiểm tra hợp lệ khi đặt lịch.
const { readCSV } = require('./csv');

// Việt Nam không có DST → luôn +07:00
const VN_OFFSET = '+07:00';

// Thời điểm chính xác (UTC instant) của một lịch hẹn, hiểu theo giờ VN.
function apptInstant(date, slot) {
  // date 'YYYY-MM-DD', slot 'HH:MM'
  return new Date(`${date}T${slot}:00${VN_OFFSET}`);
}

// "Bây giờ" theo giờ VN, dạng các thành phần ngày/giờ.
function nowVN() {
  const now = new Date();
  // Lấy chuỗi theo timezone VN rồi tách
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now).reduce((o, p) => (o[p.type] = p.value, o), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    instant: now,
  };
}

function getHolidays() {
  // holidays.csv: date,name
  return readCSV('holidays.csv').reduce((m, r) => (m[r.date] = r.name, m), {});
}

function isHoliday(date) {
  return Boolean(getHolidays()[date]);
}

// Chủ nhật nghỉ (đa số phòng khám VN làm thứ 2–7). Có thể đổi tùy phòng khám.
function isSunday(date) {
  // Tính thứ trong tuần theo giờ VN
  const d = apptInstant(date, '12:00');
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(d);
  return wd === 'Sun';
}

function isPast(date, slot) {
  return apptInstant(date, slot).getTime() <= Date.now();
}

// Kiểm tra tổng hợp khi đặt lịch. Trả về { ok, error }.
function validateBooking({ date, slot, doctor, bookedSlots, blockedSlots }) {
  if (!date || !slot) return { ok: false, error: 'Thiếu ngày hoặc giờ khám.' };
  if (!doctor) return { ok: false, error: 'Không tìm thấy bác sĩ.' };
  if (!doctor.slots.includes(slot)) return { ok: false, error: 'Khung giờ không nằm trong lịch làm việc của bác sĩ.' };
  if (isPast(date, slot)) return { ok: false, error: 'Không thể đặt lịch trong quá khứ.' };
  if (isSunday(date)) return { ok: false, error: 'Chủ nhật phòng khám nghỉ, vui lòng chọn ngày khác.' };
  const hol = getHolidays()[date];
  if (hol) return { ok: false, error: `Ngày ${date} là ngày lễ (${hol}), phòng khám nghỉ.` };
  if (blockedSlots && blockedSlots.includes(slot)) return { ok: false, error: 'Khung giờ này đã bị khóa bởi phòng khám.' };
  if (bookedSlots && bookedSlots.includes(slot)) return { ok: false, error: 'Giờ này đã có người đặt.' };
  return { ok: true };
}

module.exports = { apptInstant, nowVN, isHoliday, isSunday, isPast, getHolidays, validateBooking, VN_OFFSET };
