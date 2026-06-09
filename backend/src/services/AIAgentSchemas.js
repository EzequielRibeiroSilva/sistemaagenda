const schemas = {
  listar_agendamentos_cliente: {
    type: 'function',
    function: {
      name: 'listar_agendamentos_cliente',
      description: 'Lista os agendamentos futuros (status Aprovado) do cliente. Use esta ferramenta SEMPRE que o cliente perguntar sobre os agendamentos dele (ex: "quais meus horários?", "tenho algo marcado?", "quando é meu próximo atendimento?"). NUNCA diga que não tem acesso a essa informação — ela está no banco de dados e esta ferramenta a consulta.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          telefone_limpo: {
            type: 'string',
            description: 'Telefone do cliente apenas com dígitos (sem formatação). Se não souber, deixe vazio que o sistema usa o telefone da conversa atual.'
          }
        },
        required: []
      }
    }
  },

  validar_agendamento: {
    type: 'function',
    function: {
      name: 'validar_agendamento',
      description: 'Valida se um horário específico ainda está disponível ANTES de criar o agendamento. Use esta ferramenta SEMPRE que o cliente escolher um horário, para confirmar que ele ainda está livre. NÃO cria o agendamento, apenas verifica disponibilidade.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unidade_id: {
            type: 'integer',
            description: 'ID da unidade (local) onde o agendamento será realizado.'
          },
          agente_id: {
            type: 'integer',
            description: 'ID do agente/profissional que atenderá o cliente.'
          },
          data_agendamento: {
            type: 'string',
            description: 'Data do agendamento no formato YYYY-MM-DD (ex: 2026-06-01).'
          },
          hora_inicio: {
            type: 'string',
            description: 'Hora de início do agendamento no formato HH:MM (ex: 14:30).'
          },
          duracao_minutos: {
            type: 'integer',
            description: 'Duração do atendimento em minutos (ex: 30, 45, 60).'
          }
        },
        required: ['unidade_id', 'agente_id', 'data_agendamento', 'hora_inicio', 'duracao_minutos']
      }
    }
  },

  consultar_disponibilidade: {
    type: 'function',
    function: {
      name: 'consultar_disponibilidade',
      description: 'Consulta horários livres de um profissional em uma data específica. Esta é sua ÚNICA fonte confiável de informação sobre agenda. 🚨 GATILHOS OBRIGATÓRIOS - Use esta ferramenta IMEDIATAMENTE quando: 1) Cliente perguntar se profissional trabalha em um dia, 2) Cliente perguntar que dias profissional trabalha, 3) Cliente perguntar horários disponíveis, 4) Cliente mencionar data + profissional, 5) Cliente quiser agendar. ⛔ NUNCA responda perguntas sobre agenda sem chamar esta ferramenta primeiro. ⛔ NUNCA presuma que um profissional trabalha em determinado dia. ⛔ A lista de "Profissionais disponíveis" NÃO significa que trabalham hoje. ✅ Use APÓS o cliente escolher o profissional (não antes). ✅ Se o cliente perguntar exploratoriamente ("trabalha sexta?"), consulte de qualquer forma.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unidade_id: {
            type: 'integer',
            description: 'ID da unidade (local) onde o agendamento será realizado.'
          },
          agente_id: {
            type: 'integer',
            description: 'ID do agente/profissional que atenderá o cliente. OBRIGATÓRIO: Deve ser fornecido SOMENTE após o cliente escolher o profissional.'
          },
          data: {
            type: 'string',
            description: 'Data desejada para consulta no formato YYYY-MM-DD (ex: 2026-06-01).'
          },
          duracao_minutos: {
            type: 'integer',
            description: 'Duração do atendimento em minutos (ex: 30, 45, 60). Usado para calcular o tamanho dos slots.'
          }
        },
        required: ['unidade_id', 'agente_id', 'data', 'duracao_minutos']
      }
    }
  },

  criar_agendamento: {
    type: 'function',
    function: {
      name: 'criar_agendamento',
      description: '🚨 REGRA CRÍTICA: NUNCA chame esta ferramenta sem ter PERGUNTADO e OBTIDO do cliente qual SERVIÇO ele deseja (ex: corte, barba, manicure). O parâmetro "servicos" é OBRIGATÓRIO e NÃO PODE ser vazio. Cria definitivamente um novo agendamento no sistema. ATENÇÃO: Esta ferramenta deve ser chamada APENAS UMA VEZ por agendamento. Use SOMENTE após: 1) Cliente INFORMAR qual serviço quer, 2) Cliente escolher horário, 3) Você chamar validar_agendamento e confirmar disponibilidade, 4) Cliente confirmar EXPLICITAMENTE (dizer "sim", "confirmo", "pode agendar"). NUNCA chame esta ferramenta mais de uma vez para o mesmo horário. NUNCA use para pré-reservar ou validar disponibilidade (para isso use validar_agendamento).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unidade_id: {
            type: 'integer',
            description: 'ID da unidade (local) onde o agendamento será criado.'
          },
          agente_id: {
            type: 'integer',
            description: 'ID do agente/profissional responsável pelo atendimento.'
          },
          data_agendamento: {
            type: 'string',
            description: 'Data do agendamento no formato YYYY-MM-DD (ex: 2026-06-01).'
          },
          hora_inicio: {
            type: 'string',
            description: 'Hora de início do agendamento no formato HH:MM (ex: 14:30).'
          },
          servicos: {
            type: 'array',
            description: '🚨 OBRIGATÓRIO: Lista de IDs de serviços a serem executados neste agendamento. NUNCA envie array vazio. NUNCA envie sem perguntar ao cliente qual serviço ele quer. Exemplos válidos: [1], [2], [1, 3]. SEMPRE pergunte "Qual serviço você gostaria de fazer?" antes de chamar esta ferramenta.',
            items: {
              type: 'integer',
              description: 'ID do serviço.'
            },
            minItems: 1
          },
          cliente_nome: {
            type: 'string',
            description: 'Nome completo do cliente (obrigatório para clientes novos que ainda não estão cadastrados).'
          }
        },
        required: ['unidade_id', 'agente_id', 'data_agendamento', 'hora_inicio', 'servicos']
      }
    }
  },

  cancelar_agendamento: {
    type: 'function',
    function: {
      name: 'cancelar_agendamento',
      description: 'Cancela um agendamento existente. ATENÇÃO (PROTOCOLO DE RETENÇÃO): só use esta ferramenta DEPOIS de (1) perguntar o motivo do cancelamento e (2) oferecer um reagendamento, e SOMENTE se o cliente recusar explicitamente o reagendamento. NUNCA cancele na primeira mensagem. O parâmetro motivo DEVE conter o texto real escrito pelo cliente.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agendamento_id: {
            type: 'integer',
            description: 'O ID numérico único do agendamento que deseja cancelar. Obtenha este ID através da ferramenta listar_agendamentos_cliente, que retorna o campo "agendamento_id" para cada agendamento do cliente.'
          },
          motivo: {
            type: 'string',
            description: 'Motivo do cancelamento (texto livre para registro interno).'
          }
        },
        required: ['agendamento_id', 'motivo']
      }
    }
  },

  notificar_humano: {
    type: 'function',
    function: {
      name: 'notificar_humano',
      description: 'Notifica o administrador da unidade quando o cliente demonstra frustração, raiva ou quando a conversa atinge 3 turnos sem resolução de um problema. Use esta ferramenta como último recurso antes de finalizar a conversa. IMPORTANTE: Após chamar esta ferramenta, finalize a conversa com uma mensagem empática e profissional.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          motivo: {
            type: 'string',
            description: 'Motivo da notificação (ex: "Cliente frustrado com falta de horários", "Problema técnico não resolvido", "Cliente insatisfeito com atendimento").'
          },
          mensagem_cliente: {
            type: 'string',
            description: 'Última mensagem do cliente que gerou a notificação (para contexto do administrador).'
          },
          nivel_urgencia: {
            type: 'string',
            enum: ['baixa', 'media', 'alta'],
            description: 'Nível de urgência da notificação. Use "alta" para casos de cliente muito frustrado ou problema crítico.'
          }
        },
        required: ['motivo', 'nivel_urgencia']
      }
    }
  },

  atualizar_preferencias: {
    type: 'function',
    function: {
      name: 'atualizar_preferencias',
      description: 'Atualiza ou registra preferências do cliente quando ele menciona algo relevante durante a conversa (ex: "Sempre quero agendar com o João", "Não gosto mais de café", "Prefiro horários pela manhã"). Use esta ferramenta para criar memória de longo prazo sobre o cliente. IMPORTANTE: Só use quando o cliente mencionar EXPLICITAMENTE uma preferência nova ou mudança de preferência.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cliente_id: {
            type: 'integer',
            description: 'ID do cliente (obtido do contexto da conversa).'
          },
          profissional_preferido_id: {
            type: 'integer',
            description: 'ID do profissional preferido (se o cliente mencionar preferência por um profissional específico). Deixe null se não houver preferência ou se o cliente não mencionou.'
          },
          observacoes: {
            type: 'string',
            description: 'Observações sobre as preferências do cliente em texto livre. Seja específico e use as palavras do cliente. Exemplos: "Sempre pede café sem açúcar", "Prefere horários pela manhã", "Gosta de corte social", "Não gosta de conversar durante o atendimento".'
          }
        },
        required: ['cliente_id', 'observacoes']
      }
    }
  },

  adicionar_lista_espera: {
    type: 'function',
    function: {
      name: 'adicionar_lista_espera',
      description: '⚠️ PRÉ-REQUISITO OBRIGATÓRIO: Esta ferramenta SÓ pode ser usada quando agente_trabalha_neste_dia === true (profissional TRABALHA no dia mas está LOTADO). ⛔ BLOQUEIO ABSOLUTO: NUNCA use esta ferramenta quando agente_trabalha_neste_dia === false (profissional de FOLGA). Adiciona cliente à lista de espera quando NÃO HÁ horários disponíveis E profissional TRABALHA neste dia. O sistema notificará automaticamente o cliente caso surja vaga por cancelamento. HIERARQUIA: 1) Se profissional não trabalha (false) → Ofereça alternativas, NUNCA lista de espera. 2) Se profissional trabalha E tem slots → Venda os horários, NUNCA lista de espera. 3) Se profissional trabalha E zero slots → AÍ SIM use esta ferramenta.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unidade_id: {
            type: 'integer',
            description: 'ID da unidade onde o cliente deseja agendar.'
          },
          agente_id: {
            type: 'integer',
            description: 'ID do profissional desejado. Se o cliente aceitar qualquer profissional, deixe null.'
          },
          data_desejada: {
            type: 'string',
            description: 'Data desejada para o agendamento no formato YYYY-MM-DD (ex: 2026-06-02).'
          },
          hora_inicio: {
            type: 'string',
            description: 'Horário específico desejado no formato HH:MM (ex: 14:30). Se o cliente aceitar qualquer horário do dia, deixe null.'
          },
          servicos: {
            type: 'array',
            description: 'Lista de IDs de serviços desejados.',
            items: {
              type: 'integer',
              description: 'ID do serviço.'
            },
            minItems: 1
          }
        },
        required: ['unidade_id', 'data_desejada', 'servicos']
      }
    }
  }
};

module.exports = schemas;
