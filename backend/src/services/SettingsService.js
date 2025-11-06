/**
 * Serviço: SettingsService
 * Descrição: Lógica de negócio para configurações do sistema
 * Funcionalidades: RUD (Read, Update, Delete) + conversões de tempo
 */

const ConfiguracaoSistema = require('../models/ConfiguracaoSistema');
const bcrypt = require('bcrypt');

class SettingsService {
  constructor(db) {
    this.db = db;
    this.configuracaoModel = new ConfiguracaoSistema(db);
  }

  /**
   * Busca configurações da unidade
   * Se não existir, cria com valores padrão
   */
  async getConfiguracoes(unidadeId) {
    try {
      console.log(`[SettingsService] Buscando configurações para unidade ${unidadeId}`);
      let configuracao = await this.configuracaoModel.findByUnidade(unidadeId);
      console.log(`[SettingsService] Configuração encontrada:`, configuracao);

      // Se não existe configuração, cria uma com valores padrão
      if (!configuracao) {
        console.log(`[SettingsService] Criando configuração padrão para unidade ${unidadeId}`);
        configuracao = await this.configuracaoModel.createDefault(unidadeId);
      }

      console.log(`[SettingsService] Formatando configuração para frontend`);
      // Converte dados para o formato do frontend (minutos → horas onde necessário)
      const resultado = this.formatarParaFrontend(configuracao);
      console.log(`[SettingsService] Resultado formatado:`, resultado);
      return resultado;
    } catch (error) {
      console.error('[SettingsService] Erro ao buscar configurações:', error);
      throw new Error('Erro ao carregar configurações do sistema');
    }
  }

  /**
   * Atualiza configurações da unidade
   */
  async updateConfiguracoes(unidadeId, dadosConfiguracao) {
    try {
      // Converte dados do frontend para formato do banco (horas → minutos onde necessário)
      const dadosFormatados = this.formatarParaBanco(dadosConfiguracao);

      // Valida dados
      this.validarConfiguracoes(dadosFormatados);

      // Atualiza no banco
      const configuracaoAtualizada = await this.configuracaoModel.upsert(unidadeId, dadosFormatados);

      // Retorna formatado para o frontend
      return this.formatarParaFrontend(configuracaoAtualizada);
    } catch (error) {
      console.error('[SettingsService] Erro ao atualizar configurações:', error);
      throw error;
    }
  }

  /**
   * Atualiza apenas a logo da unidade (sem validação de outros campos)
   */
  async updateLogoOnly(unidadeId, logoUrl) {
    try {
      console.log(`[SettingsService] Atualizando apenas logo para unidade ${unidadeId}: ${logoUrl}`);

      // Atualiza no banco apenas o campo logo_url
      const configuracaoAtualizada = await this.configuracaoModel.upsert(unidadeId, {
        logo_url: logoUrl
      });

      // Retorna formatado para o frontend
      return this.formatarParaFrontend(configuracaoAtualizada);
    } catch (error) {
      console.error('[SettingsService] Erro ao atualizar logo:', error);
      throw error;
    }
  }

  /**
   * Atualiza senha do usuário admin
   */
  async updateSenhaAdmin(userId, senhaAtual, novaSenha, confirmacaoSenha) {
    try {
      // Validações
      if (!senhaAtual || !novaSenha || !confirmacaoSenha) {
        throw new Error('Todos os campos de senha são obrigatórios');
      }

      if (novaSenha !== confirmacaoSenha) {
        throw new Error('Nova senha e confirmação não coincidem');
      }

      if (novaSenha.length < 6) {
        throw new Error('Nova senha deve ter pelo menos 6 caracteres');
      }

      // Busca usuário atual
      const usuario = await this.db('usuarios')
        .where('id', userId)
        .select('id', 'senha_hash')
        .first();

      if (!usuario) {
        throw new Error('Usuário não encontrado');
      }

      // Verifica senha atual
      const senhaAtualValida = await bcrypt.compare(senhaAtual, usuario.senha_hash);
      if (!senhaAtualValida) {
        throw new Error('Senha atual incorreta');
      }

      // Gera hash da nova senha
      const saltRounds = 12;
      const novaSenhaHash = await bcrypt.hash(novaSenha, saltRounds);

      // Atualiza senha no banco
      await this.db('usuarios')
        .where('id', userId)
        .update({
          senha_hash: novaSenhaHash,
          updated_at: new Date()
        });

      console.log(`[SettingsService] Senha atualizada para usuário ${userId}`);
      return { success: true, message: 'Senha atualizada com sucesso' };
    } catch (error) {
      console.error('[SettingsService] Erro ao atualizar senha:', error);
      throw error;
    }
  }

  /**
   * Converte dados do banco para formato do frontend
   */
  formatarParaFrontend(configuracao) {
    return {
      unidade_id: configuracao.unidade_id,
      nome_negocio: configuracao.nome_negocio,
      logo_url: configuracao.logo_url,
      duracao_servico_horas: Math.round(configuracao.duracao_servico_minutos / 60 * 10) / 10, // Converte minutos → horas
      tempo_limite_agendar_horas: configuracao.tempo_limite_agendar_horas,
      permitir_cancelamento: configuracao.permitir_cancelamento,
      tempo_limite_cancelar_horas: configuracao.tempo_limite_cancelar_horas,
      periodo_futuro_dias: configuracao.periodo_futuro_dias,
      created_at: configuracao.created_at,
      updated_at: configuracao.updated_at
    };
  }

  /**
   * Converte dados do frontend para formato do banco
   */
  formatarParaBanco(dadosConfiguracao) {
    const dados = { ...dadosConfiguracao };
    
    // Converte duração de horas para minutos
    if (dados.duracao_servico_horas !== undefined) {
      dados.duracao_servico_minutos = Math.round(dados.duracao_servico_horas * 60);
      delete dados.duracao_servico_horas;
    }

    return dados;
  }

  /**
   * Valida dados de configuração (validação condicional)
   */
  validarConfiguracoes(dadosConfiguracao) {
    const erros = [];

    // Nome do negócio (só valida se estiver presente na requisição)
    if (dadosConfiguracao.hasOwnProperty('nome_negocio')) {
      if (!dadosConfiguracao.nome_negocio || dadosConfiguracao.nome_negocio.trim().length === 0) {
        erros.push('Nome do negócio é obrigatório');
      }
    }

    // Duração do serviço
    if (dadosConfiguracao.duracao_servico_minutos !== undefined) {
      if (dadosConfiguracao.duracao_servico_minutos < 15 || dadosConfiguracao.duracao_servico_minutos > 480) {
        erros.push('Duração do serviço deve estar entre 15 minutos e 8 horas');
      }
    }

    // Tempo limite para agendar
    if (dadosConfiguracao.tempo_limite_agendar_horas !== undefined) {
      if (dadosConfiguracao.tempo_limite_agendar_horas < 0 || dadosConfiguracao.tempo_limite_agendar_horas > 168) {
        erros.push('Tempo limite para agendar deve estar entre 0 e 168 horas (1 semana)');
      }
    }

    // Tempo limite para cancelar
    if (dadosConfiguracao.tempo_limite_cancelar_horas !== undefined) {
      if (dadosConfiguracao.tempo_limite_cancelar_horas < 0 || dadosConfiguracao.tempo_limite_cancelar_horas > 168) {
        erros.push('Tempo limite para cancelar deve estar entre 0 e 168 horas (1 semana)');
      }
    }

    // Período futuro
    if (dadosConfiguracao.periodo_futuro_dias !== undefined) {
      if (dadosConfiguracao.periodo_futuro_dias < 1 || dadosConfiguracao.periodo_futuro_dias > 730) {
        erros.push('Período futuro deve estar entre 1 e 730 dias (2 anos)');
      }
    }

    if (erros.length > 0) {
      throw new Error(`Dados inválidos: ${erros.join(', ')}`);
    }
  }
}

module.exports = SettingsService;
