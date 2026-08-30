const mongoose = require('mongoose');

const chuyenMonSchema = new mongoose.Schema({
  tenChuyenMon: {
    type: String,
    required: true
  },
  soTietTuan: {
    type: Number,
    required: true,
    min: 1
  }
}, { _id: false });

const giaoVienSchema = new mongoose.Schema({
  hoTen: {
    type: String,
    required: [true, 'Họ tên không được để trống'],
    trim: true
  },
  phanHieu: {
    type: String,
    default: '',
    trim: true
  },
  phanHieuDieuChuyen: {
    type: String,
    default: '',
    trim: true
  },
  chuyenMon: {
    type: [chuyenMonSchema],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Phải có ít nhất một chuyên môn'
    }
  },
  trangThai: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  nguyenVong: {
    soBuoiToiDa: {
      type: Number,
      default: null,
      min: [1, 'Số buổi tối đa phải từ 1 trở lên'],
      max: [10, 'Số buổi tối đa không quá 10']
    },
    buoiUuTien: {
      type: String,
      enum: ['sang', 'chieu', 'ca_hai'],
      default: 'ca_hai'
    },
    thuNghi: [{
      type: Number,
      min: 2,
      max: 6
    }]
  },
  phanCong: {
    phanCongKiemNhiem: {
      type: String,
      default: ''
    },
    soTietKiemNhiem: {
      type: Number,
      default: 0,
      min: 0
    },
    soTietDinhMuc: {
      type: Number,
      default: 0,
      min: 0
    },
    soTietDuocPhanCong: {
      type: Number,
      default: 0,
      min: 0
    },
    soTietDieuChuyen: {
      type: Number,
      default: 0,
      min: 0
    },
    tongSoTietDuThieu: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Index for searching
giaoVienSchema.index({ hoTen: 'text' });

module.exports = mongoose.model('GiaoVien', giaoVienSchema);
