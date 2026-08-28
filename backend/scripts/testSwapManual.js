const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saplich');
    require('./models/Lop');
    require('./models/Khoi');
    require('./models/GiaoVien');
    const ThoiKhoaBieu = require('./models/ThoiKhoaBieu');

    const tkbs = await ThoiKhoaBieu.find({ namHoc: '2024-2025' }).populate('lop');
    const gvCounts = {};
    for (const tkb of tkbs) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (!tiet.giaoVien) continue;
          const id = tiet.giaoVien.toString();
          if (!gvCounts[id]) gvCounts[id] = { count: 0, lops: new Set(), tiets: [] };
          gvCounts[id].count++;
          gvCounts[id].lops.add(tkb.lop?._id?.toString());
          gvCounts[id].tiets.push({ tkbId: tkb._id.toString(), lop: tkb.lop?.tenLop, thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet, chuyenMon: tiet.chuyenMon });
        }
      }
    }
    const multiLopGVs = Object.entries(gvCounts).filter(([_, v]) => v.lops.size >= 2);
    if (multiLopGVs.length === 0) { console.log('No GV with multi-lop'); process.exit(0); }

    const [gvId, info] = multiLopGVs[0];
    const bySlot = new Map();
    for (const t of info.tiets) {
      const key = `${t.thu}-${t.buoi}-${t.tiet}-${t.tkbId}`;
      if (!bySlot.has(key)) bySlot.set(key, t);
    }
    const slots = [...bySlot.values()];
    if (slots.length < 2) { console.log('Not enough slots'); process.exit(0); }

    const t1 = slots[0], t2 = slots[1];
    console.log('T1:', t1);
    console.log('T2:', t2);

    // Kiểm tra trước swap
    const tkb1 = await ThoiKhoaBieu.findById(t1.tkbId);
    const tkb2 = await ThoiKhoaBieu.findById(t2.tkbId);
    const t1Before = tkb1.ngayTrongTuan.find(n => n.thu === t1.thu && n.buoi === t1.buoi)?.tiets.find(t => t.tiet === t1.tiet);
    const t2Before = tkb2.ngayTrongTuan.find(n => n.thu === t2.thu && n.buoi === t2.buoi)?.tiets.find(t => t.tiet === t2.tiet);
    console.log('T1 before:', t1Before);
    console.log('T2 before:', t2Before);

    // Swap thủ công
    const t1Ngay = tkb1.ngayTrongTuan.find(n => n.thu === t1.thu && n.buoi === t1.buoi);
    const t2Ngay = tkb2.ngayTrongTuan.find(n => n.thu === t2.thu && n.buoi === t2.buoi);
    t1Ngay.tiets = t1Ngay.tiets.filter(t => t.tiet !== t1.tiet);
    t2Ngay.tiets = t2Ngay.tiets.filter(t => t.tiet !== t2.tiet);
    t2Ngay.tiets.push({ ...t1Before.toObject(), tiet: t2.tiet });
    t1Ngay.tiets.push({ ...t2Before.toObject(), tiet: t1.tiet });
    t1Ngay.tiets.sort((a,b) => a.tiet - b.tiet);
    t2Ngay.tiets.sort((a,b) => a.tiet - b.tiet);

    await tkb1.save();
    if (tkb2._id.toString() !== tkb1._id.toString()) await tkb2.save();
    console.log('Saved.');

    // Reload & kiểm tra
    const tkb1After = await ThoiKhoaBieu.findById(t1.tkbId);
    const tkb2After = await ThoiKhoaBieu.findById(t2.tkbId);
    const t1After = tkb1After.ngayTrongTuan.find(n => n.thu === t1.thu && n.buoi === t1.buoi)?.tiets.find(t => t.tiet === t1.tiet);
    const t2After = tkb2After.ngayTrongTuan.find(n => n.thu === t2.thu && n.buoi === t2.buoi)?.tiets.find(t => t.tiet === t2.tiet);
    console.log('T1 after:', t1After);
    console.log('T2 after:', t2After);

    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
})();