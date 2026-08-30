const mongoose = require('mongoose');

const missingClassSchema = new mongoose.Schema({
  lop: {
    type: String,
    default: ''
  },
  lopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lop',
    default: null
  },
  mon: {
    type: String,
    default: ''
  },
  soTietConThieu: {
    type: Number,
    default: 0
  },
  phanHieu: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  level: {
    type: String,
    enum: ['warning', 'error'],
    default: 'warning'
  }
}, { _id: false });

const warningLogSchema = new mongoose.Schema({
  namHoc: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    default: 'Cảnh báo'
  },
  message: {
    type: String,
    default: ''
  },
  warnings: {
    type: [String],
    default: []
  },
  missingClasses: {
    type: [missingClassSchema],
    default: []
  },
  summary: {
    totalMissingClasses: {
      type: Number,
      default: 0
    },
    totalMissingPeriods: {
      type: Number,
      default: 0
    }
  },
  type: {
    type: String,
    enum: ['warning', 'error'],
    default: 'warning'
  }
}, {
  timestamps: true
});

warningLogSchema.index({ namHoc: 1, createdAt: -1 });
warningLogSchema.index({ 'missingClasses.lop': 1, 'missingClasses.mon': 1 });

module.exports = mongoose.model('WarningLog', warningLogSchema);
