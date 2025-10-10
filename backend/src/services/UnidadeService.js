const Unidade = require('../models/Unidade');
const Usuario = require('../models/Usuario');
const HorarioFuncionamentoUnidade = require('../models/HorarioFuncionamentoUnidade');
const { db } = require('../config/knex');

class UnidadeService {
  constructor() {
    this.unidadeModel = new Unidade();
    this.usuarioModel = new Usuario();
  }

  /**
   * Verifica se o usuário pode criar uma nova unidade baseado no seu plano
   * @param {number} userId - ID do usuário
   * @returns {Promise<{canCreate: boolean, message?: string, currentCount?: number, limit?: number}>}
   */
  async checkUnitLimit(userId) {
    try {
      // Buscar dados do usuário
      const usuario = await this.usuarioModel.findById(userId);
      
      if (!usuario) {
        throw new Error('Usuário não encontrado');
      }

      // Contar unidades existentes do usuário
      const currentCount = await this.unidadeModel.countByUsuario(userId);
      const limit = usuario.limite_unidades || 1;

      // Verificar limite baseado no plano
      if (usuario.plano === 'Single' && currentCount >= 1) {
        return {
          canCreate: false,
          message: 'Plano Single permite apenas 1 unidade',
          currentCount,
          limit: 1
        };
      }

      if (currentCount >= limit) {
        return {
          canCreate: false,
          message: `Limite máximo de ${limit} unidades atingido`,
          currentCount,
          limit
        };
      }

      return {
        canCreate: true,
        currentCount,
        limit
      };
    } catch (error) {
      console.error('Erro ao verificar limite de unidades:', error);
      throw error;
    }
  }

  /**
   * Cria uma nova unidade com horários de funcionamento após validar o limite
   * @param {number} userId - ID do usuário
   * @param {Object} unidadeData - Dados da unidade (incluindo horarios_funcionamento)
   * @param {string} userRole - Role do usuário (opcional, para bypass de limite)
   * @returns {Promise<Object>} - Unidade criada com horários
   */
  async createUnidade(userId, unidadeData, userRole = null) {
    try {
      let limitCheck = { canCreate: true, currentCount: 0, limit: null };

      // Verificar limite apenas se não for MASTER
      if (userRole !== 'MASTER') {
        limitCheck = await this.checkUnitLimit(userId);

        if (!limitCheck.canCreate) {
          const error = new Error(limitCheck.message);
          error.code = 'UNIT_LIMIT_EXCEEDED';
          error.details = {
            currentCount: limitCheck.currentCount,
            limit: limitCheck.limit
          };
          throw error;
        }
      }

      // Validar horários se fornecidos
      if (unidadeData.horarios_funcionamento) {
        this.validateHorariosSemanais(unidadeData.horarios_funcionamento);
      }

      const trx = await db.transaction();

      try {
        // Criar unidade usando transação
        const dadosUnidade = {
          nome: unidadeData.nome,
          endereco: unidadeData.endereco,
          telefone: unidadeData.telefone,
          usuario_id: userId,
          status: unidadeData.status || 'Ativo',
          created_at: new Date(),
          updated_at: new Date()
        };

        const [novaUnidade] = await trx('unidades').insert(dadosUnidade).returning('*');

        // Criar horários de funcionamento
        if (unidadeData.horarios_funcionamento) {
          await HorarioFuncionamentoUnidade.upsertHorariosSemanais(
            novaUnidade.id,
            unidadeData.horarios_funcionamento,
            trx
          );
        } else {
          // Criar horários padrão (fechado todos os dias)
          const horariosDefault = this.getDefaultHorarios();
          await HorarioFuncionamentoUnidade.upsertHorariosSemanais(
            novaUnidade.id,
            horariosDefault,
            trx
          );
        }

        await trx.commit();

        // Buscar unidade completa com horários
        const unidadeCompleta = await this.getUnidadeWithHorarios(novaUnidade.id);

        return {
          unidade: unidadeCompleta,
          limitInfo: {
            currentCount: limitCheck.currentCount + 1,
            limit: limitCheck.limit
          }
        };
      } catch (transactionError) {
        await trx.rollback();
        throw transactionError;
      }
    } catch (error) {
      console.error('Erro ao criar unidade:', error);
      throw error;
    }
  }

  /**
   * Lista unidades do usuário com informações de limite
   * @param {number} userId - ID do usuário
   * @param {Object} filters - Filtros opcionais
   * @returns {Promise<Object>} - Lista de unidades com informações de limite
   */
  async listUnidadesWithLimit(userId, filters = {}) {
    try {
      // Buscar dados do usuário para obter limite
      const usuario = await this.usuarioModel.findById(userId);
      
      if (!usuario) {
        throw new Error('Usuário não encontrado');
      }

      // Buscar unidades do usuário
      const unidades = await this.unidadeModel.findByUsuario(userId);
      
      // Aplicar filtros se fornecidos
      let filteredUnidades = unidades;
      if (filters.status) {
        filteredUnidades = unidades.filter(u => u.status === filters.status);
      }

      const currentCount = unidades.length;
      const limit = usuario.limite_unidades || 1;

      return {
        data: filteredUnidades,
        limitInfo: {
          currentCount,
          limit,
          canCreateMore: currentCount < limit,
          plano: usuario.plano
        }
      };
    } catch (error) {
      console.error('Erro ao listar unidades:', error);
      throw error;
    }
  }

  /**
   * Busca uma unidade específica com horários
   * @param {number} userId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @param {string} userRole - Role do usuário
   * @returns {Promise<Object|null>} - Unidade com horários ou null
   */
  async getUnidadeById(userId, unidadeId, userRole) {
    try {
      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(userId, unidadeId, userRole);

      if (!canAccess) {
        return null;
      }

      // Buscar unidade com horários
      const unidadeCompleta = await this.getUnidadeWithHorarios(unidadeId);
      return unidadeCompleta;
    } catch (error) {
      console.error('Erro ao buscar unidade por ID:', error);
      throw error;
    }
  }

  /**
   * Verifica se o usuário pode acessar uma unidade específica
   * @param {number} userId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @param {string} userRole - Role do usuário
   * @returns {Promise<boolean>}
   */
  async canAccessUnidade(userId, unidadeId, userRole) {
    try {
      // MASTER pode acessar qualquer unidade
      if (userRole === 'MASTER') {
        return true;
      }

      // Buscar a unidade
      const unidade = await this.unidadeModel.findById(unidadeId);
      
      if (!unidade) {
        return false;
      }

      // ADMIN só pode acessar suas próprias unidades
      return unidade.usuario_id === userId;
    } catch (error) {
      console.error('Erro ao verificar acesso à unidade:', error);
      return false;
    }
  }

  /**
   * Atualiza uma unidade com horários após verificar permissões
   * @param {number} userId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @param {Object} updateData - Dados para atualização (incluindo horarios_funcionamento)
   * @param {string} userRole - Role do usuário
   * @returns {Promise<Object>} - Unidade atualizada com horários
   */
  async updateUnidade(userId, unidadeId, updateData, userRole) {
    try {
      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(userId, unidadeId, userRole);

      if (!canAccess) {
        const error = new Error('Você não tem permissão para editar esta unidade');
        error.code = 'ACCESS_DENIED';
        throw error;
      }

      // Validar horários se fornecidos
      if (updateData.horarios_funcionamento) {
        this.validateHorariosSemanais(updateData.horarios_funcionamento);
      }

      const trx = await db.transaction();

      try {
        // Atualizar dados básicos da unidade usando transação
        const dadosBasicos = {
          nome: updateData.nome,
          endereco: updateData.endereco,
          telefone: updateData.telefone,
          updated_at: new Date()
        };

        const [unidadeAtualizada] = await trx('unidades')
          .where('id', unidadeId)
          .update(dadosBasicos)
          .returning('*');

        // Atualizar horários se fornecidos
        if (updateData.horarios_funcionamento) {
          console.log('🔍 DEBUG SERVICE - Iniciando upsert de horários para unidade:', unidadeId);
          console.log('🔍 DEBUG SERVICE - Horários a serem sincronizados:', JSON.stringify(updateData.horarios_funcionamento, null, 2));

          await HorarioFuncionamentoUnidade.upsertHorariosSemanais(
            unidadeId,
            updateData.horarios_funcionamento,
            trx
          );

          console.log('🔍 DEBUG SERVICE - Upsert de horários concluído');
        } else {
          console.log('🔍 DEBUG SERVICE - Nenhum horário para atualizar');
        }

        await trx.commit();

        // Buscar unidade completa com horários
        const unidadeCompleta = await this.getUnidadeWithHorarios(unidadeId);
        return unidadeCompleta;
      } catch (transactionError) {
        await trx.rollback();
        throw transactionError;
      }
    } catch (error) {
      console.error('Erro ao atualizar unidade:', error);
      throw error;
    }
  }

  /**
   * Altera o status de uma unidade
   * @param {number} userId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @param {string} newStatus - Novo status ('Ativo' ou 'Bloqueado')
   * @param {string} userRole - Role do usuário
   * @returns {Promise<Object>} - Unidade com status atualizado
   */
  async changeUnidadeStatus(userId, unidadeId, newStatus, userRole) {
    try {
      // Validar status
      if (!['Ativo', 'Bloqueado'].includes(newStatus)) {
        const error = new Error('Status inválido. Use "Ativo" ou "Bloqueado"');
        error.code = 'INVALID_STATUS';
        throw error;
      }

      // Atualizar usando o método updateUnidade que já verifica permissões
      return await this.updateUnidade(userId, unidadeId, { status: newStatus }, userRole);
    } catch (error) {
      console.error('Erro ao alterar status da unidade:', error);
      throw error;
    }
  }

  /**
   * Buscar unidade com horários de funcionamento
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<Object>} Unidade com horários
   */
  async getUnidadeWithHorarios(unidadeId) {
    try {
      const unidade = await this.unidadeModel.findById(unidadeId);
      if (!unidade) {
        return null;
      }

      const horarios = await HorarioFuncionamentoUnidade.findByUnidade(unidadeId);

      return {
        ...unidade,
        horarios_funcionamento: horarios
      };
    } catch (error) {
      console.error('Erro ao buscar unidade com horários:', error);
      throw error;
    }
  }

  /**
   * Validar horários semanais
   * @param {Array} horariosSemanais - Array com 7 objetos (um para cada dia)
   */
  validateHorariosSemanais(horariosSemanais) {
    if (!Array.isArray(horariosSemanais) || horariosSemanais.length !== 7) {
      throw new Error('Horários semanais devem conter exatamente 7 dias');
    }

    horariosSemanais.forEach((dia, index) => {
      if (typeof dia.is_aberto !== 'boolean') {
        throw new Error(`Dia ${index}: is_aberto deve ser boolean`);
      }

      if (dia.is_aberto && dia.periodos) {
        if (!HorarioFuncionamentoUnidade.validateHorarios(dia.periodos)) {
          throw new Error(`Dia ${index}: horários inválidos`);
        }
      }
    });
  }

  /**
   * Obter horários padrão (fechado todos os dias)
   * @returns {Array} Array com 7 dias fechados
   */
  getDefaultHorarios() {
    return Array.from({ length: 7 }, (_, index) => ({
      dia_semana: index,
      is_aberto: false,
      periodos: []
    }));
  }
}

module.exports = UnidadeService;
