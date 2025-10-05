export type AppointmentStatus = 'Aprovado' | 'Concluído' | 'Cancelado' | 'Não Compareceu';

export interface Agent {
    id: string;
    name: string;
    avatar: string;
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
        agentEmail: string;
        agentPhone?: string;
        date: string;
        time: string;
        serviceId: string;
        locationId: string;
        status: AppointmentStatus;
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
  timeRemaining: string;
  timeRemainingStatus: 'soon' | 'overdue' | 'pending';
  agent: {
    name: string;
    avatar: string;
  };
  client: {
    name: string;
    avatar: string;
  };
  status: AppointmentStatus;
  paymentStatus: 'Não Pago' | 'Pago';
  createdAt: string;
  paymentMethod?: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  email: string;
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