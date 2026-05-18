const BaseController = require('./BaseController');
const Servico = require('../models/Servico');
const logger = require('../utils/logger');

class ServicoController extends BaseController {
  constructor() {
    super(new Servico());
  }

  async insumosIndex(req, res) {
    try {
      const { id } = req.params;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;
      let usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (userRole === 'AGENTE' && userAgenteId) {
        const agente = await this.model.db('agentes')
          .where('id', userAgenteId)
          .select('unidade_id')
          .first();

        if (agente?.unidade_id) {
          const unidade = await this.model.db('unidades')
            .where('id', agente.unidade_id)
            .select('usuario_id')
            .first();

          if (unidade?.usuario_id) {
            usuarioId = unidade.usuario_id;
          }
        }
      }

      const servico = await this.model.db('servicos')
        .where({ id: parseInt(id, 10), usuario_id: usuarioId })
        .whereNull('deleted_at')
        .select('id')
        .first();

      if (!servico) {
        return res.status(404).json({
          success: false,
          error: 'Serviço não encontrado ou acesso negado'
        });
      }

      const insumos = await this.model.db('servico_insumos as si')
        .join('produtos as p', 'si.produto_id', 'p.id')
        .where('si.servico_id', parseInt(id, 10))
        .where('p.usuario_id', usuarioId)
        .select(
          'si.id',
          'si.servico_id',
          'si.produto_id',
          'si.quantidade',
          'si.created_at',
          'p.nome as produto_nome',
          'p.unidade_medida as produto_unidade_medida'
        )
        .orderBy('si.id', 'asc');

      return res.status(200).json({
        success: true,
        data: insumos,
        message: 'Insumos carregados com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao buscar insumos do serviço:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  async insumosUpsert(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const { insumos } = req.body;
      if (!Array.isArray(insumos)) {
        return res.status(400).json({
          success: false,
          error: 'Payload inválido',
          message: 'insumos deve ser um array'
        });
      }

      const servico = await this.model.db('servicos')
        .where({ id: parseInt(id, 10), usuario_id: usuarioId })
        .whereNull('deleted_at')
        .select('id')
        .first();

      if (!servico) {
        return res.status(404).json({
          success: false,
          error: 'Serviço não encontrado ou acesso negado'
        });
      }

      const normalized = insumos.map((i) => ({
        produto_id: i?.produto_id,
        quantidade: i?.quantidade
      }));

      for (const item of normalized) {
        const produtoId = Number(item.produto_id);
        const qtd = Number(item.quantidade);

        if (!Number.isFinite(produtoId) || produtoId <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Insumo inválido',
            message: 'produto_id inválido'
          });
        }

        if (!Number.isFinite(qtd) || qtd <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Insumo inválido',
            message: 'quantidade deve ser maior que zero'
          });
        }
      }

      const produtoIds = [...new Set(normalized.map((i) => Number(i.produto_id)))];

      if (produtoIds.length > 0) {
        const produtosValidos = await this.model.db('produtos')
          .whereIn('id', produtoIds)
          .where('usuario_id', usuarioId)
          .select('id', 'tipo_item');

        if (produtosValidos.length !== produtoIds.length) {
          return res.status(400).json({
            success: false,
            error: 'Produtos inválidos',
            message: 'Um ou mais produtos não existem ou não pertencem ao usuário'
          });
        }

        const produtoVenda = produtosValidos.find((p) => String(p.tipo_item || '').toUpperCase() === 'VENDA');
        if (produtoVenda) {
          return res.status(400).json({
            success: false,
            error: 'Insumo inválido',
            message: 'Não é permitido adicionar como insumo um produto do tipo VENDA. Altere o produto para CONSUMO ou AMBOS.'
          });
        }
      }

      await this.model.db.transaction(async (trx) => {
        await trx('servico_insumos')
          .where('servico_id', parseInt(id, 10))
          .del();

        if (normalized.length > 0) {
          const rows = normalized.map((i) => ({
            servico_id: parseInt(id, 10),
            produto_id: Number(i.produto_id),
            quantidade: Number(Number(i.quantidade).toFixed(3)),
            created_at: new Date()
          }));

          await trx('servico_insumos').insert(rows);
        }
      });

      const updated = await this.model.db('servico_insumos as si')
        .join('produtos as p', 'si.produto_id', 'p.id')
        .where('si.servico_id', parseInt(id, 10))
        .where('p.usuario_id', usuarioId)
        .select(
          'si.id',
          'si.servico_id',
          'si.produto_id',
          'si.quantidade',
          'si.created_at',
          'p.nome as produto_nome',
          'p.unidade_medida as produto_unidade_medida'
        )
        .orderBy('si.id', 'asc');

      return res.status(200).json({
        success: true,
        data: updated,
        message: 'Insumos atualizados com sucesso'
      });
    } catch (error) {
      if (error && error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'Dados duplicados',
          message: 'Já existe um insumo com este produto para o serviço'
        });
      }

      logger.error('Erro ao atualizar insumos do serviço:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/servicos/list - Listagem leve de serviços para formulários
  async list(req, res) {
    try {
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }



      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, buscar serviços da unidade onde ele trabalha
      if (userRole === 'AGENTE' && userAgenteId) {
        const agente = await this.model.db('agentes')
          .where('id', userAgenteId)
          .select('unidade_id')
          .first();

        if (agente && agente.unidade_id) {
          logger.log(`✅ [ServicoController.list] AGENTE detectado. Buscando serviços da unidade_id=${agente.unidade_id}`);

          // Buscar o usuario_id da unidade para filtrar os serviços
          const unidade = await this.model.db('unidades')
            .where('id', agente.unidade_id)
            .select('usuario_id')
            .first();

          if (unidade && unidade.usuario_id) {
            usuarioId = unidade.usuario_id;
            logger.log(`✅ [ServicoController.list] Usando usuario_id=${usuarioId} da unidade para buscar serviços`);
          } else {
            logger.log(`❌ [ServicoController.list] ERRO: Unidade não encontrada ou sem usuario_id!`);
            return res.status(200).json({
              success: true,
              data: [],
              message: 'Nenhum serviço encontrado'
            });
          }
        } else {
          return res.status(200).json({
            success: true,
            data: [],
            message: 'Nenhum serviço encontrado'
          });
        }
      }

      // Busca otimizada apenas com id e nome
      const servicos = await this.model.findActiveByUsuario(usuarioId);

      // Formatar dados mínimos para formulários
      const servicosLeves = servicos.map(servico => ({
        id: servico.id,
        nome: servico.nome,
        preco: servico.preco,
        duracao_minutos: servico.duracao_minutos || 0,
        exige_sinal: Boolean(servico.exige_sinal),
        valor_sinal: servico.valor_sinal
      }));

      return res.status(200).json({
        success: true,
        data: servicosLeves,
        message: 'Lista de serviços carregada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [ServicoController.list] Erro ao carregar lista de serviços:', error);

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao carregar lista de serviços',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET /api/servicos - Buscar serviços do usuário logado
  // ✅ CORREÇÃO: ADMIN e AGENTE podem ver todos os serviços da empresa
  async index(req, res) {
    try {
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      logger.log(`🔍 [ServicoController] index - INÍCIO`);
      logger.log(`   Role: ${userRole}`);
      logger.log(`   UsuarioId (req.user.id): ${usuarioId}`);
      logger.log(`   AgenteId (req.user.agente_id): ${userAgenteId}`);

      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, retornar serviços da unidade onde ele trabalha
      if (userRole === 'AGENTE' && userAgenteId) {
        logger.log(`🔍 [ServicoController] Condição AGENTE detectada. Buscando agente_id=${userAgenteId}...`);
        const Agente = require('../models/Agente');
        const agenteModel = new Agente();
        const agente = await agenteModel.findById(userAgenteId);
        logger.log(`🔍 [ServicoController] Agente encontrado:`, agente ? { id: agente.id, usuario_id: agente.usuario_id, nome: agente.nome, unidade_id: agente.unidade_id } : null);

        if (agente && agente.unidade_id) {
          // ✅ NOVA LÓGICA: Para AGENTE, buscar serviços da unidade onde ele trabalha
          logger.log(`✅ [ServicoController] AGENTE detectado. Buscando serviços da unidade_id=${agente.unidade_id}`);

          // Buscar o usuario_id da unidade para filtrar os serviços
          const unidade = await this.model.db('unidades')
            .where('id', agente.unidade_id)
            .select('usuario_id')
            .first();

          if (unidade && unidade.usuario_id) {
            usuarioId = unidade.usuario_id;
            logger.log(`✅ [ServicoController] Usando usuario_id=${usuarioId} da unidade para buscar serviços`);
          } else {
            logger.log(`❌ [ServicoController] ERRO: Unidade não encontrada ou sem usuario_id!`);
            return res.json([]);
          }
        } else {
          logger.log(`❌ [ServicoController] ERRO: Agente não encontrado ou sem unidade_id!`);
          return res.json([]);
        }
      } else {
        logger.log(`🔍 [ServicoController] Não é AGENTE ou agente_id ausente. Usando usuario_id=${usuarioId} diretamente.`);
      }

      const { page, limit, status, categoria_id, agente_id, stats } = req.query;

      let data;

      if (stats === 'true') {
        data = await this.model.findWithStats(usuarioId);
      } else if (agente_id) {
        // ✅ Multi-tenant safety: ADMIN nunca pode consultar serviços de outro tenant via agente_id
        if (userRole === 'MASTER') {
          data = await this.model.findByAgente(parseInt(agente_id));
        } else {
          data = await this.model.findByAgente(parseInt(agente_id), usuarioId);
        }
      } else if (categoria_id) {
        data = await this.model.findByCategoria(parseInt(categoria_id), usuarioId);
      } else if (status === 'Ativo') {
        data = await this.model.findActiveByUsuario(usuarioId);
      } else if (page && limit) {
        const filters = { usuario_id: usuarioId };
        if (status) filters.status = status;

        const result = await this.model.findWithPagination(
          parseInt(page),
          parseInt(limit),
          filters
        );
        return res.json(result);
      } else {
        // Buscar serviços com associações completas para listagem
        logger.log(`🔍 [ServicoController] Chamando findByUsuarioWithAssociations(${usuarioId})...`);
        data = await this.model.findByUsuarioWithAssociations(usuarioId);
      }

      logger.log(`✅ [ServicoController] Encontrados ${data.length} serviços para usuario_id ${usuarioId}`);
      if (data.length > 0) {
        logger.log(`   Serviços IDs: ${data.map(s => s.id).join(', ')}`);
      }

      return res.status(200).json({
        success: true,
        data,
        message: `Serviços carregados com sucesso (${data.length} serviços)`
      });
    } catch (error) {
      logger.error('[ServicoController] Erro ao buscar serviços:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/servicos/:id - Buscar serviço específico com associações
  async show(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      logger.log(`[ServicoController] Buscando serviço ${id} para usuário ${usuarioId}`);

      const servico = await this.model.findByIdComplete(id);

      if (!servico) {
        return res.status(404).json({
          success: false,
          message: 'Serviço não encontrado'
        });
      }

      // Verificar se o serviço pertence ao usuário
      if (servico.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }

      logger.log(`[ServicoController] Serviço encontrado: ${servico.nome}`);

      return res.status(200).json({
        success: true,
        data: servico,
        message: 'Serviço carregado com sucesso'
      });
    } catch (error) {
      logger.error('[ServicoController] Erro ao buscar serviço:', error);

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao buscar serviço',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // POST /api/servicos - Criar novo serviço
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const {
        nome,
        descricao,
        duracao_minutos,
        preco,
        exige_sinal,
        valor_sinal,
        comissao_percentual,
        status,
        categoria_id,
        convite_retorno_ativo,
        convite_retorno_dias,
        agentes_ids,
        extras_ids,
        insumos
      } = req.body;

      // Validações básicas
      if (!nome || !nome.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Nome é obrigatório'
        });
      }

      if (preco === undefined || preco === null || Number.isNaN(Number(preco)) || Number(preco) < 0) {
        return res.status(400).json({
          success: false,
          error: 'Preço deve ser maior ou igual a zero'
        });
      }

      const exigeSinalFinal = Boolean(exige_sinal);
      const precoNumero = Number(preco);
      const valorSinalNumero = valor_sinal !== undefined && valor_sinal !== null ? Number(valor_sinal) : null;

      if (exigeSinalFinal) {
        if (valorSinalNumero === null || Number.isNaN(valorSinalNumero)) {
          return res.status(400).json({
            success: false,
            error: 'Valor do sinal obrigatório',
            message: 'Para serviços com exige_sinal=true, informe valor_sinal'
          });
        }

        if (!Number.isFinite(valorSinalNumero) || valorSinalNumero <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Valor do sinal inválido',
            message: 'valor_sinal deve ser maior que zero'
          });
        }

        if (valorSinalNumero > precoNumero) {
          return res.status(400).json({
            success: false,
            error: 'Valor do sinal inválido',
            message: 'valor_sinal não pode ser maior do que o preço do serviço'
          });
        }
      }

      if (duracao_minutos === undefined || duracao_minutos === null || Number.isNaN(Number(duracao_minutos)) || Number(duracao_minutos) < 0) {
        return res.status(400).json({
          success: false,
          error: 'Duração deve ser maior ou igual a zero'
        });
      }

      if (comissao_percentual !== undefined && comissao_percentual !== null) {
        const comissaoNumero = Number(comissao_percentual);
        if (Number.isNaN(comissaoNumero) || comissaoNumero < 0 || comissaoNumero > 100) {
          return res.status(400).json({
            success: false,
            error: 'Comissão inválida',
            message: 'Comissão deve ser um número entre 0 e 100'
          });
        }
      }

      if (status && !['Ativo', 'Bloqueado'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Status inválido',
          message: 'Status deve ser "Ativo" ou "Bloqueado"'
        });
      }

      // Validação Convite de Retorno
      const conviteAtivo = Boolean(convite_retorno_ativo);
      const conviteDias = convite_retorno_dias !== undefined && convite_retorno_dias !== null
        ? parseInt(convite_retorno_dias)
        : null;

      if (conviteAtivo) {
        if (!conviteDias || Number.isNaN(conviteDias) || conviteDias < 1) {
          return res.status(400).json({
            success: false,
            error: 'Convite de retorno inválido',
            message: 'Informe um número de dias maior que zero para o convite de retorno'
          });
        }
      }

      if (insumos !== undefined && !Array.isArray(insumos)) {
        return res.status(400).json({
          success: false,
          error: 'Payload inválido',
          message: 'insumos deve ser um array'
        });
      }

      const normalizedInsumos = Array.isArray(insumos)
        ? insumos.map((i) => ({
          produto_id: i?.produto_id,
          quantidade: i?.quantidade
        }))
        : [];

      for (const item of normalizedInsumos) {
        const produtoId = Number(item.produto_id);
        const qtd = Number(item.quantidade);

        if (!Number.isFinite(produtoId) || produtoId <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Insumo inválido',
            message: 'produto_id inválido'
          });
        }

        if (!Number.isFinite(qtd) || qtd <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Insumo inválido',
            message: 'quantidade deve ser maior que zero'
          });
        }
      }

      const produtoIds = [...new Set(normalizedInsumos.map((i) => Number(i.produto_id)))];
      if (produtoIds.length > 0) {
        const produtosValidos = await this.model.db('produtos')
          .whereIn('id', produtoIds)
          .where('usuario_id', usuarioId)
          .whereNull('deleted_at')
          .select('id', 'tipo_item');

        if (produtosValidos.length !== produtoIds.length) {
          return res.status(400).json({
            success: false,
            error: 'Produtos inválidos',
            message: 'Um ou mais produtos não existem ou não pertencem ao usuário'
          });
        }

        const produtoVenda = produtosValidos.find((p) => String(p.tipo_item || '').toUpperCase() === 'VENDA');
        if (produtoVenda) {
          return res.status(400).json({
            success: false,
            error: 'Insumo inválido',
            message: 'Não é permitido adicionar como insumo um produto do tipo VENDA. Altere o produto para CONSUMO ou AMBOS.'
          });
        }
      }

      const servicoData = {
        nome: nome.trim(),
        descricao: descricao?.trim() || '',
        duracao_minutos: duracao_minutos,
        preco: precoNumero,
        exige_sinal: exigeSinalFinal,
        valor_sinal: exigeSinalFinal ? valorSinalNumero : null,
        comissao_percentual: comissao_percentual ?? 0,
        status: status || 'Ativo',
        categoria_id: categoria_id || null,
        convite_retorno_ativo: conviteAtivo,
        convite_retorno_dias: conviteAtivo ? conviteDias : null,
        usuario_id: usuarioId,
        created_at: new Date(),
        updated_at: new Date()
      };

      const servicoId = await this.model.createWithTransaction(
        servicoData,
        agentes_ids || [],
        extras_ids || [],
        normalizedInsumos
      );

      // Buscar serviço criado para retorno
      const servicoCriado = await this.model.findById(servicoId);

      return res.status(201).json({
        success: true,
        data: servicoCriado,
        message: 'Serviço criado com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao criar serviço:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // PUT /api/servicos/:id - Atualizar serviço
  async update(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      // Verificar se o serviço pertence ao usuário
      const servico = await this.model.findById(id);
      if (!servico) {
        return res.status(404).json({
          success: false,
          error: 'Serviço não encontrado'
        });
      }

      if (servico.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para editar este serviço'
        });
      }

      const {
        nome,
        descricao,
        duracao_minutos,
        preco,
        exige_sinal,
        valor_sinal,
        comissao_percentual,
        status,
        categoria_id,
        convite_retorno_ativo,
        convite_retorno_dias,
        agentes_ids,
        extras_ids,
        insumos
      } = req.body;

      // Validações básicas
      if (nome !== undefined && (!nome || !nome.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Nome é obrigatório'
        });
      }

      if (preco !== undefined) {
        const precoNumero = Number(preco);
        if (preco === null || Number.isNaN(precoNumero) || precoNumero < 0) {
          return res.status(400).json({
            success: false,
            error: 'Preço deve ser maior ou igual a zero'
          });
        }
      }

      const precoFinal = preco !== undefined ? Number(preco) : Number(servico.preco);
      const exigeSinalProvided = exige_sinal !== undefined;
      const exigeSinalFinal = exigeSinalProvided ? Boolean(exige_sinal) : Boolean(servico.exige_sinal);
      const valorSinalProvided = valor_sinal !== undefined;
      const valorSinalNumero = valorSinalProvided && valor_sinal !== null ? Number(valor_sinal) : null;

      // Regra inegociável: se exige_sinal foi enviado como true, valor_sinal é obrigatório no payload.
      if (exigeSinalProvided && Boolean(exige_sinal) === true && !valorSinalProvided) {
        return res.status(400).json({
          success: false,
          error: 'Valor do sinal obrigatório',
          message: 'Para serviços com exige_sinal=true, informe valor_sinal'
        });
      }

      // Regras de sinal:
      // - Se exige_sinal for true (ou permanecer true) e valor_sinal foi enviado, validar.
      // - Se exige_sinal for true (ou permanecer true) e valor_sinal NÃO foi enviado, manter o valor existente.
      // - Se exige_sinal for false, forçar valor_sinal = null.
      if (exigeSinalFinal) {
        if (valorSinalProvided) {
          if (valorSinalNumero === null || Number.isNaN(valorSinalNumero)) {
            return res.status(400).json({
              success: false,
              error: 'Valor do sinal obrigatório',
              message: 'Para serviços com exige_sinal=true, informe valor_sinal'
            });
          }

          if (!Number.isFinite(valorSinalNumero) || valorSinalNumero <= 0) {
            return res.status(400).json({
              success: false,
              error: 'Valor do sinal inválido',
              message: 'valor_sinal deve ser maior que zero'
            });
          }

          if (valorSinalNumero > precoFinal) {
            return res.status(400).json({
              success: false,
              error: 'Valor do sinal inválido',
              message: 'valor_sinal não pode ser maior do que o preço do serviço'
            });
          }
        }
      } else {
        // Se desligar exige_sinal, não aceitar manter valor_sinal
        // (se valor_sinal foi enviado, ele será ignorado e salvo como null)
      }

      if (duracao_minutos !== undefined && (duracao_minutos === null || Number.isNaN(Number(duracao_minutos)) || Number(duracao_minutos) < 0)) {
        return res.status(400).json({
          success: false,
          error: 'Duração deve ser maior ou igual a zero'
        });
      }

      if (comissao_percentual !== undefined && comissao_percentual !== null) {
        const comissaoNumero = Number(comissao_percentual);
        if (Number.isNaN(comissaoNumero) || comissaoNumero < 0 || comissaoNumero > 100) {
          return res.status(400).json({
            success: false,
            error: 'Comissão inválida',
            message: 'Comissão deve ser um número entre 0 e 100'
          });
        }
      }

      if (status !== undefined && !['Ativo', 'Bloqueado'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Status inválido',
          message: 'Status deve ser "Ativo" ou "Bloqueado"'
        });
      }

      // Validação Convite de Retorno (update)
      const conviteAtivoUpdate = convite_retorno_ativo !== undefined
        ? Boolean(convite_retorno_ativo)
        : undefined;
      const conviteDiasUpdate = convite_retorno_dias !== undefined && convite_retorno_dias !== null
        ? parseInt(convite_retorno_dias)
        : (convite_retorno_dias === null ? null : undefined);

      if (conviteAtivoUpdate === true) {
        if (!conviteDiasUpdate || Number.isNaN(conviteDiasUpdate) || conviteDiasUpdate < 1) {
          return res.status(400).json({
            success: false,
            error: 'Convite de retorno inválido',
            message: 'Informe um número de dias maior que zero para o convite de retorno'
          });
        }
      }

      const servicoData = {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(descricao !== undefined && { descricao: descricao?.trim() || '' }),
        ...(duracao_minutos !== undefined && { duracao_minutos }),
        ...(preco !== undefined && { preco: Number(preco) }),
        ...(exige_sinal !== undefined && { exige_sinal: Boolean(exige_sinal) }),
        ...(
          (exige_sinal !== undefined || valor_sinal !== undefined)
            ? {
              valor_sinal: (exigeSinalFinal ? (valorSinalProvided ? valorSinalNumero : servico.valor_sinal) : null)
            }
            : {}
        ),
        ...(comissao_percentual !== undefined && { comissao_percentual }),
        ...(status !== undefined && { status }),
        ...(categoria_id !== undefined && { categoria_id }),
        ...(conviteAtivoUpdate !== undefined && { convite_retorno_ativo: conviteAtivoUpdate }),
        ...(conviteAtivoUpdate !== undefined && conviteAtivoUpdate === false && { convite_retorno_dias: null }),
        ...(conviteAtivoUpdate === true && { convite_retorno_dias: conviteDiasUpdate }),
        ...(conviteAtivoUpdate === undefined && conviteDiasUpdate !== undefined && { convite_retorno_dias: conviteDiasUpdate }),
        updated_at: new Date()
      };

      if (insumos !== undefined && !Array.isArray(insumos)) {
        return res.status(400).json({
          success: false,
          error: 'Payload inválido',
          message: 'insumos deve ser um array'
        });
      }

      const normalizedInsumos = Array.isArray(insumos)
        ? insumos.map((i) => ({
          produto_id: i?.produto_id,
          quantidade: i?.quantidade
        }))
        : null;

      if (Array.isArray(normalizedInsumos)) {
        for (const item of normalizedInsumos) {
          const produtoId = Number(item.produto_id);
          const qtd = Number(item.quantidade);

          if (!Number.isFinite(produtoId) || produtoId <= 0) {
            return res.status(400).json({
              success: false,
              error: 'Insumo inválido',
              message: 'produto_id inválido'
            });
          }

          if (!Number.isFinite(qtd) || qtd <= 0) {
            return res.status(400).json({
              success: false,
              error: 'Insumo inválido',
              message: 'quantidade deve ser maior que zero'
            });
          }
        }

        const produtoIds = [...new Set(normalizedInsumos.map((i) => Number(i.produto_id)))];
        if (produtoIds.length > 0) {
          const produtosValidos = await this.model.db('produtos')
            .whereIn('id', produtoIds)
            .where('usuario_id', usuarioId)
            .whereNull('deleted_at')
            .select('id', 'tipo_item');

          if (produtosValidos.length !== produtoIds.length) {
            return res.status(400).json({
              success: false,
              error: 'Produtos inválidos',
              message: 'Um ou mais produtos não existem ou não pertencem ao usuário'
            });
          }

          const produtoVenda = produtosValidos.find((p) => String(p.tipo_item || '').toUpperCase() === 'VENDA');
          if (produtoVenda) {
            return res.status(400).json({
              success: false,
              error: 'Insumo inválido',
              message: 'Não é permitido adicionar como insumo um produto do tipo VENDA. Altere o produto para CONSUMO ou AMBOS.'
            });
          }
        }
      }

      logger.log(`🔄 [ServicoController] Atualizando serviço ${id} com ${agentes_ids?.length || 0} agentes e ${extras_ids?.length || 0} extras`);

      await this.model.updateWithTransaction(
        id,
        servicoData,
        agentes_ids || [],
        extras_ids || [],
        normalizedInsumos
      );

      // Buscar serviço atualizado para retorno
      const servicoAtualizado = await this.model.findByIdComplete(id);

      return res.status(200).json({
        success: true,
        data: servicoAtualizado,
        message: 'Serviço atualizado com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao atualizar serviço:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // DELETE /api/servicos/:id - Deletar serviço
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o serviço pertence ao usuário
      const servico = await this.model.db('servicos')
        .where({ id: parseInt(id, 10), usuario_id: usuarioId })
        .whereNull('deleted_at')
        .first();
      if (!servico) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }

      await this.model.db('servicos')
        .where({ id: parseInt(id, 10), usuario_id: usuarioId })
        .update({ deleted_at: new Date() });

      return res.json({
        message: 'Serviço deletado com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao deletar serviço:', error);
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Não é possível deletar',
          message: 'Este serviço possui agendamentos ou está vinculado a agentes' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/servicos/categoria/:categoriaId - Buscar serviços por categoria
  async byCategoria(req, res) {
    try {
      const { categoriaId } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const data = await this.model.findByCategoria(parseInt(categoriaId), usuarioId);
      return res.json({ data });
    } catch (error) {
      logger.error('Erro ao buscar serviços por categoria:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/servicos/agente/:agenteId - Buscar serviços por agente
  async byAgente(req, res) {
    try {
      const { agenteId } = req.params;
      
      const data = await this.model.findByAgente(parseInt(agenteId));
      return res.json({ data });
    } catch (error) {
      logger.error('Erro ao buscar serviços por agente:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }
}

module.exports = ServicoController;
