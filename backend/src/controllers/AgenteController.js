const Agente = require('../models/Agente');
const bcrypt = require('bcryptjs');
const { deleteOldAvatar } = require('../middleware/formDataMiddleware');

class AgenteController {
  constructor() {
    this.agenteModel = new Agente();
  }

  /**
   * GET /api/agentes/list - Listagem leve de agentes para formulários (com RBAC)
   * ADMIN: Retorna todos os agentes da unidade
   * AGENTE: Retorna apenas o próprio agente
   */
  async list(req, res) {
    try {
      const usuarioId = req.user.id;
      const userRole = req.user.role;
      const userAgenteId = req.user.agente_id;

      let agentes;

      if (userRole === 'AGENTE' && userAgenteId) {
        // AGENTE: Buscar apenas o próprio agente
        const agenteData = await this.agenteModel.findById(userAgenteId);
        agentes = agenteData ? [agenteData] : [];
      } else {
        // ADMIN: Buscar todos os agentes da unidade
        agentes = await this.agenteModel.findActiveByUsuario(usuarioId);
      }

      // Formatar dados mínimos para formulários
      const agentesLeves = agentes.map(agente => ({
        id: agente.id,
        nome: `${agente.nome} ${agente.sobrenome || ''}`.trim(),
        avatar_url: agente.avatar_url || null
      }));

      res.status(200).json({
        success: true,
        data: agentesLeves,
        message: `Lista de agentes carregada com sucesso (${agentesLeves.length} agentes)`
      });
    } catch (error) {
      console.error('[AgenteController] Erro ao carregar lista de agentes:', error);

      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao carregar lista de agentes',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /api/agentes - Listagem de agentes (Grid)
   * Retorna todos os agentes da unidade do ADMIN logado
   */
  async index(req, res) {
    try {
      const usuarioId = req.user.id;
      
      const agentes = await this.agenteModel.findWithCalculatedData(usuarioId);
      
      // Formatar dados para o frontend
      const agentesFormatados = agentes.map(agente => ({
        id: agente.id,
        name: `${agente.nome} ${agente.sobrenome || ''}`.trim(),
        email: agente.email,
        phone: agente.telefone,
        avatar: agente.avatar_url || null,
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
      
      res.status(200).json({
        success: true,
        data: agentesFormatados,
        message: 'Agentes listados com sucesso'
      });
    } catch (error) {
      console.error('❌ [AgenteController] Erro ao listar agentes:', error);
      console.error('Stack trace:', error.stack);
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao listar agentes',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

      const agente = await this.agenteModel.findByIdComplete(agenteId);

      if (!agente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      // Verificar se o agente pertence a uma unidade do usuário ADMIN logado
      if (agente.unidade_usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para acessar este agente'
        });
      }

      // Buscar todos os serviços disponíveis do usuário
      const Servico = require('../models/Servico');
      const servicoModel = new Servico();
      const servicosDisponiveis = await servicoModel.findActiveByUsuario(usuarioId);

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
        // Serviços para pré-seleção
        servicos_disponiveis: servicosDisponiveis.map(s => ({
          id: s.id,
          nome: s.nome,
          preco: s.preco,
          duracao_minutos: s.duracao_minutos
        })),
        servicos_atuais_ids: agente.servicos_oferecidos.map(s => s.id),
        // Horários formatados - ✅ CORREÇÃO: Normalizar para formato "start/end"
        horarios_funcionamento: agente.horarios_funcionamento.map(h => {
          const periodos = typeof h.periodos === 'string' ? JSON.parse(h.periodos) : h.periodos;
          // Normalizar períodos para usar "start" e "end" (não "inicio" e "fim")
          const periodosNormalizados = Array.isArray(periodos) ? periodos.map(p => ({
            start: p.start || p.inicio || '09:00',
            end: p.end || p.fim || '17:00'
          })) : [];
          
          return {
            dia_semana: h.dia_semana,
            periodos: periodosNormalizados
          };
        })
      };
      

      
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

      // ✅ CORREÇÃO DE SEGURANÇA: Usar unidade_id do token JWT
      const unidadeIdDoToken = req.user.unidade_id;

      if (!unidadeIdDoToken) {
        return res.status(403).json({
          success: false,
          error: 'Usuário sem unidade',
          message: 'Usuário não possui unidade associada'
        });
      }

      // Extrair dados do body (pode ser JSON ou FormData)
      // ✅ SEGURANÇA: unidade_id removido do req.body - será forçado do token
      const {
        nome,
        sobrenome,
        email,
        telefone,
        senha,
        avatar_url,
        biografia,
        nome_exibicao,
        // unidade_id, // ❌ REMOVIDO: Não confiar no frontend
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



      // ✅ CORREÇÃO DE SEGURANÇA: Usar unidade_id do token (já validado)
      const unidadeIdNum = parseInt(unidadeIdDoToken);

      // Validações básicas
      if (!nome || !email || isNaN(unidadeIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios',
          message: 'Nome e email são obrigatórios'
        });
      }

      // ✅ SEGURANÇA: Não precisa verificar se unidade pertence ao usuário
      // porque unidadeIdDoToken já vem do JWT validado
      console.log(`🔒 [SEGURANÇA] Criando agente na unidade ${unidadeIdNum} do usuário ${usuarioId}`);

      // ✅ VERIFICAÇÃO: Checar se email já existe
      const emailExistente = await this.agenteModel.db('agentes')
        .where('email', email)
        .first();

      if (emailExistente) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }

      // Verificar também na tabela de usuários
      const emailUsuarioExistente = await this.agenteModel.db('usuarios')
        .where('email', email)
        .first();

      if (emailUsuarioExistente) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }

      // Hash da senha se fornecida
      let senhaHash = null;
      if (senha) {
        senhaHash = await bcrypt.hash(senha, 12);
      }

      // URL do avatar (do upload ou padrão)
      const finalAvatarUrl = req.avatarUrl || avatar_url || null;

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

      // Criar agente com transação (incluindo usuário para login)
      const agenteId = await this.agenteModel.createWithTransaction(
        agenteData,
        servicosIds,
        horariosData
      );



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
        status,
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
        servicosIds = [];
      }

      try {
        horariosData = typeof horarios_funcionamento === 'string'
          ? JSON.parse(horarios_funcionamento)
          : (horarios_funcionamento || []);

        // ✅ DEBUG: Log detalhado dos dados recebidos
        console.log('🔍 DEBUG BACKEND - Dados de atualização recebidos:');
        console.log('  📋 horarios_funcionamento (raw):', horarios_funcionamento);
        console.log('  📋 horariosData (parsed):', JSON.stringify(horariosData, null, 2));
        console.log('  📋 agenda_personalizada:', agenda_personalizada, '(tipo:', typeof agenda_personalizada, ')');
        console.log('  📋 Quantidade de dias com horários:', horariosData.length);
        
        // Validar estrutura dos períodos
        if (horariosData.length > 0) {
          const primeiroDia = horariosData[0];
          console.log('  📋 Estrutura do primeiro dia:', JSON.stringify(primeiroDia, null, 2));
          if (primeiroDia.periodos && primeiroDia.periodos.length > 0) {
            console.log('  📋 Estrutura do primeiro período:', JSON.stringify(primeiroDia.periodos[0], null, 2));
          }
        }
      } catch (e) {
        console.error('❌ Erro ao parsear horarios_funcionamento:', e);
        horariosData = [];
      }

      // Verificar se o agente existe e pertence ao usuário
      const agenteExistente = await this.agenteModel.findByIdComplete(agenteId);

      if (!agenteExistente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      // Verificar se o agente pertence a uma unidade do usuário ADMIN logado
      if (agenteExistente.unidade_usuario_id !== usuarioId) {
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
        // Novo upload - deletar avatar antigo se existir
        if (agenteExistente.avatar_url) {
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
        status: status || 'Ativo', // Incluir status
        senha_hash: senhaHash, // Já processado acima
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

      // Atualizar agente com transação
      await this.agenteModel.updateWithTransaction(
        agenteId,
        agenteData,
        servicosIds,
        horariosData
      );



      res.status(200).json({
        success: true,
        data: { id: agenteId, ...agenteData },
        message: 'Agente atualizado com sucesso'
      });
    } catch (error) {
      console.error('❌ [AgenteController] Erro ao atualizar agente:', error);
      console.error('❌ Stack trace:', error.stack);
      console.error('❌ Mensagem:', error.message);

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
        message: error.message || 'Erro ao atualizar agente',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * DELETE /api/agentes/:id - Exclusão completa de agente (agente + usuário)
   * Apenas usuários ADMIN podem excluir agentes (usuários do tipo AGENTE)
   */
  async destroy(req, res) {
    try {
      const agenteId = req.params.id;
      const usuarioLogado = req.user;

      // Verificar se o usuário logado é ADMIN
      if (usuarioLogado.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Apenas administradores podem excluir agentes'
        });
      }

      // Verificar se o agente existe
      const agente = await this.agenteModel.findByIdComplete(agenteId);

      if (!agente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      // Verificar se o agente pertence a uma unidade do usuário ADMIN logado
      if (agente.unidade_usuario_id !== usuarioLogado.id) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você só pode excluir agentes da sua unidade'
        });
      }

      // Iniciar transação para exclusão completa
      await this.agenteModel.db.transaction(async (trx) => {
        // 1. Excluir registros relacionados ao agente
        await trx('agendamentos').where('agente_id', agenteId).del();
        await trx('agente_servicos').where('agente_id', agenteId).del();
        await trx('agente_unidades').where('agente_id', agenteId).del();
        await trx('horarios_funcionamento').where('agente_id', agenteId).del();

        // 2. Excluir o agente
        await trx('agentes').where('id', agenteId).del();

        // 3. Excluir o usuário associado ao agente (se existir e for do tipo AGENTE)
        if (agente.usuario_id) {
          const usuarioAgente = await trx('usuarios')
            .where('id', agente.usuario_id)
            .first();

          // Só excluir se for usuário do tipo AGENTE (não ADMIN ou MASTER)
          if (usuarioAgente && usuarioAgente.role === 'AGENTE') {
            await trx('usuarios').where('id', agente.usuario_id).del();
            console.log(`✅ Usuário AGENTE (ID: ${agente.usuario_id}, Email: ${usuarioAgente.email}) excluído com sucesso`);
          } else if (usuarioAgente) {
            console.log(`⚠️ Usuário (ID: ${agente.usuario_id}) não foi excluído - Role: ${usuarioAgente.role}`);
          }
        }
      });

      res.status(200).json({
        success: true,
        message: 'Agente e usuário excluídos com sucesso'
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
