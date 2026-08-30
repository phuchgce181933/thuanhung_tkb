'use strict';

/**
 * Test các module optimizer sau khi tách refactor.
 * Chạy: node test/optimizer.test.js
 */

const {
  TKB_CONFIG,
  createSlotKey,
  createSessionKey,
  isValidTietForBuoi,
  SlotFinder,
  ScheduleOps,
  SessionOptimizer,
  generateAllSlots,
} = require('../services/optimizer');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${msg}`);
  }
}

console.log('\n=== Test 1: Constants & helpers ===');
assert(createSlotKey(2, 'sang', 1) === '2-sang-1', 'createSlotKey');
assert(createSessionKey(3, 'chieu') === '3-chieu', 'createSessionKey');
assert(isValidTietForBuoi(3, 'sang') === true, 'isValidTietForBuoi sang tiet 3');
assert(isValidTietForBuoi(7, 'chieu') === true, 'isValidTietForBuoi chieu tiet 7');
assert(isValidTietForBuoi(7, 'sang') === false, 'isValidTietForBuoi sai buoi');
assert(isValidTietForBuoi(4, 'chieu') === false, 'isValidTietForBuoi sai buoi 2');

console.log('\n=== Test 2: generateAllSlots ===');
const slots = generateAllSlots();
assert(slots.length === 34, `allSlots count = 34 (got ${slots.length})`);
assert(!slots.some(s => s.thu === 2 && s.buoi === 'sang' && s.tiet === 1), 'Loại chào cờ');

console.log('\n=== Test 3: SlotFinder ===');
const mockData = [
  {
    lop: { _id: 'lop1', phanHieu: 'Chính' },
    lopSchedule: [
      { thu: 2, buoi: 'sang', tiets: [{ tiet: 2, giaoVien: 'gv1', chuyenMon: 'Toán' }] },
      { thu: 4, buoi: 'chieu', tiets: [{ tiet: 5, giaoVien: 'gv1', chuyenMon: 'Toán' }] },
    ]
  }
];
const finder = new SlotFinder(mockData);
const busy = finder.busySetForGV('gv1');
assert(busy.has('2-sang-2'), 'gv1 busy T2-sang-t2');
assert(busy.has('4-chieu-5'), 'gv1 busy T4-chieu-t5');
assert(!busy.has('3-sang-1'), 'gv1 không bận T3-sang-t1');

const available = finder.findAvailableSlotsInSession(3, 'sang', 'gv1', 'lop1');
assert(available.length === 4, `T3-sang có 4 slot khả dĩ (got ${available.length})`);

console.log('\n=== Test 4: ScheduleOps.moveSingleTiet ===');
const ops = new ScheduleOps(mockData);
const result = ops.moveSingleTiet(
  { lopId: 'lop1', thu: 2, buoi: 'sang', tiet: 2, chuyenMon: 'Toán' },
  3, 'sang', 2, { _id: 'gv1' }
);
assert(result === true, 'Move thành công');
const ngay = mockData[0].lopSchedule.find(n => n.thu === 3 && n.buoi === 'sang');
assert(ngay && ngay.tiets.some(t => t.tiet === 2), 'Đã thêm vào T3-sang');
assert(!mockData[0].lopSchedule.some(n => n.thu === 2 && n.buoi === 'sang'), 'Đã xóa khỏi T2-sang');

console.log('\n=== Test 5: SessionOptimizer - gom session ===');
// Mock: GV có 3 buổi, desired = 2
const dataCokim = [
  {
    lop: { _id: 'lopA', phanHieu: 'Chính' },
    lopSchedule: [
      { thu: 7, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gvA', chuyenMon: 'Tin học' }] },
    ]
  },
  {
    lop: { _id: 'lopB', phanHieu: 'Chính' },
    lopSchedule: [
      { thu: 4, buoi: 'chieu', tiets: [{ tiet: 5, giaoVien: 'gvA', chuyenMon: 'Công nghệ' }] },
    ]
  },
  {
    lop: { _id: 'lopC', phanHieu: 'Chính' },
    lopSchedule: [
      { thu: 5, buoi: 'sang', tiets: [{ tiet: 2, giaoVien: 'gvA', chuyenMon: 'Tin học' }] },
    ]
  },
];
const gvA = {
  _id: 'gvA',
  hoTen: 'Nguyễn Thị Thu Kim',
  nguyenVong: { soBuoiToiDa: 2, buoiUuTien: 'ca_hai' },
};
const optimizer = new SessionOptimizer(
  dataCokim, [gvA],
  new Map(), new Map(), new Map(),
  generateAllSlots(), []
);
const stats = optimizer.run();
const finalSessions = optimizer._getCurrentSessions('gvA');
console.log(`  Final sessions: ${finalSessions.size} (mong đợi ≤ 2)`);
console.log(`  Sessions: ${[...finalSessions].join(', ')}`);
assert(finalSessions.size <= 2, 'Giảm xuống ≤ 2 buổi');

console.log('\n=== Tổng kết ===');
console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
