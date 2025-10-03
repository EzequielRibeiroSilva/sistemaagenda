
import React, { useState, useMemo } from 'react';
import type { Agent, Service, Appointment, UnavailableBlock } from '../types';
import { ChevronLeft, ChevronRight, Check, MoreHorizontal, ChevronDown } from './Icons';

const agents: Agent[] = [
    { id: '1', name: 'Eduardo Soares', avatar: 'https://picsum.photos/id/1005/100/100' },
    { id: '2', name: 'Ângelo Paixão', avatar: 'https://picsum.photos/id/1011/100/100' },
    { id: '3', name: 'Snake Filho', avatar: 'https://picsum.photos/id/1012/100/100' },
];

const services: Service[] = [
    { id: 'corte', name: 'CORTE', color: 'bg-blue-600', textColor: 'text-white' },
    { id: 'barba', name: 'CORTE + BARBA', color: 'bg-cyan-500', textColor: 'text-white' },
];

const appointments: Appointment[] = [
    { id: 'a1', agentId: '1', serviceId: 'corte', startTime: '14:00', endTime: '15:00' },
    { id: 'a2', agentId: '1', serviceId: 'corte', startTime: '15:00', endTime: '16:00' },
    { id: 'a3', agentId: '1', serviceId: 'corte', startTime: '17:00', endTime: '18:00' },
    { id: 'a4', agentId: '1', serviceId: 'corte', startTime: '18:00', endTime: '19:00' },
    { id: 'a5', agentId: '1', serviceId: 'barba', startTime: '20:00', endTime: '21:00' },

    { id: 'b1', agentId: '3', serviceId: 'corte', startTime: '09:00', endTime: '10:00' },
    { id: 'b2', agentId: '3', serviceId: 'corte', startTime: '10:00', endTime: '11:00' },
    { id: 'b3', agentId: '3', serviceId: 'corte', startTime: '14:00', endTime: '15:00' },
    { id: 'b4', agentId: '3', serviceId: 'corte', startTime: '17:00', endTime: '18:00' },
    { id: 'b5', agentId: '3', serviceId: 'corte', startTime: '18:00', endTime: '19:00' },
];

const unavailableBlocks: UnavailableBlock[] = [
    { id: 'u1', agentId: '1', startTime: '12:00', endTime: '14:00' },
    { id: 'u2', agentId: '2', startTime: '08:00', endTime: '13:00' },
];

const ViewDropdown: React.FC<{
  options: string[],
  selected: string,
  onSelect: (option: string) => void
}> = ({ options, selected, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button onClick={() => setIsOpen(!isOpen)} className="flex items-center bg-white border border-blue-600 text-blue-600 px-4 py-1.5 rounded-lg text-sm font-semibold">
                {selected}
                <ChevronDown className="h-4 w-4 ml-2" />
            </button>
            {isOpen && (
                <div className="absolute top-full mt-2 w-40 bg-gray-800 text-white rounded-lg shadow-xl z-10">
                    {options.map(option => (
                        <button
                            key={option}
                            onClick={() => {
                                onSelect(option);
                                setIsOpen(false);
                            }}
                            className="w-full text-left flex items-center px-4 py-2 hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg"
                        >
                            {selected === option && <Check className="h-4 w-4 mr-2" />}
                            <span className={selected !== option ? 'ml-6' : ''}>{option}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

interface CalendarPageProps {
  loggedInAgentId: string | null;
}

const CalendarPage: React.FC<CalendarPageProps> = ({ loggedInAgentId }) => {
    const [currentDate, setCurrentDate] = useState(new Date(2025, 8, 26));
    const [view, setView] = useState('Dia');
    const [showFilters, setShowFilters] = useState(false);

    const START_HOUR = 8;
    const END_HOUR = 21;
    const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);

    const displayedAgents = useMemo(() => {
        if (loggedInAgentId) {
            return agents.filter(agent => agent.id === loggedInAgentId);
        }
        return agents;
    }, [loggedInAgentId]);

    const timeToPercentage = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        const totalMinutes = (h + m / 60) - START_HOUR;
        const totalDuration = END_HOUR - START_HOUR;
        return (totalMinutes / totalDuration) * 100;
    };

    const monthDays = useMemo(() => {
        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, i) => i + 1);
    }, [currentDate]);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-3xl text-gray-400 font-light">{currentDate.getFullYear()}</p>
                        <h1 className="text-3xl text-blue-600 font-bold">
                            {currentDate.toLocaleString('pt-BR', { month: 'long' })} {currentDate.getDate()}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50">
                            <span className="relative flex h-2 w-2 mr-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            Hoje
                        </button>
                        <button className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                            <ChevronLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <button className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                            <ChevronRight className="h-5 w-5 text-gray-600" />
                        </button>
                        <ViewDropdown
                            options={['Dia', 'Semana', 'Mês', 'Lista']}
                            selected={view}
                            onSelect={setView}
                        />
                        <button onClick={() => setShowFilters(!showFilters)} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                            <MoreHorizontal className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                </div>
                 <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center">
                    </div>
                    {showFilters && (
                         <div className="flex items-center gap-2">
                            <button className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50">
                                Serviços: Todos <ChevronDown className="h-4 w-4 ml-2 text-gray-500" />
                            </button>
                             <button disabled={!!loggedInAgentId} className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed">
                                Agentes: Todos <ChevronDown className="h-4 w-4 ml-2 text-gray-500" />
                            </button>
                        </div>
                    )}
                 </div>
            </div>

            {/* Day Scroller */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <button><ChevronLeft className="h-5 w-5 text-gray-400" /></button>
                <div className="flex items-center gap-1 overflow-x-auto mx-2">
                {monthDays.map(day => (
                    <button key={day} className={`h-8 w-8 flex-shrink-0 rounded-full text-sm font-medium ${day === currentDate.getDate() ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                        {day}
                    </button>
                ))}
                </div>
                <button><ChevronRight className="h-5 w-5 text-gray-400" /></button>
            </div>
            
            {/* Calendar Grid */}
            <div className="flex-1 overflow-auto p-4">
                <div className="flex">
                    {/* Time Column */}
                    <div className="w-20 text-sm text-right pr-2">
                        <div className="h-10"></div> {/* Spacer for header */}
                        {hours.map(hour => (
                            <div key={hour} className="h-16 -mt-2.5">
                                <span className="text-gray-500">{hour}:00</span>
                            </div>
                        ))}
                    </div>
                    {/* Agent Columns */}
                    <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${displayedAgents.length}, minmax(0, 1fr))` }}>
                        {displayedAgents.map(agent => (
                            <div key={agent.id} className="relative border-l border-gray-200">
                                {/* Agent Header */}
                                <div className="flex items-center gap-2 p-2 h-10 sticky top-0 bg-white z-10 border-b border-gray-200 -mt-4 pt-0">
                                    <img src={agent.avatar} alt={agent.name} className="w-6 h-6 rounded-full" />
                                    <span className="text-sm font-medium text-gray-800">{agent.name}</span>
                                </div>
                                
                                {/* Background Lines */}
                                <div className="absolute inset-0 top-10">
                                {hours.slice(1).map(hour => (
                                    <div key={`line-${hour}`} className="h-16 border-t border-gray-200"></div>
                                ))}
                                </div>

                                {/* Appointments & Blocks */}
                                {appointments.filter(a => a.agentId === agent.id).map(app => {
                                    const service = services.find(s => s.id === app.serviceId);
                                    if (!service) return null;
                                    const top = timeToPercentage(app.startTime);
                                    const height = timeToPercentage(app.endTime) - top;
                                    return (
                                        <div key={app.id} className={`absolute w-full p-2 rounded-lg ${service.color} ${service.textColor}`} style={{ top: `calc(${top}% + 40px)`, height: `${height}%` }}>
                                            <p className="font-bold text-xs">{service.name}</p>
                                            <p className="text-xs">{app.startTime} - {app.endTime}</p>
                                        </div>
                                    )
                                })}

                                {unavailableBlocks.filter(b => b.agentId === agent.id).map(block => {
                                    const top = timeToPercentage(block.startTime);
                                    const height = timeToPercentage(block.endTime) - top;
                                    return (
                                        <div key={block.id} className="absolute w-full bg-red-100 rounded-lg" style={{ top: `calc(${top}% + 40px)`, height: `${height}%` }}>
                                             <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)', backgroundSize: '10px 10px' }}></div>
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CalendarPage;
