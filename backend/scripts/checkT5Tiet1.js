const mongoose = require('mongoose');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const Lop = require('../models/Lop');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const namHoc = '2024-2025';

  const tkbs = await ThoiKhoaBieu.find({ namHoc })
    .populate('ngayTrongTuan.tiets.giaoVien')
    .populate('lop');

  // Tìm T5 tiết 1 ở tất cả các lớp
  console.log('=== T5 tiết 1 (thứ 5, buổi sáng, tiết 1) ở tất cả lớp ===');
  for (const tkb of tkbs) {
    const ngay5 = tkb.ngayTrongTuan.find(n => n.thu === 5 && n.buoi === 'sang');
    if (ngay5) {
      const tiet1 = ngay5.tiets.find(t => t.tiet === 1);
      console.log(`Lớp ${tkb.lop?.tenLop}: ${tiet1 ? `${tiet1.chuyenMon} - GV ${tiet1.giaoVien?.hoTen}` : 'TRỐNG'}`);
    } else {
      console.log(`Lớp ${tkb.lop?.tenLop}: ngày 5 buổi sáng trống`);
    }
  }

  console.log('\n=== T4 tiết 1 ở tất cả lớp ===');
  for (const tkb of tkbs) {
    const ngay4 = tkb.ngayTrongTuan.find(n => n.thu === 4 && n.buoi === 'sang');
    if (ngay4) {
      const tiet1 = ngay4.tiets.find(t => t.tiet === 1);
      console.log(`Lớp ${tkb.lop?.tenLop}: ${tiet1 ? `${tiet1.chuyenMon} - GV ${tiet1.giaoVien?.hoTen}` : 'TRỐNG'}`);
    } else {
      console.log(`Lớp ${tkb.lop?.tenLop}: ngày 4 buổi sáng trống`);
    }
  }
  await mongoose.disconnect();
})();