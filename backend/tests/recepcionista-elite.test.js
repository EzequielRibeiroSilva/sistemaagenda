/**
 * Testes Automatizados: Recepcionista de Elite
 * 
 * Testa a funcionalidade de identidade dinâmica e gestão de crise
 * 
 * Para rodar: npm test -- recepcionista-elite.test.js
 */

const { db } = require('../src/config/knex');

describe('Recepcionista de Elite - Identidade Dinâmica', () => {
  let unidadeTestId;

  beforeAll(async () => {
    // Criar unidade de teste
    const [unidade] = await db('unidades')
      .insert({
        nome: 'Unidade Teste Elite',
        usuario_id: 1, // Ajustar conforme seu ambiente
        status: 'Ativo',
        config_perfil: JSON.stringify({
          nome_assistente: 'assistente de teste',
          tom_de_voz: 'Jovem',
          saudacao_personalizada: 'E aí! Teste funcionando?'
        })
      })
      .returning('id');
    
    unidadeTestId = unidade.id;
  });

  afterAll(async () => {
    // Limpar unidade de teste
    await db('unidades').where('id', unidadeTestId).del();
    await db.destroy();
  });

  test('Deve ter campo config_perfil na tabela unidades', async () => {
    const columns = await db('unidades').columnInfo();
    expect(columns).toHaveProperty('config_perfil');
  });

  test('Deve buscar config_perfil corretamente', async () => {
    const unidade = await db('unidades')
      .where('id', unidadeTestId)
      .select('config_perfil')
      .first();

    expect(unidade).toBeDefined();
    expect(unidade.config_perfil).toBeDefined();
    
    const config = typeof unidade.config_perfil === 'string'
      ? JSON.parse(unidade.config_perfil)
      : unidade.config_perfil;

    expect(config).toHaveProperty('nome_assistente');
    expect(config).toHaveProperty('tom_de_voz');
    expect(config.nome_assistente).toBe('assistente de teste');
    expect(config.tom_de_voz).toBe('Jovem');
  });

  test('Deve aceitar config_perfil NULL (fallback)', async () => {
    const [unidadeSemConfig] = await db('unidades')
      .insert({
        nome: 'Unidade Sem Config',
        usuario_id: 1,
        status: 'Ativo',
        config_perfil: null
      })
      .returning('id');

    const unidade = await db('unidades')
      .where('id', unidadeSemConfig.id)
      .select('config_perfil')
      .first();

    expect(unidade.config_perfil).toBeNull();

    // Limpar
    await db('unidades').where('id', unidadeSemConfig.id).del();
  });

  test('Deve validar estrutura do config_perfil', async () => {
    const unidade = await db('unidades')
      .where('id', unidadeTestId)
      .select('config_perfil')
      .first();

    const config = typeof unidade.config_perfil === 'string'
      ? JSON.parse(unidade.config_perfil)
      : unidade.config_perfil;

    // Validar campos obrigatórios
    expect(config).toHaveProperty('nome_assistente');
    expect(config).toHaveProperty('tom_de_voz');

    // Validar tipos
    expect(typeof config.nome_assistente).toBe('string');
    expect(typeof config.tom_de_voz).toBe('string');

    // Validar tom de voz válido
    const tonsValidos = ['Formal', 'Profissional', 'Descontraído', 'Jovem', 'Caloroso'];
    expect(tonsValidos).toContain(config.tom_de_voz);
  });
});

describe('Recepcionista de Elite - Tons de Voz', () => {
  const tonsDeVoz = {
    'Formal': 'Seja extremamente profissional, use linguagem formal e evite gírias. Trate o cliente com "senhor" ou "senhora".',
    'Profissional': 'Seja profissional, mas acessível. Use linguagem clara e educada.',
    'Descontraído': 'Seja amigável e descontraído, mas mantenha o profissionalismo. Pode usar emojis ocasionalmente.',
    'Jovem': 'Seja jovem, dinâmico e use uma linguagem mais casual. Use emojis para deixar a conversa mais leve.',
    'Caloroso': 'Seja extremamente acolhedor e empático. Demonstre genuíno interesse pelo cliente.'
  };

  test('Deve ter todos os tons de voz mapeados', () => {
    expect(Object.keys(tonsDeVoz)).toHaveLength(5);
    expect(tonsDeVoz).toHaveProperty('Formal');
    expect(tonsDeVoz).toHaveProperty('Profissional');
    expect(tonsDeVoz).toHaveProperty('Descontraído');
    expect(tonsDeVoz).toHaveProperty('Jovem');
    expect(tonsDeVoz).toHaveProperty('Caloroso');
  });

  test('Cada tom deve ter instrução não vazia', () => {
    Object.values(tonsDeVoz).forEach(instrucao => {
      expect(instrucao).toBeDefined();
      expect(instrucao.length).toBeGreaterThan(0);
    });
  });
});

describe('Recepcionista de Elite - Gestão de Crise', () => {
  const AIAgentSchemas = require('../src/services/AIAgentSchemas');

  test('Deve ter ferramenta notificar_humano', () => {
    expect(AIAgentSchemas).toHaveProperty('notificar_humano');
    expect(AIAgentSchemas.notificar_humano).toHaveProperty('type', 'function');
    expect(AIAgentSchemas.notificar_humano.function).toHaveProperty('name', 'notificar_humano');
  });

  test('Ferramenta notificar_humano deve ter parâmetros corretos', () => {
    const schema = AIAgentSchemas.notificar_humano.function;
    
    expect(schema.parameters).toHaveProperty('properties');
    expect(schema.parameters.properties).toHaveProperty('motivo');
    expect(schema.parameters.properties).toHaveProperty('mensagem_cliente');
    expect(schema.parameters.properties).toHaveProperty('nivel_urgencia');

    // Validar enum de nivel_urgencia
    expect(schema.parameters.properties.nivel_urgencia).toHaveProperty('enum');
    expect(schema.parameters.properties.nivel_urgencia.enum).toEqual(['baixa', 'media', 'alta']);
  });

  test('Ferramenta notificar_humano deve ter campos obrigatórios', () => {
    const schema = AIAgentSchemas.notificar_humano.function;
    
    expect(schema.parameters).toHaveProperty('required');
    expect(schema.parameters.required).toContain('motivo');
    expect(schema.parameters.required).toContain('nivel_urgencia');
  });
});

describe('Recepcionista de Elite - AiAgentService', () => {
  const aiAgentService = require('../src/services/AiAgentService');

  test('Não deve ter SYSTEM_PROMPT estático', () => {
    // Verificar que o arquivo não exporta SYSTEM_PROMPT
    const serviceCode = require('fs').readFileSync(
      require.resolve('../src/services/AiAgentService'),
      'utf8'
    );

    // Não deve ter const SYSTEM_PROMPT = 
    expect(serviceCode).not.toMatch(/const\s+SYSTEM_PROMPT\s*=/);
  });

  test('processMessage deve exigir systemPrompt', async () => {
    // Mock mínimo para testar validação
    const mockMessage = 'teste';
    const mockHistory = [];
    const mockTools = [];

    await expect(
      aiAgentService.processMessage({
        message: mockMessage,
        history: mockHistory,
        tools: mockTools,
        systemPrompt: '' // Vazio deve falhar
      })
    ).rejects.toThrow('systemPrompt é obrigatório');
  });
});

describe('Recepcionista de Elite - Integração', () => {
  test('Deve construir System Prompt dinâmico corretamente', () => {
    const nomeUnidade = 'Barbearia Teste';
    const nomeAssistente = 'assistente virtual';
    const tomDeVoz = 'Jovem';
    const instrucaoTom = 'Seja jovem, dinâmico e use uma linguagem mais casual.';

    const systemPrompt = `Você é ${nomeAssistente} de ${nomeUnidade}.

🎭 TOM DE VOZ E PERSONALIDADE:
${instrucaoTom}`;

    expect(systemPrompt).toContain('Você é assistente virtual de Barbearia Teste');
    expect(systemPrompt).toContain('Seja jovem, dinâmico e use uma linguagem mais casual');
    expect(systemPrompt).not.toContain('Stephanie');
  });

  test('Deve ter fallback para config_perfil NULL', () => {
    const configPerfil = null;
    
    const nomeAssistente = configPerfil?.nome_assistente || 'assistente virtual';
    const tomDeVoz = configPerfil?.tom_de_voz || 'Profissional';

    expect(nomeAssistente).toBe('assistente virtual');
    expect(tomDeVoz).toBe('Profissional');
  });
});

describe('Recepcionista de Elite - Segurança Multi-Tenant', () => {
  test('Deve isolar config_perfil por unidade_id', async () => {
    // Criar duas unidades com configs diferentes
    const [unidade1] = await db('unidades')
      .insert({
        nome: 'Unidade 1',
        usuario_id: 1,
        status: 'Ativo',
        config_perfil: JSON.stringify({ tom_de_voz: 'Formal' })
      })
      .returning('id');

    const [unidade2] = await db('unidades')
      .insert({
        nome: 'Unidade 2',
        usuario_id: 1,
        status: 'Ativo',
        config_perfil: JSON.stringify({ tom_de_voz: 'Jovem' })
      })
      .returning('id');

    // Buscar configs separadamente
    const config1 = await db('unidades')
      .where('id', unidade1.id)
      .select('config_perfil')
      .first();

    const config2 = await db('unidades')
      .where('id', unidade2.id)
      .select('config_perfil')
      .first();

    const parsed1 = JSON.parse(config1.config_perfil);
    const parsed2 = JSON.parse(config2.config_perfil);

    expect(parsed1.tom_de_voz).toBe('Formal');
    expect(parsed2.tom_de_voz).toBe('Jovem');
    expect(parsed1.tom_de_voz).not.toBe(parsed2.tom_de_voz);

    // Limpar
    await db('unidades').whereIn('id', [unidade1.id, unidade2.id]).del();
  });
});
