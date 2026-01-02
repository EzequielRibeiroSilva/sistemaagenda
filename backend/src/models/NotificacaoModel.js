/**
 * Model: NotificacaoModel
 * Descrição: Gerenciamento de notificações WhatsApp (lembretes, confirmações, cancelamentos, reagendamentos)
 * Tabela: lembretes_enviados
 */

const { db } = require('../config/knex');
const logger = require('./../utils/logger');

const BIRTHDAY_TIPO = 'feliz_aniversario';

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
      let queryLembretes = db(this.tableName)
        .leftJoin('agendamentos as a', `${this.tableName}.agendamento_id`, 'a.id')
        .leftJoin('clientes as c', 'a.cliente_id', 'c.id')
        .leftJoin('agentes as ag', 'a.agente_id', 'ag.id')
        .leftJoin('unidades as u', `${this.tableName}.unidade_id`, 'u.id');

      let queryAniversarios = db('aniversarios_enviados as ae')
        .leftJoin('clientes as c2', 'ae.cliente_id', 'c2.id')
        .leftJoin('unidades as u2', 'ae.unidade_id', 'u2.id');

      // Aplicar filtros
      if (filters.unidade_id) {
        queryLembretes = queryLembretes.where(`${this.tableName}.unidade_id`, filters.unidade_id);
        queryAniversarios = queryAniversarios.where('ae.unidade_id', filters.unidade_id);
      }

      // ✅ CORREÇÃO: Filtro por tipo considerando ambos os campos (tipo_notificacao e tipo_lembrete)
      if (filters.tipo_notificacao) {
        logger.log(`🔍 [NotificacaoModel] Aplicando filtro de tipo: ${filters.tipo_notificacao}`);

        const tipoLembreteMap = {
          'lembrete_24h': '24h',
          'lembrete_1h': '2h'
        };

        const tableName = this.tableName; // ✅ CORREÇÃO CRÍTICA: Salvar referência antes do callback
        const requestedTipo = filters.tipo_notificacao;

        if (requestedTipo === BIRTHDAY_TIPO) {
          queryLembretes = queryLembretes.whereRaw('1=0');
          queryAniversarios = queryAniversarios.whereRaw('1=1');
        } else {
          queryAniversarios = queryAniversarios.whereRaw('1=0');

          queryLembretes = queryLembretes.where(function() {
            this.where(`${tableName}.tipo_notificacao`, requestedTipo);
            if (tipoLembreteMap[requestedTipo]) {
              this.orWhere(`${tableName}.tipo_lembrete`, tipoLembreteMap[requestedTipo]);
            }
          });
        }

        logger.log(`✅ [NotificacaoModel] Filtro aplicado: ${requestedTipo}`);
      }

      if (filters.status) {
        queryLembretes = queryLembretes.where(`${this.tableName}.status`, filters.status);
        queryAniversarios = queryAniversarios.where('ae.status', filters.status);
      }

      // ✅ CORREÇÃO: Busca parcial por ID (LIKE) ao invés de busca exata (=)
      if (filters.agendamento_id) {
        // Converter para string para usar LIKE
        const idSearch = filters.agendamento_id.toString();
        // ✅ CRÍTICO: Usar CAST para converter INTEGER para TEXT antes do LIKE
        queryLembretes = queryLembretes.whereRaw(`CAST(${this.tableName}.agendamento_id AS TEXT) LIKE ?`, [`${idSearch}%`]);
        // aniversários não possuem agendamento_id
        queryAniversarios = queryAniversarios.whereRaw('1=0');
        logger.log(`🔍 [NotificacaoModel] Busca parcial por agendamento_id iniciando com: ${idSearch}`);
      }

      if (filters.data_inicio && filters.data_fim) {
        queryLembretes = queryLembretes.whereBetween(`${this.tableName}.created_at`, [filters.data_inicio, filters.data_fim]);
        queryAniversarios = queryAniversarios.whereBetween('ae.created_at', [filters.data_inicio, filters.data_fim]);
      }

      // Contar total de registros
      const countLembretesQuery = queryLembretes.clone();
      const countAniversariosQuery = queryAniversarios.clone();
      const [[{ count: countLembretes }], [{ count: countAniversarios }]] = await Promise.all([
        countLembretesQuery.count('* as count'),
        countAniversariosQuery.count('* as count')
      ]);
      const total = (parseInt(countLembretes) || 0) + (parseInt(countAniversarios) || 0);

      // Buscar dados com paginação
      const lembretesSelect = queryLembretes.clone().select(
        db.raw(`'lembretes' as origem`),
        `${this.tableName}.id`,
        `${this.tableName}.agendamento_id`,
        `${this.tableName}.unidade_id`,
        db.raw(`COALESCE(${this.tableName}.tipo_notificacao, ${this.tableName}.tipo_lembrete) as tipo_notificacao`),
        `${this.tableName}.status`,
        `${this.tableName}.tentativas`,
        `${this.tableName}.telefone_destino`,
        `${this.tableName}.mensagem_enviada`,
        `${this.tableName}.whatsapp_message_id`,
        `${this.tableName}.erro_detalhes`,
        `${this.tableName}.ultima_tentativa`,
        `${this.tableName}.enviado_em`,
        `${this.tableName}.enviar_em`,
        `${this.tableName}.created_at`,
        `${this.tableName}.updated_at`,
        'a.data_agendamento',
        'a.hora_inicio',
        'a.status as agendamento_status',
        db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
        'c.telefone as cliente_telefone',
        db.raw("CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')) as agente_nome"),
        'ag.telefone as agente_telefone',
        'u.nome as unidade_nome',
        db.raw(`
          CASE 
            WHEN REPLACE(REPLACE(REPLACE(${this.tableName}.telefone_destino, '+', ''), ' ', ''), '-', '') = REPLACE(REPLACE(REPLACE(c.telefone, '+', ''), ' ', ''), '-', '')
            THEN CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))
            WHEN REPLACE(REPLACE(REPLACE(${this.tableName}.telefone_destino, '+', ''), ' ', ''), '-', '') = REPLACE(REPLACE(REPLACE(ag.telefone, '+', ''), ' ', ''), '-', '')
            THEN CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, ''))
            ELSE CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))
          END as destinatario_nome
        `)
      );

      const aniversariosSelect = queryAniversarios.clone().select(
        db.raw(`'aniversarios' as origem`),
        'ae.id',
        db.raw('NULL::integer as agendamento_id'),
        'ae.unidade_id',
        db.raw(`'${BIRTHDAY_TIPO}' as tipo_notificacao`),
        'ae.status',
        'ae.tentativas',
        'ae.telefone_destino',
        'ae.mensagem_enviada',
        'ae.whatsapp_message_id',
        'ae.erro_detalhes',
        'ae.ultima_tentativa',
        'ae.enviado_em',
        'ae.enviar_em',
        'ae.created_at',
        'ae.updated_at',
        db.raw('NULL::date as data_agendamento'),
        db.raw('NULL::time as hora_inicio'),
        db.raw('NULL::text as agendamento_status'),
        db.raw("CONCAT(COALESCE(c2.primeiro_nome, ''), ' ', COALESCE(c2.ultimo_nome, '')) as cliente_nome"),
        'c2.telefone as cliente_telefone',
        db.raw('NULL::text as agente_nome'),
        db.raw('NULL::text as agente_telefone'),
        'u2.nome as unidade_nome',
        db.raw("CONCAT(COALESCE(c2.primeiro_nome, ''), ' ', COALESCE(c2.ultimo_nome, '')) as destinatario_nome")
      );

      const unionQuery = db
        .from(lembretesSelect.unionAll([aniversariosSelect]).as('notifs'))
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      const notificacoes = await unionQuery;

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
      logger.error('❌ [NotificacaoModel] Erro ao buscar notificações:', error);
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
      const lembrete = await db(this.tableName)
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

      if (lembrete) {
        return lembrete;
      }

      const aniversario = await db('aniversarios_enviados as ae')
        .leftJoin('clientes as c2', 'ae.cliente_id', 'c2.id')
        .leftJoin('unidades as u2', 'ae.unidade_id', 'u2.id')
        .where('ae.id', id)
        .select(
          'ae.id',
          db.raw('NULL::integer as agendamento_id'),
          'ae.unidade_id',
          db.raw(`'${BIRTHDAY_TIPO}' as tipo_notificacao`),
          'ae.status',
          'ae.tentativas',
          'ae.telefone_destino',
          'ae.mensagem_enviada',
          'ae.whatsapp_message_id',
          'ae.erro_detalhes',
          'ae.ultima_tentativa',
          'ae.enviado_em',
          'ae.enviar_em',
          'ae.created_at',
          'ae.updated_at',
          db.raw('NULL::timestamp as data_agendamento'),
          db.raw('NULL::text as hora_inicio'),
          db.raw('NULL::text as agendamento_status'),
          db.raw("CONCAT(COALESCE(c2.primeiro_nome, ''), ' ', COALESCE(c2.ultimo_nome, '')) as cliente_nome"),
          'c2.telefone as cliente_telefone',
          db.raw('NULL::text as agente_nome'),
          'u2.nome as unidade_nome'
        )
        .first();

      return aniversario || null;
    } catch (error) {
      logger.error(`❌ [NotificacaoModel] Erro ao buscar notificação ${id}:`, error);
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
          cliente_id: data.cliente_id || null,
          assinatura_referencia: data.assinatura_referencia || null,
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
      logger.error('❌ [NotificacaoModel] Erro ao criar notificação:', error);
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
      logger.error(`❌ [NotificacaoModel] Erro ao atualizar notificação ${id}:`, error);
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
      let queryLembretes = db(this.tableName);
      let queryAniversarios = db('aniversarios_enviados as ae');

      if (filters.unidade_id) {
        queryLembretes = queryLembretes.where('unidade_id', filters.unidade_id);
        queryAniversarios = queryAniversarios.where('ae.unidade_id', filters.unidade_id);
      }

      if (filters.data_inicio && filters.data_fim) {
        queryLembretes = queryLembretes.whereBetween('created_at', [filters.data_inicio, filters.data_fim]);
        queryAniversarios = queryAniversarios.whereBetween('ae.created_at', [filters.data_inicio, filters.data_fim]);
      }

      const statsLembretes = await queryLembretes
        .select(
          db.raw(`COALESCE(tipo_notificacao, tipo_lembrete) as tipo`),
          db.raw('COUNT(*) as total'),
          db.raw("SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) as enviados"),
          db.raw("SUM(CASE WHEN status = 'falha' OR status = 'falha_permanente' THEN 1 ELSE 0 END) as falhas"),
          db.raw("SUM(CASE WHEN status = 'pendente' OR status = 'programado' THEN 1 ELSE 0 END) as pendentes")
        )
        .groupBy(db.raw(`COALESCE(tipo_notificacao, tipo_lembrete)`));

      const statsAniversarios = await queryAniversarios
        .select(
          db.raw(`? as tipo`, [BIRTHDAY_TIPO]),
          db.raw('COUNT(*) as total'),
          db.raw("SUM(CASE WHEN ae.status = 'enviado' THEN 1 ELSE 0 END) as enviados"),
          db.raw("SUM(CASE WHEN ae.status = 'falha' OR ae.status = 'falha_permanente' THEN 1 ELSE 0 END) as falhas"),
          db.raw("SUM(CASE WHEN ae.status = 'pendente' OR ae.status = 'programado' THEN 1 ELSE 0 END) as pendentes")
        );

      const merged = new Map();
      for (const row of [...statsLembretes, ...statsAniversarios]) {
        const tipo = row.tipo;
        if (!merged.has(tipo)) {
          // ✅ CORREÇÃO: Converter strings para números
          merged.set(tipo, {
            tipo: row.tipo,
            total: parseInt(row.total) || 0,
            enviados: parseInt(row.enviados) || 0,
            falhas: parseInt(row.falhas) || 0,
            pendentes: parseInt(row.pendentes) || 0
          });
        } else {
          const current = merged.get(tipo);
          merged.set(tipo, {
            tipo,
            total: (parseInt(current.total) || 0) + (parseInt(row.total) || 0),
            enviados: (parseInt(current.enviados) || 0) + (parseInt(row.enviados) || 0),
            falhas: (parseInt(current.falhas) || 0) + (parseInt(row.falhas) || 0),
            pendentes: (parseInt(current.pendentes) || 0) + (parseInt(row.pendentes) || 0)
          });
        }
      }

      const stats = Array.from(merged.values());

      return stats;
    } catch (error) {
      logger.error('❌ [NotificacaoModel] Erro ao buscar estatísticas:', error);
      throw error;
    }
  }
}

module.exports = NotificacaoModel;
