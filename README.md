# 🏥 Đặt Lịch Khám Sức Khỏe Online

Web app đặt lịch khám bệnh với Node.js backend, lưu dữ liệu bằng CSV.

## Cài đặt & Chạy

### Yêu cầu
- Node.js >= 16

### Bước 1: Cài dependencies
```bash
npm install
```

### Bước 2: Chạy server
```bash
npm start
```

Mở trình duyệt tại: **http://localhost:3000**

---

## Cấu trúc thư mục

```
webapp/
├── server.js          # Backend Express (API)
├── package.json
├── data/
│   ├── clinics.csv    # Dữ liệu phòng khám
│   ├── doctors.csv    # Dữ liệu bác sĩ
│   ├── appointments.csv  # Lịch hẹn (tự động cập nhật)
│   └── users.csv      # Tài khoản người dùng (tự động cập nhật)
└── public/
    └── index.html     # Frontend (SPA)
```

## API Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| POST | /api/register | Đăng ký tài khoản |
| POST | /api/login | Đăng nhập |
| POST | /api/logout | Đăng xuất |
| GET | /api/me | Lấy session hiện tại |
| GET | /api/clinics | Danh sách phòng khám |
| GET | /api/doctors | Danh sách bác sĩ |
| GET | /api/appointments | Lịch hẹn của tôi |
| GET | /api/appointments/booked | Giờ đã đặt của bác sĩ |
| POST | /api/appointments | Đặt lịch mới |

## Cấu hình EmailJS

Mở `public/index.html`, tìm `EMAILJS_CONFIG` và điền:
```js
const EMAILJS_CONFIG = {
  serviceId: "service_xxxxxxx",
  templateId: "template_xxxxxxx",
  publicKey: "xxxxxxxxxxxxxxx",
};
```

## Deploy lên hosting

### Render.com (miễn phí)
1. Push code lên GitHub
2. Tạo Web Service trên render.com
3. Build Command: `npm install`
4. Start Command: `npm start`

### Railway.app
1. Kết nối GitHub repo
2. Auto-deploy

### VPS / Server riêng
```bash
npm install -g pm2
pm2 start server.js --name "dat-lich-kham"
pm2 save
```
