const BaseController = require('./BaseController');
const ServicoExtra = require('../models/ServicoExtra');
const logger = require('./../utils/logger');

class ServicoExtraController extends BaseController {
  constructor() {
    super(new ServicoExtra());
  }

  // GET /api/servicos/extras/list - Listagem leve de serviços extras para formulários
  async list(req, res) {
    try {
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      logger.log('🔍 [ServicoExtraController.list] Iniciando busca de serviços extras');
      logger.log('   Role:', userRole);
      logger.log('   UsuarioId (req.user.id):', usuarioId);
      logger.log('   AgenteId (req.user.agente_id):', userAgenteId);

      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, buscar serviços extras da unidade onde ele trabalha
      if (userRole === 'AGENTE' && userAgenteId) {
        const agente = await this.model.db('agentes')
          .where('id', userAgenteId)
          .select('unidade_id')
          .first();

        if (agente && agente.unidade_id) {
          logger.log(`✅ [ServicoExtraController.list] AGENTE detectado. Buscando serviços extras da unidade_id=${agente.unidade_id}`);

          // Buscar o usuario_id da unidade para filtrar os serviços extras
          const unidade = await this.model.db('unidades')
            .where('id', agente.unidade_id)
            .select('usuario_id')
            .first();

          if (unidade && unidade.usuario_id) {
            usuarioId = unidade.usuario_id;
            logger.log(`✅ [ServicoExtraController.list] Usando usuario_id=${usuarioId} da unidade para buscar serviços extras`);
          } else {
            logger.log(`❌ [ServicoExtraController.list] ERRO: Unidade não encontrada ou sem usuario_id!`);
            return res.status(200).json({
              success: true,
              data: [],
              message: 'Nenhum serviço extra encontrado'
            });
          }
        } else {
          return res.status(200).json({
            success: true,
            data: [],
            message: 'Nenhum serviço extra encontrado'
          });
        }
      }

      // Busca otimizada apenas com id e nome
      const servicosExtras = await this.model.findActiveByUsuario(usuarioId);

      // Formatar dados mínimos para formulários
      const servicosExtrasLeves = servicosExtras.map(servicoExtra => ({
        id: servicoExtra.id,
        nome: servicoExtra.nome,
        preco: servicoExtra.preco,
        duracao_minutos: servicoExtra.duracao_minutos || 0
      }));

      logger.log(`✅ [ServicoExtraController.list] ${servicosExtrasLeves.length} serviços extras encontrados para usuario_id ${usuarioId}`);

      return res.status(200).json({
        success: true,
        data: servicosExtrasLeves,
        message: 'Lista de serviços extras carregada com sucesso'
      });
    } catch (error) {
      logger.error('[ServicoExtraController.list] Erro ao carregar lista de serviços extras:', error);

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao carregar lista de serviços extras',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET /api/servicos/extras - Buscar serviços extras do usuário logado
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const { stats } = req.query;

      let data;

      if (stats === 'true') {
        data = await this.model.findWithStats(usuarioId);
      } else {
        data = await this.model.findByUsuario(usuarioId);
      }

      return res.json({ 
        success: true,
        data 
      });
    } catch (error) {
      logger.error('❌ [ServicoExtraController.index] Erro ao buscar serviços extras:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/servicos/extras/:id - Buscar serviço extra específico (para edição)
  async show(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      const servicoExtra = await this.model.findByIdComplete(id);

      if (!servicoExtra) {
        return res.status(404).json({
          success: false,
          error: 'Serviço extra não encontrado',
          message: 'O serviço extra solicitado não foi encontrado'
        });
      }

      // Verificar se o serviço extra pertence ao usuário logado
      if (servicoExtra.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para acessar este serviço extra'
        });
      }

      return res.status(200).json({
        success: true,
        data: servicoExtra,
        message: 'Serviço extra encontrado com sucesso'
      });
    } catch (error) {
      logger.error('[ServicoExtraController] Erro ao buscar serviço extra:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar serviço extra'
      });
    }
  }

  // POST /api/servicos/extras - Criar novo serviço extra
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const {
        nome,
        descricao,
        duracao_minutos,
        preco,
        quantidade_maxima,
        status,
        servicos_conectados
      } = req.body;

      // Validações básicas
      if (!nome || !nome.trim()) {
        return res.status(400).json({ 
          error: 'Nome é obrigatório' 
        });
      }

      if (!preco || preco < 0) {
        return res.status(400).json({ 
          error: 'Preço deve ser maior ou igual a zero' 
        });
      }

      const servicoExtraData = {
        nome: nome.trim(),
        descricao: descricao?.trim() || '',
        duracao_minutos: duracao_minutos || 0,
        preco: parseFloat(preco),
        quantidade_maxima: quantidade_maxima || 1,
        status: status || 'Ativo',
        usuario_id: usuarioId,
        created_at: new Date(),
        updated_at: new Date()
      };

      const servicoExtraId = await this.model.createWithTransaction(
        servicoExtraData,
        servicos_conectados || []
      );

      // Buscar serviço extra criado para retorno
      const servicoExtraCriado = await this.model.findById(servicoExtraId);

      // 🗑️ INVALIDAÇÃO DE CACHE FAQ (TASK 3.2)
      // Serviços extras são globais por usuário: invalidar todas as unidades ativas
      setImmediate(async () => {
        try {
          const { invalidateKnowledgeCache } = require('../middleware/cacheInvalidation');
          const unidades = await this.model.db('unidades')
            .where('usuario_id', usuarioId)
            .where('status', 'Ativo')
            .select('id');
          const unidadeIds = (unidades || []).map(u => u.id);
          await invalidateKnowledgeCache(usuarioId, unidadeIds);
        } catch (err) {
          logger.warn('[Cache] Erro ao invalidar (não-crítico):', err?.message);
        }
      });

      return res.status(201).json({ 
        success: true,
        data: servicoExtraCriado,
        message: 'Serviço extra criado com sucesso' 
      });
    } catch (error) {
      logger.error('Erro ao criar serviço extra:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // PUT /api/servicos/extras/:id - Atualizar serviço extra
  async update(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o serviço extra pertence ao usuário
      const servicoExtra = await this.model.findById(id);
      if (!servicoExtra) {
        return res.status(404).json({ 
          error: 'Serviço extra não encontrado' 
        });
      }

      if (servicoExtra.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para editar este serviço extra' 
        });
      }

      const {
        nome,
        descricao,
        duracao_minutos,
        preco,
        quantidade_maxima,
        status,
        servicos_conectados
      } = req.body;

      // Validações básicas
      if (preco !== undefined && preco < 0) {
        return res.status(400).json({ 
          error: 'Preço deve ser maior ou igual a zero' 
        });
      }

      const servicoExtraData = {};
      if (nome !== undefined) servicoExtraData.nome = nome.trim();
      if (descricao !== undefined) servicoExtraData.descricao = descricao.trim();
      if (duracao_minutos !== undefined) servicoExtraData.duracao_minutos = duracao_minutos;
      if (preco !== undefined) servicoExtraData.preco = parseFloat(preco);
      if (quantidade_maxima !== undefined) servicoExtraData.quantidade_maxima = quantidade_maxima;
      if (status !== undefined) servicoExtraData.status = status;

      logger.log(`🔗 [ServicoExtraController] Atualizando serviço extra ${id} com ${servicos_conectados?.length || 0} serviços conectados`);

      await this.model.updateWithTransaction(
        id,
        servicoExtraData,
        servicos_conectados || []
      );

      // Buscar serviço extra atualizado para retorno
      const servicoExtraAtualizado = await this.model.findById(id);

      // 🗑️ INVALIDAÇÃO DE CACHE FAQ (TASK 3.2)
      // Serviços extras são globais por usuário: invalidar todas as unidades ativas
      setImmediate(async () => {
        try {
          const { invalidateKnowledgeCache } = require('../middleware/cacheInvalidation');
          const unidades = await this.model.db('unidades')
            .where('usuario_id', usuarioId)
            .where('status', 'Ativo')
            .select('id');
          const unidadeIds = (unidades || []).map(u => u.id);
          await invalidateKnowledgeCache(usuarioId, unidadeIds);
        } catch (err) {
          logger.warn('[Cache] Erro ao invalidar (não-crítico):', err?.message);
        }
      });

      return res.json({ 
        success: true,
        data: servicoExtraAtualizado,
        message: 'Serviço extra atualizado com sucesso' 
      });
    } catch (error) {
      logger.error('Erro ao atualizar serviço extra:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // DELETE /api/servicos/extras/:id - Deletar serviço extra
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o serviço extra pertence ao usuário
      const servicoExtra = await this.model.findById(id);
      if (!servicoExtra) {
        return res.status(404).json({ 
          error: 'Serviço extra não encontrado' 
        });
      }

      if (servicoExtra.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para deletar este serviço extra' 
        });
      }

      const deleted = await this.model.delete(id);
      
      if (deleted) {
        // 🗑️ INVALIDAÇÃO DE CACHE FAQ (TASK 3.2)
        // Serviços extras são globais por usuário: invalidar todas as unidades ativas
        setImmediate(async () => {
          try {
            const { invalidateKnowledgeCache } = require('../middleware/cacheInvalidation');
            const unidades = await this.model.db('unidades')
              .where('usuario_id', usuarioId)
              .where('status', 'Ativo')
              .select('id');
            const unidadeIds = (unidades || []).map(u => u.id);
            await invalidateKnowledgeCache(usuarioId, unidadeIds);
          } catch (err) {
            logger.warn('[Cache] Erro ao invalidar (não-crítico):', err?.message);
          }
        });

        return res.json({ 
          success: true,
          message: 'Serviço extra deletado com sucesso' 
        });
      } else {
        return res.status(500).json({ 
          error: 'Erro ao deletar serviço extra' 
        });
      }
    } catch (error) {
      logger.error('❌ [ServicoExtraController.destroy] Erro ao deletar serviço extra:', error);

      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Não é possível deletar',
          message: 'Este serviço extra possui agendamentos ou está vinculado a serviços' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }
}

module.exports = ServicoExtraController;
