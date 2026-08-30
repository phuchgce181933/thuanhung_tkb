'use strict';

/**
 * Optimizer module - tổng hợp các module tối ưu TKB.
 * Refactored từ tkbService.js monolithic 3500+ dòng.
 */

const constants = require('./constants');
const { SlotFinder, generateAllSlots } = require('./slotFinder');
const { ScheduleOps } = require('./scheduleOps');
const { SessionOptimizer } = require('./sessionOptimizer');
const { repairTeacherSlotConflicts } = require('./repair');
const { createSlotKey, createSessionKey } = require('./constants');

/**
 * Build session set cho mỗi GV (utility cho test và các caller khác).
 */
function buildGvSessionSets(lopSchedulesData, giaoViens = []) {
  const map = new Map();
  const ops = new ScheduleOps(lopSchedulesData);
  for (const gv of giaoViens) {
    const gvId = gv._id.toString();
    map.set(gvId, ops.getGVSessions(gvId));
  }
  return map;
}

/**
 * Validate hard constraints (utility cho test).
 * NOTE: implementation moved from tkbService.js, kept here for backward compat.
 */
function validateHardConstraints(lopSchedulesData, giaoViens, hardThuNghi = false) {
  // Lightweight check: only validate teacher slot conflicts
  const conflicts = [];
  for (let i = 0; i < lopSchedulesData.length; i++) {
    const dataA = lopSchedulesData[i];
    for (const ngayA of dataA.lopSchedule || []) {
      for (const tietA of ngayA.tiets || []) {
        if (!tietA.giaoVien) continue;
        for (let j = 0; j < lopSchedulesData.length; j++) {
          const dataB = lopSchedulesData[j];
          for (const ngayB of dataB.lopSchedule || []) {
            for (const tietB of ngayB.tiets || []) {
              if (!tietB.giaoVien) continue;
              if (tietA.giaoVien.toString() !== tietB.giaoVien.toString()) continue;
              if (ngayA.thu === ngayB.thu && ngayA.buoi === ngayB.buoi && tietA.tiet === tietB.tiet) {
                // Same teacher, same slot - duplicate
                if (dataA.lop._id.toString() !== dataB.lop._id.toString()) {
                  conflicts.push({
                    type: 'duplicate',
                    teacher: tietA.giaoVien.toString(),
                    thu: ngayA.thu, buoi: ngayA.buoi, tiet: tietA.tiet,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return { ok: conflicts.length === 0, viPham: conflicts };
}

module.exports = {
  ...constants,
  SlotFinder,
  ScheduleOps,
  SessionOptimizer,
  generateAllSlots,
  buildGvSessionSets,
  validateHardConstraints,
  repairTeacherSlotConflicts,
};
