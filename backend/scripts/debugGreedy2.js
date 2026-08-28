// Debug greedy chi tiết - theo dõi từng tiết được xếp cho Kim
require('dotenv').config();
const mongoose = require('mongoose');
const GiaoVien = require('../models/GiaoVien');
const Lop = require('../models/Lop');
const Khoi = require('../models/Khoi');
const ThoiKhoaBieu = require('../models/ThoiKhoaBieu');

// Monkey-patch tkbService để log từng commit
let kimCommitLog = [];

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Xóa TKB cũ
    await ThoiKhoaBieu.deleteMany({ namHoc: '2024-2025' });
    
    // Load data
    const khois = await Khoi.find().sort({ thuTu: 1 });
    const lops = await Lop.find().populate('khoi');
    const giaoViens = await GiaoVien.find({ trangThai: 'active' });
    const kim = await GiaoVien.findOne({ hoTen: { $regex: '^kim$', $options: 'i' } });
    
    console.log(`GV Kim ID: ${kim._id}`);
    
    // Map chuyên môn -> GV
    const gvByChuyenMon = new Map();
    for (const gv of giaoViens) {
      for (const cm of gv.chuyenMon) {
        if (!gvByChuyenMon.has(cm.tenChuyenMon)) {
          gvByChuyenMon.set(cm.tenChuyenMon, []);
        }
        gvByChuyenMon.get(cm.tenChuyenMon).push(gv);
      }
    }
    
    // TKB CONFIG
    const TKB_CONFIG = {
      weekdays: [2, 3, 4, 5, 6],
      sessions: {
        sang: { tietBatDau: 1, tietKetThuc: 4, coChaoCo: true },
        chieu: { tietBatDau: 5, tietKetThuc: 7, coChaoCo: false }
      }
    };
    
    // Generate all slots
    const allSlots = [];
    for (const thu of TKB_CONFIG.weekdays) {
      for (const [buoi, config] of Object.entries(TKB_CONFIG.sessions)) {
        for (let tiet = config.tietBatDau; tiet <= config.tietKetThuc; tiet++) {
          if (!(buoi === 'sang' && tiet === 1 && thu === 2)) {
            allSlots.push({ thu, buoi, tiet, key: `${thu}-${buoi}-${tiet}` });
          }
        }
      }
    }
    
    // GV busy tracking
    const gvBusy = new Map();
    for (const gv of giaoViens) {
      gvBusy.set(gv._id.toString(), new Set());
    }
    
    // Track assignments per (lop, subject) to find duplicates
    const assignmentsByClassSubject = new Map();
    
    let totalKimCommit = 0;
    
    // Process each class
    for (const lop of lops) {
      const lopSchedule = [];
      const lopUsedSlots = new Set();
      
      const chuyenMonList = lop.chuyenMons || [];
      if (chuyenMonList.length === 0) continue;
      
      const sortedCM = [...chuyenMonList].sort((a, b) => b.soTietTuan - a.soTietTuan);
      
      for (const cm of sortedCM) {
        const gvList = gvByChuyenMon.get(cm.tenChuyenMon) || [];
        if (gvList.length === 0) continue;
        
        let remaining = cm.soTietTuan;
        if (remaining === 0) continue;
        
        // Track: cho class này + môn này, xếp bao nhiêu tiết?
        const key = `${lop.tenLop}|${cm.tenChuyenMon}`;
        if (!assignmentsByClassSubject.has(key)) {
          assignmentsByClassSubject.set(key, { required: remaining, assigned: 0, gv: null });
        }
        
        // Sort by busyness
        const sortedGV = [...gvList].sort((a, b) => {
          const aC = gvBusy.get(a._id.toString()).size;
          const bC = gvBusy.get(b._id.toString()).size;
          return aC - bC;
        });
        
        while (remaining > 0) {
          let placed = false;
          
          // Try each teacher
          for (const gv of sortedGV) {
            const gvId = gv._id.toString();
            
            // Find best slot for this GV
            let bestSlot = null;
            let bestScore = -Infinity;
            
            for (const slot of allSlots) {
              if (lopUsedSlots.has(slot.key)) continue;
              if (gvBusy.get(gvId).has(slot.key)) continue;
              
              const buoiKey = `${slot.thu}-${slot.buoi}`;
              const gvBuoiSet = new Set();
              for (const k of gvBusy.get(gvId)) {
                const [t, b] = k.split('-');
                gvBuoiSet.add(`${t}-${b}`);
              }
              
              let score = 0;
              if (gvBuoiSet.has(buoiKey)) score += 50;
              
              if (score > bestScore) {
                bestScore = score;
                bestSlot = slot;
              }
            }
            
            if (bestSlot) {
              // Commit
              lopUsedSlots.add(bestSlot.key);
              gvBusy.get(gvId).add(bestSlot.key);
              
              const record = assignmentsByClassSubject.get(key);
              record.assigned++;
              record.gv = gv.hoTen;
              
              if (gvId === kim._id.toString()) {
                totalKimCommit++;
                kimCommitLog.push(`${lop.tenLop} | ${cm.tenChuyenMon} | T${bestSlot.thu}-${bestSlot.buoi}-P${bestSlot.tiet} | count=${totalKimCommit}`);
              }
              
              remaining--;
              placed = true;
              break;
            }
          }
          
          if (!placed) {
            console.log(`WARN: Cannot place ${cm.tenChuyenMon} for ${lop.tenLop}, remaining=${remaining}`);
            break;
          }
        }
      }
    }
    
    console.log('\n=== ASSIGNMENTS BY CLASS|SUBJECT ===');
    let totalAssigned = 0;
    let totalRequired = 0;
    for (const [key, val] of [...assignmentsByClassSubject.entries()].sort()) {
      const status = val.assigned === val.required ? 'OK' : (val.assigned > val.required ? 'OVER!' : 'UNDER!');
      console.log(`  ${key}: required=${val.required} assigned=${val.assigned} [${status}] gv=${val.gv}`);
      totalAssigned += val.assigned;
      totalRequired += val.required;
    }
    console.log(`\nTOTAL: required=${totalRequired} assigned=${totalAssigned}`);
    
    console.log('\n=== KIM COMMIT LOG ===');
    console.log(`Total: ${totalKimCommit}`);
    for (const line of kimCommitLog) {
      console.log(`  ${line}`);
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

main();
