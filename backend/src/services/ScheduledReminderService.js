/**
 * Service: ScheduledReminderService
 * Descrição: Gerenciamento de lembretes programados (criação antecipada)
 * Funcionalidades: Criar lembretes programados ao criar/editar agendamento
 */

const { db } = require('../config/knex');

class ScheduledReminderService {
  constructor() {
    this.tableName = 'lembretes_enviados';
  }

  /**
   * Calcular horário de envio do lembrete
   * @param {string} dataAgendamento - Data do agendamento (YYYY-MM-DD)
   * @param {string} horaInicio - Hora do agendamento (HH:MM:SS)
   * @param {number} horasAntes - Horas antes do agendamento
   * @returns {Date} - Horário de envio
   */
  calcularHorarioEnvio(dataAgendamento, horaInicio, horasAntes) {
    const dataHora = new Date(`${dataAgendamento}T${horaInicio}`);
    const horarioEnvio = new Date(dataHora.getTime() - (horasAntes * 60 * 60 * 1000));
    return horarioEnvio;
  }

  /**
   * Criar lembretes programados para um agendamento
   * @param {Object} agendamentoData - Dados do agendamento
   * @returns {Promise<Object>} - { lembrete24h, lembrete1h }
   */
  async criarLembretesProgramados(agendamentoData) {
    try {
      const {
        agendamento_id,
        unidade_id,
        data_agendamento,
        hora_inicio,
        cliente_telefone
      } = agendamentoData;

      console.log(`📅 [ScheduledReminderService] Criando lembretes programados para agendamento #${agendamento_id}`);

      // Calcular horários de envio
      const horarioLembrete24h = this.calcularHorarioEnvio(data_agendamento, hora_inicio, 24);
      const horarioLembrete1h = this.calcularHorarioEnvio(data_agendamento, hora_inicio, 1);

      const agora = new Date();

      // Criar array de lembretes a serem inseridos
      const lembretes = [];

      // Lembrete 24h (apenas se ainda não passou do horário)
      if (horarioLembrete24h > agora) {
        lembretes.push({
          agendamento_id,
          unidade_id,
          tipo_lembrete: '24h',
          tipo_notificacao: 'lembrete_24h',
          status: 'programado',
          telefone_destino: cliente_telefone,
          enviar_em: horarioLembrete24h,
          tentativas: 0,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        });
        console.log(`  ✅ Lembrete 24h programado para: ${horarioLembrete24h.toLocaleString('pt-BR')}`);
      } else {
        console.log(`  ⏭️ Lembrete 24h pulado (horário já passou)`);
      }

      // Lembrete 1h (apenas se ainda não passou do horário)
      if (horarioLembrete1h > agora) {
        lembretes.push({
          agendamento_id,
          unidade_id,
          tipo_lembrete: '2h',
          tipo_notificacao: 'lembrete_1h',
          status: 'programado',
          telefone_destino: cliente_telefone,
          enviar_em: horarioLembrete1h,
          tentativas: 0,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        });
        console.log(`  ✅ Lembrete 1h programado para: ${horarioLembrete1h.toLocaleString('pt-BR')}`);
      } else {
        console.log(`  ⏭️ Lembrete 1h pulado (horário já passou)`);
      }

      // Inserir lembretes no banco
      if (lembretes.length > 0) {
        const ids = await db(this.tableName)
          .insert(lembretes)
          .returning('id');

        console.log(`✅ [ScheduledReminderService] ${lembretes.length} lembrete(s) programado(s) criado(s) para agendamento #${agendamento_id}`);

        return {
          success: true,
          count: lembretes.length,
          ids: ids.map(id => typeof id === 'object' ? id.id : id)
        };
      } else {
        console.log(`⚠️ [ScheduledReminderService] Nenhum lembrete programado (horários já passaram)`);
        return {
          success: true,
          count: 0,
          ids: []
        };
      }

    } catch (error) {
      // Se erro de constraint única, significa que já existem lembretes
      if (error.code === '23505') {
        console.log(`⚠️ [ScheduledReminderService] Lembretes já existem para agendamento #${agendamentoData.agendamento_id}`);
        return {
          success: false,
          error: 'Lembretes já existem',
          code: 'DUPLICATE'
        };
      }

      console.error(`❌ [ScheduledReminderService] Erro ao criar lembretes programados:`, error);
      throw error;
    }
  }

  /**
   * Cancelar lembretes programados de um agendamento
   * @param {number} agendamentoId - ID do agendamento
   * @returns {Promise<number>} - Número de lembretes cancelados
   */
  async cancelarLembretesProgramados(agendamentoId) {
    try {
      console.log(`🚫 [ScheduledReminderService] Cancelando lembretes programados do agendamento #${agendamentoId}`);

      const deleted = await db(this.tableName)
        .where('agendamento_id', agendamentoId)
        .where('status', 'programado')
        .del();

      console.log(`✅ [ScheduledReminderService] ${deleted} lembrete(s) cancelado(s)`);
      return deleted;

    } catch (error) {
      console.error(`❌ [ScheduledReminderService] Erro ao cancelar lembretes:`, error);
      throw error;
    }
  }

  /**
   * Atualizar lembretes programados ao reagendar
   * @param {Object} agendamentoData - Novos dados do agendamento
   * @returns {Promise<Object>}
   */
  async atualizarLembretesProgramados(agendamentoData) {
    try {
      console.log(`🔄 [ScheduledReminderService] Atualizando lembretes do agendamento #${agendamentoData.agendamento_id}`);

      // 1. Cancelar lembretes antigos
      await this.cancelarLembretesProgramados(agendamentoData.agendamento_id);

      // 2. Criar novos lembretes
      const result = await this.criarLembretesProgramados(agendamentoData);

      console.log(`✅ [ScheduledReminderService] Lembretes atualizados com sucesso`);
      return result;

    } catch (error) {
      console.error(`❌ [ScheduledReminderService] Erro ao atualizar lembretes:`, error);
      throw error;
    }
  }
}

module.exports = ScheduledReminderService;
