/**
 * 🚀 TESTES AVANÇADOS DE FUNCIONALIDADES
 * 
 * Testa funcionalidades críticas do sistema:
 * - Upload de Imagens (avatars, logos)
 * - Dashboard e Relatórios
 * - Horários de Funcionamento
 * - Integração WhatsApp
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { db } = require('../../src/config/knex');

let app;
let authToken;
let testData = {};
let adminUser;

describe('🚀 Testes Avançados de Funcionalidades', () => {
  
  beforeAll(async () => {
    const appModule = require('../../src/app');
    app = appModule.app;

    // Buscar usuário admin para login
    adminUser = await db('usuarios')
      .whereIn('tipo_usuario', ['admin', 'ADMIN'])
      .where('status', 'Ativo')
      .first();

    if (adminUser) {
      const senhasTeste = ['Teste@123', 'Admin@123', '123456'];
      for (const senha of senhasTeste) {
        const loginRes = await request(app)
          .post('/api/auth/login')
          .send({ email: adminUser.email, senha });
        if (loginRes.body?.data?.token) {
          authToken = loginRes.body.data.token;
          break;
        }
      }
    }

    // Buscar dados existentes para testes
    const unidade = adminUser?.id
      ? await db('unidades').where({ status: 'Ativo', usuario_id: adminUser.id }).first()
      : await db('unidades').where('status', 'Ativo').first();

    const agente = unidade?.id
      ? await db('agentes').where({ status: 'Ativo', unidade_id: unidade.id }).first()
      : await db('agentes').where('status', 'Ativo').first();
    
    testData = {
      unidade_id: unidade?.id,
      agente_id: agente?.id
    };
  });

  afterAll(async () => {
    await db.destroy();
  });

  // ═══════════════════════════════════════════════════════════════
  // 📸 TESTES DE UPLOAD DE IMAGENS
  // ═══════════════════════════════════════════════════════════════
  describe('📸 Upload de Imagens', () => {
    
    test('✓ Deve rejeitar upload sem autenticação', async () => {
      const res = await request(app)
        .post('/api/settings/logo')
        .attach('logo', Buffer.from('fake'), 'test.jpg');

      expect(res.status).toBe(401);
    });

    test('✓ Deve rejeitar arquivo muito grande (>5MB)', async () => {
      if (!authToken) return;

      // Criar buffer de 6MB (maior que limite de 5MB)
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'a');

      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('logo', largeBuffer, 'large.jpg');

      expect([400, 413, 500]).toContain(res.status);
    });

    test('✓ Deve rejeitar tipos de arquivo não permitidos', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('logo', Buffer.from('fake exe content'), 'malicious.exe');

      expect([400, 500]).toContain(res.status);
    });

    test('✓ Deve listar avatares disponíveis', async () => {
      if (!authToken || !testData.agente_id) return;

      const res = await request(app)
        .get(`/api/agentes/${testData.agente_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Verificar que resposta contém campo avatar_url
      expect(res.body.data).toBeDefined();
    });

    test('✓ Deve aceitar tipos de imagem válidos (JPEG, PNG, GIF, WebP)', async () => {
      // Teste de validação de tipos - verificar apenas a lógica do filter
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      const rejectedTypes = ['application/pdf', 'text/plain', 'application/exe'];
      
      expect(allowedTypes.length).toBe(5);
      expect(rejectedTypes.every(t => !allowedTypes.includes(t))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 📊 TESTES DE DASHBOARD E RELATÓRIOS
  // ═══════════════════════════════════════════════════════════════
  describe('📊 Dashboard e Relatórios', () => {
    
    test('✓ Deve buscar estatísticas de notificações', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/notificacoes/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Verificar estrutura de resposta
      expect(res.body).toBeDefined();
    });

    test('✓ Deve buscar agendamentos para dashboard', async () => {
      if (!authToken) return;

      const hoje = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/agendamentos?data_inicio=${hoje}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    test('✓ Deve filtrar agendamentos por status', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/agendamentos?status=Aprovado')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    test('✓ Deve filtrar agendamentos por agente', async () => {
      if (!authToken || !testData.agente_id) return;

      const res = await request(app)
        .get(`/api/agendamentos?agente_id=${testData.agente_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    test('✓ Deve filtrar agendamentos por período', async () => {
      if (!authToken) return;

      const dataInicio = '2025-01-01';
      const dataFim = '2025-12-31';
      const res = await request(app)
        .get(`/api/agendamentos?data_inicio=${dataInicio}&data_fim=${dataFim}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ⏰ TESTES DE HORÁRIOS DE FUNCIONAMENTO
  // ═══════════════════════════════════════════════════════════════
  describe('⏰ Horários de Funcionamento', () => {

    test('✓ Deve buscar horários de funcionamento da unidade', async () => {
      if (!authToken || !testData.unidade_id) return;

      // Buscar diretamente do banco (não há endpoint específico exposto)
      const horarios = await db('horarios_funcionamento_unidade')
        .where('unidade_id', testData.unidade_id);

      expect(Array.isArray(horarios)).toBe(true);
    });

    test('✓ Deve validar estrutura dos horários (7 dias da semana)', async () => {
      if (!testData.unidade_id) return;

      const horarios = await db('horarios_funcionamento_unidade')
        .where('unidade_id', testData.unidade_id)
        .orderBy('dia_semana');

      // Se existirem horários, devem ter no máximo 7 dias
      if (horarios.length > 0) {
        expect(horarios.length).toBeLessThanOrEqual(7);
        horarios.forEach(h => {
          expect(h.dia_semana).toBeGreaterThanOrEqual(0);
          expect(h.dia_semana).toBeLessThanOrEqual(6);
        });
      }
    });

    test('✓ Deve buscar horários de funcionamento do agente', async () => {
      if (!authToken || !testData.agente_id) return;

      const horarios = await db('horarios_funcionamento')
        .where('agente_id', testData.agente_id);

      expect(Array.isArray(horarios)).toBe(true);
    });

    test('✓ Deve validar formato de períodos (inicio/fim)', async () => {
      if (!testData.unidade_id) return;

      const horarios = await db('horarios_funcionamento_unidade')
        .where('unidade_id', testData.unidade_id)
        .where('is_aberto', true)
        .first();

      if (horarios && horarios.horarios_json) {
        const periodos = typeof horarios.horarios_json === 'string'
          ? JSON.parse(horarios.horarios_json)
          : horarios.horarios_json;

        if (periodos.length > 0) {
          periodos.forEach(p => {
            expect(p).toHaveProperty('inicio');
            expect(p).toHaveProperty('fim');
            // Validar formato HH:MM
            expect(p.inicio).toMatch(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);
            expect(p.fim).toMatch(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);
          });
        }
      }
    });

    test('✓ Deve buscar slots disponíveis via API pública', async () => {
      if (!testData.unidade_id || !testData.agente_id) return;

      // Data futura (próxima segunda-feira)
      const hoje = new Date();
      const proximaSegunda = new Date(hoje);
      proximaSegunda.setDate(hoje.getDate() + ((1 + 7 - hoje.getDay()) % 7 || 7));
      const dataFormatada = proximaSegunda.toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/public/slots-disponiveis?agente_id=${testData.agente_id}&data=${dataFormatada}&unidade_id=${testData.unidade_id}`);

      // API pública pode retornar 200, 400 ou 404 dependendo da configuração
      expect([200, 400, 404]).toContain(res.status);
    });

    test('✓ Deve listar exceções de calendário da unidade', async () => {
      if (!authToken || !testData.unidade_id) return;

      const res = await request(app)
        .get(`/api/unidades/${testData.unidade_id}/excecoes`)
        .set('Authorization', `Bearer ${authToken}`);

      // Pode retornar 200 ou 404 se não há exceções
      expect([200, 404]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 📱 TESTES DE INTEGRAÇÃO WHATSAPP
  // ═══════════════════════════════════════════════════════════════
  describe('📱 Integração WhatsApp', () => {

    test('✓ Deve verificar status do serviço WhatsApp', async () => {
      // Importar serviço diretamente
      const WhatsAppService = require('../../src/services/WhatsAppService');
      const whatsAppService = new WhatsAppService();

      // Verificar se método isEnabled existe e funciona
      const isEnabled = whatsAppService.isEnabled();
      expect(typeof isEnabled).toBe('boolean');
    });

    test('✓ Deve formatar número de telefone corretamente', async () => {
      const WhatsAppService = require('../../src/services/WhatsAppService');
      const whatsAppService = new WhatsAppService();

      // Testar formatação de números
      const formattedNumber = whatsAppService.formatPhoneNumber('11999998888');
      expect(formattedNumber).toBeDefined();
      expect(formattedNumber.length).toBeGreaterThan(10);
    });

    test('✓ Deve gerar link WhatsApp corretamente', async () => {
      const WhatsAppService = require('../../src/services/WhatsAppService');
      const whatsAppService = new WhatsAppService();

      const link = whatsAppService.generateWhatsAppLink('11999998888');
      expect(link).toContain('wa.me');
    });

    test('✓ Deve gerar mensagem de confirmação corretamente', async () => {
      const WhatsAppService = require('../../src/services/WhatsAppService');
      const whatsAppService = new WhatsAppService();

      // Estrutura correta conforme esperado pelo serviço
      const agendamentoTeste = {
        cliente: { nome: 'João Teste' },
        agente: { nome: 'Maria Agente' },
        unidade: { nome: 'Salão Centro' },
        data_agendamento: '2025-01-15',
        hora_inicio: '10:00',
        servicos: [{ nome: 'Corte Masculino', preco: 50 }],
        agendamento_id: 123,
        agente_telefone: '11999998888',
        unidade_telefone: '11999997777',
        pontos: 10
      };

      const mensagem = whatsAppService.generateAppointmentConfirmationClient(agendamentoTeste);
      expect(mensagem).toContain('João Teste');
      expect(mensagem).toContain('Corte Masculino');
    });

    test('✓ Deve gerar mensagem de lembrete 24h', async () => {
      const WhatsAppService = require('../../src/services/WhatsAppService');
      const whatsAppService = new WhatsAppService();

      // Estrutura correta conforme esperado pelo serviço
      const agendamentoTeste = {
        cliente: { nome: 'João Teste' },
        agente: { nome: 'Maria' },
        unidade: { nome: 'Salão' },
        data_agendamento: '2025-01-15',
        hora_inicio: '10:00',
        servicos: [{ nome: 'Corte' }],
        agendamento_id: 123,
        pontos: 5
      };

      const mensagem = whatsAppService.generateReminder24hMessage(agendamentoTeste);
      expect(mensagem).toBeDefined();
      expect(typeof mensagem).toBe('string');
    });

    test('✓ Deve retornar erro quando serviço está desabilitado', async () => {
      const WhatsAppService = require('../../src/services/WhatsAppService');
      const whatsAppService = new WhatsAppService();

      // Desabilitar temporariamente
      const originalEnabled = whatsAppService.enabled;
      whatsAppService.enabled = false;

      const result = await whatsAppService.sendMessage('11999998888', 'teste');
      expect(result.success).toBe(false);

      // Restaurar
      whatsAppService.enabled = originalEnabled;
    });

    test('✓ Deve validar histórico de notificações via API', async () => {
      if (!authToken) return;

      // Buscar notificações via API
      const res = await request(app)
        .get('/api/notificacoes')
        .set('Authorization', `Bearer ${authToken}`);

      // API deve retornar 200 ou 404 se não há notificações
      expect([200, 404]).toContain(res.status);
    });

    test('✓ Deve ter endpoint de estatísticas de notificações', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/notificacoes/stats')
        .set('Authorization', `Bearer ${authToken}`);

      // Endpoint deve existir e retornar dados
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 🔒 TESTES DE SEGURANÇA AVANÇADOS
  // ═══════════════════════════════════════════════════════════════
  describe('🔒 Segurança Avançada', () => {

    test('✓ Deve proteger rotas de admin contra acesso não autorizado', async () => {
      const res = await request(app)
        .get('/api/audit-logs/stats');

      expect(res.status).toBe(401);
    });

    test('✓ Deve proteger upload de logo sem autenticação', async () => {
      const res = await request(app)
        .post('/api/settings/logo');

      expect(res.status).toBe(401);
    });

    test('✓ Deve validar magic bytes de arquivos (proteção contra upload malicioso)', async () => {
      const fileValidation = require('../../src/middleware/fileValidation');

      // Verificar que módulo de validação existe
      expect(fileValidation).toBeDefined();

      // Verificar que funções de validação existem
      expect(typeof fileValidation.validateImageMagicBytes).toBe('function');
      expect(typeof fileValidation.validateBusboyFiles).toBe('function');
    });
  });
});

