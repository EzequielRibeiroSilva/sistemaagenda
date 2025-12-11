const Usuario = require('../models/Usuario');
const Agente = require('../models/Agente');
const Unidade = require('../models/Unidade');
const logger = require('./../utils/logger');

class DiagnosticController {
  constructor() {
    this.usuarioModel = new Usuario();
    this.agenteModel = new Agente();
    this.unidadeModel = new Unidade();
  }

  /**
   * GET /api/diagnostics/admin-agents
   * Auditoria forense de usuários ADMIN e seus agentes
   * APENAS para MASTER ou uso local de desenvolvimento
   */
  async adminAgentsAudit(req, res) {
    try {
      // Verificar se é MASTER ou ambiente de desenvolvimento
      const userRole = req.user?.role;
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      if (userRole !== 'MASTER' && !isDevelopment) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Apenas usuários MASTER podem acessar diagnósticos'
        });
      }



      // 1. Buscar todos os usuários ADMIN
      const usuariosAdmin = await this.usuarioModel.db('usuarios')
        .where('role', 'ADMIN')
        .select('id', 'nome', 'email', 'unidade_id', 'plano', 'limite_unidades', 'status', 'created_at');



      // 2. Para cada usuário ADMIN, buscar suas unidades e agentes
      const auditResults = await Promise.all(
        usuariosAdmin.map(async (usuario) => {
          logger.log(`🔍 [DIAGNÓSTICO] Auditando usuário: ${usuario.email} (ID: ${usuario.id})`);

          // Buscar unidades do usuário
          const unidades = await this.unidadeModel.findByUsuario(usuario.id);
          const unidadesAtivas = unidades.filter(u => u.status !== 'Excluido');

          // Buscar agentes do usuário (através das unidades)
          const agentes = await this.agenteModel.findByUsuario(usuario.id);

          // Buscar agentes com dados completos
          const agentesDetalhados = await Promise.all(
            agentes.map(async (agente) => {
              // Buscar serviços do agente
              const servicos = await this.agenteModel.db('agente_servicos')
                .join('servicos', 'agente_servicos.servico_id', 'servicos.id')
                .where('agente_servicos.agente_id', agente.id)
                .select('servicos.id', 'servicos.nome');

              return {
                id: agente.id,
                nome: agente.nome,
                sobrenome: agente.sobrenome,
                nome_completo: `${agente.nome} ${agente.sobrenome || ''}`.trim(),
                nome_exibicao: agente.nome_exibicao,
                email: agente.email,
                telefone: agente.telefone,
                avatar_url: agente.avatar_url,
                status: agente.status,
                unidade_id: agente.unidade_id,
                unidade_nome: agente.unidade_nome,
                usuario_id: agente.usuario_id,
                biografia: agente.biografia,
                data_admissao: agente.data_admissao,
                comissao_percentual: agente.comissao_percentual,
                servicos_count: servicos.length,
                servicos: servicos.map(s => s.nome),
                created_at: agente.created_at
              };
            })
          );

          return {
            usuario: {
              id: usuario.id,
              nome: usuario.nome,
              email: usuario.email,
              unidade_id: usuario.unidade_id,
              plano: usuario.plano,
              limite_unidades: usuario.limite_unidades,
              status: usuario.status,
              created_at: usuario.created_at
            },
            unidades: {
              total: unidades.length,
              ativas: unidadesAtivas.length,
              excluidas: unidades.length - unidadesAtivas.length,
              detalhes: unidadesAtivas.map(u => ({
                id: u.id,
                nome: u.nome,
                status: u.status,
                slug_url: u.slug_url
              }))
            },
            agentes: {
              total: agentes.length,
              ativos: agentes.filter(a => a.status === 'Ativo').length,
              bloqueados: agentes.filter(a => a.status === 'Bloqueado').length,
              detalhes: agentesDetalhados
            }
          };
        })
      );

      // 3. Estatísticas gerais
      const totalAgentes = auditResults.reduce((sum, result) => sum + result.agentes.total, 0);
      const totalUnidades = auditResults.reduce((sum, result) => sum + result.unidades.ativas, 0);

      const diagnosticSummary = {
        timestamp: new Date().toISOString(),
        total_usuarios_admin: usuariosAdmin.length,
        total_unidades_ativas: totalUnidades,
        total_agentes: totalAgentes,
        usuarios_sem_agentes: auditResults.filter(r => r.agentes.total === 0).length,
        usuarios_com_problemas: auditResults.filter(r => 
          r.agentes.detalhes.some(a => !a.nome_exibicao || !a.avatar_url)
        ).length
      };



      // 4. Identificar problemas específicos
      const problemasIdentificados = [];

      auditResults.forEach(result => {
        const { usuario, agentes } = result;

        // Verificar agentes com dados incompletos
        agentes.detalhes.forEach(agente => {
          if (!agente.nome_exibicao) {
            problemasIdentificados.push({
              tipo: 'NOME_EXIBICAO_FALTANDO',
              usuario_email: usuario.email,
              agente_id: agente.id,
              agente_nome: agente.nome_completo,
              descricao: 'Campo nome_exibicao está vazio ou nulo'
            });
          }

          if (!agente.avatar_url) {
            problemasIdentificados.push({
              tipo: 'AVATAR_FALTANDO',
              usuario_email: usuario.email,
              agente_id: agente.id,
              agente_nome: agente.nome_completo,
              descricao: 'Campo avatar_url está vazio ou nulo'
            });
          }

          if (agente.servicos_count < 1) {
            problemasIdentificados.push({
              tipo: 'SEM_SERVICOS',
              usuario_email: usuario.email,
              agente_id: agente.id,
              agente_nome: agente.nome_completo,
              descricao: 'Agente não possui serviços associados'
            });
          }
        });

        // Verificar usuários sem agentes
        if (agentes.total === 0) {
          problemasIdentificados.push({
            tipo: 'USUARIO_SEM_AGENTES',
            usuario_email: usuario.email,
            usuario_id: usuario.id,
            descricao: 'Usuário ADMIN não possui agentes cadastrados'
          });
        }
      });



      return res.json({
        success: true,
        message: 'Auditoria de usuários ADMIN e agentes concluída',
        data: {
          summary: diagnosticSummary,
          usuarios_admin: auditResults,
          problemas_identificados: problemasIdentificados
        }
      });

    } catch (error) {
      logger.error('❌ [DIAGNÓSTICO] Erro na auditoria:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * GET /api/diagnostics/user-data/:userId
   * Diagnóstico específico de um usuário e seus dados
   */
  async userDataDiagnosis(req, res) {
    try {
      const userId = parseInt(req.params.userId);
      const userRole = req.user?.role;
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      if (userRole !== 'MASTER' && !isDevelopment && req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você só pode diagnosticar seus próprios dados'
        });
      }

      logger.log(`🔍 [DIAGNÓSTICO] Diagnóstico específico do usuário ID: ${userId}`);

      // Buscar dados do usuário
      const usuario = await this.usuarioModel.findById(userId);
      if (!usuario) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado',
          message: `Usuário com ID ${userId} não existe`
        });
      }

      // Buscar unidades
      const unidades = await this.unidadeModel.findByUsuario(userId);
      
      // Buscar agentes com dados completos
      const agentes = await this.agenteModel.findByUsuario(userId);
      const agentesDetalhados = await Promise.all(
        agentes.map(async (agente) => {
          const servicos = await this.agenteModel.db('agente_servicos')
            .join('servicos', 'agente_servicos.servico_id', 'servicos.id')
            .where('agente_servicos.agente_id', agente.id)
            .select('servicos.id', 'servicos.nome');

          return {
            ...agente,
            servicos_count: servicos.length,
            servicos: servicos
          };
        })
      );

      return res.json({
        success: true,
        message: `Diagnóstico do usuário ${usuario.email} concluído`,
        data: {
          usuario: {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            role: usuario.role,
            unidade_id: usuario.unidade_id,
            plano: usuario.plano,
            limite_unidades: usuario.limite_unidades,
            status: usuario.status
          },
          unidades: unidades,
          agentes: agentesDetalhados,
          estatisticas: {
            total_unidades: unidades.length,
            unidades_ativas: unidades.filter(u => u.status === 'Ativo').length,
            total_agentes: agentes.length,
            agentes_ativos: agentes.filter(a => a.status === 'Ativo').length
          }
        }
      });

    } catch (error) {
      logger.error('❌ [DIAGNÓSTICO] Erro no diagnóstico do usuário:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = DiagnosticController;
