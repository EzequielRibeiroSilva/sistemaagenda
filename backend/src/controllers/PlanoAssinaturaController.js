const logger = require('../utils/logger');
const PlanoAssinatura = require('../models/PlanoAssinatura');

class PlanoAssinaturaController {
  constructor() {
    this.model = new PlanoAssinatura();
  }

  async list(req, res) {
    try {
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      const planos = await this.model.findByUsuarioWithClientCount(usuarioId);

      return res.json({
        success: true,
        data: planos
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.list] Erro:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao listar planos de assinatura'
      });
    }
  }

  async listByUnidade(req, res) {
    try {
      const unidadeId = parseInt(req.params.id);
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || Number.isNaN(unidadeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID da unidade inválido'
        });
      }

      const planos = await this.model.findByUnidadeWithClientCount(unidadeId);

      return res.json({
        success: true,
        data: planos
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.listByUnidade] Erro:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao listar planos de assinatura'
      });
    }
  }

  async show(req, res) {
    try {
      const unidadeId = parseInt(req.params.id);
      const planoId = parseInt(req.params.planoId);
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || Number.isNaN(unidadeId) || !planoId || Number.isNaN(planoId)) {
        return res.status(400).json({
          success: false,
          message: 'Parâmetros inválidos'
        });
      }

      const plano = await this.model.db('planos_assinatura')
        .where('id', planoId)
        .where('unidade_id', unidadeId)
        .first();

      if (!plano) {
        return res.status(404).json({
          success: false,
          message: 'Plano não encontrado'
        });
      }

      const itens = await this.model.findItens(planoId);

      return res.json({
        success: true,
        data: {
          ...plano,
          valor: parseFloat(plano.valor) || 0,
          itens
        }
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.show] Erro:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao buscar plano de assinatura'
      });
    }
  }

  async showGlobal(req, res) {
    try {
      const planoId = parseInt(req.params.planoId);
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!planoId || Number.isNaN(planoId)) {
        return res.status(400).json({
          success: false,
          message: 'Parâmetros inválidos'
        });
      }

      const plano = await this.model.db('planos_assinatura')
        .where('id', planoId)
        .where('usuario_id', usuarioId)
        .first();

      if (!plano) {
        return res.status(404).json({
          success: false,
          message: 'Plano não encontrado'
        });
      }

      const itens = await this.model.findItens(planoId);

      return res.json({
        success: true,
        data: {
          ...plano,
          valor: parseFloat(plano.valor) || 0,
          itens
        }
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.showGlobal] Erro:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao buscar plano de assinatura'
      });
    }
  }

  async store(req, res) {
    try {
      const unidadeId = parseInt(req.params.id);
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || Number.isNaN(unidadeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID da unidade inválido'
        });
      }

      const { nome, validade_dias, valor, renovacao_automatica, status, itens } = req.body || {};

      if (!nome || !String(nome).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Nome do plano é obrigatório'
        });
      }

      const planoData = {
        unidade_id: unidadeId,
        nome: String(nome).trim(),
        validade_dias: 31,
        valor: valor !== undefined ? parseFloat(valor) : 0,
        renovacao_automatica: Boolean(renovacao_automatica),
        status: status || 'Ativo',
        created_at: new Date(),
        updated_at: new Date()
      };

      const created = await this.model.db.transaction(async (trx) => {
        const [row] = await trx('planos_assinatura').insert(planoData).returning('*');
        const plano = row;

        if (Array.isArray(itens)) {
          await this.model.replaceItens(plano.id, itens, trx);
        }

        return plano;
      });

      const createdItens = await this.model.findItens(created.id);

      return res.status(201).json({
        success: true,
        data: {
          ...created,
          valor: parseFloat(created.valor) || 0,
          itens: createdItens
        },
        message: 'Plano de assinatura criado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.store] Erro:', error);

      if (error && error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Já existe um plano com este nome nesta unidade'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao criar plano de assinatura'
      });
    }
  }

  async storeGlobal(req, res) {
    try {
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      const { nome, validade_dias, valor, renovacao_automatica, status, itens } = req.body || {};

      if (!nome || !String(nome).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Nome do plano é obrigatório'
        });
      }

      const validadeNum = validade_dias !== undefined ? parseInt(validade_dias) : 31;
      if (Number.isNaN(validadeNum) || validadeNum <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Validade em dias inválida'
        });
      }

      const planoData = {
        usuario_id: usuarioId,
        nome: String(nome).trim(),
        validade_dias: validadeNum,
        valor: valor !== undefined ? parseFloat(valor) : 0,
        renovacao_automatica: Boolean(renovacao_automatica),
        status: status || 'Ativo',
        created_at: new Date(),
        updated_at: new Date()
      };

      const created = await this.model.db.transaction(async (trx) => {
        const [row] = await trx('planos_assinatura').insert(planoData).returning('*');
        const plano = row;

        if (Array.isArray(itens)) {
          await this.model.replaceItens(plano.id, itens, trx);
        }

        return plano;
      });

      const createdItens = await this.model.findItens(created.id);

      return res.status(201).json({
        success: true,
        data: {
          ...created,
          valor: parseFloat(created.valor) || 0,
          itens: createdItens
        },
        message: 'Plano de assinatura criado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.storeGlobal] Erro:', error);

      if (error && error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Já existe um plano com este nome para este usuário'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao criar plano de assinatura'
      });
    }
  }

  async update(req, res) {
    try {
      const unidadeId = parseInt(req.params.id);
      const planoId = parseInt(req.params.planoId);
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || Number.isNaN(unidadeId) || !planoId || Number.isNaN(planoId)) {
        return res.status(400).json({
          success: false,
          message: 'Parâmetros inválidos'
        });
      }

      const existing = await this.model.db('planos_assinatura')
        .where('id', planoId)
        .where('unidade_id', unidadeId)
        .first();

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Plano não encontrado'
        });
      }

      const { nome, validade_dias, valor, renovacao_automatica, status, itens } = req.body || {};

      const validadeNum = validade_dias !== undefined ? parseInt(validade_dias) : undefined;
      if (validadeNum !== undefined && (Number.isNaN(validadeNum) || validadeNum <= 0)) {
        return res.status(400).json({
          success: false,
          message: 'Validade em dias inválida'
        });
      }

      const updateData = {
        ...(nome !== undefined && { nome: String(nome).trim() }),
        ...(validadeNum !== undefined && { validade_dias: validadeNum }),
        ...(valor !== undefined && { valor: parseFloat(valor) }),
        ...(renovacao_automatica !== undefined && { renovacao_automatica: Boolean(renovacao_automatica) }),
        ...(status !== undefined && { status }),
        updated_at: new Date()
      };

      const updated = await this.model.db.transaction(async (trx) => {
        const [row] = await trx('planos_assinatura')
          .where('id', planoId)
          .where('unidade_id', unidadeId)
          .update(updateData)
          .returning('*');

        if (Array.isArray(itens)) {
          await this.model.replaceItens(planoId, itens, trx);
        }

        return row;
      });

      const updatedItens = await this.model.findItens(planoId);

      return res.json({
        success: true,
        data: {
          ...updated,
          valor: parseFloat(updated.valor) || 0,
          itens: updatedItens
        },
        message: 'Plano de assinatura atualizado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.update] Erro:', error);

      if (error && error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Já existe um plano com este nome nesta unidade'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao atualizar plano de assinatura'
      });
    }
  }

  async updateGlobal(req, res) {
    try {
      const planoId = parseInt(req.params.planoId);
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!planoId || Number.isNaN(planoId)) {
        return res.status(400).json({
          success: false,
          message: 'Parâmetros inválidos'
        });
      }

      const existing = await this.model.db('planos_assinatura')
        .where('id', planoId)
        .where('usuario_id', usuarioId)
        .first();

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Plano não encontrado'
        });
      }

      const { nome, validade_dias, valor, renovacao_automatica, status, itens } = req.body || {};

      const validadeNum = validade_dias !== undefined ? parseInt(validade_dias) : undefined;
      if (validadeNum !== undefined && (Number.isNaN(validadeNum) || validadeNum <= 0)) {
        return res.status(400).json({
          success: false,
          message: 'Validade em dias inválida'
        });
      }

      const updateData = {
        ...(nome !== undefined && { nome: String(nome).trim() }),
        ...(validadeNum !== undefined && { validade_dias: validadeNum }),
        ...(valor !== undefined && { valor: parseFloat(valor) }),
        ...(renovacao_automatica !== undefined && { renovacao_automatica: Boolean(renovacao_automatica) }),
        ...(status !== undefined && { status }),
        updated_at: new Date()
      };

      const updated = await this.model.db.transaction(async (trx) => {
        const [row] = await trx('planos_assinatura')
          .where('id', planoId)
          .where('usuario_id', usuarioId)
          .update(updateData)
          .returning('*');

        if (Array.isArray(itens)) {
          await this.model.replaceItens(planoId, itens, trx);
        }

        return row;
      });

      const updatedItens = await this.model.findItens(planoId);

      return res.json({
        success: true,
        data: {
          ...updated,
          valor: parseFloat(updated.valor) || 0,
          itens: updatedItens
        },
        message: 'Plano de assinatura atualizado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.updateGlobal] Erro:', error);

      if (error && error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Já existe um plano com este nome para este usuário'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao atualizar plano de assinatura'
      });
    }
  }

  async destroy(req, res) {
    try {
      const unidadeId = parseInt(req.params.id);
      const planoId = parseInt(req.params.planoId);
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || Number.isNaN(unidadeId) || !planoId || Number.isNaN(planoId)) {
        return res.status(400).json({
          success: false,
          message: 'Parâmetros inválidos'
        });
      }

      const existing = await this.model.db('planos_assinatura')
        .where('id', planoId)
        .where('unidade_id', unidadeId)
        .first();

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Plano não encontrado'
        });
      }

      await this.model.db.transaction(async (trx) => {
        await trx('clientes')
          .where('unidade_id', unidadeId)
          .where('assinatura_plano_id', planoId)
          .update({
            assinatura_plano_id: null,
            updated_at: new Date()
          });

        await trx('planos_assinatura')
          .where('id', planoId)
          .where('unidade_id', unidadeId)
          .del();
      });

      return res.json({
        success: true,
        message: 'Plano de assinatura deletado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.destroy] Erro:', error);

      if (error && error.code === '23503') {
        return res.status(400).json({
          success: false,
          message: 'Não é possível deletar este plano pois existem dados relacionados'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao deletar plano de assinatura'
      });
    }
  }

  async destroyGlobal(req, res) {
    try {
      const planoId = parseInt(req.params.planoId);
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!planoId || Number.isNaN(planoId)) {
        return res.status(400).json({
          success: false,
          message: 'Parâmetros inválidos'
        });
      }

      const existing = await this.model.db('planos_assinatura')
        .where('id', planoId)
        .where('usuario_id', usuarioId)
        .first();

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Plano não encontrado'
        });
      }

      await this.model.db.transaction(async (trx) => {
        await trx('clientes')
          .join('unidades', 'clientes.unidade_id', 'unidades.id')
          .where('unidades.usuario_id', usuarioId)
          .where('clientes.assinatura_plano_id', planoId)
          .update({
            assinatura_plano_id: null,
            updated_at: new Date()
          });

        await trx('planos_assinatura')
          .where('id', planoId)
          .where('usuario_id', usuarioId)
          .del();
      });

      return res.json({
        success: true,
        message: 'Plano de assinatura deletado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [PlanoAssinaturaController.destroyGlobal] Erro:', error);

      if (error && error.code === '23503') {
        return res.status(400).json({
          success: false,
          message: 'Não é possível deletar este plano pois existem dados relacionados'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao deletar plano de assinatura'
      });
    }
  }
}

module.exports = PlanoAssinaturaController;
