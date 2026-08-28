// Script kiểm tra DB: GV "Kim" và các lớp/môn liên quan
require('dotenv').config();
const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');
const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB:', mongoose.connection.host);

    // 1. Tìm GV có tên chứa "Kim"
    const gvKims = await GiaoVien.find({ hoTen: { $regex: 'Kim', $options: 'i' } });
    console.log('\n=== GV có tên "Kim" ===');
    console.log('Số lượng:', gvKims.length);
    for (const gv of gvKims) {
      console.log(`\nID: ${gv._id}`);
      console.log(`Họ tên: ${gv.hoTen}`);
      console.log(`Trạng thái: ${gv.trangThai}`);
      console.log(`Chuyên môn:`);
      for (const cm of gv.chuyenMon) {
        console.log(`  - ${cm.tenChuyenMon}: ${cm.soTietTuan} tiết/tuần`);
      }
      const tongSoTiet = gv.chuyenMon.reduce((s, cm) => s + cm.soTietTuan, 0);
      console.log(`TỔNG tiết/tuần (sum chuyenMon): ${tongSoTiet}`);
      console.log(`Nguyện vọng:`, JSON.stringify(gv.nguyenVong || {}, null, 2));
    }

    // 2. Tất cả GV (xem có nhiều Kim không)
    const allGV = await GiaoVien.find({}).select('hoTen chuyenMon trangThai');
    console.log('\n=== Tất cả GV active ===');
    for (const gv of allGV.filter(x => x.trangThai === 'active')) {
      const tong = gv.chuyenMon.reduce((s, cm) => s + cm.soTietTuan, 0);
      console.log(`- ${gv.hoTen} | ${gv.chuyenMon.map(c=>c.tenChuyenMon+':'+c.soTietTuan).join(', ')} | TỔNG=${tong}`);
    }

    // 3. Tất cả lớp
    const lops = await Lop.find({}).populate('khoi');
    console.log('\n=== Tất cả lớp ===');
    for (const lop of lops) {
      console.log(`\nLớp: ${lop.tenLop} (Khối: ${lop.khoi?.tenKhoi || 'N/A'})`);
      console.log(`  chuyenMons (${lop.chuyenMons.length} môn):`);
      for (const cm of lop.chuyenMons) {
        console.log(`    - ${cm.tenChuyenMon}: ${cm.soTietTuan} tiết/tuần`);
      }
    }

    // 4. TKB hiện tại của GV Kim (nếu có)
    for (const gv of gvKims) {
      const tkbs = await ThoiKhoaBieu.find({})
        .populate({ path: 'lop', populate: { path: 'khoi' } })
        .populate('ngayTrongTuan.tiets.giaoVien');
      const items = [];
      for (const tkb of tkbs) {
        for (const ngay of tkb.ngayTrongTuan) {
          for (const tiet of ngay.tiets) {
            if (tiet.giaoVien && tiet.giaoVien._id.toString() === gv._id.toString()) {
              items.push({
                lop: tkb.lop?.tenLop || '?',
                thu: ngay.thu,
                buoi: ngay.buoi,
                tiet: tiet.tiet,
                mon: tiet.chuyenMon
              });
            }
          }
        }
      }
      console.log(`\n=== TKB hiện tại của GV ${gv.hoTen}: ${items.length} tiết ===`);
      for (const it of items) {
        console.log(`  ${it.lop} | T${it.thu} ${it.buoi} tiết ${it.tiet} | ${it.mon}`);
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
})();
