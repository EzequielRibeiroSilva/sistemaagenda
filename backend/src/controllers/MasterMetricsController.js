const { db } = require('../config/knex');

class MasterMetricsController {
  /**
   * GET /api/metricas/stats
   * Query params: data_inicio (YYYY-MM-DD), data_fim (YYYY-MM-DD)
   * Role: MASTER
   */
  async stats(req, res) {
    try {
      const { data_inicio, data_fim } = req.query;

      const start = data_inicio ? `${data_inicio}T00:00:00.000Z` : null;
      const end = data_fim ? `${data_fim}T23:59:59.999Z` : null;

      const baseCreated = db('agendamentos');
      const baseCanceled = db('agendamentos').where('status', 'Cancelado');

      if (start && end) {
        baseCreated.whereBetween('created_at', [start, end]);
        baseCanceled.whereBetween('updated_at', [start, end]);
      }

      const [{ count: createdCountRaw }, { count: canceledCountRaw }] = await Promise.all([
        baseCreated.count('* as count').first(),
        baseCanceled.count('* as count').first()
      ]);

      const criados = parseInt(createdCountRaw, 10) || 0;
      const cancelados = parseInt(canceledCountRaw, 10) || 0;

      const taxa_cancelamento = criados > 0 ? (cancelados / criados) * 100 : 0;

      return res.json({
        success: true,
        data: {
          agendamentos: {
            criados,
            cancelados,
            taxa_cancelamento
          }
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar métricas',
        message: error.message
      });
    }
  }
}

module.exports = MasterMetricsController;
