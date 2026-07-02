const Unidade = require('../models/Unidade');
const Usuario = require('../models/Usuario');
const HorarioFuncionamentoUnidade = require('../models/HorarioFuncionamentoUnidade');
const ExcecaoCalendario = require('../models/ExcecaoCalendario');
const { db } = require('../config/knex');
const logger = require('./../utils/logger');

class UnidadeService {
  constructor() {
    this.unidadeModel = new Unidade();
    this.usuarioModel = new Usuario();
  }

  async checkIntegrityBeforeRemoval({ trx, unidadeId, removedAgentIds, removedServiceIds }) {
    const effectiveTrx = trx || db;

    const statusAllowList = ['confirmado', 'pendente', 'Aprovado', 'Confirmado', 'Pendente'];

    const baseAgendamentoQuery = () => effectiveTrx('agendamentos')
      .where('unidade_id', unidadeId)
      .where('data_agendamento', '>=', effectiveTrx.raw('CURRENT_DATE'))
      .whereIn('status', statusAllowList);

    if (Array.isArray(removedAgentIds) && removedAgentIds.length > 0) {
      for (const agenteId of removedAgentIds) {
        const row = await baseAgendamentoQuery()
          .andWhere('agente_id', agenteId)
          .count('* as count')
          .first();

        const count = Number(row?.count || 0);
        if (count > 0) {
          const err = new Error(
            `Operação não permitida: Existem ${count} agendamentos futuros vinculados a este Agente nesta unidade. ` +
            'Por favor, remova ou reagende estes compromissos antes de alterar o catálogo.'
          );
          err.code = 'UNIDADE_CATALOGO_GUARD_AGENTE';
          err.statusCode = 409;
          err.details = { unidade_id: unidadeId, agente_id: agenteId, count };
          throw err;
        }
      }
    }

    if (Array.isArray(removedServiceIds) && removedServiceIds.length > 0) {
      for (const servicoId of removedServiceIds) {
        const row = await baseAgendamentoQuery()
          .join('agendamento_servicos', 'agendamentos.id', 'agendamento_servicos.agendamento_id')
          .andWhere('agendamento_servicos.servico_id', servicoId)
          .countDistinct('agendamentos.id as count')
          .first();

        const count = Number(row?.count || 0);
        if (count > 0) {
          const err = new Error(
            `Operação não permitida: Existem ${count} agendamentos futuros vinculados a este Serviço nesta unidade. ` +
            'Por favor, remova ou reagende estes compromissos antes de alterar o catálogo.'
          );
          err.code = 'UNIDADE_CATALOGO_GUARD_SERVICO';
          err.statusCode = 409;
          err.details = { unidade_id: unidadeId, servico_id: servicoId, count };
          throw err;
        }
      }
    }
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
      logger.error('Erro ao verificar limite de unidades:', error);
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

      const result = await db.transaction(async (trx) => {
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

        if (unidadeData.horarios_funcionamento) {
          await HorarioFuncionamentoUnidade.upsertHorariosSemanais(
            novaUnidade.id,
            unidadeData.horarios_funcionamento,
            trx
          );
        } else {
          const horariosDefault = this.getDefaultHorarios();
          await HorarioFuncionamentoUnidade.upsertHorariosSemanais(
            novaUnidade.id,
            horariosDefault,
            trx
          );
        }

        if (unidadeData.agentes_ids && Array.isArray(unidadeData.agentes_ids) && unidadeData.agentes_ids.length > 0) {
          const agentesValidos = await trx('agentes')
            .leftJoin('unidades', 'agentes.unidade_id', 'unidades.id')
            .whereIn('agentes.id', unidadeData.agentes_ids)
            .where(function() {
              this.where('agentes.usuario_id', userId)
                  .orWhere('unidades.usuario_id', userId);
            })
            .select('agentes.id');

          if (agentesValidos.length !== unidadeData.agentes_ids.length) {
            throw new Error('Um ou mais agentes não pertencem ao usuário ou não existem');
          }

          const associacoesAgentes = unidadeData.agentes_ids.map(agenteId => ({
            agente_id: agenteId,
            unidade_id: novaUnidade.id,
            created_at: new Date()
          }));

          await trx('agente_unidades').insert(associacoesAgentes);
        }

        if (unidadeData.servicos_ids && Array.isArray(unidadeData.servicos_ids) && unidadeData.servicos_ids.length > 0) {
          const servicosValidos = await trx('servicos')
            .whereIn('id', unidadeData.servicos_ids)
            .where('usuario_id', userId)
            .select('id');

          if (servicosValidos.length !== unidadeData.servicos_ids.length) {
            throw new Error('Um ou mais serviços não pertencem ao usuário ou não existem');
          }

          const associacoesServicos = unidadeData.servicos_ids.map(servicoId => ({
            unidade_id: novaUnidade.id,
            servico_id: servicoId,
            created_at: new Date()
          }));

          await trx('unidade_servicos').insert(associacoesServicos);
        }

        if (unidadeData.excecoes_calendario && Array.isArray(unidadeData.excecoes_calendario) && unidadeData.excecoes_calendario.length > 0) {
          logger.log(`📅 [UnidadeService] Criando ${unidadeData.excecoes_calendario.length} exceções de calendário`);

          for (const excecao of unidadeData.excecoes_calendario) {
            await ExcecaoCalendario.create({
              unidade_id: novaUnidade.id,
              data_inicio: excecao.data_inicio,
              data_fim: excecao.data_fim,
              hora_inicio: excecao.hora_inicio || null,
              hora_fim: excecao.hora_fim || null,
              tipo: excecao.tipo,
              descricao: excecao.descricao
            }, trx);
          }
        }

        logger.log(`⚙️ [UnidadeService] Criando configurações padrão para unidade ${novaUnidade.id}`);
        await trx('configuracoes_sistema').insert({
          unidade_id: novaUnidade.id,
          nome_negocio: unidadeData.nome,
          logo_url: null,
          duracao_servico_minutos: 60,
          tempo_limite_agendar_horas: 2,
          permitir_cancelamento: true,
          tempo_limite_cancelar_horas: 4,
          periodo_futuro_dias: 365,
          pontos_ativo: false,
          pontos_por_real: 1.00,
          reais_por_pontos: 10.00,
          pontos_validade_meses: 12
        });
        logger.log(`✅ [UnidadeService] Configurações padrão criadas para unidade ${novaUnidade.id}`);

        const unidadeCompleta = await this.getUnidadeWithHorarios(novaUnidade.id);

        return {
          unidade: unidadeCompleta,
          limitInfo: {
            currentCount: limitCheck.currentCount + 1,
            limit: limitCheck.limit
          }
        };
      });

      return result;
    } catch (error) {
      logger.error('Erro ao criar unidade:', error);
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

      // ========================================
      // PERFORMANCE (ELITE): filtrar no banco (não no Node)
      // ========================================
      const baseQuery = db('unidades')
        .where('usuario_id', userId)
        .whereNot('status', 'Excluido');

      if (filters.status) {
        baseQuery.andWhere('status', filters.status);
      }

      const countRow = await db('unidades')
        .where('usuario_id', userId)
        .whereNot('status', 'Excluido')
        .count('id as count')
        .first();
      const currentCount = Number(countRow?.count || 0);

      // Proteção de escala: paginação opcional (quando fornecida)
      const pageNum = Number.isFinite(Number(filters.page)) ? Math.max(1, parseInt(filters.page, 10)) : null;
      const limitNumRaw = Number.isFinite(Number(filters.limit)) ? Math.max(1, parseInt(filters.limit, 10)) : null;
      const limitNum = limitNumRaw !== null ? Math.min(limitNumRaw, 1000) : null;

      if (pageNum !== null && limitNum !== null) {
        const offset = (pageNum - 1) * limitNum;
        baseQuery.limit(limitNum).offset(offset);
      }

      const filteredUnidades = await baseQuery.select('*');
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
      logger.error('Erro ao listar unidades:', error);
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
  async getUnidadeById(identity, unidadeId) {
    try {
      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(identity, unidadeId);

      if (!canAccess) {
        return null;
      }

      // Buscar unidade com horários
      const unidadeCompleta = await this.getUnidadeWithHorarios(unidadeId);
      return unidadeCompleta;
    } catch (error) {
      logger.error('Erro ao buscar unidade por ID:', error);
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
  async canAccessUnidade(identity, unidadeId) {
    try {
      const role = identity?.role;
      const userId = identity?.userId;
      const agenteId = identity?.agenteId;
      const isAgente = identity?.isAgente === true;

      // MASTER pode acessar qualquer unidade
      if (role === 'MASTER') {
        return true;
      }

      // Buscar a unidade
      const unidade = await this.unidadeModel.findById(unidadeId);

      if (!unidade) {
        return false;
      }

      // AGENTE: Verificar se trabalha nesta unidade
      if (isAgente || role === 'AGENTE') {
        if (!Number.isFinite(agenteId)) {
          return false;
        }

        const agente = await db('agentes')
          .where('id', agenteId)
          .select('id', 'unidade_id')
          .first();

        if (!agente) {
          return false;
        }

        return agente.unidade_id === unidadeId;
      }

      // ADMIN só pode acessar suas próprias unidades
      return unidade.usuario_id === userId;
    } catch (error) {
      logger.error('Erro ao verificar acesso à unidade:', error);
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
  async updateUnidade(identity, unidadeId, updateData) {
    try {
      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(identity, unidadeId);

      if (!canAccess) {
        const error = new Error('Você não tem permissão para editar esta unidade');
        error.code = 'ACCESS_DENIED';
        throw error;
      }

      // Validar horários se fornecidos
      if (updateData.horarios_funcionamento) {
        this.validateHorariosSemanais(updateData.horarios_funcionamento);
      }

      return await db.transaction(async (trx) => {
        const dadosBasicos = {
          nome: updateData.nome,
          endereco: updateData.endereco,
          telefone: updateData.telefone,
          status: updateData.status,
          updated_at: new Date()
        };

        Object.keys(dadosBasicos).forEach(key => {
          if (dadosBasicos[key] === undefined) {
            delete dadosBasicos[key];
          }
        });

        await trx('unidades')
          .where('id', unidadeId)
          .update(dadosBasicos)
          .returning('*');

        if (updateData.horarios_funcionamento) {
          await HorarioFuncionamentoUnidade.upsertHorariosSemanais(
            unidadeId,
            updateData.horarios_funcionamento,
            trx
          );
        }

        if (updateData.agentes_ids !== undefined) {
          const existingAgentRows = await trx('agente_unidades')
            .where('unidade_id', unidadeId)
            .select('agente_id');
          const existingAgentIds = existingAgentRows.map(r => Number(r.agente_id)).filter(n => Number.isFinite(n));

          const nextAgentIds = Array.isArray(updateData.agentes_ids)
            ? updateData.agentes_ids.map(n => Number(n)).filter(n => Number.isFinite(n))
            : [];
          const removedAgentIds = existingAgentIds.filter(id => !nextAgentIds.includes(id));

          await this.checkIntegrityBeforeRemoval({
            trx,
            unidadeId,
            removedAgentIds,
            removedServiceIds: []
          });

          await trx('agente_unidades').where('unidade_id', unidadeId).del();

          if (Array.isArray(updateData.agentes_ids) && updateData.agentes_ids.length > 0) {
            const agentesValidos = await trx('agentes')
              .leftJoin('unidades', 'agentes.unidade_id', 'unidades.id')
              .whereIn('agentes.id', updateData.agentes_ids)
              .where(function() {
                this.where('agentes.usuario_id', identity?.userId)
                    .orWhere('unidades.usuario_id', identity?.userId);
              })
              .select('agentes.id');

            if (agentesValidos.length !== updateData.agentes_ids.length) {
              throw new Error('Um ou mais agentes não pertencem ao usuário ou não existem');
            }

            const associacoesAgentes = updateData.agentes_ids.map(agenteId => ({
              agente_id: agenteId,
              unidade_id: unidadeId,
              created_at: new Date()
            }));

            await trx('agente_unidades').insert(associacoesAgentes);
          }
        }

        if (updateData.servicos_ids !== undefined) {
          const existingServiceRows = await trx('unidade_servicos')
            .where('unidade_id', unidadeId)
            .select('servico_id');
          const existingServiceIds = existingServiceRows.map(r => Number(r.servico_id)).filter(n => Number.isFinite(n));

          const nextServiceIds = Array.isArray(updateData.servicos_ids)
            ? updateData.servicos_ids.map(n => Number(n)).filter(n => Number.isFinite(n))
            : [];
          const removedServiceIds = existingServiceIds.filter(id => !nextServiceIds.includes(id));

          await this.checkIntegrityBeforeRemoval({
            trx,
            unidadeId,
            removedAgentIds: [],
            removedServiceIds
          });

          await trx('unidade_servicos').where('unidade_id', unidadeId).del();

          if (Array.isArray(updateData.servicos_ids) && updateData.servicos_ids.length > 0) {
            const servicosValidos = await trx('servicos')
              .whereIn('id', updateData.servicos_ids)
              .where('usuario_id', identity?.userId)
              .select('id');

            if (servicosValidos.length !== updateData.servicos_ids.length) {
              const idsValidos = servicosValidos.map(s => s.id);
              const idsInvalidos = updateData.servicos_ids.filter(id => !idsValidos.includes(id));
              logger.error('❌ [UnidadeService] Serviços inválidos ou não pertencentes ao usuário:', idsInvalidos);
              throw new Error('Um ou mais serviços não pertencem ao usuário ou não existem');
            }

            const associacoesServicos = updateData.servicos_ids.map(servicoId => ({
              unidade_id: unidadeId,
              servico_id: servicoId,
              created_at: new Date()
            }));

            await trx('unidade_servicos').insert(associacoesServicos);
          }
        }

        if (updateData.excecoes_calendario !== undefined) {
          await ExcecaoCalendario.deleteByUnidade(unidadeId, trx);

          if (Array.isArray(updateData.excecoes_calendario) && updateData.excecoes_calendario.length > 0) {
            for (const excecao of updateData.excecoes_calendario) {
              await ExcecaoCalendario.create({
                unidade_id: unidadeId,
                data_inicio: excecao.data_inicio,
                data_fim: excecao.data_fim,
                hora_inicio: excecao.hora_inicio || null,
                hora_fim: excecao.hora_fim || null,
                tipo: excecao.tipo,
                descricao: excecao.descricao
              }, trx);
            }
          }
        }

        return await this.getUnidadeWithHorarios(unidadeId);
      });
    } catch (error) {
      logger.error('❌ [UnidadeService] Erro ao atualizar unidade:', error.message);
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
  async changeUnidadeStatus(identity, unidadeId, newStatus) {
    try {


      // Validar status
      if (!['Ativo', 'Bloqueado', 'Excluido'].includes(newStatus)) {
        const error = new Error('Status inválido. Use "Ativo", "Bloqueado" ou "Excluido"');
        error.code = 'INVALID_STATUS';
        throw error;
      }

      // Atualizar usando o método updateUnidade que já verifica permissões
      const resultado = await this.updateUnidade(identity, unidadeId, { status: newStatus });

      return resultado;
    } catch (error) {
      logger.error('Erro ao alterar status da unidade:', error);
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

      // Buscar horários de funcionamento
      const horarios = await HorarioFuncionamentoUnidade.findByUnidade(unidadeId);

      // Buscar agentes associados
      const agentesAssociados = await db('agente_unidades')
        .where('unidade_id', unidadeId)
        .select('agente_id');
      const agentesIds = agentesAssociados.map(a => a.agente_id);

      // ✅ ARQUITETURA MANY-TO-MANY: Buscar serviços associados da tabela unidade_servicos
      const servicosAssociados = await db('unidade_servicos')
        .where('unidade_id', unidadeId)
        .select('servico_id');
      const servicosIds = servicosAssociados.map(s => s.servico_id);

      // Buscar exceções de calendário (com fallback para array vazio em caso de erro)
      let excecoes = [];
      try {
        excecoes = await ExcecaoCalendario.findByUnidade(unidadeId);
      } catch (excecaoError) {
        logger.warn('⚠️ [UnidadeService] Erro ao buscar exceções de calendário, continuando sem elas:', excecaoError.message);
        // Não quebra o fluxo, apenas retorna array vazio
      }

      return {
        ...unidade,
        horarios_funcionamento: horarios,
        agentes_ids: agentesIds,
        servicos_ids: servicosIds,
        excecoes_calendario: excecoes
      };
    } catch (error) {
      logger.error('Erro ao buscar unidade com horários:', error);
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

  // ========================================
  // MÉTODOS PARA EXCEÇÕES DE CALENDÁRIO
  // ========================================

  /**
   * Criar exceção de calendário para uma unidade
   * @param {number} userId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @param {Object} excecaoData - Dados da exceção
   * @param {string} userRole - Role do usuário
   * @returns {Promise<Object>} Exceção criada
   */
  async createExcecaoCalendario(identity, unidadeId, excecaoData) {
    try {
      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(identity, unidadeId);

      if (!canAccess) {
        const error = new Error('Você não tem permissão para editar esta unidade');
        error.code = 'ACCESS_DENIED';
        throw error;
      }

      // Criar exceção
      const excecao = await ExcecaoCalendario.create({
        ...excecaoData,
        unidade_id: unidadeId
      });

      logger.log(`✅ [UnidadeService] Exceção de calendário criada: ID ${excecao.id}, Unidade ${unidadeId}`);
      return excecao;
    } catch (error) {
      logger.error('❌ [UnidadeService] Erro ao criar exceção de calendário:', error.message);
      throw error;
    }
  }

  /**
   * Atualizar exceção de calendário
   * @param {number} userId - ID do usuário
   * @param {number} excecaoId - ID da exceção
   * @param {Object} excecaoData - Dados para atualização
   * @param {string} userRole - Role do usuário
   * @returns {Promise<Object>} Exceção atualizada
   */
  async updateExcecaoCalendario(identity, excecaoId, excecaoData) {
    try {
      // Buscar exceção para verificar unidade_id
      const excecaoExistente = await ExcecaoCalendario.findById(excecaoId);
      
      if (!excecaoExistente) {
        const error = new Error('Exceção não encontrada');
        error.code = 'EXCECAO_NAO_ENCONTRADA';
        throw error;
      }

      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(identity, excecaoExistente.unidade_id);

      if (!canAccess) {
        const error = new Error('Você não tem permissão para editar esta exceção');
        error.code = 'ACCESS_DENIED';
        throw error;
      }

      // Atualizar exceção
      const excecaoAtualizada = await ExcecaoCalendario.update(excecaoId, excecaoData);

      logger.log(`✅ [UnidadeService] Exceção de calendário atualizada: ID ${excecaoId}`);
      return excecaoAtualizada;
    } catch (error) {
      logger.error('❌ [UnidadeService] Erro ao atualizar exceção de calendário:', error.message);
      throw error;
    }
  }

  /**
   * Deletar exceção de calendário
   * @param {number} userId - ID do usuário
   * @param {number} excecaoId - ID da exceção
   * @param {string} userRole - Role do usuário
   * @returns {Promise<boolean>} True se deletado com sucesso
   */
  async deleteExcecaoCalendario(identity, excecaoId) {
    try {
      // Buscar exceção para verificar unidade_id
      const excecaoExistente = await ExcecaoCalendario.findById(excecaoId);
      
      if (!excecaoExistente) {
        const error = new Error('Exceção não encontrada');
        error.code = 'EXCECAO_NAO_ENCONTRADA';
        throw error;
      }

      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(identity, excecaoExistente.unidade_id);

      if (!canAccess) {
        const error = new Error('Você não tem permissão para deletar esta exceção');
        error.code = 'ACCESS_DENIED';
        throw error;
      }

      // Deletar exceção
      const deleted = await ExcecaoCalendario.delete(excecaoId);

      logger.log(`✅ [UnidadeService] Exceção de calendário deletada: ID ${excecaoId}`);
      return deleted;
    } catch (error) {
      logger.error('❌ [UnidadeService] Erro ao deletar exceção de calendário:', error.message);
      throw error;
    }
  }

  /**
   * Listar exceções de calendário de uma unidade
   * @param {number} userId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @param {Object} filters - Filtros opcionais (dataInicio, dataFim)
   * @param {string} userRole - Role do usuário
   * @returns {Promise<Array>} Lista de exceções
   */
  async listExcecoesCalendario(identity, unidadeId, filters) {
    try {
      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(identity, unidadeId);

      if (!canAccess) {
        const error = new Error('Você não tem permissão para acessar esta unidade');
        error.code = 'ACCESS_DENIED';
        throw error;
      }

      // Buscar exceções
      const excecoes = await ExcecaoCalendario.findByUnidade(unidadeId, filters);

      return excecoes;
    } catch (error) {
      logger.error('❌ [UnidadeService] Erro ao listar exceções de calendário:', error.message);
      throw error;
    }
  }

  /**
   * Verificar se uma data está bloqueada por exceção
   * @param {number} unidadeId - ID da unidade
   * @param {Date|string} data - Data a verificar
   * @returns {Promise<Object|null>} Exceção que bloqueia a data ou null
   */
  async isDataBloqueadaPorExcecao(unidadeId, data) {
    try {
      const excecao = await ExcecaoCalendario.isDataBloqueada(unidadeId, data);
      return excecao;
    } catch (error) {
      logger.error('❌ [UnidadeService] Erro ao verificar se data está bloqueada:', error.message);
      throw error;
    }
  }
}

module.exports = UnidadeService;
