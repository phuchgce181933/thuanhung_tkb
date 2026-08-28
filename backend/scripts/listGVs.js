const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const all = await GiaoVien.find({});
  console.log('All GV count:', all.length);
  for (const gv of all) {
    console.log(gv._id.toString().slice(-6), '-', gv.hoTen);
  }
  await mongoose.disconnect();
})();