'use strict';

const { createSlotKey } = require('./constants');
const { generateAllSlots } = require('./slotFinder');

/**
 * Repair teacher slot conflicts - move duplicate slots to free slots.
 * (Refactored từ tkbService.js, giữ logic tương đương.)
 *
 * @returns {{changed: number, ok: boolean}}
 */
function repairTeacherSlotConflicts(lopSchedulesData, giaoViens, allSlots = generateAllSlots()) {
  const gvById = new Map((giaoViens || []).map(gv => [gv._id.toString(), gv]));
  let changed = 0;

  for (let iteration = 0; iteration < 50; iteration++) {
    let movedThisRound = 0;
    const seenMoves = new Set();

    for (const data of lopSchedulesData) {
      for (const ngay of data.lopSchedule || []) {
        for (const tiet of [...(ngay.tiets || [])]) {
          if (!tiet.giaoVien) continue;

          const teacherId = tiet.giaoVien.toString();
          const slotKey = createSlotKey(ngay.thu, ngay.buoi, tiet.tiet);
          const teacher = gvById.get(teacherId);
          const isInvalid =
            (ngay.buoi === 'sang' && tiet.tiet === 1 && ngay.thu === 2) ||
            (() => {
              let sameSlotCount = 0;
              for (const otherData of lopSchedulesData) {
                for (const otherNgay of otherData.lopSchedule || []) {
                  for (const otherTiet of otherNgay.tiets || []) {
                    if (!otherTiet.giaoVien) continue;
                    if (otherTiet.giaoVien.toString() !== teacherId) continue;
                    const otherKey = createSlotKey(otherNgay.thu, otherNgay.buoi, otherTiet.tiet);
                    if (otherKey === slotKey) sameSlotCount += 1;
                  }
                }
              }
              return sameSlotCount > 1;
            })();

          if (!teacher || !isInvalid) continue;

          const sourceKey = `${data.lop._id.toString()}|${ngay.thu}|${ngay.buoi}|${tiet.tiet}`;
          if (seenMoves.has(sourceKey)) continue;

          const teacherBusy = new Set();
          for (const otherData of lopSchedulesData) {
            for (const otherNgay of otherData.lopSchedule || []) {
              for (const otherTiet of otherNgay.tiets || []) {
                if (!otherTiet.giaoVien || otherTiet.giaoVien.toString() !== teacherId) continue;
                teacherBusy.add(createSlotKey(otherNgay.thu, otherNgay.buoi, otherTiet.tiet));
              }
            }
          }

          const chosen = allSlots.find(slot => {
            if (slot.key === slotKey) return false;
            if (teacherBusy.has(slot.key)) return false;
            if (slot.buoi === 'sang' && slot.tiet === 1 && slot.thu === 2) return false;

            const existingNgay = data.lopSchedule.find(n => n.thu === slot.thu && n.buoi === slot.buoi);
            if (existingNgay && existingNgay.tiets.some(t => t.tiet === slot.tiet && (!t.giaoVien || t.giaoVien.toString() !== teacherId))) return false;

            return true;
          });

          if (!chosen) continue;

          ngay.tiets = ngay.tiets.filter(t => !(t.tiet === tiet.tiet && t.giaoVien && t.giaoVien.toString() === teacherId));
          if (ngay.tiets.length === 0) {
            data.lopSchedule = data.lopSchedule.filter(n => !(n.thu === ngay.thu && n.buoi === ngay.buoi));
          }

          let targetNgay = data.lopSchedule.find(n => n.thu === chosen.thu && n.buoi === chosen.buoi);
          if (!targetNgay) {
            targetNgay = { thu: chosen.thu, buoi: chosen.buoi, tiets: [] };
            data.lopSchedule.push(targetNgay);
          }

          if (!targetNgay.tiets.some(t => t.tiet === chosen.tiet && t.giaoVien && t.giaoVien.toString() === teacherId)) {
            targetNgay.tiets.push({
              tiet: chosen.tiet,
              giaoVien: teacher._id,
              chuyenMon: tiet.chuyenMon
            });
            targetNgay.tiets.sort((a, b) => a.tiet - b.tiet);
          }

          seenMoves.add(sourceKey);
          changed += 1;
          movedThisRound += 1;
        }
      }
    }

    if (movedThisRound === 0) break;
  }

  // Validation: simple check
  let ok = true;
  for (const data of lopSchedulesData) {
    for (const ngay of data.lopSchedule || []) {
      if (ngay.buoi === 'sang' && ngay.tiets.some(t => t.tiet === 1) && ngay.thu === 2) {
        ok = false;
      }
    }
  }
  return { changed, ok };
}

module.exports = { repairTeacherSlotConflicts };
