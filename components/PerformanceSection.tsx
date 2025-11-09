import React, { useState, useRef, useEffect } from 'react';
import type { PerformanceMetric, Agent, Service, Location } from '../types';
import { ChevronDown, Info, Check, MoreHorizontal } from './Icons';
import DatePicker from './DatePicker';

interface PerformanceCardProps {
  metric: PerformanceMetric;
}

const PerformanceCard: React.FC<PerformanceCardProps> = ({ metric }) => (
  <div className="bg-white p-3 sm:p-6 rounded-lg flex-1 relative border sm:border-0 border-gray-100">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-gray-500 text-xs sm:text-sm">{metric.title}</p>
        <div className="flex items-baseline mt-1 sm:mt-2">
          <p className="text-xl sm:text-3xl font-bold">{metric.value}</p>
          <span className={`ml-2 text-xs sm:text-sm font-semibold ${metric.isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {metric.change}
          </span>
        </div>
      </div>
       <button className="hidden sm:block text-gray-400 hover:text-gray-600 absolute top-4 right-4">
        <Info className="h-4 w-4" />
      </button>
    </div>
  </div>
);

interface FilterDropdownProps {
    label: string;
    options: { value: string; label: string }[];
    selectedValue: string;
    onSelect: (value: string) => void;
    disabled?: boolean;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ label, options, selectedValue, onSelect, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    const selectedOptionLabel = options.find(opt => opt.value === selectedValue)?.label || `Todos Os ${label}`;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 min-w-[160px] justify-between disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
                <span>
                    {selectedValue === 'all' 
                        ? `Todos Os ${label}` 
                        : label 
                            ? `${label.slice(0, -1)}: ${selectedOptionLabel}` 
                            : selectedOptionLabel
                    }
                </span>
                <ChevronDown className={`h-4 w-4 ml-2 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-10 py-1">
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
            )}
        </div>
    );
};

interface PerformanceSectionProps {
  metrics: PerformanceMetric[];
  locations: Location[];
  agents: Agent[];
  services: Service[];
  selectedLocation: string;
  setSelectedLocation: (id: string) => void;
  selectedAgent: string;
  setSelectedAgent: (id: string) => void;
  selectedService: string;
  setSelectedService: (id: string) => void;
  loggedInAgentId: string | null;
  userRole: 'ADMIN' | 'AGENTE';
  isMultiPlan: boolean;
  onDateRangeChange?: (range: { startDate: Date | null; endDate: Date | null }) => void;
}

const PerformanceSection: React.FC<PerformanceSectionProps> = ({ 
    metrics, 
    locations,
    agents,
    services,
    selectedLocation,
    setSelectedLocation,
    selectedAgent,
    setSelectedAgent,
    selectedService,
    setSelectedService,
    loggedInAgentId,
    userRole,
    isMultiPlan,
    onDateRangeChange
}) => {
  // Estado do período (mês atual por padrão)
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  const [dateRange, setDateRange] = useState<{ startDate: Date | null; endDate: Date | null }>({
    startDate: firstDayOfMonth,
    endDate: lastDayOfMonth
  });

  // Notificar mudanças no período
  useEffect(() => {
    if (onDateRangeChange) {
      onDateRangeChange(dateRange);
    }
  }, [dateRange, onDateRangeChange]);

  // Opções de filtro
  // ✅ CORREÇÃO: Remover opção "Todos os Locais" (igual CalendarPage)
  // Sempre deve haver um local selecionado
  const locationOptions = locations.map(location => ({ 
      value: location.id, 
      label: location.name 
  }));

  const agentOptions = [
      { value: 'all', label: 'Todos os Agentes' },
      ...agents.map(agent => ({ value: agent.id, label: agent.name }))
  ];

  const serviceOptions = [
      { value: 'all', label: 'Todos os Serviços' },
      ...services.map(service => ({ value: service.id, label: service.name }))
  ];
  
  // Determinar se o dropdown de Local deve ser exibido e se deve ser desabilitado
  const shouldShowLocationFilter = isMultiPlan || locations.length > 1;
  const shouldDisableLocationFilter = locations.length === 1;
  
  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold">Desempenho</h2>
        <div className="hidden lg:flex items-center gap-2 flex-wrap">
          {/* ✅ DROPDOWN DE LOCAL - Aparece ANTES do dropdown de Agentes */}
          {shouldShowLocationFilter && (
            <FilterDropdown 
              label=""
              options={locationOptions} 
              selectedValue={selectedLocation} 
              onSelect={setSelectedLocation} 
              disabled={shouldDisableLocationFilter}
            />
          )}
          
          {/* Dropdown de Agentes */}
          <FilterDropdown 
            label="Agentes" 
            options={agentOptions} 
            selectedValue={selectedAgent} 
            onSelect={setSelectedAgent} 
            disabled={!!loggedInAgentId} 
          />
          
          {/* Dropdown de Serviços */}
          <FilterDropdown 
            label="Serviços" 
            options={serviceOptions} 
            selectedValue={selectedService} 
            onSelect={setSelectedService} 
          />
          
          {/* Seletor de Período */}
          <DatePicker 
            mode="range" 
            selectedRange={dateRange} 
            onDateChange={(range) => setDateRange(range as { startDate: Date | null; endDate: Date | null })} 
          />
        </div>
        <button className="p-2 -mr-2 text-gray-500 hover:text-gray-700 lg:hidden">
            <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <PerformanceCard key={index} metric={metric} />
        ))}
      </div>
    </div>
  );
};

export default PerformanceSection;
