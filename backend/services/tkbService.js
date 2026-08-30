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
const WarningLog = require('../models/WarningLog');

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
    // Buổi KHÔNG khớp buoiUuTien (GV yêu cầu sáng/chieu cụ thể)
    // Phạt CỰC NẶNG để gần như không bao giờ chọn (trừ khi tuyệt đối cần thiết)
    score -= respectNV ? 5000 : 500;
  }

  // === CÂN BẰNG SÁNG/CHIỀU KHI buoiUuTien = 'ca_hai' ===
  // Mục tiêu: GV đăng ký "cả hai" buổi phải được phân bổ đều sáng + chiều,
  // không bị dồn toàn bộ vào 1 buổi. Nếu GV đã có nhiều buổi cùng loại vượt quá
  // "phần của mình", phạt rất nặng để buộc thuật toán ưu tiên buổi còn lại.
  if (nv.buoiUuTien === 'ca_hai' && gvBuoiSet && gvBuoiSet.size > 0) {
    let sangCount = 0;
    let chieuCount = 0;
    for (const sk of gvBuoiSet) {
      const [_, buoi] = sk.split('-');
      if (buoi === 'sang') sangCount++;
      else if (buoi === 'chieu') chieuCount++;
    }
    const total = sangCount + chieuCount;
    const imbalance = Math.abs(sangCount - chieuCount);
    // Phạt nếu GV đang dồn về 1 buổi (mất cân bằng)
    if (slot.buoi === 'sang' && sangCount > chieuCount && total >= 2) {
      // Đang dồn sáng - chọn thêm sáng càng phạt nặng
      score -= respectNV ? (sangCount - chieuCount) * 150 : 50;
    } else if (slot.buoi === 'chieu' && chieuCount > sangCount && total >= 2) {
      // Đang dồn chiều - chọn thêm chiều càng phạt nặng
      score -= respectNV ? (chieuCount - sangCount) * 150 : 50;
    }
    // Thưởng cho buổi đang thiếu để cân bằng
    if (total >= 1 && sangCount > chieuCount && slot.buoi === 'chieu') {
      score += respectNV ? (sangCount - chieuCount) * 80 : 20;
    } else if (total >= 1 && chieuCount > sangCount && slot.buoi === 'sang') {
      score += respectNV ? (chieuCount - sangCount) * 80 : 20;
    }
  }

  // === PHẠT NẶNG KHI ĐÃ ĐỦ BUỔI NHƯNG VẪN MUỐN MỞ BUỔI MỚI ===
  // Nếu buoiUuTien='ca_hai' và đã đủ số buổi, mỗi buổi mới là vi phạm
  if (nv.buoiUuTien === 'ca_hai' && nv.soBuoiToiDa && gvBuoiSet.size >= nv.soBuoiToiDa) {
    // Phạt RẤT nặng để không mở buổi mới (trừ khi còn slot trống cùng buổi cũ)
    score -= respectNV ? 600 : 100;
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
            gvId,
            phanHieu: (gv.phanHieu || '').trim() || '—',
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
              gvId,
              phanHieu: (gv.phanHieu || '').trim() || '—',
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

  // === VÒNG LẶP CÂN BẰNG SÁNG/CHIỀU CHO buoiUuTien='ca_hai' ===
  // Mục tiêu: GV đăng ký "cả hai buổi" nhưng đang bị dồn vào 1 buổi
  // (VD: 4 buổi sáng, 0 buổi chiều) → cố gắng dời 1 block buổi đang dồn sang buổi kia.
  let canBangSangChieuMoves = 0;

  // Helper local: xây lại busy set cho 1 GV từ lopSchedulesData hiện tại
  const canBangBusyByGV = (gvId) => {
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

  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    const nv = gv.nguyenVong || {};
    if (nv.buoiUuTien !== 'ca_hai') continue;

    const sessions = gvCurrentSessions.get(gvId) || new Set();
    let sangCount = 0, chieuCount = 0;
    const sangSessions = [], chieuSessions = [];
    for (const sk of sessions) {
      const [thuStr, buoi] = sk.split('-');
      if (buoi === 'sang') { sangCount++; sangSessions.push(sk); }
      else if (buoi === 'chieu') { chieuCount++; chieuSessions.push(sk); }
    }

    // Nếu mất cân bằng (chênh lệch >= 2): cố gắng dời 1 block
    if (Math.abs(sangCount - chieuCount) >= 2) {
      const fromSessions = sangCount > chieuCount ? sangSessions : chieuSessions;
      const targetBuoi = sangCount > chieuCount ? 'chieu' : 'sang';

      for (const fromKey of fromSessions) {
        const [fromThuStr, fromBuoi] = fromKey.split('-');
        const fromThu = parseInt(fromThuStr);

        // Lấy tiết của GV trong session này
        const items = [];
        for (const data of lopSchedulesData) {
          const ngay = data.lopSchedule.find(n => n.thu === fromThu && n.buoi === fromBuoi);
          if (ngay) {
            for (const tiet of ngay.tiets) {
              if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
                items.push({
                  lopId: data.lop._id.toString(),
                  thu: fromThu, buoi: fromBuoi, tiet: tiet.tiet,
                  chuyenMon: tiet.chuyenMon
                });
              }
            }
          }
        }
        if (items.length === 0) continue;

        // Tìm session đích trống (cùng thứ hoặc khác thứ đều được)
        const candidateDefKeys = [];
        for (const thu of TKB_CONFIG.weekdays) {
          if (thu === fromThu) continue;
          candidateDefKeys.push(`${thu}-${targetBuoi}`);
        }

        let movedAny = false;
        for (const defKey of candidateDefKeys) {
          if (movedAny) break;
          const [defThuStr, defBuoi] = defKey.split('-');
          const defThu = parseInt(defThuStr);
          // Skip thứ nghỉ
          if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(defThu)) continue;
          // Skip nếu đã có session này
          if (sessions.has(defKey)) continue;

          const slots = findAvailableSlotsInSession(defThu, defBuoi, gv, items[0].lopId, lopSchedulesData, canBangBusyByGV(gvId));
          if (slots.length === 0) continue;

          for (const slot of slots) {
            const gvBusyForGV = canBangBusyByGV(gvId);
            const validation = tryMoveSingleTietOnData(
              lopSchedulesData, items[0], slot.thu, slot.buoi, slot.tiet, gv, gvBusyForGV
            );
            if (!validation.ok) continue;
            applyMoveSingleTietOnData(lopSchedulesData, items[0], slot.thu, slot.buoi, slot.tiet, gv);
            totalMoves++;
            canBangSangChieuMoves++;
            movedAny = true;
            break;
          }
        }
        if (movedAny) break;
      }
    }
  }

  // === VÒNG LẶP ĐẢM BẢO buoiUuTien CỤ THỂ (sang/chiec) ===
  // Nếu GV yêu cầu buổi cụ thể (không phải ca_hai) nhưng vẫn bị xếp tiết sai buổi
  // → cố gắng MOVE tiết đó sang buổi đúng.
  let fixBuoiUuTienMoves = 0;

  // Helper local: xây lại busy set cho 1 GV từ lopSchedulesData hiện tại
  const fixBusyByGV = (gvId) => {
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

  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    const nv = gv.nguyenVong || {};
    if (!nv.buoiUuTien || nv.buoiUuTien === 'ca_hai') continue;

    const targetBuoi = nv.buoiUuTien; // 'sang' hoặc 'chieu'

    // Tìm tiết đang sai buổi
    const wrongBuoiItems = [];
    for (const data of lopSchedulesData) {
      for (const ngay of data.lopSchedule) {
        if (ngay.buoi === targetBuoi) continue; // bỏ tiết đúng buổi
        for (const tiet of ngay.tiets) {
          if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
            wrongBuoiItems.push({
              lopId: data.lop._id.toString(),
              thu: ngay.thu, buoi: ngay.buoi, tiet: tiet.tiet,
              chuyenMon: tiet.chuyenMon
            });
          }
        }
      }
    }

    // Thử move từng tiết sai buổi
    for (const item of wrongBuoiItems) {
      // Tìm slot trống buổi đúng, khác thứ, không phải chào cờ
      let moved = false;
      for (const defThu of TKB_CONFIG.weekdays) {
        if (moved) break;
        // Bỏ thứ nghỉ
        if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(defThu)) continue;
        // Bỏ cùng thứ (slot đó vẫn sai buổi)
        if (defThu === item.thu) continue;

        const slots = findAvailableSlotsInSession(defThu, targetBuoi, gv, item.lopId, lopSchedulesData, fixBusyByGV(gvId));
        if (slots.length === 0) continue;

        for (const slot of slots) {
          const validation = tryMoveSingleTietOnData(
            lopSchedulesData, item, slot.thu, slot.buoi, slot.tiet, gv, fixBusyByGV(gvId)
          );
          if (!validation.ok) continue;
          applyMoveSingleTietOnData(lopSchedulesData, item, slot.thu, slot.buoi, slot.tiet, gv);
          totalMoves++;
          fixBuoiUuTienMoves++;
          moved = true;
          break;
        }
      }
    }
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
    const phanHieu = (gv.phanHieu || '').trim();
    if (!desired) {
      thongKeBuoi.push({ gv: gv.hoTen, gvId, phanHieu, desired: null, actual, satisfied: null, note: 'Không cấu hình nguyện vọng' });
      continue;
    }
    const satisfied = actual <= desired;
    if (satisfied) soGVOptimized++;
    thongKeBuoi.push({
      gv: gv.hoTen,
      gvId,
      phanHieu,
      desired,
      actual,
      satisfied,
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
async function autoGenerateTKB(namHoc, options = {}) {
  try {
    // options = {
    //   phanHieu: string | null   // nếu có, chỉ xếp các lớp thuộc phân hiệu này
    //   clearOld: boolean         // mặc định true - xóa TKB cũ trước khi sinh
    //   onProgress: function      // callback tiến độ
    // }
    const phanHieu = options.phanHieu || null;
    const clearOld = options.clearOld !== false;
    const onProgress = options.onProgress || (() => {});

    // 1. Load dữ liệu
    const khois = await Khoi.find().sort({ thuTu: 1 });
    let lops = await Lop.find().populate('khoi');
    const giaoViens = await GiaoVien.find({ trangThai: 'active' });

    // Lọc lớp theo phân hiệu (nếu có)
    if (phanHieu) {
      lops = lops.filter(l => (l.phanHieu || '') === phanHieu);
    }

    if (lops.length === 0) {
      return {
        success: false,
        message: phanHieu
          ? `Phân hiệu "${phanHieu}" chưa có lớp nào để sắp xếp`
          : 'Chưa có lớp nào để sắp xếp',
      };
    }
    if (giaoViens.length === 0) {
      return { success: false, message: 'Chưa có giáo viên nào' };
    }

    // 2. Xóa TKB cũ (chỉ trong phạm vi lọc)
    if (clearOld) {
      if (phanHieu) {
        // Xóa TKB của các lớp thuộc phân hiệu này (giữ lại TKB phân hiệu khác)
        const lopIds = lops.map(l => l._id);
        await ThoiKhoaBieu.deleteMany({ namHoc, lop: { $in: lopIds } });
      } else {
        await ThoiKhoaBieu.deleteMany({ namHoc });
      }
    }

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

      // Greedy: chọn sessions ưu tiên đúng theo NV buoiUuTien
      // - 'sang'  → ưu tiên buổi sáng trước
      // - 'chieu' → ưu tiên buổi chiều trước
      // - 'ca_hai' hoặc không có → capacity cao trước
      const buoiSortPriority = (key) => {
        const buoi = key.includes('-sang') ? 'sang' : 'chieu';
        if (nv.buoiUuTien === 'sang' && buoi === 'sang') return 0;
        if (nv.buoiUuTien === 'sang' && buoi === 'chieu') return 2;
        if (nv.buoiUuTien === 'chieu' && buoi === 'chieu') return 0;
        if (nv.buoiUuTien === 'chieu' && buoi === 'sang') return 2;
        return 1; // ca_hai hoặc không có NV
      };

      const sortedSessions = [...sessionCapacity.entries()]
        .filter(([_, cap]) => cap > 0)
        .sort((a, b) => {
          // Ưu tiên buổi đúng NV trước
          const pa = buoiSortPriority(a[0]);
          const pb = buoiSortPriority(b[0]);
          if (pa !== pb) return pa - pb;
          // Sau đó theo capacity cao
          if (b[1] !== a[1]) return b[1] - a[1];
          return 0;
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
        // Chỉ giữ lại desired sessions có buổi ưu tiên + capacity cao nhất
        const sorted = [...preferred].sort((a, b) => {
          const pa = buoiSortPriority(a);
          const pb = buoiSortPriority(b);
          if (pa !== pb) return pa - pb;
          const capA = sessionCapacity.get(a) || 0;
          const capB = sessionCapacity.get(b) || 0;
          if (capB !== capA) return capB - capA;
          return 0;
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
    // Các trường hợp không thể xếp (gom lại để báo lỗi 1 lần có cấu trúc)
    const unresolvable = []; // [{ lop, phanHieu, mon, needed, missing, reason }]
    
    
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
      // === RÀNG BUỘC "1 BUỔI CHỈ 1 MÔN" ===
      // Map key = `${thu}-${buoi}-${tenChuyenMon}` → số tiết đã xếp của môn đó trong buổi đó
      // Cho phép tối đa 1 tiết/môn/buổi để tránh học 1 môn liên tục
      const lopBuoiMonCount = new Map();
      const lopId = lop._id.toString();
      slotOwnerByClass.set(lopId, lopSlotOwner);

      let tongTietXep = 0;
      
      // === KHÓA GV CHO MỖI MÔN TRONG LỚP ===
      // Theo yêu cầu: 1 môn của lớp phải do 1 GV duy nhất dạy (không chia cho nhiều GV).
      // Nếu GV đó không đủ slot, vẫn cho dạy (tăng tiết vượt định mức) thay vì đổi sang GV khác.
      // Map: tenChuyenMon -> gvId đã khóa cho lớp này.
      const lockedMonGV = new Map();

      for (const cm of sortedCM) {
        const gvList = gvByChuyenMon.get(cm.tenChuyenMon) || [];
        if (gvList.length === 0) {
          unresolvable.push({
            lop: lop.tenLop,
            lopId: lop._id,
            phanHieu: lop.phanHieu || '(chưa gán)',
            mon: cm.tenChuyenMon,
            needed: cm.soTietTuan,
            missing: cm.soTietTuan,
            reason: 'no_gv',
          });
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
        // === LOGIC KHÓA GV ===
        // Nếu môn này đã có GV khóa (từ tiết trước của cùng môn trong lớp),
        // CHỈ sử dụng GV đó. Nếu không, dùng danh sách đầy đủ để chọn.
        const lockedGVId = lockedMonGV.get(cm.tenChuyenMon);
        let gvCoNVList, gvKhongNVList, sortedGV;

        // === SẮP THEO PHÂN HIỆU: ƯU TIÊN GV CÙNG PHÂN HIỆU ===
        // Khi chạy autoGenerateByPhanHieu(phanHieu), GV cùng phân hiệu với lớp
        // phải được ưu tiên TUYỆT ĐỐI (không phải chỉ +300 điểm). Lý do:
        //  - Một GV ở phân hiệu khác có NV (thuNghi, soBuoiToiDa, buoiUuTien)
        //    sẽ được xếp vào gvCoNVList (Bước 1) TRƯỚC GV cùng phân hiệu không NV,
        //    dẫn đến tiết bị "lấy mất" khỏi phân hiệu đúng của lớp.
        //  - Kết quả: GV ở phân hiệu chính (như PHAN THỊ NHÃ - Mỹ thuật - Chính)
        //    bị bỏ qua hoàn toàn, không được xếp tiết nào.
        // Quy tắc phân nhóm GV khi có phanHieu option:
        //  - Ưu tiên 1: GV cùng phanHieu (cô Nhã ở Chính cho lớp ở Chính) → gvCoNVList
        //  - Ưu tiên 2: GV khác phanHieu (chỉ dùng khi không đủ GV cùng phan hiệu) → gvKhongNVList
        const lopPhanHieu = (lop.phanHieu || '').trim();
        const isPhanHieuMode = !!phanHieu && !!lopPhanHieu;

        if (lockedGVId) {
          // GV đã bị khóa - chỉ dùng GV này
          const lockedGV = gvList.find(g => g._id.toString() === lockedGVId);
          if (lockedGV) {
            gvCoNVList = gvCoNV(lockedGV) ? [lockedGV] : [];
            gvKhongNVList = gvCoNV(lockedGV) ? [] : [lockedGV];
            sortedGV = [lockedGV];
          } else {
            // Không tìm thấy GV đã khóa (lỗi) - fallback danh sách đầy đủ
            gvCoNVList = gvList.filter(g => gvCoNV(g)).sort(sortByTiet);
            gvKhongNVList = gvList.filter(g => !gvCoNV(g)).sort(sortByTiet);
            sortedGV = [...gvList].sort(sortByTiet);
          }
        } else if (isPhanHieuMode) {
          // === PHÂN HIỆU MODE: CHỈ DÙNG GV CÙNG PHÂN HIỆU ===
          // Khi sắp TKB cho phân hiệu X, CHỈ dùng GV thuộc phân hiệu X.
          // GV khác phân hiệu tuyệt đối KHÔNG được dùng (kể cả có NV).
          // Nếu thiếu GV cho 1 môn → báo lỗi, bỏ qua môn đó cho lớp đó.
          // Việc điều chuyển GV giữa phân hiệu là chức năng riêng, không tự động.
          const cungPhanHieu = gvList.filter(g => (g.phanHieu || '').trim() === lopPhanHieu);

          // Trong nhóm cùng phân hiệu: ưu tiên GV có NV trước, sau đến không NV.
          gvCoNVList = cungPhanHieu.filter(g => gvCoNV(g)).sort(sortByTiet);
          gvKhongNVList = cungPhanHieu.filter(g => !gvCoNV(g)).sort(sortByTiet);
          sortedGV = [...cungPhanHieu].sort(sortByTiet);

          // Nếu KHÔNG CÓ bất kỳ GV nào cùng phân hiệu cho môn này → báo lỗi và bỏ qua môn.
          if (cungPhanHieu.length === 0) {
            unresolvable.push({
              lop: lop.tenLop,
              lopId: lop._id,
              phanHieu: lop.phanHieu || '(chưa gán)',
              mon: cm.tenChuyenMon,
              needed: cm.soTietTuan,
              missing: cm.soTietTuan,
              reason: 'no_gv_in_phanhieu',
            });
            errors.push(`Lớp ${lop.tenLop}: Không có GV dạy "${cm.tenChuyenMon}" tại phân hiệu "${lopPhanHieu}" (điều chuyển GV từ phân hiệu khác sẽ xử lý sau)`);
            remaining = 0; // skip hết môn này
            continue; // next môn
          }
        } else {
          // Chưa khóa GV cho môn này - dùng danh sách đầy đủ (toàn trường)
          gvCoNVList = gvList.filter(g => gvCoNV(g)).sort(sortByTiet);
          gvKhongNVList = gvList.filter(g => !gvCoNV(g)).sort(sortByTiet);
          // Gộp lại để pass 3,4 vẫn duyệt tất cả
          sortedGV = [...gvList].sort(sortByTiet);
        }

        // === THEO DÕI GV ĐẦU TIÊN ĐƯỢC CHỌN ===
        // Khi lần đầu commit 1 tiết cho môn này, khóa GV đó.
        const firstChosenGVId = { value: null };
        
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
        const MON_DAT_BIET = new Set(['Tin học', 'Công nghệ']);
        const findBestSlotForGV = (gv, respectNV, allowBusy = false) => {
          const gvId = gv._id.toString();
          let bestSlot = null;
          let bestScore = -Infinity;
          for (const slot of allSlots) {
            if (lopUsedSlots.has(slot.key)) continue;
            // === RÀNG BUỘC "1 BUỔI CHỈ 1 MÔN" (HARD CONSTRAINT) ===
            // Mỗi buổi (sáng/chiều của 1 thứ) chỉ được học tối đa 1 tiết của 1 môn.
            // Tránh tình trạng học 1 môn liên tục nhiều tiết trong cùng buổi.
            const buoiMonKey = `${slot.thu}-${slot.buoi}-${cm.tenChuyenMon}`;
            if ((lopBuoiMonCount.get(buoiMonKey) || 0) >= 1) {
              continue; // skip slot - môn này đã có tiết trong buổi này rồi
            }
            // === RÀNG BUỘC CHẶN CỨNG: MÔN ĐẶC BIỆT KHÔNG ĐƯỢC XẾP CẠNH NHAU ===
            // Với Tin học và Công nghệ: nếu trong cùng buổi (thu+buoi) đã có tiết
            // của cùng môn này ở vị trí cạnh (|tiet_existing - slot.tiet| = 1) → skip slot.
            // Đây là HARD CONSTRAINT, không bao giờ vi phạm.
            if (MON_DAT_BIET.has(cm.tenChuyenMon)) {
              // Tìm tất cả tiết cùng môn trong buổi này (của lớp hiện tại)
              for (const ngay of lopSchedule) {
                if (ngay.thu === slot.thu && ngay.buoi === slot.buoi) {
                  for (const existingTiet of ngay.tiets) {
                    if (existingTiet.chuyenMon === cm.tenChuyenMon) {
                      if (Math.abs(existingTiet.tiet - slot.tiet) === 1) {
                        // Skip slot này - môn đặc biệt không được xếp cạnh nhau
                        // Dùng flag để break cả vòng lặp
                        slot._skipMonDatBiet = true;
                        break;
                      }
                    }
                  }
                  if (slot._skipMonDatBiet) break;
                }
              }
              if (slot._skipMonDatBiet) {
                delete slot._skipMonDatBiet;
                continue;
              }
            }
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
            const nv2 = gv.nguyenVong || {};

            // === CÂN BẰNG SÁNG/CHIỀU TRONG GOM BUỔI ===
            // Gom buổi nào phụ thuộc vào NV:
            //  - buoiUuTien = 'sang' → chỉ thưởng khi gom buổi sáng
            //  - buoiUuTien = 'chieu' → chỉ thưởng khi gom buổi chiều
            //  - buoiUuTien = 'ca_hai' → cân bằng: nếu đang dồn sáng thì THƯỞNG gom chiều, PHẠT gom sáng
            let nhomBuoiReward = 0;
            if (nv2.buoiUuTien === 'sang' && slot.buoi === 'sang' && daCoCungBuoi) {
              nhomBuoiReward = 50;
            } else if (nv2.buoiUuTien === 'chieu' && slot.buoi === 'chieu' && daCoCungBuoi) {
              nhomBuoiReward = 50;
            } else if (nv2.buoiUuTien === 'ca_hai' && daCoCungBuoi) {
              // Cân bằng: đếm sáng/chiều hiện tại
              let sangCount2 = 0, chieuCount2 = 0;
              for (const sk of gvBuoiSet.get(gvId)) {
                const [_, b] = sk.split('-');
                if (b === 'sang') sangCount2++; else if (b === 'chieu') chieuCount2++;
              }
              // Nếu gom buổi đang dồn thì phạt, gom buổi còn thiếu thì thưởng
              if (slot.buoi === 'sang' && sangCount2 > chieuCount2) {
                nhomBuoiReward = -50; // phạt gom thêm sáng
              } else if (slot.buoi === 'chieu' && chieuCount2 > sangCount2) {
                nhomBuoiReward = -50; // phạt gom thêm chiều
              } else {
                nhomBuoiReward = 50; // thưởng gom buổi đang thiếu hoặc cân bằng
              }
            } else if (!nv2.buoiUuTien || nv2.buoiUuTien === 'ca_hai' || nv2.buoiUuTien === slot.buoi) {
              // Không có NV hoặc cả hai buổi → thưởng mặc định
              nhomBuoiReward = daCoCungBuoi ? 50 : 0;
            }
            score += nhomBuoiReward;

            // Thưởng vừa cho cùng thứ (gom sáng + chiều cùng ngày) - CHỈ khi phù hợp NV
            if (daCoCungThu && !daCoCungBuoi) {
              // Gom thêm buổi cùng ngày: chỉ thưởng nếu NV cho phép cả 2 buổi
              // hoặc buổi đang thêm khớp với buoiUuTien
              if (!nv2.buoiUuTien || nv2.buoiUuTien === 'ca_hai' || nv2.buoiUuTien === slot.buoi) {
                score += 30;
              }
            }

            const nv = gv.nguyenVong || {};
            // Phạt rất nặng khi mở buổi mới mà đã đạt/gần đạt max buổi
            if (!daCoCungBuoi && nv.soBuoiToiDa && gvBuoiSet.get(gvId).size >= nv.soBuoiToiDa - 1) {
              score -= 100;
            }
            // Phạt nếu mở buổi không khớp NV buoiUuTien
            if (!daCoCungBuoi && nv.buoiUuTien && nv.buoiUuTien !== 'ca_hai' && nv.buoiUuTien !== slot.buoi) {
              score -= respectNV ? 300 : 80;
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

            // === ƯU TIÊN GV CÙNG PHÂN HIỆU VỚI LỚP ===
            // Theo yêu cầu: sắp theo phân hiệu - GV ở cùng phân hiệu với lớp được ưu tiên.
            // Bonus lớn (+300) cho GV cùng phân hiệu; phạt nhẹ (-100) cho GV khác phân hiệu.
            const lopPhanHieu = (lop.phanHieu || '').toString().trim();
            const gvPhanHieu = (gv.phanHieu || '').toString().trim();
            if (lopPhanHieu) {
              if (gvPhanHieu === lopPhanHieu) {
                score += 300; // rất thưởng - cùng phân hiệu
              } else if (gvPhanHieu) {
                score -= 100; // phạt - GV ở phân hiệu khác
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

          // === KHÓA GV CHO MÔN NÀY TRONG LỚP ===
          // Khi commit tiết đầu tiên cho môn, khóa GV lại.
          // Tất cả các tiết sau của môn này sẽ dùng cùng GV.
          if (firstChosenGVId.value === null) {
            firstChosenGVId.value = gvId;
            lockedMonGV.set(cm.tenChuyenMon, gvId);
          }

          // === CẬP NHẬT "1 BUỔI 1 MÔN" ===
          const buoiMonKey = `${slot.thu}-${slot.buoi}-${cm.tenChuyenMon}`;
          lopBuoiMonCount.set(buoiMonKey, (lopBuoiMonCount.get(buoiMonKey) || 0) + 1);

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
              gv: gv.hoTen,
              gvId,
              phanHieu: (gv.phanHieu || '').trim() || '—',
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
        // Gom vào mảng unresolvable để báo lỗi 1 lần ở cuối (group theo phân hiệu).
        if (remaining > 0) {
          unresolvable.push({
            lop: lop.tenLop,
            lopId: lop._id,
            phanHieu: lop.phanHieu || '(chưa gán)',
            mon: cm.tenChuyenMon,
            needed: cm.soTietTuan,
            missing: remaining,
            reason: 'insufficient_slots',
          });
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

    // Nếu có bất kỳ trường hợp không thể xếp → báo lỗi group theo phân hiệu
    if (unresolvable.length > 0) {
      const grouped = {}; // phanHieu -> [{ lop, mon, needed, missing, reason }]
      for (const u of unresolvable) {
        if (!grouped[u.phanHieu]) grouped[u.phanHieu] = [];
        grouped[u.phanHieu].push(u);
      }
      const phanHieuEntries = Object.entries(grouped);
      let msg = `⚠️ [SẮP THIẾU] Có ${unresolvable.length} lớp-môn không xếp được (sẽ điều chuyển sau), phân bổ ở ${phanHieuEntries.length} phân hiệu:\n\n`;
      for (const [ph, cases] of phanHieuEntries) {
        msg += `📍 Phân hiệu "${ph}" (${cases.length} lớp-môn):\n`;
        for (const c of cases) {
          const lyDo = c.reason === 'no_gv' || c.reason === 'no_gv_in_phanhieu'
            ? 'không có GV dạy môn này'
            : 'GV không đủ slot trống';
          msg += `   • Lớp "${c.lop}" - môn "${c.mon}" thiếu ${c.missing}/${c.needed} tiết (${lyDo})\n`;
        }
        msg += '\n';
      }
      msg += '→ Hệ thống sẽ tự ghi nhận và điều chuyển sau khi bạn bấm nút "Sắp điều chuyển".\n';
      // KHÔNG throw - tiếp tục save partial TKB + ghi WarningLog để điều chuyển sau
      console.warn(msg);
    }

    // Chuẩn bị missingClasses để ghi vào WarningLog + trả về cho FE
    const missingClasses = unresolvable.map(u => ({
      lop: u.lop,
      mon: u.mon,
      soTietConThieu: u.missing,
      phanHieu: u.phanHieu,
      // lopId giữ nguyên ObjectId để khớp với schema, KHÔNG .toString()
      lopId: u.lopId || null,
      message: `thiếu ${u.missing}/${u.needed} tiết (${u.reason === 'no_gv' || u.reason === 'no_gv_in_phanhieu' ? 'không có GV dạy môn này' : 'GV không đủ slot trống'})`,
    }));

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
          phanHieu: v.phanHieu || '—',
          soTiet: 0,
          lyDo: v.lyDo,
          chiTiet: []
        };
      }
      gvViPhamUnique[v.gv].soTiet += 1;
      gvViPhamUnique[v.gv].chiTiet.push(`${v.phanHieu ? `[${v.phanHieu}] ` : ''}${v.lop} - ${v.mon} - T${v.thu}(${v.buoi}) tiết ${v.tiet}`);
    }

    // ====== LỌC KẾT QUẢ THEO PHÂN HIỆU (nếu đang sắp theo phân hiệu) ======
    // Khi chạy với options.phanHieu, chỉ trả về thống kê về GV thuộc phân hiệu đó.
    // GV phân hiệu khác có actual=0 trong lần chạy này nên không hiển thị,
    // tránh nhiễu thông tin về GV điều chuyển (xử lý ở bước "Sắp điều chuyển" riêng).
    const runPhanHieu = options.phanHieu || null;

    // Lọc thongKeBuoi: chỉ giữ GV có phanHieu khớp (hoặc GV không có phanHieu)
    const filteredThongKeBuoi = runPhanHieu
      ? optimizationReport.thongKeBuoi.filter(r => !r.phanHieu || r.phanHieu === runPhanHieu)
      : optimizationReport.thongKeBuoi;

    // Lọc viPhamNV.danhSachGV theo cùng logic
    const filteredDanhSachGV = runPhanHieu
      ? Object.values(gvViPhamUnique).filter(gv => !gv.phanHieu || gv.phanHieu === runPhanHieu || gv.phanHieu === '—')
      : Object.values(gvViPhamUnique);

    // Lọc lại viPhamNVList gốc để tongSoTiet phản ánh đúng số tiết phạm tại phân hiệu đang sắp
    const filteredViPhamNVList = runPhanHieu
      ? viPhamNVList.filter(v => !v.phanHieu || v.phanHieu === runPhanHieu || v.phanHieu === '—')
      : viPhamNVList;

    // ====== 6. Ghi WarningLog nếu có lớp-môn thiếu (để assignOverflow đọc lại sau) ======
    if (missingClasses.length > 0) {
      try {
        // Chỉ giữ các case thuộc phân hiệu đang chạy (nếu có lọc)
        const missingToSave = runPhanHieu
          ? missingClasses.filter(mc => !mc.phanHieu || mc.phanHieu === runPhanHieu)
          : missingClasses;

        if (missingToSave.length > 0) {
          // Merge với các case cũ ở phân hiệu khác (không ghi đè)
          const existing = await WarningLog.findOne({ namHoc, type: 'unresolved' }).lean();
          const others = existing
            ? existing.missingClasses.filter(mc => runPhanHieu && mc.phanHieu !== runPhanHieu)
            : [];
          const merged = [...others, ...missingToSave];
          // Dedup theo lopId + mon
          const seen = new Set();
          const dedup = merged.filter(mc => {
            const key = `${mc.lopId || mc.lop}|${mc.mon}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          await WarningLog.findOneAndUpdate(
            { namHoc, type: 'unresolved' },
            {
              $set: {
                namHoc,
                type: 'unresolved',
                title: 'Lớp-môn chưa xếp được (chờ điều chuyển)',
                message: `Có ${dedup.length} lớp-môn không xếp được tại các phân hiệu`,
                missingClasses: dedup,
                summary: {
                  totalMissingClasses: dedup.length,
                  totalMissingPeriods: dedup.reduce((s, mc) => s + (mc.soTietConThieu || 1), 0),
                  lastUpdatedAt: new Date(),
                },
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          console.log(`[autoGenerateTKB] Saved ${dedup.length} unresolved cases to WarningLog`);
        }
      } catch (wlErr) {
        console.warn('[autoGenerateTKB] Failed to save WarningLog:', wlErr.message);
      }
    } else if (runPhanHieu) {
      // Không có missing ở phân hiệu này → xóa các case của phân hiệu này trong WarningLog
      try {
        const existing = await WarningLog.findOne({ namHoc, type: 'unresolved' }).lean();
        if (existing) {
          const remaining = existing.missingClasses.filter(mc => mc.phanHieu && mc.phanHieu !== runPhanHieu);
          if (remaining.length === 0) {
            await WarningLog.deleteOne({ namHoc, type: 'unresolved' });
          } else if (remaining.length !== existing.missingClasses.length) {
            await WarningLog.updateOne(
              { namHoc, type: 'unresolved' },
              { $set: { missingClasses: remaining, 'summary.totalMissingClasses': remaining.length } }
            );
          }
        }
      } catch (wlErr) {
        console.warn('[autoGenerateTKB] Failed to clean WarningLog:', wlErr.message);
      }
    }

    return {
      success: true,
      partialSuccess: missingClasses.length > 0,
      missingClasses: runPhanHieu
        ? missingClasses.filter(mc => !mc.phanHieu || mc.phanHieu === runPhanHieu)
        : missingClasses,
      message,
      results,
      skipped,
      warnings: errors.length > 0 ? errors : undefined,
      viPhamNV: filteredDanhSachGV.length > 0 ? {
        tongSoTiet: filteredViPhamNVList.length,
        danhSachGV: filteredDanhSachGV
      } : null,
      thongKeBuoi: filteredThongKeBuoi
    };

  } catch (error) {
    console.error('Error generating TKB:', error);
    throw error;
  }
}

/**
 * Sắp xếp TKB cho 1 phân hiệu cụ thể (mới).
 * - Chỉ xét các lớp có phanHieu khớp.
 * - Ưu tiên GV cùng phân hiệu (bonus +300 điểm đã có trong findBestSlotForGV).
 * - 1 môn của lớp luôn do 1 GV duy nhất dạy (logic đã có trong autoGenerateTKB).
 * - Không xóa TKB của phân hiệu khác.
 */
async function autoGenerateByPhanHieu(namHoc, phanHieu, onProgress = () => {}) {
  if (!phanHieu) {
    return { success: false, message: 'Cần cung cấp phanHieu' };
  }
  return autoGenerateTKB(namHoc, {
    phanHieu,
    clearOld: true,
    onProgress,
  });
}

/**
 * Sắp điều chuyển: GV dư ở phân hiệu chính sẽ được phân bổ sang phân hiệu thiếu.
 * - Chạy SAU khi đã sắp theo phân hiệu (cho 1 hoặc nhiều phân hiệu).
 * - Đánh dấu ghiChuDieuChuyen=true cho các tiết mới.
 *
 * Logic:
 * 0. (MỚI) Đọc WarningLog.unresolved → giải quyết các lớp-môn còn thiếu từ
 *    scheduler. Với mỗi case (lop, mon), tìm GV cùng chuyên môn (ưu tiên
 *    gv.phanHieuDieuChuyen === phanHieu của lop) và xếp vào slot trống của
 *    TKB hiện tại của lớp. Case đã giải quyết sẽ được XÓA khỏi WarningLog.
 * 1. Với mỗi GV, tính soTietDaDay (chỉ đếm tiết dạy tại phân hiệu chính).
 * 2. Tính soTietDangDu = max(0, soTietDaDay - soTietDinhMuc).
 * 3. Với mỗi phân hiệu X (khác phanHieu của GV dư), tính soTietThieu:
 *    - tổng tiết cần dạy (sum chuyenMons của các lớp) - tổng tiết đã xếp.
 * 4. Match GV dư với phân hiệu thiếu:
 *    - Ưu tiên 1: gv.phanHieuDieuChuyen === phanHieu thiếu.
 *    - Ưu tiên 2: phân hiệu thiếu nhiều nhất.
 * 5. Xếp tiết vào TKB của lớp thuộc phân hiệu thiếu (slot trống, GV không trùng).
 * 6. Đánh dấu ghiChuDieuChuyen=true.
 */
async function assignOverflow(namHoc, onProgress = () => {}) {
  try {
    const giaoViens = await GiaoVien.find({ trangThai: 'active' });
    const lops = await Lop.find().populate('khoi');
    if (giaoViens.length === 0 || lops.length === 0) {
      return { success: false, message: 'Thiếu GV hoặc lớp' };
    }

    onProgress(5, 'init', 'Khởi động sắp điều chuyển');

    let allTkbs = await ThoiKhoaBieu.find({ namHoc });
    const tkbByLop = new Map();
    for (const tkb of allTkbs) {
      tkbByLop.set(tkb.lop.toString(), tkb);
    }
    const lopById = new Map();
    for (const lop of lops) {
      lopById.set(lop._id.toString(), lop);
    }
    console.log(`[assignOverflow] ══════ DEBUG DATA STATE ══════`);
    console.log(`[assignOverflow] namHoc=${namHoc}`);
    console.log(`[assignOverflow] Tổng TKB trong DB cho năm học này: ${allTkbs.length}`);
    console.log(`[assignOverflow] Tổng lớp trong DB: ${lops.length}`);
    if (allTkbs.length > 0) {
      // In ra một vài TKB để check
      const sample = allTkbs.slice(0, 5);
      console.log(`[assignOverflow] Mẫu TKB (5 cái đầu):`);
      for (const tkb of sample) {
        const lopIdStr = tkb.lop.toString();
        const lop = lopById.get(lopIdStr);
        let tietCount = 0;
        for (const ngay of tkb.ngayTrongTuan || []) {
          tietCount += (ngay.tiets || []).length;
        }
        console.log(`[assignOverflow]   - lopId=${lopIdStr} (${lop?.tenLop || '?'}) [PH:${lop?.phanHieu}] → ${tietCount} tiết, ${(tkb.ngayTrongTuan||[]).length} ngày`);
      }
      // Thống kê theo phân hiệu
      const tkbsByPh = {};
      for (const tkb of allTkbs) {
        const lop = lopById.get(tkb.lop.toString());
        const ph = lop?.phanHieu || '(không rõ)';
        tkbsByPh[ph] = (tkbsByPh[ph] || 0) + 1;
      }
      console.log(`[assignOverflow] TKB theo phân hiệu:`, JSON.stringify(tkbsByPh));
    }

    // ====================================================================
    // === Bước 0: Giải quyết các case unresolved từ WarningLog =============
    // Chiến lược:
    //   1. Thử ADD trực tiếp (slot trống + GV rảnh tại slot đó)
    //   2. Nếu không ADD được → MOVE: lấy 1 tiết của GV ở phân hiệu khác
    //      đang dạy môn tương tự/khác → chuyển sang lớp thiếu (cùng khung giờ).
    // ====================================================================
    const unresolvedLog = await WarningLog.findOne({ namHoc, type: 'unresolved' }).lean();
    const unresolvedCases = unresolvedLog?.missingClasses || [];
    const resolvedCases = [];
    const stillUnresolved = [];

    // Map lopId → phanHieu O(1), dùng chung cho cả unresolved loop và gvTeachCount
    const lopPhanHieuById = new Map();
    for (const lop of lops) {
      lopPhanHieuById.set(lop._id.toString(), (lop.phanHieu || '').trim());
    }
    // Định mức đúng: phanCong.soTietDinhMuc - phanCong.soTietKiemNhiem
    const calcDinhMuc = (gv) => Math.max(0,
      Number(gv.phanCong?.soTietDinhMuc || 0)
      - Number(gv.phanCong?.soTietKiemNhiem || 0)
    );

    if (unresolvedCases.length > 0) {
      onProgress(8, 'unresolved', `Giải quyết ${unresolvedCases.length} case từ scheduler`);
      const allSlots = generateAllSlots();
      console.log(`\n[assignOverflow] ═══════════════════════════════════════════════════════`);
      console.log(`[assignOverflow] Bắt đầu xử lý ${unresolvedCases.length} case unresolved`);
      console.log(`[assignOverflow] Tổng GV trong hệ thống: ${giaoViens.length}`);
      const gvByMonCount = {};
      for (const gv of giaoViens) {
        for (const cm of gv.chuyenMon || []) {
          gvByMonCount[cm.tenChuyenMon] = (gvByMonCount[cm.tenChuyenMon] || 0) + 1;
        }
      }
      console.log(`[assignOverflow] GV theo môn:`, JSON.stringify(gvByMonCount));
      console.log(`[assignOverflow] Số lop trong lopById: ${lopById.size}, số TKB trong tkbByLop: ${tkbByLop.size}`);
      // In 5 TKB keys đầu để xem định dạng
      console.log(`[assignOverflow] 5 TKB keys đầu:`, Array.from(tkbByLop.keys()).slice(0, 5).join(', '));
      console.log(`[assignOverflow] 5 lopById keys đầu:`, Array.from(lopById.keys()).slice(0, 5).join(', '));
      // Check lopId của 3 case đầu
      for (const uc of unresolvedCases.slice(0, 3)) {
        const lkId = uc.lopId ? (uc.lopId.toString ? uc.lopId.toString() : String(uc.lopId)) : lops.find(l => l.tenLop === uc.lop)?._id?.toString();
        const tk = lkId ? tkbByLop.get(lkId) : null;
        const lp = lkId ? lopById.get(lkId) : null;
        const tkStr = tk ? 'CÓ ' + (tk.ngayTrongTuan || []).length + ' ngày' : 'KHÔNG CÓ';
        console.log(`[assignOverflow]   probe: lop="${uc.lop}" môn="${uc.mon}" | lopId=${lkId} (typeof=${typeof lkId}) | lop=${lp?.tenLop || '?'} | tkb=${tkStr}`);
        // Test với các format khác nhau
        const ucIdObj = uc.lopId;
        const ucIdObjStr = uc.lopId ? uc.lopId.toString() : null;
        console.log(`[assignOverflow]     uc.lopId raw type=${typeof ucIdObj}, str=${ucIdObjStr}`);
      }

      // Xây map: mỗi GV đang dạy bao nhiêu tiết (chỉ đếm tại phân hiệu chính)
      // + soTietDinhMuc đúng từ phanCong.
      // Mục đích: ưu tiên sort GV còn THIẾU slot (room > 0) trước khi tăng tiết GV đã đủ/vượt.
      const gvCurrentTiet = new Map();
      const gvDinhMuc = new Map();
      for (const gv of giaoViens) {
        const gvId = gv._id.toString();
        const phanHieuChinh = (gv.phanHieu || '').trim();
        let cnt = 0;
        for (const tkb of allTkbs) {
          const lopPhanHieu = lopPhanHieuById.get(tkb.lop.toString()) || '';
          if (phanHieuChinh && lopPhanHieu !== phanHieuChinh) continue;
          for (const ngay of tkb.ngayTrongTuan || []) {
            for (const tiet of ngay.tiets || []) {
              if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) cnt++;
            }
          }
        }
        gvCurrentTiet.set(gvId, cnt);
        gvDinhMuc.set(gvId, calcDinhMuc(gv));
      }

      for (const uc of unresolvedCases) {
        // uc.lopId trong DB có thể là string HOẶC ObjectId tùy version code cũ/mới
        const lopId = uc.lopId
          ? (uc.lopId.toString ? uc.lopId.toString() : String(uc.lopId))
          : lops.find(l => l.tenLop === uc.lop)?._id?.toString();
        const lop = lopId ? lopById.get(lopId) : null;
        const tkb = lopId ? tkbByLop.get(lopId) : null;
        if (!lop || !tkb) {
          if (!lop) {
            console.log(`[assignOverflow]   ❌ Lớp "${uc.lop}" môn "${uc.mon}" - LOPID KHÔNG TỒN TẠI trong DB (lopId=${uc.lopId}, typeof=${typeof uc.lopId}) → bỏ qua`);
          } else {
            console.log(`[assignOverflow]   ❌ Lớp "${uc.lop}" (${lop.tenLop}) môn "${uc.mon}" - LỚP KHÔNG CÓ TKB trong tkbByLop (lopId=${lop._id.toString()})`);
          }
          stillUnresolved.push(uc);
          continue;
        }
        const targetPhanHieu = (lop.phanHieu || '').trim();
        // Tìm GV dạy được môn này - ưu tiên phanHieuDieuChuyen khớp
        let candidateGvs = giaoViens.filter(gv => {
          const cms = (gv.chuyenMon || []).map(cm => cm.tenChuyenMon);
          return cms.includes(uc.mon);
        });
        // Ưu tiên:
        //   1. GV có phanHieuDieuChuyen === targetPhanHieu (đăng ký điều chuyển sang PH này)
        //   2. GV cùng phanHieu targetPhanHieu
        //   3. GV còn THIẾU slot nhiều nhất (room = định mức - current DESC).
        //      → Nếu ai cũng đủ/vượt → ưu tiên người có room CAO NHẤT (gần đủ trước),
        //        nếu vẫn bằng → ưu tiên người có current thấp hơn (san đều).
        candidateGvs.sort((a, b) => {
          const aMatch = (a.phanHieuDieuChuyen || '').trim() === targetPhanHieu ? 1 : 0;
          const bMatch = (b.phanHieuDieuChuyen || '').trim() === targetPhanHieu ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
          const aSame = (a.phanHieu || '').trim() === targetPhanHieu ? 1 : 0;
          const bSame = (b.phanHieu || '').trim() === targetPhanHieu ? 1 : 0;
          if (aSame !== bSame) return bSame - aSame;
          const aCur = gvCurrentTiet.get(a._id.toString()) || 0;
          const bCur = gvCurrentTiet.get(b._id.toString()) || 0;
          const aDm = gvDinhMuc.get(a._id.toString()) || 23;
          const bDm = gvDinhMuc.get(b._id.toString()) || 23;
          const aRoom = aDm - aCur; // dương = còn thiếu, âm = đã vượt
          const bRoom = bDm - bCur;
          if (aRoom !== bRoom) return bRoom - aRoom;
          // Cùng room → chọn người có current thấp hơn (san đều)
          return aCur - bCur;
        });
        const candidateInfo = candidateGvs.map(g => {
          const cur = gvCurrentTiet.get(g._id.toString()) || 0;
          const dm = gvDinhMuc.get(g._id.toString()) || 23;
          const room = dm - cur;
          const roomStatus = room > 0 ? `thiếu${room}` : (room === 0 ? 'đủ' : `+${-room}`);
          return `${g.hoTen}(PH:${g.phanHieu},${cur}/${dm}:${roomStatus})`;
        });
        if (candidateGvs.length === 0) {
          console.log(`[assignOverflow]   ❌ Lớp "${uc.lop}" môn "${uc.mon}" - KHÔNG CÓ GV NÀO dạy môn này trong toàn hệ thống → bỏ qua`);
          stillUnresolved.push(uc);
          continue;
        }
        console.log(`[assignOverflow]   🔍 Lớp "${uc.lop}" môn "${uc.mon}" PH="${targetPhanHieu}" - ${candidateGvs.length} GV: ${candidateInfo.join(', ')}`);
        // Slot đã dùng trong TKB của lớp
        const usedSlotKeys = new Set();
        for (const ngay of tkb.ngayTrongTuan || []) {
          for (const tiet of ngay.tiets || []) {
            usedSlotKeys.add(`${ngay.thu}-${ngay.buoi}-${tiet.tiet}`);
          }
        }
        // Kiểm tra "1 buổi 1 môn" cho môn uc.mon
        const tkbMonBuoi = new Set();
        for (const ngay of tkb.ngayTrongTuan || []) {
          for (const tiet of ngay.tiets || []) {
            if (tiet.chuyenMon === uc.mon) {
              tkbMonBuoi.add(`${ngay.thu}-${ngay.buoi}`);
            }
          }
        }
        // Helper: kiểm tra slot có hợp lệ với ràng buộc Tin học/Công nghệ cạnh nhau không
        const isValidSlotForMon = (thu, buoi, tiet) => {
          if (buoi === 'sang' && tiet === 1 && thu === 2) return false; // chào cờ
          const buoiKey = `${thu}-${buoi}`;
          if (tkbMonBuoi.has(buoiKey)) return false;
          if (uc.mon === 'Tin học' || uc.mon === 'Công nghệ') {
            const canhNhau = (tkb.ngayTrongTuan || []).some(ngay =>
              ngay.thu === thu && ngay.buoi === buoi &&
              ngay.tiets.some(t =>
                (t.chuyenMon === 'Tin học' || t.chuyenMon === 'Công nghệ') &&
                Math.abs(t.tiet - tiet) === 1
              )
            );
            if (canhNhau) return false;
          }
          return true;
        };

        let placed = false;
        let moveInfo = null;

        for (const gv of candidateGvs) {
          if (placed) break;
          const gvId = gv._id.toString();
          // GV busy slots (từ TKB các lớp khác)
          const gvBusySlots = new Set();
          for (const otherTkb of allTkbs) {
            if (otherTkb._id.toString() === tkb._id.toString()) continue;
            for (const ngay of otherTkb.ngayTrongTuan || []) {
              for (const tiet of ngay.tiets || []) {
                if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
                  gvBusySlots.add(`${ngay.thu}-${ngay.buoi}-${tiet.tiet}`);
                }
              }
            }
          }
          // === Bước A: thử ADD (slot trống + GV rảnh) ===
          for (const slot of allSlots) {
            if (usedSlotKeys.has(slot.key)) continue;
            if (gvBusySlots.has(slot.key)) continue;
            if (!isValidSlotForMon(slot.thu, slot.buoi, slot.tiet)) continue;
            // OK - xếp vào đây
            let ngay = tkb.ngayTrongTuan.find(n => n.thu === slot.thu && n.buoi === slot.buoi);
            if (!ngay) {
              ngay = { thu: slot.thu, buoi: slot.buoi, tiets: [] };
              tkb.ngayTrongTuan.push(ngay);
            }
            ngay.tiets.push({
              tiet: slot.tiet,
              giaoVien: gv._id,
              chuyenMon: uc.mon,
              ghiChuDieuChuyen: true,
              tuUnresolved: true,
            });
            ngay.tiets.sort((a, b) => a.tiet - b.tiet);
            await tkb.save();
            resolvedCases.push({
              lop: uc.lop,
              mon: uc.mon,
              gvTen: gv.hoTen,
              phanHieu: targetPhanHieu,
              thu: slot.thu,
              buoi: slot.buoi,
              tiet: slot.tiet,
              action: 'add',
            });
            console.log(`[assignOverflow]   ✅ ADD: ${gv.hoTen} → lớp "${uc.lop}" môn "${uc.mon}" T${slot.thu}(${slot.buoi}) tiết ${slot.tiet}`);
            // Cập nhật current tiết cho GV để lần lặp sau sort đúng
            gvCurrentTiet.set(gvId, (gvCurrentTiet.get(gvId) || 0) + 1);
            placed = true;
            break;
          }

          // === Bước B: thử MOVE (lấy 1 tiết của GV ở phân hiệu khác) ===
          // Duyệt qua tất cả tiết hiện có của GV ở các lớp KHÁC phân hiệu target,
          // tìm tiết mà khung giờ đó còn trống ở lop + hợp lệ ràng buộc.
          if (placed) break;
          const gvOtherTiets = [];
          for (const otherTkb of allTkbs) {
            if (otherTkb._id.toString() === tkb._id.toString()) continue;
            const otherLop = lopById.get(otherTkb.lop.toString());
            const otherPh = (otherLop?.phanHieu || '').trim();
            if (otherPh === targetPhanHieu) continue; // chỉ MOVE từ phân hiệu khác
            for (const ngay of otherTkb.ngayTrongTuan || []) {
              for (const tiet of ngay.tiets || []) {
                if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
                  gvOtherTiets.push({ tkb: otherTkb, ngay, tiet });
                }
              }
            }
          }
          // Ưu tiên MOVE tiết có cùng môn (giữ nguyên chuyenMon, chỉ đổi lớp)
          // Sau đó mới MOVE tiết môn khác (sẽ chuyển thành uc.mon ở target)
          gvOtherTiets.sort((a, b) => {
            if (a.tiet.chuyenMon === uc.mon && b.tiet.chuyenMon !== uc.mon) return -1;
            if (a.tiet.chuyenMon !== uc.mon && b.tiet.chuyenMon === uc.mon) return 1;
            return 0;
          });
          for (const item of gvOtherTiets) {
            const slotKey = `${item.ngay.thu}-${item.ngay.buoi}-${item.tiet.tiet}`;
            if (usedSlotKeys.has(slotKey)) continue;
            if (!isValidSlotForMon(item.ngay.thu, item.ngay.buoi, item.tiet.tiet)) continue;
            // === THỰC HIỆN MOVE ===
            const sourceLop = lopById.get(item.tkb.lop.toString());
            const sourcePh = (sourceLop?.phanHieu || '').trim();
            const sourceTietMon = item.tiet.chuyenMon;
            // Xóa khỏi source
            item.ngay.tiets = item.ngay.tiets.filter(t => t !== item.tiet);
            if (item.ngay.tiets.length === 0) {
              item.tkb.ngayTrongTuan = item.tkb.ngayTrongTuan.filter(n => n !== item.ngay);
            }
            // Cập nhật tiết - đổi môn thành uc.mon (nếu khác) + đánh dấu điều chuyển
            item.tiet.chuyenMon = uc.mon;
            item.tiet.ghiChuDieuChuyen = true;
            item.tiet.tuUnresolved = true;
            item.tiet.tuLop = item.tkb.lop;
            item.tiet.tuPhanHieu = sourcePh;
            // Thêm vào target
            let ngay = tkb.ngayTrongTuan.find(n => n.thu === item.ngay.thu && n.buoi === item.ngay.buoi);
            if (!ngay) {
              ngay = { thu: item.ngay.thu, buoi: item.ngay.buoi, tiets: [] };
              tkb.ngayTrongTuan.push(ngay);
            }
            ngay.tiets.push(item.tiet);
            ngay.tiets.sort((a, b) => a.tiet - b.tiet);
            await item.tkb.save();
            await tkb.save();
            moveInfo = {
              sourceTietMon,
              sourcePh,
              sourceLop: sourceLop?.tenLop || '?',
            };
            resolvedCases.push({
              lop: uc.lop,
              mon: uc.mon,
              gvTen: gv.hoTen,
              phanHieu: targetPhanHieu,
              thu: item.ngay.thu,
              buoi: item.ngay.buoi,
              tiet: item.tiet.tiet,
              action: 'move',
              tuLop: moveInfo.sourceLop,
              tuPhanHieu: moveInfo.sourcePh,
              tuMon: moveInfo.sourceTietMon,
            });
            const monChanged = sourceTietMon !== uc.mon ? `(đổi môn: ${sourceTietMon} → ${uc.mon})` : '(cùng môn)';
            console.log(`[assignOverflow]   🔄 MOVE: ${gv.hoTen} từ lớp "${moveInfo.sourceLop}"[PH:${moveInfo.sourcePh}] T${item.ngay.thu}(${item.ngay.buoi}) tiết ${item.tiet.tiet} → lớp "${uc.lop}"[PH:${targetPhanHieu}] môn "${uc.mon}" ${monChanged}`);
            placed = true;
            break;
          }
        }
        if (!placed) {
          console.log(`[assignOverflow]   ⚠️ Lớp "${uc.lop}" môn "${uc.mon}" - đã thử ${candidateGvs.length} GV, không ADD/MOVE được → vẫn unresolved`);
          stillUnresolved.push(uc);
        }
      }

      // T�ng kết Bước 0
      const moveCnt = resolvedCases.filter(r => r.action === 'move').length;
      const addCnt = resolvedCases.filter(r => r.action === 'add').length;
      console.log(`[assignOverflow] ─────────────────────────────────────────────────────`);
      console.log(`[assignOverflow] Kết quả Bước 0: resolved=${resolvedCases.length} (add=${addCnt}, move=${moveCnt}) | stillUnresolved=${stillUnresolved.length}`);
      console.log(`[assignOverflow] ═══════════════════════════════════════════════════════\n`);

      // Cập nhật WarningLog - xóa các case đã giải quyết
      try {
        if (stillUnresolved.length === 0) {
          await WarningLog.deleteOne({ namHoc, type: 'unresolved' });
        } else {
          await WarningLog.updateOne(
            { namHoc, type: 'unresolved' },
            {
              $set: {
                missingClasses: stillUnresolved,
                message: `Còn ${stillUnresolved.length} lớp-môn không điều chuyển được`,
                'summary.totalMissingClasses': stillUnresolved.length,
              },
            }
          );
        }
      } catch (wlErr) {
        console.warn('[assignOverflow] Failed to update WarningLog:', wlErr.message);
      }
    }

    // Refresh allTkbs: lấy lại toàn bộ TKB sau khi unresolved đã được lưu
    // (thay vì push thêm, để tránh duplicate 21+21 = 42 phần tử)
    allTkbs = await ThoiKhoaBieu.find({ namHoc });
    for (const tkb of allTkbs) {
      tkbByLop.set(tkb.lop.toString(), tkb);
    }

      // === Tính số tiết ĐÃ DẠY (gvTeachCount) ===
      // Chỉ đếm tiết tại phân hiệu = phanHieuChinh của GV
      const gvTeachCount = new Map(); // gvId -> { gv, phanHieuChinh, soTietDaDay, soTietDinhMuc, soTietDangDu }
      for (const gv of giaoViens) {
        const gvId = gv._id.toString();
        const phanHieuChinh = (gv.phanHieu || '').trim();
        let soTietDaDay = 0;

        for (const tkb of allTkbs) {
          // Tra phanHieu của lớp từ map O(1) thay vì lops.find()
          const lopPhanHieu = lopPhanHieuById.get(tkb.lop.toString()) || '';
          // Chỉ đếm tiết tại phân hiệu = phanHieuChinh của GV
          if (phanHieuChinh && lopPhanHieu !== phanHieuChinh) continue;
          for (const ngay of tkb.ngayTrongTuan || []) {
            for (const tiet of ngay.tiets || []) {
              if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
                soTietDaDay++;
              }
            }
          }
        }

        const soTietDinhMuc = calcDinhMuc(gv);
        const soTietDangDu = Math.max(0, soTietDaDay - soTietDinhMuc);
        gvTeachCount.set(gvId, { gv, phanHieuChinh, soTietDaDay, soTietDinhMuc, soTietDangDu });
      }

    onProgress(15, 'count', `Đã tính số tiết ${gvTeachCount.size} GV`);

    // === Bước 2: Tính soTietThieu cho mỗi phân hiệu ===
    const phanHieuNeed = new Map(); // phanHieu -> { required, actual, soTietThieu, lops: [] }
    for (const lop of lops) {
      const ph = (lop.phanHieu || '').trim() || '(không rõ)';
      if (!phanHieuNeed.has(ph)) {
        phanHieuNeed.set(ph, {
          phanHieu: ph,
          required: 0,
          actual: 0,
          soTietThieu: 0,
          lops: [],
        });
      }
      const phInfo = phanHieuNeed.get(ph);
      phInfo.lops.push(lop);
      // Tổng tiết yêu cầu theo chuyenMons
      for (const cm of lop.chuyenMons || []) {
        phInfo.required += cm.soTietTuan || 0;
      }
      // Tổng tiết đã xếp
      const tkb = tkbByLop.get(lop._id.toString());
      if (tkb) {
        for (const ngay of tkb.ngayTrongTuan || []) {
          phInfo.actual += (ngay.tiets || []).length;
        }
      }
      phInfo.soTietThieu = Math.max(0, phInfo.required - phInfo.actual);
    }

    onProgress(25, 'count', `Đã tính nhu cầu ${phanHieuNeed.size} phân hiệu`);

    // === Bước 3: Match GV dư với phân hiệu thiếu ===
    // Tạo danh sách GV dư, sắp theo số tiết dư giảm dần
    const gvDuList = [...gvTeachCount.values()]
      .filter(info => info.soTietDangDu > 0)
      .sort((a, b) => b.soTietDangDu - a.soTietDangDu);

    const allSlots = generateAllSlots();
    let tongSoTietDieuChuyen = 0;
    const lichSuDieuChuyen = []; // {gvTen, tuPhanHieu, denPhanHieu, lopTen, mon, thu, buoi, tiet}

    for (const gvInfo of gvDuList) {
      const gvId = gvInfo.gv._id.toString();
      const phanHieuDieuChuyen = (gvInfo.gv.phanHieuDieuChuyen || '').trim();
      let tietConDu = gvInfo.soTietDangDu;

      while (tietConDu > 0) {
        // Tìm phân hiệu thiếu phù hợp
        let targetPhInfo = null;
        // Ưu tiên 1: gv.phanHieuDieuChuyen (nếu có và đang thiếu)
        if (phanHieuDieuChuyen && phanHieuNeed.has(phanHieuDieuChuyen)) {
          const ph = phanHieuNeed.get(phanHieuDieuChuyen);
          if (ph.soTietThieu > 0 && ph.phanHieu !== gvInfo.phanHieuChinh) {
            targetPhInfo = ph;
          }
        }
        // Ưu tiên 2: phân hiệu thiếu nhiều nhất (khác phanHieuChinh)
        if (!targetPhInfo) {
          const sortedPh = [...phanHieuNeed.values()]
            .filter(ph => ph.soTietThieu > 0 && ph.phanHieu !== gvInfo.phanHieuChinh)
            .sort((a, b) => b.soTietThieu - a.soTietThieu);
          targetPhInfo = sortedPh[0] || null;
        }
        if (!targetPhInfo) break; // hết phân hiệu thiếu

        // Tìm lớp trong phân hiệu target còn thiếu tiết
        const targetLops = targetPhInfo.lops.filter(l => {
          const tkb = tkbByLop.get(l._id.toString());
          if (!tkb) return false;
          const actual = (tkb.ngayTrongTuan || []).reduce(
            (sum, ngay) => sum + (ngay.tiets || []).length, 0
          );
          const required = (l.chuyenMons || []).reduce((sum, cm) => sum + (cm.soTietTuan || 0), 0);
          return actual < required;
        });
        if (targetLops.length === 0) {
          targetPhInfo.soTietThieu = 0; // đánh dấu không thiếu nữa
          continue;
        }

        // Xếp 1 tiết cho GV dư vào 1 lớp trong phân hiệu target
        let xepDuocVongNay = false;
        for (const lop of targetLops) {
          const tkb = tkbByLop.get(lop._id.toString());
          if (!tkb) continue;
          // Tìm môn mà GV này có chuyên môn VÀ lớp còn thiếu
          const gvChuyenMonSet = new Set(
            (gvInfo.gv.chuyenMon || []).map(cm => cm.tenChuyenMon)
          );
          const lopChuyenMons = lop.chuyenMons || [];
          // Đếm mỗi môn đã xếp bao nhiêu tiết trong lớp
          const lopMonDaXep = new Map();
          for (const ngay of tkb.ngayTrongTuan || []) {
            for (const tiet of ngay.tiets || []) {
              lopMonDaXep.set(tiet.chuyenMon, (lopMonDaXep.get(tiet.chuyenMon) || 0) + 1);
            }
          }
          // Môn cần xếp: GV dạy được + lớp còn thiếu
          const monCanXep = lopChuyenMons.find(cm =>
            gvChuyenMonSet.has(cm.tenChuyenMon) &&
            (lopMonDaXep.get(cm.tenChuyenMon) || 0) < (cm.soTietTuan || 0)
          );
          if (!monCanXep) continue;

          // Tìm slot trống trong lớp này
          const usedSlotKeys = new Set();
          for (const ngay of tkb.ngayTrongTuan || []) {
            for (const tiet of ngay.tiets || []) {
              usedSlotKeys.add(`${ngay.thu}-${ngay.buoi}-${tiet.tiet}`);
            }
          }
          // GV busy
          const gvBusySlots = new Set();
          for (const otherTkb of allTkbs) {
            for (const ngay of otherTkb.ngayTrongTuan || []) {
              for (const tiet of ngay.tiets || []) {
                if (tiet.giaoVien && tiet.giaoVien.toString() === gvId) {
                  gvBusySlots.add(`${ngay.thu}-${ngay.buoi}-${tiet.tiet}`);
                }
              }
            }
          }

          // Sắp xếp slot theo thứ tự: tiết phù hợp với buổi (sáng 1-4, chiều 5-7)
          let chosenSlot = null;
          for (const slot of allSlots) {
            if (usedSlotKeys.has(slot.key)) continue;
            if (gvBusySlots.has(slot.key)) continue;
            // Skip chào cờ
            if (slot.buoi === 'sang' && slot.tiet === 1 && slot.thu === 2) continue;
            // Kiểm tra "1 buổi 1 môn": nếu buổi đó đã có môn này → skip
            const coMonTrongBuoi = (tkb.ngayTrongTuan || []).some(ngay =>
              ngay.thu === slot.thu && ngay.buoi === slot.buoi &&
              ngay.tiets.some(t => t.chuyenMon === monCanXep.tenChuyenMon)
            );
            if (coMonTrongBuoi) continue;
            // Kiểm tra chặn cứng Tin học/CN cạnh nhau
            const MON_DAT_BIET = new Set(['Tin học', 'Công nghệ']);
            if (MON_DAT_BIET.has(monCanXep.tenChuyenMon)) {
              const canhNhau = (tkb.ngayTrongTuan || []).some(ngay =>
                ngay.thu === slot.thu && ngay.buoi === slot.buoi &&
                ngay.tiets.some(t => t.chuyenMon === monCanXep.tenChuyenMon &&
                  Math.abs(t.tiet - slot.tiet) === 1)
              );
              if (canhNhau) continue;
            }
            chosenSlot = slot;
            break;
          }
          if (!chosenSlot) continue;

          // Commit tiết
          let ngay = tkb.ngayTrongTuan.find(n => n.thu === chosenSlot.thu && n.buoi === chosenSlot.buoi);
          if (!ngay) {
            ngay = { thu: chosenSlot.thu, buoi: chosenSlot.buoi, tiets: [] };
            tkb.ngayTrongTuan.push(ngay);
          }
          ngay.tiets.push({
            tiet: chosenSlot.tiet,
            giaoVien: gvInfo.gv._id,
            chuyenMon: monCanXep.tenChuyenMon,
            ghiChuDieuChuyen: true,
          });
          ngay.tiets.sort((a, b) => a.tiet - b.tiet);
          await tkb.save();

          lichSuDieuChuyen.push({
            gvTen: gvInfo.gv.hoTen,
            tuPhanHieu: gvInfo.phanHieuChinh || '(không rõ)',
            denPhanHieu: targetPhInfo.phanHieu,
            lopTen: lop.tenLop,
            mon: monCanXep.tenChuyenMon,
            thu: chosenSlot.thu,
            buoi: chosenSlot.buoi,
            tiet: chosenSlot.tiet,
          });

          tongSoTietDieuChuyen++;
          tietConDu--;
          targetPhInfo.soTietThieu = Math.max(0, targetPhInfo.soTietThieu - 1);
          xepDuocVongNay = true;
          break;
        }
        if (!xepDuocVongNay) {
          // Không xếp được tiết nào vào phân hiệu này → thoát loop tránh kẹt
          targetPhInfo.soTietThieu = 0;
        }
      }
    }

    onProgress(95, 'save', 'Hoàn tất');
    onProgress(100, 'done', 'Xong');

    // Tổng hợp kết quả
    const nhanhCheGV = [];
    for (const info of gvTeachCount.values()) {
      nhanhCheGV.push({
        gv: info.gv.hoTen,
        phanHieu: info.phanHieuChinh,
        soTietDaDay: info.soTietDaDay,
        soTietDinhMuc: info.soTietDinhMuc,
        soTietDu: info.soTietDangDu,
      });
    }

    return {
      success: true,
      partialSuccess: stillUnresolved.length > 0,
      message: resolvedCases.length > 0
        ? `Đã điều chuyển ${resolvedCases.length} lớp-môn từ WarningLog + ${tongSoTietDieuChuyen} tiết từ GV dư. Còn ${stillUnresolved.length} case chưa giải quyết được.`
        : (tongSoTietDieuChuyen > 0
          ? `Đã điều chuyển ${tongSoTietDieuChuyen} tiết cho ${gvDuList.length} GV`
          : (unresolvedCases.length === 0 ? 'Không có GV dư để điều chuyển' : 'Không thể điều chuyển các case unresolved')),
      tongSoTietDieuChuyen,
      soGVDu: gvDuList.length,
      resolvedFromUnresolved: resolvedCases,
      stillUnresolved,
      soStillUnresolved: stillUnresolved.length,
      lichSuDieuChuyen,
      nhanhCheGV,
    };

  } catch (error) {
    console.error('Error assignOverflow:', error);
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

/**
 * Fill in các tiết bị thiếu cho các lớp sau khi user kéo thả với GV bị khóa
 * - lockedGVs: danh sách GV được bảo vệ (không xếp vào slot đã có)
 * - lockedSlots: Map<gvId, [{thu, buoi, tiet, lopId}]> - các slot đã lock
 * Logic:
 *   1. Tìm các lớp thiếu tiết
 *   2. Với mỗi lớp, xếp các slot trống, tránh slot bị lock
 */
async function fillMissingPeriods(namHoc, lockedGVs = [], lockedSlots = new Map()) {
  const allTkbs = await ThoiKhoaBieu.find({ namHoc }).populate({
    path: 'lop',
    populate: { path: 'khoi' }
  });
  const allGVs = await GiaoVien.find({});
  const allLops = await Lop.find({}).populate('khoi');

  // GV busy map
  const gvBusy = new Map();
  for (const gv of allGVs) {
    gvBusy.set(gv._id.toString(), new Set());
  }
  for (const tkb of allTkbs) {
    for (const ngay of tkb.ngayTrongTuan) {
      for (const tiet of ngay.tiets) {
        if (tiet.giaoVien) {
          const key = `${ngay.thu}-${ngay.buoi}-${tiet.tiet}`;
          if (!gvBusy.has(tiet.giaoVien.toString())) {
            gvBusy.set(tiet.giaoVien.toString(), new Set());
          }
          gvBusy.get(tiet.giaoVien.toString()).add(key);
        }
      }
    }
  }

  // GV by chuyên môn
  const gvByChuyenMon = new Map();
  for (const gv of allGVs) {
    for (const cm of gv.chuyenMon || []) {
      if (!gvByChuyenMon.has(cm.tenChuyenMon)) {
        gvByChuyenMon.set(cm.tenChuyenMon, []);
      }
      gvByChuyenMon.get(cm.tenChuyenMon).push(gv);
    }
  }

  let filled = 0;
  const errors = [];

  // Tất cả slots khả dụng
  const allSlots = [];
  for (const thu of TKB_CONFIG.weekdays) {
    for (const [buoi, config] of Object.entries(TKB_CONFIG.sessions)) {
      const tiets = [];
      for (let t = config.tietBatDau; t <= config.tietKetThuc; t++) {
        if (buoi === 'sang' && thu === 2 && t === 1) continue; // chào cờ
        tiets.push(t);
      }
      for (const tiet of tiets) {
        allSlots.push({ thu, buoi, tiet, key: `${thu}-${buoi}-${tiet}` });
      }
    }
  }

  // Lặp qua các lớp
  for (const tkb of allTkbs) {
    const lopId = tkb.lop._id.toString();
    const khoi = tkb.lop.khoi;
    const requiredTiet = (khoi.cauHinhTKB || []).reduce((s, c) => s + c.soTiet, 0);
    const currentTiet = tkb.ngayTrongTuan.reduce((s, n) => s + n.tiets.length, 0);

    let missing = requiredTiet - currentTiet;
    if (missing <= 0) continue;

    // Lấy các slot đã dùng
    const usedSlots = new Set();
    for (const ngay of tkb.ngayTrongTuan) {
      for (const tiet of ngay.tiets) {
        usedSlots.add(`${ngay.thu}-${ngay.buoi}-${tiet.tiet}`);
      }
    }

    // Lấy các chuyên môn cần xếp (thiếu môn nào xếp môn đó)
    // Đếm tiết hiện tại theo môn
    const currentByMon = {};
    for (const ngay of tkb.ngayTrongTuan) {
      for (const tiet of ngay.tiets) {
        currentByMon[tiet.chuyenMon] = (currentByMon[tiet.chuyenMon] || 0) + 1;
      }
    }

    // Các môn cần thêm
    const needMons = [];
    for (const c of khoi.cauHinhTKB || []) {
      const have = currentByMon[c.tenChuyenMon] || 0;
      const need = c.soTiet - have;
      for (let i = 0; i < need; i++) {
        needMons.push(c.tenChuyenMon);
      }
    }

    // Sort môn theo nhiều tiết trước
    needMons.sort();

    for (const mon of needMons) {
      // Tìm GV có thể dạy môn này
      const gvList = (gvByChuyenMon.get(mon) || [])
        .filter(g => !lockedGVs.includes(g._id.toString())) // tránh GV bị khóa
        .sort((a, b) => {
          const aCount = gvBusy.get(a._id.toString())?.size || 0;
          const bCount = gvBusy.get(b._id.toString())?.size || 0;
          return aCount - bCount;
        });

      let placed = false;
      for (const gv of gvList) {
        // Tìm slot trống
        for (const slot of allSlots) {
          if (usedSlots.has(slot.key)) continue;
          if (gvBusy.get(gv._id.toString())?.has(slot.key)) continue;

          // Tìm hoặc tạo ngày
          let ngay = tkb.ngayTrongTuan.find(
            n => n.thu === slot.thu && n.buoi === slot.buoi
          );
          if (!ngay) {
            ngay = { thu: slot.thu, buoi: slot.buoi, tiets: [] };
            tkb.ngayTrongTuan.push(ngay);
          }
          
          // Check mỗi buổi chỉ 1 môn
          const daCoMon = ngay.tiets.find(t => t.chuyenMon === mon);
          if (daCoMon) continue;

          // Đặt tiết
          ngay.tiets.push({
            tiet: slot.tiet,
            giaoVien: gv._id,
            chuyenMon: mon
          });
          ngay.tiets.sort((a, b) => a.tiet - b.tiet);
          
          usedSlots.add(slot.key);
          gvBusy.get(gv._id.toString()).add(slot.key);
          
          filled++;
          placed = true;
          break;
        }
        if (placed) break;
      }

      if (!placed) {
        errors.push(`Lớp ${tkb.lop.tenLop}: Không thể xếp môn ${mon}`);
      }
    }

    await tkb.save();
  }

  return { filled, errors };
}

/**
 * Rearrange Atomic: Sau khi applyBatch đã save TKB, hàm này phát hiện conflict
 * (GV dạy 2 lớp cùng slot, mỗi buổi 1 môn bị vi phạm, ...) và cố gắng sắp xếp lại
 * chỉ các slot bị conflict. Giữ nguyên các slot đã khóa.
 *
 * @param {string} namHoc
 * @param {Object} options
 * @param {string[]} options.lockedGVs - danh sách GV id được bảo vệ tuyệt đối
 * @returns {Promise<{rearranged: number, conflicts: Array, warnings: Array}>}
 */
async function rearrangeAtomic(namHoc, options = {}) {
  const { lockedGVs = [] } = options;
  const allTkbs = await ThoiKhoaBieu.find({ namHoc }).populate({
    path: 'lop',
    populate: { path: 'khoi' }
  });
  const allGVs = await GiaoVien.find({});

  // Map gvId -> { hoTen, chuyenMonList } để hiển thị thân thiện
  const gvInfo = new Map();
  for (const gv of allGVs) {
    gvInfo.set(gv._id.toString(), {
      hoTen: gv.hoTen,
      chuyenMonList: (gv.chuyenMon || []).map(c => c.tenChuyenMon).join(', ')
    });
  }
  const gvTen = (id) => {
    const info = gvInfo.get(id);
    return info ? info.hoTen : id;
  };
  const gvCM = (id) => {
    const info = gvInfo.get(id);
    return info ? info.chuyenMonList : '';
  };

  // Build GV busy map từ TKB hiện tại
  const gvBusy = new Map();
  for (const gv of allGVs) {
    gvBusy.set(gv._id.toString(), new Set());
  }
  for (const tkb of allTkbs) {
    for (const ngay of tkb.ngayTrongTuan) {
      for (const tiet of ngay.tiets) {
        if (tiet.giaoVien) {
          const key = `${ngay.thu}-${ngay.buoi}-${tiet.tiet}`;
          gvBusy.get(tiet.giaoVien.toString()).add(key);
        }
      }
    }
  }

  const conflicts = [];
  const warnings = [];
  let rearranged = 0;

  // Bước 1: Phát hiện conflict - GV dạy 2 lớp cùng slot
  for (const tkb of allTkbs) {
    for (const ngay of tkb.ngayTrongTuan) {
      for (const tiet of ngay.tiets) {
        if (!tiet.giaoVien) continue;
        const gvId = tiet.giaoVien.toString();
        if (lockedGVs.includes(gvId)) continue; // GV khóa: bỏ qua
        const slotKey = `${ngay.thu}-${ngay.buoi}-${tiet.tiet}`;
        // Tìm slot trùng ở TKB khác
        for (const otherTkb of allTkbs) {
          if (otherTkb._id.toString() === tkb._id.toString()) continue;
          for (const otherNgay of otherTkb.ngayTrongTuan) {
            for (const otherTiet of otherNgay.tiets) {
              if (!otherTiet.giaoVien) continue;
              if (otherTiet.giaoVien.toString() !== gvId) continue;
              if (otherNgay.thu !== ngay.thu || otherNgay.buoi !== ngay.buoi || otherTiet.tiet !== tiet.tiet) continue;
              // Tìm thấy conflict
              conflicts.push({
                type: 'GV_TRUNG_LICH',
                gvId,
                gvTen: gvTen(gvId),
                gvChuyenMon: gvCM(gvId),
                thu: ngay.thu,
                buoi: ngay.buoi,
                tiet: tiet.tiet,
                chuyenMon: tiet.chuyenMon,
                classes: [tkb.lop.tenLop, otherTkb.lop.tenLop]
              });
            }
          }
        }
      }
    }
  }

  // Bước 2: Nhóm conflict theo (thu, buoi, tiet, gvId)
  const conflictGroups = new Map();
  for (const c of conflicts) {
    const key = `${c.gvId}-${c.thu}-${c.buoi}-${c.tiet}`;
    if (!conflictGroups.has(key)) conflictGroups.set(key, []);
    conflictGroups.get(key).push(c);
  }

  // Bước 3: Với mỗi nhóm, thử đổi slot của các lớp không ưu tiên
  // Quy tắc: ưu tiên giữ slot cho lớp có lopId trong lockedLops (nếu có), hoặc giữ slot cho TKB đầu tiên trong nhóm
  for (const [key, group] of conflictGroups) {
    if (group.length < 2) continue;
    const [gvId, thu, buoi, tiet] = key.split('-');
    // Lấy TKB của các lớp trong group
    const tkbInGroup = [];
    for (const c of group) {
      const tkb = allTkbs.find(t => t.lop.tenLop === c.classes[0]);
      if (tkb) tkbInGroup.push({ tkb, tenLop: c.classes[0] });
    }
    if (tkbInGroup.length < 2) continue;

    // Giữ lại TKB đầu tiên, tìm slot mới cho các TKB còn lại
    const keepTkb = tkbInGroup[0];
    const moveTkbs = tkbInGroup.slice(1);

    // Tất cả slot khả dụng (cùng buổi, các thứ khác)
    const candidateSlots = [];
    for (const otherThu of TKB_CONFIG.weekdays) {
      if (otherThu === parseInt(thu)) continue; // bỏ qua slot conflict
      candidateSlots.push({ thu: otherThu, buoi, tiet: parseInt(tiet) });
    }

    for (const { tkb: moveTkb, tenLop } of moveTkbs) {
      let moved = false;
      // Tìm tiết đang có GV conflict trong TKB
      for (const ngay of moveTkb.ngayTrongTuan) {
        if (ngay.thu !== parseInt(thu) || ngay.buoi !== buoi) continue;
        const idx = ngay.tiets.findIndex(t => t.tiet === parseInt(tiet) && t.giaoVien?.toString() === gvId);
        if (idx === -1) continue;
        const conflictTiet = ngay.tiets[idx];

        // Tìm slot mới cho GV này (cùng buổi, khác thứ, GV không bận)
        for (const slot of candidateSlots) {
          const slotKey = `${slot.thu}-${slot.buoi}-${slot.tiet}`;
          if (gvBusy.get(gvId).has(slotKey)) continue;
          // Check slot đó có trống trong TKB moveTkb không
          const slotNgay = moveTkb.ngayTrongTuan.find(n => n.thu === slot.thu && n.buoi === slot.buoi);
          if (slotNgay?.tiets.some(t => t.tiet === slot.tiet)) continue;
          // Đổi slot
          ngay.tiets.splice(idx, 1);
          // Cập nhật busy
          gvBusy.get(gvId).delete(`${thu}-${buoi}-${tiet}`);
          gvBusy.get(gvId).add(slotKey);
          // Thêm vào ngày mới
          let newNgay = moveTkb.ngayTrongTuan.find(n => n.thu === slot.thu && n.buoi === slot.buoi);
          if (!newNgay) {
            newNgay = { thu: slot.thu, buoi: slot.buoi, tiets: [] };
            moveTkb.ngayTrongTuan.push(newNgay);
          }
          newNgay.tiets.push({
            tiet: slot.tiet,
            giaoVien: conflictTiet.giaoVien,
            chuyenMon: conflictTiet.chuyenMon
          });
          newNgay.tiets.sort((a, b) => a.tiet - b.tiet);
          // Xóa ngày rỗng
          if (ngay.tiets.length === 0) {
            moveTkb.ngayTrongTuan = moveTkb.ngayTrongTuan.filter(n => !(n.thu === ngay.thu && n.buoi === ngay.buoi));
          }
          await moveTkb.save();
          warnings.push(`${gvTen(gvId)}: đã chuyển tiết ${tiet} môn ${conflictTiet.chuyenMon} (lớp ${tenLop}) từ thứ ${thu} sang thứ ${slot.thu}`);
          rearranged++;
          moved = true;
          break;
        }
        if (moved) break;
      }
      if (!moved) {
        warnings.push(`Không thể tự động sắp xếp lại tiết cho lớp ${tenLop} - GV ${gvTen(gvId)} (${gvCM(gvId)})`);
      }
    }
  }

  return { rearranged, conflicts, warnings };
}

module.exports = {
  autoGenerateTKB,
  autoGenerateByPhanHieu,
  assignOverflow,
  getTKBByLop,
  getTKBByGiaoVien,
  checkGVConflicts,
  getChuyenMonByKhoi,
  exportTKBToExcel,
  fillMissingPeriods,
  rearrangeAtomic,
  TKB_CONFIG
};
