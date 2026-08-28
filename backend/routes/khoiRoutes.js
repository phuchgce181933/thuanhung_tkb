const express = require('express');
const router = express.Router();
const khoiController = require('../controllers/khoiController');

// Routes cho Khối
router.get('/', khoiController.getAll);
router.get('/:id', khoiController.getById);
router.post('/', khoiController.create);
router.put('/:id', khoiController.update);
router.delete('/:id', khoiController.delete);

module.exports = router;
