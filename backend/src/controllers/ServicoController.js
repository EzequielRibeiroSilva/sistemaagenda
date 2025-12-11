const BaseController = require('./BaseController');
const Servico = require('../models/Servico');
const logger = require('../utils/logger');

class ServicoController extends BaseController {
  constructor() {
    super(new Servico());
  }

  // GET /api/servicos/list - Listagem leve de serviços para formulários
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



      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, buscar serviços da unidade onde ele trabalha
      if (userRole === 'AGENTE' && userAgenteId) {
        const agente = await this.model.db('agentes')
          .where('id', userAgenteId)
          .select('unidade_id')
          .first();

        if (agente && agente.unidade_id) {
          logger.log(`✅ [ServicoController.list] AGENTE detectado. Buscando serviços da unidade_id=${agente.unidade_id}`);

          // Buscar o usuario_id da unidade para filtrar os serviços
          const unidade = await this.model.db('unidades')
            .where('id', agente.unidade_id)
            .select('usuario_id')
            .first();

          if (unidade && unidade.usuario_id) {
            usuarioId = unidade.usuario_id;
            logger.log(`✅ [ServicoController.list] Usando usuario_id=${usuarioId} da unidade para buscar serviços`);
          } else {
            logger.log(`❌ [ServicoController.list] ERRO: Unidade não encontrada ou sem usuario_id!`);
            return res.status(200).json({
              success: true,
              data: [],
              message: 'Nenhum serviço encontrado'
            });
          }
        } else {
          return res.status(200).json({
            success: true,
            data: [],
            message: 'Nenhum serviço encontrado'
          });
        }
      }

      // Busca otimizada apenas com id e nome
      const servicos = await this.model.findActiveByUsuario(usuarioId);

      // Formatar dados mínimos para formulários
      const servicosLeves = servicos.map(servico => ({
        id: servico.id,
        nome: servico.nome,
        preco: servico.preco,
        duracao_minutos: servico.duracao_minutos || 0
      }));

      return res.status(200).json({
        success: true,
        data: servicosLeves,
        message: 'Lista de serviços carregada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [ServicoController.list] Erro ao carregar lista de serviços:', error);

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao carregar lista de serviços',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET /api/servicos - Buscar serviços do usuário logado
  // ✅ CORREÇÃO: ADMIN e AGENTE podem ver todos os serviços da empresa
  async index(req, res) {
    try {
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      logger.log(`🔍 [ServicoController] index - INÍCIO`);
      logger.log(`   Role: ${userRole}`);
      logger.log(`   UsuarioId (req.user.id): ${usuarioId}`);
      logger.log(`   AgenteId (req.user.agente_id): ${userAgenteId}`);

      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, retornar serviços da unidade onde ele trabalha
      if (userRole === 'AGENTE' && userAgenteId) {
        logger.log(`🔍 [ServicoController] Condição AGENTE detectada. Buscando agente_id=${userAgenteId}...`);
        const Agente = require('../models/Agente');
        const agenteModel = new Agente();
        const agente = await agenteModel.findById(userAgenteId);
        logger.log(`🔍 [ServicoController] Agente encontrado:`, agente ? { id: agente.id, usuario_id: agente.usuario_id, nome: agente.nome, unidade_id: agente.unidade_id } : null);

        if (agente && agente.unidade_id) {
          // ✅ NOVA LÓGICA: Para AGENTE, buscar serviços da unidade onde ele trabalha
          logger.log(`✅ [ServicoController] AGENTE detectado. Buscando serviços da unidade_id=${agente.unidade_id}`);

          // Buscar o usuario_id da unidade para filtrar os serviços
          const unidade = await this.model.db('unidades')
            .where('id', agente.unidade_id)
            .select('usuario_id')
            .first();

          if (unidade && unidade.usuario_id) {
            usuarioId = unidade.usuario_id;
            logger.log(`✅ [ServicoController] Usando usuario_id=${usuarioId} da unidade para buscar serviços`);
          } else {
            logger.log(`❌ [ServicoController] ERRO: Unidade não encontrada ou sem usuario_id!`);
            return res.json([]);
          }
        } else {
          logger.log(`❌ [ServicoController] ERRO: Agente não encontrado ou sem unidade_id!`);
          return res.json([]);
        }
      } else {
        logger.log(`🔍 [ServicoController] Não é AGENTE ou agente_id ausente. Usando usuario_id=${usuarioId} diretamente.`);
      }

      const { page, limit, status, categoria_id, agente_id, stats } = req.query;

      let data;

      if (stats === 'true') {
        data = await this.model.findWithStats(usuarioId);
      } else if (agente_id) {
        data = await this.model.findByAgente(parseInt(agente_id));
      } else if (categoria_id) {
        data = await this.model.findByCategoria(parseInt(categoria_id), usuarioId);
      } else if (status === 'Ativo') {
        data = await this.model.findActiveByUsuario(usuarioId);
      } else if (page && limit) {
        const filters = { usuario_id: usuarioId };
        if (status) filters.status = status;

        const result = await this.model.findWithPagination(
          parseInt(page),
          parseInt(limit),
          filters
        );
        return res.json(result);
      } else {
        // Buscar serviços com associações completas para listagem
        logger.log(`🔍 [ServicoController] Chamando findByUsuarioWithAssociations(${usuarioId})...`);
        data = await this.model.findByUsuarioWithAssociations(usuarioId);
      }

      logger.log(`✅ [ServicoController] Encontrados ${data.length} serviços para usuario_id ${usuarioId}`);
      if (data.length > 0) {
        logger.log(`   Serviços IDs: ${data.map(s => s.id).join(', ')}`);
      }

      return res.status(200).json({
        success: true,
        data,
        message: `Serviços carregados com sucesso (${data.length} serviços)`
      });
    } catch (error) {
      logger.error('[ServicoController] Erro ao buscar serviços:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/servicos/:id - Buscar serviço específico com associações
  async show(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      logger.log(`[ServicoController] Buscando serviço ${id} para usuário ${usuarioId}`);

      const servico = await this.model.findByIdComplete(id);

      if (!servico) {
        return res.status(404).json({
          success: false,
          message: 'Serviço não encontrado'
        });
      }

      // Verificar se o serviço pertence ao usuário
      if (servico.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }

      logger.log(`[ServicoController] Serviço encontrado: ${servico.nome}`);

      return res.status(200).json({
        success: true,
        data: servico,
        message: 'Serviço carregado com sucesso'
      });
    } catch (error) {
      logger.error('[ServicoController] Erro ao buscar serviço:', error);

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao buscar serviço',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // POST /api/servicos - Criar novo serviço
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const {
        nome,
        descricao,
        duracao_minutos,
        preco,
        comissao_percentual,
        status,
        categoria_id,
        agentes_ids,
        extras_ids
      } = req.body;

      // Validações básicas
      if (!nome || !nome.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Nome é obrigatório'
        });
      }

      if (!preco || preco < 0) {
        return res.status(400).json({
          success: false,
          error: 'Preço deve ser maior ou igual a zero'
        });
      }

      if (!duracao_minutos || duracao_minutos < 1) {
        return res.status(400).json({
          success: false,
          error: 'Duração deve ser maior que zero'
        });
      }

      if (status && !['Ativo', 'Bloqueado'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Status inválido',
          message: 'Status deve ser "Ativo" ou "Bloqueado"'
        });
      }

      const servicoData = {
        nome: nome.trim(),
        descricao: descricao?.trim() || '',
        duracao_minutos: duracao_minutos,
        preco: parseFloat(preco),
        comissao_percentual: comissao_percentual || 70,
        status: status || 'Ativo',
        categoria_id: categoria_id || null,
        usuario_id: usuarioId,
        created_at: new Date(),
        updated_at: new Date()
      };

      const servicoId = await this.model.createWithTransaction(
        servicoData,
        agentes_ids || [],
        extras_ids || []
      );

      // Buscar serviço criado para retorno
      const servicoCriado = await this.model.findById(servicoId);

      return res.status(201).json({
        success: true,
        data: servicoCriado,
        message: 'Serviço criado com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao criar serviço:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // PUT /api/servicos/:id - Atualizar serviço
  async update(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      // Verificar se o serviço pertence ao usuário
      const servico = await this.model.findById(id);
      if (!servico) {
        return res.status(404).json({
          success: false,
          error: 'Serviço não encontrado'
        });
      }

      if (servico.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para editar este serviço'
        });
      }

      const {
        nome,
        descricao,
        duracao_minutos,
        preco,
        comissao_percentual,
        status,
        categoria_id,
        agentes_ids,
        extras_ids
      } = req.body;

      // Validações básicas
      if (nome !== undefined && (!nome || !nome.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Nome é obrigatório'
        });
      }

      if (preco !== undefined && preco < 0) {
        return res.status(400).json({
          success: false,
          error: 'Preço deve ser maior ou igual a zero'
        });
      }

      if (duracao_minutos !== undefined && duracao_minutos < 1) {
        return res.status(400).json({
          success: false,
          error: 'Duração deve ser maior que zero'
        });
      }

      if (status !== undefined && !['Ativo', 'Bloqueado'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Status inválido',
          message: 'Status deve ser "Ativo" ou "Bloqueado"'
        });
      }

      const servicoData = {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(descricao !== undefined && { descricao: descricao?.trim() || '' }),
        ...(duracao_minutos !== undefined && { duracao_minutos }),
        ...(preco !== undefined && { preco: parseFloat(preco) }),
        ...(comissao_percentual !== undefined && { comissao_percentual }),
        ...(status !== undefined && { status }),
        ...(categoria_id !== undefined && { categoria_id }),
        updated_at: new Date()
      };

      logger.log(`🔄 [ServicoController] Atualizando serviço ${id} com ${agentes_ids?.length || 0} agentes e ${extras_ids?.length || 0} extras`);

      await this.model.updateWithTransaction(
        id,
        servicoData,
        agentes_ids || [],
        extras_ids || []
      );

      // Buscar serviço atualizado para retorno
      const servicoAtualizado = await this.model.findByIdComplete(id);

      return res.status(200).json({
        success: true,
        data: servicoAtualizado,
        message: 'Serviço atualizado com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao atualizar serviço:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // DELETE /api/servicos/:id - Deletar serviço
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o serviço pertence ao usuário
      const servico = await this.model.findById(id);
      if (!servico) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }

      if (servico.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para deletar este serviço' 
        });
      }

      const deleted = await this.model.delete(id);
      
      if (deleted) {
        return res.json({ 
          message: 'Serviço deletado com sucesso' 
        });
      } else {
        return res.status(500).json({ 
          error: 'Erro ao deletar serviço' 
        });
      }
    } catch (error) {
      logger.error('Erro ao deletar serviço:', error);
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Não é possível deletar',
          message: 'Este serviço possui agendamentos ou está vinculado a agentes' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/servicos/categoria/:categoriaId - Buscar serviços por categoria
  async byCategoria(req, res) {
    try {
      const { categoriaId } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const data = await this.model.findByCategoria(parseInt(categoriaId), usuarioId);
      return res.json({ data });
    } catch (error) {
      logger.error('Erro ao buscar serviços por categoria:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/servicos/agente/:agenteId - Buscar serviços por agente
  async byAgente(req, res) {
    try {
      const { agenteId } = req.params;
      
      const data = await this.model.findByAgente(parseInt(agenteId));
      return res.json({ data });
    } catch (error) {
      logger.error('Erro ao buscar serviços por agente:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }
}

module.exports = ServicoController;
