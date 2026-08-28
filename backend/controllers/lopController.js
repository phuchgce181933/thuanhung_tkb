const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');

const lopController = {
  // Lấy tất cả lớp (có thể lọc theo khối)
  getAll: async (req, res) => {
    try {
      const { khoiId } = req.query;
      let query = {};
      
      if (khoiId) {
        query.khoi = khoiId;
      }

      const lops = await Lop.find(query)
        .populate('khoi', 'tenKhoi')
        .sort({ 'khoi.thuTu': 1, tenLop: 1 });
      
      res.json({
        success: true,
        data: lops,
        count: lops.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Lấy 1 lớp theo ID
  getById: async (req, res) => {
    try {
      const lop = await Lop.findById(req.params.id).populate('khoi', 'tenKhoi');
      if (!lop) {
        return res.status(404).json({
          success: false,
          message: 'Lớp không tồn tại'
        });
      }
      res.json({
        success: true,
        data: lop
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Tạo mới lớp
  create: async (req, res) => {
    try {
      const { tenLop, khoi, giaoVienChuNhiem } = req.body;

      // Kiểm tra khối có tồn tại không
      const khoiExists = await Khoi.findById(khoi);
      if (!khoiExists) {
        return res.status(400).json({
          success: false,
          message: 'Khối không tồn tại'
        });
      }

      const lop = new Lop({ tenLop, khoi, giaoVienChuNhiem });
      await lop.save();
      
      const lopPopulated = await Lop.findById(lop._id).populate('khoi', 'tenKhoi');
      
      res.status(201).json({
        success: true,
        data: lopPopulated,
        message: 'Tạo lớp thành công'
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Tên lớp đã tồn tại trong khối này'
        });
      }
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Cập nhật lớp
  update: async (req, res) => {
    try {
      const { tenLop, khoi, giaoVienChuNhiem } = req.body;

      // Kiểm tra khối có tồn tại không
      if (khoi) {
        const khoiExists = await Khoi.findById(khoi);
        if (!khoiExists) {
          return res.status(400).json({
            success: false,
            message: 'Khối không tồn tại'
          });
        }
      }

      const lop = await Lop.findByIdAndUpdate(
        req.params.id,
        { tenLop, khoi, giaoVienChuNhiem },
        { new: true, runValidators: true }
      ).populate('khoi', 'tenKhoi');

      if (!lop) {
        return res.status(404).json({
          success: false,
          message: 'Lớp không tồn tại'
        });
      }
      res.json({
        success: true,
        data: lop,
        message: 'Cập nhật lớp thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Xóa lớp
  delete: async (req, res) => {
    try {
      const lop = await Lop.findByIdAndDelete(req.params.id);
      if (!lop) {
        return res.status(404).json({
          success: false,
          message: 'Lớp không tồn tại'
        });
      }
      res.json({
        success: true,
        message: 'Xóa lớp thành công'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Lấy lớp theo khối (dùng cho dropdown)
  getByKhoi: async (req, res) => {
    try {
      const lops = await Lop.find({ khoi: req.params.khoiId })
        .sort({ tenLop: 1 });
      res.json({
        success: true,
        data: lops,
        count: lops.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Cập nhật danh sách môn học của lớp
  updateChuyenMons: async (req, res) => {
    try {
      const { chuyenMons } = req.body;
      
      if (!Array.isArray(chuyenMons)) {
        return res.status(400).json({
          success: false,
          message: 'chuyenMons phải là mảng'
        });
      }

      const lop = await Lop.findByIdAndUpdate(
        req.params.id,
        { chuyenMons },
        { new: true, runValidators: true }
      ).populate('khoi', 'tenKhoi');

      if (!lop) {
        return res.status(404).json({
          success: false,
          message: 'Lớp không tồn tại'
        });
      }
      res.json({
        success: true,
        data: lop,
        message: 'Cập nhật môn học thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Gán môn học cho tất cả lớp trong một khối
  setChuyenMonsByKhoi: async (req, res) => {
    try {
      const { khoiId, chuyenMons } = req.body;
      
      if (!khoiId) {
        return res.status(400).json({
          success: false,
          message: 'Cần cung cấp khoiId'
        });
      }
      
      if (!Array.isArray(chuyenMons)) {
        return res.status(400).json({
          success: false,
          message: 'chuyenMons phải là mảng'
        });
      }

      const result = await Lop.updateMany(
        { khoi: khoiId },
        { chuyenMons }
      );

      res.json({
        success: true,
        message: `Đã cập nhật ${result.modifiedCount} lớp`,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

module.exports = lopController;
