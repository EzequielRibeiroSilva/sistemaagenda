/**
 * Controller: NotificacaoController
 * Descrição: Gerenciamento de notificações WhatsApp para visualização do ADMIN
 * Rotas: GET /api/notificacoes, GET /api/notificacoes/:id, GET /api/notificacoes/stats
 */

const NotificacaoModel = require('../models/NotificacaoModel');

class NotificacaoController {
  constructor() {
    this.model = new NotificacaoModel();
  }

  /**
   * Listar notificações com paginação e filtros
   * GET /api/notificacoes
   * Query params: page, limit, tipo_notificacao, status, agendamento_id, data_inicio, data_fim, unidade_id
   */
  async index(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        tipo_notificacao,
        status,
        agendamento_id,
        data_inicio,
        data_fim,
        unidade_id
      } = req.query;

      const userRole = req.user.role;
      const userUnidadeId = req.user.unidade_id;

      console.log(`🔍 [NotificacaoController] index - Role: ${userRole}, UserUnidadeId: ${userUnidadeId}, RequestedUnidadeId: ${unidade_id}`);

      // Construir filtros
      const filters = {};

      // ✅ CORREÇÃO: Permitir que ADMIN/MASTER filtrem por qualquer unidade
      // Se unidade_id foi especificada na query, usar ela
      // Senão, usar a unidade do usuário (fallback para compatibilidade)
      if (unidade_id) {
        filters.unidade_id = parseInt(unidade_id);
        console.log(`🎯 [NotificacaoController] Filtrando por unidade especificada: ${unidade_id}`);
      } else if (userUnidadeId) {
        filters.unidade_id = userUnidadeId;
        console.log(`🎯 [NotificacaoController] Filtrando por unidade do usuário: ${userUnidadeId}`);
      }

      if (tipo_notificacao) {
        filters.tipo_notificacao = tipo_notificacao;
        console.log(`🎯 [NotificacaoController] Filtro de tipo recebido: ${tipo_notificacao}`);
      }

      if (status) {
        filters.status = status;
      }

      if (agendamento_id) {
        filters.agendamento_id = parseInt(agendamento_id);
      }

      if (data_inicio && data_fim) {
        filters.data_inicio = data_inicio;
        filters.data_fim = data_fim;
      }

      // Buscar notificações
      const result = await this.model.findAll(filters, parseInt(page), parseInt(limit));

      console.log(`✅ [NotificacaoController] Encontradas ${result.data.length} notificações (página ${page}) para unidade ${filters.unidade_id}`);

      return res.json(result);
    } catch (error) {
      console.error('❌ [NotificacaoController] Erro ao listar notificações:', error);
      return res.status(500).json({
        error: 'Erro ao buscar notificações',
        details: error.message
      });
    }
  }

  /**
   * Buscar notificação por ID
   * GET /api/notificacoes/:id
   */
  async show(req, res) {
    try {
      const { id } = req.params;
      const userRole = req.user.role;
      const unidadeId = req.user.unidade_id;

      console.log(`🔍 [NotificacaoController] show - ID: ${id}, Role: ${userRole}`);

      const notificacao = await this.model.findById(parseInt(id));

      if (!notificacao) {
        return res.status(404).json({
          error: 'Notificação não encontrada'
        });
      }

      // Verificar permissão (multi-tenancy)
      if (unidadeId && notificacao.unidade_id !== unidadeId) {
        console.log(`⚠️ [NotificacaoController] Acesso negado: notificação pertence a outra unidade`);
        return res.status(403).json({
          error: 'Acesso negado'
        });
      }

      console.log(`✅ [NotificacaoController] Notificação ${id} encontrada`);

      return res.json(notificacao);
    } catch (error) {
      console.error(`❌ [NotificacaoController] Erro ao buscar notificação ${req.params.id}:`, error);
      return res.status(500).json({
        error: 'Erro ao buscar notificação',
        details: error.message
      });
    }
  }

  /**
   * Buscar estatísticas de notificações
   * GET /api/notificacoes/stats
   * Query params: data_inicio, data_fim, unidade_id
   */
  async stats(req, res) {
    try {
      const { data_inicio, data_fim, unidade_id } = req.query;
      const userRole = req.user.role;
      const userUnidadeId = req.user.unidade_id;

      console.log(`📊 [NotificacaoController] stats - Role: ${userRole}, UserUnidadeId: ${userUnidadeId}, RequestedUnidadeId: ${unidade_id}`);

      // Construir filtros
      const filters = {};

      // ✅ CORREÇÃO: Permitir que ADMIN/MASTER filtrem por qualquer unidade
      // Se unidade_id foi especificada na query, usar ela
      // Senão, usar a unidade do usuário (fallback para compatibilidade)
      if (unidade_id) {
        filters.unidade_id = parseInt(unidade_id);
        console.log(`🎯 [NotificacaoController] Stats para unidade especificada: ${unidade_id}`);
      } else if (userUnidadeId) {
        filters.unidade_id = userUnidadeId;
        console.log(`🎯 [NotificacaoController] Stats para unidade do usuário: ${userUnidadeId}`);
      }

      if (data_inicio && data_fim) {
        filters.data_inicio = data_inicio;
        filters.data_fim = data_fim;
      }

      // Buscar estatísticas
      const stats = await this.model.getStats(filters);

      // Calcular totais gerais
      const totais = stats.reduce((acc, stat) => {
        acc.total += parseInt(stat.total);
        acc.enviados += parseInt(stat.enviados);
        acc.falhas += parseInt(stat.falhas);
        acc.pendentes += parseInt(stat.pendentes);
        return acc;
      }, { total: 0, enviados: 0, falhas: 0, pendentes: 0 });

      console.log(`✅ [NotificacaoController] Estatísticas calculadas: ${totais.total} notificações para unidade ${filters.unidade_id}`);

      return res.json({
        por_tipo: stats,
        totais
      });
    } catch (error) {
      console.error('❌ [NotificacaoController] Erro ao buscar estatísticas:', error);
      return res.status(500).json({
        error: 'Erro ao buscar estatísticas',
        details: error.message
      });
    }
  }
}

module.exports = NotificacaoController;
