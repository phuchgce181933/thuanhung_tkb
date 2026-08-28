const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saplich');
    require('../models/Lop');
    require('../models/Khoi');
    require('../models/GiaoVien');
    const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
    const GiaoVien = require('../models/GiaoVien');

    // Tìm 1 GV dạy nhiều lớp
    const tkbs = await ThoiKhoaBieu.find({ namHoc: '2024-2025' }).populate('lop');
    console.log('Tổng TKBs:', tkbs.length);

    // Đếm GV xuất hiện trong nhiều TKB
    const gvCounts = {};
    for (const tkb of tkbs) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (!tiet.giaoVien) continue;
          const id = tiet.giaoVien.toString();
          if (!gvCounts[id]) gvCounts[id] = { count: 0, lops: new Set(), tiets: [] };
          gvCounts[id].count++;
          gvCounts[id].lops.add(tkb.lop?._id?.toString());
          gvCounts[id].tiets.push({
            tkbId: tkb._id.toString(),
            lop: tkb.lop?.tenLop,
            thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet,
            chuyenMon: tiet.chuyenMon
          });
        }
      }
    }

    // GV dạy >=2 lớp
    const multiLopGVs = Object.entries(gvCounts).filter(([_, v]) => v.lops.size >= 2);
    console.log('GV dạy >=2 lớp:', multiLopGVs.length);

    if (multiLopGVs.length > 0) {
      const [gvId, info] = multiLopGVs[0];
      const gv = await GiaoVien.findById(gvId);
      console.log('GV mẫu:', gv?.hoTen, '(id:', gvId, ')');
      console.log('Số tiết:', info.count, 'Số lớp:', info.lops.size);
      console.log('Các tiết:');
      info.tiets.slice(0, 6).forEach(t => {
        console.log(' -', t.lop, 'T' + t.thu, t.buoi, 'tiet' + t.tiet, t.chuyenMon);
      });

      // Lấy 2 tiết khác lớp khác buổi
      const bySlot = new Map();
      for (const t of info.tiets) {
        const key = `${t.thu}-${t.buoi}-${t.tiet}`;
        if (!bySlot.has(key)) bySlot.set(key, []);
        bySlot.get(key).push(t);
      }
      const distinctSlots = [...bySlot.values()].filter(arr => arr.length === 1);
      console.log('Slot GV đó xuất hiện 1 lần:', distinctSlots.length);

      if (distinctSlots.length >= 2) {
        const t1 = distinctSlots[0][0];
        const t2 = distinctSlots[1][0];
        console.log('\n=== Test swap 2 tiết của cùng GV ===');
        console.log('Tiết 1:', t1);
        console.log('Tiết 2:', t2);

        // Test API swap
        const fetch = require('node-fetch');
        const response = await fetch('http://localhost:5000/api/thoi-khoa-bieu/move-or-swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceTkbId: t1.tkbId,
            sourceThu: t1.thu, sourceBuoi: t1.buoi, sourceTiet: t1.tiet,
            targetTkbId: t2.tkbId,
            targetThu: t2.thu, targetBuoi: t2.buoi, targetTiet: t2.tiet,
            action: 'swap'
          })
        });
        const result = await response.json();
        console.log('\n=== KẾT QUẢ ===');
        console.log('Status:', response.status);
        console.log(JSON.stringify(result, null, 2).slice(0, 500));
      }
    }

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
