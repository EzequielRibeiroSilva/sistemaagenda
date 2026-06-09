/**
 * UseCase: CancelAppointmentUseCase
 * Descrição: Cancelamento inteligente de agendamentos (únicos ou séries recorrentes)
 * Responsabilidades:
 * - Validação de prazo de cancelamento
 * - Cancelamento de agendamento único ou série completa
 * - Estorno/retenção de cotas de assinatura
 * - Estorno de estoque de produtos vendidos
 * - Atualização de status de vendas/pagamentos
 * - Disparar notificações WhatsApp
 */

const { db } = require('../config/knex');
const AssinaturaEstornoService = require('../services/AssinaturaEstornoService');
const InventoryService = require('../services/InventoryService');
const AgendamentoConclusaoService = require('../services/AgendamentoConclusaoService');
const WhatsAppService = require('../services/WhatsAppService');
const ScheduledReminderService = require('../services/ScheduledReminderService');
const logger = require('../utils/logger');

class CancelAppointmentUseCase {
  static async execute({ agendamentoId, motivo, origem = 'CLIENTE_PUBLICO', cancelarSerie = false, userId = null }) {
    logger.info(`[CancelAppointmentUseCase] Iniciando cancelamento - ID: ${agendamentoId}, Série: ${cancelarSerie}`);

    // 1. Buscar agendamento principal
    const agendamento = await db('agendamentos')
      .where('id', agendamentoId)
      .whereNull('deleted_at')
      .first();

    if (!agendamento) {
      const err = new Error('Agendamento não encontrado');
      err.code = 'NOT_FOUND';
      err.httpStatus = 404;
      throw err;
    }

    // 2. Validar se já está cancelado
    if (agendamento.status === 'Cancelado') {
      const err = new Error('Agendamento já está cancelado');
      err.code = 'ALREADY_CANCELLED';
      err.httpStatus = 400;
      throw err;
    }

    // 3. Validar se já foi concluído
    if (agendamento.status === 'Concluído') {
      const err = new Error('Não é possível cancelar um agendamento já concluído');
      err.code = 'ALREADY_COMPLETED';
      err.httpStatus = 400;
      throw err;
    }

    // 4. Buscar configurações da unidade
    let configuracoes = await db('configuracoes_sistema')
      .where('unidade_id', agendamento.unidade_id)
      .select('permitir_cancelamento', 'tempo_limite_cancelar_horas')
      .first();

    if (!configuracoes) {
      configuracoes = {
        permitir_cancelamento: true,
        tempo_limite_cancelar_horas: 4
      };
    }

    // 5. Validar permissão de cancelamento
    if (!configuracoes.permitir_cancelamento && origem === 'CLIENTE_PUBLICO') {
      const err = new Error('Cancelamento não permitido pela política da empresa');
      err.code = 'CANCELLATION_NOT_ALLOWED';
      err.httpStatus = 403;
      throw err;
    }

    // 6. Validar prazo de cancelamento
    const agora = new Date();
    let dataAgendamentoStr;
    
    if (agendamento.data_agendamento instanceof Date) {
      const ano = agendamento.data_agendamento.getFullYear();
      const mes = String(agendamento.data_agendamento.getMonth() + 1).padStart(2, '0');
      const dia = String(agendamento.data_agendamento.getDate()).padStart(2, '0');
      dataAgendamentoStr = `${ano}-${mes}-${dia}`;
    } else {
      dataAgendamentoStr = String(agendamento.data_agendamento);
    }

    const dataHoraAgendamento = new Date(`${dataAgendamentoStr}T${agendamento.hora_inicio}-03:00`);
    
    if (isNaN(dataHoraAgendamento.getTime())) {
      const err = new Error('Data do agendamento inválida');
      err.code = 'INVALID_DATE';
      err.httpStatus = 500;
      throw err;
    }

    const diferencaMs = dataHoraAgendamento - agora;
    const diferencaHoras = diferencaMs / (1000 * 60 * 60);

    // Bloquear cancelamento de agendamentos passados
    if (diferencaHoras < 0) {
      const err = new Error('Este agendamento já aconteceu e não pode mais ser cancelado');
      err.code = 'APPOINTMENT_EXPIRED';
      err.httpStatus = 410;
      throw err;
    }

    // 7. Decisão de estorno
    const assinaturaEstornoService = new AssinaturaEstornoService();
    const decisaoEstorno = await assinaturaEstornoService.decidirEstorno({
      origem,
      agendamento: {
        id: parseInt(agendamentoId, 10),
        unidade_id: agendamento.unidade_id,
        data_agendamento: dataAgendamentoStr,
        hora_inicio: agendamento.hora_inicio
      },
      agora,
      dbConn: db
    });

    const deveEstornarCota = Boolean(decisaoEstorno?.deve_estornar);

    logger.info(`[CancelAppointmentUseCase] Decisão de estorno:`, {
      dentroDoPrazo: Boolean(decisaoEstorno?.dentro_do_prazo),
      deveEstornarCota,
      diferencaHoras: Number(diferencaHoras.toFixed(2)),
      limiteHoras: decisaoEstorno?.limite_horas
    });

    // 8. Identificar se é série recorrente
    const isRecorrente = Boolean(agendamento.recorrencia_group_id);
    let agendamentosParaCancelar = [agendamento.id];

    if (isRecorrente && cancelarSerie) {
      logger.info(`[CancelAppointmentUseCase] Série recorrente detectada - group_id: ${agendamento.recorrencia_group_id}`);
      
      // Buscar todos os agendamentos futuros da série (incluindo o atual)
      const agendamentosSerie = await db('agendamentos')
        .where('recorrencia_group_id', agendamento.recorrencia_group_id)
        .where('data_agendamento', '>=', dataAgendamentoStr)
        .whereNull('deleted_at')
        .whereNot('status', 'Cancelado')
        .select('id', 'data_agendamento', 'hora_inicio');

      agendamentosParaCancelar = agendamentosSerie.map(a => a.id);
      
      logger.info(`[CancelAppointmentUseCase] ${agendamentosParaCancelar.length} ocorrências serão canceladas`);
    }

    // 9. Executar cancelamento em transação
    const resultados = await db.transaction(async (trx) => {
      const inventoryService = new InventoryService(trx);
      const agendamentoConclusaoService = new AgendamentoConclusaoService({ db: trx });
      const cancelados = [];

      for (const idParaCancelar of agendamentosParaCancelar) {
        // Buscar dados completos do agendamento
        const agendRow = await trx('agendamentos')
          .where('id', idParaCancelar)
          .forUpdate()
          .select('id', 'venda_id', 'unidade_id', 'usuario_id')
          .first();

        if (!agendRow) continue;

        // Estorno de estoque (produtos vendidos)
        let vendaId = agendRow?.venda_id ? Number(agendRow.venda_id) : null;
        
        if (!vendaId) {
          const vendaRow = await trx('vendas')
            .where('agendamento_id', idParaCancelar)
            .select('id')
            .first();
          vendaId = vendaRow?.id ? Number(vendaRow.id) : null;
        }

        if (vendaId) {
          const venda = await trx('vendas')
            .where({ id: vendaId })
            .forUpdate()
            .first();

          const statusVenda = String(venda?.status || '').toUpperCase();

          if (venda && statusVenda === 'PAID') {
            const itens = await trx('venda_itens')
              .where('venda_id', vendaId)
              .select('item_type', 'reference_id', 'quantidade');

            const origemId = `ESTORNO:VENDA:${vendaId}`;

            for (const it of itens || []) {
              if (String(it.item_type) !== 'PRODUTO') continue;
              
              const produtoId = Number(it.reference_id);
              const quantidade = Number(it.quantidade);
              
              if (!Number.isFinite(produtoId) || !Number.isFinite(quantidade) || quantidade <= 0) continue;

              const movJaExiste = await trx('estoque_movimentacoes')
                .where({
                  usuario_id: venda.usuario_id,
                  unidade_id: Number(venda.unidade_id),
                  produto_id: produtoId,
                  tipo: 'ESTORNO',
                  origem_id: origemId
                })
                .select('id')
                .first();

              if (movJaExiste?.id) continue;

              await inventoryService.movimentarEstoque({
                usuario_id: venda.usuario_id,
                unidade_id: Number(venda.unidade_id),
                produto_id: produtoId,
                tipo: 'ESTORNO',
                quantidade,
                motivo: `ESTORNO AUTOMÁTICO - Venda ${vendaId} (Agendamento ${idParaCancelar})`,
                origem_id: origemId,
                created_by: userId || null,
                trx
              });
            }

            // Atualizar status de pagamentos e venda
            await trx('venda_pagamentos')
              .where('venda_id', vendaId)
              .update({ status: 'REFUNDED' });

            await trx('vendas')
              .where('id', vendaId)
              .update({
                status: 'REFUNDED',
                updated_at: trx.fn.now()
              });
          }
        }

        // Estorno/retenção de cota de assinatura
        await assinaturaEstornoService.aplicarEstornoOuRetencao({
          agendamentoId: idParaCancelar,
          deveEstornar: deveEstornarCota,
          dbConn: trx
        });

        // Atualizar status do agendamento
        const observacaoCompleta = motivo 
          ? `Cancelado ${origem === 'CLIENTE_PUBLICO' ? 'pelo cliente' : 'pela empresa'}: ${motivo}`
          : `Cancelado ${origem === 'CLIENTE_PUBLICO' ? 'pelo cliente' : 'pela empresa'}`;

        await trx('agendamentos')
          .where('id', idParaCancelar)
          .update({
            status: 'Cancelado',
            observacoes: observacaoCompleta,
            updated_at: trx.fn.now()
          });

        // Reconciliação de estoque
        await agendamentoConclusaoService.reconcileEstoque({
          agendamentoId: idParaCancelar,
          triggeredByUserId: userId,
          pagamentos: [],
          trx
        });

        cancelados.push(idParaCancelar);
      }

      return { cancelados, cotaConsumida: !deveEstornarCota };
    });

    logger.info(`[CancelAppointmentUseCase] ✅ ${resultados.cancelados.length} agendamento(s) cancelado(s)`);

    // 10. Disparar notificações e cancelar lembretes (fora da transação)
    try {
      const whatsAppService = new WhatsAppService();
      const scheduledReminderService = new ScheduledReminderService();

      // Buscar dados completos do agendamento principal para notificação
      const dadosCompletos = await this.buscarDadosCompletos(agendamentoId);
      
      if (dadosCompletos) {
        // Adicionar flag de cota consumida
        if (resultados.cotaConsumida) {
          dadosCompletos.cota_consumida = true;
        }

        // Enviar notificação
        await whatsAppService.sendCancellationNotification(dadosCompletos);
        logger.info(`[CancelAppointmentUseCase] ✅ Notificações enviadas`);
      }

      // Cancelar lembretes programados para todos os agendamentos cancelados
      for (const idCancelado of resultados.cancelados) {
        await scheduledReminderService.cancelarLembretesProgramados(idCancelado);
      }

      logger.info(`[CancelAppointmentUseCase] ✅ Lembretes cancelados`);
    } catch (notifError) {
      logger.error(`[CancelAppointmentUseCase] ❌ Erro ao enviar notificações:`, notifError);
      // Não falhar o cancelamento por erro de notificação
    }

    // 11. Retornar resultado
    return {
      success: true,
      agendamentos_cancelados: resultados.cancelados.length,
      cota_consumida: resultados.cotaConsumida,
      estorno_aplicado: deveEstornarCota,
      message: resultados.cancelados.length === 1 
        ? 'Agendamento cancelado com sucesso'
        : `${resultados.cancelados.length} agendamentos da série cancelados com sucesso`
    };
  }

  /**
   * Buscar dados completos do agendamento para notificações
   */
  static async buscarDadosCompletos(agendamentoId) {
    try {
      const agendamento = await db('agendamentos')
        .where('id', agendamentoId)
        .whereNull('deleted_at')
        .first();

      if (!agendamento) return null;

      const cliente = await db('clientes')
        .where('id', agendamento.cliente_id)
        .first();

      const agente = await db('agentes')
        .where('id', agendamento.agente_id)
        .first();

      const unidade = await db('unidades')
        .where('id', agendamento.unidade_id)
        .select('id', 'nome', 'endereco', 'telefone', 'slug_url')
        .first();

      if (!cliente || !agente || !unidade) return null;

      const servicos = await db('agendamento_servicos')
        .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .where('agendamento_servicos.agendamento_id', agendamentoId)
        .select('servicos.nome', 'servicos.preco');

      const nomeCliente = `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();

      return {
        cliente: { nome: nomeCliente },
        cliente_telefone: cliente.telefone,
        agente: { nome: `${agente.nome} ${agente.sobrenome || ''}`.trim() },
        agente_telefone: agente.telefone,
        unidade: {
          id: unidade.id,
          nome: unidade.nome,
          endereco: unidade.endereco,
          slug_url: unidade.slug_url
        },
        unidade_id: unidade.id,
        unidade_telefone: unidade.telefone,
        unidade_endereco: unidade.endereco,
        unidade_slug: unidade.slug_url,
        agendamento_id: agendamento.id,
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        hora_fim: agendamento.hora_fim,
        valor_total: agendamento.valor_total,
        servicos: servicos.map(s => ({
          nome: s.nome,
          preco: s.preco
        }))
      };
    } catch (error) {
      logger.error('[CancelAppointmentUseCase] Erro ao buscar dados completos:', error);
      return null;
    }
  }
}

module.exports = CancelAppointmentUseCase;
