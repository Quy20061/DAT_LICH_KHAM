// lib/csv.js — Đọc/ghi CSV an toàn, ghi nguyên tử (atomic) và khóa chống đua (race condition)
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(filename) {
  return path.join(DATA_DIR, filename);
}

function readCSV(filename) {
  const file = filePath(filename);
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.trim()) return [];
  return parse(content, { columns: true, skip_empty_lines: true, bom: true });
}

// Ghi nguyên tử: ghi ra file tạm rồi rename → tránh hỏng file nếu crash giữa chừng
function writeCSV(filename, records, columns) {
  const file = filePath(filename);
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  const out = stringify(records, { header: true, columns });
  fs.writeFileSync(tmp, out, 'utf-8');
  fs.renameSync(tmp, file); // rename là thao tác nguyên tử trên cùng một ổ đĩa
}

function appendCSV(filename, record, columns) {
  const records = readCSV(filename);
  records.push(record);
  writeCSV(filename, records, columns);
}

// ── KHÓA CHỐNG ĐUA (async mutex theo từng file) ─────────────────────
// Node chạy đơn luồng, nhưng giữa các 'await' vẫn có thể xen kẽ request.
// withLock() đảm bảo phần "đọc → kiểm tra → ghi" của một file chạy tuần tự,
// nên 2 người đặt cùng khung giờ gần như đồng thời sẽ không ghi đè nhau.
const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise((res) => (release = res));
  locks.set(key, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === next) locks.delete(key);
  }
}

module.exports = { readCSV, writeCSV, appendCSV, withLock, DATA_DIR };
