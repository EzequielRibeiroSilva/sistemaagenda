// FIX: Corrected the import statement for React and its hooks.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from './Icons';
import { API_BASE_URL } from '../utils/api';

interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (dateTime: { date: Date, time: string }) => void;
  agentName: string | null;
  agentId: number | null; // ✅ ADICIONADO: ID do agente para buscar disponibilidade real
  unidadeId?: number; // ✅ ADICIONADO: ID da unidade para filtrar horários
  durationMinutes?: number;
}

type HorarioUnidade = {
  dia_semana: number;
  is_aberto: boolean;
  horarios_json: Array<{ inicio: string; fim: string }>;
};

const AvailabilityModal: React.FC<AvailabilityModalProps> = ({ isOpen, onClose, onSelect, agentName, agentId, unidadeId, durationMinutes }) => {
  const portalRoot = document.getElementById('portal-root');
  const [availabilityData, setAvailabilityData] = useState<{ [date: string]: string[] | null }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [unitSchedules, setUnitSchedules] = useState<HorarioUnidade[] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const availabilityCacheKeyRef = useRef<string | null>(null);

  const days = useMemo(() => {
    const dayArray = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dayArray.push(date);
    }
    return dayArray;
  }, []);

  // ✅ EFFECT PARA CARREGAR DISPONIBILIDADE QUANDO MODAL ABRE
  useEffect(() => {
    if (!isOpen || !agentId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsLoading(false);
      setIsRateLimited(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRateLimited(false);

    const duration = Number.isFinite(durationMinutes as number) && (durationMinutes as number) > 0
      ? (durationMinutes as number)
      : 60;
    const cacheKey = `${agentId}|${unidadeId ?? ''}|${duration}`;
    if (availabilityCacheKeyRef.current !== cacheKey) {
      availabilityCacheKeyRef.current = cacheKey;
      setAvailabilityData({});
    }

    const loadAvailabilityRange = async () => {
      try {
        setIsLoading(true);

        const startDateStr = days[0]?.toISOString().split('T')[0];
        const endDateStr = days[days.length - 1]?.toISOString().split('T')[0];
        if (!startDateStr || !endDateStr) {
          setAvailabilityData({});
          return;
        }

        const token = localStorage.getItem('authToken');
        const params = new URLSearchParams();
        params.set('data_inicio', startDateStr);
        params.set('data_fim', endDateStr);
        params.set('duration', duration.toString());
        if (unidadeId) params.set('unidade_id', unidadeId.toString());

        const url = `${API_BASE_URL}/public/agentes/${agentId}/disponibilidade-range?${params.toString()}`;
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: token
            ? {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            : {
                'Content-Type': 'application/json'
              }
        });

        if (resp.status === 429) {
          setIsRateLimited(true);
          return;
        }

        const json = await resp.json().catch(() => null);
        if (!resp.ok || !json?.success) {
          setAvailabilityData({});
          return;
        }

        const disponibilidades = json?.data?.disponibilidades;
        const normalized: { [date: string]: string[] } = {};
        days.forEach(d => {
          const key = d.toISOString().split('T')[0];
          const slots = disponibilidades?.[key];
          normalized[key] = Array.isArray(slots) ? slots : [];
        });

        setAvailabilityData(normalized);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadAvailabilityRange();

    return () => {
      controller.abort();
    };
  }, [isOpen, agentId, days, unidadeId, durationMinutes, reloadKey]);

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

  useEffect(() => {
    const loadUnitSchedules = async () => {
      if (!isOpen || !unidadeId) {
        setUnitSchedules(null);
        return;
      }

      try {
        const token = localStorage.getItem('authToken');
        if (!token) {
          setUnitSchedules(null);
          return;
        }

        const resp = await fetch(`${API_BASE_URL}/unidades/${unidadeId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!resp.ok) {
          setUnitSchedules(null);
          return;
        }

        const json = await resp.json().catch(() => null);
        const horarios = json?.data?.horarios_funcionamento;
        setUnitSchedules(Array.isArray(horarios) ? horarios : null);
      } catch {
        setUnitSchedules(null);
      }
    };

    loadUnitSchedules();
  }, [isOpen, unidadeId]);

  const hours = useMemo(() => {
    if (!Array.isArray(unitSchedules) || unitSchedules.length === 0) {
      return Array.from({ length: 14 }, (_, i) => i + 8);
    }

    let minHour = 23;
    let maxHour = 0;

    unitSchedules.forEach(dia => {
      if (!dia?.is_aberto || !Array.isArray(dia?.horarios_json) || dia.horarios_json.length === 0) {
        return;
      }

      dia.horarios_json.forEach(p => {
        const startH = parseInt(String(p?.inicio || '').split(':')[0] || '', 10);
        const endH = parseInt(String(p?.fim || '').split(':')[0] || '', 10);
        if (!Number.isFinite(startH) || !Number.isFinite(endH)) return;
        if (startH < minHour) minHour = startH;
        if (endH > maxHour) maxHour = endH;
      });
    });

    if (minHour > maxHour) {
      return Array.from({ length: 14 }, (_, i) => i + 8);
    }

    const start = Math.max(0, minHour);
    const end = Math.min(23, maxHour);

    if (end <= start) {
      return [start];
    }

    return Array.from({ length: end - start + 1 }, (_, i) => i + start);
  }, [unitSchedules]);

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

        {isRateLimited && (
          <div className="px-4 py-2 border-b border-yellow-200 bg-yellow-50 text-yellow-800 text-sm flex items-center justify-between">
            <span>Muitas requisições em pouco tempo. Aguarde alguns segundos e tente novamente.</span>
            <button
              className="ml-4 px-3 py-1 rounded bg-yellow-200 hover:bg-yellow-300 text-yellow-900 text-sm font-semibold"
              onClick={() => {
                setIsRateLimited(false);
                setAvailabilityData({});
                setReloadKey(v => v + 1);
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <div className="sticky top-0 bg-white z-20 px-4 h-10 border-b border-gray-200 flex items-center">
             <div className="flex items-center text-center text-xs font-semibold text-gray-600 w-full">
                 <div className="w-28 flex-shrink-0"></div>
                 {hours.map(hour => (
                     <div key={hour} className="flex-1">{hour}:00</div>
                 ))}
             </div>
          </div>
          <div className="px-4 pb-4">
             <div className="space-y-1">
                {Object.entries(groupedDays).map(([monthYear, monthDays]) => (
                    <div key={monthYear} className="relative">
                        <div className="sticky top-10 bg-white z-10 border-b border-gray-200 -mx-4 px-4">
                          <h3 className="h-10 flex items-center justify-center capitalize font-bold text-gray-700 text-center">{monthYear}</h3>
                        </div>
                        <div>
                          {(monthDays as Date[]).map(day => {
                              const dateKey = toISODateString(day);
                              const dayAvailability = availabilityData[dateKey];
                              const availableSlots = Array.isArray(dayAvailability) ? dayAvailability : [];
                              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                              return (
                                  <div key={day.toISOString()} className={`flex items-center ${isWeekend ? 'bg-red-50/50' : ''}`}>
                                      <div className="w-28 flex-shrink-0 text-right pr-4">
                                          <div className="flex items-baseline justify-end">
                                              <p className="font-bold text-gray-800 text-lg">{day.getDate()}</p>
                                              <p className="text-xs text-gray-500 uppercase font-medium ml-1.5">{day.toLocaleString('pt-BR', { weekday: 'short' })}</p>
                                          </div>
                                      </div>
                                      <div className="flex-1 grid h-10 border-l border-gray-200" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
                                          {hours.map(hour => {
                                              const time = `${String(hour).padStart(2, '0')}:00`;
                                              const isAvailable = availableSlots.includes(time); // ✅ USAR DADOS REAIS

                                              if (isWeekend) {
                                                 return <div key={hour} className="h-full bg-repeat-space" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ef4444' fill-opacity='0.2' fill-rule='evenodd'%3E%3Cpath d='M5 0h1L0 6V5zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`}}></div>
                                              }

                                              if (isLoading || dayAvailability === undefined) {
                                                  return <div key={hour} className="h-full bg-gray-200 animate-pulse"></div>
                                              }

                                              if (dayAvailability === null) {
                                                return <div key={hour} className="h-full bg-gray-100" title="Indisponível no momento (rate limit)"></div>
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
                    </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default AvailabilityModal;