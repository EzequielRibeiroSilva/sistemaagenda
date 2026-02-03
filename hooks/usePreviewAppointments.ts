import { useMemo } from 'react';

interface BackendAgendamento {
  id: number;
  agente_id: number;
  servico_id?: number;
  unidade_id: number;
  recorrencia_group_id?: string | null;
  recorrencia_config?: any;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  status: 'Pendente' | 'Aprovado' | 'Cancelado' | 'Concluído' | 'Não Compareceu';
  valor_total: number;
  cliente_nome?: string;
  cliente_telefone?: string;
  cliente_data_nascimento?: string;
  numero_agendamento?: number;
  servicos?: Array<{
    id: number;
    nome: string;
    preco: string;
  }>;
  extras?: Array<{
    id: number;
    nome: string;
    preco?: string;
    duracao_minutos?: number;
    preco_aplicado?: string;
  }>;
}

interface BackendAgente {
  id: number;
  nome: string;
  sobrenome?: string;
  name?: string;
  nome_exibicao?: string;
  email: string;
  telefone?: string;
  avatar?: string;
  avatar_url?: string;
}

interface AppointmentCard {
  id: number;
  numeroAgendamento?: number;
  startTime: string;
  endTime: string;
  serviceName: string;
  extras?: string[];
  clientName: string;
  status: string;
  agentName: string;
  agentAvatar?: string;
  agentEmail: string;
  agentPhone?: string;
  clientBirthDate?: string;
  agentId: number;
  serviceId?: number;
  clientPhone?: string;
  dateISO: string;
  recorrenciaGroupId?: string | null;
  recorrenciaConfig?: any;
}

const toLocalDateString = (date: Date): string => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const usePreviewAppointments = (
  appointments: BackendAgendamento[],
  selectedDate: Date,
  services: { id: string; name: string }[],
  backendAgentes: BackendAgente[]
): Record<string, AppointmentCard[]> => {
  const agentAppointmentCards = useMemo(() => {
    const dateStr = toLocalDateString(selectedDate);
    const cardsByAgent: Record<string, AppointmentCard[]> = {};

    appointments.forEach(apt => {
      const aptDateStr = apt.data_agendamento.split('T')[0];
      
      if (aptDateStr !== dateStr) {
        return;
      }

      if (apt.status === 'Cancelado') {
        return;
      }

      const agentId = apt.agente_id.toString();
      
      if (!cardsByAgent[agentId]) {
        cardsByAgent[agentId] = [];
      }

      let serviceName = 'Serviço';
      if (apt.servicos && apt.servicos.length > 0) {
        serviceName = apt.servicos[0].nome;
      } else if (apt.servico_id) {
        const service = services.find(s => s.id === apt.servico_id!.toString());
        serviceName = service?.name || 'Serviço';
      }

      const extras = Array.isArray(apt.extras)
        ? apt.extras.map(e => e.nome).filter(Boolean)
        : [];

      const backendAgent = backendAgentes.find(a => a.id === apt.agente_id);
      
      const agentName = backendAgent 
        ? (backendAgent.nome_exibicao || backendAgent.name || `${backendAgent.nome || ''} ${backendAgent.sobrenome || ''}`.trim() || 'Agente')
        : 'Agente';
      
      const agentEmail = backendAgent?.email || 'agente@email.com';
      const agentAvatar = backendAgent?.avatar_url || backendAgent?.avatar;

      cardsByAgent[agentId].push({
        id: apt.id,
        numeroAgendamento: apt.numero_agendamento,
        startTime: apt.hora_inicio,
        endTime: apt.hora_fim,
        serviceName,
        extras,
        clientName: apt.cliente_nome || 'Cliente',
        status: apt.status,
        agentName,
        agentAvatar,
        agentEmail,
        agentPhone: backendAgent?.telefone,
        clientBirthDate: apt.cliente_data_nascimento ? apt.cliente_data_nascimento.split('T')[0] : undefined,
        agentId: apt.agente_id,
        serviceId: apt.servico_id,
        clientPhone: apt.cliente_telefone,
        dateISO: aptDateStr,
        recorrenciaGroupId: apt.recorrencia_group_id || null,
        recorrenciaConfig: apt.recorrencia_config
      });
    });

    Object.keys(cardsByAgent).forEach((id) => {
      cardsByAgent[id].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    });

    return cardsByAgent;
  }, [appointments, selectedDate, services, backendAgentes]);

  return agentAppointmentCards;
};
