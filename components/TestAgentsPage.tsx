import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

interface Service {
  id: number;
  nome: string;
  preco: string;
}

interface Agent {
  id: number;
  name: string;
  email: string;
}

const TestAgentsPage: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const { token, isAuthenticated, user } = useAuth();

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logMessage]);
    console.log(logMessage);
  };

  const fetchServices = async () => {
    if (!token || !isAuthenticated) {
      addLog('❌ Não autenticado ou sem token');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      addLog('🔍 Iniciando busca de serviços...');
      addLog(`🔑 Token: ${token.substring(0, 50)}...`);
      addLog(`👤 Usuário: ${user?.userData?.nome} (${user?.userData?.role})`);

      const response = await fetch(`${API_BASE_URL}/servicos`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      addLog(`📡 Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      addLog(`📋 Resposta recebida: ${JSON.stringify(data).substring(0, 200)}...`);

      if (data.data && Array.isArray(data.data)) {
        setServices(data.data);
        addLog(`✅ ${data.data.length} serviços carregados`);
      } else {
        addLog('⚠️ Formato de resposta inesperado');
        setServices([]);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      addLog(`❌ Erro: ${errorMessage}`);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    if (!token || !isAuthenticated) {
      addLog('❌ Não autenticado ou sem token');
      return;
    }

    try {
      setLoading(true);
      addLog('🔍 Iniciando busca de agentes...');

      const response = await fetch(`${API_BASE_URL}/agentes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      addLog(`📡 Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      addLog(`👤 Resposta recebida: ${JSON.stringify(data).substring(0, 200)}...`);

      if (data.data && Array.isArray(data.data)) {
        setAgents(data.data);
        addLog(`✅ ${data.data.length} agentes carregados`);
      } else {
        addLog('⚠️ Formato de resposta inesperado');
        setAgents([]);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      addLog(`❌ Erro: ${errorMessage}`);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    addLog('🔄 useEffect disparado');
    addLog(`🔐 isAuthenticated: ${isAuthenticated}`);
    addLog(`🔑 hasToken: ${!!token}`);
    addLog(`👤 user: ${user ? JSON.stringify(user.userData) : 'null'}`);

    if (isAuthenticated && token) {
      addLog('✅ Condições atendidas, carregando dados...');
      fetchServices();
    } else {
      addLog('⚠️ Condições não atendidas');
    }
  }, [isAuthenticated, token]);

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">🧪 Teste - Sistema de Agentes</h1>
      
      {/* Status */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-bold text-blue-800 mb-2">Status da Autenticação</h2>
        <div className="space-y-1 text-sm">
          <div>🔐 Autenticado: <span className={isAuthenticated ? 'text-green-600' : 'text-red-600'}>{isAuthenticated ? 'Sim' : 'Não'}</span></div>
          <div>🔑 Token: <span className={token ? 'text-green-600' : 'text-red-600'}>{token ? 'Presente' : 'Ausente'}</span></div>
          <div>👤 Usuário: <span className="text-gray-700">{user?.userData?.nome || 'N/A'}</span></div>
          <div>🎭 Role: <span className="text-gray-700">{user?.userData?.role || 'N/A'}</span></div>
        </div>
      </div>

      {/* Controles */}
      <div className="space-x-4">
        <button 
          onClick={fetchServices}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Carregando...' : 'Buscar Serviços'}
        </button>
        <button 
          onClick={fetchAgents}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Carregando...' : 'Buscar Agentes'}
        </button>
        <button 
          onClick={clearLogs}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Limpar Logs
        </button>
      </div>

      {/* Resultados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Serviços */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-bold text-gray-800 mb-3">📋 Serviços ({services.length})</h3>
          {services.length > 0 ? (
            <ul className="space-y-2">
              {services.map(service => (
                <li key={service.id} className="text-sm bg-gray-50 p-2 rounded">
                  <strong>{service.nome}</strong> - R$ {service.preco}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Nenhum serviço encontrado</p>
          )}
        </div>

        {/* Agentes */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-bold text-gray-800 mb-3">👤 Agentes ({agents.length})</h3>
          {agents.length > 0 ? (
            <ul className="space-y-2">
              {agents.map(agent => (
                <li key={agent.id} className="text-sm bg-gray-50 p-2 rounded">
                  <strong>{agent.name}</strong> - {agent.email}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Nenhum agente encontrado</p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-bold text-red-800 mb-2">❌ Erro</h3>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Logs */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <h3 className="font-bold text-gray-800 mb-3">📝 Logs de Debug</h3>
        <div className="max-h-64 overflow-y-auto">
          {logs.length > 0 ? (
            <ul className="space-y-1">
              {logs.map((log, index) => (
                <li key={index} className="text-xs font-mono text-gray-700 bg-white p-1 rounded">
                  {log}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Nenhum log ainda</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestAgentsPage;
