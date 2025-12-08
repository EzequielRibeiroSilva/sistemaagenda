export type AppointmentStatus = 'Aprovado' | 'Concluído' | 'Cancelado' | 'Não Compareceu';

export interface Agent {
    id: string;
    name: string;
    avatar: string;
    unidades?: string[]; // ✅ Array de IDs das unidades onde o agente trabalha (M:N)
}

export interface Service {
    id: string;
    name: string;
    color: string;
    textColor: string;
}

export interface Appointment {
    id: string;
    agentId: string;
    serviceId: string;
    locationId: string;
    startTime: string; // "HH:mm"
    endTime: string;   // "HH:mm"
}

export interface UpcomingAppointment {
    agent: {
        name: string;
        avatar: string;
    };
    agentId: string;
    serviceId: string;
    locationId: string;
    timeUntil: string;
    service: string;
    date: string;
    time: string;
}

export interface UnavailableBlock {
    id: string;
    agentId: string;
    startTime: string; // "HH:mm"
    endTime: string;   // "HH:mm"
}

// FIX: Added PerformanceMetric type to be used in PerformanceSection.tsx.
export interface PerformanceMetric {
    title: string;
    value: string;
    isPositive: boolean;
    change: string;
    subtitle?: string; // ✅ Informação adicional (ex: "Confirmadas: 30")
    icon?: string; // ✅ Ícone para o card (opcional)
    adminOnly?: boolean; // ✅ Flag para indicar que apenas ADMIN pode ver este card
}

export interface ScheduleSlot {
    type: 'booked' | 'tentative' | 'unavailable' | 'available';
    start: number;
    end: number;
    details?: {
        id: string;
        service: string;
        client: string;
        agentName: string;
        agentAvatar?: string; // ✅ Avatar real do agente
        agentEmail: string;
        agentPhone?: string;
        date: string;
        time: string;
        serviceId: string;
        locationId: string;
        status: AppointmentStatus;
        // ✅ CRÍTICO: Campos adicionais para edição/finalização
        agentId?: string | number; // ID bruto do agente
        startTime?: string; // Hora de início bruta (ex: "14:00")
        endTime?: string; // Hora de fim bruta (ex: "15:00")
        dateISO?: string; // Data ISO (YYYY-MM-DD)
        clientPhone?: string; // Telefone do cliente
        observacoes?: string; // Observações sobre o serviço realizado
    }
}


// FIX: Added AgentSchedule type to be used in PreviewSection.tsx.
export interface AgentSchedule {
    agent: Agent;
    appointments: ScheduleSlot[];
}

export interface AppointmentDetail {
  id: number;
  service: string;
  dateTime: string;
  date: string; // ✅ NOVO: Data bruta no formato YYYY-MM-DD para navegação ao calendário
  timeRemaining: string;
  timeRemainingStatus: 'happening_now' | 'soon' | 'overdue' | 'pending';
  agent: {
    name: string;
    avatar: string;
    id?: number; // ✅ NOVO: ID do agente para edição
  };
  client: {
    name: string;
    avatar: string;
  };
  status: AppointmentStatus;
  paymentStatus: 'Não Pago' | 'Pago';
  createdAt: string;
  paymentMethod?: string;
  observacoes?: string; // Observações sobre o serviço realizado
  // ✅ NOVO: Campos necessários para edição no modal
  serviceId?: number;
  startTime?: string;
  endTime?: string;
  locationId?: number;
  clientPhone?: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  socialAlert?: boolean;
  totalApps: number;
  nextAppStatus: string;
  timeToNext: string;
  wpId: number;
}

export interface ServiceInfo {
  name: string;
  agents: { avatar: string }[];
  duration: number;
  price: number;
  buffer: string;
}

export interface Unit {
  id: number;
  name: string;
  status: 'Ativo' | 'Bloqueado';
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  contact: string;
  status: 'Ativo' | 'Bloqueado';
  plan: 'Single' | 'Multi';
  unitLimit: number;
  units: Unit[];
  clientCount: number;
}

export interface Location {
    id: string;
    name: string;
}

// ✅ ETAPA 2: Interfaces para Sistema de Agendas Multi-Unidade
export interface AgentUnitScheduleState {
  unidade_id: number;
  unidade_nome: string;
  agenda_personalizada: boolean;
  schedule: {
    [dayName: string]: {
      isActive: boolean;
      periods: { id: number; start: string; end: string }[];
    };
  };
}