# Quản Lý Trường Học

Dự án full-stack quản lý trường học với Node.js (Backend), React (Frontend) và MongoDB.

## Cấu Trúc Dự Án

```
saplich/
├── backend/                 # Backend API
│   ├── config/db.js        # Kết nối MongoDB
│   ├── controllers/        # Logic xử lý
│   │   ├── khoiController.js
│   │   ├── lopController.js
│   │   ├── giaoVienController.js
│   │   └── thoiKhoaBieuController.js
│   ├── models/             # MongoDB Schemas
│   │   ├── Khoi.js
│   │   ├── Lop.js
│   │   ├── GiaoVien.js
│   │   └── ThoiKhoaBieu.js
│   ├── routes/             # API Routes
│   ├── services/           # Business logic
│   │   └── tkbService.js  # Thuật toán sắp TKB
│   ├── server.js
│   └── package.json
│
├── frontend/               # Frontend React
│   ├── src/
│   │   ├── pages/
│   │   │   ├── KhoiPage.jsx
│   │   │   ├── LopPage.jsx
│   │   │   ├── GiaoVienPage.jsx
│   │   │   └── ThoiKhoaBieuPage.jsx
│   │   ├── services/api.js
│   │   └── App.jsx
│   └── package.json
│
└── README.md
```

## Yêu Cầu

- Node.js v18+
- MongoDB (cài đặt local hoặc dùng MongoDB Atlas)

## Cách Chạy

### 1. Start MongoDB

Đảm bảo MongoDB đang chạy:
- Local: `mongod`
- Hoặc dùng MongoDB Atlas và cập nhật `MONGODB_URI` trong `backend/.env`

### 2. Cài Đặt Backend

```bash
cd backend
npm install
npm run dev
```

Backend sẽ chạy tại: `http://localhost:5000`

### 3. Cài Đặt Frontend

Mở terminal mới:

```bash
cd frontend
npm install
npm run dev
```

Frontend sẽ chạy tại: `http://localhost:3000`

## Chức Năng

### 1. Quản Lý Khối
- Thêm, sửa, xóa khối học
- Sắp xếp theo thứ tự

### 2. Quản Lý Lớp
- Thêm lớp gắn với khối
- Thông tin: tên lớp, sĩ số, GV chủ nhiệm, phòng học

### 3. Quản Lý Giáo Viên
- Thêm giáo viên với **nhiều chuyên môn**
- Mỗi chuyên môn có **số tiết/tuần** riêng
- VD: GV Nguyễn Văn A dạy Toán (5 tiết) + Tiếng Anh (3 tiết)

### 4. Thời Khóa Biểu Tự Động
- **Sắp xếp tự động** cho tất cả các lớp
- Quy tắc:
  - Sáng: 4 tiết (tiết 1 = Chào cờ)
  - Chiều: 3 tiết
  - Học Thứ 2 → Thứ 6
- Tự động phân bổ giáo viên vào các tiết

## API Endpoints

### Khối
| Method | Endpoint | Mô Tả |
|--------|----------|--------|
| GET | /api/khoi | Danh sách khối |
| POST | /api/khoi | Tạo khối |
| PUT | /api/khoi/:id | Sửa khối |
| DELETE | /api/khoi/:id | Xóa khối |

### Lớp
| Method | Endpoint | Mô Tả |
|--------|----------|--------|
| GET | /api/lop | Danh sách lớp |
| POST | /api/lop | Tạo lớp |
| PUT | /api/lop/:id | Sửa lớp |
| DELETE | /api/lop/:id | Xóa lớp |

### Giáo Viên
| Method | Endpoint | Mô Tả |
|--------|----------|--------|
| GET | /api/giao-vien | Danh sách GV |
| GET | /api/giao-vien/chuyen-mon | Danh sách chuyên môn |
| POST | /api/giao-vien | Tạo GV |
| PUT | /api/giao-vien/:id | Sửa GV |
| DELETE | /api/giao-vien/:id | Xóa GV |

### Thời Khóa Biểu
| Method | Endpoint | Mô Tả |
|--------|----------|--------|
| GET | /api/thoi-khoa-bieu | Tất cả TKB |
| GET | /api/thoi-khoa-bieu/lop | TKB theo lớp |
| GET | /api/thoi-khoa-bieu/giao-vien | TKB theo GV |
| POST | /api/thoi-khoa-bieu/auto-generate | Sắp xếp TKB tự động |
| GET | /api/thoi-khoa-bieu/stats | Thống kê TKB |

## Ví Dụ Sử Dụng

### Thêm Giáo Viên với nhiều chuyên môn

```json
POST /api/giao-vien
{
  "hoTen": "Nguyễn Văn A",
  "email": "nva@school.edu",
  "chuyenMon": [
    { "tenChuyenMon": "Toán", "soTietTuan": 5 },
    { "tenChuyenMon": "Tiếng Anh", "soTietTuan": 3 }
  ]
}
```

### Sắp xếp TKB tự động

```json
POST /api/thoi-khoa-bieu/auto-generate
{
  "namHoc": "2024-2025"
}
```

## Cấu Hình Chuyên Môn Mặc Định (Số tiết/tuần)

| Khối | Toán | Tiếng Việt | Tiếng Anh | Khoa học | ... |
|------|------|------------|-----------|----------|-----|
| 1 | 4 | 5 | - | - | ... |
| 2 | 4 | 5 | - | 2 | ... |
| 3 | 4 | 5 | 2 | 2 | ... |
| 4 | 5 | 5 | 3 | 2 | ... |
| 5 | 5 | 5 | 3 | 2 | ... |
