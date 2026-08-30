const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const WarningLog = require('../models/WarningLog');
const AssignOverflowLog = require('../models/AssignOverflowLog');
const Lop = require('../models/Lop');
const tkbService = require('../services/tkbService');
const jobStore = require('../services/jobStore');

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
      const { namHoc, phanHieu } = req.body;

      if (!namHoc) {
        return res.status(400).json({
          success: false,
          message: 'Cần cung cấp năm học'
        });
      }

      // Tạo job và chạy background, trả về jobId ngay để client poll
      const job = jobStore.createJob();
      jobStore.updateJob(job.jobId, {
        percent: 1,
        stage: 'init',
        message: 'Đang khởi động...'
      });

      // Fire-and-forget: chạy async, lưu progress vào jobStore
      (async () => {
        const startTime = Date.now();
        const phanHieuLog = phanHieu ? ` phanHieu=${phanHieu}` : '';
        console.log(`[autoGenerate] job=${job.jobId} namHoc=${namHoc}${phanHieuLog} STARTED`);
        try {
          const serviceOptions = { phanHieu: phanHieu || null, clearOld: true };
          const result = await tkbService.autoGenerateTKB(namHoc, (percent, stage, message) => {
            jobStore.updateJob(job.jobId, { percent, stage, message });
            console.log(`[autoGenerate] job=${job.jobId} tick ${percent}% ${stage}: ${message}`);
          });
          console.log(`[autoGenerate] job=${job.jobId} COMPLETED in ${Date.now() - startTime}ms`);
          // Lưu WarningLog nếu có
          if (result && Array.isArray(result.warnings)) {
            const missingClasses = (result.warnings || [])
              .map((warning) => {
                const match = String(warning).match(/Lớp\s+(.+?):\s+Môn\s+"(.+?)"\s+vẫn còn thiếu\s+(\d+)\s+tiết/i);
                if (!match) return null;
                return {
                  lop: match[1]?.trim() || '',
                  mon: match[2]?.trim() || '',
                  soTietConThieu: Number(match[3]) || 0,
                  message: warning,
                  level: 'warning'
                };
              })
              .filter(Boolean);

            const summary = {
              totalMissingClasses: missingClasses.length,
              totalMissingPeriods: missingClasses.reduce((total, item) => total + (Number(item.soTietConThieu) || 0), 0)
            };

            try {
              await WarningLog.create({
                namHoc,
                title: result.title || 'Cảnh báo',
                message: result.message || '',
                warnings: result.warnings,
                missingClasses,
                summary,
                type: result.success ? 'warning' : 'error'
              });
            } catch (logErr) {
              console.warn('Không thể lưu WarningLog:', logErr.message);
            }
          }

          jobStore.updateJob(job.jobId, {
            percent: 100,
            stage: 'done',
            message: result?.message || 'Hoàn tất',
            status: 'done',
            result,
          });
        } catch (error) {
          console.error(`[autoGenerate] job=${job.jobId} ERROR after ${Date.now() - startTime}ms:`, error);
          jobStore.updateJob(job.jobId, {
            percent: 100,
            stage: 'error',
            message: error.message,
            status: 'error',
            error: error.message,
          });
        }
      })();

      // Trả về jobId ngay để client poll
      res.json({
        success: true,
        jobId: job.jobId,
        async: true,
        message: 'Đã bắt đầu sắp xếp, đang xử lý...',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  /**
   * Lấy progress của job autoGenerate.
   * GET /api/thoi-khoa-bieu/progress/:jobId
   */
  getProgress: async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = jobStore.getJob(jobId);
      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy job'
        });
      }
      res.json({
        success: true,
        data: {
          jobId: job.jobId,
          status: job.status,
          percent: job.percent,
          stage: job.stage,
          message: job.message,
          result: job.status === 'done' ? job.result : undefined,
          error: job.status === 'error' ? job.error : undefined,
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  getWarningLogs: async (req, res) => {
    try {
      const { namHoc } = req.query;
      const query = namHoc ? { namHoc } : {};
      const logs = await WarningLog.find(query).sort({ createdAt: -1 }).limit(20).lean();

      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  /**
   * Danh sách log assignOverflow (mới nhất trên đầu).
   * GET /api/thoi-khoa-bieu/assign-overflow-logs?namHoc=...
   * Mỗi item là summary (không bao gồm mảng chi tiết).
   */
  getAssignOverflowLogs: async (req, res) => {
    try {
      const { namHoc, limit = 50 } = req.query;
      const query = namHoc ? { namHoc } : {};
      const logs = await AssignOverflowLog.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(limit) || 50, 200))
        .select('-resolvedFromUnresolved -stillUnresolved -lichSuDieuChuyen -nhanhCheGV')
        .lean();

      res.json({ success: true, data: logs });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Chi tiết 1 log assignOverflow.
   * GET /api/thoi-khoa-bieu/assign-overflow-logs/:id
   */
  getAssignOverflowLogById: async (req, res) => {
    try {
      const log = await AssignOverflowLog.findById(req.params.id).lean();
      if (!log) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy log' });
      }
      res.json({ success: true, data: log });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
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

  // Di chuyển hoặc đổi chỗ tiết
  // ============================================================
  // HELPER: Validate tiết hợp lệ theo buổi
  // ============================================================
  _validateBuoiTiet(buoi, tiet) {
    if (buoi === 'sang' && (tiet < 1 || tiet > 4)) {
      return 'Tiết sáng phải từ 1-4';
    }
    if (buoi === 'chieu' && (tiet < 5 || tiet > 7)) {
      return 'Tiết chiều phải từ 5-7';
    }
    return null;
  },

  // ============================================================
  // HELPER: Strip _id và convert ObjectId thành string
  // ============================================================
  _stripTiet(t) {
    if (!t) return null;
    const copy = { ...t };
    delete copy._id;
    if (copy.giaoVien && typeof copy.giaoVien === 'object' && copy.giaoVien.toString) {
      copy.giaoVien = copy.giaoVien.toString();
    }
    return copy;
  },

  // ============================================================
  // HELPER: Load TKB bằng plain object + populate lop
  // ============================================================
  async _loadTkbLean(tkbId) {
    return ThoiKhoaBieu.findById(tkbId)
      .populate({ path: 'lop', populate: { path: 'khoi' } })
      .lean();
  },

  // ============================================================
  // HELPER: Save ngayTrongTuan xuống DB (chỉ thay đổi trường này)
  // ============================================================
  async _saveNgayTrongTuan(tkbId, ngayTrongTuan) {
    return ThoiKhoaBieu.updateOne(
      { _id: tkbId },
      { $set: { ngayTrongTuan } }
    );
  },

  // ============================================================
  // MOVE TIẾT: Di chuyển 1 tiết từ vị trí nguồn → vị trí đích (trống)
  // Body: { sourceTkbId, sourceThu, sourceBuoi, sourceTiet,
  //         targetTkbId, targetThu, targetBuoi, targetTiet,
  //         lockedGVs }
  // Yêu cầu: slot đích PHẢI TRỐNG
  // ============================================================
  moveTiet: async (req, res) => {
    try {
      const {
        sourceTkbId, sourceThu, sourceBuoi, sourceTiet,
        targetTkbId, targetThu, targetBuoi, targetTiet,
        lockedGVs = []
      } = req.body;

      console.log('[moveTiet] req:', JSON.stringify({ sourceTkbId, sourceThu, sourceBuoi, sourceTiet, targetTkbId, targetThu, targetBuoi, targetTiet }));

      // 1. Validate input
      if (!sourceTkbId || !sourceThu || !sourceBuoi || !sourceTiet ||
          !targetThu || !targetBuoi || !targetTiet) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
      }
      const buoiErr = thoiKhoaBieuController._validateBuoiTiet(targetBuoi, targetTiet);
      if (buoiErr) return res.status(400).json({ success: false, message: buoiErr });

      const effectiveTargetTkbId = targetTkbId && targetTkbId !== sourceTkbId
        ? targetTkbId
        : sourceTkbId;
      const isSameTkb = (effectiveTargetTkbId === sourceTkbId);

      // 2. Load cả 2 TKB
      const sourceTkb = await thoiKhoaBieuController._loadTkbLean(sourceTkbId);
      if (!sourceTkb) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy TKB nguồn' });
      }
      const targetTkb = isSameTkb
        ? sourceTkb
        : await thoiKhoaBieuController._loadTkbLean(effectiveTargetTkbId);
      if (!targetTkb) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy TKB đích' });
      }

      // 3. Tìm ngày & tiết nguồn
      const sourceNgay = sourceTkb.ngayTrongTuan.find(
        n => n.thu === sourceThu && n.buoi === sourceBuoi
      );
      if (!sourceNgay) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy ngày nguồn' });
      }
      const sourceTietObj = sourceNgay.tiets.find(t => t.tiet === sourceTiet);
      if (!sourceTietObj) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tiết nguồn' });
      }

      // 4. Tìm/ tạo ngày đích
      let targetNgay = targetTkb.ngayTrongTuan.find(
        n => n.thu === targetThu && n.buoi === targetBuoi
      );
      if (!targetNgay) {
        targetNgay = { thu: targetThu, buoi: targetBuoi, tiets: [] };
        targetTkb.ngayTrongTuan.push(targetNgay);
      }

      // 5. Kiểm tra slot đích PHẢI TRỐNG (đây là điều kiện của MOVE)
      const targetTietObj = targetNgay.tiets.find(t => t.tiet === targetTiet);
      if (targetTietObj && targetTietObj.chuyenMon) {
        return res.status(400).json({
          success: false,
          message: 'Slot đích đã có tiết. Vui lòng dùng chức năng "Đổi chỗ".'
        });
      }

      // 6. Check trùng GV ở các lớp khác
      if (sourceTietObj.giaoVien && !lockedGVs.includes(sourceTietObj.giaoVien.toString())) {
        const gvId = sourceTietObj.giaoVien.toString();
        const otherTkbs = await ThoiKhoaBieu.find({
          namHoc: sourceTkb.namHoc,
          _id: { $ne: sourceTkbId }
        }).lean();
        for (const tkb of otherTkbs) {
          const ngay = tkb.ngayTrongTuan.find(n => n.thu === targetThu && n.buoi === targetBuoi);
          if (ngay) {
            const tiet = ngay.tiets.find(t => t.tiet === targetTiet);
            if (tiet && tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
              return res.status(400).json({
                success: false,
                message: `Giáo viên đã có lịch dạy ở slot này (lớp khác)`
              });
            }
          }
        }
      }

      // 7. Thực hiện MOVE trên plain object
      sourceNgay.tiets = sourceNgay.tiets.filter(t => t.tiet !== sourceTiet);
      targetNgay.tiets.push({
        ...thoiKhoaBieuController._stripTiet(sourceTietObj),
        tiet: targetTiet
      });
      targetNgay.tiets.sort((a, b) => a.tiet - b.tiet);

      // Xóa ngày trống nguồn
      if (sourceNgay.tiets.length === 0) {
        sourceTkb.ngayTrongTuan = sourceTkb.ngayTrongTuan.filter(
          n => !(n.thu === sourceThu && n.buoi === sourceBuoi)
        );
      }

      // 8. Lưu vào DB
      await thoiKhoaBieuController._saveNgayTrongTuan(sourceTkbId, sourceTkb.ngayTrongTuan);
      if (!isSameTkb) {
        await thoiKhoaBieuController._saveNgayTrongTuan(effectiveTargetTkbId, targetTkb.ngayTrongTuan);
      }
      console.log('[moveTiet] Đã lưu vào DB');

      // 9. Verify
      const verifySource = await ThoiKhoaBieu.findById(sourceTkbId).lean();
      const verifyTarget = await ThoiKhoaBieu.findById(effectiveTargetTkbId).lean();
      console.log('  VERIFY source:', JSON.stringify(
        verifySource.ngayTrongTuan.find(n => n.thu === sourceThu && n.buoi === sourceBuoi)?.tiets || []
      ));
      console.log('  VERIFY target:', JSON.stringify(
        verifyTarget.ngayTrongTuan.find(n => n.thu === targetThu && n.buoi === targetBuoi)?.tiets || []
      ));

      return res.json({
        success: true,
        message: 'Di chuyển tiết thành công',
        data: { sourceTkb, targetTkb: isSameTkb ? sourceTkb : targetTkb }
      });
    } catch (error) {
      console.error('moveTiet error:', error);
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  // ============================================================
  // SWAP TIẾT: Hoán đổi 2 tiết giữa 2 vị trí (cùng lớp hoặc khác lớp)
  // Body: { sourceTkbId, sourceThu, sourceBuoi, sourceTiet,
  //         targetTkbId, targetThu, targetBuoi, targetTiet }
  // Yêu cầu: slot đích PHẢI CÓ TIẾT
  // Đơn giản: tiết A → vị trí B, tiết B → vị trí A
  // ============================================================
  swapTiet: async (req, res) => {
    try {
      const {
        sourceTkbId, sourceThu, sourceBuoi, sourceTiet,
        targetTkbId, targetThu, targetBuoi, targetTiet,
        lockedGVs = []
      } = req.body;

      console.log('[swapTiet] req:', JSON.stringify({ sourceTkbId, sourceThu, sourceBuoi, sourceTiet, targetTkbId, targetThu, targetBuoi, targetTiet }));

      // 1. Validate input
      if (!sourceTkbId || !sourceThu || !sourceBuoi || !sourceTiet ||
          !targetTkbId || !targetThu || !targetBuoi || !targetTiet) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
      }
      const buoiErr = thoiKhoaBieuController._validateBuoiTiet(targetBuoi, targetTiet);
      if (buoiErr) return res.status(400).json({ success: false, message: buoiErr });

      const isSameTkb = (targetTkbId === sourceTkbId);

      // 2. Load cả 2 TKB
      const sourceTkb = await thoiKhoaBieuController._loadTkbLean(sourceTkbId);
      if (!sourceTkb) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy TKB nguồn' });
      }
      const targetTkb = isSameTkb
        ? sourceTkb
        : await thoiKhoaBieuController._loadTkbLean(targetTkbId);
      if (!targetTkb) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy TKB đích' });
      }

      // 3. Tìm tiết nguồn
      const sourceNgay = sourceTkb.ngayTrongTuan.find(
        n => n.thu === sourceThu && n.buoi === sourceBuoi
      );
      if (!sourceNgay) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy ngày nguồn' });
      }
      const sourceTietObj = sourceNgay.tiets.find(t => t.tiet === sourceTiet);
      if (!sourceTietObj) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tiết nguồn' });
      }

      // 4. Tìm tiết đích
      const targetNgay = targetTkb.ngayTrongTuan.find(
        n => n.thu === targetThu && n.buoi === targetBuoi
      );
      if (!targetNgay) {
        return res.status(404).json({
          success: false,
          message: 'Slot đích chưa có ngày này. Không thể swap với slot trống - hãy dùng "Di chuyển".'
        });
      }
      const targetTietObj = targetNgay.tiets.find(t => t.tiet === targetTiet);
      if (!targetTietObj || !targetTietObj.chuyenMon) {
        return res.status(400).json({
          success: false,
          message: 'Slot đích trống. Không thể swap - hãy dùng "Di chuyển".'
        });
      }

      console.log('[swapTiet] source GV:', sourceTietObj.giaoVien?.toString?.() || sourceTietObj.giaoVien);
      console.log('[swapTiet] target GV:', targetTietObj.giaoVien?.toString?.() || targetTietObj.giaoVien);

      // 5. Thực hiện SWAP
      // Mỗi tiết giữ nguyên TKB của nó, chỉ đổi vị trí tiết trong ngày:
      //   - sourceTietCopy → TKB source, tại vị trí targetTiet
      //   - targetTietCopy → TKB target, tại vị trí sourceTiet

      // Tiết nguồn (source) đi sang vị trí target trong cùng TKB nguồn
      // → lấy gv+chuyenMon từ source, đặt tại targetTiet
      const strippedSource = thoiKhoaBieuController._stripTiet(sourceTietObj);
      const sourceTietCopy = {
        giaoVien: strippedSource.giaoVien,
        chuyenMon: strippedSource.chuyenMon,
        tiet: targetTiet
      };
      // Tiết đích (target) đi sang vị trí source trong cùng TKB đích
      // → lấy gv+chuyenMon từ target, đặt tại sourceTiet
      const strippedTarget = thoiKhoaBieuController._stripTiet(targetTietObj);
      const targetTietCopy = {
        giaoVien: strippedTarget.giaoVien,
        chuyenMon: strippedTarget.chuyenMon,
        tiet: sourceTiet
      };

      // Xóa tiết cũ ở cả 2 vị trí
      sourceNgay.tiets = sourceNgay.tiets.filter(t => t.tiet !== sourceTiet && t.tiet !== targetTiet);
      targetNgay.tiets = targetNgay.tiets.filter(t => t.tiet !== targetTiet && t.tiet !== sourceTiet);

      // Push tiết mới vào vị trí đối diện
      // sourceTietCopy (source's content) đi vào vị trí targetTiet trong source TKB
      // targetTietCopy (target's content) đi vào vị trí sourceTiet trong target TKB
      sourceNgay.tiets.push(sourceTietCopy);
      targetNgay.tiets.push(targetTietCopy);

      // Sort theo tiet
      targetNgay.tiets.sort((a, b) => a.tiet - b.tiet);
      sourceNgay.tiets.sort((a, b) => a.tiet - b.tiet);

      // Xóa ngày trống nếu cần
      if (sourceNgay.tiets.length === 0) {
        sourceTkb.ngayTrongTuan = sourceTkb.ngayTrongTuan.filter(
          n => !(n.thu === sourceThu && n.buoi === sourceBuoi)
        );
      }
      if (!isSameTkb && targetNgay.tiets.length === 0) {
        targetTkb.ngayTrongTuan = targetTkb.ngayTrongTuan.filter(
          n => !(n.thu === targetThu && n.buoi === targetBuoi)
        );
      }

      // 6. Lưu vào DB
      if (isSameTkb) {
        await thoiKhoaBieuController._saveNgayTrongTuan(sourceTkbId, sourceTkb.ngayTrongTuan);
      } else {
        await thoiKhoaBieuController._saveNgayTrongTuan(sourceTkbId, sourceTkb.ngayTrongTuan);
        await thoiKhoaBieuController._saveNgayTrongTuan(targetTkbId, targetTkb.ngayTrongTuan);
      }
      console.log('[swapTiet] Đã lưu vào DB');

      // 7. Verify
      const verifySource = await ThoiKhoaBieu.findById(sourceTkbId).lean();
      const verifyTarget = await ThoiKhoaBieu.findById(targetTkbId).lean();
      console.log('  VERIFY source:', JSON.stringify(
        verifySource.ngayTrongTuan.find(n => n.thu === sourceThu && n.buoi === sourceBuoi)?.tiets || []
      ));
      console.log('  VERIFY target:', JSON.stringify(
        verifyTarget.ngayTrongTuan.find(n => n.thu === targetThu && n.buoi === targetBuoi)?.tiets || []
      ));

      return res.json({
        success: true,
        message: 'Đổi chỗ tiết thành công',
        data: { sourceTkb, targetTkb: isSameTkb ? sourceTkb : targetTkb }
      });
    } catch (error) {
      console.error('swapTiet error:', error);
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  // Re-arrange: xếp lại các lớp có tiết bị xóa (do khóa GV)
  // Giữ nguyên lịch của các GV bị khóa, chỉ xếp lại phần còn lại
  rearrangeAfterLock: async (req, res) => {
    try {
      const { namHoc, lockedGVs = [] } = req.body;

      if (!namHoc) {
        return res.status(400).json({
          success: false,
          message: 'Cần cung cấp namHoc'
        });
      }

      // Lấy tất cả TKB
      const allTkbs = await ThoiKhoaBieu.find({ namHoc }).populate({
        path: 'lop',
        populate: { path: 'khoi' }
      });

      // Gom tất cả tiết đã xếp của GV bị khóa
      const lockedSlots = new Map(); // gvId -> [{thu, buoi, tiet}]
      for (const tkb of allTkbs) {
        for (const ngay of tkb.ngayTrongTuan) {
          for (const tiet of ngay.tiets) {
            if (tiet.giaoVien && lockedGVs.includes(tiet.giaoVien.toString())) {
              const gvId = tiet.giaoVien.toString();
              if (!lockedSlots.has(gvId)) lockedSlots.set(gvId, []);
              lockedSlots.get(gvId).push({
                thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet,
                lopId: tkb.lop._id.toString()
              });
            }
          }
        }
      }

      // Đếm các lớp bị thiếu tiết
      const missingClasses = [];
      for (const tkb of allTkbs) {
        const lopId = tkb.lop._id.toString();
        // Tổng tiết hiện tại
        const currentPeriods = tkb.ngayTrongTuan.reduce(
          (sum, n) => sum + n.tiets.length, 0
        );
        // Tổng tiết cần theo cấu hình khối
        const khoi = tkb.lop.khoi;
        const totalTietKhoi = khoi.cauHinhTKB?.reduce(
          (sum, c) => sum + c.soTiet, 0
        ) || 0;

        if (currentPeriods < totalTietKhoi) {
          missingClasses.push({
            tkb,
            lopId,
            current: currentPeriods,
            required: totalTietKhoi,
            missing: totalTietKhoi - currentPeriods
          });
        }
      }

      // Gọi service để fill in các tiết thiếu
      const result = await tkbService.fillMissingPeriods(
        namHoc,
        lockedGVs,
        lockedSlots
      );

      res.json({
        success: true,
        message: `Đã sắp xếp lại ${result.filled} tiết cho các lớp bị ảnh hưởng`,
        data: result
      });
    } catch (error) {
      console.error('rearrangeAfterLock error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Áp dụng nhiều thay đổi cùng lúc + tự động rearrange
  // Body: { namHoc, tkbData: { [tkbId]: { ngayTrongTuan: [...] } }, lockedGVs, autoRearrange }
  // - 'tkbData' chứa TKB MỚI (preview đầy đủ), thay thế hoàn toàn
  // - autoRearrange: nếu true, sau khi save sẽ tự động rearrange nếu phát hiện conflict
  applyBatch: async (req, res) => {
    try {
      const { namHoc, tkbData = {}, lockedGVs = [], autoRearrange = true } = req.body;
      if (!namHoc) {
        return res.status(400).json({ success: false, message: 'Cần namHoc' });
      }

      console.log(`[applyBatch] Received ${Object.keys(tkbData).length} TKBs`);
      // Log chi tiết tkbData đầu tiên để debug
      const firstTkbId = Object.keys(tkbData)[0];
      if (firstTkbId) {
        console.log(`[applyBatch] First TKB (${firstTkbId}):`, JSON.stringify(tkbData[firstTkbId]).slice(0, 1500));
      }

      // Lấy tất cả TKB của năm học
      const allTkbs = await ThoiKhoaBieu.find({ namHoc });
      console.log(`[applyBatch] Found ${allTkbs.length} TKBs in ${namHoc}`);
      console.log(`[applyBatch] Client sent data for ${Object.keys(tkbData).length} TKBs`);

      const tkbMap = new Map();
      for (const tkb of allTkbs) {
        tkbMap.set(tkb._id.toString(), tkb);
      }

      let appliedCount = 0;
      const errorTkbs = [];

      // Replace ngayTrongTuan của TỪNG TKB client gửi lên
      for (const [tkbId, newData] of Object.entries(tkbData)) {
        const tkb = tkbMap.get(tkbId);
        if (!tkb) {
          errorTkbs.push(tkbId);
          continue;
        }
        try {
          // Chuẩn hóa: chỉ giữ tiết có đầy đủ chuyenMon và giaoVien (id hợp lệ hoặc null đều OK)
          const newNgay = (newData.ngayTrongTuan || []).map(n => ({
            thu: n.thu,
            buoi: n.buoi,
            tiets: (n.tiets || [])
              .filter(t => t && t.chuyenMon && t.giaoVien != null && t.giaoVien !== '')
              .map(t => {
                const gvId = typeof t.giaoVien === 'object' ? t.giaoVien._id : t.giaoVien;
                return {
                  tiet: t.tiet,
                  chuyenMon: t.chuyenMon,
                  giaoVien: gvId
                };
              })
              .sort((a, b) => a.tiet - b.tiet)
          }));
          // Loại bỏ ngày không có tiết
          const newNgayFiltered = newNgay.filter(n => n.tiets && n.tiets.length > 0);
          tkb.ngayTrongTuan = newNgayFiltered;
          await tkb.save();
          appliedCount++;
        } catch (e) {
          console.error(`[applyBatch] Failed to save TKB ${tkbId}:`, e.message);
          if (e.errors) {
            console.error('[applyBatch] Validation details:', JSON.stringify(e.errors, null, 2));
            const errPaths = Object.keys(e.errors || {});
            for (const errPath of errPaths) {
              const m = errPath.match(/ngayTrongTuan\.(\d+)\.tiets\.(\d+)\.(\w+)/);
              if (m) {
                const ngayIdx = parseInt(m[1]);
                const tietIdx = parseInt(m[2]);
                const field = m[3];
                const badTiet = newData.ngayTrongTuan?.[ngayIdx]?.tiets?.[tietIdx];
                console.error(`[applyBatch] Bad tiet at ngay=${ngayIdx}, tiet=${tietIdx}, field=${field}:`, JSON.stringify(badTiet));
              }
            }
          }
          errorTkbs.push(tkbId);
        }
      }

      console.log(`[applyBatch] Applied ${appliedCount}, missing: ${errorTkbs.length}`);

      // Nếu có lỗi validate → trả về lỗi ngay, không rearrange
      if (errorTkbs.length > 0) {
        return res.json({
          success: false,
          message: `Có ${errorTkbs.length} lớp bị lỗi validate, đã rollback`,
          data: { appliedCount, missingTkbs: errorTkbs }
        });
      }

      // Tự động rearrange nếu có lockedGVs và autoRearrange=true
      let rearrangeResult = null;
      if (autoRearrange && lockedGVs.length > 0) {
        try {
          rearrangeResult = await tkbService.rearrangeAtomic(namHoc, { lockedGVs });
          console.log(`[applyBatch] Rearranged ${rearrangeResult.rearranged} tiết, conflicts=${rearrangeResult.conflicts.length}`);
        } catch (e) {
          console.error('[applyBatch] rearrangeAtomic error:', e.message);
        }
      }

      // Cuối cùng: fillMissingPeriods cho các lớp vẫn thiếu tiết
      if (lockedGVs.length > 0) {
        try {
          const updatedTkbs = await ThoiKhoaBieu.find({ namHoc });
          const lockedSlots = new Map();
          for (const tkb of updatedTkbs) {
            for (const ngay of tkb.ngayTrongTuan) {
              for (const t of ngay.tiets) {
                if (t.giaoVien && lockedGVs.includes(t.giaoVien.toString())) {
                  const gvId = t.giaoVien.toString();
                  if (!lockedSlots.has(gvId)) lockedSlots.set(gvId, []);
                  lockedSlots.get(gvId).push({
                    thu: ngay.thu, buoi: ngay.buoi, tiet: t.tiet,
                    lopId: tkb.lop.toString()
                  });
                }
              }
            }
          }
          const fillResult = await tkbService.fillMissingPeriods(
            namHoc, lockedGVs, lockedSlots
          );
          if (rearrangeResult) {
            rearrangeResult.warnings = (rearrangeResult.warnings || []).concat(
              fillResult.errors.map(e => `[fillMissing] ${e}`)
            );
            rearrangeResult.filled = fillResult.filled;
          }
        } catch (e) {
          console.error('[applyBatch] fillMissingPeriods error:', e.message);
        }
      }

      const totalRearranged = rearrangeResult?.rearranged || 0;
      const warnings = rearrangeResult?.warnings || [];
      const conflicts = rearrangeResult?.conflicts || [];

      res.json({
        success: true,
        message: rearrangeResult
          ? `Đã áp dụng ${appliedCount} lớp + tự động sắp xếp ${totalRearranged} tiết (${warnings.length} cảnh báo)`
          : `Đã áp dụng ${appliedCount} lớp thành công`,
        data: {
          appliedCount,
          missingTkbs: errorTkbs,
          rearrange: rearrangeResult,
          conflicts,
          warnings
        }
      });
    } catch (error) {
      console.error('applyBatch error:', error);
      res.status(500).json({ success: false, message: error.message });
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
  },

  /**
   * Sắp TKB cho 1 phân hiệu cụ thể (endpoint mới, tách từ autoGenerate).
   * Body: { namHoc, phanHieu }
   * Trả về jobId để client poll progress.
   */
  autoGenerateByPhanHieu: async (req, res) => {
    try {
      const { namHoc, phanHieu } = req.body;
      if (!namHoc) {
        return res.status(400).json({ success: false, message: 'Cần cung cấp năm học' });
      }
      if (!phanHieu) {
        return res.status(400).json({ success: false, message: 'Cần cung cấp phân hiệu' });
      }

      const job = jobStore.createJob();
      jobStore.updateJob(job.jobId, {
        percent: 1,
        stage: 'init',
        message: `Đang khởi động sắp TKB phân hiệu "${phanHieu}"...`,
      });

      (async () => {
        const startTime = Date.now();
        console.log(`[autoGenerateByPhanHieu] job=${job.jobId} namHoc=${namHoc} phanHieu=${phanHieu} STARTED`);
        try {
          const result = await tkbService.autoGenerateByPhanHieu(namHoc, phanHieu, (percent, stage, message) => {
            jobStore.updateJob(job.jobId, { percent, stage, message });
          });
          console.log(`[autoGenerateByPhanHieu] job=${job.jobId} COMPLETED in ${Date.now() - startTime}ms`);
          jobStore.updateJob(job.jobId, {
            percent: 100,
            stage: 'done',
            message: result?.message || 'Hoàn tất',
            status: 'done',
            result,
          });
        } catch (error) {
          console.error(`[autoGenerateByPhanHieu] job=${job.jobId} ERROR after ${Date.now() - startTime}ms:`, error);
          jobStore.updateJob(job.jobId, {
            percent: 100,
            stage: 'error',
            message: error.message,
            status: 'error',
            error: error.message,
          });
        }
      })();

      res.json({
        success: true,
        jobId: job.jobId,
        async: true,
        message: `Đã bắt đầu sắp xếp TKB cho phân hiệu "${phanHieu}"...`,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Sắp điều chuyển (chạy SAU khi đã sắp theo phân hiệu).
   * Body: { namHoc }
   * Trả về jobId để client poll progress.
   */
  assignOverflow: async (req, res) => {
    try {
      const { namHoc } = req.body;
      if (!namHoc) {
        return res.status(400).json({ success: false, message: 'Cần cung cấp năm học' });
      }

      const job = jobStore.createJob();
      jobStore.updateJob(job.jobId, {
        percent: 1,
        stage: 'init',
        message: 'Đang khởi động sắp điều chuyển...',
      });

      (async () => {
        const startTime = Date.now();
        console.log(`[assignOverflow] job=${job.jobId} namHoc=${namHoc} STARTED`);
        try {
          const result = await tkbService.assignOverflow(namHoc, (percent, stage, message) => {
            jobStore.updateJob(job.jobId, { percent, stage, message });
          });
          const duration = Date.now() - startTime;
          console.log(`[assignOverflow] job=${job.jobId} COMPLETED in ${duration}ms`);

          // Lưu log chi tiết để có thể xem lại sau (persist xuống DB)
          try {
            const resolvedArr = result?.resolvedFromUnresolved || [];
            const soAddCases = resolvedArr.filter(r => r.action === 'add').length;
            const soMoveCases = resolvedArr.filter(r => r.action === 'move').length;
            await AssignOverflowLog.create({
              namHoc,
              status: 'done',
              message: result?.message || '',
              partialSuccess: !!result?.partialSuccess,
              tongSoTietDieuChuyen: result?.tongSoTietDieuChuyen || 0,
              soGVDu: result?.soGVDu || 0,
              soStillUnresolved: result?.soStillUnresolved || 0,
              soResolvedFromUnresolved: resolvedArr.length,
              soAddCases,
              soMoveCases,
              duration,
              resolvedFromUnresolved: resolvedArr,
              stillUnresolved: result?.stillUnresolved || [],
              lichSuDieuChuyen: result?.lichSuDieuChuyen || [],
              nhanhCheGV: result?.nhanhCheGV || [],
            });
          } catch (logErr) {
            console.warn('[assignOverflow] Failed to save AssignOverflowLog:', logErr.message);
          }

          jobStore.updateJob(job.jobId, {
            percent: 100,
            stage: 'done',
            message: result?.message || 'Hoàn tất',
            status: 'done',
            result,
          });
        } catch (error) {
          const duration = Date.now() - startTime;
          console.error(`[assignOverflow] job=${job.jobId} ERROR after ${duration}ms:`, error);

          // Lưu log lỗi
          try {
            await AssignOverflowLog.create({
              namHoc,
              status: 'error',
              message: error.message,
              duration,
            });
          } catch (logErr) {
            console.warn('[assignOverflow] Failed to save error log:', logErr.message);
          }

          jobStore.updateJob(job.jobId, {
            percent: 100,
            stage: 'error',
            message: error.message,
            status: 'error',
            error: error.message,
          });
        }
      })();

      res.json({
        success: true,
        jobId: job.jobId,
        async: true,
        message: 'Đã bắt đầu sắp điều chuyển...',
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  // ====== 8. Unresolved Cases (lớp-môn không xếp được, lưu để điều chuyển sau) ======
  // Upsert: mỗi năm học chỉ có 1 doc lưu unresolved cases
  saveUnresolvedCases: async (req, res) => {
    try {
      const { namHoc, groups } = req.body; // groups: { phanHieu: [{ lop, mon, missing, needed, reason }] }
      if (!namHoc) return res.status(400).json({ success: false, message: 'Cần cung cấp namHoc' });
      if (!groups || typeof groups !== 'object') return res.status(400).json({ success: false, message: 'Cần cung cấp groups' });

      // Build missingClasses từ groups
      const missingClasses = [];
      for (const [phanHieu, cases] of Object.entries(groups)) {
        for (const c of cases) {
          missingClasses.push({
            lop: c.lop,
            mon: c.mon,
            soTietConThieu: c.missing,
            phanHieu,
            message: `thiếu ${c.missing}/${c.needed} tiết (${c.reason})`,
          });
        }
      }
      const totalCount = missingClasses.length;

      const doc = await WarningLog.findOneAndUpdate(
        { namHoc, type: 'unresolved' },
        {
          $set: {
            namHoc,
            type: 'unresolved',
            title: 'Lớp-môn chưa xếp được (chờ điều chuyển)',
            message: `Có ${totalCount} lớp-môn không xếp được tại các phân hiệu`,
            missingClasses,
            summary: { totalMissingClasses: totalCount, totalMissingPeriods: totalCount },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.json({ success: true, data: doc });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getUnresolvedCases: async (req, res) => {
    try {
      const { namHoc } = req.query;
      const query = { namHoc, type: 'unresolved' };
      const doc = await WarningLog.findOne(query).lean();
      res.json({ success: true, data: doc || null });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Xóa toàn bộ TKB của 1 năm học + clear warning log liên quan
  deleteAllTkbByNamHoc: async (req, res) => {
    try {
      const { namHoc } = req.body;
      if (!namHoc) return res.status(400).json({ success: false, message: 'Cần cung cấp namHoc' });
      const result = await ThoiKhoaBieu.deleteMany({ namHoc });
      await WarningLog.deleteOne({ namHoc, type: 'unresolved' });
      res.json({
        success: true,
        message: `Đã xóa ${result.deletedCount} TKB của năm học ${namHoc}.`,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error('[deleteAllTkbByNamHoc] ERROR:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Sắp TKB cho tất cả các phân hiệu (chạy tuần tự).
   * Trả về jobId để client poll progress.
   */
  autoGenerateAllPhanHieus: async (req, res) => {
    const { namHoc } = req.body;
    if (!namHoc) return res.status(400).json({ success: false, message: 'Cần cung cấp namHoc' });
    try {
      const lops = await Lop.find({}).lean();
      const phanHieus = [...new Set(lops.map(l => (l.phanHieu || '').trim()).filter(Boolean))];
      if (phanHieus.length === 0) {
        return res.status(400).json({ success: false, message: 'Không có phân hiệu nào trong DB.' });
      }
      const job = jobStore.createJob();
      const startTime = Date.now();
      (async () => {
        try {
          console.log(`[autoGenerateAllPhanHieus] job=${job.jobId} namHoc=${namHoc} phanHieus=${phanHieus.length} STARTED`);
          const summary = [];
          for (let i = 0; i < phanHieus.length; i++) {
            const ph = phanHieus[i];
            jobStore.updateJob(job.jobId, {
              percent: Math.floor((i / phanHieus.length) * 100),
              stage: 'phanhieu',
              message: `Đang sắp phân hiệu "${ph}" (${i + 1}/${phanHieus.length})`,
            });
            try {
              const result = await tkbService.autoGenerateByPhanHieu(namHoc, ph, () => {});
              summary.push({ phanHieu: ph, ok: true, soLop: (result.results || []).length });
            } catch (e) {
              console.error(`[autoGenerateAllPhanHieus] phanHieu=${ph} ERROR:`, e.message);
              summary.push({ phanHieu: ph, ok: false, error: e.message });
            }
          }
          jobStore.updateJob(job.jobId, {
            percent: 100,
            stage: 'done',
            status: 'done',
            message: `Hoàn tất ${phanHieus.length} phân hiệu`,
            result: { summary },
          });
          console.log(`[autoGenerateAllPhanHieus] job=${job.jobId} COMPLETED in ${Date.now() - startTime}ms`);
        } catch (error) {
          console.error(`[autoGenerateAllPhanHieus] job=${job.jobId} ERROR after ${Date.now() - startTime}ms:`, error);
          jobStore.updateJob(job.jobId, {
            status: 'error',
            error: error.message,
          });
        }
      })();
      res.json({ success: true, jobId: job.jobId, phanHieus });
    } catch (error) {
      console.error('[autoGenerateAllPhanHieus] setup ERROR:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  clearUnresolvedCases: async (req, res) => {
    try {
      const { namHoc } = req.body;
      if (!namHoc) return res.status(400).json({ success: false, message: 'Cần cung cấp namHoc' });
      await WarningLog.deleteOne({ namHoc, type: 'unresolved' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Re-detect các lớp-môn thiếu GV hiện tại và cập nhật unresolved cases
  recheckUnresolved: async (req, res) => {
    try {
      const { namHoc } = req.body;
      if (!namHoc) return res.status(400).json({ success: false, message: 'Cần cung cấp namHoc' });

      const tkbs = await ThoiKhoaBieu.find({ namHoc });
      const lops = await Lop.find();

      // Build map: lopId -> { phanHieu, missingByMon: { mon -> soTietThieu } }
      const lopInfo = new Map();
      for (const lop of lops) {
        lopInfo.set(lop._id.toString(), {
          phanHieu: (lop.phanHieu || '').trim(),
          chuyenMons: lop.chuyenMons || []
        });
      }

      // Đếm tiết đã xếp theo lop + mon
      const tkbByLop = new Map();
      for (const tkb of tkbs) {
        tkbByLop.set(tkb.lop.toString(), tkb);
      }

      // Chỉ check các lớp ĐÃ CÓ TKB - lớp chưa sắp không phải "missing" sau điều chuyển
      const missingClasses = [];
      for (const [lopId, info] of lopInfo.entries()) {
        const tkb = tkbByLop.get(lopId);
        if (!tkb) continue; // bỏ qua lớp chưa có TKB
        const monCount = new Map();
        for (const ngay of tkb.ngayTrongTuan || []) {
          for (const tiet of ngay.tiets || []) {
            if (!tiet.giaoVien) continue; // chỉ tính tiết CÓ GV
            monCount.set(tiet.chuyenMon, (monCount.get(tiet.chuyenMon) || 0) + 1);
          }
        }
        for (const cm of info.chuyenMons) {
          const ten = cm.tenChuyenMon || cm.mon || '';
          if (!ten) continue;
          const need = cm.soTietTuan || 0;
          const have = monCount.get(ten) || 0;
          if (have < need) {
            missingClasses.push({
              lop: lops.find(l => l._id.toString() === lopId)?.tenLop || lopId,
              mon: ten,
              soTietConThieu: need - have,
              phanHieu: info.phanHieu,
              message: `thiếu ${need - have}/${need} tiết (sau khi điều chuyển)`,
            });
          }
        }
      }

      if (missingClasses.length === 0) {
        // Không còn case nào thiếu → xóa WarningLog unresolved
        await WarningLog.deleteOne({ namHoc, type: 'unresolved' });
        return res.json({ success: true, totalCount: 0, message: 'Đã xử lý xong tất cả các lớp-môn thiếu' });
      }

      // Có case thiếu → upsert WarningLog
      const totalCount = missingClasses.length;
      const doc = await WarningLog.findOneAndUpdate(
        { namHoc, type: 'unresolved' },
        {
          $set: {
            namHoc,
            type: 'unresolved',
            title: 'Lớp-môn chưa xếp được (chờ điều chuyển)',
            message: `Có ${totalCount} lớp-môn không xếp được tại các phân hiệu`,
            missingClasses,
            summary: { totalMissingClasses: totalCount, totalMissingPeriods: totalCount },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.json({ success: true, data: doc, totalCount });
    } catch (error) {
      console.error('recheckUnresolved error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
};

module.exports = thoiKhoaBieuController;
