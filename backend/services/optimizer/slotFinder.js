'use strict';

const { TKB_CONFIG, createSessionKey } = require('./constants');

/**
 * Generator tất cả slot khả dĩ trong tuần (không bao gồm chào cờ).
 * @returns {Array<{thu: number, buoi: string, tiet: number, key: string, sessionKey: string}>}
 */
function generateAllSlots() {
  const slots = [];
  for (const thu of TKB_CONFIG.weekdays) {
    for (const [buoi, config] of Object.entries(TKB_CONFIG.sessions)) {
      for (let tiet = config.tietBatDau; tiet <= config.tietKetThuc; tiet++) {
        if (buoi === 'sang' && thu === 2 && tiet === 1) continue; // chào cờ
        slots.push({
          thu,
          buoi,
          tiet,
          key: `${thu}-${buoi}-${tiet}`,
          sessionKey: createSessionKey(thu, buoi),
        });
      }
    }
  }
  return slots;
}

/**
 * Class quản lý slot lookup và busy set.
 * Encapsulate logic tìm slot trống / swap / chain swap.
 */
class SlotFinder {
  /**
   * @param {Array} lopSchedulesData - TKB data
   * @param {Array} allSlots - pre-computed all slots (optional)
   */
  constructor(lopSchedulesData, allSlots = null) {
    this.data = lopSchedulesData;
    this.allSlots = allSlots || generateAllSlots();
  }

  /**
   * Rebuild all slots khi data thay đổi (thường không cần - allSlots là static).
   */
  invalidate() {
    this.allSlots = generateAllSlots();
  }

  /**
   * Tính busy set cho 1 GV từ lopSchedulesData.
   * @param {string} gvId
   * @returns {Set<string>} set of slot keys
   */
  busySetForGV(gvId) {
    const set = new Set();
    for (const data of this.data) {
      for (const ngay of data.lopSchedule || []) {
        for (const tiet of ngay.tiets || []) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            set.add(`${ngay.thu}-${ngay.buoi}-${tiet.tiet}`);
          }
        }
      }
    }
    return set;
  }

  /**
   * Tính busy set cho 1 lớp (GV nào dạy cũng tính).
   */
  busySetForLop(lopIdStr) {
    const set = new Set();
    const lopData = this.data.find(d => d.lop._id.toString() === lopIdStr);
    if (!lopData) return set;
    for (const ngay of lopData.lopSchedule || []) {
      for (const tiet of ngay.tiets || []) {
        set.add(`${ngay.thu}-${ngay.buoi}-${tiet.tiet}`);
      }
    }
    return set;
  }

  /**
   * Tìm slot trống trong 1 session cho 1 GV và 1 lớp.
   * Trả về Array<{thu, buoi, tiet, key}> có thể sử dụng.
   */
  findAvailableSlotsInSession(thu, buoi, gvId, lopId) {
    const config = TKB_CONFIG.sessions[buoi];
    if (!config) return [];
    const slots = [];
    const gvBusy = this.busySetForGV(gvId);
    const lopBusy = this.busySetForLop(lopId);

    for (let tiet = config.tietBatDau; tiet <= config.tietKetThuc; tiet++) {
      if (buoi === 'sang' && thu === 2 && tiet === 1) continue; // chào cờ
      const key = `${thu}-${buoi}-${tiet}`;
      if (gvBusy.has(key)) continue;
      if (lopBusy.has(key)) continue;
      slots.push({ thu, buoi, tiet, key });
    }
    return slots;
  }

  /**
   * Tìm slot trống trong TẤT CẢ sessions (dùng cho cross-buổi move).
   */
  findAllAvailableSlotsForGVAndLop(gvId, lopId, allowedBuois = null) {
    const slots = [];
    for (const thu of TKB_CONFIG.weekdays) {
      for (const buoi of Object.keys(TKB_CONFIG.sessions)) {
        if (allowedBuois && !allowedBuois.includes(buoi)) continue;
        slots.push(...this.findAvailableSlotsInSession(thu, buoi, gvId, lopId));
      }
    }
    return slots;
  }

  /**
   * Tìm slots có thể SWAP (đổi chỗ) với GV khác.
   * Logic: nếu slot đích đang có GV khác dạy lớp khác, có thể swap để giải phóng slot.
   *
   * @returns {Array<{thu, buoi, tiet, otherGV, otherLop}>
   */
  findSwappableSlots(gvId, excludeSession = null) {
    const swappable = [];
    for (const data of this.data) {
      for (const ngay of data.lopSchedule || []) {
        if (excludeSession && excludeSession.thu === ngay.thu && excludeSession.buoi === ngay.buoi) continue;
        for (const tiet of ngay.tiets || []) {
          if (!tiet.giaoVien) continue;
          const otherGV = tiet.giaoVien.toString();
          if (otherGV === gvId) continue;
          swappable.push({
            thu: ngay.thu,
            buoi: ngay.buoi,
            tiet: tiet.tiet,
            otherGV,
            otherLop: data.lop._id.toString(),
            otherChuyenMon: tiet.chuyenMon,
          });
        }
      }
    }
    return swappable;
  }
}

module.exports = { SlotFinder, generateAllSlots };
