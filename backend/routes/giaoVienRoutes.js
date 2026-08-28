const express = require('express');
const router = express.Router();
const giaoVienController = require('../controllers/giaoVienController');

router.get('/', giaoVienController.getAll);
router.get('/chuyen-mon', giaoVienController.getChuyenMonList);
router.get('/:id', giaoVienController.getById);
router.post('/', giaoVienController.create);
router.put('/:id', giaoVienController.update);
router.delete('/:id', giaoVienController.delete);

module.exports = router;
