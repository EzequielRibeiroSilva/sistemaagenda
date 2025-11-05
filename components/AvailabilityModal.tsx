// FIX: Corrected the import statement for React and its hooks.
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ChevronUp } from './Icons';
import type { Agent } from '../types';

const API_BASE_URL = 'http://localhost:3000/api';

interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (dateTime: { date: Date, time: string }) => void;
  agentName: string | null;
  agentId: number | null; // ✅ ADICIONADO: ID do agente para buscar disponibilidade real
  unidadeId?: number; // ✅ ADICIONADO: ID da unidade para filtrar horários
}

const AvailabilityModal: React.FC<AvailabilityModalProps> = ({ isOpen, onClose, onSelect, agentName, agentId, unidadeId }) => {
  const portalRoot = document.getElementById('portal-root');
  const [daysToShow, setDaysToShow] = useState(30);
  const [availabilityData, setAvailabilityData] = useState<{ [date: string]: string[] }>({});
  const [isLoading, setIsLoading] = useState(false);

  const days = useMemo(() => {
    const dayArray = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    for (let i = 0; i < daysToShow; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dayArray.push(date);
    }
    return dayArray;
  }, [daysToShow]);

  // ✅ FUNÇÃO PARA BUSCAR DISPONIBILIDADE REAL DA API
  const fetchAvailabilityForDate = async (date: string, agenteId: number) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.error('[AvailabilityModal] Token não encontrado');
        return [];
      }

      // ✅ CORREÇÃO: Passar unidade_id para a API filtrar corretamente
      const url = unidadeId 
        ? `${API_BASE_URL}/public/agentes/${agenteId}/disponibilidade?data=${date}&duration=60&unidade_id=${unidadeId}`
        : `${API_BASE_URL}/public/agentes/${agenteId}/disponibilidade?data=${date}&duration=60`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`[AvailabilityModal] Erro ao buscar disponibilidade: ${response.status}`);
        return [];
      }

      const data = await response.json();
      if (data.success && data.data.slots_disponiveis) {
        return data.data.slots_disponiveis.map((slot: any) => slot.hora_inicio);
      }

      return [];
    } catch (error) {
      console.error('[AvailabilityModal] Erro ao buscar disponibilidade:', error);
      return [];
    }
  };

  // ✅ EFFECT PARA CARREGAR DISPONIBILIDADE QUANDO MODAL ABRE
  useEffect(() => {
    if (isOpen && agentId) {
      setIsLoading(true);
      setAvailabilityData({});

      // Buscar disponibilidade para TODOS os dias (não apenas 7)
      const loadAvailability = async () => {
        const newAvailabilityData: { [date: string]: string[] } = {};

        // ✅ CORREÇÃO CRÍTICA: Carregar TODOS os dias, não apenas 7
        for (const day of days) { // Carregar todos os dias disponíveis
          const dateStr = day.toISOString().split('T')[0]; // YYYY-MM-DD
          const slots = await fetchAvailabilityForDate(dateStr, agentId);
          newAvailabilityData[dateStr] = slots;
        }

        setAvailabilityData(newAvailabilityData);
        setIsLoading(false);
      };

      loadAvailability();
    }
  }, [isOpen, agentId, days]);

  const groupedDays = useMemo(() => {
      return days.reduce((acc, date) => {
          const monthYear = date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
          if (!acc[monthYear]) {
              acc[monthYear] = [];
          }
          (acc[monthYear] as Date[]).push(date);
          return acc;
      }, {} as Record<string, Date[]>);
  }, [days]);

  const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 8 AM to 9 PM (21h)

  const toISODateString = (date: Date) => {
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  // ✅ USAR DADOS REAIS EM VEZ DE MOCK
  // const bookedSlotsForAgent = (agentName && mockBookedSlots[agentName]) || {};
  
  if (!isOpen || !portalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose} aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Disponibilidade {agentName && `- ${agentName}`}</h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="sticky top-0 bg-white z-20 px-4 py-2 border-b border-gray-200">
             <div className="flex items-center text-center text-xs font-semibold text-gray-600">
                 <div className="w-28 flex-shrink-0"></div>
                 {hours.map(hour => (
                     <div key={hour} className="flex-1">{hour}:00</div>
                 ))}
             </div>
          </div>
          <div className="px-4 pb-4">
             <div className="space-y-1">
                {Object.entries(groupedDays).map(([monthYear, monthDays]) => (
                    <div key={monthYear}>
                        <h3 className="sticky top-[40px] bg-white h-10 flex items-center justify-center z-10 capitalize font-bold text-gray-700 text-center border-b border-gray-200 -mx-4 px-4">{monthYear}</h3>
                        {(monthDays as Date[]).map(day => {
                            const dateKey = toISODateString(day);
                            const availableSlots = availabilityData[dateKey] || []; // ✅ USAR DADOS REAIS
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                            return (
                                <div key={day.toISOString()} className={`flex items-center ${isWeekend ? 'bg-red-50/50' : ''}`}>
                                    <div className="w-28 flex-shrink-0 text-right pr-4">
                                        <div className="flex items-baseline justify-end">
                                            <p className="font-bold text-gray-800 text-lg">{day.getDate()}</p>
                                            <p className="text-xs text-gray-500 uppercase font-medium ml-1.5">{day.toLocaleString('pt-BR', { weekday: 'short' })}</p>
                                        </div>
                                    </div>
                                    <div className="flex-1 grid grid-cols-14 h-10 border-l border-gray-200" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
                                        {hours.map(hour => {
                                            const time = `${String(hour).padStart(2, '0')}:00`;
                                            const isAvailable = availableSlots.includes(time); // ✅ USAR DADOS REAIS

                                            if (isWeekend) {
                                               return <div key={hour} className="h-full bg-repeat-space" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ef4444' fill-opacity='0.2' fill-rule='evenodd'%3E%3Cpath d='M5 0h1L0 6V5zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`}}></div>
                                            }

                                            if (isLoading) {
                                                return <div key={hour} className="h-full bg-gray-200 animate-pulse"></div>
                                            }

                                            if (!isAvailable) {
                                                return <div key={hour} className="h-full bg-red-200" title="Horário ocupado"></div>
                                            }

                                            return (
                                                <div
                                                    key={hour}
                                                    className="h-full bg-green-200 hover:bg-green-400 cursor-pointer transition-colors"
                                                    title="Horário disponível - Clique para selecionar"
                                                    onClick={() => {
                                                        onSelect({ date: day, time });
                                                        onClose();
                                                    }}
                                                ></div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ))}
             </div>
             {daysToShow > 30 ? (
                <button onClick={() => setDaysToShow(30)} className="w-full flex items-center justify-center text-sm font-semibold text-blue-600 py-3 rounded-lg hover:bg-blue-50 mt-4">
                    <ChevronUp className="w-4 h-4 mr-2" />
                    Recolher
                </button>
             ) : (
                <button onClick={() => setDaysToShow(d => d + 30)} className="w-full flex items-center justify-center text-sm font-semibold text-blue-600 py-3 rounded-lg hover:bg-blue-50 mt-4">
                    <ChevronDown className="w-4 h-4 mr-2" />
                    Carregar próximos 30 dias
                </button>
             )}
          </div>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default AvailabilityModal;