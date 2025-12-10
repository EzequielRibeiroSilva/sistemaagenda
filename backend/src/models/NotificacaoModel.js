/**
 * Model: NotificacaoModel
 * Descrição: Gerenciamento de notificações WhatsApp (lembretes, confirmações, cancelamentos, reagendamentos)
 * Tabela: lembretes_enviados
 */

const { db } = require('../config/knex');

class NotificacaoModel {
  constructor() {
    this.tableName = 'lembretes_enviados';
    this.db = db;
  }

  /**
   * Listar notificações com paginação e filtros
   * @param {Object} filters - Filtros de busca
   * @param {number} page - Página atual
   * @param {number} limit - Itens por página
   * @returns {Promise<Object>} - { data, pagination }
   */
  async findAll(filters = {}, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;

      // Query base
      let query = db(this.tableName)
        .leftJoin('agendamentos as a', `${this.tableName}.agendamento_id`, 'a.id')
        .leftJoin('clientes as c', 'a.cliente_id', 'c.id')
        .leftJoin('agentes as ag', 'a.agente_id', 'ag.id')
        .leftJoin('unidades as u', `${this.tableName}.unidade_id`, 'u.id');

      // Aplicar filtros
      if (filters.unidade_id) {
        query = query.where(`${this.tableName}.unidade_id`, filters.unidade_id);
      }

      // ✅ CORREÇÃO: Filtro por tipo considerando ambos os campos (tipo_notificacao e tipo_lembrete)
      if (filters.tipo_notificacao) {
        console.log(`🔍 [NotificacaoModel] Aplicando filtro de tipo: ${filters.tipo_notificacao}`);
        
        // Mapear valores do frontend para os valores do banco
        // Frontend: 'lembrete_24h' → Backend: tipo_lembrete='24h' OU tipo_notificacao='lembrete_24h'
        // Frontend: 'lembrete_1h' → Backend: tipo_lembrete='2h' OU tipo_notificacao='lembrete_1h'
        const tipoLembreteMap = {
          'lembrete_24h': '24h',
          'lembrete_1h': '2h'
        };
        
        const tableName = this.tableName; // ✅ CORREÇÃO CRÍTICA: Salvar referência antes do callback
        
        query = query.where(function() {
          // Sempre verificar tipo_notificacao
          this.where(`${tableName}.tipo_notificacao`, filters.tipo_notificacao);
          
          // Se for um lembrete, também verificar tipo_lembrete com o valor mapeado
          if (tipoLembreteMap[filters.tipo_notificacao]) {
            this.orWhere(`${tableName}.tipo_lembrete`, tipoLembreteMap[filters.tipo_notificacao]);
          }
        });
        
        console.log(`✅ [NotificacaoModel] Filtro aplicado com mapeamento: ${filters.tipo_notificacao} → tipo_lembrete=${tipoLembreteMap[filters.tipo_notificacao] || 'N/A'}`);
      }

      if (filters.status) {
        query = query.where(`${this.tableName}.status`, filters.status);
      }

      // ✅ CORREÇÃO: Busca parcial por ID (LIKE) ao invés de busca exata (=)
      if (filters.agendamento_id) {
        // Converter para string para usar LIKE
        const idSearch = filters.agendamento_id.toString();
        // ✅ CRÍTICO: Usar CAST para converter INTEGER para TEXT antes do LIKE
        query = query.whereRaw(`CAST(${this.tableName}.agendamento_id AS TEXT) LIKE ?`, [`${idSearch}%`]);
        console.log(`🔍 [NotificacaoModel] Busca parcial por agendamento_id iniciando com: ${idSearch}`);
      }

      if (filters.data_inicio && filters.data_fim) {
        query = query.whereBetween(`${this.tableName}.created_at`, [filters.data_inicio, filters.data_fim]);
      }

      // Contar total de registros
      const countQuery = query.clone();
      const [{ count }] = await countQuery.count('* as count');
      const total = parseInt(count);

      // Buscar dados com paginação
      const notificacoes = await query
        .select(
          `${this.tableName}.id`,
          `${this.tableName}.agendamento_id`,
          `${this.tableName}.unidade_id`,
          // Usar COALESCE para pegar tipo_notificacao ou tipo_lembrete
          db.raw(`COALESCE(${this.tableName}.tipo_notificacao, ${this.tableName}.tipo_lembrete) as tipo_notificacao`),
          `${this.tableName}.status`,
          `${this.tableName}.tentativas`,
          `${this.tableName}.telefone_destino`,
          `${this.tableName}.mensagem_enviada`,
          `${this.tableName}.whatsapp_message_id`,
          `${this.tableName}.erro_detalhes`,
          `${this.tableName}.ultima_tentativa`,
          `${this.tableName}.enviado_em`,
          `${this.tableName}.enviar_em`, // ✅ NOVO: Horário programado
          `${this.tableName}.created_at`,
          `${this.tableName}.updated_at`,
          // Dados do agendamento
          'a.data_agendamento',
          'a.hora_inicio',
          'a.status as agendamento_status',
          // Dados do cliente
          db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
          'c.telefone as cliente_telefone',
          // Dados do agente
          db.raw("CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')) as agente_nome"),
          'ag.telefone as agente_telefone',
          // Dados da unidade
          'u.nome as unidade_nome',
          // ✅ CORREÇÃO: Identificar destinatário correto baseado no telefone
          db.raw(`
            CASE 
              WHEN REPLACE(REPLACE(REPLACE(${this.tableName}.telefone_destino, '+', ''), ' ', ''), '-', '') = REPLACE(REPLACE(REPLACE(c.telefone, '+', ''), ' ', ''), '-', '')
              THEN CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))
              WHEN REPLACE(REPLACE(REPLACE(${this.tableName}.telefone_destino, '+', ''), ' ', ''), '-', '') = REPLACE(REPLACE(REPLACE(ag.telefone, '+', ''), ' ', ''), '-', '')
              THEN CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, ''))
              ELSE CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))
            END as destinatario_nome
          `)
        )
        .orderBy(`${this.tableName}.created_at`, 'desc')
        .limit(limit)
        .offset(offset);

      return {
        data: notificacoes,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ [NotificacaoModel] Erro ao buscar notificações:', error);
      throw error;
    }
  }

  /**
   * Buscar notificação por ID
   * @param {number} id - ID da notificação
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    try {
      const notificacao = await db(this.tableName)
        .leftJoin('agendamentos as a', `${this.tableName}.agendamento_id`, 'a.id')
        .leftJoin('clientes as c', 'a.cliente_id', 'c.id')
        .leftJoin('agentes as ag', 'a.agente_id', 'ag.id')
        .leftJoin('unidades as u', `${this.tableName}.unidade_id`, 'u.id')
        .where(`${this.tableName}.id`, id)
        .select(
          `${this.tableName}.*`,
          db.raw(`COALESCE(${this.tableName}.tipo_notificacao, ${this.tableName}.tipo_lembrete) as tipo_notificacao`),
          'a.data_agendamento',
          'a.hora_inicio',
          'a.status as agendamento_status',
          db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
          'c.telefone as cliente_telefone',
          db.raw("CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')) as agente_nome"),
          'u.nome as unidade_nome'
        )
        .first();

      return notificacao || null;
    } catch (error) {
      console.error(`❌ [NotificacaoModel] Erro ao buscar notificação ${id}:`, error);
      throw error;
    }
  }

  /**
   * Criar registro de notificação
   * @param {Object} data - Dados da notificação
   * @returns {Promise<number>} - ID da notificação criada
   */
  async create(data) {
    try {
      const [id] = await db(this.tableName)
        .insert({
          agendamento_id: data.agendamento_id,
          unidade_id: data.unidade_id,
          tipo_notificacao: data.tipo_notificacao,
          status: data.status || 'pendente',
          tentativas: data.tentativas || 0,
          telefone_destino: data.telefone_destino,
          mensagem_enviada: data.mensagem_enviada || null,
          whatsapp_message_id: data.whatsapp_message_id || null,
          erro_detalhes: data.erro_detalhes || null,
          ultima_tentativa: data.ultima_tentativa || null,
          enviado_em: data.enviado_em || null,
          enviar_em: data.enviar_em || null, // ✅ NOVO: Horário programado para envio
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        })
        .returning('id');

      return typeof id === 'object' ? id.id : id;
    } catch (error) {
      console.error('❌ [NotificacaoModel] Erro ao criar notificação:', error);
      throw error;
    }
  }

  /**
   * Atualizar status da notificação
   * @param {number} id - ID da notificação
   * @param {Object} data - Dados para atualizar
   * @returns {Promise<boolean>}
   */
  async updateStatus(id, data) {
    try {
      const updated = await db(this.tableName)
        .where('id', id)
        .update({
          status: data.status,
          tentativas: data.tentativas,
          mensagem_enviada: data.mensagem_enviada,
          whatsapp_message_id: data.whatsapp_message_id,
          erro_detalhes: data.erro_detalhes,
          ultima_tentativa: data.ultima_tentativa,
          enviado_em: data.enviado_em,
          updated_at: db.fn.now()
        });

      return updated > 0;
    } catch (error) {
      console.error(`❌ [NotificacaoModel] Erro ao atualizar notificação ${id}:`, error);
      throw error;
    }
  }

  /**
   * Buscar estatísticas de notificações
   * @param {Object} filters - Filtros
   * @returns {Promise<Object>}
   */
  async getStats(filters = {}) {
    try {
      let query = db(this.tableName);

      if (filters.unidade_id) {
        query = query.where('unidade_id', filters.unidade_id);
      }

      if (filters.data_inicio && filters.data_fim) {
        query = query.whereBetween('created_at', [filters.data_inicio, filters.data_fim]);
      }

      const stats = await query
        .select(
          db.raw(`COALESCE(tipo_notificacao, tipo_lembrete) as tipo`),
          db.raw('COUNT(*) as total'),
          db.raw("SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) as enviados"),
          db.raw("SUM(CASE WHEN status = 'falha' OR status = 'falha_permanente' THEN 1 ELSE 0 END) as falhas"),
          db.raw("SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes")
        )
        .groupBy(db.raw(`COALESCE(tipo_notificacao, tipo_lembrete)`));

      return stats;
    } catch (error) {
      console.error('❌ [NotificacaoModel] Erro ao buscar estatísticas:', error);
      throw error;
    }
  }
}

module.exports = NotificacaoModel;
