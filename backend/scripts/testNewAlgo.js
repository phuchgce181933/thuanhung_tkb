// Test thuật toán mới - verify GV Kim 14 tiết / 4 buổi
require('dotenv').config();
const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');
const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const tkbService = require('../services/tkbService');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    // Xóa TKB cũ
    await ThoiKhoaBieu.deleteMany({ namHoc: '2024-2025' });
    console.log('Cleared old TKB.\n');

    // Run auto-generate
    console.log('Running auto-generate...');
    const result = await tkbService.autoGenerateTKB('2024-2025');
    console.log('\n=== RESULT ===');
    console.log('Success:', result.success);
    console.log('Message:', result.message);
    if (result.thongKeBuoi) {
      console.log('\n=== THONG KE BUOI ===');
      for (const row of result.thongKeBuoi) {
        console.log(`  ${row.gv}: desired=${row.desired} actual=${row.actual} satisfied=${row.satisfied} [${row.note}]`);
      }
    }
    if (result.viPhamNV) {
      console.log('\n=== VI PHAM NV ===');
      console.log(`  Total: ${result.viPhamNV.tongSoTiet} tiết vi phạm`);
    }

    // Verify GV Kim
    const kim = await GiaoVien.findOne({ hoTen: { $regex: '^kim$', $options: 'i' } });
    const tkbs = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate({ path: 'lop', populate: { path: 'khoi' } })
      .populate('ngayTrongTuan.tiets.giaoVien');

    const kimItems = [];
    for (const tkb of tkbs) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien._id.toString() === kim._id.toString()) {
            kimItems.push({
              thu: ngay.thu,
              buoi: ngay.buoi,
              tiet: tiet.tiet,
              lop: tkb.lop?.tenLop,
              mon: tiet.chuyenMon
            });
          }
        }
      }
    }

    kimItems.sort((a, b) => {
      if (a.thu !== b.thu) return a.thu - b.thu;
      if (a.buoi !== b.buoi) return a.buoi === 'sang' ? -1 : 1;
      return a.tiet - b.tiet;
    });

    const bySession = new Map();
    for (const it of kimItems) {
      const key = `T${it.thu}-${it.buoi}`;
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key).push(it);
    }

    console.log('\n=== GV KIM SCHEDULE ===');
    console.log(`Total periods: ${kimItems.length}`);
    console.log(`Total sessions: ${bySession.size}`);
    for (const [key, items] of bySession) {
      console.log(`  ${key}: ${items.length} tiết (${items.map(i => i.tiet).join(', ')})`);
    }

    console.log('\nDetail:');
    for (const it of kimItems) {
      console.log(`  T${it.thu} ${it.buoi} tiết ${it.tiet} | ${it.lop} | ${it.mon}`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
})();
