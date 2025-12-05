/**
 * Rotas: Public Booking
 * Descrição: Endpoints públicos para sistema de agendamentos
 * Sem autenticação JWT - acessível para clientes
 */

const express = require('express');
const router = express.Router();
const PublicBookingController = require('../controllers/PublicBookingController');
const CupomController = require('../controllers/CupomController');

// Inicializar controllers
const publicBookingController = new PublicBookingController();
const cupomController = new CupomController();

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
 * POST /api/public/agendamento
 * Criar novo agendamento público
 */
router.post('/agendamento', async (req, res) => {
  await publicBookingController.createAgendamento(req, res);
});

/**
 * POST /api/public/cupons/validar
 * Validar cupom de desconto para uso na página de booking
 * Sem autenticação - público
 */
router.post('/cupons/validar', async (req, res) => {
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

    console.log(`[Public] Buscando unidades para usuario_id ${usuarioId}`);

    // Buscar todas as unidades ativas do usuário
    const unidades = await unidadeModel.db('unidades')
      .where('usuario_id', parseInt(usuarioId))
      .where('status', 'Ativo')
      .select('id', 'nome', 'endereco', 'telefone', 'slug_url')
      .orderBy('nome', 'asc');

    console.log(`[Public] Encontradas ${unidades.length} unidades ativas`);

    res.json({
      success: true,
      data: unidades
    });

  } catch (error) {
    console.error('[Public] Erro ao buscar unidades do usuário:', error);
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
    console.error('[Public] Erro ao buscar por slug:', error);
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
    console.error('[Public] Erro ao testar WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: 'Erro ao testar conexão WhatsApp'
    });
  }
});

module.exports = router;
