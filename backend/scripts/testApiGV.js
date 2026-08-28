// Test API getTKBByGiaoVien cho GV "kim"
require('dotenv').config();
const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const kim = await GiaoVien.findOne({ hoTen: { $regex: '^kim$', $options: 'i' } });
    console.log('Kim ID:', kim?._id);

    // Gọi giống API getTKBByGiaoVien
    const tkbs = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate({ path: 'lop', populate: { path: 'khoi' } })
      .populate('ngayTrongTuan.tiets.giaoVien');

    const schedule = [];
    for (const tkb of tkbs) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien._id.toString() === kim._id.toString()) {
            schedule.push({
              thu: ngay.thu,
              buoi: ngay.buoi,
              tiet: tiet.tiet,
              lop: tkb.lop,
              chuyenMon: tiet.chuyenMon,
              tkbId: tkb._id
            });
          }
        }
      }
    }
    schedule.sort((a, b) => {
      if (a.thu !== b.thu) return a.thu - b.thu;
      if (a.buoi !== b.buoi) return a.buoi === 'sang' ? -1 : 1;
      return a.tiet - b.tiet;
    });

    console.log(`\nAPI getTKBByGiaoVien('kim') trả về ${schedule.length} items:`);
    for (const s of schedule) {
      console.log(`  T${s.thu} ${s.buoi} tiết ${s.tiet} | ${s.lop?.tenLop} | ${s.chuyenMon}`);
    }

    // Phân bổ theo buổi
    const sang = schedule.filter(s => s.buoi === 'sang');
    const chieu = schedule.filter(s => s.buoi === 'chieu');
    console.log(`\nSáng: ${sang.length} tiết`);
    console.log(`Chiều: ${chieu.length} tiết`);

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
})();
