import React, { useState, useMemo, useEffect } from 'react';
import PerformanceSection from './PerformanceSection';
import PreviewSection from './PreviewSection';
import UpcomingAppointments from './UpcomingAppointments';
import NewAppointmentModal from './NewAppointmentModal';
import type { PerformanceMetric, AgentSchedule, UpcomingAppointment, Agent, Service, Location, ScheduleSlot } from '../types';

// --- Mock Data ---
const agents: Agent[] = [
    { id: '1', name: 'Eduardo Soares', avatar: 'https://picsum.photos/id/1005/100/100' },
    { id: '2', name: 'Ângelo Paixão', avatar: 'https://picsum.photos/id/1011/100/100' },
    { id: '3', name: 'Snake Filho', avatar: 'https://picsum.photos/id/1012/100/100' },
];

const services: (Service & { price: number; commission: number })[] = [
  { id: 's1', name: 'CORTE', color: '', textColor: '', price: 30, commission: 70 },
  { id: 's2', name: 'CORTE + BARBA', color: '', textColor: '', price: 45, commission: 65 },
  { id: 's3', name: 'BARBA', color: '', textColor: '', price: 20, commission: 75 },
];

const locations: Location[] = [
    { id: 'loc1', name: 'Local Principal' },
    { id: 'loc2', name: 'Unidade Filial' },
];

const detailedAppointments = [
  { agentId: '1', serviceId: 's1', date: new Date(2025, 8, 1) },
  { agentId: '1', serviceId: 's2', date: new Date(2025, 8, 3) },
  { agentId: '2', serviceId: 's1', date: new Date(2025, 8, 5) },
  { agentId: '3', serviceId: 's3', date: new Date(2025, 8, 7) },
  { agentId: '1', serviceId: 's1', date: new Date(2025, 8, 10) },
  { agentId: '2', serviceId: 's2', date: new Date(2025, 8, 12) },
  { agentId: '3', serviceId: 's1', date: new Date(2025, 8, 15) },
  { agentId: '1', serviceId: 's3', date: new Date(2025, 8, 18) },
  { agentId: '2', serviceId: 's1', date: new Date(2025, 8, 20) },
  { agentId: '3', serviceId: 's2', date: new Date(2025, 8, 22) },
  { agentId: '1', serviceId: 's1', date: new Date(2025, 8, 25) },
  { agentId: '2', serviceId: 's3', date: new Date(2025, 8, 28) },
];


const agentSchedules: AgentSchedule[] = [
    {
        agent: agents[0],
        appointments: [
            { type: 'booked', start: 8, end: 9, details: { id: 'a1', service: 'CORTE', serviceId: 's1', locationId: 'loc1', client: 'Carlos Silva', agentName: 'Eduardo Soares', agentEmail: 'contato@barbeariadudu.com.br', date: '30 Setembro, 2025', time: '08:00-09:00', status: 'Aprovado' } },
            { type: 'tentative', start: 10, end: 11 },
            { type: 'unavailable', start: 13, end: 14 },
            { type: 'booked', start: 15, end: 20, details: { id: 'a2', service: 'BARBA', serviceId: 's3', locationId: 'loc1', client: 'João Ferreira', agentName: 'Eduardo Soares', agentEmail: 'contato@barbeariadudu.com.br', date: '30 Setembro, 2025', time: '15:00-20:00', status: 'Concluído' } }
        ]
    },
    {
        agent: agents[1],
        appointments: [
            { type: 'unavailable', start: 8, end: 14 },
            { type: 'booked', start: 14, end: 15, details: { id: 'b1', service: 'CORTE + BARBA', serviceId: 's2', locationId: 'loc2', client: 'Pedro Almeida', agentName: 'Ângelo Paixão', agentEmail: 'angelo@email.com', date: '30 Setembro, 2025', time: '14:00-15:00', status: 'Aprovado' } },
            { type: 'booked', start: 16, end: 17, details: { id: 'b2', service: 'CORTE', serviceId: 's1', locationId: 'loc1', client: 'Lucas Martins', agentName: 'Ângelo Paixão', agentEmail: 'angelo@email.com', date: '30 Setembro, 2025', time: '16:00-17:00', status: 'Aprovado' } },
            { type: 'booked', start: 18, end: 19, details: { id: 'b3', service: 'CORTE', serviceId: 's1', locationId: 'loc2', client: 'Gabriel Costa', agentName: 'Ângelo Paixão', agentEmail: 'angelo@email.com', date: '30 Setembro, 2025', time: '18:00-19:00', status: 'Aprovado' } }
        ]
    },
    {
        agent: agents[2],
        appointments: [
            { type: 'unavailable', start: 8, end: 9 },
            { type: 'booked', start: 12, end: 13, details: { id: 'c1', service: 'CORTE', serviceId: 's1', locationId: 'loc1', client: 'Matheus Pereira', agentName: 'Snake Filho', agentEmail: 'snake@email.com', date: '30 Setembro, 2025', time: '12:00-13:00', status: 'Aprovado' } },
            { type: 'booked', start: 18, end: 19, details: { id: 'c2', service: 'BARBA', serviceId: 's3', locationId: 'loc2', client: 'Thiago Gomes', agentName: 'Snake Filho', agentEmail: 'snake@email.com', date: '30 Setembro, 2025', time: '18:00-19:00', status: 'Cancelado' } }
        ]
    }
];

const upcomingAppointments: UpcomingAppointment[] = [
    { agent: agents[0], agentId: '1', serviceId: 's1', locationId: 'loc1', timeUntil: "em 30 minutos", service: "Corte de Cabelo", date: "26 Setembro, 2025", time: "14:00" },
    { agent: agents[1], agentId: '2', serviceId: 's2', locationId: 'loc2', timeUntil: "em 45 minutos", service: "Barba e Cabelo", date: "26 Setembro, 2025", time: "14:15" },
    { agent: agents[2], agentId: '3', serviceId: 's3', locationId: 'loc1', timeUntil: "em 1 hora", service: "Corte Infantil", date: "26 Setembro, 2025", time: "14:30" },
];

interface DashboardPageProps {
  loggedInAgentId: string | null;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ loggedInAgentId }) => {
    const [selectedAgent, setSelectedAgent] = useState('all');
    const [selectedService, setSelectedService] = useState('all');
    const [selectedLocation, setSelectedLocation] = useState('all');
    const [selectedPreviewService, setSelectedPreviewService] = useState('all');
    const [upcomingLocation, setUpcomingLocation] = useState('all');
    const [upcomingAgent, setUpcomingAgent] = useState('all');
    const [upcomingService, setUpcomingService] = useState('all');
    
    const [viewMode, setViewMode] = useState<'compromissos' | 'disponibilidade'>('compromissos');
    const [isAppointmentModalOpen, setAppointmentModalOpen] = useState(false);
    const [modalData, setModalData] = useState<{
        appointment?: ScheduleSlot['details'];
        newSlot?: { agent: Agent, start: number, date: Date };
    } | null>(null);

    useEffect(() => {
        if (loggedInAgentId) {
            setSelectedAgent(loggedInAgentId);
            setUpcomingAgent(loggedInAgentId);
        } else {
            setSelectedAgent('all');
            setUpcomingAgent('all');
        }
    }, [loggedInAgentId]);

    const handleAppointmentClick = (details: ScheduleSlot['details']) => {
        setModalData({ appointment: details });
        setAppointmentModalOpen(true);
    };

    const handleSlotClick = (slotInfo: { agent: Agent, start: number, date: Date }) => {
        setModalData({ newSlot: slotInfo });
        setAppointmentModalOpen(true);
    };

    const handleUpcomingAppointmentClick = (appointment: UpcomingAppointment) => {
        // Assume a 1-hour duration for upcoming appointments to create a time range
        const startTime = appointment.time;
        const [hour, minute] = startTime.split(':').map(Number);
        const endDate = new Date();
        endDate.setHours(hour + 1, minute);
        const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

        const details: ScheduleSlot['details'] = {
            id: `upcoming-${Date.now()}`, // Create a temporary unique ID
            service: appointment.service,
            client: 'Cliente Exemplo', // Placeholder as this is not in UpcomingAppointment
            agentName: appointment.agent.name,
            agentEmail: 'email@exemplo.com.br', // Placeholder
            date: appointment.date,
            time: `${startTime}-${endTime}`,
            serviceId: appointment.serviceId,
            locationId: appointment.locationId,
            status: 'Aprovado',
        };

        setModalData({ appointment: details });
        setAppointmentModalOpen(true);
    };

    const handleCloseModal = () => {
        setAppointmentModalOpen(false);
        setModalData(null);
    }

    const filteredData = useMemo(() => {
        const agentToFilter = loggedInAgentId || selectedAgent;

        const filteredAppointments = detailedAppointments.filter(app => {
            const agentMatch = agentToFilter === 'all' || app.agentId === agentToFilter;
            const serviceMatch = selectedService === 'all' || app.serviceId === selectedService;
            return agentMatch && serviceMatch;
        });

        let totalGrossRevenue = 0;
        let totalCommissions = 0;

        filteredAppointments.forEach(app => {
            const service = services.find(s => s.id === app.serviceId);
            if (service) {
                totalGrossRevenue += service.price;
                totalCommissions += service.price * (service.commission / 100);
            }
        });

        const totalNetRevenue = totalGrossRevenue - totalCommissions;

        const metrics: PerformanceMetric[] = [
            { title: "Reservas Totais", value: filteredAppointments.length.toString(), isPositive: true, change: "+12.5%" },
            { title: "Receita Líquida", value: `R$${totalNetRevenue.toFixed(2)}`, isPositive: true, change: "+8.2%" },
            { title: "Comissões de Agentes", value: `R$${totalCommissions.toFixed(2)}`, isPositive: false, change: "+15.1%" },
            { title: "Taxa de Ocupação", value: "84%", isPositive: true, change: "+2.1%" },
        ];
        
        return { metrics };

    }, [selectedAgent, selectedService, loggedInAgentId]);
    
    const filteredUpcomingAppointments = useMemo(() => {
        const agentToFilter = loggedInAgentId || upcomingAgent;
        return upcomingAppointments.filter(app => {
            const locationMatch = upcomingLocation === 'all' || app.locationId === upcomingLocation;
            const agentMatch = agentToFilter === 'all' || app.agentId === agentToFilter;
            const serviceMatch = upcomingService === 'all' || app.serviceId === upcomingService;
            return locationMatch && agentMatch && serviceMatch;
        });
    }, [upcomingLocation, upcomingAgent, upcomingService, loggedInAgentId]);

    const filteredAgentSchedules = useMemo(() => {
      if (!loggedInAgentId) return agentSchedules;
      return agentSchedules.filter(schedule => schedule.agent.id === loggedInAgentId);
    }, [loggedInAgentId]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <PerformanceSection 
                        metrics={filteredData.metrics} 
                        agents={agents}
                        services={services}
                        selectedAgent={selectedAgent}
                        setSelectedAgent={setSelectedAgent}
                        selectedService={selectedService}
                        setSelectedService={setSelectedService}
                        loggedInAgentId={loggedInAgentId}
                    />
                </div>
                <div>
                    <UpcomingAppointments 
                        appointments={filteredUpcomingAppointments}
                        locations={locations}
                        agents={agents}
                        services={services}
                        selectedLocation={upcomingLocation}
                        setSelectedLocation={setUpcomingLocation}
                        selectedAgent={upcomingAgent}
                        setSelectedAgent={setUpcomingAgent}
                        selectedService={upcomingService}
                        setSelectedService={setUpcomingService}
                        onAppointmentClick={handleUpcomingAppointmentClick}
                        loggedInAgentId={loggedInAgentId}
                    />
                </div>
            </div>
            
            <PreviewSection 
                schedules={filteredAgentSchedules}
                locations={locations}
                services={services}
                selectedLocation={selectedLocation}
                setSelectedLocation={setSelectedLocation}
                selectedService={selectedPreviewService}
                setSelectedService={setSelectedPreviewService}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onAppointmentClick={handleAppointmentClick}
                onSlotClick={handleSlotClick}
            />
            
            <NewAppointmentModal 
                isOpen={isAppointmentModalOpen} 
                onClose={handleCloseModal} 
                appointmentData={modalData?.appointment}
                newSlotData={modalData?.newSlot}
            />
        </div>
    );
};

export default DashboardPage;