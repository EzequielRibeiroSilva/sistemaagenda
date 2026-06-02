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
      description: 'Consulta horários livres para um agente em uma data específica. IMPORTANTE: Só use esta ferramenta APÓS o cliente escolher o profissional desejado.',
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
      description: 'Cria definitivamente um novo agendamento no sistema. ATENÇÃO: Esta ferramenta deve ser chamada APENAS UMA VEZ por agendamento. Use SOMENTE após: 1) Cliente escolher horário, 2) Você chamar validar_agendamento e confirmar disponibilidade, 3) Cliente confirmar EXPLICITAMENTE (dizer "sim", "confirmo", "pode agendar"). NUNCA chame esta ferramenta mais de uma vez para o mesmo horário. NUNCA use para pré-reservar ou validar disponibilidade (para isso use validar_agendamento).',
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
            description: 'Lista de IDs de serviços a serem executados neste agendamento.',
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
      description: 'Adiciona o cliente à lista de espera quando não há horários disponíveis. O sistema notificará automaticamente o cliente caso surja uma vaga por cancelamento. Use esta ferramenta SEMPRE que consultar_disponibilidade retornar vazio (sem horários disponíveis). Seja proativo: ofereça a lista de espera como solução.',
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
