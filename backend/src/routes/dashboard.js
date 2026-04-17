const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');

const controller = new DashboardController();

router.get('/stats', async (req, res) => {
  await controller.stats(req, res);
});

router.get('/club-intelligence', async (req, res) => {
  await controller.clubIntelligence(req, res);
});

module.exports = router;
