const Khoi = require('../models/Khoi');
const Lop = require('../models/Lop');

const khoiController = {
  // Lấy tất cả khối
  getAll: async (req, res) => {
    try {
      const khois = await Khoi.find().sort({ thuTu: 1, tenKhoi: 1 });
      res.json({
        success: true,
        data: khois,
        count: khois.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Lấy 1 khối theo ID
  getById: async (req, res) => {
    try {
      const khoi = await Khoi.findById(req.params.id);
      if (!khoi) {
        return res.status(404).json({
          success: false,
          message: 'Khối không tồn tại'
        });
      }
      res.json({
        success: true,
        data: khoi
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Tạo mới khối
  create: async (req, res) => {
    try {
      const { tenKhoi, thuTu } = req.body;
      const khoi = new Khoi({ tenKhoi, thuTu });
      await khoi.save();
      res.status(201).json({
        success: true,
        data: khoi,
        message: 'Tạo khối thành công'
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Tên khối đã tồn tại'
        });
      }
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Cập nhật khối
  update: async (req, res) => {
    try {
      const { tenKhoi, thuTu } = req.body;
      const khoi = await Khoi.findByIdAndUpdate(
        req.params.id,
        { tenKhoi, thuTu },
        { new: true, runValidators: true }
      );
      if (!khoi) {
        return res.status(404).json({
          success: false,
          message: 'Khối không tồn tại'
        });
      }
      res.json({
        success: true,
        data: khoi,
        message: 'Cập nhật khối thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Xóa khối
  delete: async (req, res) => {
    try {
      const khoi = await Khoi.findById(req.params.id);
      if (!khoi) {
        return res.status(404).json({
          success: false,
          message: 'Khối không tồn tại'
        });
      }

      // Kiểm tra xem có lớp nào thuộc khối này không
      const soLop = await Lop.countDocuments({ khoi: req.params.id });
      if (soLop > 0) {
        return res.status(400).json({
          success: false,
          message: `Không thể xóa khối này vì còn ${soLop} lớp thuộc khối`
        });
      }

      await Khoi.findByIdAndDelete(req.params.id);
      res.json({
        success: true,
        message: 'Xóa khối thành công'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

module.exports = khoiController;
