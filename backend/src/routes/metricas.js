const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const MasterMetricsController = require('../controllers/MasterMetricsController');

const controller = new MasterMetricsController();

router.use(authenticate());
router.use(requireRole('MASTER'));

router.get('/stats', async (req, res) => {
  await controller.stats(req, res);
});

module.exports = router;
