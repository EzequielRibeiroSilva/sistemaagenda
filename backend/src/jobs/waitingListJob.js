/**
 * Job: waitingListJob
 * Descrição: Cron job para notificar clientes da lista de espera quando surgem vagas
 * Frequência: A cada 15 minutos
 * Horário permitido: 06:00 - 23:00
 * 
 * FASE 4: Lista de Espera Inteligente
 * Maximiza a ocupação da agenda notificando clientes automaticamente quando
 * surgem cancelamentos.
 */

const cron = require('node-cron');
const { db } = require('../config/knex');
const WhatsAppService = require('../services/WhatsAppService');
const logger = require('../utils/logger');

class WaitingListJob {
  constructor() {
    this.cronExpression = '*/15 * * * *'; // A cada 15 minutos
    this.isRunning = false;
    this.lastExecution = null;
    this.executionCount = 0;
    this.stats = {
      totalCancellations: 0,
      totalNotifications: 0,
      totalFailed: 0,
      totalExpired: 0
    };
  }

  /**
   * Executar o job de lista de espera
   */
  async execute() {
    // Prevenir execuções simultâneas
    if (this.isRunning) {
      logger.log('⚠️ [WaitingListJob] Job já está em execução. Pulando esta iteração.');
      return;
    }

    // Verificar horário permitido (06:00 - 23:00)
    const now = new Date();
    const hour = now.getHours();
    if (hour < 6 || hour >= 23) {
      logger.log(`⏰ [WaitingListJob] Fora do horário permitido (${hour}h). Pulando execução.`);
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    try {
      logger.log('\n' + '='.repeat(80));
      logger.log(`🔔 [WaitingListJob] EXECUÇÃO #${this.executionCount} INICIADA`);
      logger.log(`⏰ Horário: ${new Date().toLocaleString('pt-BR')}`);
      logger.log('='.repeat(80) + '\n');

      // 1. Buscar agendamentos cancelados nos últimos 15 minutos
      const cancelamentos = await this.buscarCancelamentosRecentes();
      logger.log(`📋 [WaitingListJob] ${cancelamentos.length} cancelamento(s) encontrado(s)`);

      let notificacoesEnviadas = 0;
      let notificacoesFalhadas = 0;

      // 2. Para cada cancelamento, buscar clientes na lista de espera
      for (const cancelamento of cancelamentos) {
        try {
          const clientesNotificados = await this.processarCancelamento(cancelamento);
          notificacoesEnviadas += clientesNotificados;
        } catch (err) {
          logger.error(`❌ [WaitingListJob] Erro ao processar cancelamento ${cancelamento.id}:`, err.message);
          notificacoesFalhadas++;
        }
      }

      // 3. Expirar entradas antigas da lista de espera (datas passadas)
      const expirados = await this.expirarEntradasAntigas();
      logger.log(`🗑️ [WaitingListJob] ${expirados} entrada(s) expirada(s) removida(s)`);

      // Atualizar estatísticas
      this.stats.totalCancellations += cancelamentos.length;
      this.stats.totalNotifications += notificacoesEnviadas;
      this.stats.totalFailed += notificacoesFalhadas;
      this.stats.totalExpired += expirados;

      this.lastExecution = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      logger.log('\n' + '='.repeat(80));
      logger.log(`✅ [WaitingListJob] EXECUÇÃO #${this.executionCount} CONCLUÍDA`);
      logger.log(`⏱️ Duração: ${duration}s`);
      logger.log(`📊 Cancelamentos processados: ${cancelamentos.length}`);
      logger.log(`📊 Notificações enviadas: ${notificacoesEnviadas}`);
      logger.log(`📊 Falhas: ${notificacoesFalhadas}`);
      logger.log(`📊 Expirados: ${expirados}`);
      logger.log('='.repeat(80) + '\n');

    } catch (error) {
      logger.error('\n' + '='.repeat(80));
      logger.error(`❌ [WaitingListJob] ERRO NA EXECUÇÃO #${this.executionCount}`);
      logger.error('❌ Erro:', error);
      logger.error('='.repeat(80) + '\n');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Buscar agendamentos cancelados nos últimos 15 minutos
   */
  async buscarCancelamentosRecentes() {
    const quinzeMinutosAtras = new Date(Date.now() - 15 * 60 * 1000);

    return await db('agendamentos')
      .where('status', 'Cancelado')
      .where('updated_at', '>=', quinzeMinutosAtras)
      .whereNull('deleted_at')
      .select(
        'id',
        'unidade_id',
        'agente_id',
        'data_agendamento',
        'hora_inicio',
        'hora_fim',
        'updated_at'
      )
      .orderBy('updated_at', 'desc');
  }

  /**
   * Processar um cancelamento e notificar clientes da lista de espera
   */
  async processarCancelamento(cancelamento) {
    logger.log(`\n🔍 [WaitingListJob] Processando cancelamento #${cancelamento.id}`);
    logger.log(`   📅 Data: ${cancelamento.data_agendamento}`);
    logger.log(`   ⏰ Horário: ${cancelamento.hora_inicio} - ${cancelamento.hora_fim}`);
    logger.log(`   👤 Profissional ID: ${cancelamento.agente_id}`);

    // Buscar clientes na lista de espera para esta data/profissional/unidade
    const clientesEspera = await db('lista_espera')
      .leftJoin('clientes', 'lista_espera.cliente_id', 'clientes.id')
      .leftJoin('agentes', 'lista_espera.agente_id', 'agentes.id')
      .where('lista_espera.unidade_id', cancelamento.unidade_id)
      .where('lista_espera.data_desejada', cancelamento.data_agendamento)
      .where('lista_espera.status', 'pendente')
      .where(function() {
        // Cliente quer este profissional específico OU aceita qualquer profissional
        this.where('lista_espera.agente_id', cancelamento.agente_id)
            .orWhereNull('lista_espera.agente_id');
      })
      .select(
        'lista_espera.id as lista_espera_id',
        'lista_espera.cliente_id',
        'lista_espera.telefone_cliente',
        'lista_espera.hora_inicio as hora_desejada',
        'lista_espera.servicos',
        db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
        db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome")
      )
      .orderBy('lista_espera.created_at', 'asc') // FIFO: primeiro que entrou é o primeiro notificado
      .limit(3); // Notificar até 3 clientes por vaga

    if (clientesEspera.length === 0) {
      logger.log(`   ℹ️ Nenhum cliente na lista de espera para esta vaga`);
      return 0;
    }

    logger.log(`   🎯 ${clientesEspera.length} cliente(s) encontrado(s) na lista de espera`);

    let notificados = 0;

    // Buscar instanceName da unidade para envio de WhatsApp
    const unidade = await db('unidades')
      .join('usuarios', 'unidades.usuario_id', 'usuarios.id')
      .where('unidades.id', cancelamento.unidade_id)
      .select('unidades.nome as unidade_nome', 'usuarios.whatsapp_instance_name')
      .first();

    const instanceName = unidade?.whatsapp_instance_name;
    if (!instanceName) {
      logger.error(`   ❌ Instância WhatsApp não configurada para unidade ${cancelamento.unidade_id}`);
      return 0;
    }

    const whatsAppService = new WhatsAppService();

    // Notificar cada cliente
    for (const cliente of clientesEspera) {
      try {
        const nomeCliente = String(cliente.cliente_nome || '').trim() || 'Cliente';
        const dataFormatada = new Date(cancelamento.data_agendamento).toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long'
        });

        // Mensagem personalizada
        const mensagem = `Olá ${nomeCliente}! 🔔\n\n` +
          `Temos uma ótima notícia! Um horário ficou disponível:\n\n` +
          `📅 Data: ${dataFormatada}\n` +
          `⏰ Horário: ${cancelamento.hora_inicio}\n` +
          `${cliente.agente_nome ? `👤 Profissional: ${cliente.agente_nome}\n` : ''}` +
          `\nVocê estava na lista de espera para esta data. Gostaria de agendar? 😊`;

        // Enviar mensagem
        await whatsAppService.sendMessage(instanceName, cliente.telefone_cliente, mensagem);

        // Atualizar status na lista de espera
        await db('lista_espera')
          .where('id', cliente.lista_espera_id)
          .update({
            status: 'notificado',
            notificado_em: db.fn.now(),
            agendamento_cancelado_id: cancelamento.id,
            updated_at: db.fn.now()
          });

        logger.log(`   ✅ Cliente ${nomeCliente} (${cliente.telefone_cliente}) notificado`);
        notificados++;

      } catch (err) {
        logger.error(`   ❌ Erro ao notificar cliente ${cliente.cliente_id}:`, err.message);
      }
    }

    return notificados;
  }

  /**
   * Expirar entradas antigas da lista de espera (datas passadas)
   */
  async expirarEntradasAntigas() {
    const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const expirados = await db('lista_espera')
      .where('data_desejada', '<', hoje)
      .whereIn('status', ['pendente', 'notificado'])
      .update({
        status: 'expirado',
        updated_at: db.fn.now()
      });

    return expirados;
  }

  /**
   * Iniciar o cron job
   */
  start() {
    logger.log('\n' + '='.repeat(80));
    logger.log('🚀 [WaitingListJob] INICIANDO CRON JOB DE LISTA DE ESPERA');
    logger.log(`📅 Expressão Cron: ${this.cronExpression} (a cada 15 minutos)`);
    logger.log(`⏰ Horário permitido: 06:00 - 23:00`);
    logger.log(`🎯 Objetivo: Notificar clientes quando surgem vagas por cancelamento`);
    logger.log(`📱 Canal: WhatsApp via Evolution API`);
    logger.log('='.repeat(80) + '\n');

    // Criar o cron job
    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.log('✅ [WaitingListJob] Cron job iniciado com sucesso!');
    logger.log(`⏰ Próxima execução: ${this.getNextExecutionTime()}\n`);
  }

  /**
   * Parar o cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.log('\n🛑 [WaitingListJob] Cron job parado.');
      this.printStats();
    }
  }

  /**
   * Obter horário da próxima execução
   */
  getNextExecutionTime() {
    const now = new Date();
    const next = new Date(now);
    // Próxima execução: arredondar para o próximo múltiplo de 15 minutos
    const minutes = now.getMinutes();
    const nextMinutes = Math.ceil((minutes + 1) / 15) * 15;
    if (nextMinutes >= 60) {
      next.setHours(now.getHours() + 1, 0, 0, 0);
    } else {
      next.setMinutes(nextMinutes, 0, 0);
    }
    return next.toLocaleString('pt-BR');
  }

  /**
   * Imprimir estatísticas do job
   */
  printStats() {
    logger.log('\n' + '='.repeat(80));
    logger.log('📊 [WaitingListJob] ESTATÍSTICAS GERAIS');
    logger.log('='.repeat(80));
    logger.log(`🔢 Total de execuções: ${this.executionCount}`);
    logger.log(`📤 Total de cancelamentos processados: ${this.stats.totalCancellations}`);
    logger.log(`✅ Total de notificações enviadas: ${this.stats.totalNotifications}`);
    logger.log(`❌ Total de falhas: ${this.stats.totalFailed}`);
    logger.log(`🗑️ Total de entradas expiradas: ${this.stats.totalExpired}`);
    if (this.lastExecution) {
      logger.log(`⏰ Última execução: ${this.lastExecution.toLocaleString('pt-BR')}`);
    }
    logger.log('='.repeat(80) + '\n');
  }

  /**
   * Obter status do job
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      executionCount: this.executionCount,
      lastExecution: this.lastExecution,
      nextExecution: this.getNextExecutionTime(),
      stats: this.stats,
      cronExpression: this.cronExpression
    };
  }
}

// Exportar instância única (singleton)
const waitingListJob = new WaitingListJob();

module.exports = waitingListJob;
