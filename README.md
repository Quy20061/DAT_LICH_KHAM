# 🏥 Đặt lịch khám sức khỏe online

Ứng dụng web đặt lịch khám (Node.js + Express, lưu dữ liệu bằng file CSV).
Bài tập lớn môn Công nghệ phần mềm.

## Tính năng

- Đăng ký / đăng nhập, xem lại lịch sử lịch hẹn, **hủy lịch**.
- Tìm phòng khám gần nhất (theo khoảng cách giả lập), chọn chuyên khoa theo triệu chứng, chọn bác sĩ.
- Đặt lịch theo ngày/giờ; **phát hiện trùng lịch và gợi ý khung giờ thay thế**.
- **Gửi email xác nhận thật qua SMTP** (Gmail App Password hoặc SendGrid) — secret để trong biến môi trường.
- **Nhắc lịch tự động trước 24h và 1h** qua cron (chịu được Render free ngủ).
- **Trang quản trị**: mở/khóa khung giờ của từng bác sĩ, xem toàn bộ lịch hẹn.
- **Khóa chống đặt trùng** khi nhiều người đặt cùng khung giờ gần như đồng thời (race condition).
- **Chặn đặt vào ngày lễ, Chủ nhật và ngoài giờ làm việc của bác sĩ.**
- Bối cảnh Việt Nam: trường **số điện thoại**, địa chỉ **Tỉnh/Quận/Phường**, lựa chọn **BHYT**.
- Giao diện dùng phông chữ **Times New Roman**.

## Chạy trên máy (local)

    npm install
    cp .env.example .env      # rồi sửa các giá trị trong .env
    npm start                 # mở http://localhost:3000

Nếu chưa cấu hình SMTP, app vẫn chạy ở **chế độ console**: email chỉ in ra terminal (tiện demo nhanh).

## Cấu hình gửi email thật (SMTP)

Mở file `.env` và điền (xem chi tiết trong `.env.example`):

**Gmail App Password** (khuyên dùng cho đồ án):
1. Bật xác minh 2 bước cho Gmail.
2. Vào https://myaccount.google.com/apppasswords tạo mật khẩu ứng dụng.
3. Điền: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<gmail của bạn>`, `SMTP_PASS=<mật khẩu ứng dụng 16 ký tự>`.

**SendGrid**: `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey`, `SMTP_PASS=<API key>`.

> Secret **không** nằm trong code — chỉ đọc từ biến môi trường, nên an toàn khi đẩy code lên GitHub.

## Nhắc lịch tự động (cron)

App có 2 lớp nhắc lịch, dùng chung logic "gửi trước 24h và 1h", **không gửi trùng**:

1. **Cron nội bộ** (`node-cron`) quét mỗi 5 phút khi server đang thức.
2. **Endpoint HTTP** `POST /api/cron/run-reminders?key=CRON_SECRET` để dịch vụ ngoài gọi vào.

**Vì sao cần lớp 2?** Render gói free **ngủ** khi không có request → cron nội bộ dừng. Giải pháp:

- **GitHub Actions** (miễn phí, có sẵn trong `.github/workflows/reminders.yml`): ping endpoint mỗi 15 phút, vừa gửi nhắc vừa đánh thức server. Chỉ cần đặt 2 secret trong repo: `APP_URL` và `CRON_SECRET`.
- Hoặc dùng **UptimeRobot / cron-job.org** trỏ tới cùng URL endpoint trên.
- Hoặc **Render Cron Job** (gói trả phí) chạy `node scripts/run-reminders.js` — xem `render.yaml`.

## Tạo tài khoản quản trị (admin)

Đặt biến `ADMIN_EMAILS` (danh sách email, phân tách dấu phẩy). Người dùng đăng nhập bằng email nằm trong danh sách này sẽ thấy nút **⚙ Quản trị**.

    ADMIN_EMAILS=admin@phongkham.vn

(Vẫn cần đăng ký tài khoản với đúng email đó để có mật khẩu.)

## Triển khai trên Render

1. Đẩy code lên GitHub (file `.env` đã được `.gitignore` bỏ qua).
2. Trên Render: **New → Web Service**, chọn repo. Build: `npm install`, Start: `node server.js`.
3. Vào tab **Environment**, thêm các biến: `NODE_ENV=production`, `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS`, và nhóm `SMTP_*`, `MAIL_FROM`.
4. Bật nhắc lịch bằng GitHub Actions (mục trên).

> Hoặc dùng **Blueprint**: New → Blueprint → trỏ tới repo có `render.yaml`.

## Lưu ý kỹ thuật

- **Session** dùng bộ nhớ tạm (MemoryStore) nên khi server khởi động lại (Render ngủ rồi thức), người dùng cần đăng nhập lại. Đủ dùng cho đồ án; nếu cần bền vững hãy thay bằng store có lưu trữ.
- **Ổ đĩa của Render free là tạm thời (ephemeral)**: dữ liệu CSV sẽ mất khi service được build/khởi động lại. Để bền vững nên chuyển sang cơ sở dữ liệu — nằm ngoài phạm vi đồ án nhưng nên ghi chú.
- Ngày lễ khai báo trong `data/holidays.csv`; giờ làm việc lấy theo cột `slots` của từng bác sĩ trong `data/doctors.csv`; phòng khám nghỉ Chủ nhật (đổi trong `lib/schedule.js`).

## Cấu trúc thư mục

    server.js              # Express + định tuyến API
    lib/
      csv.js               # đọc/ghi CSV, ghi nguyên tử, KHÓA chống đua (withLock)
      mailer.js            # gửi email qua SMTP (đọc secret từ env)
      schedule.js          # múi giờ VN, ngày lễ, validate khi đặt
      reminders.js         # logic nhắc lịch 24h/1h
    scripts/run-reminders.js   # chạy nhắc lịch 1 lần (cho cron)
    public/
      index.html           # giao diện (Times New Roman)
      vn-address.js        # dữ liệu Tỉnh/Quận/Phường
    data/*.csv             # clinics, doctors, appointments, users, blocked_slots, holidays
    .github/workflows/reminders.yml   # cron qua GitHub Actions
    render.yaml            # blueprint triển khai Render
    .env.example           # mẫu biến môi trường
