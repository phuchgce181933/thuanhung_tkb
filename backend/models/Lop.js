const mongoose = require('mongoose');

const lopSchema = new mongoose.Schema({
  tenLop: {
    type: String,
    required: [true, 'Tên lớp không được để trống'],
    trim: true
  },
  khoi: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Khoi',
    required: [true, 'Khối không được để trống']
  },
  giaoVienChuNhiem: {
    type: String,
    default: ''
  },
  // Danh sách môn học của lớp này (sẽ được xếp TKB)
  chuyenMons: [{
    tenChuyenMon: { type: String, required: true },
    soTietTuan: { type: Number, required: true, min: 1 }
  }]
}, {
  timestamps: true
});

lopSchema.index({ tenLop: 1, khoi: 1 }, { unique: true });

module.exports = mongoose.model('Lop', lopSchema);
