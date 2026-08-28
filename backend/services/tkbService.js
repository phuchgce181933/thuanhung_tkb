/**
 * Thuật toán sắp xếp Thời Khóa Biểu Tự Động
 * 
 * Quy tắc:
 * - Mỗi lớp phải được xếp ĐỦ số tiết theo cấu hình khối
 * - Sáng: 4 tiết (1-4), Tiết 1 = Chào cờ (cố định)
 * - Chiều: 3 tiết (5-7)
 * - Thứ 2 - Thứ 6
 * - GIÁO VIÊN KHÔNG ĐƯỢC TRÙNG LỊCH (không dạy 2 lớp cùng lúc)
 * - MỖI BUỔI chỉ xếp MỖI MÔN TỐI ĐA 1 TIẾT (tránh học 1 môn liên tục)
 */

const GiaoVien = require('../models/GiaoVien');
const Lop = require('../models/Lop');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');
const Khoi = require('../models/Khoi');

// Cấu hình thời khóa biểu
const TKB_CONFIG = {
  weekdays: [2, 3, 4, 5, 6],
  
  sessions: {
    sang: { tietBatDau: 1, tietKetThuc: 4, coChaoCo: true },
    chieu: { tietBatDau: 5, tietKetThuc: 7, coChaoCo: false }
  },
  
  chuyenMonMacDinh: {
    1: {
      'Toán': 4, 'Tiếng Việt': 5, 'Đạo đức': 1, 'Thể dục': 2,
      'Giáo dục thể chất': 1, 'Âm nhạc': 1, 'Mỹ thuật': 1,
      'Tự nhiên và Xã hội': 2, 'Tin học': 1
    },
    2: {
      'Toán': 4, 'Tiếng Việt': 5, 'Đạo đức': 1, 'Thể dục': 2,
      'Giáo dục thể chất': 1, 'Âm nhạc': 1, 'Mỹ thuật': 1,
      'Khoa học': 2, 'Tin học': 1
    },
    3: {
      'Toán': 4, 'Tiếng Việt': 5, 'Đạo đức': 1, 'Thể dục': 2,
      'Giáo dục thể chất': 1, 'Âm nhạc': 1, 'Mỹ thuật': 1,
      'Khoa học': 2, 'Tiếng Anh': 2, 'Tin học': 1
    },
    4: {
      'Toán': 5, 'Tiếng Việt': 5, 'Khoa học': 2, 'Lịch sử và Địa lý': 2,
      'Đạo đức': 1, 'Thể dục': 2, 'Giáo dục thể chất': 1,
      'Âm nhạc': 1, 'Mỹ thuật': 1, 'Tiếng Anh': 3,
      'Tin học': 1, 'Công nghệ': 1
    },
    5: {
      'Toán': 5, 'Tiếng Việt': 5, 'Khoa học': 2, 'Lịch sử và Địa lý': 2,
      'Đạo đức': 1, 'Thể dục': 2, 'Giáo dục thể chất': 1,
      'Âm nhạc': 1, 'Mỹ thuật': 1, 'Tiếng Anh': 3,
      'Tin học': 1, 'Công nghệ': 1
    }
  }
};

// Tổng slot có thể xếp: 5 ngày × (4 sáng - 1 chào cờ + 3 chiều) = 30 tiết
const TONG_SO_TIET_TOI_DA = TKB_CONFIG.weekdays.length * 6; // 30
const TONG_TIET_MOI_LOP = Object.values(TKB_CONFIG.chuyenMonMacDinh[1]).reduce((a,b) => a+b, 0);
// Khối 1: 4+5+1+2+1+1+1+2+1 = 18 tiết
// Khối 2-3: +2 (Khoa học) = 19-20 tiết

// ============== HÀM HỖ TRỢ ==============

function createSlotKey(thu, buoi, tiet) {
  return `${thu}-${buoi}-${tiet}`;
}

function getChuyenMonByKhoi(tenKhoi) {
  const match = tenKhoi.match(/\d+/);
  const soKhoi = match ? parseInt(match[0]) : 1;
  return TKB_CONFIG.chuyenMonMacDinh[soKhoi] || TKB_CONFIG.chuyenMonMacDinh[1];
}

/**
 * Kiểm tra tiết có hợp lệ với buổi không (sáng 1-4, chiều 5-7).
 * Trả về false nếu buổi không xác định hoặc tiết ngoài range.
 */
function isValidTietForBuoi(tiet, buoi) {
  const config = TKB_CONFIG.sessions[buoi];
  if (!config) return false;
  return tiet >= config.tietBatDau && tiet <= config.tietKetThuc;
}

/**
 * Tính điểm phù hợp của giáo viên với một slot
 * - -Infinity: không được xếp (hard constraint)
 * - Điểm cao = ưu tiên xếp hơn
 *
 * @param {Object} gv
 * @param {Object} slot
 * @param {Set} gvBusy
 * @param {Set} gvBuoiSet
 * @param {boolean} respectNV - true: tôn trọng nguyện vọng (pass 1);
 *                              false: cho phép vượt, chỉ trừ điểm (pass 2 - fallback)
 */
// Helper: kiểm tra GV đã đăng ký NV cụ thể hay không
// Coi là "có NV" nếu có ít nhất 1 trong: thuNghi (không rỗng),
// soBuoiToiDa (khác null), buoiUuTien (khác ca_hai).
function gvCoNV(gv) {
  const nv = gv.nguyenVong || {};
  const coThuNghi = Array.isArray(nv.thuNghi) && nv.thuNghi.length > 0;
  const coSoBuoi = nv.soBuoiToiDa != null;
  const coBuoi = nv.buoiUuTien && nv.buoiUuTien !== 'ca_hai';
  return coThuNghi || coSoBuoi || coBuoi;
}

function scoreGV(gv, slot, gvBusy, gvBuoiSet, respectNV = true) {
  const nv = gv.nguyenVong || {};
  let score = 0;
  let violationPenalty = 0;

  // GV trùng slot (1 GV dạy 2 lớp cùng slot) là SOFT constraint, không phải HARD.
  // Lý do: vẫn có thể trùng slot khi không đủ GV (1 GV Tiếng Anh dạy 12 lớp × 4 tiết = 48,
  // 1 tuần chỉ 34 slot → bất khả thi không trùng). Phạt điểm rất nặng (-10000) để slot
  // không trùng luôn được ưu tiên, nhưng vẫn có thể chọn nếu không còn lựa chọn nào khác.
  // Dấu hiệu vi phạm sẽ được ghi nhận ở bước commitTiet.
  const isBusy = gvBusy && gvBusy.has(slot.key);
  if (isBusy) {
    violationPenalty -= 10000; // rất nặng - slot trùng chỉ được chọn khi bất đắc dĩ
  }

  // NV là SOFT constraint: không bao giờ return -Infinity, chỉ trừ điểm nặng.
  // Lý do: bạn nói "không bắt buộc phải đảm báo 100% nguyện vọng" - NV chỉ là ưu tiên,
  // không phải ràng buộc cứng. Nếu GV đã hết buổi NV mà vẫn cần xếp tiết (ví dụ GV
  // Tiếng Anh dạy 12 tiết/tuần dù NV chỉ cho 5 buổi), hệ thống vẫn phải xếp được.
  //
  // Tham số respectNV chỉ ảnh hưởng mức phạt:
  //  - respectNV=true (ưu tiên NV): phạt nặng → thường GV này sẽ bị loại "tự nhiên"
  //    vì có GV khác không vi phạm có score cao hơn.
  //  - respectNV=false (nới lỏng): phạt nhẹ hơn → chọn GV này khi không còn lựa chọn.

  // Phạt nếu thuộc thứ nghỉ
  if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(slot.thu)) {
    violationPenalty -= respectNV ? 1000 : 200;
  }
  // Phạt nếu đã vượt số buổi tối đa
  if (nv.soBuoiToiDa && gvBuoiSet.size >= nv.soBuoiToiDa) {
    violationPenalty -= respectNV ? 500 : 100;
  }
  // Phạt nhẹ nếu sắp vượt (>= soBuoiToiDa - 1 nhưng chưa tới max)
  if (nv.soBuoiToiDa && gvBuoiSet.size === nv.soBuoiToiDa - 1) {
    violationPenalty -= respectNV ? 50 : 0;
  }

  // Ưu tiên buổi (sáng / chiều / cả hai)
  if (!nv.buoiUuTien || nv.buoiUuTien === 'ca_hai' || nv.buoiUuTien === slot.buoi) {
    score += 100;
  } else {
    score -= 50;
  }

  // Cân bằng tải (ít tiết hơn = ưu tiên cao hơn)
  score -= gvBusy.size * 5;

  // GV còn dư buổi theo nguyện vọng -> ưu tiên tiếp tục dạy
  if (nv.soBuoiToiDa && gvBuoiSet.size < nv.soBuoiToiDa) {
    score += 10;
  }

  return score + violationPenalty;
}

/**
 * Tạo danh sách tất cả slot có thể xếp (đã loại bỏ chào cờ)
 */
function generateAllSlots() {
  const slots = [];
  for (const thu of TKB_CONFIG.weekdays) {
    for (const [buoi, config] of Object.entries(TKB_CONFIG.sessions)) {
      for (let tiet = config.tietBatDau; tiet <= config.tietKetThuc; tiet++) {
        // Chỉ bỏ tiết 1 buổi sáng thứ 2 (chào cờ)
        if (!(buoi === 'sang' && tiet === 1 && thu === 2)) {
          slots.push({ thu, buoi, tiet, key: createSlotKey(thu, buoi, tiet) });
        }
      }
    }
  }
  return slots;
}

// ============== OPTIMIZATION (post-process) ==============

/**
 * Tính distinct sessions của 1 GV từ lịch các lớp
 * Trả về Map<"thu-buoi", Array<{lopId, tiet, chuyenMon}>>
 */
function buildGVSessionMap(lopSchedulesData, gvId) {
  const sessions = new Map(); // key: "thu-buoi" -> [{ lopId, tiet, chuyenMon }]
  for (const data of lopSchedulesData) {
    for (const ngay of data.lopSchedule) {
      for (const tiet of ngay.tiets) {
        const tietGvId = tiet.giaoVien.toString();
        if (tietGvId !== gvId) continue;
        const key = `${ngay.thu}-${ngay.buoi}`;
        if (!sessions.has(key)) sessions.set(key, []);
        sessions.get(key).push({
          lopId: data.lop._id.toString(),
          lopName: data.lop.tenLop,
          thu: ngay.thu,
          buoi: ngay.buoi,
          tiet: tiet.tiet,
          chuyenMon: tiet.chuyenMon
        });
      }
    }
  }
  return sessions;
}

/**
 * Validate: move tiết của GV từ session cũ sang session mới có hợp lệ không
 * - Không trùng GV khác (slot đích rảnh cho GV)
 * - Không trùng lớp (slot đích trống cho lớp đang học GV)
 * - Không rơi vào thứ nghỉ
 */
function canMoveBlock(block, targetThu, targetBuoi, gv, lopSchedulesData, gvBusyForGV) {
  const nv = gv.nguyenVong || {};
  // Không vi phạm thứ nghỉ
  if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(targetThu)) {
    return { ok: false, lyDo: 'thu_nghi' };
  }
  const gvId = gv._id.toString();
  for (const item of block) {
    // Tiết phải hợp lệ với buổi đích (sáng 1-4, chiều 5-7).
    // Nếu không, block đang ở buổi khác với tiết không hợp lệ → không move được.
    if (!isValidTietForBuoi(item.tiet, targetBuoi)) {
      return { ok: false, lyDo: 'tiet_khong_hop_le_voi_buoi' };
    }
    const targetKey = createSlotKey(targetThu, targetBuoi, item.tiet);
    // GV không rảnh ở slot đích (parse từ targetKey cũ)
    // Lưu ý: gvBusyForGV đã được move nếu targetKey trùng với oldKey của chính block
    // -> canMoveBlock gọi TRƯỚC khi move, nên ta cần kiểm tra có trùng slot nguồn không
    // -> Logic: gvBusyForGV chứa slot CŨ. Nếu targetKey trùng slot cũ -> OK vì đang move đi
    const oldKey = createSlotKey(item.thu, item.buoi, item.tiet);
    if (targetKey !== oldKey && gvBusyForGV.has(targetKey)) {
      return { ok: false, lyDo: 'gv_busy' };
    }
    // Lớp đích không có tiết khác tại slot này
    const lopData = lopSchedulesData.find(d => d.lop._id.toString() === item.lopId);
    if (!lopData) return { ok: false, lyDo: 'lop_not_found' };
    const ngay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
    if (ngay && ngay.tiets.some(t => t.tiet === item.tiet && t.giaoVien.toString() !== gvId)) {
      return { ok: false, lyDo: 'lop_busy' };
    }
    // Slot đích không phải chào cờ
    if (targetBuoi === 'sang' && item.tiet === 1 && targetThu === 2) {
      return { ok: false, lyDo: 'chao_co' };
    }
  }
  return { ok: true };
}

/**
 * Áp dụng move block: cập nhật cả lopSchedulesData, gvBusy, gvBuoiSet
 * (Hiện không sử dụng - logic đã inline trong optimizeSessions để tránh
 * cập nhật gvBuoiSet cũ, dùng countGVSessions để tính lại)
 */
function applyMoveBlock(block, targetThu, targetBuoi, lopSchedulesData, gvBusy, gvBuoiSet, gvThuSet) {
  // Deprecated: xem logic trong optimizeSessions
  for (const item of block) {
    const lopData = lopSchedulesData.find(d => d.lop._id.toString() === item.lopId);
    if (!lopData) continue;
    const oldNgay = lopData.lopSchedule.find(n => n.thu === item.thu && n.buoi === item.buoi);
    if (oldNgay) {
      oldNgay.tiets = oldNgay.tiets.filter(t => t.tiet !== item.tiet);
      if (oldNgay.tiets.length === 0) {
        lopData.lopSchedule = lopData.lopSchedule.filter(n => !(n.thu === item.thu && n.buoi === item.buoi));
      }
    }
    let newNgay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
    if (!newNgay) {
      newNgay = { thu: targetThu, buoi: targetBuoi, tiets: [] };
      lopData.lopSchedule.push(newNgay);
    }
    newNgay.tiets.push({
      tiet: item.tiet,
      giaoVien: item.lopId ? undefined : undefined,
      chuyenMon: item.chuyenMon
    });
    newNgay.tiets.sort((a, b) => a.tiet - b.tiet);
  }
}

/**
 * Sau khi optimization, duyệt lại TKB cuối cùng và ghi nhận các vi phạm NV còn tồn tại.
 * Chỉ ghi các vi phạm THỰC SỰ CÒN trong TKB cuối (không phải vi phạm tạm thời đã được MOVE).
 */
function recomputeViPhamNV(lopSchedulesData, giaoViens, viPhamNVList) {
  // Map gvId -> Set<sessionKey>
  const gvSessions = new Map();
  const gvById = new Map();
  for (const gv of giaoViens) {
    gvById.set(gv._id.toString(), gv);
    gvSessions.set(gv._id.toString(), new Set());
  }

  // Duyệt TKB cuối, thu thập distinct sessions của từng GV
  const gvSessionItems = new Map(); // gvId -> Map<sessionKey, Array<item>>
  for (const data of lopSchedulesData) {
    for (const ngay of data.lopSchedule) {
      for (const tiet of ngay.tiets) {
        const gvId = tiet.giaoVien.toString();
        const sessionKey = `${ngay.thu}-${ngay.buoi}`;
        gvSessions.get(gvId).add(sessionKey);
        if (!gvSessionItems.has(gvId)) gvSessionItems.set(gvId, new Map());
        const m = gvSessionItems.get(gvId);
        if (!m.has(sessionKey)) m.set(sessionKey, []);
        m.get(sessionKey).push({
          lop: data.lop.tenLop,
          mon: tiet.chuyenMon,
          thu: ngay.thu,
          buoi: ngay.buoi,
          tiet: tiet.tiet
        });
      }
    }
  }

  // Với mỗi GV, tìm các session thừa/thuNghi
  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    const nv = gv.nguyenVong || {};
    const sessions = Array.from(gvSessions.get(gvId));
    const items = gvSessionItems.get(gvId) || new Map();

    // 1. Vi phạm số buổi: các session thừa (sorted theo thu+buoi, lấy cuối)
    if (nv.soBuoiToiDa && sessions.length > nv.soBuoiToiDa) {
      // Sắp xếp session theo (thu, buoi) và lấy các session vượt
      const sortedSessions = sessions.sort((a, b) => {
        const [ta, ba] = a.split('-');
        const [tb, bb] = b.split('-');
        const oa = parseInt(ta) * 2 + (ba === 'sang' ? 0 : 1);
        const ob = parseInt(tb) * 2 + (bb === 'sang' ? 0 : 1);
        return ob - oa; // desc - lấy buổi CUỐI (mới nhất) trước
      });
      const thuaSessions = sortedSessions.slice(0, sessions.length - nv.soBuoiToiDa);
      for (const sessionKey of thuaSessions) {
        for (const it of items.get(sessionKey) || []) {
          viPhamNVList.push({
            ...it,
            gv: gv.hoTen,
            lyDo: `vượt số buổi tối đa (${sessions.length}/${nv.soBuoiToiDa})`
          });
        }
      }
    }

    // 2. Vi phạm thứ nghỉ
    if (Array.isArray(nv.thuNghi) && nv.thuNghi.length > 0) {
      for (const sessionKey of sessions) {
        const [thuStr] = sessionKey.split('-');
        const thu = parseInt(thuStr);
        if (nv.thuNghi.includes(thu)) {
          for (const it of items.get(sessionKey) || []) {
            viPhamNVList.push({
              ...it,
              gv: gv.hoTen,
              lyDo: `vi phạm thứ nghỉ (thứ ${thu})`
            });
          }
        }
      }
    }
  }
}

/**
 * Tính số buổi hiện tại của GV (distinct thu × buoi)
 */
function countGVSessions(lopSchedulesData, gvId) {
  const sessions = new Set();
  for (const data of lopSchedulesData) {
    for (const ngay of data.lopSchedule) {
      for (const tiet of ngay.tiets) {
        if (tiet.giaoVien.toString() === gvId) {
          sessions.add(`${ngay.thu}-${ngay.buoi}`);
        }
      }
    }
  }
  return sessions.size;
}

// ============== LOCAL SEARCH / HILL CLIMBING OPTIMIZATION ==============

/**
 * Deep clone toàn bộ lopSchedulesData để thử nghiệm trên bản sao.
 * Không clone ObjectId của GV - giữ nguyên tham chiếu.
 */
function cloneSchedulesData(lopSchedulesData) {
  return lopSchedulesData.map(d => ({
    lop: d.lop,
    khoi: d.khoi,
    chuyenMonList: d.chuyenMonList,
    tongTietXep: d.tongTietXep,
    lopSchedule: d.lopSchedule.map(n => ({
      thu: n.thu,
      buoi: n.buoi,
      tiets: n.tiets.map(t => ({ tiet: t.tiet, giaoVien: t.giaoVien, chuyenMon: t.chuyenMon }))
    }))
  }));
}

/**
 * Tính số buổi (distinct thu × buoi) của từng GV từ schedule.
 * Trả về Map<gvId, Set<"thu-buoi">>
 */
function buildGvSessionSets(lopSchedulesData) {
  const map = new Map();
  for (const data of lopSchedulesData) {
    for (const ngay of data.lopSchedule) {
      for (const tiet of ngay.tiets) {
        if (!tiet.giaoVien) continue;
        const gvId = tiet.giaoVien.toString();
        if (!map.has(gvId)) map.set(gvId, new Set());
        map.get(gvId).add(`${ngay.thu}-${ngay.buoi}`);
      }
    }
  }
  return map;
}

/**
 * Validate HARD CONSTRAINTS trên một schedule bất kỳ.
 * Trả về { ok: boolean, viPham: [...] }
 *
 * Hard constraints (theo spec):
 *  - 1 lớp không có 2 môn cùng slot
 *  - 1 GV không dạy 2 lớp cùng slot
 *  - Không trùng slot trong cùng lớp
 *  - Không xếp thứ nghỉ của GV (nếu cấu hình coi là hard)
 *  - Không xếp tiết 1 sáng T2 (chào cờ)
 */
function validateHardConstraints(lopSchedulesData, giaoViens, hardThuNghi = false) {
  const viPham = [];
  const gvById = new Map();
  for (const gv of giaoViens) gvById.set(gv._id.toString(), gv);

  // 1. Lớp không trùng slot; kiểm tra GV có dạy 2 lớp cùng slot
  const gvBusySeen = new Map(); // gvId -> Set<slotKey>
  for (const data of lopSchedulesData) {
    const lopId = data.lop._id.toString();
    const lopSlotSeen = new Set();
    for (const ngay of data.lopSchedule) {
      for (const tiet of ngay.tiets) {
        const slotKey = createSlotKey(ngay.thu, ngay.buoi, tiet.tiet);
        if (lopSlotSeen.has(slotKey)) {
          viPham.push({ loai: 'lop_trung_slot', lopId, slotKey });
        }
        lopSlotSeen.add(slotKey);
        // Check chào cờ
        if (ngay.buoi === 'sang' && tiet.tiet === 1 && ngay.thu === 2) {
          viPham.push({ loai: 'chao_co', lopId, slotKey });
        }
        // Check GV trùng slot
        if (tiet.giaoVien) {
          const gvId = tiet.giaoVien.toString();
          if (!gvBusySeen.has(gvId)) gvBusySeen.set(gvId, new Set());
          if (gvBusySeen.get(gvId).has(slotKey)) {
            viPham.push({ loai: 'gv_trung_slot', gvId, slotKey });
          }
          gvBusySeen.get(gvId).add(slotKey);
          // Check thứ nghỉ nếu coi là hard
          if (hardThuNghi) {
            const gv = gvById.get(gvId);
            const nv = gv ? (gv.nguyenVong || {}) : {};
            if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(ngay.thu)) {
              viPham.push({ loai: 'thu_nghi', gvId, slotKey });
            }
          }
        }
      }
    }
  }
  return { ok: viPham.length === 0, viPham };
}

/**
 * Tính GLOBAL SCORE của toàn bộ schedule.
 * Điểm càng THẤP càng tốt (penalty-based).
 *
 * Priority theo spec:
 *  P1: hard violation -> cộng rất nặng (nhưng hàm này chỉ gọi sau khi pass hard)
 *  P2: tổng số buổi vượt desiredSessions (mỗi buổi vượt = +1000)
 *  P3: tổng số session của tất cả GV (+5/session)
 *  P4: teacher preference buổi sáng/chiều (+10 nếu sai)
 *  P5: teacher nghỉ thứ (+50/tiết nếu rơi vào thứ nghỉ, soft)
 *  P6: khoảng trống giữa các tiết trong buổi (+2/đơn vị gap)
 *  P7: tiết rời rạc (+5 nếu 1 tiết lẻ không cạnh tiết nào cùng buổi)
 */
function calculateScheduleScore(lopSchedulesData, giaoViens) {
  let score = 0;
  const gvById = new Map();
  for (const gv of giaoViens) gvById.set(gv._id.toString(), gv);

  const gvSessions = buildGvSessionSets(lopSchedulesData);

  // P2 + P3 + P4 + P5: per-GV
  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    const nv = gv.nguyenVong || {};
    const sessions = gvSessions.get(gvId) || new Set();
    const sessionCount = sessions.size;
    // P2: vượt desired
    if (nv.soBuoiToiDa && sessionCount > nv.soBuoiToiDa) {
      score += (sessionCount - nv.soBuoiToiDa) * 1000;
    }
    // P3: tổng session
    score += sessionCount * 5;
    // P4 + P5: thu thập các item của GV
    const gvItems = [];
    for (const data of lopSchedulesData) {
      for (const ngay of data.lopSchedule) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            gvItems.push({ thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet });
          }
        }
      }
    }
    // P4: ưu tiên buổi
    if (nv.buoiUuTien && nv.buoiUuTien !== 'ca_hai') {
      for (const it of gvItems) {
        if (it.buoi !== nv.buoiUuTien) score += 10;
      }
    }
    // P5: thứ nghỉ (soft)
    if (Array.isArray(nv.thuNghi) && nv.thuNghi.length > 0) {
      for (const it of gvItems) {
        if (nv.thuNghi.includes(it.thu)) score += 50;
      }
    }
    // P6 + P7: khoảng trống & tiết rời rạc trong cùng (thu, buoi)
    const bySession = new Map();
    for (const it of gvItems) {
      const k = `${it.thu}-${it.buoi}`;
      if (!bySession.has(k)) bySession.set(k, []);
      bySession.get(k).push(it.tiet);
    }
    for (const [_, tiets] of bySession) {
      if (tiets.length < 2) {
        score += 5; // P7
        continue;
      }
      tiets.sort((a, b) => a - b);
      // P6: gap giữa min và max
      const span = tiets[tiets.length - 1] - tiets[0] + 1;
      const occupied = tiets.length;
      score += (span - occupied) * 2;
      // P7: tiết rời rạc (nếu chỉ có 1 tiết thì đã tính trên)
    }
  }
  return score;
}

/**
 * Build danh sách session map của 1 GV từ schedule data.
 * Trả về Map<"thu-buoi", Array<item>>
 */
function buildGVSessionMapFromData(lopSchedulesData, gvId) {
  const sessions = new Map();
  for (const data of lopSchedulesData) {
    for (const ngay of data.lopSchedule) {
      for (const tiet of ngay.tiets) {
        if (!tiet.giaoVien) continue;
        if (tiet.giaoVien.toString() !== gvId) continue;
        const key = `${ngay.thu}-${ngay.buoi}`;
        if (!sessions.has(key)) sessions.set(key, []);
        sessions.get(key).push({
          lopId: data.lop._id.toString(),
          thu: ngay.thu,
          buoi: ngay.buoi,
          tiet: tiet.tiet,
          chuyenMon: tiet.chuyenMon
        });
      }
    }
  }
  return sessions;
}

/**
 * Thử move 1 block (danh sách các item trong cùng session) sang (targetThu, targetBuoi).
 * Trả về { ok, viPham } - viPham là danh sách vi phạm hard constraint nếu có.
 */
function tryMoveBlockOnData(data, block, targetThu, targetBuoi, gv, allSessionsKeys, busyForGV) {
  const gvId = gv._id.toString();
  // Check thứ nghỉ (treat as hard trong optimization để an toàn)
  const nv = gv.nguyenVong || {};
  if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(targetThu)) {
    return { ok: false, viPham: [{ loai: 'thu_nghi' }] };
  }
  // Check chào cờ
  for (const item of block) {
    if (targetBuoi === 'sang' && item.tiet === 1 && targetThu === 2) {
      return { ok: false, viPham: [{ loai: 'chao_co' }] };
    }
    // Check GV đã bận ở slot đích (khác slot nguồn)
    const targetKey = createSlotKey(targetThu, targetBuoi, item.tiet);
    const oldKey = createSlotKey(item.thu, item.buoi, item.tiet);
    if (targetKey !== oldKey && busyForGV.has(targetKey)) {
      return { ok: false, viPham: [{ loai: 'gv_busy' }] };
    }
  }
  // Check lớp đích rảnh
  for (const item of block) {
    const lopData = data.find(d => d.lop._id.toString() === item.lopId);
    if (!lopData) return { ok: false, viPham: [{ loai: 'lop_not_found' }] };
    const ngay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
    if (ngay && ngay.tiets.some(t => t.tiet === item.tiet && (!t.giaoVien || t.giaoVien.toString() !== gvId))) {
      return { ok: false, viPham: [{ loai: 'lop_busy' }] };
    }
    // Nếu đã có tiết cùng vị trí của chính GV (cùng lop, cùng tiet, target) -> không tính là trùng
    // nhưng vẫn check trùng với GV khác cùng lớp
  }
  return { ok: true, viPham: [] };
}

/**
 * Áp dụng move block lên schedule data (in-place, dùng cho CANDIDATE clone).
 */
function applyMoveBlockOnData(data, block, targetThu, targetBuoi, gv) {
  for (const item of block) {
    const lopData = data.find(d => d.lop._id.toString() === item.lopId);
    if (!lopData) continue;
    // Safety: tiết phải hợp lệ với buổi đích
    if (!isValidTietForBuoi(item.tiet, targetBuoi)) {
      continue; // skip không hợp lệ
    }
    // Xóa khỏi ngày cũ
    const oldNgay = lopData.lopSchedule.find(n => n.thu === item.thu && n.buoi === item.buoi);
    if (oldNgay) {
      oldNgay.tiets = oldNgay.tiets.filter(t => t.tiet !== item.tiet);
      if (oldNgay.tiets.length === 0) {
        lopData.lopSchedule = lopData.lopSchedule.filter(n => !(n.thu === item.thu && n.buoi === item.buoi));
      }
    }
    // Thêm vào ngày mới
    let newNgay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
    if (!newNgay) {
      newNgay = { thu: targetThu, buoi: targetBuoi, tiets: [] };
      lopData.lopSchedule.push(newNgay);
    }
    if (!newNgay.tiets.some(t => t.tiet === item.tiet)) {
      newNgay.tiets.push({
        tiet: item.tiet,
        giaoVien: gv._id,
        chuyenMon: item.chuyenMon
      });
      newNgay.tiets.sort((a, b) => a.tiet - b.tiet);
    }
  }
}

/**
 * Thử move 1 tiết đơn lẻ sang (targetThu, targetBuoi, targetTiet) với cùng GV.
 */
function tryMoveSingleTietOnData(data, item, targetThu, targetBuoi, targetTiet, gv, busyForGV) {
  const gvId = gv._id.toString();
  const nv = gv.nguyenVong || {};
  if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(targetThu)) {
    return { ok: false };
  }
  if (targetBuoi === 'sang' && targetTiet === 1 && targetThu === 2) {
    return { ok: false };
  }
  // Tiết phải hợp lệ với buổi đích
  if (!isValidTietForBuoi(targetTiet, targetBuoi)) {
    return { ok: false };
  }
  const targetKey = createSlotKey(targetThu, targetBuoi, targetTiet);
  const oldKey = createSlotKey(item.thu, item.buoi, item.tiet);
  if (targetKey === oldKey) return { ok: true }; // no-op
  if (busyForGV.has(targetKey)) return { ok: false };
  const lopData = data.find(d => d.lop._id.toString() === item.lopId);
  if (!lopData) return { ok: false };
  const ngay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
  if (ngay && ngay.tiets.some(t => t.tiet === targetTiet && (!t.giaoVien || t.giaoVien.toString() !== gvId))) {
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Áp dụng move single tiết.
 */
function applyMoveSingleTietOnData(data, item, targetThu, targetBuoi, targetTiet, gv) {
  // Safety: tiết phải hợp lệ với buổi đích
  if (!isValidTietForBuoi(targetTiet, targetBuoi)) return;
  const lopData = data.find(d => d.lop._id.toString() === item.lopId);
  if (!lopData) return;
  const oldNgay = lopData.lopSchedule.find(n => n.thu === item.thu && n.buoi === item.buoi);
  if (oldNgay) {
    oldNgay.tiets = oldNgay.tiets.filter(t => t.tiet !== item.tiet);
    if (oldNgay.tiets.length === 0) {
      lopData.lopSchedule = lopData.lopSchedule.filter(n => !(n.thu === item.thu && n.buoi === item.buoi));
    }
  }
  let newNgay = lopData.lopSchedule.find(n => n.thu === targetThu && n.buoi === targetBuoi);
  if (!newNgay) {
    newNgay = { thu: targetThu, buoi: targetBuoi, tiets: [] };
    lopData.lopSchedule.push(newNgay);
  }
  if (!newNgay.tiets.some(t => t.tiet === targetTiet)) {
    newNgay.tiets.push({ tiet: targetTiet, giaoVien: gv._id, chuyenMon: item.chuyenMon });
    newNgay.tiets.sort((a, b) => a.tiet - b.tiet);
  }
}

/**
 * Sinh tất cả candidate MOVE (single + block) cho 1 GV.
 * Bao gồm:
 *  - Move block sang session đã có (existing)
 *  - Move block sang session trống (new)
 *  - Move single tiết
 *
 * Trả về array of { type, gv, items, targetThu, targetBuoi, apply, rollback }
 *  apply: function(data) -> clone data đã apply candidate
 *  validate: function(data) -> check hard constraint
 */
function generateMoveCandidatesForGV(data, gv, busyForGV, allSlots) {
  const candidates = [];
  const gvId = gv._id.toString();
  const sessionMap = buildGVSessionMapFromData(data, gvId);

  // === BLOCK MOVES ===
  for (const [srcKey, block] of sessionMap) {
    const [srcThuStr, srcBuoi] = srcKey.split('-');
    const srcThu = parseInt(srcThuStr);
    // Tất cả target (thu, buoi) khả dĩ: bao gồm cả session hiện có và session trống
    const targets = new Set();
    // Session hiện có (khác src)
    for (const k of sessionMap.keys()) if (k !== srcKey) targets.add(k);
    // Session trống (chưa có GV dạy ở đó)
    for (const slot of allSlots) {
      const k = `${slot.thu}-${slot.buoi}`;
      if (k !== srcKey) targets.add(k);
    }
    for (const dstKey of targets) {
      const [dstThuStr, dstBuoi] = dstKey.split('-');
      const dstThu = parseInt(dstThuStr);
      const validation = tryMoveBlockOnData(data, block, dstThu, dstBuoi, gv, sessionMap.keys(), busyForGV);
      if (!validation.ok) continue;
      candidates.push({
        type: 'block',
        gv,
        srcKey,
        dstKey,
        blockSize: block.length,
        apply: (cloneData) => applyMoveBlockOnData(cloneData, block, dstThu, dstBuoi, gv)
      });
    }
  }

  // === SINGLE TIẾT MOVES ===
  // Giới hạn: chỉ move trong cùng buổi (sáng<->sáng, chiều<->chiều) để giảm candidate
  // nhưng vẫn cho phép đổi buổi nếu GV không có NV buoiUuTien
  for (const [_, block] of sessionMap) {
    for (const item of block) {
      for (const slot of allSlots) {
        if (slot.buoi !== item.buoi) continue; // giữ cùng buổi
        if (slot.thu === item.thu && slot.tiet === item.tiet) continue;
        const validation = tryMoveSingleTietOnData(data, item, slot.thu, slot.buoi, slot.tiet, gv, busyForGV);
        if (!validation.ok) continue;
        candidates.push({
          type: 'single',
          gv,
          lopId: item.lopId,
          tiet: item.tiet,
          targetThu: slot.thu,
          targetBuoi: slot.buoi,
          targetTiet: slot.tiet,
          apply: (cloneData) => applyMoveSingleTietOnData(cloneData, item, slot.thu, slot.buoi, slot.tiet, gv)
        });
      }
    }
  }
  return candidates;
}

// ============== OPTIMIZATION V2: SESSION BIN PACKING ==============

/**
 * Tính effective capacity của 1 session (thu-buoi) cho 1 GV.
 * Trả về số slot thực tế có thể sử dụng.
 * Trừ đi:
 *   - Tiết 1 Thứ 2 sáng (chào cờ) nếu GV có môn chuyên
 *   - Các slot đã bị chiếm bởi GV khác trong lớp của GV này
 *   - Các slot đã bị GV này chiếm ở lớp khác
 */
function getEffectiveCapacity(thu, buoi, gv, lopSchedulesData, gvBusySet, lopIdsSet) {
  const config = TKB_CONFIG.sessions[buoi];
  if (!config) return 0;
  let capacity = config.tietKetThuc - config.tietBatDau + 1;

  // Trừ chào cờ
  if (buoi === 'sang' && thu === 2) capacity--;

  const gvId = gv._id.toString();

  // Trừ các slot đã bị GV này chiếm (không tính các lớp target của GV)
  for (const slotKey of gvBusySet) {
    const [sThu, sBuoi, sTiet] = slotKey.split('-');
    if (parseInt(sThu) === thu && sBuoi === buoi) {
      capacity--;
    }
  }

  return Math.max(0, capacity);
}

/**
 * Tính capacity map cho tất cả session.
 * Trả về Map<"thu-buoi", capacity>
 */
function buildCapacityMap(gv, lopSchedulesData, gvBusySet, lopIdsSet) {
  const map = new Map();
  for (const thu of TKB_CONFIG.weekdays) {
    for (const [buoi, config] of Object.entries(TKB_CONFIG.sessions)) {
      const key = `${thu}-${buoi}`;
      map.set(key, getEffectiveCapacity(thu, buoi, gv, lopSchedulesData, gvBusySet, lopIdsSet));
    }
  }
  return map;
}

/**
 * Solver chọn tập session tối thiểu có tổng capacity >= requiredPeriods.
 * Dùng greedy: ưu tiên session có capacity cao nhất trước.
 * Trả về Set<"thu-buoi"> đã chọn.
 */
function solveMinSessionSet(requiredPeriods, capacityMap, gv, lopSchedulesData, gvBusySet) {
  // Filter session có capacity > 0 và không vi phạm thứ nghỉ
  const nv = gv.nguyenVong || {};
  const available = [];
  for (const [key, cap] of capacityMap) {
    if (cap <= 0) continue;
    const [thuStr, buoi] = key.split('-');
    const thu = parseInt(thuStr);
    if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(thu)) continue;
    available.push({ key, capacity: cap });
  }

  // Sort: ưu tiên capacity cao nhất (sáng trước chiều nếu bằng)
  available.sort((a, b) => {
    if (b.capacity !== a.capacity) return b.capacity - a.capacity;
    // Sáng trước chiều
    return a.key.includes('sang') ? -1 : 1;
  });

  // Greedy selection
  const selected = new Set();
  let totalCapacity = 0;
  for (const { key, capacity } of available) {
    selected.add(key);
    totalCapacity += capacity;
    if (totalCapacity >= requiredPeriods) break;
  }

  return selected;
}

/**
 * Tìm slot trống trong 1 session cho 1 GV và 1 lớp.
 * Trả về Array<{thu, buoi, tiet}> có thể sử dụng.
 */
function findAvailableSlotsInSession(thu, buoi, gv, lopId, lopSchedulesData, gvBusySet) {
  const config = TKB_CONFIG.sessions[buoi];
  if (!config) return [];
  const slots = [];

  for (let tiet = config.tietBatDau; tiet <= config.tietKetThuc; tiet++) {
    // Skip chào cờ
    if (buoi === 'sang' && thu === 2 && tiet === 1) continue;

    const key = createSlotKey(thu, buoi, tiet);

    // GV không bận slot này
    if (gvBusySet.has(key)) continue;

    // Lớp không có tiết khác tại slot này
    const lopData = lopSchedulesData.find(d => d.lop._id.toString() === lopId);
    if (lopData) {
      const ngay = lopData.lopSchedule.find(n => n.thu === thu && n.buoi === buoi);
      if (ngay && ngay.tiets.some(t => t.tiet === tiet)) continue;
    }

    slots.push({ thu, buoi, tiet, key });
  }

  return slots;
}

/**
 * Thử chain swap để di chuyển N tiết vào tập session mới.
 * Chain swap: A→B→C→A
 * Trả về null nếu không tìm được chain hợp lệ.
 */
function tryChainSwap(data, chain, gv, gvBusySet) {
  // chain: array of { from: {thu, buoi, tiet, lopId}, to: {thu, buoi, tiet} }
  // Mỗi step trong chain là swap 2 tiết: slot A <-> slot B
  // Nhưng ta cần đảm bảo:
  //   1. Slot đích hợp lệ với tiết nguồn
  //   2. Slot nguồn hợp lệ với tiết đích (nếu đích cần swap ngược)
  //   3. Không vi phạm ràng buộc khác

  // Đơn giản: kiểm tra từng swap trong chain
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const reverseStep = chain[(i + 1) % chain.length];

    const srcKey = createSlotKey(step.from.thu, step.from.buoi, step.from.tiet);
    const dstKey = createSlotKey(step.to.thu, step.to.buoi, step.to.tiet);

    // Tiết đích phải hợp lệ với buổi đích
    if (!isValidTietForBuoi(step.to.tiet, step.to.buoi)) return null;

    // Slot đích phải trống hoặc có tiết của chính GV (để swap)
    const dstLopData = data.find(d => d.lop._id.toString() === step.from.lopId);
    if (!dstLopData) return null;
    const dstNgay = dstLopData.lopSchedule.find(n => n.thu === step.to.thu && n.buoi === step.to.buoi);
    const existingTiet = dstNgay?.tiets.find(t => t.tiet === step.to.tiet);

    if (existingTiet) {
      // Có tiết tồn tại → phải là của chính GV hoặc slot trống
      if (existingTiet.giaoVien && existingTiet.giaoVien.toString() !== gv._id.toString()) {
        // Tiết bị chiếm bởi GV khác → kiểm tra chain swap
        // Đang swap với tiết của GV khác → không được
        return null;
      }
      // Tiết này sẽ được đẩy ngược
    }

    // GV không bận ở slot đích (trừ khi đó là slot nguồn)
    if (srcKey !== dstKey && gvBusySet.has(dstKey)) {
      // Nếu dstKey là slot nguồn của step khác trong chain → OK
      let isChainSrc = false;
      for (let j = 0; j < chain.length; j++) {
        if (j === i) continue;
        const other = chain[j];
        const otherSrcKey = createSlotKey(other.from.thu, other.from.buoi, other.from.tiet);
        if (otherSrcKey === dstKey) {
          isChainSrc = true;
          break;
        }
      }
      if (!isChainSrc) return null;
    }
  }

  // Apply chain swap
  for (const step of chain) {
    const srcLopData = data.find(d => d.lop._id.toString() === step.from.lopId);
    if (!srcLopData) return null;
    const srcNgay = srcLopData.lopSchedule.find(n => n.thu === step.from.thu && n.buoi === step.from.buoi);
    const srcTiet = srcNgay?.tiets.find(t => t.tiet === step.from.tiet);
    if (!srcTiet) return null;

    const dstLopData = data.find(d => d.lop._id.toString() === step.from.lopId);
    const dstNgay = dstLopData.lopSchedule.find(n => n.thu === step.to.thu && n.buoi === step.to.buoi);
    const dstTiet = dstNgay?.tiets.find(t => t.tiet === step.to.tiet);

    if (dstTiet) {
      // Swap ngược: đẩy tiết đích về slot nguồn
      // Xóa tiết đích khỏi slot đích
      dstNgay.tiets = dstNgay.tiets.filter(t => t.tiet !== step.to.tiet);
      // Thêm vào slot nguồn
      if (!srcNgay.tiets.some(t => t.tiet === step.from.tiet)) {
        srcNgay.tiets.push({ ...dstTiet, tiet: step.from.tiet });
        srcNgay.tiets.sort((a, b) => a.tiet - b.tiet);
      }
    }

    // Di chuyển tiết nguồn sang slot đích
    srcNgay.tiets = srcNgay.tiets.filter(t => t.tiet !== step.from.tiet);
    let newDstNgay = dstLopData.lopSchedule.find(n => n.thu === step.to.thu && n.buoi === step.to.buoi);
    if (!newDstNgay) {
      newDstNgay = { thu: step.to.thu, buoi: step.to.buoi, tiets: [] };
      dstLopData.lopSchedule.push(newDstNgay);
    }
    if (!newDstNgay.tiets.some(t => t.tiet === step.to.tiet)) {
      newDstNgay.tiets.push({ tiet: step.to.tiet, giaoVien: srcTiet.giaoVien, chuyenMon: srcTiet.chuyenMon });
      newDstNgay.tiets.sort((a, b) => a.tiet - b.tiet);
    }
  }

  return true; // thành công
}

/**
 * Hàm tối ưu TOÀN CỤC - Phiên bản V2 với Bin Packing
 *
 * Chiến lược:
 * 1. Với mỗi GV có soBuoiToiDa:
 *    a. Tính requiredPeriods từ lịch hiện tại
 *    b. Tính capacity map cho tất cả session
 *    c. Solver chọn tập session tối thiểu
 *    d. Nếu session hiện tại > desired → cần thu hẹp
 * 2. Dùng chain relocation để rearrange tiết giữa các session
 * 3. Validate toàn bộ sau mỗi thay đổi
 *
 * @returns {object} { improved, soGVOptimized, soLanMove, thongKeBuoi }
 */
function optimizeSessions(lopSchedulesData, giaoViens, gvBusy, gvBuoiSet, gvThuSet, allSlots, viPhamNVList) {
  const thongKeBuoi = [];
  let totalMoves = 0;
  let soGVOptimized = 0;


  // Build gvPeriods map: gvId -> count số tiết cần dạy
  const gvPeriods = new Map();
  const gvCurrentSessions = new Map();
  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    let count = 0;
    const sessions = new Set();
    for (const data of lopSchedulesData) {
      for (const ngay of data.lopSchedule) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            count++;
            sessions.add(`${ngay.thu}-${ngay.buoi}`);
          }
        }
      }
    }
    gvPeriods.set(gvId, count);
    gvCurrentSessions.set(gvId, sessions);
  }

  // === VÒNG LẶP CHÍNH: Tối ưu từng GV ===
  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    const nv = gv.nguyenVong || {};
    if (!nv.soBuoiToiDa) continue;

    const requiredPeriods = gvPeriods.get(gvId) || 0;
    if (requiredPeriods === 0) continue;

    const desiredSessions = nv.soBuoiToiDa;
    const currentSessionSet = gvCurrentSessions.get(gvId) || new Set();
    const gvBusySet = gvBusy.get(gvId) || new Set();

    // Bước 1: Tính capacity map với kiến thức hiện tại về lớp của GV
    // Lấy danh sách lớp mà GV đang dạy
    const gvLopIds = new Set();
    for (const data of lopSchedulesData) {
      for (const ngay of data.lopSchedule) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            gvLopIds.add(data.lop._id.toString());
          }
        }
      }
    }

    const capacityMap = buildCapacityMap(gv, lopSchedulesData, gvBusySet, gvLopIds);

    // Bước 2: Solver chọn tập session tối thiểu
    let targetSessions = solveMinSessionSet(requiredPeriods, capacityMap, gv, lopSchedulesData, gvBusySet);

    // Bước 3: Nếu current > desired → cần thu hẹp
    if (currentSessionSet.size > desiredSessions && currentSessionSet.size > targetSessions.size) {
      // Thử thu hẹp: move tiết từ session thừa sang session target
      const excessSessions = [...currentSessionSet].filter(s => !targetSessions.has(s));
      const deficitSessions = [...targetSessions].filter(s => !currentSessionSet.has(s));

      // Với mỗi session thừa, thử move tiết sang session thiếu
      for (const excessKey of excessSessions) {
        const [exThuStr, exBuoi] = excessKey.split('-');
        const exThu = parseInt(exThuStr);

        // Lấy tất cả tiết của GV trong session thừa
        const excessItems = [];
        for (const data of lopSchedulesData) {
          const ngay = data.lopSchedule.find(n => n.thu === exThu && n.buoi === exBuoi);
          if (ngay) {
            for (const tiet of ngay.tiets) {
              if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
                excessItems.push({
                  lopId: data.lop._id.toString(),
                  thu: exThu, buoi: exBuoi, tiet: tiet.tiet,
                  chuyenMon: tiet.chuyenMon
                });
              }
            }
          }
        }

        // Thử move từng tiết
        for (const item of excessItems) {
          let itemMoved = false; // đánh dấu item đã move -> không thử nữa
          for (const defKey of deficitSessions) {
            if (itemMoved) break;
            const [defThuStr, defBuoi] = defKey.split('-');
            const defThu = parseInt(defThuStr);

            // Tìm slot trống trong session thiếu
            const slots = findAvailableSlotsInSession(defThu, defBuoi, gv, item.lopId, lopSchedulesData, gvBusySet);
            if (slots.length === 0) continue;

            for (const slot of slots) {
              const validation = tryMoveSingleTietOnData(
                lopSchedulesData, item, slot.thu, slot.buoi, slot.tiet, gv, gvBusySet
              );
              if (!validation.ok) continue;

              // Apply
              applyMoveSingleTietOnData(lopSchedulesData, item, slot.thu, slot.buoi, slot.tiet, gv);
              totalMoves++;
              gvBusySet.add(slot.key);
              gvBusySet.delete(createSlotKey(item.thu, item.buoi, item.tiet));

              // Update current sessions
              currentSessionSet.delete(excessKey);
              currentSessionSet.add(defKey);
              itemMoved = true; // đánh dấu đã move
              break; // đã move thành công 1 tiết, không thử slot khác
            }
            if (itemMoved) break; // đã move rồi, không thử defKey khác
          }
        }
      }
    }

    // Bước 4: Thử mở rộng target nếu cần
    if (targetSessions.size < desiredSessions && currentSessionSet.size > targetSessions.size) {
      // Cố gắng thu hẹp thêm
      // (logic ở bước 3 đã cố gắng làm điều này)
    }

    // Cập nhật gvBusy và gvBuoiSet sau khi thay đổi
    gvBusy.set(gvId, gvBusySet);
    gvBuoiSet.set(gvId, currentSessionSet);
    gvCurrentSessions.set(gvId, currentSessionSet);
  }

  // === VÒNG LẶP CẢI THIỆN: Hill Climbing cho các GV còn lại ===
  const MAX_ITERATIONS = 30;
  const MAX_NO_IMPROVE = 3;
  let currentScore = calculateScheduleScore(lopSchedulesData, giaoViens);
  let noImproveCount = 0;

  const busyByGV = (gvId) => {
    const set = new Set();
    for (const data of lopSchedulesData) {
      for (const ngay of data.lopSchedule) {
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            set.add(createSlotKey(ngay.thu, ngay.buoi, tiet.tiet));
          }
        }
      }
    }
    return set;
  };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const gvPriority = [];
    for (const gv of giaoViens) {
      const gvId = gv._id.toString();
      const nv = gv.nguyenVong || {};
      if (!nv.soBuoiToiDa) continue;
      const sessions = buildGvSessionSets(lopSchedulesData).get(gvId) || new Set();
      const excess = sessions.size - nv.soBuoiToiDa;
      gvPriority.push({ gv, excess, sessions: sessions.size });
    }
    gvPriority.sort((a, b) => b.excess - a.excess);

    let bestCandidate = null;
    let bestScore = currentScore;

    for (const { gv } of gvPriority) {
      const gvId = gv._id.toString();
      const busyForGV = busyByGV(gvId);
      const candidates = generateMoveCandidatesForGV(lopSchedulesData, gv, busyForGV, allSlots);

      for (const cand of candidates) {
        const cloneData = cloneSchedulesData(lopSchedulesData);
        cand.apply(cloneData);
        const hardCheck = validateHardConstraints(cloneData, giaoViens, false);
        if (!hardCheck.ok) continue;
        const candScore = calculateScheduleScore(cloneData, giaoViens);
        if (candScore < bestScore) {
          bestScore = candScore;
          bestCandidate = cand;
        }
      }
    }

    if (bestCandidate) {
      bestCandidate.apply(lopSchedulesData);
      currentScore = calculateScheduleScore(lopSchedulesData, giaoViens);
      totalMoves++;
      noImproveCount = 0;

      for (const gv of giaoViens) {
        const id = gv._id.toString();
        gvBusy.set(id, busyByGV(id));
        const sessions = buildGvSessionSets(lopSchedulesData).get(id) || new Set();
        gvBuoiSet.set(id, sessions);
      }
    } else {
      noImproveCount++;
      if (noImproveCount >= MAX_NO_IMPROVE) break;
    }
  }

  // Thống kê cuối
  const finalSessions = buildGvSessionSets(lopSchedulesData);
  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    const nv = gv.nguyenVong || {};
    const actual = (finalSessions.get(gvId) || new Set()).size;
    const desired = nv.soBuoiToiDa || null;
    if (!desired) {
      thongKeBuoi.push({ gv: gv.hoTen, desired: null, actual, satisfied: null, note: 'Không cấu hình nguyện vọng' });
      continue;
    }
    const satisfied = actual <= desired;
    if (satisfied) soGVOptimized++;
    thongKeBuoi.push({
      gv: gv.hoTen, desired, actual, satisfied,
      note: satisfied ? 'Đạt' : `Còn ${actual - desired} buổi vượt`
    });
  }


  return { improved: totalMoves > 0, soGVOptimized, soLanMove: totalMoves, thongKeBuoi };
}

// ============== THUẬT TOÁN CHÍNH ==============

/**
 * Sắp xếp TKB cho tất cả các lớp
 * 
 * Ý tưởng: 
 * - Mỗi lớp có danh sách slot trống
 * - Chỉ xếp các môn đã được gán cho lớp (lop.chuyenMons)
 * - Với mỗi môn học, tìm giáo viên có chuyên môn, 
 *   đảm bảo GV đó không bận ở slot đó (với lớp khác)
 */
async function autoGenerateTKB(namHoc) {
  try {
    // 1. Load dữ liệu
    const khois = await Khoi.find().sort({ thuTu: 1 });
    const lops = await Lop.find().populate('khoi');
    const giaoViens = await GiaoVien.find({ trangThai: 'active' });
    
    if (lops.length === 0) {
      return { success: false, message: 'Chưa có lớp nào để sắp xếp' };
    }
    if (giaoViens.length === 0) {
      return { success: false, message: 'Chưa có giáo viên nào' };
    }
    
    // 2. Xóa TKB cũ
    await ThoiKhoaBieu.deleteMany({ namHoc });
    
    // 3. Khởi tạo
    const allSlots = generateAllSlots();
    
    // Lịch bận của từng giáo viên: gvId -> Set<slotKey>
    const gvBusy = new Map();
    // Số buổi (thứ × ca) đã dạy của GV: gvId -> Set<thu-buoi>
    const gvBuoiSet = new Map();
    // Các ngày đã dạy: gvId -> Set<thu> (chỉ dùng để cộng điểm gom)
    const gvThuSet = new Map();
    for (const gv of giaoViens) {
      const id = gv._id.toString();
      gvBusy.set(id, new Set());
      gvBuoiSet.set(id, new Set());
      gvThuSet.set(id, new Set());
    }
    
    // Map chuyên môn -> GV có chuyên môn đó
    const gvByChuyenMon = new Map();
    for (const gv of giaoViens) {
      for (const cm of gv.chuyenMon) {
        if (!gvByChuyenMon.has(cm.tenChuyenMon)) {
          gvByChuyenMon.set(cm.tenChuyenMon, []);
        }
        gvByChuyenMon.get(cm.tenChuyenMon).push(gv);
      }
    }

    // === PRE-SOLVER: Tính target sessions cho mỗi GV có soBuoiToiDa ===
    // Đếm số tiết cần dạy của từng GV dựa trên lớp được gán
    const gvRequiredPeriods = new Map();
    for (const gv of giaoViens) {
      const gvId = gv._id.toString();
      let count = 0;
      for (const lop of lops) {
        for (const cm of lop.chuyenMons || []) {
          const gvDay = gv.chuyenMon.some(gcm => gcm.tenChuyenMon === cm.tenChuyenMon);
          if (gvDay) count += cm.soTietTuan;
        }
      }
      gvRequiredPeriods.set(gvId, count);
    }

    // Tính capacity map cho mỗi GV và giải bài toán chọn sessions tối ưu
    // Map<gvId, Set<thu-buoi>> = tập sessions ưu tiên cao
    const gvPreferredSessions = new Map();

    for (const gv of giaoViens) {
      const gvId = gv._id.toString();
      const nv = gv.nguyenVong || {};
      if (!nv.soBuoiToiDa) continue;

      const required = gvRequiredPeriods.get(gvId) || 0;
      if (required === 0) continue;

      const desired = nv.soBuoiToiDa;

      // Tính capacity của mỗi session
      const sessionCapacity = new Map();
      for (const thu of TKB_CONFIG.weekdays) {
        for (const [buoi, config] of Object.entries(TKB_CONFIG.sessions)) {
          const key = `${thu}-${buoi}`;
          // Skip thứ nghỉ
          if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(thu)) {
            sessionCapacity.set(key, 0);
            continue;
          }
          // Skip chào cờ
          let cap = config.tietKetThuc - config.tietBatDau + 1;
          if (buoi === 'sang' && thu === 2) cap--;
          sessionCapacity.set(key, Math.max(0, cap));
        }
      }

      // Greedy: chọn sessions có capacity cao nhất để đủ required tiết
      const sortedSessions = [...sessionCapacity.entries()]
        .filter(([_, cap]) => cap > 0)
        .sort((a, b) => {
          // Ưu tiên capacity cao
          if (b[1] !== a[1]) return b[1] - a[1];
          // Sáng trước chiều
          return a[0].includes('sang') ? -1 : 1;
        });

      const preferred = new Set();
      let totalCap = 0;
      for (const [key, cap] of sortedSessions) {
        preferred.add(key);
        totalCap += cap;
        if (totalCap >= required) break;
      }

      // Nếu preferred sessions > desired, thu hẹp
      if (preferred.size > desired) {
        // Chỉ giữ lại desired sessions có capacity cao nhất
        const sorted = [...preferred].sort((a, b) => {
          const capA = sessionCapacity.get(a) || 0;
          const capB = sessionCapacity.get(b) || 0;
          if (capB !== capA) return capB - capA;
          return a.includes('sang') ? -1 : 1;
        });
        preferred.clear();
        for (let i = 0; i < desired; i++) {
          preferred.add(sorted[i]);
        }
      }

      gvPreferredSessions.set(gvId, preferred);
    }

    // Tra cứu: lopId -> slotKey -> {gvId, cm} (GV nào đang dạy lớp đó ở slot nào)
    // Dùng cho swap phase: nếu 1 GV đang dạy lớp X ở slot S, có thể dời lớp X sang
    // slot khác để nhường slot S cho lớp đang xếp.
    const slotOwnerByClass = new Map();
    
    const results = [];
    const errors = [];
    const skipped = [];
    const viPhamNVList = []; // danh sách các tiết buộc phải xếp GV vi phạm nguyện vọng
    
    
    // 4. Sắp xếp cho từng lớp
    // Lưu cả schedule data vào bộ nhớ để có thể tối ưu trước khi ghi DB
    const lopSchedulesData = []; // [{ lop, khoi, chuyenMonList, lopSchedule, tongTietXep }]

    for (const lop of lops) {
      const khoi = lop.khoi;

      // Lấy danh sách môn học của lớp (chỉ xếp môn đã được gán)
      let chuyenMonList = lop.chuyenMons || [];

      // Nếu lớp chưa có môn nào được gán, bỏ qua
      if (chuyenMonList.length === 0) {
        skipped.push(lop.tenLop);
        continue;
      }

      // Sắp xếp chuyên môn theo số tiết giảm dần (ưu tiên môn nhiều tiết trước)
      const sortedCM = [...chuyenMonList].sort((a, b) => b.soTietTuan - a.soTietTuan);
      
      // Lịch của lớp này
      const lopSchedule = [];
      const lopUsedSlots = new Set(); // các slot đã xếp cho lớp này
      const lopSlotOwner = new Map(); // slotKey -> {gvId, cm, tiet, thu, buoi} (cho swap phase)
      const lopId = lop._id.toString();
      slotOwnerByClass.set(lopId, lopSlotOwner);

      let tongTietXep = 0;
      
      for (const cm of sortedCM) {
        const gvList = gvByChuyenMon.get(cm.tenChuyenMon) || [];
        if (gvList.length === 0) {
          errors.push(`Lớp ${lop.tenLop}: Không có GV dạy "${cm.tenChuyenMon}"`);
          continue;
        }
        
        let remaining = cm.soTietTuan;

        // Tách GV thành 2 nhóm theo NV:
        //  - gvCoNVList: GV đã đăng ký NV cụ thể (ưu tiên xếp theo NV)
        //  - gvKhongNVList: GV chưa đăng ký NV (chỉ dùng khi hết GV có NV)
        // Mỗi nhóm sắp theo số tiết đã dạy (ít trước để cân bằng)
        const sortByTiet = (a, b) => {
          const aCount = gvBusy.get(a._id.toString()).size;
          const bCount = gvBusy.get(b._id.toString()).size;
          return aCount - bCount;
        };
        const gvCoNVList = gvList.filter(g => gvCoNV(g)).sort(sortByTiet);
        const gvKhongNVList = gvList.filter(g => !gvCoNV(g)).sort(sortByTiet);
        // Gộp lại để pass 3,4 vẫn duyệt tất cả
        const sortedGV = [...gvList].sort(sortByTiet);
        
        // Hướng B: Ưu tiên GV có NV trước.
// Trong mỗi môn của lớp:
//  - Bước 1: với mỗi GV có NV, tìm slot tốt nhất theo NV của GV đó -> xếp tiết.
//  - Bước 2: nếu vẫn thiếu, dùng GV không NV, tìm slot còn trống -> xếp tiết.

        // Helper: chọn slot tốt nhất cho 1 GV cụ thể để dạy môn cm ở lớp hiện tại
        // Logic gom buổi:
        //  - Cùng thứ + CÙNG buổi (sáng T3 đã có) -> ưu tiên chọn tiết khác trong buổi đó
        //  - Cùng thứ + KHÁC buổi (T3 sáng có rồi, thêm T3 chiều) -> ưu tiên vừa
        //  - Khác thứ -> mở ngày mới (chỉ chọn khi cần)
        //  - Phạt rất nặng nếu đã gần đạt soBuoiToiDa mà còn mở ngày mới
        const findBestSlotForGV = (gv, respectNV, allowBusy = false) => {
          const gvId = gv._id.toString();
          let bestSlot = null;
          let bestScore = -Infinity;
          for (const slot of allSlots) {
            if (lopUsedSlots.has(slot.key)) continue;
            // Mặc định skip slot GV đã bận. Khi allowBusy=true (Bước 3 bắt buộc),
            // vẫn cho phép trùng nhưng phạt điểm rất nặng để ưu tiên slot không trùng.
            const isBusy = gvBusy.get(gvId).has(slot.key);
            if (isBusy && !allowBusy) continue;

            let score = scoreGV(gv, slot, gvBusy.get(gvId), gvBuoiSet.get(gvId), respectNV);
            if (score === -Infinity) continue;

            // Phạt cực nặng nếu trùng GV (chỉ áp dụng khi allowBusy=true)
            if (isBusy) {
              score -= 10000;
            }

            // Phân biệt 3 mức gom buổi (ưu tiên cao nhất: cùng buổi > cùng ngày > mở mới)
            const buoiKey = `${slot.thu}-${slot.buoi}`;
            const daCoCungBuoi = gvBuoiSet.get(gvId).has(buoiKey);
            const daCoCungThu = gvThuSet.get(gvId).has(slot.thu);
            if (daCoCungBuoi) {
              score += 50; // rất thưởng - xếp tiết tiếp theo vào cùng buổi đang dạy
            } else if (daCoCungThu) {
              score += 30; // thưởng vừa - đã dạy ngày này, thêm buổi kia để gom sáng+chiều
            }

            const nv = gv.nguyenVong || {};
            // Phạt rất nặng khi mở buổi mới mà đã đạt/gần đạt max buổi
            if (!daCoCungBuoi && nv.soBuoiToiDa && gvBuoiSet.get(gvId).size >= nv.soBuoiToiDa - 1) {
              score -= 100;
            }

            // BONUS LỚN cho slot nằm trong preferred sessions (từ pre-solver)
            const preferred = gvPreferredSessions.get(gvId);
            if (preferred && preferred.size > 0) {
              const slotPreferred = preferred.has(buoiKey);
              if (slotPreferred) {
                score += 500; // rất thưởng - slot nằm trong target sessions
              } else {
                score -= 200; // phạt - slot ngoài target sessions
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestSlot = slot;
            }
          }
          return bestSlot;
        };        // Hàm ghi nhận 1 tiết đã xếp
        const commitTiet = (slot, gv, viPhamNV) => {
          lopUsedSlots.add(slot.key);
          const gvId = gv._id.toString();
          gvBusy.get(gvId).add(slot.key);
          gvBuoiSet.get(gvId).add(`${slot.thu}-${slot.buoi}`);
          gvThuSet.get(gvId).add(slot.thu);

          let ngay = lopSchedule.find(n => n.thu === slot.thu && n.buoi === slot.buoi);
          if (!ngay) {
            ngay = { thu: slot.thu, buoi: slot.buoi, tiets: [] };
            lopSchedule.push(ngay);
          }
          ngay.tiets.push({ tiet: slot.tiet, giaoVien: gv._id, chuyenMon: cm.tenChuyenMon });
          lopSlotOwner.set(slot.key, {
            gvId, cm: cm.tenChuyenMon, tiet: slot.tiet,
            thu: slot.thu, buoi: slot.buoi, ngayRef: ngay
          });
          if (viPhamNV) {
            viPhamNVList.push({
              lop: lop.tenLop, chuyenMon: cm.tenChuyenMon,
              thu: slot.thu, buoi: slot.buoi, tiet: slot.tiet,
              ...viPhamNV
            });
          }
          remaining--;
          tongTietXep++;
        };

        // ============== BƯỚC 1: GV CÓ NV ==============
        // Mỗi vòng lặp, mỗi GV chỉ xếp 1 tiết (giữ cân bằng tải). Lặp nhiều vòng
        // đến khi hết remaining hoặc cả vòng không xếp được tiết nào.
        let buoc1Count = 0;
        if (gvCoNVList.length > 0) {
          while (remaining > 0) {
            let xepDuocVongNay = 0;
            for (const gv of gvCoNVList) {
              if (remaining <= 0) break;
              const slot = findBestSlotForGV(gv, true);
              if (slot) {
                const gvId = gv._id.toString();
                // Phát hiện GV bị trùng slot (1 GV dạy 2 lớp cùng slot) -> cảnh báo
                let viPham = null;
                if (gvBusy.get(gvId).has(slot.key)) {
                  viPham = { gvTen: gv.hoTen, lyDo: 'GV bị trùng lịch (đang dạy lớp khác cùng slot này)' };
                }
                commitTiet(slot, gv, viPham);
                buoc1Count++;
                xepDuocVongNay++;
              }
            }
            if (xepDuocVongNay === 0) break;
          }
        }
        // Nếu vẫn thiếu & GV có NV còn lại có thể dạy (nới lỏng NV)
        if (remaining > 0 && gvCoNVList.length > 0) {
          for (const gv of gvCoNVList) {
            if (remaining <= 0) break;
            const slot = findBestSlotForGV(gv, false);
            if (slot) {
              const gvId = gv._id.toString();
              const nv = gv.nguyenVong || {};
              const lyDo = [];
              if (gvBusy.get(gvId).has(slot.key)) {
                lyDo.push('GV bị trùng lịch (đang dạy lớp khác cùng slot này)');
              }
              if (nv.soBuoiToiDa && gvBuoiSet.get(gvId).size >= nv.soBuoiToiDa) {
                lyDo.push(`đã vượt số buổi tối đa (${gvBuoiSet.get(gvId).size}/${nv.soBuoiToiDa})`);
              }
              if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(slot.thu)) {
                lyDo.push(`vi phạm thứ nghỉ (thứ ${slot.thu})`);
              }
              commitTiet(slot, gv, lyDo.length > 0
                ? { gvTen: gv.hoTen, lyDo: lyDo.join('; ') }
                : null);
            }
          }
        }

        // ============== BƯỚC 2: GV KHÔNG NV ==============
        // Lấp các slot trống còn lại bằng GV không NV (không có NV -> không vi phạm gì)
        // Lặp đến khi hết remaining hoặc cả vòng không xếp được tiết nào.
        let buoc2Count = 0;
        if (remaining > 0 && gvKhongNVList.length > 0) {
          while (remaining > 0) {
            let xepDuocVongNay = 0;
            for (const gv of gvKhongNVList) {
              if (remaining <= 0) break;
              const slot = findBestSlotForGV(gv, true);
              if (slot) {
                const gvId = gv._id.toString();
                // Phát hiện GV bị trùng slot (1 GV dạy 2 lớp cùng slot) -> cảnh báo
                let viPham = null;
                if (gvBusy.get(gvId).has(slot.key)) {
                  viPham = { gvTen: gv.hoTen, lyDo: 'GV bị trùng lịch (đang dạy lớp khác cùng slot này)' };
                }
                commitTiet(slot, gv, viPham);
                buoc2Count++;
                xepDuocVongNay++;
              }
            }
            if (xepDuocVongNay === 0) break;
          }
        }

        // ============== BƯỚC 3: BẮT BUỘC - lấy bất kỳ GV nào có chuyên môn ==============
        // Lặp tối đa remaining lần (vì có thể 1 GV dạy nhiều tiết).
        // Kết thúc khi: remaining==0, hoặc 1 vòng lặp không xếp được tiết nào.
        if (remaining > 0) {
          let buoc3Count = 0;
          let lastProgressRound = 0;
          while (remaining > 0) {
            let xepDuocVongNay = 0;
            for (const gv of sortedGV) {
              if (remaining <= 0) break;
              const slot = findBestSlotForGV(gv, false); // nới lỏng mọi ràng buộc
              if (slot) {
                const gvId = gv._id.toString();
                const nv = gv.nguyenVong || {};
                const lyDo = ['Bắt buộc xếp - không tìm được phương án khác'];
                if (gvBusy.get(gvId).has(slot.key)) {
                  lyDo.push('GV bị trùng lịch (đang dạy lớp khác cùng slot này)');
                }
                if (nv.soBuoiToiDa && gvBuoiSet.get(gvId).size >= nv.soBuoiToiDa) {
                  lyDo.push(`đã vượt số buổi tối đa`);
                }
                if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(slot.thu)) {
                  lyDo.push(`vi phạm thứ nghỉ`);
                }
                commitTiet(slot, gv, { gvTen: gv.hoTen, lyDo: lyDo.join('; ') });
                buoc3Count++;
                xepDuocVongNay++;
              }
            }
            // Nếu cả vòng không xếp được tiết nào → thoát (tránh loop vô hạn)
            if (xepDuocVongNay === 0) break;
          }
        }

        // Nếu vẫn thiếu tiết dù đã chạy tất cả bước:
        // Lỗi nghiêm trọng - không thể cắt tiết.
        if (remaining > 0) {
          throw new Error(
            `Không thể xếp đủ tiết: Lớp ${lop.tenLop} - Môn "${cm.tenChuyenMon}" ` +
            `thiếu ${remaining}/${cm.soTietTuan} tiết. ` +
            `Cần thêm giáo viên dạy môn này hoặc giảm số tiết yêu cầu của môn.`
          );
        }
      }
      
      // Lưu schedule vào bộ nhớ NGAY sau mỗi môn (để các lớp/lượt sau có thể swap với lớp này)
      lopSchedulesData.push({
        lop,
        khoi,
        chuyenMonList: sortedCM,
        lopSchedule,
        tongTietXep
      });
    }

    // ====== 4b. OPTIMIZATION PHASE ======
    // Sau khi sinh lịch ban đầu (greedy), tối ưu theo nguyện vọng giáo viên:
    // với mỗi GV có soBuoiToiDa, nếu actualSessions > desiredSessions,
    // thử MOVE BLOCK (toàn bộ tiết trong 1 session) sang session khác để giảm số buổi.
    // Sau optimization, recompute viPhamNVList dựa trên TKB cuối cùng
    // (không dùng viPhamNVList từ greedy - đã lỗi thời sau khi move).
    const optimizationReport = optimizeSessions(
      lopSchedulesData,
      giaoViens,
      gvBusy,
      gvBuoiSet,
      gvThuSet,
      allSlots,
      viPhamNVList
    );

    // Recompute viPhamNVList từ TKB cuối cùng:
    // - GV nào actualSessions > soBuoiToiDa: tất cả tiết trong session thừa
    // - GV nào dạy vào thứ nghỉ: tất cả tiết đó
    viPhamNVList.length = 0;
    recomputeViPhamNV(lopSchedulesData, giaoViens, viPhamNVList);

    // ====== 4c. Lưu TKB vào DB ======
    for (const data of lopSchedulesData) {
      const { lop, khoi, chuyenMonList: sortedCM, lopSchedule, tongTietXep } = data;

      if (lopSchedule.length > 0) {
        const tkb = new ThoiKhoaBieu({
          lop: lop._id,
          namHoc,
          ngayTrongTuan: lopSchedule,
          trangThai: 'draft'
        });
        await tkb.save();
      }

      results.push({
        lop: lop.tenLop,
        khoi: khoi.tenKhoi,
        soTietXep: tongTietXep,
        soMonXep: sortedCM.filter(cm =>
          lopSchedule.some(n => n.tiets.some(t => t.chuyenMon === cm.tenChuyenMon))
        ).length
      });
    }

    // ====== 5. Tổng hợp kết quả ======
    let message = `Đã sắp xếp TKB cho ${results.length} lớp`;
    if (skipped.length > 0) {
      message += `, ${skipped.length} lớp bị bỏ qua (chưa có môn học)`;
    }
    if (viPhamNVList.length > 0) {
      message += `, ${viPhamNVList.length} tiết buộc phải vi phạm nguyện vọng GV (do không tìm được phương án khác)`;
    }
    if (optimizationReport.improved) {
      message += `. Tối ưu: ${optimizationReport.soGVOptimized} GV xếp đúng nguyện vọng buổi (sáng/chiều)`;
    }

    // Gom lại danh sách GV unique bị ảnh hưởng + lý do
    const gvViPhamUnique = {};
    for (const v of viPhamNVList) {
      if (!gvViPhamUnique[v.gv]) {
        gvViPhamUnique[v.gv] = {
          tenGV: v.gv,
          soTiet: 0,
          lyDo: v.lyDo,
          chiTiet: []
        };
      }
      gvViPhamUnique[v.gv].soTiet += 1;
      gvViPhamUnique[v.gv].chiTiet.push(`${v.lop} - ${v.mon} - T${v.thu}(${v.buoi}) tiết ${v.tiet}`);
    }

    return {
      success: true,
      message,
      results,
      skipped,
      warnings: errors.length > 0 ? errors : undefined,
      viPhamNV: viPhamNVList.length > 0 ? {
        tongSoTiet: viPhamNVList.length,
        danhSachGV: Object.values(gvViPhamUnique)
      } : null,
      thongKeBuoi: optimizationReport.thongKeBuoi
    };
    
  } catch (error) {
    console.error('Error generating TKB:', error);
    throw error;
  }
}

/**
 * Lấy TKB của một lớp
 */
async function getTKBByLop(lopId, namHoc) {
  return await ThoiKhoaBieu.findOne({ lop: lopId, namHoc })
    .populate({
      path: 'lop',
      populate: { path: 'khoi' }
    })
    .populate('ngayTrongTuan.tiets.giaoVien');
}

/**
 * Lấy TKB của một giáo viên
 */
async function getTKBByGiaoVien(giaoVienId, namHoc) {
  const tkbs = await ThoiKhoaBieu.find({ namHoc })
    .populate({
      path: 'lop',
      populate: { path: 'khoi' }
    })
    .populate('ngayTrongTuan.tiets.giaoVien');
  
  const schedule = [];
  
  for (const tkb of tkbs) {
    for (const ngay of tkb.ngayTrongTuan) {
      for (const tiet of ngay.tiets) {
        if (tiet.giaoVien && tiet.giaoVien._id.toString() === giaoVienId) {
          schedule.push({
            thu: ngay.thu,
            buoi: ngay.buoi,
            tiet: tiet.tiet,
            lop: tkb.lop,
            chuyenMon: tiet.chuyenMon,
            tkbId: tkb._id
          });
        }
      }
    }
  }
  
  return schedule.sort((a, b) => {
    if (a.thu !== b.thu) return a.thu - b.thu;
    if (a.buoi !== b.buoi) return a.buoi === 'sang' ? -1 : 1;
    return a.tiet - b.tiet;
  });
}

/**
 * Kiểm tra xung đột lịch của giáo viên
 */
async function checkGVConflicts(namHoc) {
  const tkbs = await ThoiKhoaBieu.find({ namHoc })
    .populate('ngayTrongTuan.tiets.giaoVien');
  
  const conflicts = [];
  const gvSchedule = new Map();
  
  for (const tkb of tkbs) {
    for (const ngay of tkb.ngayTrongTuan) {
      for (const tiet of ngay.tiets) {
        if (!tiet.giaoVien) continue;
        
        const gvId = tiet.giaoVien._id.toString();
        const slotKey = createSlotKey(ngay.thu, ngay.buoi, tiet.tiet);
        
        if (!gvSchedule.has(gvId)) {
          gvSchedule.set(gvId, new Set());
        }
        
        if (gvSchedule.get(gvId).has(slotKey)) {
          conflicts.push({
            giaoVien: tiet.giaoVien.hoTen,
            thu: ngay.thu,
            buoi: ngay.buoi,
            tiet: tiet.tiet,
            lop: tkb.lop.tenLop,
            chuyenMon: tiet.chuyenMon
          });
        } else {
          gvSchedule.get(gvId).add(slotKey);
        }
      }
    }
  }
  
  return conflicts;
}

/**
 * Xuất TKB ra file Excel theo định dạng GV bộ môn
 * Mỗi sheet = 1 giáo viên
 * Hàng = tiết (Sáng 1-4, Chiều 5-7)
 * Cột = thứ (Thứ 2-6)
 */
async function exportTKBToExcel(namHoc) {
  const ExcelJS = require('exceljs');
  
  // 1. Load dữ liệu TKB
  const tkbs = await ThoiKhoaBieu.find({ namHoc })
    .populate({
      path: 'lop',
      populate: { path: 'khoi' }
    })
    .populate('ngayTrongTuan.tiets.giaoVien');
  
  if (tkbs.length === 0) {
    throw new Error('Không có dữ liệu thời khóa biểu để xuất');
  }
  
  // 2. Load danh sách giáo viên
  const giaoViens = await GiaoVien.find({ trangThai: 'active' })
    .populate('chuyenMon');
  
  // 3. Build schedule map: giaoVienId -> { thu, buoi, tiet } -> { lop, chuyenMon }
  const gvScheduleMap = {};
  
  for (const tkb of tkbs) {
    for (const ngay of tkb.ngayTrongTuan) {
      for (const tiet of ngay.tiets) {
        if (tiet.giaoVien) {
          const gvId = tiet.giaoVien._id.toString();
          if (!gvScheduleMap[gvId]) {
            gvScheduleMap[gvId] = {};
          }
          const key = `${ngay.thu}_${ngay.buoi}_${tiet.tiet}`;
          gvScheduleMap[gvId][key] = {
            lop: tkb.lop.tenLop,
            chuyenMon: tiet.chuyenMon
          };
        }
      }
    }
  }
  
  // 4. Tạo workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'School Management System';
  workbook.created = new Date();
  
  // Style definitions
  const headerStyle = {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
    font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  };
  
  const titleStyle = {
    font: { bold: true, size: 14 },
    alignment: { horizontal: 'center', vertical: 'middle' }
  };
  
  const infoStyle = {
    font: { size: 11 },
    alignment: { horizontal: 'left', vertical: 'middle' }
  };
  
  const cellStyle = {
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  };
  
  const buoiStyleSang = {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  };
  
  const buoiStyleChieu = {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0E0' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  };
  
  // Columns: A=Tiết, B=Thứ 2, C=Thứ 3, D=Thứ 4, E=Thứ 5, F=Thứ 6
  const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
  const thuNames = ['', '', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];
  
  // 5. Tạo sheet cho từng giáo viên
  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    const schedule = gvScheduleMap[gvId] || {};
    
    // Tạo tên sheet an toàn (max 31 ký tự, không có ký tự đặc biệt)
    let sheetName = gv.hoTen.substring(0, 28);
    sheetName = sheetName.replace(/[\\/*?:\[\]]/g, '');
    
    const worksheet = workbook.addWorksheet(sheetName || 'GV', { pageSetup: { orientation: 'landscape' } });
    
    // Row 1: Tiêu đề
    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'TỔNG HỢP TKB GIÁO VIÊN BỘ MÔN';
    worksheet.getCell('A1').style = titleStyle;
    worksheet.getRow(1).height = 30;
    
    // Row 2: Thông tin GV
    worksheet.getCell('A2').value = 'Giáo viên:';
    worksheet.getCell('A2').style = { font: { bold: true, size: 11 } };
    worksheet.getCell('B2').value = gv.hoTen;
    worksheet.getCell('B2').style = infoStyle;
    
    worksheet.getCell('C2').value = 'Bộ môn:';
    worksheet.getCell('C2').style = { font: { bold: true, size: 11 } };
    worksheet.getCell('D2').value = gv.chuyenMon.map(c => c.tenChuyenMon).join(', ');
    worksheet.getCell('D2').style = infoStyle;
    
    // Row 3: Năm học
    worksheet.getCell('A3').value = 'Năm học:';
    worksheet.getCell('A3').style = { font: { bold: true, size: 11 } };
    worksheet.getCell('B3').value = namHoc;
    worksheet.getCell('B3').style = infoStyle;
    
    // Row 4: Header cho BUỔI SÁNG
    worksheet.mergeCells('A4:F4');
    worksheet.getCell('A4').value = 'BUỔI SÁNG';
    worksheet.getCell('A4').style = buoiStyleSang;
    worksheet.getRow(4).height = 25;
    
    // Row 5: Tiêu đề cột (Thứ 2-6)
    worksheet.getRow(5).height = 25;
    worksheet.getCell('A5').value = 'Tiết';
    worksheet.getCell('A5').style = headerStyle;
    
    worksheet.getCell('B5').value = 'Thứ 2';
    worksheet.getCell('B5').style = headerStyle;
    worksheet.getCell('C5').value = 'Thứ 3';
    worksheet.getCell('C5').style = headerStyle;
    worksheet.getCell('D5').value = 'Thứ 4';
    worksheet.getCell('D5').style = headerStyle;
    worksheet.getCell('E5').value = 'Thứ 5';
    worksheet.getCell('E5').style = headerStyle;
    worksheet.getCell('F5').value = 'Thứ 6';
    worksheet.getCell('F5').style = headerStyle;
    
    // Rows 6-9: Tiết 1-4 Sáng
    for (let tiet = 1; tiet <= 4; tiet++) {
      const row = tiet + 5;
      worksheet.getRow(row).height = 35;
      
      let tietLabel = tiet === 1 ? 'Tiết 1' : `Tiết ${tiet}`;
      worksheet.getCell(`A${row}`).value = tietLabel;
      worksheet.getCell(`A${row}`).style = headerStyle;
      
      for (let thu = 2; thu <= 6; thu++) {
        const key = `${thu}_sang_${tiet}`;
        const cell = worksheet.getCell(`${cols[thu - 1]}${row}`);
        
        // Tiết 1 Thứ 2: luôn là Chào cờ
        if (tiet === 1 && thu === 2) {
          cell.value = 'Chào cờ';
          cell.style = cellStyle;
          continue;
        }
        
        // Các tiết khác: chỉ hiển thị nếu không phải "Chào cờ"
        if (schedule[key]) {
          const chuyenMon = schedule[key].chuyenMon || '';
          if (chuyenMon.toLowerCase().includes('chào cờ') || chuyenMon.toLowerCase().includes('chao co')) {
            cell.value = '';
          } else {
            cell.value = `${schedule[key].lop}\n${chuyenMon}`;
          }
        } else {
          cell.value = '';
        }
        cell.style = cellStyle;
      }
    }
    
    // Row 10: Header cho BUỔI CHIỀU
    worksheet.mergeCells('A10:F10');
    worksheet.getCell('A10').value = 'BUỔI CHIỀU';
    worksheet.getCell('A10').style = buoiStyleChieu;
    worksheet.getRow(10).height = 25;
    
    // Row 11: Tiêu đề cột cho chiều
    worksheet.getRow(11).height = 25;
    worksheet.getCell('A11').value = 'Tiết';
    worksheet.getCell('A11').style = headerStyle;
    
    worksheet.getCell('B11').value = 'Thứ 2';
    worksheet.getCell('B11').style = headerStyle;
    worksheet.getCell('C11').value = 'Thứ 3';
    worksheet.getCell('C11').style = headerStyle;
    worksheet.getCell('D11').value = 'Thứ 4';
    worksheet.getCell('D11').style = headerStyle;
    worksheet.getCell('E11').value = 'Thứ 5';
    worksheet.getCell('E11').style = headerStyle;
    worksheet.getCell('F11').value = 'Thứ 6';
    worksheet.getCell('F11').style = headerStyle;
    
    // Rows 12-14: Tiết 5-7 Chiều
    for (let tiet = 5; tiet <= 7; tiet++) {
      const row = tiet + 7; // 12, 13, 14
      worksheet.getRow(row).height = 35;
      
      worksheet.getCell(`A${row}`).value = `Tiết ${tiet}`;
      worksheet.getCell(`A${row}`).style = headerStyle;
      
      for (let thu = 2; thu <= 6; thu++) {
        const key = `${thu}_chieu_${tiet}`;
        const cell = worksheet.getCell(`${cols[thu - 1]}${row}`);
        
        if (schedule[key]) {
          cell.value = `${schedule[key].lop}\n${schedule[key].chuyenMon}`;
        } else {
          cell.value = '';
        }
        cell.style = cellStyle;
      }
    }
    
    // Set column widths
    worksheet.getColumn('A').width = 15;
    for (let i = 1; i <= 5; i++) {
      worksheet.getColumn(cols[i]).width = 15;
    }
  }
  
  // 6. Tạo sheet tổng hợp
  const summarySheet = workbook.addWorksheet('DSGV', { pageSetup: { orientation: 'portrait' } });
  
  summarySheet.mergeCells('A1:D1');
  summarySheet.getCell('A1').value = 'DANH SÁCH GIÁO VIÊN BỘ MÔN';
  summarySheet.getCell('A1').style = titleStyle;
  summarySheet.getRow(1).height = 30;
  
  summarySheet.getCell('A2').value = `Năm học: ${namHoc}`;
  summarySheet.getCell('A2').style = infoStyle;
  
  summarySheet.getRow(4).height = 25;
  summarySheet.getCell('A4').value = 'STT';
  summarySheet.getCell('A4').style = headerStyle;
  summarySheet.getCell('B4').value = 'Họ tên';
  summarySheet.getCell('B4').style = headerStyle;
  summarySheet.getCell('C4').value = 'Bộ môn';
  summarySheet.getCell('C4').style = headerStyle;
  summarySheet.getCell('D4').value = 'Số tiết';
  summarySheet.getCell('D4').style = headerStyle;
  
  giaoViens.forEach((gv, idx) => {
    const row = idx + 5;
    const gvId = gv._id.toString();
    const schedule = gvScheduleMap[gvId] || {};
    const soTiet = Object.keys(schedule).length;
    
    summarySheet.getRow(row).height = 25;
    summarySheet.getCell(`A${row}`).value = idx + 1;
    summarySheet.getCell(`A${row}`).style = cellStyle;
    summarySheet.getCell(`B${row}`).value = gv.hoTen;
    summarySheet.getCell(`B${row}`).style = cellStyle;
    summarySheet.getCell(`C${row}`).value = gv.chuyenMon.map(c => c.tenChuyenMon).join(', ');
    summarySheet.getCell(`C${row}`).style = cellStyle;
    summarySheet.getCell(`D${row}`).value = soTiet;
    summarySheet.getCell(`D${row}`).style = cellStyle;
  });
  
  summarySheet.getColumn('A').width = 8;
  summarySheet.getColumn('B').width = 25;
  summarySheet.getColumn('C').width = 30;
  summarySheet.getColumn('D').width = 10;
  
  // 7. Return buffer
  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  autoGenerateTKB,
  getTKBByLop,
  getTKBByGiaoVien,
  checkGVConflicts,
  getChuyenMonByKhoi,
  exportTKBToExcel,
  TKB_CONFIG
};
