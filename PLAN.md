# KẾ HOẠCH TÁI CẤU TRÚC HỆ THỐNG SẮP THỜI KHÓA BIỂU

> **Mục đích**: Tài liệu này là "bản đồ" cho toàn bộ quá trình tái cấu trúc. Người dùng có thể đọc để hiểu ý tưởng, góp ý điều chỉnh hướng đi, hoặc chỉ cho agent những chỗ đi sai hướng.
> Cập nhật lần cuối: 30/08/2026

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1. Mô tả
Hệ thống tự động sắp thời khóa biểu cho trường học nhiều phân hiệu, nhiều khối, nhiều lớp. Mỗi lớp có danh sách môn học, mỗi giáo viên có 1 hoặc nhiều chuyên môn, có phân hiệu chính, có nguyện vọng về số buổi/buổi ưu tiên/thứ nghỉ.

### 1.2. Công nghệ
- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **Frontend**: React + Vite + Tailwind
- **Đóng gói**: Electron

### 1.3. Cấu trúc thư mục chính (chỉ phần liên quan)
```
backend/
  models/        # Khoi, Lop, GiaoVien, ThoiKhoaBieu, WarningLog
  controllers/   # xử lý HTTP
  routes/        # định nghĩa endpoint
  services/      # business logic
    tkbService.js               # <- file chính (1100+ dòng, đã phình to)
    jobStore.js                 # job progress (in-memory)
    autoGenerateProgress.js     # callback progress
    optimizer/                  # <- module phụ đã tách nhưng chưa dùng hết
      index.js
      constants.js
      slotFinder.js
      scheduleOps.js
      sessionOptimizer.js
      repair.js
frontend/src/
  pages/
    LopPage.jsx              # CRUD lớp
    GiaoVienPage.jsx         # CRUD giáo viên (form khá phức tạp)
    ThoiKhoaBieuPage.jsx     # xem/sửa TKB, drag-drop, generate
    BangPhanCongPage.jsx     # bảng tổng hợp phân công GV
  services/api.js            # axios client
```

---

## 2. VẤN ĐỀ HIỆN TẠI (từ người dùng mô tả + quan sát code)

### 2.1. Vấn đề về logic TKB

#### A. Môn Công nghệ/Tin học xếp liền nhau (CHẶN CỨNG, không phạt điểm)
- **Mô tả**: 2 tiết Tin học (hoặc Công nghệ) có thể rơi vào tiết 2 + tiết 3 cùng buổi, học sinh phải học 2 tiết liên tục → vi phạm yêu cầu "xếp xen kẽ".
- **Nguyên nhân trong code** (`tkbService.js` hàm `findBestSlotForGV`): ràng buộc "1 buổi chỉ 1 môn" đang được áp dụng dưới dạng skip cứng, NHƯNG chỉ giới hạn "tối đa 1 tiết môn này / buổi". Vấn đề là khi 1 môn có 2 tiết/tuần (Tin học khối 4-5) thì 2 tiết đó có thể rơi vào 2 buổi khác nhau, và 1 buổi có thể có 2 tiết cùng môn (nếu xếp trong buổi khác thì OK, nhưng xếp cạnh nhau là sai).
- **Sửa (CHẶN CỨNG)**: với 2 môn `Tin học` và `Công nghệ`, nếu trong cùng buổi (thu+buoi) mà môn này ĐÃ CÓ 1 tiết ở vị trí cạnh (|tiet_cu - tiet_moi| = 1) → SKIP slot đó (hard skip, không xếp). Nếu môn khác cùng chuyên môn đã chiếm slot đó cũng skip. Đây là ràng buộc HARD CONSTRAINT.

#### B. 1 môn của lớp bị xếp cho 2 GV khác nhau
- **Mô tả**: Trong cùng 1 lớp, cùng 1 môn (VD Toán) có thể có 2 tiết, mỗi tiết do 1 GV khác nhau dạy → vi phạm yêu cầu "1 môn của lớp đó không được xếp 2 GV khác nhau dạy".
- **Nguyên nhân trong code** (`tkbService.js` vòng `for (const cm of sortedCM)`): mỗi lần xếp tiết, hàm `findBestSlotForGV` được gọi cho từng GV trong `gvList`. Nếu có 2 GV cùng dạy Toán, hệ thống có thể chọn GV A cho tiết thứ nhất, GV B cho tiết thứ hai → sai.
- **Sửa**: sau khi chọn được GV cho tiết đầu tiên của mỗi môn trong 1 lớp, KHÓA GV đó lại — tất cả các tiết còn lại của môn đó phải dùng CÙNG GV. Nếu GV đó không đủ slot → fallback sang GV khác (cảnh báo).

#### C. Chức năng sắp xếp đang gộp chung
- **Mô tả**: Hiện tại chỉ có 1 API `/auto-generate` chạy xếp TKB toàn trường. Người dùng muốn tách thành 2 bước:
  1. **Xếp theo phân hiệu**: xếp cho từng phân hiệu, mỗi GV dạy đủ tiết tại phân hiệu chính của họ.
  2. **Xếp điều chuyển**: sau khi GV đã đủ phân công định mức tại phân hiệu chính, phần dư (nếu `soTietDinhMuc > soTietDuocPhanCong`) sẽ được điều chuyển sang phân hiệu khác đang thiếu GV.
- **Đang thiếu**: chức năng xếp điều chuyển chưa tồn tại trong code (chỉ có field `lopDieuChuyen` trong model GV nhưng không dùng để xếp TKB).

#### D. Phân hiệu ưu tiên điều chuyển cho GV
- **Mô tả**: Khi GV đã đủ tiết tại phân hiệu chính, hệ thống hiện tại không biết GV đó nên điều chuyển sang phân hiệu nào. Người dùng muốn có **danh sách phân hiệu ưu tiên điều chuyển** cho mỗi GV.
- **Sửa**: thêm field `dieuChuyenUuTien: [String]` vào model `GiaoVien`. Khi cần điều chuyển, hệ thống sẽ:
  1. Tìm phân hiệu ưu tiên của GV.
  2. Tìm phân hiệu đang thiếu GV (các lớp ở phân hiệu đó có môn GV dạy chưa xếp được).
  3. Xếp GV dạy các lớp ở phân hiệu ưu tiên đó.

#### E. Lỗi hiển thị lớp theo phân hiệu + chuyên môn ở frontend
- **Mô tả**: "Lớp theo chuyên môn hiện tại đang lỗi tôi chỉ cần nó hiện các lớp của cái phân hiệu và có tiết của chuyên môn đó (được quản lý ở phần phân công môn)".
- **Hiểu ý**: Ở trang `GiaoVienPage.jsx`, phần "Lớp theo chuyên môn" hiện đang hiển thị TẤT CẢ lớp có môn khớp với chuyên môn của GV, không lọc theo phân hiệu. Người dùng muốn:
  - Chỉ hiển thị lớp thuộc phân hiệu của GV (mặc định)
  - Có thể chọn sang phân hiệu khác để "điều chuyển"
  - Khi xếp TKB, các tiết được phân công ở lớp khác phân hiệu → coi như "điều chuyển"

### 2.2. Vấn đề về cấu trúc code

#### F. File `tkbService.js` quá lớn
- 1100+ dòng, chứa cả constant, scoring, scheduling, optimization, repair, export, GET API...
- **Module `optimizer/` đã được tách nhưng `tkbService.js` chưa dùng** — vẫn dùng phiên bản inline cũ.
- **Sửa**: refactor `tkbService.js` để gọi các module trong `optimizer/`.

#### G. Thiếu "GV chuyên môn nào thì dạy lớp phân hiệu nào"
- Hiện tại khi xếp TKB, hệ thống không quan tâm GV ở phân hiệu nào, miễn là GV có chuyên môn là xếp được.
- **Sửa**: thêm constraint "GV phải dạy đủ tiết tại phân hiệu chính trước, sau đó mới xét điều chuyển".

---

## 3. THIẾT KẾ MỚI (ĐỀ XUẤT)

### 3.1. Thay đổi Model

#### `GiaoVien.js` — bổ sung
```js
phanHieu: { type: String, default: '', trim: true },   // phân hiệu chính (đã có)
phanHieuDieuChuyen: { type: String, default: '', trim: true },  // MỚI: 1 phân hiệu ưu tiên điều chuyển (string đơn)
```
**Ý nghĩa**:
- `phanHieu`: phân hiệu gốc của GV.
- `phanHieuDieuChuyen`: phân hiệu GV muốn điều chuyển đến (nếu có). Chỉ 1 phân hiệu.
- **Quy tắc xếp điều chuyển** (chạy trong `assignOverflow`): nếu phân hiệu `phanHieuDieuChuyen` đang thiếu GV, GV này sẽ được ưu tiên xếp sang dạy ở đó.

#### `Lop.js` — giữ nguyên
- `phanHieu`: đã có, lưu phân hiệu của lớp.

#### `ThoiKhoaBieu.js` — giữ nguyên schema, có thể bổ sung
- `ghiChuDieuChuyen: Boolean` (mặc định false) — đánh dấu tiết này là do GV điều chuyển từ phân hiệu khác đến.

### 3.2. Thay đổi thuật toán — TÁCH thành 2 chức năng độc lập

> **Nguyên tắc mới (theo yêu cầu user)**: Khi sắp theo phân hiệu, GV ở phân hiệu đó phải dạy HẾT các lớp của phân hiệu (kể cả khi tiết dạy > định mức). Chức năng "điều chuyển" sẽ chạy SAU, để tối ưu lại.

#### Chức năng A — Sắp theo phân hiệu (`autoGenerateByPhanHieu`)
Endpoint mới: `POST /api/thoi-khoa-bieu/auto-generate-by-phan-hieu`
- Input: `{ namHoc, phanHieu }`
- Chạy thuật toán greedy cải tiến cho các lớp thuộc phân hiệu đó:
  1. **Chỉ xét GV cùng phân hiệu** (nếu không có GV cùng phân hiệu thì mới mở rộng ra GV khác phân hiệu).
  2. **Khóa GV cho mỗi môn**: sau khi chọn được GV đầu tiên cho môn, các tiết còn lại của môn đó trong lớp BẮT BUỘC phải cùng GV. Nếu GV không đủ slot → VẪN XẾP (tăng tiết vượt định mức), hiển thị nhắc nhở.
  3. **Ràng buộc chống xếp liền môn đặc biệt** (`Tin học`, `Công nghệ`): HARD SKIP nếu rơi vào tiết cạnh tiết đã có cùng môn trong buổi.
  4. **Tôn trọng NV**: số buổi tối đa, thứ nghỉ, buổi ưu tiên — giữ nguyên logic hiện tại.
  5. **Gom buổi**: giữ logic hiện tại.
- Sau khi sinh xong, lưu TKB vào DB với trường `phanHieu` của lớp đã được set.

#### Chức năng B — Sắp điều chuyển (`assignOverflow`)
Endpoint mới: `POST /api/thoi-khoa-bieu/assign-overflow`
- Input: `{ namHoc }`
- Chạy SAU khi đã sắp theo phân hiệu (cho cả nhiều phân hiệu):
  1. **Tính phân công định mức cho mỗi GV**:
     - `soTietDaDay = tổng tiết GV đang dạy tại phân hiệu chính`
     - `soTietDinhMuc = gv.phanCong.soTietDinhMuc - gv.phanCong.soTietKiemNhiem`
     - `soTietDangDu = max(0, soTietDaDay - soTietDinhMuc)` (số tiết dư có thể điều chuyển đi)
     - `soTietDangThieu = max(0, soTietDinhMuc - soTietDaDay)` (GV này dạy chưa đủ định mức tại phân hiệu chính)
  2. **Tính nhu cầu của mỗi phân hiệu** (ngoài phân hiệu của GV dư):
     - `soTietThieu = max(0, required - actual)` tại phân hiệu đó.
  3. **Ghép cung - cầu**:
     - Với mỗi GV dư (soTietDangDu > 0), so khớp `gv.phanHieuDieuChuyen` với phân hiệu thiếu.
     - Nếu trùng → ưu tiên cao nhất.
     - Nếu không trùng → random phân hiệu thiếu bất kỳ (ưu tiên phân hiệu thiếu nhiều nhất).
  4. **Xếp tiết điều chuyển**: tìm slot trống trong TKB của lớp thuộc phân hiệu đích, xếp GV dư vào. Đánh dấu `ghiChuDieuChuyen = true`.

### 3.3. Thay đổi API

| Method | Endpoint | Mô tả | Thay đổi |
|--------|----------|-------|----------|
| POST | `/api/thoi-khoa-bieu/auto-generate` | Xếp TOÀN TRƯỜNG (legacy) | **GIỮ NGUYÊN** — để tương thích code cũ, nhưng frontend sẽ KHÔNG dùng nữa |
| POST | `/api/thoi-khoa-bieu/auto-generate-by-phan-hieu` | **MỚI** — Sắp TKB cho 1 phân hiệu cụ thể | Mới |
| POST | `/api/thoi-khoa-bieu/assign-overflow` | **MỚI** — Sắp điều chuyển (chạy sau khi sắp theo phân hiệu) | Mới |
| GET | `/api/thoi-khoa-bieu/stats/phan-hieu` | **MỚI** — Thống kê GV dạy đủ/thiếu theo phân hiệu | Mới |
| PUT | `/api/giao-vien/:id` | Thêm field `phanHieuDieuChuyen` vào update payload | Cập nhật controller |
| GET | `/api/thoi-khoa-bieu/auto-generate-progress` | ... | Giữ nguyên |

### 3.4. Thay đổi Frontend

#### `GiaoVienPage.jsx`
- Thêm section "Phân hiệu ưu tiên điều chuyển" trong modal: cho phép tick nhiều phân hiệu.
- **Lỗi hiển thị lớp theo chuyên môn**: Sửa logic filter `lopPhuHop` để chỉ hiển thị lớp thuộc phân hiệu của GV (mặc định). Nếu GV chưa có phân hiệu → hiển thị tất cả.
- Hiển thị badge cho mỗi lớp: "Phân hiệu chính" / "Điều chuyển".

#### `ThoiKhoaBieuPage.jsx`
- Thêm button "Xếp điều chuyển" sau khi generate xong.
- Hiển thị rõ tiết nào là "điều chuyển" (màu sắc / icon).
- Thêm bộ lọc "chỉ hiển thị tiết điều chuyển".

#### Cảnh báo nguyện vọng theo phân hiệu (30/08/2026)
- Bảng `thongKeBuoi` và modal `viPhamNV` được bổ sung cột **"Phân hiệu"** cho mỗi GV.
- Khi chạy **"Sắp theo phân hiệu X"**, popup cảnh báo chỉ liệt kê GV thuộc phân hiệu X (không cộng dồn cả trường).
- Bảng thống kê nguyện vọng có filter dropdown theo phân hiệu + cột "Chênh lệch" (số buổi vượt/thiếu).
- Modal `viPhamNV` nhóm GV theo `phanHieu`, ưu tiên hiển thị nhóm phân hiệu đang sắp (màu xanh dương), các nhóm GV điều chuyển từ phân hiệu khác mặc định ẩn dưới nút "Mở rộng" (màu vàng) — tránh nhiễu cho người dùng khi đang sắp theo 1 phân hiệu.
- **Cập nhật cuối:** Tách bạch hoàn toàn. Backend `autoGenerateTKB` khi chạy với `options.phanHieu`:
  - `thongKeBuoi` chỉ chứa GV có `phanHieu === options.phanHieu` (hoặc không có phanHieu).
  - `viPhamNV.danhSachGV` và `viPhamNV.tongSoTiet` cũng được lọc tương tự.
  - Modal `viPhamNV` không còn hiển thị nhóm "GV điều chuyển" — chức năng điều chuyển xử lý ở bước "Sắp điều chuyển" riêng.

#### Filter phân hiệu cho trang Lớp-Chuyên môn và Bảng phân công (30/08/2026)
- **`LopChuyenMonPage`** (`/lop-chuyen-mon`):
  - Thêm dropdown **"Lọc theo Phân hiệu"** cạnh chọn Khối. Danh sách option là các phân hiệu thực sự có trong các lớp của khối đang chọn (tự trích từ `lops[].phanHieu`).
  - Có thêm cột **"Phân hiệu"** trong bảng danh sách lớp (badge tím).
  - Header bảng hiển thị "Hiển thị X/Y lớp".
- **`BangPhanCongPage`** (`/bang-phan-cong`):
  - Thêm dropdown **"Phân hiệu"** trong toolbar (cùng nhóm với "Môn dạy"). Lọc GV theo `phanHieu`.
  - Danh sách option tự trích từ `teachers[].phanHieu`.

#### `BangPhanCongPage.jsx`
- Đã có hiển thị "tổng số tiết dư - thiếu". Bổ sung thêm cột "phân hiệu ưu tiên điều chuyển" để người dùng thấy nhanh.

---

## 4. KẾ HOẠCH TRIỂN KHAI (theo giai đoạn)

> Mỗi giai đoạn làm xong sẽ CẬP NHẬT file này trước khi qua giai đoạn tiếp theo. Nếu bạn thấy đi sai hướng, dừng lại và chỉnh sửa ngay giai đoạn đó.

### Giai đoạn 0 — Khảo sát & Lập kế hoạch ✅ (ĐÃ XONG)
- Đọc toàn bộ code liên quan
- Viết file kế hoạch này
- **Trạng thái**: ✅ Hoàn thành — đang ở đây.

### Giai đoạn 1 — Sửa chính sách Tin học/Công nghệ (CHẶN CỨNG) + Khóa GV cho mỗi môn
- **File**: `backend/services/tkbService.js`
- **Công việc**:
  - [ ] Trong `findBestSlotForGV`: với 2 môn `Tin học` và `Công nghệ`, **hard skip** nếu slot mới rơi vào tiết cạnh (|tiet - tiet_existing| = 1) với tiết cùng môn đã có trong buổi. Đây là HARD CONSTRAINT (không bao giờ vi phạm).
  - [ ] Trong vòng `for (const cm of sortedCM)`: khóa GV đầu tiên được chọn cho môn đó. Tất cả các tiết còn lại của môn đó phải dùng CÙNG GV (nếu GV không đủ slot vẫn xếp cùng GV, dù vượt định mức).
  - [ ] Test với dữ liệu mẫu (cần tạo script test).
- **Tiêu chí done**:
  - Tin học 1 tiết/tuần không bao giờ rơi vào tiết cạnh tiết Tin học đã có.
  - 1 môn (Toán, Tin học, ...) trong 1 lớp LUÔN do cùng 1 GV dạy.
- **Ước lượng**: 0.5 ngày.

### Giai đoạn 2 — Tách `autoGenerate` thành `autoGenerateByPhanHieu` (rẽ nhánh theo phân hiệu)
- **File**: `backend/services/tkbService.js`, `backend/controllers/thoiKhoaBieuController.js`, `backend/routes/thoiKhoaBieuRoutes.js`
- **Công việc**:
  - [ ] Tạo hàm `autoGenerateByPhanHieu(namHoc, phanHieu, onProgress)`: chỉ xét các lớp có `lop.phanHieu === phanHieu`.
  - [ ] Trong hàm này, **chỉ ưu tiên GV cùng phân hiệu** cho các slot, fallback sang GV khác phân hiệu nếu không có GV cùng phân hiệu dạy được môn đó.
  - [ ] Endpoint mới: `POST /api/thoi-khoa-bieu/auto-generate-by-phan-hieu` với body `{ namHoc, phanHieu }`.
  - [ ] Endpoint cũ `/auto-generate` GIỮ NGUYÊN để tương thích (vẫn chạy toàn trường).
  - [ ] Progress callback phải phản ánh đúng (vd 30% khi sắp 1 phân hiệu đầu tiên).
- **Tiêu chí done**: Sắp được TKB cho 1 phân hiệu, không ảnh hưởng phân hiệu khác.
- **Ước lượng**: 1 ngày.

### Giai đoạn 3 — Thêm field `phanHieuDieuChuyen` cho GiaoVien (string đơn)
- **File**: `backend/models/GiaoVien.js`, `frontend/src/pages/GiaoVienPage.jsx`, `frontend/src/services/api.js`
- **Công việc**:
  - [ ] Thêm field `phanHieuDieuChuyen: String` vào schema.
  - [ ] Controller `update` chấp nhận field mới.
  - [ ] Frontend modal: thêm 1 dropdown "Phân hiệu ưu tiên điều chuyển" (select 1 phân hiệu, mặc định rỗng).
- **Tiêu chí done**: Lưu/load được `phanHieuDieuChuyen` cho mỗi GV.
- **Ước lượng**: 0.3 ngày.

### Giai đoạn 4 — Implement `assignOverflow` (chức năng điều chuyển)
- **File**: `backend/services/tkbService.js`, `backend/controllers/thoiKhoaBieuController.js`, `backend/routes/thoiKhoaBieuRoutes.js`, `backend/models/ThoiKhoaBieu.js`
- **Công việc**:
  - [ ] Hàm `assignOverflow(namHoc, onProgress)`:
    - Tính `soTietDaDay` cho mỗi GV (chỉ đếm tiết dạy tại `lop.phanHieu === gv.phanHieu`).
    - Tính `soTietDangDu = max(0, soTietDaDay - soTietDinhMuc)`.
    - Tính `soTietThieu` cho mỗi phân hiệu (lớp thuộc phân hiệu X chưa xếp được tiết).
    - Match GV dư với phân hiệu thiếu: ưu tiên `gv.phanHieuDieuChuyen === phanHieuThieu`.
    - Nếu không match → random phân hiệu thiếu nhiều nhất.
    - Xếp tiết điều chuyển vào TKB (slot trống, GV không trùng).
    - Đánh dấu `ghiChuDieuChuyen = true` cho tiết mới.
  - [ ] Thêm field `ghiChuDieuChuyen: Boolean` vào schema `ThoiKhoaBieu.tietSchema`.
  - [ ] Endpoint: `POST /api/thoi-khoa-bieu/assign-overflow` body `{ namHoc }`.
- **Tiêu chí done**:
  - GV đủ phân công định mức tại phân hiệu chính → được điều chuyển sang phân hiệu `phanHieuDieuChuyen` (nếu phân hiệu đó thiếu).
  - Tiết điều chuyển được đánh dấu trong DB.
- **Ước lượng**: 1.5 ngày.

### Giai đoạn 5 — Tính toán phân công định mức + Stats theo phân hiệu
- **File**: `backend/services/tkbService.js`, `backend/controllers/thoiKhoaBieuController.js`
- **Công việc**:
  - [ ] API mới `GET /api/thoi-khoa-bieu/stats/phan-hieu?namHoc=X` trả về:
    - Danh sách GV, `soTietDaDay` tại phân hiệu chính, `soTietDinhMuc`, `soTietDangDu`, `soTietDangThieu`.
    - Danh sách phân hiệu, `soTietCanDay`, `soTietDaXep`, `soTietThieu`.
  - [ ] Hiển thị nhắc nhở nếu GV dạy vượt định mức (vd "GV A dạy 28 tiết Tiếng Anh tại phân hiệu X, vượt 5 tiết").
- **Tiêu chí done**: Trả về JSON thống kê đầy đủ để người dùng xem.
- **Ước lượng**: 0.5 ngày.

### Giai đoạn 6 — Refactor `tkbService.js` dùng module `optimizer/`
- **File**: `backend/services/tkbService.js`
- **Công việc**:
  - [ ] Replace inline `optimizeSessions` bằng `optimizer/sessionOptimizer.js`.
  - [ ] Replace inline `repairTeacherSlotConflicts` bằng `optimizer/repair.js`.
  - [ ] Replace inline constants bằng `optimizer/constants.js`.
  - [ ] Đảm bảo progress callback hoạt động đúng từ các module con.
- **Tiêu chí done**: tkbService.js giảm từ 1100+ dòng xuống còn ~600 dòng. Output TKB giống phiên bản cũ (khi chạy `/auto-generate`).
- **Ước lượng**: 0.5 ngày.

### Giai đoạn 7 — Frontend: tách 2 button "Sắp theo phân hiệu" + "Sắp điều chuyển"
- **File**: `frontend/src/pages/ThoiKhoaBieuPage.jsx`, `frontend/src/services/api.js`
- **Công việc**:
  - [ ] Thêm button "Sắp theo phân hiệu" → mở modal chọn phân hiệu → gọi `auto-generate-by-phan-hieu`.
  - [ ] Thêm button "Sắp điều chuyển" → gọi `assign-overflow`. CHỈ hiển thị sau khi đã sắp theo phân hiệu ít nhất 1 lần.
  - [ ] **BỎ** hoặc **ẩn** button "Sắp xếp TKB tự động" (vì user không muốn xếp gộp).
  - [ ] API client thêm 2 method mới.
- **Tiêu chí done**: UX tách rõ 2 chức năng, không còn button gộp chung.
- **Ước lượng**: 0.5 ngày.

### Giai đoạn 8 — Frontend: hiển thị tiết điều chuyển (màu đỏ + tooltip)
- **File**: `frontend/src/pages/ThoiKhoaBieuPage.jsx`
- **Công việc**:
  - [ ] TKB cell có `ghiChuDieuChuyen === true` → tô nền đỏ (`bg-red-100` đã có sẵn cho cross-branch, có thể tách class riêng).
  - [ ] Tooltip: "GV X (phân hiệu Y) điều chuyển sang phân hiệu Z".
  - [ ] Filter "chỉ hiển thị tiết điều chuyển" (optional).
- **Tiêu chí done**: Người dùng nhìn TKB biết ngay tiết nào là điều chuyển.
- **Ước lượng**: 0.3 ngày.

### Giai đoạn 9 — Sửa UI GiaoVienPage "Lớp theo chuyên môn"
- **File**: `frontend/src/pages/GiaoVienPage.jsx`
- **Công việc**:
  - [ ] Mặc định filter `lopPhuHop` theo `gv.phanHieu` — chỉ hiển thị lớp thuộc phân hiệu của GV.
  - [ ] Nếu GV chưa có phân hiệu → hiển thị tất cả.
  - [ ] Phân biệt lớp "phân hiệu chính" và "điều chuyển" bằng badge/icon.
- **Tiêu chí done**: Hiển thị đúng yêu cầu người dùng.
- **Ước lượng**: 0.2 ngày.

### Giai đoạn 10 — Test & Polish
- Tạo test data mẫu (nhiều phân hiệu, nhiều GV, nhiều lớp).
- Chạy `/auto-generate-by-phan-hieu` cho từng phân hiệu.
- Chạy `/assign-overflow`.
- Kiểm tra:
  - Tin học không cạnh nhau (chặn cứng)
  - 1 môn 1 GV trong 1 lớp
  - GV dạy hết tiết tại phân hiệu chính
  - GV dư được điều chuyển sang phân hiệu `phanHieuDieuChuyen` nếu có
  - Tiết điều chuyển được đánh dấu và hiển thị màu đỏ
  - Không trùng GV slot
- Fix bug phát sinh.
- **Ước lượng**: 1 ngày.

---

## 5. CÂU HỎI ĐÃ XÁC NHẬN VỚI NGƯỜI DÙNG

> Cập nhật lần cuối: 30/08/2026. Tất cả câu hỏi đã được trả lời.

### Q0 (Sửa): Chính sách Tin học/Công nghệ — skip mềm (phạt điểm) hay chặn cứng (không bao giờ xếp)?
**Đáp án**: **CHẶN CỨNG** (hard skip, không bao giờ vi phạm). Nếu trong cùng buổi (thứ + ca) đã có tiết cùng môn (`Tin học` hoặc `Công nghệ`) ở vị trí cạnh (|tiet_existing - tiet_moi| = 1) → bỏ qua slot đó, không xếp. Đây là HARD CONSTRAINT.
- Code: `findBestSlotForGV` trong `backend/services/tkbService.js` (khoảng dòng 1751-1780) dùng `continue` để bỏ qua slot vi phạm.
- Không dùng "skip mềm" / "trừ điểm rất nặng" vì sẽ có trường hợp không thể tránh.

### Q1: Khi GV đã đủ tiết tại phân hiệu chính, hành vi mong muốn là gì?
**Đáp án**: Tách thành 2 chức năng ĐỘC LẬP:
1. **Sắp theo phân hiệu** (MỚI) — chỉ xếp TKB cho 1 phân hiệu user chọn. GV nào ở phân hiệu đó sẽ dạy lớp của phân hiệu đó (kể cả khi tiết dạy vượt định mức).
2. **Sắp điều chuyển** (MỚI) — chạy SAU khi đã sắp xong theo phân hiệu. Mục đích: phân bổ lại cho cân bằng, GV dư ở phân hiệu này sẽ đi dạy sang phân hiệu đang thiếu (theo `phanHieuDieuChuyen`).
- UI: nút "Sắp theo phân hiệu" + nút "Sắp điều chuyển" trên trang TKB. **BỎ** nút "Sắp xếp TKB tự động" gộp chung (chỉ giữ nút "⋯" ẩn cho legacy).

### Q2: Khi 1 môn (VD Toán) trong 1 lớp cần 5 tiết, nhưng 1 GV chỉ đủ slot cho 3 tiết → xử lý thế nào?
**Đáp án**: **Cho phép tăng tiết** — GV vẫn dạy hết tiết cho lớp đó (dù vượt định mức), hệ thống hiển thị **nhắc nhở** "GV A dạy 28 tiết Tiếng Anh tại phân hiệu X, vượt định mức 5 tiết".
- KHÔNG cố ép xếp 2 GV khác nhau cho cùng 1 môn trong 1 lớp — vẫn giữ ràng buộc "1 môn 1 GV" (xem Giai đoạn 1).
- Nếu 1 GV không đủ slot vì lý do khác (không phải vượt định mức), vẫn ưu tiên dùng GV đó (tăng tiết lên).

### Q3: `phanHieuDieuChuyen` của GV lưu dạng nào?
**Đáp án**: Một chuỗi đơn `String` (chỉ 1 phân hiệu ưu tiên). Đổi từ mảng `String[]` thành `String` đơn trong model.

### Q4: Khi xếp điều chuyển, có cần đánh dấu tiết đó là "điều chuyển" trong TKB không?
**Đáp án**: **Có** — tiết điều chuyển sẽ hiển thị màu đỏ (logic đã có ở frontend: class `bg-red-100 hover:bg-red-200` trong `ThoiKhoaBieuPage.jsx`). Cần bổ sung thêm:
- Tooltip giải thích "GV X (phân hiệu Y) điều chuyển đến phân hiệu Z".
- Filter "chỉ hiển thị tiết điều chuyển" (optional — chưa làm).
- Field DB: `ThoiKhoaBieu.ngayTrongTuan.tiets.ghiChuDieuChuyen: Boolean` đã được thêm vào model.

---

## 6. RỦI RO & CÂN NHẮC

### 6.1. Khối lượng dữ liệu
- Trường có thể có ~50 GV, ~30 lớp, ~5 phân hiệu → TKB có thể sinh ra ~750 tiết. Thuật toán hiện tại chạy trong vài giây, vẫn OK.

### 6.2. Tính đúng đắn
- **"Tin học/CN không cạnh nhau"** là HARD CONSTRAINT (chặn cứng) — sẽ KHÔNG bao giờ vi phạm, kể cả khi không có lựa chọn nào khác.
- **"1 môn 1 GV trong 1 lớp"** là HARD CONSTRAINT — GV dạy vượt định mức vẫn dạy tiếp, không chia cho GV khác.
- **"GV cùng phân hiệu"** là SOFT (có bonus điểm) — nếu không có GV cùng phân hiệu sẽ dùng GV khác phân hiệu.

### 6.3. UX
- Khi xếp TKB chạy lâu (30s-1 phút), cần progress bar (đã có).

### 6.4. Tương thích ngược
- Không thay đổi schema của `ThoiKhoaBieu` (chỉ thêm field optional `ghiChuDieuChuyen`).
- Endpoint cũ `/auto-generate` GIỮ NGUYÊN, chỉ frontend ngưng dùng → không ảnh hưởng dữ liệu cũ.

---

## 7. TIẾN ĐỘ

| Giai đoạn | Mô tả | Trạng thái | Ghi chú |
|-----------|-------|------------|---------|
| 0 | Khảo sát & kế hoạch | ✅ Done | File PLAN.md |
| 1 | Sửa chính sách Tin học/CN (CHẶN CỨNG) + Khóa GV theo môn | ✅ Done | 30/08/2026 |
| 2 | Tách `autoGenerateByPhanHieu` (rẽ nhánh theo phân hiệu) | ✅ Done | Backend: `tkbService.autoGenerateByPhanHieu` + controller + route |
| 3 | Thêm field `phanHieuDieuChuyen` (string đơn) cho GV | ✅ Done | Model + controller + form GiaoVienPage |
| 4 | Implement `assignOverflow` (chức năng điều chuyển) | ✅ Done | Backend: `tkbService.assignOverflow` + controller + route. Field `ghiChuDieuChuyen` đã thêm vào model `ThoiKhoaBieu.tietSchema` |
| 5 | Tính toán phân công định mức + Stats theo phân hiệu | ⏳ Partial | `assignOverflow` đã trả về `nhanhCheGV` (frontend dùng hiển thị nhắc nhở). Endpoint `/stats/phan-hieu` chưa có |
| 6 | Refactor tkbService dùng optimizer/ | ⏳ Chưa bắt đầu | Module `optimizer/` đã viết nhưng chưa wire vào `tkbService` chính |
| 7 | Frontend: tách 2 button Sắp theo phân hiệu + Sắp điều chuyển | ✅ Done | Thêm button + modal chọn phân hiệu |
| 8 | Frontend: hiển thị tiết điều chuyển (màu đỏ + tooltip) | ✅ Done | Màu đỏ đã có sẵn (`bg-red-100`). Tooltip giải thích phân hiệu chưa có |
| 9 | Sửa UI GiaoVienPage lớp theo CM (lọc theo phân hiệu) | ⏳ Chưa bắt đầu | Logic `lopPhuHop` hiện không lọc theo phân hiệu |
| 10 | Test & Polish | ⏳ Chưa bắt đầu | Cần test với dữ liệu thật |

---

## 8. GHI CHÚ KHI GẶP VẤN ĐỀ

Nếu tôi đi sai hướng, bạn có thể chỉnh trực tiếp file này hoặc nói:
- "Dừng giai đoạn X, làm lại từ đầu."
- "Bỏ giai đoạn X, chuyển sang giai đoạn Y."
- "Ý tưởng này không đúng, tôi muốn theo hướng khác."

Tôi sẽ đọc lại file này trước mỗi lần bắt đầu một giai đoạn mới.
