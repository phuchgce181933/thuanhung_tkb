const express = require('express');
const router = express.Router();
const thoiKhoaBieuController = require('../controllers/thoiKhoaBieuController');

router.get('/', thoiKhoaBieuController.getAll);
router.get('/lop', thoiKhoaBieuController.getByLop);
router.get('/giao-vien', thoiKhoaBieuController.getByGiaoVien);
router.get('/stats', thoiKhoaBieuController.getStats);
router.get('/warning-logs', thoiKhoaBieuController.getWarningLogs);
router.get('/assign-overflow-logs', thoiKhoaBieuController.getAssignOverflowLogs);
router.get('/assign-overflow-logs/:id', thoiKhoaBieuController.getAssignOverflowLogById);
router.get('/progress/:jobId', thoiKhoaBieuController.getProgress);
router.get('/unresolved-cases', thoiKhoaBieuController.getUnresolvedCases);
router.post('/unresolved-cases', thoiKhoaBieuController.saveUnresolvedCases);
router.post('/unresolved-cases/recheck', thoiKhoaBieuController.recheckUnresolved);
router.delete('/unresolved-cases', thoiKhoaBieuController.clearUnresolvedCases);
router.get('/export-excel', thoiKhoaBieuController.exportExcel);
router.post('/auto-generate', thoiKhoaBieuController.autoGenerate);
router.post('/auto-generate-by-phan-hieu', thoiKhoaBieuController.autoGenerateByPhanHieu);
router.post('/auto-generate-all-phan-hieus', thoiKhoaBieuController.autoGenerateAllPhanHieus);
router.delete('/delete-all-by-nam-hoc', thoiKhoaBieuController.deleteAllTkbByNamHoc);
router.post('/assign-overflow', thoiKhoaBieuController.assignOverflow);
router.put('/tiet', thoiKhoaBieuController.updateTiet);
router.post('/move-tiet', thoiKhoaBieuController.moveTiet);
router.post('/swap-tiet', thoiKhoaBieuController.swapTiet);
router.post('/rearrange-after-lock', thoiKhoaBieuController.rearrangeAfterLock);
router.post('/apply-batch', thoiKhoaBieuController.applyBatch);

module.exports = router;
