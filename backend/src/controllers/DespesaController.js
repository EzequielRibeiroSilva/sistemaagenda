const { db } = require('../config/knex');
const logger = require('../utils/logger');
const { assertPeriodoAberto, parseYmdToLocalDate } = require('../utils/periodLock');

function parseMoneyToNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  if (!raw) return NaN;

  // Aceitar formatos PT-BR como "1.234,56" e também "1234.56"
  const normalized = raw
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

class DespesaController {
  // GET /api/financeiro/despesas?unidade_id=1&status=PENDING&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD&page=1&pageSize=50
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;
      const status = req.query?.status ? String(req.query.status).trim() : null;
      const dataInicio = req.query?.data_inicio ? String(req.query.data_inicio).trim() : null;
      const dataFim = req.query?.data_fim ? String(req.query.data_fim).trim() : null;

      // 🚀 PAGINAÇÃO SERVER-SIDE: Parâmetros com defaults seguros
      const pageRaw = Number(req.query?.page);
      const pageSizeRaw = Number(req.query?.pageSize || req.query?.page_size);

      // Padrões: page=1, pageSize=50
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
      const pageSizeRequested = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : 50;

      // 🛡️ Hard Limit: pageSize máximo = 200 (prevenção de DoS)
      const pageSize = Math.min(pageSizeRequested, 200);

      // Cálculo de offset para query SQL
      const offset = (page - 1) * pageSize;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      // 📊 Query Base: Aplicar os mesmos filtros em COUNT e SELECT
      const baseQuery = () => db('despesas as d')
        .where('d.unidade_id', unidadeId)
        .where('d.usuario_id', usuarioId)
        .modify((qb) => {
          // 🚀 RUNTIME OVERDUE: Calcula despesas vencidas dinamicamente
          if (status === 'OVERDUE') {
            // Despesas vencidas = PENDING + data_vencimento < hoje
            qb.andWhere('d.status', 'PENDING');
            qb.andWhere('d.data_vencimento', '<', db.fn.now());
          } else if (status) {
            // Para outros status, filtro direto pela coluna
            qb.andWhere('d.status', status);
          }
          if (dataInicio) {
            qb.andWhere('d.data_vencimento', '>=', dataInicio);
          }
          if (dataFim) {
            qb.andWhere('d.data_vencimento', '<=', dataFim);
          }
        });

      // 🔢 COUNT: Total de registros (com filtros aplicados)
      const [{ count: totalRecords }] = await baseQuery().count('d.id as count');

      // 📄 SELECT: Registros paginados
      const rows = await baseQuery()
        .leftJoin('usuarios as criador', 'd.criado_por', 'criador.id')
        .leftJoin('usuarios as atualizador', 'd.atualizado_por', 'atualizador.id')
        .select(
          'd.id',
          'd.unidade_id',
          'd.usuario_id',
          'd.descricao',
          'd.categoria',
          'd.valor',
          'd.data_vencimento',
          'd.data_pagamento',
          'd.status',
          'd.forma_pagamento',
          'd.criado_por',
          'd.atualizado_por',
          'd.created_at',
          'd.updated_at',
          'criador.email as criado_por_email',
          'atualizador.email as atualizado_por_email'
        )
        .orderBy('d.data_vencimento', 'desc')
        .orderBy('d.id', 'desc')
        .limit(pageSize)
        .offset(offset);

      const totalPages = Math.ceil(Number(totalRecords) / pageSize);

      // 🎯 Resposta Estruturada com Metadados
      return res.status(200).json({
        success: true,
        data: rows,
        meta: {
          total: Number(totalRecords),
          page,
          pageSize,
          totalPages
        }
      });
    } catch (error) {
      logger.error('[DespesaController.index] Erro ao listar despesas:', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        query: req.query
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao listar despesas',
        message: error.message
      });
    }
  }

  // POST /api/financeiro/despesas
  async store(req, res) {
    // ⚠️ TRANSAÇÃO ATÔMICA: Valida fora, persiste dentro da transação
    let trx;
    
    try {
      // 🔒 SEGURANÇA: Fonte Única de Verdade - APENAS req.user.id (JWT)
      // O front-end NÃO pode manipular quem criou o registro
      const usuarioId = req.user?.id;

      // 🚨 VALIDAÇÃO CRÍTICA: Falha imediata se JWT não foi decodificado
      if (!usuarioId || !Number.isFinite(usuarioId)) {
        logger.error('[DespesaController.store] FALHA DE SEGURANÇA: req.user.id ausente ou inválido', {
          req_user: req.user,
          ip: req.ip,
          endpoint: req.originalUrl
        });
        
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado',
          message: 'Falha na cadeia de autenticação. Token JWT inválido.'
        });
      }

      // ✅ Extração de dados do payload (já validados pelo Zod no middleware anterior)
      const unidadeId = req.body?.unidade_id ? Number(req.body.unidade_id) : null;
      const descricao = req.body?.descricao ? String(req.body.descricao).trim() : '';
      const categoria = req.body?.categoria ? String(req.body.categoria).trim() : '';
      const valor = req.body?.valor;
      const dataVencimento = req.body?.data_vencimento ? String(req.body.data_vencimento).trim() : null;
      const dataPagamento = req.body?.data_pagamento ? String(req.body.data_pagamento).trim() : null;
      const status = req.body?.status ? String(req.body.status).trim() : 'PENDING';
      const formaPagamento = req.body?.forma_pagamento ? String(req.body.forma_pagamento).trim() : null;

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      // Validações PRÉ-TRANSAÇÃO (não bloqueia recursos do banco)
      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      if (!descricao) {
        return res.status(400).json({
          success: false,
          error: 'descricao é obrigatória'
        });
      }

      if (!categoria) {
        return res.status(400).json({
          success: false,
          error: 'categoria é obrigatória'
        });
      }

      const valorNum = parseMoneyToNumber(valor);
      if (!Number.isFinite(valorNum) || valorNum <= 0) {
        return res.status(400).json({
          success: false,
          error: 'valor inválido'
        });
      }

      if (!dataVencimento) {
        return res.status(400).json({
          success: false,
          error: 'data_vencimento é obrigatória'
        });
      }

      // ✅ INÍCIO DA TRANSAÇÃO ATÔMICA
      trx = await db.transaction();

      // 🔒 BLINDAGEM TOTAL: Campos de auditoria são controlados 100% pelo backend
      // Front-end NÃO pode enviar "criado_por" ou "usuario_id" no payload
      const [row] = await trx('despesas')
        .insert({
          unidade_id: unidadeId,
          usuario_id: usuarioId,             // ✅ Proprietário da despesa (do JWT)
          descricao,
          categoria,
          valor: valorNum,
          data_vencimento: dataVencimento,
          data_pagamento: dataPagamento || null,
          status,
          forma_pagamento: formaPagamento || null,
          criado_por: usuarioId,             // ✅ AUDITORIA: Quem criou (do JWT, NÃO do payload)
          atualizado_por: null,              // Será preenchido no primeiro UPDATE
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        })
        .returning('*');

      // 🔒 Se houver lógica de negócio adicional (ex: atualizar saldo), ela DEVE usar `trx`
      // Exemplo futuro:
      // if (status === 'PAID') {
      //   await trx('saldo_unidades').where({ unidade_id: unidadeId }).decrement('saldo', valorNum);
      // }

      // ✅ COMMIT: Se chegou aqui, todas as operações foram bem-sucedidas
      await trx.commit();

      return res.status(201).json({
        success: true,
        data: row
      });
    } catch (error) {
      // ⚠️ ROLLBACK AUTOMÁTICO: Qualquer erro reverte TODAS as operações
      if (trx) {
        await trx.rollback();
      }

      logger.error('[DespesaController.store] Erro ao criar despesa (ROLLBACK executado):', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        body: {
          unidade_id: req.body?.unidade_id,
          descricao: req.body?.descricao,
          categoria: req.body?.categoria,
          valor: req.body?.valor,
          data_vencimento: req.body?.data_vencimento,
          status: req.body?.status
        }
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao criar despesa',
        message: error.message
      });
    }
  }

  // PUT /api/financeiro/despesas/:id
  async update(req, res) {
    // ⚠️ TRANSAÇÃO ATÔMICA: Validações críticas + mutação de estado
    let trx;

    try {
      // 🔒 SEGURANÇA: Fonte Única de Verdade - APENAS req.user.id (JWT)
      // O front-end NÃO pode manipular quem atualizou o registro
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      // 🚨 VALIDAÇÃO CRÍTICA: Falha imediata se JWT não foi decodificado
      if (!usuarioId || !Number.isFinite(usuarioId)) {
        logger.error('[DespesaController.update] FALHA DE SEGURANÇA: req.user.id ausente ou inválido', {
          req_user: req.user,
          ip: req.ip,
          endpoint: req.originalUrl
        });
        
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado',
          message: 'Falha na cadeia de autenticação. Token JWT inválido.'
        });
      }

      const despesaId = req.params?.id ? Number(req.params.id) : null;
      const unidadeId = req.body?.unidade_id ? Number(req.body.unidade_id) : null;

      if (!despesaId || !Number.isFinite(despesaId) || despesaId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de despesa inválido'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      // Validações PRÉ-TRANSAÇÃO
      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const exists = await db('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .first();

      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Despesa não encontrada'
        });
      }

      await assertPeriodoAberto({
        unidadeId: Number(unidadeId),
        recordDate: parseYmdToLocalDate(exists.data_vencimento) || exists.created_at,
        userRole,
        errorMessage: 'Período fechado: não é permitido alterar despesas de meses anteriores.'
      });

      const patch = {};

      if (req.body?.descricao !== undefined) {
        patch.descricao = String(req.body.descricao || '').trim();
      }

      if (req.body?.categoria !== undefined) {
        patch.categoria = String(req.body.categoria || '').trim();
      }

      if (req.body?.valor !== undefined) {
        const valorNum = parseMoneyToNumber(req.body.valor);
        if (!Number.isFinite(valorNum) || valorNum <= 0) {
          return res.status(400).json({
            success: false,
            error: 'valor inválido'
          });
        }
        patch.valor = valorNum;
      }

      if (req.body?.data_vencimento !== undefined) {
        patch.data_vencimento = req.body.data_vencimento ? String(req.body.data_vencimento).trim() : null;
      }

      if (req.body?.data_pagamento !== undefined) {
        patch.data_pagamento = req.body.data_pagamento ? String(req.body.data_pagamento).trim() : null;
      }

      if (req.body?.status !== undefined) {
        patch.status = String(req.body.status || '').trim();
      }

      if (req.body?.forma_pagamento !== undefined) {
        patch.forma_pagamento = req.body.forma_pagamento ? String(req.body.forma_pagamento).trim() : null;
      }

      // 🔒 BLINDAGEM TOTAL: Campos de auditoria são controlados 100% pelo backend
      // Front-end NÃO pode enviar "atualizado_por" no payload
      patch.updated_at = db.fn.now();
      patch.atualizado_por = usuarioId;  // ✅ AUDITORIA: Quem atualizou (do JWT, NÃO do payload)

      // ✅ INÍCIO DA TRANSAÇÃO ATÔMICA
      trx = await db.transaction();

      const [row] = await trx('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .update(patch)
        .returning('*');

      // 🔒 Exemplo de lógica de negócio composta (DEVE usar `trx`):
      // if (exists.status !== 'PAID' && patch.status === 'PAID') {
      //   await trx('saldo_unidades').where({ unidade_id: unidadeId }).decrement('saldo', row.valor);
      // }

      // ✅ COMMIT: Todas as operações executadas com sucesso
      await trx.commit();

      return res.status(200).json({
        success: true,
        data: row
      });
    } catch (error) {
      // ⚠️ ROLLBACK AUTOMÁTICO
      if (trx) {
        await trx.rollback();
      }

      if (error?.code === 'PERIODO_FECHADO') {
        return res.status(409).json({
          success: false,
          code: 'PERIODO_FECHADO',
          error: error.message
        });
      }

      logger.error('[DespesaController.update] Erro ao atualizar despesa (ROLLBACK executado):', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        params: req.params,
        body: req.body
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar despesa',
        message: error.message
      });
    }
  }

  // DELETE /api/financeiro/despesas/:id?unidade_id=1
  async destroy(req, res) {
    // ⚠️ TRANSAÇÃO ATÔMICA: Validações + deleção devem ser atômicas
    let trx;

    try {
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const despesaId = req.params?.id ? Number(req.params.id) : null;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!despesaId || !Number.isFinite(despesaId) || despesaId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de despesa inválido'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      // Validações PRÉ-TRANSAÇÃO
      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const exists = await db('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .select('id', 'data_vencimento', 'created_at', 'status', 'valor')
        .first();

      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Despesa não encontrada'
        });
      }

      // 🔒 PROTEÇÃO DE INTEGRIDADE FINANCEIRA:
      // Despesas PAGAS não podem ser excluídas fisicamente
      // Motivo: Registros liquidados são documentos históricos imutáveis
      const statusNormalized = String(exists.status || '').toUpperCase();
      if (statusNormalized === 'PAID') {
        logger.warn('[DespesaController.destroy] BLOQUEIO: Tentativa de excluir despesa PAGA', {
          despesaId,
          unidadeId,
          usuarioId,
          status: exists.status,
          valor: exists.valor,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });

        return res.status(403).json({
          success: false,
          code: 'PAID_EXPENSE_DELETE_FORBIDDEN',
          error: 'Não é permitido excluir despesas pagas',
          message: 'Despesas liquidadas são documentos históricos imutáveis. Para correções, utilize o recurso de estorno.'
        });
      }

      await assertPeriodoAberto({
        unidadeId: Number(unidadeId),
        recordDate: parseYmdToLocalDate(exists.data_vencimento) || exists.created_at,
        userRole,
        errorMessage: 'Período fechado: não é permitido excluir despesas de meses anteriores.'
      });

      // ✅ INÍCIO DA TRANSAÇÃO ATÔMICA
      trx = await db.transaction();

      // 🔒 Se houver necessidade de reverter saldo ou outra operação composta:
      // if (exists.status === 'PAID') {
      //   await trx('saldo_unidades').where({ unidade_id: unidadeId }).increment('saldo', exists.valor);
      // }

      await trx('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .del();

      // ✅ COMMIT: Deleção confirmada
      await trx.commit();

      return res.status(200).json({
        success: true,
        message: 'Despesa deletada com sucesso'
      });
    } catch (error) {
      // ⚠️ ROLLBACK AUTOMÁTICO
      if (trx) {
        await trx.rollback();
      }

      if (error?.code === 'PERIODO_FECHADO') {
        return res.status(409).json({
          success: false,
          code: 'PERIODO_FECHADO',
          error: error.message
        });
      }

      logger.error('[DespesaController.destroy] Erro ao deletar despesa (ROLLBACK executado):', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        params: req.params,
        query: req.query
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao deletar despesa',
        message: error.message
      });
    }
  }

  /**
   * 💰 ESTORNO DE DESPESA PAGA
   * 
   * Endpoint: POST /api/financeiro/despesas/:id/estornar
   * 
   * Operação compensatória que reverte um pagamento sem apagar o histórico original.
   * Implementa o padrão Ledger Append-Only para rastreabilidade total.
   * 
   * Transação ACID que:
   * 1. Valida que a despesa está PAID (não REVERSED)
   * 2. Marca o registro original como REVERSED
   * 3. Cria registro compensatório (negativo) com is_estorno=true
   * 4. Registra justificativa para auditoria
   */
  async estornar(req, res) {
    let trx;

    try {
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const despesaId = req.params?.id ? Number(req.params.id) : null;
      const { unidade_id: unidadeId, justificativa } = req.body || {};

      // ✅ Validações básicas
      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!despesaId || !Number.isFinite(despesaId) || despesaId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de despesa inválido'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      const justificativaClean = String(justificativa || '').trim();
      if (!justificativaClean || justificativaClean.length < 10) {
        return res.status(400).json({
          success: false,
          error: 'Justificativa é obrigatória (mínimo 10 caracteres)'
        });
      }

      if (justificativaClean.length > 500) {
        return res.status(400).json({
          success: false,
          error: 'Justificativa excede o limite de 500 caracteres'
        });
      }

      // ✅ Validações PRÉ-TRANSAÇÃO
      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const despesaOriginal = await db('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .select('id', 'descricao', 'categoria', 'valor', 'data_vencimento', 'data_pagamento', 'forma_pagamento', 'status', 'created_at')
        .first();

      if (!despesaOriginal) {
        return res.status(404).json({
          success: false,
          error: 'Despesa não encontrada'
        });
      }

      // 🔒 Validação: Apenas despesas PAID podem ser estornadas
      const statusNormalized = String(despesaOriginal.status || '').toUpperCase();
      if (statusNormalized !== 'PAID') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_STATUS_FOR_REVERSAL',
          error: 'Apenas despesas pagas podem ser estornadas',
          current_status: despesaOriginal.status
        });
      }

      // 🔒 Validação: Período aberto
      await assertPeriodoAberto({
        unidadeId: Number(unidadeId),
        recordDate: parseYmdToLocalDate(despesaOriginal.data_pagamento) || despesaOriginal.created_at,
        userRole,
        errorMessage: 'Período fechado: não é permitido estornar despesas de meses anteriores.'
      });

      // ✅ INÍCIO DA TRANSAÇÃO ATÔMICA
      trx = await db.transaction();

      logger.info('[DespesaController.estornar] Iniciando estorno', {
        despesaId,
        unidadeId,
        usuarioId,
        valor: despesaOriginal.valor,
        justificativa: justificativaClean
      });

      // 1️⃣ Marca o registro original como REVERSED
      await trx('despesas')
        .where({ id: despesaId })
        .update({
          status: 'REVERSED',
          updated_at: db.fn.now()
        });

      // 2️⃣ Cria o lançamento compensatório (estorno)
      const descricaoEstorno = `ESTORNO - ${despesaOriginal.descricao} [${justificativaClean}]`;

      const insertResult = await trx('despesas')
        .insert({
          usuario_id: usuarioId,
          criado_por: usuarioId,
          atualizado_por: usuarioId,
          unidade_id: unidadeId,
          descricao: descricaoEstorno,
          categoria: despesaOriginal.categoria,
          valor: despesaOriginal.valor, // Mesmo valor absoluto
          data_vencimento: despesaOriginal.data_vencimento,
          data_pagamento: despesaOriginal.data_pagamento,
          forma_pagamento: despesaOriginal.forma_pagamento || null,
          status: 'REVERSED', // Marca como REVERSED (é um estorno)
          is_estorno: true, // Flag que identifica como estorno
          origem_id: despesaId, // Referência ao registro original
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        })
        .returning('id');

      const estornoId = Array.isArray(insertResult)
        ? typeof insertResult[0] === 'object'
          ? insertResult[0]?.id
          : insertResult[0]
        : insertResult;

      // ✅ COMMIT: Estorno confirmado
      await trx.commit();

      logger.info('[DespesaController.estornar] Estorno confirmado', {
        despesaId,
        estornoId,
        unidadeId,
        usuarioId
      });

      return res.status(200).json({
        success: true,
        message: 'Estorno realizado com sucesso',
        data: {
          despesa_original_id: despesaId,
          estorno_id: estornoId
        }
      });
    } catch (error) {
      // ⚠️ ROLLBACK AUTOMÁTICO
      if (trx) {
        await trx.rollback();
      }

      if (error?.code === 'PERIODO_FECHADO') {
        return res.status(409).json({
          success: false,
          code: 'PERIODO_FECHADO',
          error: error.message
        });
      }

      logger.error('[DespesaController.estornar] Erro ao processar estorno (ROLLBACK executado):', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        params: req.params,
        body: req.body
      });

      return res.status(500).json({
        success: false,
        error: 'Erro ao processar estorno',
        message: error.message
      });
    }
  }
  /**
   * GET /api/financeiro/despesas/vencidas/count
   * 
   * Endpoint otimizado para contagem de despesas vencidas (Performance Elite)
   * Retorna apenas COUNT(*) sem payload de dados
   * Usado para badges de alerta no menu lateral
   */
  async countVencidas(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      // Validar acesso à unidade
      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      // 🚀 QUERY OTIMIZADA: COUNT(*) apenas - sem SELECT de colunas
      const [{ count }] = await db('despesas')
        .where('unidade_id', unidadeId)
        .where('usuario_id', usuarioId)
        .where('status', 'PENDING')
        .andWhere('data_vencimento', '<', db.fn.now())
        .count('id as count');

      return res.status(200).json({
        success: true,
        count: Number(count) || 0
      });

    } catch (error) {
      logger.error('[DespesaController.countVencidas] Erro ao contar despesas vencidas:', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        query: req.query
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao contar despesas vencidas',
        message: error.message
      });
    }
  }
}

module.exports = DespesaController;
