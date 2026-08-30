// Standalone test cho scoreGV - không cần MongoDB
// Tách phần logic để xác nhận đúng với plan

const tkbService = require('./services/tkbService');

function scoreGV(gv, slot, gvBusy, gvNgaySet) {
  const nv = gv.nguyenVong || {};

  // Hard: tôn trọng thứ nghỉ
  if (Array.isArray(nv.thuNghi) && nv.thuNghi.includes(slot.thu)) {
    return -Infinity;
  }

  // Hard: đã đạt số buổi tối đa
  if (nv.soBuoiToiDa && gvNgaySet.size >= nv.soBuoiToiDa) {
    return -Infinity;
  }

  // GV không rảnh ở slot này
  if (gvBusy.has(slot.key)) {
    return -Infinity;
  }

  let score = 0;

  if (!nv.buoiUuTien || nv.buoiUuTien === 'ca_hai' || nv.buoiUuTien === slot.buoi) {
    score += 100;
  } else {
    score -= 50;
  }

  score -= gvBusy.size * 5;

  if (nv.soBuoiToiDa && gvNgaySet.size < nv.soBuoiToiDa) {
    score += 20;
  }

  return score;
}

// ============ TEST CASES ============
let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log(`PASS ${name}: ${actual}`); }
  else { fail++; console.log(`FAIL ${name}: got ${actual}, expected ${expected}`); }
}

const baseSlot = { thu: 3, buoi: 'sang', tiet: 2, key: '3-sang-2' };

// Test 1: GV không có nguyện vọng -> điểm cao, rảnh
{
  const gv = { _id: '1' };
  const busy = new Set();
  const ngay = new Set();
  assert('no nv, slot free', scoreGV(gv, baseSlot, busy, ngay), 100);
}

// Test 2: thuNghi chứa slot.thu -> -Infinity
{
  const gv = { _id: '1', nguyenVong: { thuNghi: [3] } };
  const busy = new Set();
  const ngay = new Set();
  assert('thu nghi hits', scoreGV(gv, baseSlot, busy, ngay), -Infinity);
}

// Test 3: thuNghi không chứa -> OK
{
  const gv = { _id: '1', nguyenVong: { thuNghi: [6] } };
  const busy = new Set();
  const ngay = new Set();
  assert('thu nghi miss', scoreGV(gv, baseSlot, busy, ngay), 100);
}

// Test 4: soBuoiToiDa đã đạt -> -Infinity
{
  const gv = { _id: '1', nguyenVong: { soBuoiToiDa: 3 } };
  const busy = new Set();
  const ngay = new Set([2, 3, 4]);
  assert('soBuoiToiDa reached', scoreGV(gv, baseSlot, busy, ngay), -Infinity);
}

// Test 5: soBuoiToiDa chưa đạt + đúng buổi -> 100 + 20
{
  const gv = { _id: '1', nguyenVong: { soBuoiToiDa: 3, buoiUuTien: 'sang' } };
  const busy = new Set();
  const ngay = new Set([2]);
  assert('soBuoiToiDa + buoi match', scoreGV(gv, baseSlot, busy, ngay), 120);
}

// Test 6: buoiUuTien không khớp -> -50
{
  const gv = { _id: '1', nguyenVong: { buoiUuTien: 'chieu' } };
  const busy = new Set();
  const ngay = new Set();
  assert('buoi khong match', scoreGV(gv, baseSlot, busy, ngay), 50);
}

// Test 7: ca_hai -> +100
{
  const gv = { _id: '1', nguyenVong: { buoiUuTien: 'ca_hai' } };
  const busy = new Set();
  const ngay = new Set();
  assert('ca_hai', scoreGV(gv, baseSlot, busy, ngay), 100);
}

// Test 8: GV đã bận ở slot này -> -Infinity
{
  const gv = { _id: '1' };
  const busy = new Set(['3-sang-2']);
  const ngay = new Set();
  assert('GV busy at slot', scoreGV(gv, baseSlot, busy, ngay), -Infinity);
}

// Test 9: cân bằng tải - GV có 3 tiết khác
{
  const gv = { _id: '1' };
  const busy = new Set(['a', 'b', 'c']);
  const ngay = new Set();
  assert('balance load', scoreGV(gv, baseSlot, busy, ngay), 85); // 100 - 15
}

// Test 10: thuNghi không match nhưng đã đạt soBuoiToiDa -> -Infinity
{
  const gv = { _id: '1', nguyenVong: { thuNghi: [6], soBuoiToiDa: 2 } };
  const busy = new Set();
  const ngay = new Set([2, 5]);
  assert('soBuoiToiDa only', scoreGV(gv, baseSlot, busy, ngay), -Infinity);
}

// Test 11: chỉ đếm buổi ở phân hiệu gốc của GV
{
  const gv = { _id: 'gv-home', hoTen: 'GV Home', phanHieu: 'PhanHieuA' };
  const data = [
    {
      lop: { _id: 'lop-home', phanHieu: 'PhanHieuA' },
      lopSchedule: [{ thu: 2, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-home', chuyenMon: 'Toán' }] }]
    },
    {
      lop: { _id: 'lop-other', phanHieu: 'PhanHieuB' },
      lopSchedule: [{ thu: 3, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-home', chuyenMon: 'Toán' }] }]
    }
  ];
  const homeOnly = tkbService.buildGvSessionSets(data, [gv]);
  assert('home-branch-only sessions', homeOnly.get('gv-home').size, 1);
}

console.log(`\nResult: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
