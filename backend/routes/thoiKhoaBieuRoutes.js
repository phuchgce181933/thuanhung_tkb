const express = require('express');
const router = express.Router();
const thoiKhoaBieuController = require('../controllers/thoiKhoaBieuController');

router.get('/', thoiKhoaBieuController.getAll);
router.get('/lop', thoiKhoaBieuController.getByLop);
router.get('/giao-vien', thoiKhoaBieuController.getByGiaoVien);
router.get('/stats', thoiKhoaBieuController.getStats);
router.get('/export-excel', thoiKhoaBieuController.exportExcel);
router.post('/auto-generate', thoiKhoaBieuController.autoGenerate);
router.put('/tiet', thoiKhoaBieuController.updateTiet);
router.post('/move-tiet', thoiKhoaBieuController.moveTiet);
router.post('/swap-tiet', thoiKhoaBieuController.swapTiet);
router.post('/rearrange-after-lock', thoiKhoaBieuController.rearrangeAfterLock);
router.post('/apply-batch', thoiKhoaBieuController.applyBatch);

module.exports = router;
