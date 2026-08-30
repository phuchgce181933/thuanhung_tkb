const GiaoVien = require('../models/GiaoVien');

const giaoVienController = {
  // Lấy tất cả giáo viên
  getAll: async (req, res) => {
    try {
      const { search, chuyenMon, trangThai } = req.query;
      let query = {};
      
      if (trangThai) {
        query.trangThai = trangThai;
      }
      
      if (chuyenMon) {
        query['chuyenMon.tenChuyenMon'] = chuyenMon;
      }
      
      let giaoViens = await GiaoVien.find(query).sort({ hoTen: 1 });
      
      // Search by name
      if (search) {
        giaoViens = giaoViens.filter(gv => 
          gv.hoTen.toLowerCase().includes(search.toLowerCase())
        );
      }
      
      res.json({
        success: true,
        data: giaoViens,
        count: giaoViens.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Lấy 1 giáo viên
  getById: async (req, res) => {
    try {
      const gv = await GiaoVien.findById(req.params.id);
      if (!gv) {
        return res.status(404).json({
          success: false,
          message: 'Giáo viên không tồn tại'
        });
      }
      res.json({
        success: true,
        data: gv
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Tạo mới giáo viên
  create: async (req, res) => {
    try {
      const { hoTen, phanHieu, phanHieuDieuChuyen, chuyenMon, trangThai, nguyenVong, phanCong } = req.body;

      // Kiểm tra tên trùng
      const existing = await GiaoVien.findOne({ hoTen });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Tên giáo viên đã tồn tại'
        });
      }

      const gv = new GiaoVien({
        hoTen,
        phanHieu,
        phanHieuDieuChuyen: phanHieuDieuChuyen || '',
        chuyenMon,
        trangThai: trangThai || 'active',
        nguyenVong: nguyenVong || undefined,
        phanCong: phanCong || undefined
      });
      
      await gv.save();
      res.status(201).json({
        success: true,
        data: gv,
        message: 'Thêm giáo viên thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Cập nhật giáo viên
  update: async (req, res) => {
    try {
      const { hoTen, phanHieu, phanHieuDieuChuyen, chuyenMon, trangThai, nguyenVong, phanCong } = req.body;

      const gv = await GiaoVien.findByIdAndUpdate(
        req.params.id,
        { hoTen, phanHieu, phanHieuDieuChuyen: phanHieuDieuChuyen || '', chuyenMon, trangThai, nguyenVong, phanCong },
        { new: true, runValidators: true }
      );
      
      if (!gv) {
        return res.status(404).json({
          success: false,
          message: 'Giáo viên không tồn tại'
        });
      }
      
      res.json({
        success: true,
        data: gv,
        message: 'Cập nhật giáo viên thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Xóa giáo viên
  delete: async (req, res) => {
    try {
      const gv = await GiaoVien.findByIdAndDelete(req.params.id);
      if (!gv) {
        return res.status(404).json({
          success: false,
          message: 'Giáo viên không tồn tại'
        });
      }
      res.json({
        success: true,
        message: 'Xóa giáo viên thành công'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Lấy danh sách chuyên môn duy nhất
  getChuyenMonList: async (req, res) => {
    try {
      const giaoViens = await GiaoVien.find({});
      const chuyenMonSet = new Set();
      
      giaoViens.forEach(gv => {
        gv.chuyenMon.forEach(cm => {
          chuyenMonSet.add(cm.tenChuyenMon);
        });
      });
      
      res.json({
        success: true,
        data: Array.from(chuyenMonSet).sort()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

module.exports = giaoVienController;
