const BaseController = require('./BaseController');
const Unidade = require('../models/Unidade');
const UnidadeService = require('../services/UnidadeService');

class UnidadeController extends BaseController {
  constructor() {
    super(new Unidade());
    this.unidadeService = new UnidadeService();
  }

  // GET /api/unidades - Buscar unidades do usuário logado com informações de limite
  // ✅ CORREÇÃO: ADMIN, MASTER e AGENTE podem ver unidades da empresa
  async index(req, res) {
    try {
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      console.log(`🔍 [UnidadeController] index - INÍCIO`);
      console.log(`   Role: ${userRole}`);
      console.log(`   UsuarioId (req.user.id): ${usuarioId}`);
      console.log(`   AgenteId (req.user.agente_id): ${userAgenteId}`);

      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, retornar apenas a unidade onde ele trabalha
      if (userRole === 'AGENTE' && userAgenteId) {
        console.log(`🔍 [UnidadeController] Condição AGENTE detectada. Buscando agente_id=${userAgenteId}...`);
        const Agente = require('../models/Agente');
        const agenteModel = new Agente();
        const agente = await agenteModel.findById(userAgenteId);
        console.log(`🔍 [UnidadeController] Agente encontrado:`, agente ? { id: agente.id, usuario_id: agente.usuario_id, nome: agente.nome, unidade_id: agente.unidade_id } : null);

        if (agente && agente.unidade_id) {
          // ✅ NOVA LÓGICA: Para AGENTE, retornar apenas a unidade onde ele trabalha
          console.log(`✅ [UnidadeController] AGENTE detectado. Buscando unidade_id=${agente.unidade_id} do agente`);
          const data = await this.model.db('unidades')
            .where('id', agente.unidade_id)
            .select('*');

          console.log(`✅ [UnidadeController] Encontradas ${data.length} unidades para agente_id ${userAgenteId}`);
          return res.json(data);
        } else {
          console.log(`❌ [UnidadeController] ERRO: Agente não encontrado ou sem unidade_id!`);
          return res.json([]);
        }
      } else {
        console.log(`🔍 [UnidadeController] Não é AGENTE ou agente_id ausente. Usando usuario_id=${usuarioId} diretamente.`);
      }

      const { status } = req.query;
      const filters = {};

      if (status) {
        filters.status = status;
      }

      // Para MASTER, listar todas as unidades; para ADMIN/AGENTE, apenas unidades da empresa
      let result;
      if (userRole === 'MASTER') {
        // MASTER vê todas as unidades do sistema
        const unidades = await this.model.findAll(filters);
        result = {
          data: unidades,
          limitInfo: {
            currentCount: unidades.length,
            limit: null, // MASTER não tem limite
            canCreateMore: true,
            plano: 'MASTER'
          }
        };
      } else {
        // ✅ CORREÇÃO: ADMIN e AGENTE veem unidades da empresa (filtradas por usuario_id)
        // Para AGENTE, req.user.id é o ID do usuário ADMIN que criou o agente
        console.log(`🔍 [UnidadeController] Chamando listUnidadesWithLimit(${usuarioId}, ${JSON.stringify(filters)})...`);
        result = await this.unidadeService.listUnidadesWithLimit(usuarioId, filters);
      }

      console.log(`✅ [UnidadeController] Encontradas ${result.data?.length || 0} unidades para usuario_id ${usuarioId}`);
      if (result.data && result.data.length > 0) {
        console.log(`   Unidades IDs: ${result.data.map(u => u.id).join(', ')}`);
      }

      return res.json(result);
    } catch (error) {
      console.error('❌ [UnidadeController] Erro ao buscar unidades:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/unidades - Criar nova unidade com validação de limite
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Validar dados obrigatórios
      const { nome, endereco, telefone } = req.body;

      if (!nome || !nome.trim()) {
        return res.status(400).json({
          error: 'Dados inválidos',
          message: 'Nome da unidade é obrigatório'
        });
      }

      const unidadeData = {
        nome: nome.trim(),
        endereco: endereco?.trim() || '',
        telefone: telefone?.trim() || '',
        status: req.body.status || 'Ativo',
        horarios_funcionamento: req.body.horarios_funcionamento || null,
        agentes_ids: req.body.agentes_ids || null,
        servicos_ids: req.body.servicos_ids || null
      };

      // Usar service para ambos MASTER e ADMIN (MASTER terá limite bypass no service)
      const result = await this.unidadeService.createUnidade(usuarioId, unidadeData, userRole);

      return res.status(201).json({
        data: result.unidade,
        limitInfo: result.limitInfo,
        message: 'Unidade criada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao criar unidade:', error);

      // Tratar erro específico de limite excedido
      if (error.code === 'UNIT_LIMIT_EXCEEDED') {
        return res.status(400).json({
          error: 'Limite de unidades excedido',
          message: error.message,
          details: error.details
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/unidades/:id - Buscar unidade específica
  async show(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Buscar unidade com horários usando service
      const unidadeCompleta = await this.unidadeService.getUnidadeById(usuarioId, parseInt(id), userRole);

      if (!unidadeCompleta) {
        return res.status(404).json({
          error: 'Unidade não encontrada',
          message: 'Unidade não existe ou você não tem permissão para visualizá-la'
        });
      }

      // 🔍 LOG DE DEBUG: Verificar estrutura da resposta
      console.log(`🔍 [UnidadeController] show - Unidade ${id}:`, {
        id: unidadeCompleta.id,
        nome: unidadeCompleta.nome,
        hasHorarios: !!unidadeCompleta.horarios_funcionamento,
        horariosLength: unidadeCompleta.horarios_funcionamento?.length,
        horarios: unidadeCompleta.horarios_funcionamento
      });

      return res.json({
        success: true, // ✅ CORREÇÃO: Adicionar flag success
        data: unidadeCompleta
      });
    } catch (error) {
      console.error('Erro ao buscar unidade:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // PUT /api/unidades/:id - Atualizar unidade
  async update(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // 🔍 LOG DE DEBUG: Verificar payload recebido
      console.log(`📥 [UnidadeController] update - Unidade ${id}:`, {
        usuarioId,
        userRole,
        body_keys: Object.keys(req.body),
        agentes_ids: req.body.agentes_ids,
        servicos_ids: req.body.servicos_ids,
        horarios_funcionamento: req.body.horarios_funcionamento ? 'presente' : 'ausente'
      });

      // Validar dados se fornecidos
      const updateData = {};

      if (req.body.nome !== undefined) {
        if (!req.body.nome || !req.body.nome.trim()) {
          return res.status(400).json({
            error: 'Dados inválidos',
            message: 'Nome da unidade não pode estar vazio'
          });
        }
        updateData.nome = req.body.nome.trim();
      }

      if (req.body.endereco !== undefined) {
        updateData.endereco = req.body.endereco?.trim() || '';
      }

      if (req.body.telefone !== undefined) {
        updateData.telefone = req.body.telefone?.trim() || '';
      }

      // Suporte para atualização de status
      if (req.body.status !== undefined) {
        const validStatuses = ['Ativo', 'Bloqueado', 'Excluido'];
        if (!validStatuses.includes(req.body.status)) {
          return res.status(400).json({
            error: 'Dados inválidos',
            message: 'Status deve ser: Ativo, Bloqueado ou Excluido'
          });
        }
        updateData.status = req.body.status;
      }

      if (req.body.horarios_funcionamento !== undefined) {
        updateData.horarios_funcionamento = req.body.horarios_funcionamento;
      }

      // Suporte para horarios_semanais (formato do frontend)
      if (req.body.horarios_semanais !== undefined) {
        updateData.horarios_funcionamento = req.body.horarios_semanais;
      }

      if (req.body.agentes_ids !== undefined) {
        updateData.agentes_ids = req.body.agentes_ids;
      }

      if (req.body.servicos_ids !== undefined) {
        updateData.servicos_ids = req.body.servicos_ids;
        console.log(`🔗 [UnidadeController] servicos_ids recebidos:`, {
          isArray: Array.isArray(req.body.servicos_ids),
          length: req.body.servicos_ids?.length,
          ids: req.body.servicos_ids
        });
      }

      // 🔍 LOG DE DEBUG: Verificar updateData antes de enviar ao service
      console.log(`📤 [UnidadeController] updateData preparado:`, {
        hasNome: !!updateData.nome,
        hasAgentes: updateData.agentes_ids !== undefined,
        hasServicos: updateData.servicos_ids !== undefined,
        hasHorarios: updateData.horarios_funcionamento !== undefined,
        agentes_count: updateData.agentes_ids?.length,
        servicos_count: updateData.servicos_ids?.length
      });

      // Usar service para atualizar com verificação de permissões
      const unidadeAtualizada = await this.unidadeService.updateUnidade(
        usuarioId,
        parseInt(id),
        updateData,
        userRole
      );

      console.log(`✅ [UnidadeController] Unidade ${id} atualizada com sucesso`);

      return res.json({
        success: true,
        data: unidadeAtualizada,
        message: 'Unidade atualizada com sucesso'
      });
    } catch (error) {
      console.error('❌ [UnidadeController] Erro ao atualizar unidade:', error.message);
      console.error('   Stack:', error.stack);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // PATCH /api/unidades/:id/status - Alterar status da unidade
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      if (!status || !['Ativo', 'Bloqueado'].includes(status)) {
        return res.status(400).json({
          error: 'Status inválido',
          message: 'Status deve ser "Ativo" ou "Bloqueado"'
        });
      }

      // Usar service para alterar status com verificação de permissões
      const unidadeAtualizada = await this.unidadeService.changeUnidadeStatus(
        usuarioId,
        parseInt(id),
        status,
        userRole
      );

      return res.json({
        data: unidadeAtualizada,
        message: `Status da unidade alterado para ${status}`
      });
    } catch (error) {
      console.error('Erro ao alterar status da unidade:', error);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      if (error.code === 'INVALID_STATUS') {
        return res.status(400).json({
          error: 'Status inválido',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // DELETE /api/unidades/:id - Soft delete da unidade (ADMIN pode deletar suas próprias)
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // ADMIN pode deletar suas próprias unidades, MASTER pode deletar qualquer uma
      // Usar soft delete alterando status para 'Excluido'
      const unidadeAtualizada = await this.unidadeService.changeUnidadeStatus(
        usuarioId,
        parseInt(id),
        'Excluido',
        userRole
      );

      return res.json({
        data: unidadeAtualizada,
        message: 'Unidade excluída com sucesso'
      });
    } catch (error) {
      console.error('Erro ao excluir unidade:', error);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      if (error.code === 'INVALID_STATUS') {
        return res.status(400).json({
          error: 'Status inválido',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = UnidadeController;
