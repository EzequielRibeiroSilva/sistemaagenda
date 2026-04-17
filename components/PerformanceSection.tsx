import React, { useState, useRef, useEffect } from 'react';
import type { PerformanceMetric, Agent, Service, Location } from '../types';
import { ChevronDown, Info, Check, MoreHorizontal } from './Icons';
import DatePicker from './DatePicker';

interface PerformanceCardProps {
  metric: PerformanceMetric;
  onClick?: () => void;
}

const PerformanceCard: React.FC<PerformanceCardProps> = ({ metric, onClick }) => (
  <div
    className={`bg-white p-4 sm:p-6 rounded-lg flex-1 relative border border-gray-200 hover:border-[#2663EB] transition-all duration-200 hover:shadow-md overflow-hidden min-h-[160px] flex flex-col justify-between ${onClick ? 'cursor-pointer' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={(e) => {
      if (onClick && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onClick();
      }
    }}
  >
    {/* Barra superior azul - identidade visual do sistema */}
    <div className="absolute top-0 left-0 right-0 h-1 bg-[#2663EB]"></div>
    
    <div className="flex justify-between items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-gray-500 text-xs sm:text-sm font-medium">{metric.title}</p>
        <div className="flex items-baseline mt-2">
          <p className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{metric.value}</p>
        </div>
        {metric.subtitle && (
          <p className="text-xs text-gray-400 mt-2">{metric.subtitle}</p>
        )}
      </div>

      {metric.icon && (
        <div className="flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-sm font-semibold">
            {metric.icon}
          </div>
        </div>
      )}
    </div>

    {Array.isArray(metric.breakdown) && metric.breakdown.length > 0 && (
      <div className="mt-4 space-y-1">
        {metric.breakdown.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 text-xs">
            <div className="text-gray-500">{item.label}</div>
            <div className={`font-semibold ${item.colorClassName || 'text-gray-700'}`}>{item.value}</div>
          </div>
        ))}
      </div>
    )}
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
  clubMetrics?: PerformanceMetric[];
  clubIntelligence?: {
    mrr: number;
    ticket_medio_assinante: number;
    ticket_medio_comum: number;
    churn_pct: number;
    canceladas_periodo: number;
    ativas_atuais: number;
  };
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
  onMetricClick?: (metric: PerformanceMetric) => void;
}

const PerformanceSection: React.FC<PerformanceSectionProps> = ({ 
    metrics, 
    clubMetrics,
    clubIntelligence,
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
    onDateRangeChange,
    onMetricClick
}) => {
  // Estado do período (mês atual por padrão)
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  
  const [dateRange, setDateRange] = useState<{ startDate: Date | null; endDate: Date | null }>({
    startDate: firstDayOfMonth,
    endDate: lastDayOfMonth
  });

  // ✅ CORREÇÃO CRÍTICA: Notificar período inicial na montagem
  useEffect(() => {
    if (onDateRangeChange && dateRange.startDate && dateRange.endDate) {

      onDateRangeChange(dateRange);
    }
  }, [dateRange.startDate, dateRange.endDate, onDateRangeChange]);

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
  
  const clubIntelligenceCards: PerformanceMetric[] = React.useMemo(() => {
    if (!clubIntelligence) return [];
    const formatMoney = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return [
      {
        title: 'MRR (Clube)',
        value: formatMoney(clubIntelligence.mrr),
        isPositive: clubIntelligence.mrr >= 0,
        change: '',
        icon: '💰',
        subtitle: 'Receita recorrente no período'
      },
      {
        title: 'Ticket Médio (Assinante vs Comum)',
        value: `${formatMoney(clubIntelligence.ticket_medio_assinante)} vs ${formatMoney(clubIntelligence.ticket_medio_comum)}`,
        isPositive: clubIntelligence.ticket_medio_assinante >= clubIntelligence.ticket_medio_comum,
        change: '',
        icon: '🎟️',
        subtitle: 'Caixa médio por membro vs cliente comum'
      },
      {
        title: 'Churn (Clube)',
        value: `${clubIntelligence.churn_pct.toFixed(1)}%`,
        isPositive: clubIntelligence.churn_pct < 10,
        change: '',
        icon: '📉',
        subtitle: `${clubIntelligence.canceladas_periodo} canceladas | ${clubIntelligence.ativas_atuais} ativas`
      }
    ];
  }, [clubIntelligence]);

  const combinedClubMetrics: PerformanceMetric[] = React.useMemo(() => {
    const base = Array.isArray(clubMetrics) ? clubMetrics : [];
    return [...base, ...clubIntelligenceCards];
  }, [clubMetrics, clubIntelligenceCards]);

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
        <button
          className="p-2 -mr-2 text-gray-500 hover:text-gray-700 lg:hidden"
          onClick={() => setIsMobileFiltersOpen(true)}
          aria-label="Abrir filtros"
        >
            <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      {isMobileFiltersOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-40 z-30 lg:hidden"
            onClick={() => setIsMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
            <div className="bg-white rounded-t-2xl shadow-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-base font-semibold">Filtros</div>
                <button
                  className="text-sm text-gray-600 hover:text-gray-900"
                  onClick={() => setIsMobileFiltersOpen(false)}
                  aria-label="Fechar filtros"
                >
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {shouldShowLocationFilter && (
                  <FilterDropdown
                    label=""
                    options={locationOptions}
                    selectedValue={selectedLocation}
                    onSelect={setSelectedLocation}
                    disabled={shouldDisableLocationFilter}
                  />
                )}

                <FilterDropdown
                  label="Agentes"
                  options={agentOptions}
                  selectedValue={selectedAgent}
                  onSelect={setSelectedAgent}
                  disabled={!!loggedInAgentId}
                />

                <FilterDropdown
                  label="Serviços"
                  options={serviceOptions}
                  selectedValue={selectedService}
                  onSelect={setSelectedService}
                />

                <DatePicker
                  mode="range"
                  selectedRange={dateRange}
                  onDateChange={(range) => setDateRange(range as { startDate: Date | null; endDate: Date | null })}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metrics.map((metric, index) => (
          <PerformanceCard
            key={index}
            metric={metric}
            onClick={onMetricClick ? () => onMetricClick(metric) : undefined}
          />
        ))}
        {Array.isArray(combinedClubMetrics) && combinedClubMetrics.map((metric, index) => (
          <PerformanceCard key={`club-${index}`} metric={metric} />
        ))}
      </div>
    </div>
  );
};

export default PerformanceSection;
