import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Service {
  id: number;
  nome: string;
  descricao?: string;
  duracao_minutos: number;
  preco: number;
  comissao_percentual: number;
  status: 'Ativo' | 'Inativo';
  categoria_id?: number;
  usuario_id: number;
  agentes_atuais_ids?: number[];
  extras_atuais_ids?: number[];
}

interface Agent {
  id: number;
  nome: string; // Já vem concatenado do backend: "Nome Sobrenome"
  avatar?: string;
}

interface ExtraService {
  id: number;
  nome: string;
  preco: number;
}

interface CreateServiceData {
  nome: string;
  descricao?: string;
  duracao_minutos: number;
  preco: number;
  comissao_percentual: number;
  status: 'Ativo' | 'Inativo';
  categoria_id?: number;
  agentes_ids: number[];
  extras_ids: number[];
}

export const useServiceManagement = () => {
  const { token, isAuthenticated } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [extraServices, setExtraServices] = useState<ExtraService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar lista leve de serviços (para formulários)
  const fetchServicesList = useCallback(async () => {
    if (!isAuthenticated || !token) {
      return [];
    }

    try {
      const response = await fetch('http://localhost:3000/api/servicos/list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        const servicesData = Array.isArray(data.data) ? data.data : [];
        return servicesData;
      } else {
        throw new Error(data.message || 'Erro ao carregar lista de serviços');
      }
    } catch (error) {
      console.error('❌ Erro ao buscar lista de serviços:', error);
      return [];
    }
  }, [isAuthenticated, token]);

  // Buscar serviços completos (com associações para listagem)
  const fetchServices = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setServices([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('http://localhost:3000/api/servicos', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        const servicesData = Array.isArray(data.data) ? data.data : [];
        setServices(servicesData);
      } else {
        throw new Error(data.message || 'Erro ao carregar serviços');
      }
    } catch (error) {
      console.error('❌ [useServiceManagement] Erro ao buscar serviços:', error);
      setError(error instanceof Error ? error.message : 'Erro desconhecido');
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Buscar lista de agentes
  const fetchAgents = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setAgents([]);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/agentes/list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        const agentsData = Array.isArray(data.data) ? data.data : [];
        setAgents(agentsData);
      } else {
        throw new Error(data.message || 'Erro ao carregar agentes');
      }
    } catch (error) {
      console.error('❌ Erro ao buscar agentes:', error);
      setAgents([]);
    }
  }, [isAuthenticated, token]);

  // Buscar lista de serviços extras
  const fetchExtraServices = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setExtraServices([]);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/servicos/extras/list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        const extraServicesData = Array.isArray(data.data) ? data.data : [];
        setExtraServices(extraServicesData);
      } else {
        throw new Error(data.message || 'Erro ao carregar serviços extras');
      }
    } catch (error) {
      console.error('❌ Erro ao buscar serviços extras:', error);
      setExtraServices([]);
    }
  }, [isAuthenticated, token]);

  // Buscar serviço específico (para edição)
  const fetchService = useCallback(async (id: number): Promise<Service | null> => {
    if (!isAuthenticated || !token) {
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3000/api/servicos/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message || 'Erro ao carregar serviço');
      }
    } catch (error) {
      console.error('❌ Erro ao buscar serviço:', error);
      setError(error instanceof Error ? error.message : 'Erro desconhecido');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Criar novo serviço
  const createService = useCallback(async (serviceData: CreateServiceData) => {
    if (!isAuthenticated || !token) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('http://localhost:3000/api/servicos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(serviceData)
      });

      const data = await response.json();

      if (data.success) {
        return { success: true, data: data.data };
      } else {
        throw new Error(data.message || 'Erro ao criar serviço');
      }
    } catch (error) {
      console.error('❌ [useServiceManagement] Erro ao criar serviço:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Atualizar serviço
  const updateService = useCallback(async (id: number, serviceData: Partial<CreateServiceData>) => {
    if (!isAuthenticated || !token) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3000/api/servicos/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(serviceData)
      });

      const data = await response.json();

      if (data.success) {
        return { success: true, data: data.data };
      } else {
        throw new Error(data.message || 'Erro ao atualizar serviço');
      }
    } catch (error) {
      console.error('❌ [useServiceManagement] Erro ao atualizar serviço:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Effect inicial para carregar dados
  useEffect(() => {
    let isMounted = true;

    if (isAuthenticated && token) {
      const loadData = async () => {
        try {
          if (isMounted) await fetchAgents();
          if (isMounted) await fetchExtraServices();
          if (isMounted) await fetchServices();
        } catch (error) {
          if (isMounted) {
            console.error('❌ [useServiceManagement] Erro ao carregar dados iniciais:', error);
          }
        }
      };
      loadData();
    } else {
      if (isMounted) {
        setServices([]);
        setAgents([]);
        setExtraServices([]);
        setError(null);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, token, fetchAgents, fetchExtraServices, fetchServices]);

  return {
    services,
    agents,
    extraServices,
    loading,
    error,
    fetchServices,
    fetchAgents,
    fetchExtraServices,
    fetchService,
    createService,
    updateService
  };
};
