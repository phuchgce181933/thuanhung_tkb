const mongoose = require('mongoose');
const Lop = require('../models/Lop');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const connectDB = require('../config/db');

(async () => {
  await connectDB();
  const tkbs = await ThoiKhoaBieu.find({}).populate('lop');
  let removed = 0;
  for (const tkb of tkbs) {
    let changed = false;
    for (const ngay of tkb.ngayTrongTuan || []) {
      if (ngay.thu !== 6) continue;
      const before = ngay.tiets.length;
      ngay.tiets = (ngay.tiets || []).filter(t => {
        const isSHL = ngay.buoi === 'sang' && t.tiet === 4;
        const isChieu = ngay.buoi === 'chieu';
        if (isSHL || isChieu) {
          removed++;
          return false;
        }
        return true;
      });
      if (ngay.tiets.length !== before) changed = true;
      // xóa ngày rỗng
      tkb.ngayTrongTuan = tkb.ngayTrongTuan.filter(n => (n.tiets && n.tiets.length > 0));
    }
    if (changed) await tkb.save();
  }
  console.log(`✓ Đã gỡ ${removed} tiết vi phạm T6 khỏi DB.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
