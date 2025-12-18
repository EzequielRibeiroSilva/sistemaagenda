import React, { useState, useMemo, useEffect } from 'react';
import { Edit, Plus, X } from './Icons';

type TimePeriod = { id: string; start: string; end: string };
type DayScheduleData = {
  isActive: boolean;
  periods: TimePeriod[];
};
type ScheduleData = {
  [key: string]: DayScheduleData;
};

// Tipo para os dados vindos da API
interface ScheduleDay {
  dia_semana: number;
  is_aberto?: boolean; // Opcional, será calculado se não existir
  periodos: { start: string; end: string }[]; // ✅ CORREÇÃO: Backend usa "start" e "end"
}

// ✅ ETAPA 5: Interface para limites de horário da unidade
interface UnitScheduleLimit {
  dia_semana: number;
  is_aberto: boolean;
  periodos: { inicio: string; fim: string }[];
}

interface AgentScheduleEditorProps {
  // Nova interface (para EditAgentPage)
  scheduleData?: ScheduleDay[];
  onScheduleChange?: (scheduleData: ScheduleDay[]) => void;

  // Interface legada (para CreateAgentPage)
  schedule?: any;
  onChange?: (schedule: any) => void;
  
  // ✅ ETAPA 5: Limites de horário da unidade
  unitScheduleLimits?: UnitScheduleLimit[];
}

const DAY_MAP = ['Domingo', 'Segunda-feira', 'Terça', 'Quarta-feira', 'Quinta', 'Sexta-feira', 'Sábado'];

const generateId = () => Math.random().toString(36).substr(2, 9);

const DayScheduleRow: React.FC<{
  dayName: string;
  schedule: DayScheduleData;
  onToggle: () => void;
  onUpdatePeriods: (periods: TimePeriod[]) => void;
  unitLimit?: { is_aberto: boolean; periodos: { inicio: string; fim: string }[] };
}> = ({ dayName, schedule, onToggle, onUpdatePeriods, unitLimit }) => {
  const [isEditing, setIsEditing] = useState(false); // Todos os dias iniciam fechados
  const { isActive, periods } = schedule;

  const handleAddPeriod = () => {
    onUpdatePeriods([...periods, { id: generateId(), start: '09:00', end: '17:00' }]);
    setIsEditing(true);
  };

  const handleRemovePeriod = (id: string) => {
    onUpdatePeriods(periods.filter(p => p.id !== id));
  };

  const handlePeriodChange = (id: string, field: 'start' | 'end', value: string) => {
    // ✅ ETAPA 5: Validar contra limites da unidade
    const unitPeriods = Array.isArray(unitLimit?.periodos) ? unitLimit.periodos : [];
    if (unitLimit?.is_aberto && unitPeriods.length > 0) {
      const isValid = unitPeriods
        .filter((limite) => typeof limite?.inicio === 'string' && typeof limite?.fim === 'string')
        .some((limite) => value >= limite.inicio && value <= limite.fim);

      if (!isValid) {
        const label = unitPeriods
          .filter((p) => typeof p?.inicio === 'string' && typeof p?.fim === 'string')
          .map((p) => `${p.inicio}-${p.fim}`)
          .join(', ');
        alert(`Horário inválido! ${dayName} - A unidade funciona apenas nos seguintes horários: ${label}`);
        return;
      }
    }
    
    onUpdatePeriods(periods.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const timeSummary = useMemo(() => {
    if (!isActive || periods.length === 0) return 'Dia de folga';
    return periods.map(p => `${p.start}-${p.end}`).join(' ');
  }, [isActive, periods]);

  return (
    <div className="border-t border-gray-200 first:border-t-0">
      <div className="flex items-center justify-between p-4 min-h-[72px]">
        <div className="flex items-center">
          <button
            onClick={onToggle}
            role="switch"
            aria-checked={isActive}
            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${isActive ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className={`ml-4 font-semibold text-base ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>{dayName}</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className={`text-sm font-mono ${isActive ? 'text-gray-600' : 'text-gray-400'}`}>{timeSummary}</span>
          <button onClick={() => setIsEditing(!isEditing)} disabled={!isActive} className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
            <Edit className="w-5 h-5 text-blue-600" />
          </button>
        </div>
      </div>

      {isEditing && isActive && (
        <div className="p-4 bg-gray-50/70 border-t border-gray-200 space-y-4">
          {periods.map((period, index) => (
            <div key={period.id} className="relative pl-4">
              {index > 0 && (
                  <button onClick={() => handleRemovePeriod(period.id)} className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-white border border-gray-300 rounded-full hover:bg-red-50 text-gray-500 hover:text-red-500 z-10">
                    <X className="w-4 h-4" />
                  </button>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-white p-3 border border-gray-200 rounded-lg">
                  <span className="text-gray-500">Início</span>
                  <input type="time" value={period.start} onChange={(e) => handlePeriodChange(period.id, 'start', e.target.value)} className="font-semibold text-gray-800 border bg-gray-50 rounded px-2 py-1 w-28 text-center" />
                </div>
                <div className="flex items-center justify-between bg-white p-3 border border-gray-200 rounded-lg">
                  <span className="text-gray-500">Fim</span>
                  <input type="time" value={period.end} onChange={(e) => handlePeriodChange(period.id, 'end', e.target.value)} className="font-semibold text-gray-800 border bg-gray-50 rounded px-2 py-1 w-28 text-center" />
                </div>
              </div>
            </div>
          ))}
          <div className="pl-4">
            <button onClick={handleAddPeriod} className="w-full flex items-center justify-center p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors">
                <Plus className="w-5 h-5 mr-2" />
                Adicionar outro período de trabalho para {dayName}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


const AgentScheduleEditor: React.FC<AgentScheduleEditorProps> = ({
    scheduleData,
    onScheduleChange,
    schedule: legacySchedule,
    onChange: legacyOnChange,
    unitScheduleLimits
}) => {
    console.log('🟡 [AgentScheduleEditor] Componente montado/atualizado com props:', {
        hasScheduleData: !!scheduleData,
        hasLegacySchedule: !!legacySchedule,
        legacyScheduleType: typeof legacySchedule,
        legacyScheduleKeys: legacySchedule ? Object.keys(legacySchedule) : [],
        hasUnitScheduleLimits: !!unitScheduleLimits,
        unitScheduleLimitsLength: unitScheduleLimits?.length || 0
    });
    
    const [schedule, setSchedule] = useState<ScheduleData>({});
    const [isReady, setIsReady] = useState(false);

    // Efeito para carregar dados (Prioridade: Props novas -> Props legadas -> Default Vazio)
    useEffect(() => {
        let newSchedule: ScheduleData = {};
        const baseDays = DAY_MAP;

        // Caso 1: Dados vindos da API (Edit Mode)
        if (scheduleData && Array.isArray(scheduleData)) {
            baseDays.forEach((dayName) => {
                newSchedule[dayName] = { isActive: false, periods: [] };
            });

            scheduleData.forEach((dayData) => {
                const dayName = baseDays[dayData.dia_semana];
                if (dayName) {
                    const periods = dayData.periodos ? dayData.periodos.map((p: any) => ({
                        id: generateId(),
                        start: p.start || p.inicio || '09:00',
                        end: p.end || p.fim || '17:00'
                    })) : [];

                    newSchedule[dayName] = {
                        isActive: periods.length > 0 || !!dayData.is_aberto,
                        periods: periods
                    };
                }
            });
        } 
        // Caso 2: Legacy (Create Mode com estado prévio)
        else if (legacySchedule && Object.keys(legacySchedule).length > 0) {
            newSchedule = legacySchedule;
        } 
        // Caso 3: Inicialização Padrão (Create Mode limpo)
        else {
            baseDays.forEach(day => {
                const isWorkDay = day !== 'Sábado' && day !== 'Domingo';
                newSchedule[day] = {
                    isActive: isWorkDay,
                    periods: isWorkDay ? [{ id: generateId(), start: '09:00', end: '18:00' }] : []
                };
            });
        }

        setSchedule(newSchedule);
        setIsReady(true);
    }, [scheduleData, legacySchedule]);

    const handleUpdateDay = (dayName: string, newDayData: DayScheduleData) => {
        const newSchedule = {
            ...schedule,
            [dayName]: newDayData
        };

        setSchedule(newSchedule);

        // Notificar interface nova (EditAgentPage)
        if (onScheduleChange) {
            const dayNames = ['Domingo', 'Segunda-feira', 'Terça', 'Quarta-feira', 'Quinta', 'Sexta-feira', 'Sábado'];

            // ⚠️ REGRA CRÍTICA: Backend SEMPRE espera 7 dias, mesmo os fechados
            // Dias fechados devem ter: is_aberto: false, periodos: []
            const apiScheduleData: ScheduleDay[] = dayNames
                .map((dayName, index) => {
                    const daySchedule = newSchedule[dayName];
                    const isActive = daySchedule?.isActive || false;
                    const hasPeriods = daySchedule?.periods && daySchedule.periods.length > 0;

                    return {
                        dia_semana: index,
                        is_aberto: isActive && hasPeriods,
                        periodos: (isActive && hasPeriods) ? daySchedule.periods.map(period => ({
                            inicio: period.start,
                            fim: period.end
                        })) : []
                    };
                });
                // ❌ REMOVIDO .filter() - Backend precisa receber TODOS os 7 dias

            onScheduleChange(apiScheduleData);
        }

        // Notificar interface legada (CreateAgentPage)
        if (legacyOnChange) {
            legacyOnChange(newSchedule);
        }
    };

    const handleToggleDay = (dayName: string) => {
        const newState = {
            ...schedule[dayName],
            isActive: !schedule[dayName].isActive,
        };
        handleUpdateDay(dayName, newState);
    };

    const handleUpdatePeriods = (dayName: string, periods: TimePeriod[]) => {
        handleUpdateDay(dayName, {
            ...schedule[dayName],
            periods: periods,
            // Ativar automaticamente o dia se há períodos, desativar se não há
            isActive: periods.length > 0
        });
    };
    
    if (!isReady) {
        return <div className="p-4 text-center text-gray-400">Carregando horários...</div>;
    }

    return (
        <div className="w-full bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            {DAY_MAP.map((dayName, index) => {
                const dayData = schedule[dayName] || { isActive: false, periods: [] };
                
                // Encontrar limites da unidade para este dia
                const limit = unitScheduleLimits?.find(u => u.dia_semana === index);
                
                return (
                    <DayScheduleRow
                        key={dayName}
                        dayName={dayName}
                        schedule={dayData}
                        unitLimit={limit}
                        onToggle={() => handleUpdateDay(dayName, { ...dayData, isActive: !dayData.isActive })}
                        onUpdatePeriods={(periods) => handleUpdateDay(dayName, { ...dayData, periods, isActive: periods.length > 0 })}
                    />
                );
            })}
        </div>
    );
}

export default AgentScheduleEditor;