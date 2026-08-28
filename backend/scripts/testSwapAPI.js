const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saplich');
    require('../models/Lop');
    require('../models/Khoi');
    require('../models/GiaoVien');
    const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');

    const tkbs = await ThoiKhoaBieu.find({ namHoc: '2024-2025' }).populate('lop');
    const gvCounts = {};
    for (const tkb of tkbs) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (!tiet.giaoVien) continue;
          const id = tiet.giaoVien.toString();
          if (!gvCounts[id]) gvCounts[id] = { lops: new Set(), tiets: [] };
          gvCounts[id].lops.add(tkb.lop?._id?.toString());
          gvCounts[id].tiets.push({ tkbId: tkb._id.toString(), lop: tkb.lop?.tenLop, thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet, chuyenMon: tiet.chuyenMon, gv: id });
        }
      }
    }
    const multiLopGVs = Object.entries(gvCounts).filter(([_, v]) => v.lops.size >= 2);
    if (multiLopGVs.length === 0) { console.log('No GV with multi-lop'); process.exit(0); }

    // Tìm GV dạy 2+ lớp với 2 môn khác nhau
    let chosen = null;
    for (const [id, info] of multiLopGVs) {
      const mons = new Set(info.tiets.map(t => t.chuyenMon));
      if (mons.size >= 2) { chosen = [id, info]; break; }
    }
    if (!chosen) { console.log('No GV with 2+ mons across 2+ lops'); process.exit(0); }
    const [gvId, info] = chosen;
    const byKey = new Map();
    for (const t of info.tiets) {
      const key = `${t.thu}-${t.buoi}-${t.tiet}-${t.tkbId}`;
      if (!byKey.has(key)) byKey.set(key, t);
    }
    const slots = [...byKey.values()];
    if (slots.length < 2) { console.log('Not enough'); process.exit(0); }

    const t1 = slots[0];
    // Tìm tiết cùng GV nhưng khác chuyenMon VÀ khác TKB
    const t2Candidates = slots.filter(s => s.tkbId !== t1.tkbId && s.chuyenMon !== t1.chuyenMon);
    if (t2Candidates.length === 0) {
      console.log('No cross-TKB different-mon for this GV. Falling back to same TKB.');
    }
    const t2 = t2Candidates[0] || slots[1];
    console.log('Will swap:');
    console.log('T1:', t1);
    console.log('T2:', t2);
    if (t1.tkbId === t2.tkbId) console.log('NOTE: Cùng TKB');

    // Gọi API move-or-swap
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
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Body:', JSON.stringify(data).slice(0, 500));

    // Check DB
    const tkb1After = await ThoiKhoaBieu.findById(t1.tkbId);
    const tkb2After = await ThoiKhoaBieu.findById(t2.tkbId);
    const t1After = tkb1After.ngayTrongTuan.find(n => n.thu === t1.thu && n.buoi === t1.buoi)?.tiets.find(t => t.tiet === t1.tiet);
    const t2After = tkb2After.ngayTrongTuan.find(n => n.thu === t2.thu && n.buoi === t2.buoi)?.tiets.find(t => t.tiet === t2.tiet);
    console.log('T1 after:', t1After);
    console.log('T2 after:', t2After);

    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
})();