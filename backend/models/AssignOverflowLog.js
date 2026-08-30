const mongoose = require('mongoose');

/**
 * Lưu log chi tiết mỗi lần chạy assignOverflow (sắp điều chuyển).
 * Mục đích: cho phép xem lại lịch sử điều chuyển - case nào ADD/MOVE/bỏ qua,
 * GV nào bị nhận thêm tiết, v.v.
 */

const resolvedCaseSchema = new mongoose.Schema({
  lop: { type: String, default: '' },
  mon: { type: String, default: '' },
  gvTen: { type: String, default: '' },
  phanHieu: { type: String, default: '' },
  thu: { type: Number, default: 0 },
  buoi: { type: String, default: '' },
  tiet: { type: Number, default: 0 },
  action: { type: String, enum: ['add', 'move'], default: 'add' },
  tuLop: { type: String, default: '' },        // chỉ có khi action='move'
  tuPhanHieu: { type: String, default: '' },   // chỉ có khi action='move'
  tuMon: { type: String, default: '' },        // chỉ có khi action='move'
}, { _id: false });

const unresolvedCaseSchema = new mongoose.Schema({
  lop: { type: String, default: '' },
  lopId: { type: mongoose.Schema.Types.Mixed, default: null },
  mon: { type: String, default: '' },
  soTietConThieu: { type: Number, default: 0 },
  phanHieu: { type: String, default: '' },
  message: { type: String, default: '' },
}, { _id: false });

const lichSuDieuChuyenSchema = new mongoose.Schema({
  gvTen: { type: String, default: '' },
  tuPhanHieu: { type: String, default: '' },
  denPhanHieu: { type: String, default: '' },
  lopTen: { type: String, default: '' },
  mon: { type: String, default: '' },
  thu: { type: Number, default: 0 },
  buoi: { type: String, default: '' },
  tiet: { type: Number, default: 0 },
}, { _id: false });

const nhanhCheGVSchema = new mongoose.Schema({
  gv: { type: String, default: '' },
  phanHieu: { type: String, default: '' },
  soTietDaDay: { type: Number, default: 0 },
  soTietDinhMuc: { type: Number, default: 0 },
  soTietDu: { type: Number, default: 0 },
}, { _id: false });

const assignOverflowLogSchema = new mongoose.Schema({
  namHoc: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['done', 'error'],
    default: 'done',
  },
  message: { type: String, default: '' },
  partialSuccess: { type: Boolean, default: false },
  tongSoTietDieuChuyen: { type: Number, default: 0 },
  soGVDu: { type: Number, default: 0 },
  soStillUnresolved: { type: Number, default: 0 },
  soResolvedFromUnresolved: { type: Number, default: 0 },
  soAddCases: { type: Number, default: 0 },
  soMoveCases: { type: Number, default: 0 },
  duration: { type: Number, default: 0 }, // ms

  resolvedFromUnresolved: {
    type: [resolvedCaseSchema],
    default: [],
  },
  stillUnresolved: {
    type: [unresolvedCaseSchema],
    default: [],
  },
  lichSuDieuChuyen: {
    type: [lichSuDieuChuyenSchema],
    default: [],
  },
  nhanhCheGV: {
    type: [nhanhCheGVSchema],
    default: [],
  },
}, {
  timestamps: true,
});

assignOverflowLogSchema.index({ namHoc: 1, createdAt: -1 });

module.exports = mongoose.model('AssignOverflowLog', assignOverflowLogSchema);
