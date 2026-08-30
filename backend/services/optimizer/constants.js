'use strict';

/**
 * Constants và config cho TKB service.
 * Tách ra để dễ bảo trì và tái sử dụng.
 */

const TKB_CONFIG = {
  weekdays: [2, 3, 4, 5, 6],
  sessions: {
    sang: { tietBatDau: 1, tietKetThuc: 4, coChaoCo: true },
    chieu: { tietBatDau: 5, tietKetThuc: 7, coChaoCo: false }
  },
  chuyenMonMacDinh: {
    1: { 'Toán': 4, 'Tiếng Việt': 5, 'Đạo đức': 1, 'Thể dục': 2, 'Giáo dục thể chất': 1, 'Âm nhạc': 1, 'Mỹ thuật': 1, 'Tự nhiên và Xã hội': 2, 'Tin học': 1 },
    2: { 'Toán': 4, 'Tiếng Việt': 5, 'Đạo đức': 1, 'Thể dục': 2, 'Giáo dục thể chất': 1, 'Âm nhạc': 1, 'Mỹ thuật': 1, 'Khoa học': 2, 'Tin học': 1 },
    3: { 'Toán': 4, 'Tiếng Việt': 5, 'Đạo đức': 1, 'Thể dục': 2, 'Giáo dục thể chất': 1, 'Âm nhạc': 1, 'Mỹ thuật': 1, 'Khoa học': 2, 'Tiếng Anh': 2, 'Tin học': 1 },
    4: { 'Toán': 5, 'Tiếng Việt': 5, 'Khoa học': 2, 'Lịch sử và Địa lý': 2, 'Đạo đức': 1, 'Thể dục': 2, 'Giáo dục thể chất': 1, 'Âm nhạc': 1, 'Mỹ thuật': 1, 'Tiếng Anh': 3, 'Tin học': 1, 'Công nghệ': 1 },
    5: { 'Toán': 5, 'Tiếng Việt': 5, 'Khoa học': 2, 'Lịch sử và Địa lý': 2, 'Đạo đức': 1, 'Thể dục': 2, 'Giáo dục thể chất': 1, 'Âm nhạc': 1, 'Mỹ thuật': 1, 'Tiếng Anh': 3, 'Tin học': 1, 'Công nghệ': 1 }
  }
};

const TONG_SO_TIET_TOI_DA = TKB_CONFIG.weekdays.length * 6;

/**
 * Helpers cho slot keys và buổi.
 */
function createSlotKey(thu, buoi, tiet) {
  return `${thu}-${buoi}-${tiet}`;
}

function parseSlotKey(slotKey) {
  const [thuStr, buoi, tietStr] = slotKey.split('-');
  return { thu: parseInt(thuStr, 10), buoi, tiet: parseInt(tietStr, 10) };
}

function createSessionKey(thu, buoi) {
  return `${thu}-${buoi}`;
}

function inferBuoiFromTiet(tiet) {
  if (tiet == null || Number.isNaN(Number(tiet))) return null;
  const tietValue = Number(tiet);
  if (tietValue >= 5) return 'chieu';
  if (tietValue >= 1) return 'sang';
  return null;
}

function normalizeSessionBuoi(ngay, tiet = null) {
  const explicitBuoi = typeof ngay?.buoi === 'string' ? ngay.buoi.trim().toLowerCase() : '';
  if (explicitBuoi === 'sang' || explicitBuoi === 'chieu') return explicitBuoi;
  const inferredBuoi = inferBuoiFromTiet(tiet ?? ngay?.tiet ?? null);
  if (inferredBuoi) return inferredBuoi;
  return 'sang';
}

function resolveSessionKey(ngay, tiet = null) {
  return `${ngay.thu}-${normalizeSessionBuoi(ngay, tiet)}`;
}

function isValidTietForBuoi(tiet, buoi) {
  const config = TKB_CONFIG.sessions[buoi];
  if (!config) return false;
  return tiet >= config.tietBatDau && tiet <= config.tietKetThuc;
}

module.exports = {
  TKB_CONFIG,
  TONG_SO_TIET_TOI_DA,
  createSlotKey,
  parseSlotKey,
  createSessionKey,
  inferBuoiFromTiet,
  normalizeSessionBuoi,
  resolveSessionKey,
  isValidTietForBuoi,
};
