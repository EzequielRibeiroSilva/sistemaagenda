/**
 * Teste simples para verificar se o endpoint de settings funciona
 */

const express = require('express');
const cors = require('cors');

// Configuração básica
const app = express();
app.use(cors());
app.use(express.json());

// Mock do middleware de autenticação
const mockAuth = (req, res, next) => {
  req.user = {
    id: 105,
    unidade_id: 4,
    email: 'testando@gmail.com',
    role: 'ADMIN'
  };
  next();
};

// Mock do endpoint de settings
app.get('/api/settings', mockAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      unidade_id: 4,
      nome_negocio: 'Meu Negócio',
      logo_url: null,
      duracao_servico_horas: 1.0,
      tempo_limite_agendar_horas: 2,
      permitir_cancelamento: true,
      tempo_limite_cancelar_horas: 4,
      periodo_futuro_dias: 365,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    message: 'Configurações carregadas com sucesso (MOCK)'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Iniciar servidor de teste
const PORT = 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧪 Servidor de teste rodando em: http://0.0.0.0:${PORT}`);
  console.log(`📊 Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`⚙️  Settings endpoint: http://0.0.0.0:${PORT}/api/settings`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Encerrando servidor de teste...');
  server.close(() => {
    console.log('✅ Servidor de teste encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Encerrando servidor de teste...');
  server.close(() => {
    console.log('✅ Servidor de teste encerrado');
    process.exit(0);
  });
});
