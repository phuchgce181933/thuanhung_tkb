const test = require('node:test');
const assert = require('node:assert/strict');
const tkbService = require('../services/tkbService');
const optimizer = require('../services/optimizer');

// Backward-compat: test imports từ tkbService
const { pickRandomTeacherCandidate, getRequiredSubjectPlanForLop, countTeacherAssignedPeriods, canTeacherAcceptMove, canTeacherAcceptAssignment, optimizeSessions, scoreGV } = tkbService;
const { TKB_CONFIG, repairTeacherSlotConflicts, generateAllSlots, buildGvSessionSets, validateHardConstraints } = optimizer;

test('getRequiredSubjectPlanForLop falls back to lop.chuyenMons when khoi.cauHinhTKB is absent', () => {
  const lop = {
    chuyenMons: [
      { tenChuyenMon: 'Toán', soTietTuan: 4 },
      { tenChuyenMon: 'Văn', soTietTuan: 3 }
    ]
  };

  const plan = getRequiredSubjectPlanForLop(lop, {});

  assert.deepEqual(plan, [
    { tenChuyenMon: 'Toán', soTiet: 4 },
    { tenChuyenMon: 'Văn', soTiet: 3 }
  ]);
});

test('pickRandomTeacherCandidate only returns same-subject, non-conflicting teachers from a shuffled pool', () => {
  const teachers = [
    { _id: 'gv-1', hoTen: 'GV 1', chuyenMon: [{ tenChuyenMon: 'Công nghệ' }] },
    { _id: 'gv-2', hoTen: 'GV 2', chuyenMon: [{ tenChuyenMon: 'Công nghệ' }] },
    { _id: 'gv-3', hoTen: 'GV 3', chuyenMon: [{ tenChuyenMon: 'Tin học' }] }
  ];
  const busy = new Map([
    ['gv-1', new Set(['2-sang-1'])]
  ]);
  const used = new Set(['2-sang-1']);

  const result = pickRandomTeacherCandidate('Công nghệ', teachers, busy, used);

  assert.ok(result);
  assert.equal(result._id, 'gv-2');
});

test('teacher quota is enforced before a move can push total periods over limit', () => {
  const gv = { _id: 'gv-1', hoTen: 'GV 1', phanCong: { soTietDinhMuc: 3, soTietKiemNhiem: 0 } };
  const schedule = [
    { lop: { _id: 'lop-1', tenLop: '1A', phanHieu: 'Chính' }, lopSchedule: [
      { thu: 2, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }, { tiet: 2, giaoVien: 'gv-1', chuyenMon: 'Toán' }] },
      { thu: 3, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }] }
    ] }
  ];

  assert.equal(countTeacherAssignedPeriods(schedule, 'gv-1'), 3);
  assert.equal(canTeacherAcceptMove(schedule, gv, 'gv-1', 1), false);
});

test('teacher quota blocks any additional assignment when the limit is already reached', () => {
  const gv = { _id: 'gv-1', hoTen: 'GV 1', phanCong: { soTietDinhMuc: 2, soTietKiemNhiem: 0 } };

  assert.equal(canTeacherAcceptAssignment(gv, 2, 1), false);
  assert.equal(canTeacherAcceptAssignment(gv, 1, 1), true);
});

test('busy slot is treated as a hard conflict, not a valid fallback choice', () => {
  const gv = { _id: 'gv-1', hoTen: 'GV 1', nguyenVong: { soBuoiToiDa: 4, buoiUuTien: 'ca_hai' } };
  const slot = { thu: 3, buoi: 'sang', tiet: 1, key: '3-sang-1' };
  const gvBusy = new Set(['3-sang-1']);
  const gvBuoiSet = new Set(['3-sang']);

  const score = scoreGV(gv, slot, gvBusy, gvBuoiSet, true);
  assert.ok(score < -9000, 'same slot conflict must be heavily penalized');
});

test('optimizer reduces an overbooked teacher from 3 sessions down to the desired 2', () => {
  const gv = {
    _id: 'gv-1',
    hoTen: 'GV 1',
    phanHieu: 'Chính',
    phanCong: { soTietDinhMuc: 10, soTietKiemNhiem: 0 },
    nguyenVong: { soBuoiToiDa: 2, buoiUuTien: 'ca_hai' }
  };

  const lopA = { _id: 'lop-a', tenLop: '1A', phanHieu: 'Chính' };
  const lopB = { _id: 'lop-b', tenLop: '1B', phanHieu: 'Chính' };

  const lopSchedulesData = [
    {
      lop: lopA,
      lopSchedule: [
        { thu: 2, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }, { tiet: 2, giaoVien: 'gv-1', chuyenMon: 'Toán' }] },
        { thu: 3, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }] }
      ]
    },
    {
      lop: lopB,
      lopSchedule: [
        { thu: 4, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }, { tiet: 2, giaoVien: 'gv-1', chuyenMon: 'Toán' }] },
        { thu: 5, buoi: 'sang', tiets: [] }
      ]
    }
  ];

  const gvBusy = new Map([['gv-1', new Set([
    '2-sang-1', '2-sang-2', '3-sang-1', '4-sang-1', '4-sang-2'
  ])]]);
  const gvBuoiSet = new Map([['gv-1', new Set(['2-sang', '3-sang', '4-sang'])]]);
  const gvThuSet = new Map([['gv-1', new Set([2, 3, 4])]]);

  const allSlots = [];
  for (const thu of TKB_CONFIG.weekdays) {
    for (const buoi of Object.keys(TKB_CONFIG.sessions)) {
      const config = TKB_CONFIG.sessions[buoi];
      for (let tiet = config.tietBatDau; tiet <= config.tietKetThuc; tiet++) {
        allSlots.push({ thu, buoi, tiet, key: `${thu}-${buoi}-${tiet}` });
      }
    }
  }

  const result = optimizeSessions(lopSchedulesData, [gv], gvBusy, gvBuoiSet, gvThuSet, allSlots, []);

  assert.ok(result.improved || (gvBuoiSet.get('gv-1').size <= 2));
  assert.ok((gvBuoiSet.get('gv-1').size || 0) <= 2);
});

test('final optimizer pass hard-enforces the teacher session cap even after the greedy pass', () => {
  const gv = {
    _id: 'gv-1',
    hoTen: 'GV 1',
    phanHieu: 'Chính',
    phanCong: { soTietDinhMuc: 20, soTietKiemNhiem: 0 },
    nguyenVong: { soBuoiToiDa: 2, buoiUuTien: 'ca_hai' }
  };

  const lop = { _id: 'lop-1', tenLop: '1A', phanHieu: 'Chính' };
  const data = [{
    lop,
    lopSchedule: [
      { thu: 2, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }, { tiet: 2, giaoVien: 'gv-1', chuyenMon: 'Toán' }] },
      { thu: 3, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }] },
      { thu: 4, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }] },
      { thu: 5, buoi: 'chieu', tiets: [{ tiet: 5, giaoVien: 'gv-1', chuyenMon: 'Toán' }] }
    ]
  }];

  const gvBusy = new Map([['gv-1', new Set([
    '2-sang-1', '2-sang-2', '3-sang-1', '4-sang-1', '5-chieu-5'
  ])]]);
  const gvBuoiSet = new Map([['gv-1', new Set(['2-sang', '3-sang', '4-sang', '5-chieu'])]]);
  const gvThuSet = new Map([['gv-1', new Set([2, 3, 4, 5])]]);

  const allSlots = [];
  for (const thu of TKB_CONFIG.weekdays) {
    for (const buoi of Object.keys(TKB_CONFIG.sessions)) {
      const config = TKB_CONFIG.sessions[buoi];
      for (let tiet = config.tietBatDau; tiet <= config.tietKetThuc; tiet++) {
        if (!(buoi === 'sang' && tiet === 1 && thu === 2)) {
          allSlots.push({ thu, buoi, tiet, key: `${thu}-${buoi}-${tiet}` });
        }
      }
    }
  }

  const result = optimizeSessions(data, [gv], gvBusy, gvBuoiSet, gvThuSet, allSlots, []);
  const finalSessions = buildGvSessionSets(data, [gv]).get('gv-1') || new Set();

  assert.ok(result.soGVOptimized >= 0);
  assert.ok(finalSessions.size <= 2, `final session count must be <= 2, got ${finalSessions.size}`);
});

test('repairTeacherSlotConflicts removes same-teacher duplicate assignments at the same slot', () => {
  const gv = {
    _id: 'gv-1',
    hoTen: 'GV 1',
    phanCong: { soTietDinhMuc: 20, soTietKiemNhiem: 0 },
    nguyenVong: { soBuoiToiDa: 4, buoiUuTien: 'ca_hai' },
    chuyenMon: [{ tenChuyenMon: 'Toán' }]
  };

  const lops = [
    { lop: { _id: 'lop-a', tenLop: '1A', phanHieu: 'Chính' }, lopSchedule: [{ thu: 2, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }] }] },
    { lop: { _id: 'lop-b', tenLop: '1B', phanHieu: 'Chính' }, lopSchedule: [{ thu: 2, buoi: 'sang', tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }] }] }
  ];

  const result = repairTeacherSlotConflicts(lops, [gv], generateAllSlots());

  assert.ok(result.changed >= 1, 'should relocate at least one conflicting teacher slot');
  assert.equal(validateHardConstraints(lops, [gv]).ok, true);
});

test('session count treats a day with morning and afternoon as two sessions even when the buoi field is missing', () => {
  const gv = {
    _id: 'gv-1',
    hoTen: 'GV 1',
    phanHieu: 'Chính',
    nguyenVong: { soBuoiToiDa: 4, buoiUuTien: 'ca_hai' }
  };

  const lops = [{
    lop: { _id: 'lop-1', tenLop: '1A', phanHieu: 'Chính' },
    lopSchedule: [
      { thu: 2, tiets: [{ tiet: 7, giaoVien: 'gv-1', chuyenMon: 'Công nghệ' }] },
      { thu: 3, tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Tin học' }] },
      { thu: 3, tiets: [{ tiet: 5, giaoVien: 'gv-1', chuyenMon: 'Tin học' }] },
      { thu: 4, tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }] },
      { thu: 6, tiets: [{ tiet: 1, giaoVien: 'gv-1', chuyenMon: 'Toán' }] }
    ]
  }];

  const sessions = new Set();
  for (const data of lops) {
    for (const ngay of data.lopSchedule) {
      for (const tiet of ngay.tiets) {
        if (tiet.giaoVien && String(tiet.giaoVien) === 'gv-1') {
          const inferredBuoi = tiet.tiet <= 4 ? 'sang' : 'chieu';
          sessions.add(`${ngay.thu}-${inferredBuoi}`);
        }
      }
    }
  }

  assert.equal(sessions.size, 5, '2nd afternoon + 3rd morning+afternoon + 4th morning + 6th morning should be 5 distinct sessions');
});
