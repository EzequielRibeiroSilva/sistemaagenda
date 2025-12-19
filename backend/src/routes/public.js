/**
 * Rotas: Public Booking
 * Descrição: Endpoints públicos para sistema de agendamentos
 * Sem autenticação JWT - acessível para clientes
 */

const express = require('express');
const router = express.Router();
const PublicBookingController = require('../controllers/PublicBookingController');
const CupomController = require('../controllers/CupomController');
const logger = require('../utils/logger'); // ✅ CORREÇÃO: Import do logger
const { 
  clientSearchRateLimit, 
  createBookingRateLimit, 
  couponValidationRateLimit,
  cancelBookingRateLimit,
  rescheduleBookingRateLimit,
  generalPublicRateLimit 
} = require('../middleware/publicBookingRateLimit');

// Inicializar controllers
const publicBookingController = new PublicBookingController();
const cupomController = new CupomController();

// ✅ CORREÇÃO 1.2: Aplicar rate limiting geral em todas as rotas públicas
router.use(generalPublicRateLimit);

/**
 * POST /api/public/session/create
 * Criar sessão temporária para booking público
 * ✅ CORREÇÃO 1.2: Gerar token de sessão para validar operações sensíveis
 */
router.post('/session/create', async (req, res) => {
  await publicBookingController.createPublicSession(req, res);
});

/**
 * GET /api/public/salao/:unidadeId
 * Carregar dados públicos do salão (unidade, agentes, serviços, horários)
 */
router.get('/salao/:unidadeId', async (req, res) => {
  await publicBookingController.getSalaoData(req, res);
});

/**
 * GET /api/public/salao/:unidadeId/extras?servico_ids=1,2,3
 * Buscar extras filtrados por serviços selecionados (lógica de UNIÃO)
 */
router.get('/salao/:unidadeId/extras', async (req, res) => {
  await publicBookingController.getExtrasByServices(req, res);
});

/**
 * GET /api/public/agentes/:id/disponibilidade?data=YYYY-MM-DD
 * Buscar disponibilidade de um agente em uma data específica
 */
router.get('/agentes/:id/disponibilidade', async (req, res) => {
  await publicBookingController.getAgenteDisponibilidade(req, res);
});

/**
 * GET /api/public/cliente/buscar?telefone=XXX&unidade_id=Y&session_token=ZZZ
 * Buscar cliente por telefone (para pré-preencher dados)
 * ✅ CORREÇÃO 1.2: Rate limiting agressivo (3 tentativas / 5 min) + validação de sessão
 */
router.get('/cliente/buscar', clientSearchRateLimit, async (req, res) => {
  await publicBookingController.buscarCliente(req, res);
});

/**
 * POST /api/public/agendamento
 * Criar novo agendamento público
 * ✅ CORREÇÃO 1.2: Rate limiting (5 tentativas / 15 min)
 */
router.post('/agendamento', createBookingRateLimit, async (req, res) => {
  await publicBookingController.createAgendamento(req, res);
});

/**
 * GET /api/public/agendamento/:id/preview
 * Buscar dados básicos do agendamento (unidade_id) sem validação
 */
router.get('/agendamento/:id/preview', async (req, res) => {
  await publicBookingController.getAgendamentoPreview(req, res);
});

/**
 * GET /api/public/agendamento/:id
 * Buscar detalhes de um agendamento (com validação de telefone)
 */
router.get('/agendamento/:id', async (req, res) => {
  await publicBookingController.getAgendamento(req, res);
});

/**
 * PUT /api/public/agendamento/:id/reagendar
 * Reagendar um agendamento (alterar data e hora)
 * ✅ CORREÇÃO 1.8: Rate limiting (5 tentativas / 15 min)
 */
router.put('/agendamento/:id/reagendar', rescheduleBookingRateLimit, async (req, res) => {
  await publicBookingController.reagendarAgendamento(req, res);
});

/**
 * PATCH /api/public/agendamento/:id/cancelar
 * Cancelar um agendamento
 * ✅ CORREÇÃO 1.8: Rate limiting (3 tentativas / 15 min)
 */
router.patch('/agendamento/:id/cancelar', cancelBookingRateLimit, async (req, res) => {
  await publicBookingController.cancelarAgendamento(req, res);
});

/**
 * POST /api/public/cupons/validar
 * Validar cupom de desconto para uso na página de booking
 * ✅ CORREÇÃO 1.2: Rate limiting (10 tentativas / 15 min)
 */
router.post('/cupons/validar', couponValidationRateLimit, async (req, res) => {
  await cupomController.validar(req, res);
});

/**
 * GET /api/public/usuario/:usuarioId/unidades
 * Buscar todas as unidades ativas de um usuário (para seleção de local)
 */
router.get('/usuario/:usuarioId/unidades', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const Unidade = require('../models/Unidade');
    const unidadeModel = new Unidade();

    logger.log(`[Public] Buscando unidades para usuario_id ${usuarioId}`);

    // Buscar todas as unidades ativas do usuário
    const unidades = await unidadeModel.db('unidades')
      .where('usuario_id', parseInt(usuarioId))
      .where('status', 'Ativo')
      .select('id', 'nome', 'endereco', 'telefone', 'slug_url')
      .orderBy('nome', 'asc');

    logger.log(`[Public] Encontradas ${unidades.length} unidades ativas`);

    res.json({
      success: true,
      data: unidades
    });

  } catch (error) {
    logger.error('[Public] Erro ao buscar unidades do usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: 'Erro ao buscar locais disponíveis'
    });
  }
});

/**
 * GET /api/public/salao/slug/:slug
 * Buscar unidade por slug (URL amigável)
 */
router.get('/salao/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const Unidade = require('../models/Unidade');
    const unidadeModel = new Unidade();

    const unidade = await unidadeModel.findBySlug(slug);

    if (!unidade) {
      return res.status(404).json({
        success: false,
        error: 'Salão não encontrado',
        message: 'Este salão não foi encontrado ou não está ativo'
      });
    }

    res.json({
      success: true,
      data: {
        unidade_id: unidade.id,
        nome: unidade.nome,
        slug_url: unidade.slug_url
      }
    });

  } catch (error) {
    logger.error('[Public] Erro ao buscar por slug:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: 'Erro ao buscar salão'
    });
  }
});

/**
 * GET /api/public/whatsapp/test
 * Testar conexão com Evolution API
 */
router.get('/whatsapp/test', async (req, res) => {
  try {
    const WhatsAppService = require('../services/WhatsAppService');
    const whatsAppService = new WhatsAppService();

    const result = await whatsAppService.testConnection();

    res.json({
      success: result.success,
      data: result.data || null,
      error: result.error || null,
      message: result.success ? 'Conexão WhatsApp OK' : 'Falha na conexão WhatsApp'
    });

  } catch (error) {
    logger.error('[Public] Erro ao testar WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: 'Erro ao testar conexão WhatsApp'
    });
  }
});

module.exports = router;
