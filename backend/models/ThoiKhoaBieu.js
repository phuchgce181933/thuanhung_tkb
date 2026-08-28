const mongoose = require('mongoose');

const tietSchema = new mongoose.Schema({
  tiet: {
    type: Number,
    required: true,
    min: 1,
    max: 7
  },
  giaoVien: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GiaoVien',
    required: true
  },
  chuyenMon: {
    type: String,
    required: true
  }
}, { _id: false });

const ngaySchema = new mongoose.Schema({
  thu: {
    type: Number,
    required: true,
    min: 2, // Thứ 2
    max: 6  // Thứ 6
  },
  buoi: {
    type: String,
    enum: ['sang', 'chieu'],
    required: true
  },
  tiets: [tietSchema]
}, { _id: false });

const thoiKhoaBieuSchema = new mongoose.Schema({
  lop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lop',
    required: true
  },
  namHoc: {
    type: String,
    required: true
  },
  tuanThu: {
    type: Number,
    default: 1
  },
  ngayTrongTuan: {
    type: [ngaySchema]
  },
  trangThai: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  }
}, {
  timestamps: true
});

// Mỗi lớp có 1 TKB cho mỗi năm học
thoiKhoaBieuSchema.index({ lop: 1, namHoc: 1 }, { unique: true });

module.exports = mongoose.model('ThoiKhoaBieu', thoiKhoaBieuSchema);
