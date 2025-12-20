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

        // Associar agentes à unidade (se fornecidos)
        if (unidadeData.agentes_ids && Array.isArray(unidadeData.agentes_ids) && unidadeData.agentes_ids.length > 0) {


          // Verificar se os agentes pertencem ao usuário (diretamente OU através de unidades)
          const agentesValidos = await trx('agentes')
            .leftJoin('unidades', 'agentes.unidade_id', 'unidades.id')
            .whereIn('agentes.id', unidadeData.agentes_ids)
            .where(function() {
              this.where('agentes.usuario_id', userId)  // Agentes diretos do usuário
                  .orWhere('unidades.usuario_id', userId);  // Agentes através de unidades
            })
            .select('agentes.id');

          if (agentesValidos.length !== unidadeData.agentes_ids.length) {
            throw new Error('Um ou mais agentes não pertencem ao usuário ou não existem');
          }

          // Criar associações na tabela agente_unidades
          const associacoesAgentes = unidadeData.agentes_ids.map(agenteId => ({
            agente_id: agenteId,
            unidade_id: novaUnidade.id,
            created_at: new Date()
          }));

          await trx('agente_unidades').insert(associacoesAgentes);

        }

        // Associar serviços à unidade (se fornecidos)
        if (unidadeData.servicos_ids && Array.isArray(unidadeData.servicos_ids) && unidadeData.servicos_ids.length > 0) {


          // Verificar se os serviços pertencem ao usuário
          const servicosValidos = await trx('servicos')
            .whereIn('id', unidadeData.servicos_ids)
            .where('usuario_id', userId)
            .select('id');

          if (servicosValidos.length !== unidadeData.servicos_ids.length) {
            throw new Error('Um ou mais serviços não pertencem ao usuário ou não existem');
          }

          // ✅ ARQUITETURA MANY-TO-MANY: Criar associações na tabela unidade_servicos
          const associacoesServicos = unidadeData.servicos_ids.map(servicoId => ({
            unidade_id: novaUnidade.id,
            servico_id: servicoId,
            created_at: new Date()
          }));

          await trx('unidade_servicos').insert(associacoesServicos);

        }

        // Criar exceções de calendário (se fornecidas)
        if (unidadeData.excecoes_calendario && Array.isArray(unidadeData.excecoes_calendario) && unidadeData.excecoes_calendario.length > 0) {
          logger.log(`📅 [UnidadeService] Criando ${unidadeData.excecoes_calendario.length} exceções de calendário`);

          for (const excecao of unidadeData.excecoes_calendario) {
            await ExcecaoCalendario.create({
              unidade_id: novaUnidade.id,
              data_inicio: excecao.data_inicio,
              data_fim: excecao.data_fim,
              tipo: excecao.tipo,
              descricao: excecao.descricao
            }, trx);
          }
        }

        // ✅ CORREÇÃO: Criar configurações padrão para a nova unidade
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

      // Buscar unidades do usuário
      const todasUnidades = await this.unidadeModel.findByUsuario(userId);

      // Filtrar unidades excluídas por padrão
      const unidades = todasUnidades.filter(u => u.status !== 'Excluido');

      // Aplicar filtros adicionais se fornecidos
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

      // AGENTE: Verificar se trabalha nesta unidade através da tabela agente_unidades
      if (userRole === 'AGENTE') {


        // Buscar o agente_id do usuário
        const agente = await db('agentes').where('usuario_id', userId).first();

        if (!agente) {

          return false;
        }

        // Verificar se o agente trabalha nesta unidade
        const agenteUnidade = await db('agente_unidades')
          .where('agente_id', agente.id)
          .where('unidade_id', unidadeId)
          .first();

        const canAccess = !!agenteUnidade;

        return canAccess;
      }

      // ADMIN só pode acessar suas próprias unidades
      const canAccess = unidade.usuario_id === userId;

      return canAccess;
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
          status: updateData.status,
          updated_at: new Date()
        };

        // Remover campos undefined para não sobrescrever com null
        Object.keys(dadosBasicos).forEach(key => {
          if (dadosBasicos[key] === undefined) {
            delete dadosBasicos[key];
          }
        });

        const [unidadeAtualizada] = await trx('unidades')
          .where('id', unidadeId)
          .update(dadosBasicos)
          .returning('*');

        // Atualizar horários se fornecidos
        if (updateData.horarios_funcionamento) {
          await HorarioFuncionamentoUnidade.upsertHorariosSemanais(
            unidadeId,
            updateData.horarios_funcionamento,
            trx
          );
        }

        // Atualizar associações de agentes (se fornecidos)
        if (updateData.agentes_ids !== undefined) {


          // Remover associações existentes
          await trx('agente_unidades').where('unidade_id', unidadeId).del();

          if (Array.isArray(updateData.agentes_ids) && updateData.agentes_ids.length > 0) {
            // Verificar se os agentes pertencem ao usuário (diretamente OU através de unidades)
            const agentesValidos = await trx('agentes')
              .leftJoin('unidades', 'agentes.unidade_id', 'unidades.id')
              .whereIn('agentes.id', updateData.agentes_ids)
              .where(function() {
                this.where('agentes.usuario_id', userId)  // Agentes diretos do usuário
                    .orWhere('unidades.usuario_id', userId);  // Agentes através de unidades
              })
              .select('agentes.id');

            if (agentesValidos.length !== updateData.agentes_ids.length) {
              throw new Error('Um ou mais agentes não pertencem ao usuário ou não existem');
            }

            // Criar novas associações
            const associacoesAgentes = updateData.agentes_ids.map(agenteId => ({
              agente_id: agenteId,
              unidade_id: unidadeId,
              created_at: new Date()
            }));

            await trx('agente_unidades').insert(associacoesAgentes);
          }
        }

        // Atualizar associações de serviços (se fornecidos)
        if (updateData.servicos_ids !== undefined) {


          // ✅ ARQUITETURA MANY-TO-MANY: Remover associações existentes da tabela unidade_servicos
          const removidos = await trx('unidade_servicos').where('unidade_id', unidadeId).del();


          if (Array.isArray(updateData.servicos_ids) && updateData.servicos_ids.length > 0) {

            
            // Verificar se os serviços pertencem ao usuário
            const servicosValidos = await trx('servicos')
              .whereIn('id', updateData.servicos_ids)
              .where('usuario_id', userId)
              .select('id');



            if (servicosValidos.length !== updateData.servicos_ids.length) {
              const idsValidos = servicosValidos.map(s => s.id);
              const idsInvalidos = updateData.servicos_ids.filter(id => !idsValidos.includes(id));
              logger.error('❌ [UnidadeService] Serviços inválidos ou não pertencentes ao usuário:', idsInvalidos);
              throw new Error('Um ou mais serviços não pertencem ao usuário ou não existem');
            }

            // ✅ ARQUITETURA MANY-TO-MANY: Criar novas associações na tabela unidade_servicos
            const associacoesServicos = updateData.servicos_ids.map(servicoId => ({
              unidade_id: unidadeId,
              servico_id: servicoId,
              created_at: new Date()
            }));

            await trx('unidade_servicos').insert(associacoesServicos);
          }
        }

        // Atualizar exceções de calendário (se fornecidas)
        logger.log(`🔍 [UnidadeService] updateData.excecoes_calendario:`, updateData.excecoes_calendario);
        
        if (updateData.excecoes_calendario !== undefined) {
          logger.log(`📅 [UnidadeService] Atualizando exceções de calendário para unidade ${unidadeId}`);
          logger.log(`📅 [UnidadeService] Tipo: ${typeof updateData.excecoes_calendario}, É Array: ${Array.isArray(updateData.excecoes_calendario)}`);
          logger.log(`📅 [UnidadeService] Quantidade: ${updateData.excecoes_calendario?.length || 0}`);
          
          // Remover exceções existentes
          const deletedCount = await ExcecaoCalendario.deleteByUnidade(unidadeId, trx);
          logger.log(`🗑️ [UnidadeService] ${deletedCount} exceções antigas removidas`);
          
          // Criar novas exceções
          if (Array.isArray(updateData.excecoes_calendario) && updateData.excecoes_calendario.length > 0) {
            logger.log(`📅 [UnidadeService] Criando ${updateData.excecoes_calendario.length} novas exceções...`);
            
            for (const excecao of updateData.excecoes_calendario) {
              logger.log(`   ➕ Criando exceção:`, excecao);
              
              const excecaoCriada = await ExcecaoCalendario.create({
                unidade_id: unidadeId,
                data_inicio: excecao.data_inicio,
                data_fim: excecao.data_fim,
                tipo: excecao.tipo,
                descricao: excecao.descricao
              }, trx);
              
              logger.log(`   ✅ Exceção criada com ID: ${excecaoCriada.id}`);
            }
            
            logger.log(`✅ [UnidadeService] Todas as ${updateData.excecoes_calendario.length} exceções foram criadas`);
          } else {
            logger.log(`⚠️ [UnidadeService] Nenhuma exceção para criar (array vazio ou inválido)`);
          }
        } else {
          logger.log(`⚠️ [UnidadeService] excecoes_calendario não foi fornecido no updateData`);
        }

        await trx.commit();

        // Buscar unidade completa com horários
        const unidadeCompleta = await this.getUnidadeWithHorarios(unidadeId);
        return unidadeCompleta;
      } catch (transactionError) {
        await trx.rollback();
        logger.error('❌ [UnidadeService] Rollback executado. Erro:', transactionError.message);
        throw transactionError;
      }
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
  async changeUnidadeStatus(userId, unidadeId, newStatus, userRole) {
    try {


      // Validar status
      if (!['Ativo', 'Bloqueado', 'Excluido'].includes(newStatus)) {
        const error = new Error('Status inválido. Use "Ativo", "Bloqueado" ou "Excluido"');
        error.code = 'INVALID_STATUS';
        throw error;
      }

      // Atualizar usando o método updateUnidade que já verifica permissões
      const resultado = await this.updateUnidade(userId, unidadeId, { status: newStatus }, userRole);

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
  async createExcecaoCalendario(userId, unidadeId, excecaoData, userRole) {
    try {
      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(userId, unidadeId, userRole);

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
  async updateExcecaoCalendario(userId, excecaoId, excecaoData, userRole) {
    try {
      // Buscar exceção para verificar unidade_id
      const excecaoExistente = await ExcecaoCalendario.findById(excecaoId);
      
      if (!excecaoExistente) {
        const error = new Error('Exceção não encontrada');
        error.code = 'EXCECAO_NAO_ENCONTRADA';
        throw error;
      }

      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(userId, excecaoExistente.unidade_id, userRole);

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
  async deleteExcecaoCalendario(userId, excecaoId, userRole) {
    try {
      // Buscar exceção para verificar unidade_id
      const excecaoExistente = await ExcecaoCalendario.findById(excecaoId);
      
      if (!excecaoExistente) {
        const error = new Error('Exceção não encontrada');
        error.code = 'EXCECAO_NAO_ENCONTRADA';
        throw error;
      }

      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(userId, excecaoExistente.unidade_id, userRole);

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
  async listExcecoesCalendario(userId, unidadeId, filters, userRole) {
    try {
      // Verificar se pode acessar a unidade
      const canAccess = await this.canAccessUnidade(userId, unidadeId, userRole);

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
