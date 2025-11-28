/**
 * Modelo: ConfiguracaoSistema
 * Descrição: Gerencia configurações do sistema por unidade
 * Padrão: RUD (Read, Update, Delete) - um registro único por unidade_id
 */

class ConfiguracaoSistema {
  constructor(db) {
    this.db = db;
    this.tableName = 'configuracoes_sistema';
  }

  /**
   * Busca configuração por unidade_id
   * Se não existir, retorna null (será criada com defaults)
   */
  async findByUnidade(unidadeId) {
    try {
      const configuracao = await this.db(this.tableName)
        .where('unidade_id', unidadeId)
        .select(
          'unidade_id',
          'nome_negocio',
          'logo_url',
          'duracao_servico_minutos',
          'tempo_limite_agendar_horas',
          'permitir_cancelamento',
          'tempo_limite_cancelar_horas',
          'periodo_futuro_dias',
          // Campos de pontos
          'pontos_ativo',
          'pontos_por_real',
          'reais_por_pontos',
          'pontos_validade_meses',
          'created_at',
          'updated_at'
        )
        .first();

      return configuracao || null;
    } catch (error) {
      console.error('[ConfiguracaoSistema] Erro ao buscar configuração:', error);
      throw error;
    }
  }

  /**
   * Cria configuração com valores padrão para uma unidade
   */
  async createDefault(unidadeId) {
    try {
      const defaultConfig = {
        unidade_id: unidadeId,
        nome_negocio: 'Meu Negócio',
        logo_url: null,
        duracao_servico_minutos: 60, // 1 hora
        tempo_limite_agendar_horas: 2, // 2 horas antes
        permitir_cancelamento: true,
        tempo_limite_cancelar_horas: 4, // 4 horas antes
        periodo_futuro_dias: 365, // 1 ano
        // Configurações de pontos (padrão: desativado)
        pontos_ativo: false,
        pontos_por_real: 1.00, // 1 ponto por R$ 1,00
        reais_por_pontos: 10.00, // 10 pontos = R$ 1,00 de desconto
        pontos_validade_meses: 12 // 12 meses de validade
      };

      await this.db(this.tableName).insert(defaultConfig);
      
      // Retorna a configuração criada
      return await this.findByUnidade(unidadeId);
    } catch (error) {
      console.error('[ConfiguracaoSistema] Erro ao criar configuração padrão:', error);
      throw error;
    }
  }

  /**
   * Atualiza configuração existente
   */
  async update(unidadeId, dadosConfiguracao) {
    try {
      const dadosAtualizacao = {
        ...dadosConfiguracao,
        updated_at: new Date()
      };

      // Remove campos que não devem ser atualizados
      delete dadosAtualizacao.unidade_id;
      delete dadosAtualizacao.created_at;

      const rowsAffected = await this.db(this.tableName)
        .where('unidade_id', unidadeId)
        .update(dadosAtualizacao);

      if (rowsAffected === 0) {
        throw new Error('Configuração não encontrada para atualização');
      }

      // Retorna a configuração atualizada
      return await this.findByUnidade(unidadeId);
    } catch (error) {
      console.error('[ConfiguracaoSistema] Erro ao atualizar configuração:', error);
      throw error;
    }
  }

  /**
   * Cria ou atualiza configuração (upsert)
   */
  async upsert(unidadeId, dadosConfiguracao) {
    try {
      const configuracaoExistente = await this.findByUnidade(unidadeId);
      
      if (configuracaoExistente) {
        return await this.update(unidadeId, dadosConfiguracao);
      } else {
        // Cria com dados fornecidos + defaults para campos não informados
        const configCompleta = {
          unidade_id: unidadeId,
          nome_negocio: dadosConfiguracao.nome_negocio || 'Meu Negócio',
          logo_url: dadosConfiguracao.logo_url || null,
          duracao_servico_minutos: dadosConfiguracao.duracao_servico_minutos || 60,
          tempo_limite_agendar_horas: dadosConfiguracao.tempo_limite_agendar_horas || 2,
          permitir_cancelamento: dadosConfiguracao.permitir_cancelamento !== undefined ? 
            dadosConfiguracao.permitir_cancelamento : true,
          tempo_limite_cancelar_horas: dadosConfiguracao.tempo_limite_cancelar_horas || 4,
          periodo_futuro_dias: dadosConfiguracao.periodo_futuro_dias || 365
        };

        await this.db(this.tableName).insert(configCompleta);
        return await this.findByUnidade(unidadeId);
      }
    } catch (error) {
      console.error('[ConfiguracaoSistema] Erro no upsert:', error);
      throw error;
    }
  }

  /**
   * Remove configuração (usado apenas em casos especiais)
   */
  async delete(unidadeId) {
    try {
      const rowsAffected = await this.db(this.tableName)
        .where('unidade_id', unidadeId)
        .del();

      return rowsAffected > 0;
    } catch (error) {
      console.error('[ConfiguracaoSistema] Erro ao deletar configuração:', error);
      throw error;
    }
  }
}

module.exports = ConfiguracaoSistema;
