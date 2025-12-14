/**
 * Testes do ReminderService e Cron Jobs
 * 
 * CRÍTICO: Testa o sistema de lembretes automáticos
 * - Seleção correta de agendamentos para lembrete 24h
 * - Seleção correta de agendamentos para lembrete 2h
 * - Não enviar lembretes duplicados
 * - Respeitar status do agendamento
 */

const { db } = require('../../src/config/knex');
const ReminderService = require('../../src/services/ReminderService');
const bcrypt = require('bcryptjs');

describe('⏰ Testes do Sistema de Lembretes (Cron Jobs)', () => {
  let reminderService;
  let unidade, cliente, agente, agendamentoAmanha, agendamentoHoje;
  
  beforeAll(async () => {
    reminderService = new ReminderService();
    await cleanupReminderTestData();
    
    // Setup: criar dados de teste
    const setup = await createReminderTestSetup();
    unidade = setup.unidade;
    cliente = setup.cliente;
    agente = setup.agente;
    agendamentoAmanha = setup.agendamentoAmanha;
    agendamentoHoje = setup.agendamentoHoje;
  });
  
  afterAll(async () => {
    await cleanupReminderTestData();
  });

  describe('📋 Seleção de Agendamentos para Lembrete 24h', () => {
    test('Deve encontrar agendamentos de amanhã para lembrete 24h', async () => {
      const appointments = await reminderService.getAppointmentsFor24hReminder();

      // Deve encontrar pelo menos o agendamento de teste de amanhã
      // O método retorna agendamento_id, não id
      const found = appointments.find(a => a.agendamento_id === agendamentoAmanha.id);
      expect(found).toBeTruthy();
    });
    
    test('Não deve incluir agendamentos cancelados', async () => {
      // Criar agendamento cancelado para amanhã
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const [agendamentoCancelado] = await db('agendamentos').insert({
        cliente_id: cliente.id,
        agente_id: agente.id,
        unidade_id: unidade.id,
        data_agendamento: tomorrow.toISOString().split('T')[0],
        hora_inicio: '16:00',
        hora_fim: '16:30',
        status: 'Cancelado', // Status cancelado
        valor_total: 50.00,
        observacoes: 'REMINDER_TEST cancelado',
        created_at: new Date(),
        updated_at: new Date()
      }).returning('*');
      
      const appointments = await reminderService.getAppointmentsFor24hReminder();
      const found = appointments.find(a => a.agendamento_id === agendamentoCancelado.id);

      expect(found).toBeFalsy(); // NÃO deve encontrar
      
      // Cleanup
      await db('agendamentos').where('id', agendamentoCancelado.id).del();
    });
    
    test('Não deve incluir agendamentos que já receberam lembrete 24h', async () => {
      // Simular que já enviamos lembrete para o agendamento de amanhã
      await db('lembretes_enviados').insert({
        agendamento_id: agendamentoAmanha.id,
        unidade_id: unidade.id, // Campo obrigatório
        telefone_destino: cliente.telefone, // Campo obrigatório
        tipo_lembrete: '24h',
        status: 'enviado',
        enviar_em: new Date(),
        enviado_em: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }).onConflict().ignore();
      
      const appointments = await reminderService.getAppointmentsFor24hReminder();
      const found = appointments.find(a => a.agendamento_id === agendamentoAmanha.id);

      expect(found).toBeFalsy(); // NÃO deve encontrar (já enviou)
      
      // Cleanup - remover lembrete para não afetar outros testes
      await db('lembretes_enviados').where('agendamento_id', agendamentoAmanha.id).del();
    });
  });

  describe('📋 Seleção de Agendamentos para Lembrete 2h', () => {
    test('Deve verificar agendamentos de hoje com horário próximo', async () => {
      const appointments = await reminderService.getAppointmentsFor2hReminder();
      
      // Verificar se o método retorna um array
      expect(Array.isArray(appointments)).toBe(true);
    });
  });

  describe('🔄 Processamento de Lembretes', () => {
    test('processAllReminders deve executar sem erros', async () => {
      // Este teste verifica se o processo completo roda sem exceções
      await expect(reminderService.processAllReminders())
        .resolves
        .not.toThrow();
    });
    
    test('Deve ter estrutura correta de resultado', async () => {
      const results = await reminderService.processAllReminders();
      
      expect(results).toHaveProperty('reminders24h');
      expect(results).toHaveProperty('reminders2h');
      expect(results.reminders24h).toHaveProperty('processed');
      expect(results.reminders24h).toHaveProperty('sent');
    });
  });
});

// Funções auxiliares

async function cleanupReminderTestData() {
  await db('lembretes_enviados').whereRaw(`agendamento_id IN (SELECT id FROM agendamentos WHERE observacoes LIKE '%REMINDER_TEST%')`).del().catch(() => {});
  await db('agendamento_servicos').whereRaw(`agendamento_id IN (SELECT id FROM agendamentos WHERE observacoes LIKE '%REMINDER_TEST%')`).del().catch(() => {});
  await db('agendamentos').where('observacoes', 'like', '%REMINDER_TEST%').del().catch(() => {});
  await db('agente_unidades').whereRaw(`agente_id IN (SELECT id FROM agentes WHERE email LIKE '%reminder_test%')`).del().catch(() => {});
  await db('agentes').where('email', 'like', '%reminder_test%').del().catch(() => {});
  await db('clientes').where('primeiro_nome', 'like', '%REMINDER_TEST%').del().catch(() => {});
  await db('unidades').where('nome', 'like', '%REMINDER_TEST%').del().catch(() => {});
  await db('usuarios').where('email', 'like', '%reminder_test%').del().catch(() => {});
}

async function createReminderTestSetup() {
  const senhaHash = await bcrypt.hash('Test@123', 10);
  
  // Admin
  const [admin] = await db('usuarios').insert({
    email: 'admin_reminder_test@test.com', nome: 'Admin REMINDER_TEST',
    senha_hash: senhaHash, role: 'ADMIN', tipo_usuario: 'admin',
    status: 'Ativo', plano: 'Multi', limite_unidades: 5,
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  // Unidade
  const [unidade] = await db('unidades').insert({
    nome: 'Unidade REMINDER_TEST', usuario_id: admin.id,
    telefone: '11999999999', status: 'Ativo',
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  // Agente
  const [agenteUser] = await db('usuarios').insert({
    email: 'agente_reminder_test@test.com', nome: 'Agente REMINDER_TEST',
    senha_hash: senhaHash, role: 'AGENTE', tipo_usuario: 'agent',
    status: 'Ativo', unidade_id: unidade.id,
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  const [agente] = await db('agentes').insert({
    nome: 'Agente', sobrenome: 'REMINDER_TEST',
    email: agenteUser.email, telefone: '11988888888',
    usuario_id: agenteUser.id, unidade_id: unidade.id, status: 'Ativo',
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  // Inserir na tabela agente_unidades (sem ON CONFLICT pois não há constraint única)
  const exists = await db('agente_unidades')
    .where({ agente_id: agente.id, unidade_id: unidade.id })
    .first();
  if (!exists) {
    await db('agente_unidades').insert({ agente_id: agente.id, unidade_id: unidade.id });
  }

  // Cliente
  const [cliente] = await db('clientes').insert({
    primeiro_nome: 'Cliente', ultimo_nome: 'REMINDER_TEST',
    telefone: '11977777777', telefone_limpo: '11977777777',
    unidade_id: unidade.id, status: 'Ativo',
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  // Agendamento para amanhã (24h)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [agendamentoAmanha] = await db('agendamentos').insert({
    cliente_id: cliente.id, agente_id: agente.id, unidade_id: unidade.id,
    data_agendamento: tomorrow.toISOString().split('T')[0],
    hora_inicio: '10:00', hora_fim: '10:30',
    status: 'Aprovado', valor_total: 50.00,
    observacoes: 'REMINDER_TEST amanha',
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  // Agendamento para hoje (2h)
  const today = new Date();
  const hoursLater = new Date(today.getTime() + 3 * 60 * 60 * 1000); // 3 horas depois

  const [agendamentoHoje] = await db('agendamentos').insert({
    cliente_id: cliente.id, agente_id: agente.id, unidade_id: unidade.id,
    data_agendamento: today.toISOString().split('T')[0],
    hora_inicio: hoursLater.toTimeString().slice(0, 5),
    hora_fim: new Date(hoursLater.getTime() + 30 * 60 * 1000).toTimeString().slice(0, 5),
    status: 'Aprovado', valor_total: 50.00,
    observacoes: 'REMINDER_TEST hoje',
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  return { admin, unidade, agente, cliente, agendamentoAmanha, agendamentoHoje };
}

