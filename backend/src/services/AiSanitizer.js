'use strict';

/**
 * AiSanitizer.js
 *
 * Classe utilitária de sanitização para prevenção de Prompt Injection.
 * Responsabilidade única: limpar strings dinâmicas antes da injeção no systemPrompt,
 * garantindo que dados externos não comprometam a integridade das instruções da IA.
 *
 * Sprint 1 - Task 1.1: Implementação da Camada de Sanitização
 * Foco: Blindagem contra System Instruction Hijacking e caracteres maliciosos.
 */

class AiSanitizer {
  
  /**
   * Sanitiza nome do assistente virtual (ex: "Stephanie", "João")
   * - Remove caracteres de controle e escape
   * - Limita tamanho máximo para prevenir overflow
   * - Preserva acentos legítimos do português brasileiro
   * 
   * @param {string|null|undefined} nomeAssistente - Nome a ser sanitizado
   * @returns {string} - Nome limpo e seguro
   */
  static sanitizeAssistantName(nomeAssistente) {
    if (!nomeAssistente || typeof nomeAssistente !== 'string') {
      return 'assistente virtual';
    }

    // Remove caracteres de controle, escape e potencialmente perigosos
    let cleaned = nomeAssistente
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Caracteres de controle
      .replace(/[`"'\\]/g, '')             // Delimitadores perigosos
      .replace(/\n|\r|\t/g, '')            // Quebras de linha e tabs
      .replace(/\${[^}]*}/g, '')           // Template literals
      .replace(/<[^>]*>/g, '')             // Tags HTML/XML
      .trim();

    // Trunca com segurança (máx 50 caracteres)
    if (cleaned.length > 50) {
      cleaned = cleaned.substring(0, 47) + '...';
    }

    // Se ficou vazio após limpeza, retorna fallback
    return cleaned || 'assistente virtual';
  }

  /**
   * Sanitiza nome da unidade/estabelecimento
   * - Permite caracteres comerciais legítimos (&, -, etc.)
   * - Remove tentativas de injection
   * - Mantém formatação básica de nomes de empresa
   * 
   * @param {string|null|undefined} nomeUnidade - Nome da unidade
   * @returns {string} - Nome limpo
   */
  static sanitizeUnitName(nomeUnidade) {
    if (!nomeUnidade || typeof nomeUnidade !== 'string') {
      return 'nosso estabelecimento';
    }

    let cleaned = nomeUnidade
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Caracteres de controle
      .replace(/[`"'\\]/g, '')             // Delimitadores perigosos  
      .replace(/\n|\r|\t/g, ' ')           // Quebras → espaços
      .replace(/\${[^}]*}/g, '')           // Template literals
      .replace(/<[^>]*>/g, '')             // Tags HTML/XML
      .replace(/\s+/g, ' ')                // Múltiplos espaços → único
      .trim();

    // Trunca para nome comercial (máx 100 caracteres)
    if (cleaned.length > 100) {
      cleaned = cleaned.substring(0, 97) + '...';
    }

    return cleaned || 'nosso estabelecimento';
  }

  /**
   * Sanitiza saudação personalizada do cliente
   * - Permite emojis básicos e pontuação
   * - Remove comandos e instruções maliciosas
   * - Preserva tom natural da conversa
   * 
   * @param {string|null|undefined} saudacao - Saudação personalizada
   * @returns {string} - Saudação limpa ou string vazia
   */
  static sanitizeGreeting(saudacao) {
    if (!saudacao || typeof saudacao !== 'string') {
      return '';
    }

    let cleaned = saudacao
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Caracteres de controle
      .replace(/[`"'\\]/g, '')             // Delimitadores perigosos
      .replace(/\${[^}]*}/g, '')           // Template literals
      .replace(/<[^>]*>/g, '')             // Tags HTML/XML
      .replace(/\n+/g, ' ')                // Múltiplas quebras → espaço
      .replace(/\t+/g, ' ')                // Tabs → espaços
      .replace(/\s+/g, ' ')                // Normaliza espaços
      .trim();

    // Trunca saudações muito longas (máx 200 caracteres)
    if (cleaned.length > 200) {
      cleaned = cleaned.substring(0, 197) + '...';
    }

    return cleaned;
  }

  /**
   * Sanitiza preferências/observações do cliente
   * - Permite texto descritivo mais livre
   * - Remove tentativas claras de prompt injection
   * - Mantém informação útil para personalização
   * 
   * @param {string|null|undefined} preferencias - Texto das preferências
   * @returns {string} - Preferências limpas ou string vazia
   */
  static sanitizePreferences(preferencias) {
    if (!preferencias || typeof preferencias !== 'string') {
      return '';
    }

    let cleaned = preferencias
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Caracteres de controle
      .replace(/[`\\]/g, '')               // Backticks e backslashes
      .replace(/\${[^}]*}/g, '')           // Template literals
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Scripts
      .replace(/<[^>]*>/g, '')             // Tags HTML/XML
      .replace(/\n+/g, ' ')                // Quebras → espaços
      .replace(/\t+/g, ' ')                // Tabs → espaços
      .replace(/\s+/g, ' ')                // Normaliza espaços
      .trim();

    // Trunca preferências muito longas (máx 500 caracteres)
    if (cleaned.length > 500) {
      cleaned = cleaned.substring(0, 497) + '...';
    }

    return cleaned;
  }

  /**
   * Sanitiza tom de voz/personalidade da IA
   * - Permite apenas valores conhecidos e seguros
   * - Fallback para tom padrão em caso de valor inválido
   * - Previne injection via configuração de personalidade
   * 
   * @param {string|null|undefined} tomDeVoz - Tom configurado
   * @returns {string} - Tom validado
   */
  static sanitizeTone(tomDeVoz) {
    if (!tomDeVoz || typeof tomDeVoz !== 'string') {
      return 'Profissional';
    }

    // Lista de tons permitidos (whitelist approach)
    const tonesPermitidos = [
      'Formal',
      'Profissional', 
      'Descontraído',
      'Jovem',
      'Caloroso',
      'Amigável',
      'Técnico',
      'Casual'
    ];

    const cleaned = tomDeVoz.trim();
    
    // Se o tom está na whitelist, usa ele
    if (tonesPermitidos.includes(cleaned)) {
      return cleaned;
    }

    // Se não está na lista, usa tom padrão
    return 'Profissional';
  }

  /**
   * Sanitiza ID numérico (unidade_id, cliente_id, etc.)
   * - Garante que é um número inteiro positivo
   * - Previne injection via parâmetros numéricos
   * 
   * @param {any} id - ID a ser validado
   * @returns {number|null} - ID sanitizado ou null
   */
  static sanitizeId(id) {
    const parsed = parseInt(id, 10);
    
    if (isNaN(parsed) || parsed <= 0) {
      return null;
    }
    
    // Evita IDs absurdamente grandes (potencial DoS)
    if (parsed > 2147483647) { // MySQL INT max
      return null;
    }
    
    return parsed;
  }

  /**
   * Sanitiza texto genérico para uso em prompts
   * - Sanitização conservadora para textos livres
   * - Remove apenas o que é claramente perigoso
   * - Preserva máximo de informação útil
   * 
   * @param {string|null|undefined} texto - Texto a ser sanitizado
   * @param {number} maxLength - Tamanho máximo (default: 1000)
   * @returns {string} - Texto limpo
   */
  static sanitizeGenericText(texto, maxLength = 1000) {
    if (!texto || typeof texto !== 'string') {
      return '';
    }

    let cleaned = texto
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Caracteres de controle
      .replace(/[`\\]/g, '')               // Backticks e backslashes
      .replace(/\${[^}]*}/g, '')           // Template literals
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Scripts
      .replace(/\n+/g, ' ')                // Quebras → espaços
      .replace(/\t+/g, ' ')                // Tabs → espaços  
      .replace(/\s+/g, ' ')                // Normaliza espaços
      .trim();

    // Trunca se necessário
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength - 3) + '...';
    }

    return cleaned;
  }

  /**
   * Sanitiza array de strings (ex: lista de serviços, profissionais)
   * - Aplica sanitização em cada item do array
   * - Remove itens que ficaram vazios após sanitização
   * - Garante estrutura consistente
   * 
   * @param {Array|null|undefined} array - Array a ser sanitizado
   * @param {Function} sanitizer - Função de sanitização para cada item
   * @returns {Array} - Array limpo
   */
  static sanitizeArray(array, sanitizer = this.sanitizeGenericText) {
    if (!Array.isArray(array)) {
      return [];
    }

    return array
      .map(item => sanitizer.call(this, item))
      .filter(item => item && item.length > 0)
      .slice(0, 50); // Máximo 50 itens para evitar overflow
  }

  /**
   * Método principal de sanitização para contexto completo do systemPrompt
   * - Aplica todas as sanitizações necessárias
   * - Retorna objeto limpo e seguro para injeção no prompt
   * 
   * @param {Object} contexto - Objeto com todos os dados dinâmicos
   * @returns {Object} - Contexto sanitizado
   */
  static sanitizePromptContext(contexto = {}) {
    return {
      nomeAssistente: this.sanitizeAssistantName(contexto.nomeAssistente),
      nomeUnidade: this.sanitizeUnitName(contexto.nomeUnidade),
      clienteSaudacao: this.sanitizeGreeting(contexto.clienteSaudacao),
      preferenciasTexto: this.sanitizePreferences(contexto.preferenciasTexto),
      instrucaoTom: this.sanitizeGenericText(contexto.instrucaoTom, 300),
      saudacaoPersonalizada: this.sanitizeGreeting(contexto.saudacaoPersonalizada),
      tomDeVoz: this.sanitizeTone(contexto.tomDeVoz),
      unidadeId: this.sanitizeId(contexto.unidadeId),
      clienteId: this.sanitizeId(contexto.clienteId),
      clienteNome: this.sanitizeGenericText(contexto.clienteNome, 100),
      dataAtual: this.sanitizeGenericText(contexto.dataAtual, 50),
      agentesTexto: this.sanitizeGenericText(contexto.agentesTexto, 2000),
      servicosTexto: this.sanitizeGenericText(contexto.servicosTexto, 2000)
    };
  }
}

module.exports = AiSanitizer;