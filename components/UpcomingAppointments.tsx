
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { UpcomingAppointment, Location, Agent, Service } from '../types';
import { ChevronDown, ChevronRight, Check, MoreHorizontal } from './Icons';

interface FilterDropdownProps {
    label: string;
    options: { value: string; label: string }[];
    selectedValue: string;
    onSelect: (value: string) => void;
    disabled?: boolean;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ label, options, selectedValue, onSelect, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownMenuRef = useRef<HTMLDivElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

    const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
            });
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                buttonRef.current && !buttonRef.current.contains(event.target as Node) &&
                dropdownMenuRef.current && !dropdownMenuRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    const selectedOptionLabel = options.find(opt => opt.value === selectedValue)?.label || options[0]?.label;

    const dropdownMenu = (
        <div
            ref={dropdownMenuRef}
            className="fixed w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-1"
            style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
            }}
        >
            {options.map(option => (
                <a
                    key={option.value}
                    href="#"
                    onClick={(e) => {
                        e.preventDefault();
                        onSelect(option.value);
                        setIsOpen(false);
                    }}
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                    {selectedValue === option.value && <Check className="w-4 h-4 mr-2 text-blue-600" />}
                    <span className={selectedValue !== option.value ? 'ml-6' : ''}>{option.label}</span>
                </a>
            ))}
        </div>
    );

    return (
        <div className="flex-shrink-0">
            <button
                ref={buttonRef}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 min-w-[160px] justify-between disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
                <span className="truncate">{selectedOptionLabel}</span>
                <ChevronDown className={`h-4 w-4 ml-2 text-gray-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && portalRoot && createPortal(dropdownMenu, portalRoot)}
        </div>
    );
};

interface AppointmentItemProps {
    appointment: UpcomingAppointment;
    onClick: (appointment: UpcomingAppointment) => void;
}

const AppointmentItem: React.FC<AppointmentItemProps> = ({ appointment, onClick }) => (
    <div
        onClick={() => onClick(appointment)}
        className="flex items-center p-4 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 cursor-pointer"
    >
        <img src={appointment.agent.avatar} alt={appointment.agent.name} className="w-10 h-10 rounded-full object-cover mr-4" />
        <div className="flex-1">
            <p className="text-xs text-red-500 font-medium">{appointment.timeUntil}</p>
            <p className="font-bold text-gray-800">{appointment.service}</p>
            <p className="text-sm text-gray-500">{appointment.date}, <span className="text-blue-600 font-semibold">{appointment.time}</span></p>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-400" />
    </div>
)

interface UpcomingAppointmentsProps {
  appointments: UpcomingAppointment[];
  locations: Location[];
  agents: Agent[];
  services: { id: string; name: string }[];
  selectedLocation: string;
  setSelectedLocation: (id: string) => void;
  selectedAgent: string;
  setSelectedAgent: (id: string) => void;
  selectedService: string;
  setSelectedService: (id: string) => void;
  onAppointmentClick: (appointment: UpcomingAppointment) => void;
  loggedInAgentId: string | null;
}

const UpcomingAppointments: React.FC<UpcomingAppointmentsProps> = ({ 
    appointments,
    locations,
    agents,
    services,
    selectedLocation,
    setSelectedLocation,
    selectedAgent,
    setSelectedAgent,
    selectedService,
    setSelectedService,
    onAppointmentClick,
    loggedInAgentId
}) => {
  const locationOptions = [
      { value: 'all', label: 'Todos Os Locais' },
      ...locations.map(loc => ({ value: loc.id, label: loc.name }))
  ];
  
  const agentOptions = [
      { value: 'all', label: 'Todos os Agentes' },
      ...agents.map(agent => ({ value: agent.id, label: agent.name }))
  ];

  const serviceOptions = [
      { value: 'all', label: 'Todos os Serviços' },
      ...services.map(service => ({ value: service.id, label: service.name }))
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Próximo</h3>
            <button className="p-2 -mr-2 text-gray-500 hover:text-gray-700 lg:hidden">
                <MoreHorizontal className="h-5 w-5" />
            </button>
        </div>
        <div className="hidden lg:flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            <FilterDropdown label="Locais" options={locationOptions} selectedValue={selectedLocation} onSelect={setSelectedLocation} />
            <FilterDropdown label="Agentes" options={agentOptions} selectedValue={selectedAgent} onSelect={setSelectedAgent} disabled={!!loggedInAgentId} />
            <FilterDropdown label="Serviços" options={serviceOptions} selectedValue={selectedService} onSelect={setSelectedService} />
        </div>
      </div>
      <div className="relative flex-1 overflow-y-auto">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-lg"></div>
        <div>
            {appointments.length > 0 ? (
              appointments.map((app, index) => (
                  <AppointmentItem key={index} appointment={app} onClick={onAppointmentClick} />
              ))
            ) : (
              <p className="text-center text-gray-500 p-8">Nenhum compromisso encontrado.</p>
            )}
        </div>
      </div>
    </div>
  );
};

export default UpcomingAppointments;
