const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const tkbService = require('../services/tkbService');

const thoiKhoaBieuController = {
  // Lấy TKB theo lớp
  getByLop: async (req, res) => {
    try {
      const { lopId, namHoc } = req.query;
      
      if (!lopId || !namHoc) {
        return res.status(400).json({
          success: false,
          message: 'Cần cung cấp lopId và namHoc'
        });
      }
      
      const tkb = await tkbService.getTKBByLop(lopId, namHoc);
      
      if (!tkb) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thời khóa biểu'
        });
      }
      
      res.json({
        success: true,
        data: tkb
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Xuất Excel TKB
  exportExcel: async (req, res) => {
    try {
      const { namHoc } = req.query;
      
      if (!namHoc) {
        return res.status(400).json({
          success: false,
          message: 'Cần cung cấp năm học'
        });
      }
      
      const buffer = await tkbService.exportTKBToExcel(namHoc);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=TKB_${namHoc.replace('/', '-')}.xlsx`);
      res.send(buffer);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Lấy TKB theo giáo viên
  getByGiaoVien: async (req, res) => {
    try {
      const { giaoVienId, namHoc } = req.query;
      
      if (!giaoVienId || !namHoc) {
        return res.status(400).json({
          success: false,
          message: 'Cần cung cấp giaoVienId và namHoc'
        });
      }
      
      const schedule = await tkbService.getTKBByGiaoVien(giaoVienId, namHoc);
      
      res.json({
        success: true,
        data: schedule
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Lấy tất cả TKB
  getAll: async (req, res) => {
    try {
      const { namHoc, lopId } = req.query;
      let query = {};
      
      if (namHoc) query.namHoc = namHoc;
      if (lopId) query.lop = lopId;
      
      const tkbs = await ThoiKhoaBieu.find(query)
        .populate({
          path: 'lop',
          populate: { path: 'khoi' }
        })
        .sort({ 'lop.khoi.thuTu': 1, 'lop.tenLop': 1 });
      
      res.json({
        success: true,
        data: tkbs,
        count: tkbs.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Sắp xếp TKB tự động
  autoGenerate: async (req, res) => {
    try {
      const { namHoc } = req.body;
      
      if (!namHoc) {
        return res.status(400).json({
          success: false,
          message: 'Cần cung cấp năm học'
        });
      }
      
      const result = await tkbService.autoGenerateTKB(namHoc);
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Cập nhật một tiết trong TKB
  updateTiet: async (req, res) => {
    try {
      const { tkbId, thu, buoi, tietCu, tietMoi } = req.body;
      
      const tkb = await ThoiKhoaBieu.findById(tkbId);
      if (!tkb) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thời khóa biểu'
        });
      }
      
      // Tìm và cập nhật tiết
      const ngay = tkb.ngayTrongTuan.find(n => n.thu === thu && n.buoi === buoi);
      if (ngay) {
        const tietIndex = ngay.tiets.findIndex(t => t.tiet === tietCu);
        if (tietIndex !== -1) {
          ngay.tiets[tietIndex] = tietMoi;
        }
      }
      
      await tkb.save();
      
      res.json({
        success: true,
        data: tkb,
        message: 'Cập nhật tiết thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Lấy thống kê TKB
  getStats: async (req, res) => {
    try {
      const { namHoc } = req.query;
      const query = namHoc ? { namHoc } : {};
      
      const tkbs = await ThoiKhoaBieu.find(query)
        .populate({
          path: 'lop',
          populate: { path: 'khoi' }
        });
      
      // Thống kê theo khối
      const statsByKhoi = {};
      
      for (const tkb of tkbs) {
        const khoiName = tkb.lop.khoi.tenKhoi;
        if (!statsByKhoi[khoiName]) {
          statsByKhoi[khoiName] = {
            tenKhoi: khoiName,
            soLop: 0,
            soTiet: 0
          };
        }
        statsByKhoi[khoiName].soLop++;
        statsByKhoi[khoiName].soTiet += tkb.ngayTrongTuan.reduce(
          (sum, ngay) => sum + ngay.tiets.length, 0
        );
      }
      
      res.json({
        success: true,
        data: {
          tongLop: tkbs.length,
          tongTiet: tkbs.reduce(
            (sum, tkb) => sum + tkb.ngayTrongTuan.reduce((s, n) => s + n.tiets.length, 0), 
            0
          ),
          theoKhoi: Object.values(statsByKhoi)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

module.exports = thoiKhoaBieuController;
