'use strict';

const { TKB_CONFIG, isValidTietForBuoi, createSlotKey } = require('./constants');

/**
 * Operations thao tác trực tiếp lên schedule data (in-place).
 * Tách ra khỏi optimizer chính để dễ test và tái sử dụng.
 */
class ScheduleOps {
  /**
   * @param {Array} data - lopSchedulesData
   */
  constructor(data) {
    this.data = data;
  }

  /**
   * Move 1 tiết sang slot mới (in-place).
   * @returns {boolean} true nếu thành công
   */
  moveSingleTiet(item, targetThu, targetBuoi, targetTiet, gv) {
    if (!isValidTietForBuoi(targetTiet, targetBuoi)) return false;

    const lopData = this.data.find(d => d.lop._id.toString() === item.lopId);
    if (!lopData) return false;

    // Check conflict: target slot không bị GV khác / GV này chiếm
    const oldKey = createSlotKey(item.thu, item.buoi, item.tiet);
    const targetKey = createSlotKey(targetThu, targetBuoi, targetTiet);
    if (oldKey === targetKey) return true; // no-op

    const targetNgay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
    if (targetNgay && targetNgay.tiets.some(t => t.tiet === targetTiet)) return false;

    // Xóa khỏi ngày cũ
    const oldNgay = lopData.lopSchedule.find(n => n.thu === item.thu && n.buoi === item.buoi);
    if (oldNgay) {
      oldNgay.tiets = oldNgay.tiets.filter(t => t.tiet !== item.tiet);
      if (oldNgay.tiets.length === 0) {
        lopData.lopSchedule = lopData.lopSchedule.filter(
          n => !(n.thu === item.thu && n.buoi === item.buoi)
        );
      }
    }

    // Thêm vào ngày mới
    let newNgay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
    if (!newNgay) {
      newNgay = { thu: targetThu, buoi: targetBuoi, tiets: [] };
      lopData.lopSchedule.push(newNgay);
    }
    newNgay.tiets.push({
      tiet: targetTiet,
      giaoVien: gv._id,
      chuyenMon: item.chuyenMon,
    });
    newNgay.tiets.sort((a, b) => a.tiet - b.tiet);
    return true;
  }

  /**
   * Move toàn bộ block (các tiết trong 1 session) sang session khác.
   */
  moveBlock(block, targetThu, targetBuoi, gv) {
    for (const item of block) {
      if (!isValidTietForBuoi(item.tiet, targetBuoi)) return false;
    }

    // Apply từng item
    for (const item of block) {
      const lopData = this.data.find(d => d.lop._id.toString() === item.lopId);
      if (!lopData) return false;

      // Xóa khỏi ngày cũ
      const oldNgay = lopData.lopSchedule.find(n => n.thu === item.thu && n.buoi === item.buoi);
      if (oldNgay) {
        oldNgay.tiets = oldNgay.tiets.filter(t => t.tiet !== item.tiet);
        if (oldNgay.tiets.length === 0) {
          lopData.lopSchedule = lopData.lopSchedule.filter(
            n => !(n.thu === item.thu && n.buoi === item.buoi)
          );
        }
      }
    }

    // Thêm vào session đích
    for (const item of block) {
      const lopData = this.data.find(d => d.lop._id.toString() === item.lopId);
      let newNgay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
      if (!newNgay) {
        newNgay = { thu: targetThu, buoi: targetBuoi, tiets: [] };
        lopData.lopSchedule.push(newNgay);
      }
      if (!newNgay.tiets.some(t => t.tiet === item.tiet)) {
        newNgay.tiets.push({
          tiet: item.tiet,
          giaoVien: gv._id,
          chuyenMon: item.chuyenMon,
        });
        newNgay.tiets.sort((a, b) => a.tiet - b.tiet);
      }
    }
    return true;
  }

  /**
   * Swap 2 tiết giữa 2 GV (in-place, atomic).
   * @returns {boolean} true nếu thành công
   */
  swapTiet(itemA, targetA, itemB, targetB, gvA, gvB) {
    // itemA: {lopId, thu, buoi, tiet}, targetA: {thu, buoi, tiet}
    // Apply: move A sang targetB, move B sang targetA
    return (
      this.moveSingleTiet(itemA, targetB.thu, targetB.buoi, targetB.tiet, gvA) &&
      this.moveSingleTiet(itemB, targetA.thu, targetA.buoi, targetA.tiet, gvB)
    );
  }

  /**
   * Ghi nhận 1 ô trống cho lớp (cho chain swap / pre-computation).
   */
  getLopEmptySlots(lopId) {
    const lopData = this.data.find(d => d.lop._id.toString() === lopId);
    if (!lopData) return [];
    const empty = [];
    for (const thu of TKB_CONFIG.weekdays) {
      for (const [buoi, config] of Object.entries(TKB_CONFIG.sessions)) {
        for (let tiet = config.tietBatDau; tiet <= config.tietKetThuc; tiet++) {
          if (buoi === 'sang' && thu === 2 && tiet === 1) continue;
          const ngay = lopData.lopSchedule.find(n => n.thu === thu && n.buoi === buoi);
          if (ngay && ngay.tiets.some(t => t.tiet === tiet)) continue;
          empty.push({ thu, buoi, tiet, key: createSlotKey(thu, buoi, tiet) });
        }
      }
    }
    return empty;
  }

  /**
   * Lấy danh sách items (tiết học) của 1 GV trong 1 session cụ thể.
   * @returns {Array<{lopId, thu, buoi, tiet, chuyenMon}>}
   */
  getGVItemsInSession(gvId, thu, buoi, homeTeacherFilter = null) {
    const items = [];
    for (const data of this.data) {
      if (homeTeacherFilter && !homeTeacherFilter(data.lop)) continue;
      const ngay = data.lopSchedule.find(n => n.thu === thu && n.buoi === buoi);
      if (!ngay) continue;
      for (const tiet of ngay.tiets) {
        if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
          items.push({
            lopId: data.lop._id.toString(),
            thu,
            buoi,
            tiet: tiet.tiet,
            chuyenMon: tiet.chuyenMon,
          });
        }
      }
    }
    return items;
  }

  /**
   * Recalculate session set cho 1 GV từ data hiện tại.
   * @returns {Set<string>} session keys
   */
  getGVSessions(gvId, homeTeacherFilter = null) {
    const sessions = new Set();
    for (const data of this.data) {
      if (homeTeacherFilter && !homeTeacherFilter(data.lop)) continue;
      for (const ngay of data.lopSchedule || []) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            sessions.add(`${ngay.thu}-${ngay.buoi}`);
          }
        }
      }
    }
    return sessions;
  }
}

module.exports = { ScheduleOps };
