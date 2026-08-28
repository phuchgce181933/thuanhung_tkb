// Debug: so sánh data trong service vs query cuối
require('dotenv').config();
const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');
const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');

// Intercept autoGenerate để log
let greedyKimCount = 0;
let optimizationChanges = [];

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Xóa TKB cũ
    await ThoiKhoaBieu.deleteMany({ namHoc: '2024-2025' });
    
    // Load data
    const khois = await Khoi.find().sort({ thuTu: 1 });
    const lops = await Lop.find().populate('khoi');
    const giaoViens = await GiaoVien.find({ trangThai: 'active' });
    const kim = await GiaoVien.findOne({ hoTen: { $regex: '^kim$', $options: 'i' } });
    
    console.log('=== GV LIST ===');
    for (const gv of giaoViens) {
      console.log(`  ${gv._id}: ${gv.hoTen} [${JSON.stringify(gv.nguyenVong)}]`);
    }
    
    console.log(`\nKim found: ${kim ? `${kim._id} - ${kim.hoTen}` : 'NOT FOUND'}`);
    
    // Check xem có GV nào trùng tên không
    const kimAll = await GiaoVien.find({ hoTen: { $regex: '^kim$', $options: 'i' } });
    console.log(`Kim count (regex): ${kimAll.length}`);
    for (const k of kimAll) {
      console.log(`  ${k._id}: ${k.hoTen}`);
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

main();
