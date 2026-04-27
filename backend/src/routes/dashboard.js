const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');
const DashboardKpiController = require('../controllers/DashboardKpiController');

const controller = new DashboardController();
const kpiController = new DashboardKpiController();

router.get('/stats', async (req, res) => {
  await controller.stats(req, res);
});

router.get('/club-intelligence', async (req, res) => {
  await controller.clubIntelligence(req, res);
});

router.get('/kpis', async (req, res) => {
  await kpiController.kpis(req, res);
});

module.exports = router;
