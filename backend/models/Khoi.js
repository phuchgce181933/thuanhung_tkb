const mongoose = require('mongoose');

const khoiSchema = new mongoose.Schema({
  tenKhoi: {
    type: String,
    required: [true, 'Tên khối không được để trống'],
    unique: true,
    trim: true
  },
  moTa: {
    type: String,
    default: ''
  },
  thuTu: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Khoi', khoiSchema);
