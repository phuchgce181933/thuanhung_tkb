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
  phanHieu: {
    type: String,
    default: 'A',
    trim: true
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

// Phân hiệu là text tự nhập nên không nên nằm trong khóa duy nhất.
// Nếu giữ phanHieu trong unique index, khi sửa về A/B hoặc nhập trùng sẽ bị chặn.
lopSchema.index({ tenLop: 1, khoi: 1 }, { unique: true });

module.exports = mongoose.model('Lop', lopSchema);
