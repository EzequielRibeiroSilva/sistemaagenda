import React, { useState, useMemo, useEffect } from 'react';
import { Edit, Plus, X } from './Icons';

type TimePeriod = { id: number; start: string; end: string };
type DayScheduleData = {
  isActive: boolean;
  periods: TimePeriod[];
};
type ScheduleData = {
  [key: string]: DayScheduleData;
};

// Tipo para os dados vindos da API
interface ScheduleDay {
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
}

const initialSchedule: ScheduleData = {
  'Segunda-feira': { isActive: true, periods: [{ id: 1, start: '08:00', end: '12:00' }, { id: 2, start: '14:00', end: '19:00' }] },
  'Terça': { isActive: true, periods: [{ id: 1, start: '08:00', end: '12:00' }, { id: 2, start: '14:00', end: '20:00' }] },
  'Quarta-feira': { isActive: true, periods: [{ id: 1, start: '08:00', end: '12:00' }, { id: 2, start: '14:00', end: '20:00' }] },
  'Quinta': { isActive: true, periods: [{ id: 1, start: '08:00', end: '12:00' }, { id: 2, start: '14:00', end: '21:00' }] },
  'Sexta-feira': { isActive: true, periods: [{ id: 1, start: '08:00', end: '12:00' }, { id: 2, start: '14:00', end: '21:00' }] },
  'Sábado': { isActive: false, periods: [] },
  'Domingo': { isActive: false, periods: [] },
};

const DayScheduleRow: React.FC<{
  dayName: string;
  schedule: DayScheduleData;
  onToggle: () => void;
  onUpdatePeriods: (periods: TimePeriod[]) => void;
}> = ({ dayName, schedule, onToggle, onUpdatePeriods }) => {
  const [isEditing, setIsEditing] = useState(false); // Todos os dias iniciam fechados
  const { isActive, periods } = schedule;

  const handleAddPeriod = () => {
    onUpdatePeriods([...periods, { id: Date.now(), start: '09:00', end: '17:00' }]);
  };

  const handleRemovePeriod = (id: number) => {
    onUpdatePeriods(periods.filter(p => p.id !== id));
  };

  const handlePeriodChange = (id: number, field: 'start' | 'end', value: string) => {
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
          <button onClick={onToggle} role="switch" aria-checked={isActive} className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${isActive ? 'bg-blue-600' : 'bg-gray-200'}`}>
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
    onChange: legacyOnChange
}) => {
    const [schedule, setSchedule] = useState<ScheduleData>(initialSchedule);

    // Converter dados da API para formato interno (nova interface)
    useEffect(() => {
        if (scheduleData && Array.isArray(scheduleData)) {
            const dayNames = ['Domingo', 'Segunda-feira', 'Terça', 'Quarta-feira', 'Quinta', 'Sexta-feira', 'Sábado'];
            const convertedSchedule: ScheduleData = { ...initialSchedule };

            scheduleData.forEach((dayData) => {
                const dayName = dayNames[dayData.dia_semana];
                if (dayName && dayData.periodos && dayData.periodos.length > 0) {
                    convertedSchedule[dayName] = {
                        isActive: true,
                        periods: dayData.periodos.map((periodo, periodIndex) => ({
                            id: periodIndex + 1,
                            start: periodo.inicio,
                            end: periodo.fim
                        }))
                    };
                }
            });

            setSchedule(convertedSchedule);
        }
    }, [scheduleData]);

    // Suporte para interface legada (CreateAgentPage)
    useEffect(() => {
        if (legacySchedule && typeof legacySchedule === 'object') {
            setSchedule(legacySchedule);
        }
    }, [legacySchedule]);

    const handleUpdateDay = (dayName: string, newDayData: DayScheduleData) => {
        const newSchedule = {
            ...schedule,
            [dayName]: newDayData
        };

        setSchedule(newSchedule);

        // Notificar interface nova (EditAgentPage)
        if (onScheduleChange) {
            const dayNames = ['Domingo', 'Segunda-feira', 'Terça', 'Quarta-feira', 'Quinta', 'Sexta-feira', 'Sábado'];

            const apiScheduleData: ScheduleDay[] = dayNames
                .map((dayName, index) => ({
                    dia_semana: index,
                    is_aberto: newSchedule[dayName]?.isActive || false,
                    periodos: newSchedule[dayName]?.periods.map(period => ({
                        inicio: period.start,
                        fim: period.end
                    })) || []
                }))
                .filter(day => day.is_aberto && day.periodos.length > 0);

            onScheduleChange(apiScheduleData);
        }

        // Notificar interface legada (CreateAgentPage)
        if (legacyOnChange) {
            legacyOnChange(newSchedule);
        }
    };

    const handleToggleDay = (dayName: string) => {
        handleUpdateDay(dayName, {
            ...schedule[dayName],
            isActive: !schedule[dayName].isActive,
        });
    };

    const handleUpdatePeriods = (dayName: string, periods: TimePeriod[]) => {
        handleUpdateDay(dayName, {
            ...schedule[dayName],
            periods: periods
        });
    };
    
    return (
        <div>
            {Object.entries(schedule).map(([dayName, dayData]) => (
                <DayScheduleRow
                    key={dayName}
                    dayName={dayName}
                    schedule={dayData}
                    onToggle={() => handleToggleDay(dayName)}
                    onUpdatePeriods={(periods) => handleUpdatePeriods(dayName, periods)}
                />
            ))}
        </div>
    );
}

export default AgentScheduleEditor;