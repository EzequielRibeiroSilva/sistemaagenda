const schemas = {
  listar_agendamentos_cliente: {
    type: 'function',
    function: {
      name: 'listar_agendamentos_cliente',
      description: 'List client approved future bookings. Trigger when client asks about their appointments/schedule.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          telefone_limpo: {
            type: 'string',
            description: 'Client phone digits only. Optional; omit to use current chat phone.'
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
      description: 'Check if a specific slot is still free BEFORE booking. No booking side effects.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unidade_id: {
            type: 'integer',
            description: 'Unit/location id.'
          },
          agente_id: {
            type: 'integer',
            description: 'Agent/professional id.'
          },
          data_agendamento: {
            type: 'string',
            description: 'Date YYYY-MM-DD.'
          },
          hora_inicio: {
            type: 'string',
            description: 'Start time HH:MM.'
          },
          duracao_minutos: {
            type: 'integer',
            description: 'Duration in minutes.'
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
      description: 'Get free slots for an agent on a date. Use for ANY availability/day-of-week questions. Never guess schedule.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unidade_id: {
            type: 'integer',
            description: 'Unit/location id.'
          },
          agente_id: {
            type: 'integer',
            description: 'Agent/professional id (after client chooses the agent).'
          },
          data: {
            type: 'string',
            description: 'Date YYYY-MM-DD.'
          },
          duracao_minutos: {
            type: 'integer',
            description: 'Service duration (minutes).'
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
      description: 'Create booking (final). Preconditions: client chose service(s) and slot; run validar_agendamento; get explicit confirmation. Call once per booking. servicos must be non-empty.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unidade_id: {
            type: 'integer',
            description: 'Unit/location id.'
          },
          agente_id: {
            type: 'integer',
            description: 'Agent/professional id.'
          },
          data_agendamento: {
            type: 'string',
            description: 'Date YYYY-MM-DD.'
          },
          hora_inicio: {
            type: 'string',
            description: 'Start time HH:MM.'
          },
          servicos: {
            type: 'array',
            description: 'Required. Array of service ids. Must have >=1 item (never empty).',
            items: {
              type: 'integer',
              description: 'Service id.'
            },
            minItems: 1
          },
          cliente_nome: {
            type: 'string',
            description: 'Full name for new client registration (only if needed).'
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
      description: 'Cancel booking. Retention: ask reason, offer reschedule, cancel only if client insists. Recurrence: ask single vs all future (cancelar_serie). If PIX deposit was paid: warn refund not automatic; handled by business.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agendamento_id: {
            type: 'integer',
            description: 'Booking id (use listar_agendamentos_cliente to fetch).'
          },
          motivo: {
            type: 'string',
            description: 'Client provided reason. Use their exact words (no generic text).'
          },
          cancelar_serie: {
            type: 'boolean',
            description: 'If true: cancel all future in same recurrence group. If false/omit: cancel only this booking. Ask client which one.',
            default: false
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
      description: 'Escalate to human admin (anger/frustration or stuck). After calling, reply briefly with empathy and end.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          motivo: {
            type: 'string',
            description: 'Reason summary.'
          },
          mensagem_cliente: {
            type: 'string',
            description: 'Client last message (verbatim) for context.'
          },
          nivel_urgencia: {
            type: 'string',
            enum: ['baixa', 'media', 'alta'],
            description: 'Urgency level.'
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
      description: 'Save/update client preferences when client explicitly states a preference (new/change).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cliente_id: {
            type: 'integer',
            description: 'Client id.'
          },
          profissional_preferido_id: {
            type: 'integer',
            description: 'Preferred agent id if mentioned; null otherwise.'
          },
          observacoes: {
            type: 'string',
            description: 'Free-text preference notes. Be specific; use client wording.'
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
      description: 'Add client to waitlist ONLY when agent_trabalha_neste_dia=true AND slots==0. Never use when agent_trabalha_neste_dia=false.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unidade_id: {
            type: 'integer',
            description: 'Unit/location id.'
          },
          agente_id: {
            type: 'integer',
            description: 'Desired agent id. Null if any agent is ok.'
          },
          data_desejada: {
            type: 'string',
            description: 'Desired date YYYY-MM-DD.'
          },
          hora_inicio: {
            type: 'string',
            description: 'Desired start time HH:MM. Null if any time is ok.'
          },
          servicos: {
            type: 'array',
            description: 'Service ids.',
            items: {
              type: 'integer',
              description: 'Service id.'
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
