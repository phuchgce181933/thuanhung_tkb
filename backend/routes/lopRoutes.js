const express = require('express');
const router = express.Router();
const lopController = require('../controllers/lopController');

// Routes cho Lớp
router.get('/', lopController.getAll);
router.get('/:id', lopController.getById);
router.get('/khoi/:khoiId', lopController.getByKhoi);
router.post('/', lopController.create);
router.put('/:id', lopController.update);
router.put('/:id/chuyenmons', lopController.updateChuyenMons);
router.post('/chuyenmons/by-khoi', lopController.setChuyenMonsByKhoi);
router.delete('/:id', lopController.delete);

module.exports = router;
