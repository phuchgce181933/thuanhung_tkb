const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saplich');
    require('../models/Lop');
    require('../models/Khoi');
    require('../models/GiaoVien');
    const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');

    const tkbs = await ThoiKhoaBieu.find({ namHoc: '2024-2025' });
    console.log('TKB count:', tkbs.length);

    // Build tkbData giống frontend: { tkbId: { ngayTrongTuan: [...] } }
    const tkbData = {};
    for (const tkb of tkbs) {
      tkbData[tkb._id.toString()] = {
        ngayTrongTuan: tkb.ngayTrongTuan.map(n => ({
          thu: n.thu,
          buoi: n.buoi,
          tiets: n.tiets.map(t => {
            const gvId = typeof t.giaoVien === 'object' ? (t.giaoVien._id ? t.giaoVien._id.toString() : null) : t.giaoVien;
            return { tiet: t.tiet, chuyenMon: t.chuyenMon, giaoVien: gvId };
          })
        }))
      };
    }

    // Đếm số tiết tổng
    let totalTiets = 0;
    for (const v of Object.values(tkbData)) {
      for (const n of v.ngayTrongTuan) totalTiets += n.tiets.length;
    }
    console.log('Total tiets in payload:', totalTiets);

    // Gọi API
    const response = await fetch('http://localhost:5000/api/thoi-khoa-bieu/apply-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ namHoc: '2024-2025', tkbData })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Body:', JSON.stringify(data).slice(0, 300));

    // Verify DB unchanged
    const tkbsAfter = await ThoiKhoaBieu.find({ namHoc: '2024-2025' });
    let totalAfter = 0;
    for (const t of tkbsAfter) for (const n of t.ngayTrongTuan) totalAfter += n.tiets.length;
    console.log('Total tiets after:', totalAfter);

    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
})();