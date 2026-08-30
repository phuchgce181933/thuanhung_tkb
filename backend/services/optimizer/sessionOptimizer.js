'use strict';

const { TKB_CONFIG, createSessionKey, createSlotKey, isValidTietForBuoi } = require('./constants');
const { ScheduleOps } = require('./scheduleOps');
const { SlotFinder } = require('./slotFinder');

/**
 * SessionOptimizer - tối ưu số buổi của GV theo nguyện vọng.
 *
 * Luồng xử lý:
 * 1. Tính currentSessionSet cho mỗi GV
 * 2. Vòng while: nếu GV có nhiều buổi hơn soBuoiToiDa → gom session
 * 3. Excess handling: nếu không thể gom → cắt sang session mới
 * 4. Recalculate sau mỗi merge (sync source of truth)
 *
 * Sửa tất cả bugs so với phiên bản inline:
 * - Bug: dùng source thay vì target khi track session
 * - Bug: ưu tiên NHIỀU items thay vì ÍT items
 * - Bug: quota check chặn optimization (quota là soft)
 * - Bug: không recalculate sau merge → desync
 */
class SessionOptimizer {
  /**
   * @param {Array} lopSchedulesData
   * @param {Array} giaoViens
   * @param {Map} gvBusy - gvId -> Set<slotKey>
   * @param {Map} gvBuoiSet - gvId -> Set<sessionKey>
   * @param {Map} gvThuSet - gvId -> Set<thu>
   * @param {Array} allSlots
   * @param {Array} viPhamNVList
   * @param {Function} [onProgress] - optional progress callback
   */
  constructor(lopSchedulesData, giaoViens, gvBusy, gvBuoiSet, gvThuSet, allSlots, viPhamNVList, onProgress = null) {
    this.data = lopSchedulesData;
    this.giaoViens = giaoViens;
    this.gvBusy = gvBusy;
    this.gvBuoiSet = gvBuoiSet;
    this.gvThuSet = gvThuSet;
    this.allSlots = allSlots;
    this.viPhamNVList = viPhamNVList || [];
    this.onProgress = typeof onProgress === 'function' ? onProgress : null;
    this._progressCounter = 0;

    this.ops = new ScheduleOps(lopSchedulesData);
    this.slotFinder = new SlotFinder(lopSchedulesData, allSlots);

    this.stats = {
      soGVOptimized: 0,
      soLanMove: 0,
      thongKeBuoi: [],
      perGV: new Map(), // gvId -> {moves, gomSuccess, excessMoves}
    };
  }

  _tick(message) {
    if (this.onProgress) {
      this._progressCounter++;
      // Spread over 72..78 (6%) - mỗi GV tick 1 lần nhỏ
      const percent = Math.min(78, 72 + Math.min(5, this._progressCounter * 0.1));
      try { this.onProgress(percent, 'optimize', message); } catch (_) {}
    }
  }

  /**
   * Optimize tất cả GV. Trả về stats.
   */
  run() {
    const gvCoNV = this.giaoViens.filter(gv => gv.nguyenVong && gv.nguyenVong.soBuoiToiDa);
    console.log(`[SessionOptimizer] Total GV: ${this.giaoViens.length}, GV có NV: ${gvCoNV.length}`);

    for (const gv of this.giaoViens) {
      const gvId = gv._id.toString();
      const nv = gv.nguyenVong || {};
      if (!nv.soBuoiToiDa) continue;

      const periods = this._countPeriods(gvId);
      if (periods === 0) continue;

      console.log(`[SessionOptimizer] GV=${gv.hoTen || gvId} periods=${periods} desiredSessions=${nv.soBuoiToiDa}`);
      this._tick(`Tối ưu ${gv.hoTen || gvId} (${periods} tiết, NV ${nv.soBuoiToiDa} buổi)`);

      const desiredSessions = nv.soBuoiToiDa;
      let sessions = this._getCurrentSessions(gvId);
      const initialSize = sessions.size;

      const perGV = { moves: 0, gomSuccess: 0, excessMoves: 0 };

      // === GOM SESSION ===
      sessions = this._gopSessions(gv, gvId, sessions, desiredSessions, perGV);

      // === EXCESS HANDLING: cắt sang session mới ===
      sessions = this._xuLyExcess(gv, gvId, sessions, desiredSessions, perGV);

      // === CÂN BẰNG SÁNG/CHIỀU (nếu buoiUuTien='ca_hai') ===
      if (nv.buoiUuTien === 'ca_hai') {
        sessions = this._canBangSangChieu(gv, gvId, sessions, perGV);
      }

      // === ÉP buoiUuTien cụ thể ===
      if (nv.buoiUuTien && nv.buoiUuTien !== 'ca_hai') {
        this._fixBuoiUuTien(gv, gvId, nv, perGV);
      }

      // Sync state
      this.gvBuoiSet.set(gvId, sessions);
      this.gvBusy.set(gvId, this.slotFinder.busySetForGV(gvId));
      this.gvThuSet.set(gvId, this._getGVThus(gvId));

      if (sessions.size < initialSize) {
        this.stats.soGVOptimized++;
      }
      this.stats.soLanMove += perGV.moves;
      this.stats.perGV.set(gvId, perGV);
      this.stats.thongKeBuoi.push({
        gvId,
        gvName: gv.hoTen || gv.ten || gvId,
        desired: desiredSessions,
        actual: sessions.size,
        buoiUuTien: nv.buoiUuTien || null,
        satisfied: sessions.size <= desiredSessions,
        moves: perGV.moves,
      });
    }
    return this.stats;
  }

  // ====================== HELPERS ======================

  _countPeriods(gvId) {
    let count = 0;
    for (const data of this.data) {
      for (const ngay of data.lopSchedule || []) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            count++;
          }
        }
      }
    }
    return count;
  }

  _getCurrentSessions(gvId) {
    const sessions = new Set();
    for (const data of this.data) {
      for (const ngay of data.lopSchedule || []) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            sessions.add(createSessionKey(ngay.thu, ngay.buoi));
          }
        }
      }
    }
    return sessions;
  }

  _getGVThus(gvId) {
    const thus = new Set();
    for (const data of this.data) {
      for (const ngay of data.lopSchedule || []) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            thus.add(ngay.thu);
          }
        }
      }
    }
    return thus;
  }

  _countItemsInSession(gvId, thu, buoi) {
    let total = 0;
    for (const data of this.data) {
      const ngay = data.lopSchedule.find(n => n.thu === thu && n.buoi === buoi);
      if (!ngay) continue;
      for (const tiet of ngay.tiets) {
        if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) total++;
      }
    }
    return total;
  }

  // ====================== GOM SESSION ======================

  /**
   * Gom các session về desiredSessions bằng cách move items sang session khác.
   * Ưu tiên session có ÍT items nhất (dễ empty).
   */
  _gopSessions(gv, gvId, sessions, desiredSessions, perGV) {
    let currentSessionSet = new Set(sessions);
    let busySet = this.slotFinder.busySetForGV(gvId);

    let iter = 0;
    const MAX_ITER = 20; // tránh vòng lặp vô hạn

    while (currentSessionSet.size > desiredSessions && iter < MAX_ITER) {
      iter++;
      const sortedKeys = [...currentSessionSet].sort(
        (a, b) => this._countItemsInSession(gvId, ...a.split('-').map((v, i) => i === 0 ? parseInt(v, 10) : v))
                  - this._countItemsInSession(gvId, ...b.split('-').map((v, i) => i === 0 ? parseInt(v, 10) : v))
      );

      let merged = false;
      for (const sourceKey of sortedKeys) {
        if (currentSessionSet.size <= desiredSessions) break;
        const [sourceThuStr, sourceBuoi] = sourceKey.split('-');
        const sourceThu = parseInt(sourceThuStr, 10);

        const sourceItems = this.ops.getGVItemsInSession(gvId, sourceThu, sourceBuoi);
        if (sourceItems.length === 0) {
          currentSessionSet.delete(sourceKey);
          merged = true;
          break;
        }

        const merged2 = this._tryingMergeSession(
          gv, gvId, sourceKey, sourceThu, sourceBuoi, sourceItems,
          currentSessionSet, busySet, perGV,
        );

        if (merged2) {
          merged = true;
          // RECALCULATE từ data - source of truth duy nhất
          currentSessionSet = this._getCurrentSessions(gvId);
          busySet = this.slotFinder.busySetForGV(gvId);
          break;
        }
      }

      if (!merged) {
        console.log(`[SessionOptimizer] _gopSessions GV=${gv.hoTen || gvId} stuck at iter=${iter}, currentSessions=${currentSessionSet.size} desired=${desiredSessions}`);
        break;
      }
    }

    if (iter >= MAX_ITER) {
      console.warn(`[SessionOptimizer] _gopSessions GV=${gv.hoTen || gvId} hit MAX_ITER=${MAX_ITER}`);
    }

    return currentSessionSet;
  }

  /**
   * Thử merge 1 session nguồn vào session khác.
   * @returns {boolean} true nếu merge thành công
   */
  _tryingMergeSession(gv, gvId, sourceKey, sourceThu, sourceBuoi, sourceItems, currentSessionSet, busySet, perGV) {
    const nv = gv.nguyenVong || {};
    // Tạo danh sách target: existing trước (gom buổi), new sau
    const existingTargetKeys = [...currentSessionSet].filter(k => k !== sourceKey);
    const allPossibleKeys = [];
    for (const thu of TKB_CONFIG.weekdays) {
      for (const buoi of Object.keys(TKB_CONFIG.sessions)) {
        const key = createSessionKey(thu, buoi);
        if (key !== sourceKey) allPossibleKeys.push(key);
      }
    }
    const orderedTargetKeys = [
      ...existingTargetKeys,
      ...allPossibleKeys.filter(k => !existingTargetKeys.includes(k)),
    ];

    let allMoved = true;
    const targetSessionKeys = [];

    for (const item of sourceItems) {
      let moved = false;
      let currentBusy = this.slotFinder.busySetForGV(gvId);

      for (const targetKey of orderedTargetKeys) {
        const [targetThuStr, targetBuoi] = targetKey.split('-');
        const targetThu = parseInt(targetThuStr, 10);

        // Skip thứ nghỉ
        if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(targetThu)) continue;

        const freeSlots = this.slotFinder.findAvailableSlotsInSession(targetThu, targetBuoi, gvId, item.lopId);
        for (const slot of freeSlots) {
          if (!isValidTietForBuoi(item.tiet, slot.buoi)) continue;

          // Validate thêm
          if (currentBusy.has(createSlotKey(slot.thu, slot.buoi, slot.tiet))) continue;

          // Apply
          if (this.ops.moveSingleTiet(item, slot.thu, slot.buoi, slot.tiet, gv)) {
            targetSessionKeys.push(createSessionKey(slot.thu, slot.buoi));
            moved = true;
            perGV.moves++;
            break;
          }
        }
        if (moved) break;
      }

      if (!moved) {
        allMoved = false;
        // Rollback các items đã move (nếu có)
        // Đơn giản: return false, caller sẽ skip session này
        break;
      }
    }

    if (allMoved) {
      perGV.gomSuccess++;
      return true;
    }
    return false;
  }

  // ====================== EXCESS HANDLING ======================

  /**
   * Xử lý buổi vượt desiredSessions: cắt sang session mới.
   */
  _xuLyExcess(gv, gvId, sessions, desiredSessions, perGV) {
    let currentSessionSet = new Set(sessions);

    let iter = 0;
    const MAX_ITER = 20;

    while (currentSessionSet.size > desiredSessions && iter < MAX_ITER) {
      iter++;
      const sortedKeys = [...currentSessionSet].sort(
        (a, b) => this._countItemsInSession(gvId, ...a.split('-').map((v, i) => i === 0 ? parseInt(v, 10) : v))
                  - this._countItemsInSession(gvId, ...b.split('-').map((v, i) => i === 0 ? parseInt(v, 10) : v))
      );

      let sessionEmptied = false;

      for (const excessKey of sortedKeys) {
        if (currentSessionSet.size <= desiredSessions) break;
        const [excessThuStr, excessBuoi] = excessKey.split('-');
        const excessThu = parseInt(excessThuStr, 10);

        const items = this.ops.getGVItemsInSession(gvId, excessThu, excessBuoi);
        if (items.length === 0) {
          currentSessionSet.delete(excessKey);
          sessionEmptied = true;
          break;
        }

        // Tìm existing session trước
        const existingKeys = [...currentSessionSet].filter(k => k !== excessKey);
        const newKeys = [];
        for (const thu of TKB_CONFIG.weekdays) {
          for (const buoi of Object.keys(TKB_CONFIG.sessions)) {
            const key = createSessionKey(thu, buoi);
            if (key !== excessKey && !existingKeys.includes(key)) newKeys.push(key);
          }
        }
        const orderedTargets = [...existingKeys, ...newKeys];

        let allMoved = true;
        for (const item of items) {
          let moved = false;
          for (const targetKey of orderedTargets) {
            const [targetThuStr, targetBuoi] = targetKey.split('-');
            const targetThu = parseInt(targetThuStr, 10);
            const slots = this.slotFinder.findAvailableSlotsInSession(targetThu, targetBuoi, gvId, item.lopId);
            for (const slot of slots) {
              if (!isValidTietForBuoi(item.tiet, slot.buoi)) continue;
              if (this.ops.moveSingleTiet(item, slot.thu, slot.buoi, slot.tiet, gv)) {
                moved = true;
                perGV.moves++;
                perGV.excessMoves++;
                break;
              }
            }
            if (moved) break;
          }
          if (!moved) {
            allMoved = false;
            break;
          }
        }

        if (allMoved) {
          currentSessionSet.delete(excessKey);
          sessionEmptied = true;
          break;
        }
      }

      if (!sessionEmptied) {
        console.log(`[SessionOptimizer] _xuLyExcess GV=${gv.hoTen || gvId} stuck at iter=${iter}, currentSessions=${currentSessionSet.size} desired=${desiredSessions}`);
        break;
      }

      // Recalculate
      currentSessionSet = this._getCurrentSessions(gvId);
    }

    if (iter >= MAX_ITER) {
      console.warn(`[SessionOptimizer] _xuLyExcess GV=${gv.hoTen || gvId} hit MAX_ITER=${MAX_ITER}`);
    }

    return currentSessionSet;
  }

  // ====================== CÂN BẰNG SÁNG/CHIỀU ======================

  /**
   * Nếu chênh sáng/chiều >= 2: di chuyển 1 buổi sang buổi còn lại.
   */
  _canBangSangChieu(gv, gvId, sessions, perGV) {
    const nv = gv.nguyenVong || {};
    let sangCount = 0, chieuCount = 0;
    const sangSessions = [], chieuSessions = [];
    for (const sk of sessions) {
      const [thuStr, buoi] = sk.split('-');
      if (buoi === 'sang') { sangCount++; sangSessions.push(sk); }
      else { chieuCount++; chieuSessions.push(sk); }
    }

    if (Math.abs(sangCount - chieuCount) < 2) return sessions;

    const fromSessions = sangCount > chieuCount ? sangSessions : chieuSessions;
    const targetBuoi = sangCount > chieuCount ? 'chieu' : 'sang';

    for (const fromKey of fromSessions) {
      const [fromThuStr] = fromKey.split('-');
      const fromThu = parseInt(fromThuStr, 10);
      const items = this.ops.getGVItemsInSession(gvId, fromThu, sangCount > chieuCount ? 'sang' : 'chieu');
      if (items.length === 0) continue;

      let movedAny = false;
      for (const defThu of TKB_CONFIG.weekdays) {
        if (defThu === fromThu) continue;
        if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(defThu)) continue;

        const defKey = createSessionKey(defThu, targetBuoi);
        if (sessions.has(defKey)) continue;

        const slots = this.slotFinder.findAvailableSlotsInSession(defThu, targetBuoi, gvId, items[0].lopId);
        for (const slot of slots) {
          if (!isValidTietForBuoi(items[0].tiet, slot.buoi)) continue;
          if (this.ops.moveSingleTiet(items[0], slot.thu, slot.buoi, slot.tiet, gv)) {
            perGV.moves++;
            movedAny = true;
            break;
          }
        }
        if (movedAny) break;
      }
      if (movedAny) break;
    }

    return this._getCurrentSessions(gvId);
  }

  // ====================== ÉP buoiUuTien CỤ THỂ ======================

  /**
   * Nếu GV có buoiUuTien cụ thể (không phải ca_hai): di chuyển tất cả tiết về buổi đó.
   */
  _fixBuoiUuTien(gv, gvId, nv, perGV) {
    const targetBuoi = nv.buoiUuTien;
    const wrongBuoiItems = [];
    for (const data of this.data) {
      for (const ngay of data.lopSchedule || []) {
        if (ngay.buoi === targetBuoi) continue;
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            wrongBuoiItems.push({
              lopId: data.lop._id.toString(),
              thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet,
              chuyenMon: tiet.chuyenMon,
            });
          }
        }
      }
    }

    for (const item of wrongBuoiItems) {
      let moved = false;
      for (const defThu of TKB_CONFIG.weekdays) {
        if (moved) break;
        if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(defThu)) continue;
        if (defThu === item.thu) continue;

        const slots = this.slotFinder.findAvailableSlotsInSession(defThu, targetBuoi, gvId, item.lopId);
        for (const slot of slots) {
          if (!isValidTietForBuoi(item.tiet, slot.buoi)) continue;
          if (this.ops.moveSingleTiet(item, slot.thu, slot.buoi, slot.tiet, gv)) {
            perGV.moves++;
            moved = true;
            break;
          }
        }
      }
    }
  }
}

module.exports = { SessionOptimizer };
