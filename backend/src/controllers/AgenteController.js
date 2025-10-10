const Agente = require('../models/Agente');
const bcrypt = require('bcryptjs');
const { deleteOldAvatar } = require('../middleware/uploadMiddleware');

class AgenteController {
  constructor() {
    this.agenteModel = new Agente();
  }

  /**
   * GET /api/agentes - Listagem de agentes (Grid)
   * Retorna todos os agentes da unidade do ADMIN logado
   */
  async index(req, res) {
    try {
      const usuarioId = req.user.id;
      
      console.log('[AgenteController] Buscando agentes para usuário:', usuarioId);
      
      const agentes = await this.agenteModel.findWithCalculatedData(usuarioId);
      
      // Formatar dados para o frontend
      const agentesFormatados = agentes.map(agente => ({
        id: agente.id,
        name: `${agente.nome} ${agente.sobrenome || ''}`.trim(),
        email: agente.email,
        phone: agente.telefone,
        avatar: agente.avatar_url || `https://i.pravatar.cc/150?img=${agente.id}`,
        status: agente.status,
        reservations: agente.reservations,
        todayHours: agente.todayHours,
        availability: agente.availability,
        unidade_nome: agente.unidade_nome,
        biografia: agente.biografia,
        nome_exibicao: agente.nome_exibicao,
        data_admissao: agente.data_admissao,
        comissao_percentual: agente.comissao_percentual
      }));
      
      console.log(`[AgenteController] Encontrados ${agentesFormatados.length} agentes`);
      
      res.status(200).json({
        success: true,
        data: agentesFormatados,
        message: 'Agentes listados com sucesso'
      });
    } catch (error) {
      console.error('[AgenteController] Erro ao listar agentes:', error);
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao listar agentes'
      });
    }
  }

  /**
   * GET /api/agentes/:id - Visualização de agente específico (para edição)
   */
  async show(req, res) {
    try {
      const agenteId = req.params.id;
      const usuarioId = req.user.id;
      
      console.log('[AgenteController] Buscando agente:', agenteId);
      
      const agente = await this.agenteModel.findByIdComplete(agenteId);
      
      if (!agente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      // Verificar se o agente pertence ao usuário logado
      if (agente.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para acessar este agente'
        });
      }

      // Formatar dados para o frontend
      const agenteFormatado = {
        id: agente.id,
        nome: agente.nome,
        sobrenome: agente.sobrenome,
        email: agente.email,
        telefone: agente.telefone,
        avatar_url: agente.avatar_url,
        biografia: agente.biografia,
        nome_exibicao: agente.nome_exibicao,
        status: agente.status,
        unidade_id: agente.unidade_id,
        unidade_nome: agente.unidade_nome,
        agenda_personalizada: agente.agenda_personalizada,
        observacoes: agente.observacoes,
        data_admissao: agente.data_admissao,
        comissao_percentual: agente.comissao_percentual,
        servicos_oferecidos: agente.servicos_oferecidos.map(s => s.id),
        horarios_funcionamento: agente.horarios_funcionamento.map(h => ({
          dia_semana: h.dia_semana,
          periodos: typeof h.periodos === 'string' ? JSON.parse(h.periodos) : h.periodos
        }))
      };
      
      console.log('[AgenteController] Agente encontrado:', agenteFormatado.nome);
      
      res.status(200).json({
        success: true,
        data: agenteFormatado,
        message: 'Agente encontrado com sucesso'
      });
    } catch (error) {
      console.error('[AgenteController] Erro ao buscar agente:', error);
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar agente'
      });
    }
  }

  /**
   * POST /api/agentes - Criação de agente
   */
  async store(req, res) {
    try {
      const usuarioId = req.user.id;
      // Extrair dados do body (pode ser JSON ou FormData)
      const {
        nome,
        sobrenome,
        email,
        telefone,
        senha,
        avatar_url,
        biografia,
        nome_exibicao,
        unidade_id,
        agenda_personalizada,
        observacoes,
        data_admissao,
        comissao_percentual,
        servicos_oferecidos,
        horarios_funcionamento
      } = req.body;

      // Parse de dados JSON se vieram como string (FormData)
      let servicosIds = [];
      let horariosData = [];

      try {
        servicosIds = typeof servicos_oferecidos === 'string'
          ? JSON.parse(servicos_oferecidos)
          : (servicos_oferecidos || []);
      } catch (e) {
        console.error('Erro ao parsear servicos_oferecidos:', e);
      }

      try {
        horariosData = typeof horarios_funcionamento === 'string'
          ? JSON.parse(horarios_funcionamento)
          : (horarios_funcionamento || []);
      } catch (e) {
        console.error('Erro ao parsear horarios_funcionamento:', e);
      }

      console.log('[AgenteController] Criando novo agente:', {
        nome,
        email,
        unidade_id: unidade_id,
        tipo_unidade_id: typeof unidade_id,
        body_keys: Object.keys(req.body)
      });

      // Converter unidade_id para número
      const unidadeIdNum = parseInt(unidade_id);

      // Validações básicas
      if (!nome || !email || !unidadeIdNum || isNaN(unidadeIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios',
          message: 'Nome, email e unidade são obrigatórios'
        });
      }

      // Verificar se a unidade pertence ao usuário logado
      const unidade = await this.agenteModel.db('unidades')
        .where('id', unidadeIdNum)
        .where('usuario_id', usuarioId)
        .first();

      if (!unidade) {
        return res.status(403).json({
          success: false,
          error: 'Unidade inválida',
          message: 'A unidade selecionada não pertence ao seu usuário'
        });
      }

      // Hash da senha se fornecida
      let senhaHash = null;
      if (senha) {
        senhaHash = await bcrypt.hash(senha, 12);
      }

      // URL do avatar (do upload ou padrão)
      const finalAvatarUrl = req.avatarUrl || avatar_url || `https://i.pravatar.cc/150?img=${Date.now()}`;

      // Dados do agente
      const agenteData = {
        nome,
        sobrenome,
        email,
        telefone,
        senha_hash: senhaHash,
        avatar_url: finalAvatarUrl,
        biografia,
        nome_exibicao,
        unidade_id: unidadeIdNum,
        agenda_personalizada: agenda_personalizada === 'true' || agenda_personalizada === true,
        observacoes,
        data_admissao,
        comissao_percentual: comissao_percentual || 0,
        status: 'Ativo'
      };

      // Criar agente com transação
      const agenteId = await this.agenteModel.createWithTransaction(
        agenteData,
        servicosIds,
        horariosData
      );

      console.log(`[AgenteController] Agente criado com sucesso - ID: ${agenteId}`);

      res.status(201).json({
        success: true,
        data: { id: agenteId, ...agenteData },
        message: 'Agente criado com sucesso'
      });
    } catch (error) {
      console.error('[AgenteController] Erro ao criar agente:', error);

      // Tratar erros específicos
      if (error.message.includes('duplicate key') && error.message.includes('email')) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao criar agente'
      });
    }
  }

  /**
   * PUT /api/agentes/:id - Edição de agente
   */
  async update(req, res) {
    try {
      const agenteId = req.params.id;
      const usuarioId = req.user.id;
      const {
        nome,
        sobrenome,
        email,
        telefone,
        senha,
        avatar_url,
        biografia,
        nome_exibicao,
        unidade_id,
        agenda_personalizada,
        observacoes,
        data_admissao,
        comissao_percentual,
        servicos_oferecidos,
        horarios_funcionamento
      } = req.body;

      console.log('[AgenteController] Atualizando agente:', agenteId);

      // Verificar se o agente existe e pertence ao usuário
      const agenteExistente = await this.agenteModel.findByIdComplete(agenteId);

      if (!agenteExistente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      if (agenteExistente.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para editar este agente'
        });
      }

      // Validações básicas
      if (!nome || !email || !unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios',
          message: 'Nome, email e unidade são obrigatórios'
        });
      }

      // Verificar se a unidade pertence ao usuário logado
      const unidade = await this.agenteModel.db('unidades')
        .where('id', unidade_id)
        .where('usuario_id', usuarioId)
        .first();

      if (!unidade) {
        return res.status(403).json({
          success: false,
          error: 'Unidade inválida',
          message: 'A unidade selecionada não pertence ao seu usuário'
        });
      }

      // Gerenciar avatar (upload ou manter existente)
      let finalAvatarUrl = agenteExistente.avatar_url; // Manter existente por padrão

      if (req.avatarUrl) {
        // Novo upload - deletar avatar antigo se não for padrão
        if (agenteExistente.avatar_url && !agenteExistente.avatar_url.includes('pravatar.cc')) {
          deleteOldAvatar(agenteExistente.avatar_url);
        }
        finalAvatarUrl = req.avatarUrl;
      } else if (avatar_url && avatar_url !== agenteExistente.avatar_url) {
        // URL fornecida via body (diferente da atual)
        finalAvatarUrl = avatar_url;
      }

      // Hash da senha apenas se fornecida
      let senhaHash = agenteExistente.senha_hash; // Manter existente por padrão
      if (senha && senha.trim() !== '') {
        senhaHash = await bcrypt.hash(senha, 12);
      }

      // Preparar dados para atualização
      const agenteData = {
        nome,
        sobrenome,
        email,
        telefone,
        senha_hash: senhaHash,
        avatar_url: finalAvatarUrl,
        biografia,
        nome_exibicao,
        unidade_id,
        agenda_personalizada: !!agenda_personalizada,
        observacoes,
        data_admissao,
        comissao_percentual: comissao_percentual || 0,
        updated_at: new Date()
      };

      // Atualizar senha apenas se fornecida
      if (senha && senha.trim() !== '') {
        agenteData.senha_hash = await bcrypt.hash(senha, 12);
      }

      // Atualizar agente com transação
      await this.agenteModel.updateWithTransaction(
        agenteId,
        agenteData,
        servicos_oferecidos,
        horarios_funcionamento
      );

      console.log(`[AgenteController] Agente atualizado com sucesso - ID: ${agenteId}`);

      res.status(200).json({
        success: true,
        data: { id: agenteId, ...agenteData },
        message: 'Agente atualizado com sucesso'
      });
    } catch (error) {
      console.error('[AgenteController] Erro ao atualizar agente:', error);

      // Tratar erros específicos
      if (error.message.includes('duplicate key') && error.message.includes('email')) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao atualizar agente'
      });
    }
  }

  /**
   * DELETE /api/agentes/:id - Exclusão de agente (soft delete)
   */
  async destroy(req, res) {
    try {
      const agenteId = req.params.id;
      const usuarioId = req.user.id;

      console.log('[AgenteController] Excluindo agente:', agenteId);

      // Verificar se o agente existe e pertence ao usuário
      const agente = await this.agenteModel.findByIdComplete(agenteId);

      if (!agente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      if (agente.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para excluir este agente'
        });
      }

      // Soft delete - apenas alterar status
      await this.agenteModel.update(agenteId, {
        status: 'Bloqueado',
        updated_at: new Date()
      });

      console.log(`[AgenteController] Agente bloqueado com sucesso - ID: ${agenteId}`);

      res.status(200).json({
        success: true,
        message: 'Agente bloqueado com sucesso'
      });
    } catch (error) {
      console.error('[AgenteController] Erro ao excluir agente:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao excluir agente'
      });
    }
  }
}

module.exports = AgenteController;
