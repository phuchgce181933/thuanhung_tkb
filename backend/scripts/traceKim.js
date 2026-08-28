// Trace: so sánh giữa API response và DB raw
require('dotenv').config();
const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const kim = await GiaoVien.findOne({ hoTen: { $regex: '^kim$', $options: 'i' } });
    console.log('Kim ID:', kim?._id?.toString());

    // Lấy TKB thô từ DB (không populate)
    const tkbsRaw = await ThoiKhoaBieu.find({ namHoc: '2024-2025' });
    console.log(`\nSố TKB documents: ${tkbsRaw.length}`);

    // Đếm tổng entries với giaoVien = kim.id
    let dbCountRaw = 0;
    const dbItemsRaw = [];
    for (const tkb of tkbsRaw) {
      const lopId = tkb.lop;
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === kim._id.toString()) {
            dbCountRaw++;
            dbItemsRaw.push({ lopId: lopId.toString(), thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet, mon: tiet.chuyenMon });
          }
        }
      }
    }
    console.log(`DB RAW (no populate) - GV Kim count = ${dbCountRaw}`);
    for (const it of dbItemsRaw) {
      console.log(`  lop=${it.lopId.slice(-6)} | T${it.thu} ${it.buoi} tiết ${it.tiet} | ${it.mon}`);
    }

    // Lấy với populate
    const tkbsPop = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate('ngayTrongTuan.tiets.giaoVien');
    let dbCountPop = 0;
    for (const tkb of tkbsPop) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien._id.toString() === kim._id.toString()) {
            dbCountPop++;
          }
        }
      }
    }
    console.log(`\nDB WITH POPULATE - GV Kim count = ${dbCountPop}`);

    // Lấy với populate lop + khoi (giống API)
    const tkbsFull = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate({ path: 'lop', populate: { path: 'khoi' } })
      .populate('ngayTrongTuan.tiets.giaoVien');
    let apiCount = 0;
    const apiItems = [];
    for (const tkb of tkbsFull) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien._id.toString() === kim._id.toString()) {
            apiCount++;
            apiItems.push({ thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet, lop: tkb.lop?.tenLop, mon: tiet.chuyenMon });
          }
        }
      }
    }
    console.log(`API-LIKE (full populate) - GV Kim count = ${apiCount}`);

    // So sánh các items
    console.log(`\n=== SO SÁNH ===`);
    console.log(`DB RAW: ${dbCountRaw}`);
    console.log(`DB POP (no lop): ${dbCountPop}`);
    console.log(`API-LIKE (with lop): ${apiCount}`);

    if (dbCountRaw !== apiCount) {
      console.log(`\n!!! MẤT DỮ LIỆU khi populate lop. RAW=${dbCountRaw}, POP=${apiCount}`);
      // Tìm items nào có trong RAW nhưng không có trong POP
      // (cần match theo lopId + thu + buoi + tiet)
    }

    // Test populate đơn lẻ lop
    const tkbsOnlyLop = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate('lop');
    let onlyLopCount = 0;
    for (const tkb of tkbsOnlyLop) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === kim._id.toString()) {
            onlyLopCount++;
          }
        }
      }
    }
    console.log(`\nDB WITH ONLY LOP POPULATE - GV Kim count = ${onlyLopCount}`);

    // Test populate đơn lẻ giaoVien
    const tkbsOnlyGV = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate('ngayTrongTuan.tiets.giaoVien');
    let onlyGVCount = 0;
    for (const tkb of tkbsOnlyGV) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien._id.toString() === kim._id.toString()) {
            onlyGVCount++;
          }
        }
      }
    }
    console.log(`DB WITH ONLY GV POPULATE - GV Kim count = ${onlyGVCount}`);

    // Test cả 2 populate riêng
    const tkbsBoth = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate('lop')
      .populate('ngayTrongTuan.tiets.giaoVien');
    let bothCount = 0;
    for (const tkb of tkbsBoth) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien._id.toString() === kim._id.toString()) {
            bothCount++;
          }
        }
      }
    }
    console.log(`DB WITH BOTH (lop + gv) - GV Kim count = ${bothCount}`);

    // Test nested populate (lop.khoi)
    const tkbsNested = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate({ path: 'lop', populate: { path: 'khoi' } });
    let nestedCount = 0;
    for (const tkb of tkbsNested) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === kim._id.toString()) {
            nestedCount++;
          }
        }
      }
    }
    console.log(`DB WITH NESTED POPULATE (lop.khoi, no gv) - GV Kim count = ${nestedCount}`);

    // Tất cả 3 populate (giống API)
    const tkbsAll3 = await ThoiKhoaBieu.find({ namHoc: '2024-2025' })
      .populate({ path: 'lop', populate: { path: 'khoi' } })
      .populate('ngayTrongTuan.tiets.giaoVien');
    let all3Count = 0;
    for (const tkb of tkbsAll3) {
      for (const ngay of tkb.ngayTrongTuan) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien._id.toString() === kim._id.toString()) {
            all3Count++;
          }
        }
      }
    }
    console.log(`DB WITH ALL 3 POPULATES - GV Kim count = ${all3Count}`);

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
})();
