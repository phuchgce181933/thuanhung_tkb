// Debug greedy: xem tại sao GV Kim có 24 tiết thay vì 14
require('dotenv').config();
const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');
const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Xem GV Kim
    const kim = await GiaoVien.findOne({ hoTen: { $regex: '^kim$', $options: 'i' } });
    console.log('=== GV KIM ===');
    console.log('Chuyên môn:', JSON.stringify(kim.chuyenMon, null, 2));
    console.log('NV:', JSON.stringify(kim.nguyenVong, null, 2));

    // Xem 7 lớp
    const targetLopNames = ['3a6', '3b6', '4a6', '4b6', '5a6', '5b6', '5c6'];
    const lops = await Lop.find({ tenLop: { $in: targetLopNames } }).populate('khoi').sort({ tenLop: 1 });
    console.log('\n=== CAC LOP ===');
    for (const lop of lops) {
      console.log(`\n${lop.tenLop} (${lop.khoi?.tenKhoi}):`);
      for (const cm of lop.chuyenMons) {
        console.log(`  - ${cm.tenChuyenMon}: ${cm.soTietTuan} tiết`);
      }
    }

    // Tính tổng yêu cầu cho GV Kim
    let totalRequired = 0;
    for (const lop of lops) {
      for (const cm of lop.chuyenMons) {
        // Kiểm tra Kim có dạy môn này không
        const kimDay = kim.chuyenMon.some(kcm => kcm.tenChuyenMon === cm.tenChuyenMon);
        if (kimDay) {
          console.log(`${lop.tenLop} ${cm.tenChuyenMon}: ${cm.soTietTuan} (Kim dạy)`);
          totalRequired += cm.soTietTuan;
        }
      }
    }
    console.log(`\nTổng yêu cầu cho Kim: ${totalRequired} tiết`);

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
})();
