const mongoose = require('mongoose');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const GiaoVien = require('../models/GiaoVien');
const Lop = require('../models/Lop');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const namHoc = process.argv[2] || '2024-2025';
  const kimName = process.argv[3] || 'kim';

  const kim = await GiaoVien.findOne({ hoTen: new RegExp(`^${kimName}$`, 'i') });
  console.log('GV:', kim?.hoTen, kim?._id);

  const tkbs = await ThoiKhoaBieu.find({ namHoc })
    .populate('ngayTrongTuan.tiets.giaoVien')
    .populate('lop');

  let count = 0;
  const slots = [];
  for (const tkb of tkbs) {
    for (const ngay of tkb.ngayTrongTuan) {
      for (const t of ngay.tiets) {
        if (t.giaoVien && kim && t.giaoVien._id.toString() === kim._id.toString()) {
          count++;
          slots.push({
            thu: ngay.thu,
            buoi: ngay.buoi,
            tiet: t.tiet,
            lop: tkb.lop?.tenLop || tkb.lop
          });
        }
      }
    }
  }
  console.log(`Kim total: ${count}`);
  console.log('Slots:', JSON.stringify(slots, null, 2));
  await mongoose.disconnect();
})();
