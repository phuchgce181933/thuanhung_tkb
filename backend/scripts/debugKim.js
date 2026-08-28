// Debug: đếm chính xác từng bước theo yêu cầu
require('dotenv').config();
const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');
const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    // ============================================================
    // YÊU CẦU 1: Đếm nhu cầu từng lớp + từng môn
    // ============================================================
    console.log('========== YÊU CẦU 1: NHU CẦU TỪNG LỚP ==========');
    const lops = await Lop.find({}).sort({ tenLop: 1 }).populate('khoi');
    let totalRequired = 0;
    for (const lop of lops) {
      console.log(`\nLớp: ${lop.tenLop} (Khối: ${lop.khoi?.tenKhoi})`);
      for (const cm of lop.chuyenMons) {
        totalRequired += cm.soTietTuan;
        console.log(`  - ${cm.tenChuyenMon}: required = ${cm.soTietTuan}`);
      }
    }
    console.log(`\n>>> TOTAL REQUIRED (tất cả lớp, tất cả môn) = ${totalRequired}`);

    // YÊU CẦU 1b: Nhu cầu cho 7 lớp (3a6..5c6) × Tin học + Công nghệ
    console.log('\n--- Subset: 7 lớp × {Tin học, Công nghệ} ---');
    const targetLopNames = ['3a6', '3b6', '4a6', '4b6', '5a6', '5b6', '5c6'];
    let subRequired = 0;
    for (const lop of lops.filter(l => targetLopNames.includes(l.tenLop))) {
      console.log(`  ${lop.tenLop}:`);
      for (const cm of lop.chuyenMons) {
        if (cm.tenChuyenMon === 'Tin học' || cm.tenChuyenMon === 'Công nghệ') {
          subRequired += cm.soTietTuan;
          console.log(`    - ${cm.tenChuyenMon}: ${cm.soTietTuan}`);
        }
      }
    }
    console.log(`>>> TOTAL REQUIRED (7 lớp × Tin/CN) = ${subRequired}`);

    // ============================================================
    // YÊU CẦU 2: TKB hiện tại của GV "kim" - đếm trực tiếp
    // ============================================================
    console.log('\n========== YÊU CẦU 2: TKB GV "kim" (TỪ DB) ==========');
    const gvKim = await GiaoVien.findOne({ hoTen: { $regex: '^kim$', $options: 'i' } });
    if (!gvKim) {
      console.log('KHÔNG tìm thấy GV "kim"!');
    } else {
      console.log(`GV: ${gvKim.hoTen} | ID: ${gvKim._id}`);
      console.log(`Chuyên môn: ${gvKim.chuyenMon.map(c => c.tenChuyenMon).join(', ')}`);
      console.log(`NV: soBuoiToiDa=${gvKim.nguyenVong?.soBuoiToiDa}`);

      // Lấy TKB từ DB
      const tkbs = await ThoiKhoaBieu.find({})
        .populate({ path: 'lop', populate: { path: 'khoi' } })
        .populate('ngayTrongTuan.tiets.giaoVien');

      const kimItems = [];
      const sessionsSet = new Set();
      for (const tkb of tkbs) {
        for (const ngay of tkb.ngayTrongTuan) {
          for (const tiet of ngay.tiets) {
            if (tiet.giaoVien && tiet.giaoVien._id.toString() === gvKim._id.toString()) {
              kimItems.push({
                lop: tkb.lop?.tenLop || '?',
                thu: ngay.thu,
                buoi: ngay.buoi,
                tiet: tiet.tiet,
                mon: tiet.chuyenMon,
                tkbId: tkb._id.toString()
              });
              sessionsSet.add(`${ngay.thu}-${ngay.buoi}`);
            }
          }
        }
      }
      console.log(`\n>>> GV Kim actual assigned periods (từ DB) = ${kimItems.length}`);
      console.log(`>>> GV Kim sessions (thu × buoi) = ${sessionsSet.size} buổi`);

      // Sắp xếp & in
      kimItems.sort((a, b) => {
        if (a.thu !== b.thu) return a.thu - b.thu;
        if (a.buoi !== b.buoi) return a.buoi === 'sang' ? -1 : 1;
        return a.tiet - b.tiet;
      });
      console.log('\nDanh sách chi tiết:');
      for (const it of kimItems) {
        console.log(`  T${it.thu} ${it.buoi} tiết ${it.tiet} | ${it.lop} | ${it.mon}`);
      }
    }

    // ============================================================
    // YÊU CẦU 3: Validate theo lớp (assigned vs required)
    // ============================================================
    console.log('\n========== YÊU CẦU 3: VALIDATE TỪNG LỚP (assigned vs required) ==========');
    const allTKB = await ThoiKhoaBieu.find({}).populate('ngayTrongTuan.tiets.giaoVien');
    let totalAssigned = 0;
    let totalMissing = 0;
    const perClassPerSubject = [];

    for (const lop of lops) {
      const tkb = allTKB.find(t => t.lop.toString() === lop._id.toString());
      // Đếm actual theo môn cho lớp này
      const actualByMon = new Map();
      let classTotalTiet = 0;
      if (tkb) {
        for (const ngay of tkb.ngayTrongTuan) {
          for (const tiet of ngay.tiets) {
            classTotalTiet++;
            const key = tiet.chuyenMon;
            actualByMon.set(key, (actualByMon.get(key) || 0) + 1);
          }
        }
      }
      console.log(`\nLớp ${lop.tenLop} (tổng tiết trong TKB = ${classTotalTiet}):`);
      for (const cm of lop.chuyenMons) {
        const assigned = actualByMon.get(cm.tenChuyenMon) || 0;
        const remaining = cm.soTietTuan - assigned;
        const isTarget = targetLopNames.includes(lop.tenLop) && (cm.tenChuyenMon === 'Tin học' || cm.tenChuyenMon === 'Công nghệ');
        const marker = isTarget ? ' <<<' : '';
        const status = remaining !== 0 ? (remaining > 0 ? `THIẾU ${remaining}` : `THỪA ${-remaining}`) : 'OK';
        console.log(`  ${cm.tenChuyenMon}: required=${cm.soTietTuan} | assigned=${assigned} | remaining=${remaining} [${status}]${marker}`);
        perClassPerSubject.push({
          lop: lop.tenLop, mon: cm.tenChuyenMon, required: cm.soTietTuan, assigned, remaining
        });
        totalAssigned += assigned;
        if (remaining > 0) totalMissing += remaining;
      }
    }
    console.log(`\n>>> TOTAL ASSIGNED (DB) = ${totalAssigned}`);
    console.log(`>>> TOTAL MISSING = ${totalMissing}`);
    console.log(`>>> TOTAL REQUIRED = ${totalRequired}`);
    console.log(`>>> TOTAL REQUIRED - ASSIGNED = ${totalRequired - totalAssigned} (bằng missing nếu không thừa)`);

    // ============================================================
    // YÊU CẦU 4: Kiểm tra duplicate
    // ============================================================
    console.log('\n========== YÊU CẦU 4: KIỂM TRA DUPLICATE ==========');
    // 4a. class + day + session + period duplicate
    const slotDup = new Map(); // classId+key -> count
    for (const tkb of allTKB) {
      const classKey = tkb.lop.toString();
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          const k = `${classKey}|${ngay.thu}|${ngay.buoi}|${tiet.tiet}`;
          slotDup.set(k, (slotDup.get(k) || 0) + 1);
        }
      }
    }
    const dupSlots = [...slotDup.entries()].filter(([_, c]) => c > 1);
    console.log(`Duplicate class+slot: ${dupSlots.length === 0 ? 'KHÔNG CÓ' : dupSlots.length}`);
    for (const [k, c] of dupSlots) console.log(`  ${k} x${c}`);

    // 4b. class + subject + teacher (cùng GV dạy cùng lớp cùng môn 2 lần)
    const clSubTchDup = new Map();
    for (const tkb of allTKB) {
      const classKey = tkb.lop.toString();
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          const gvId = tiet.giaoVien ? tiet.giaoVien._id.toString() : 'null';
          const k = `${classKey}|${tiet.chuyenMon}|${gvId}`;
          clSubTchDup.set(k, (clSubTchDup.get(k) || 0) + 1);
        }
      }
    }
    const dupCST = [...clSubTchDup.entries()].filter(([_, c]) => c > 1);
    console.log(`\nDuplicate class+subject+teacher: ${dupCST.length === 0 ? 'KHÔNG CÓ' : dupCST.length}`);
    for (const [k, c] of dupCST) console.log(`  ${k} x${c}`);

    // 4c. Tổng entries per TKB
    console.log('\nTổng entries per TKB:');
    for (const tkb of allTKB) {
      let c = 0;
      for (const ngay of tkb.ngayTrongTuan) c += ngay.tiets.length;
      const lopName = lops.find(l => l._id.toString() === tkb.lop.toString())?.tenLop;
      console.log(`  ${lopName}: ${c} tiết | ${tkb.ngayTrongTuan.length} ngày`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
})();
