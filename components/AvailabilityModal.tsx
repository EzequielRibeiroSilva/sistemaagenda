// FIX: Corrected the import statement for React and its hooks.
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ChevronUp } from './Icons';
import type { Agent } from '../types';

// Mock data - in a real app, this would be fetched based on the agentId
const mockBookedSlots: { [key: string]: { [date: string]: string[] } } = {
  'Eduardo Soares': {
    '2025-10-06': ['10:00', '11:00', '14:00', '15:00', '16:00'],
    '2025-10-07': ['09:00', '12:00', '13:00', '17:00'],
    '2025-10-08': ['10:00', '11:00', '15:00', '16:00'],
    '2025-10-25': ['10:00', '11:00', '14:00', '15:00', '16:00'],
    '2025-11-03': ['09:00', '12:00', '13:00', '17:00'],
    '2025-11-05': ['10:00', '11:00', '15:00', '16:00'],
  },
  'Ângelo Paixão': {
    '2025-10-06': ['09:00', '10:00', '11:00', '12:00', '13:00'],
    '2025-10-08': ['14:00', '15:00', '16:00'],
  },
  'Snake Filho': {
     '2025-10-06': ['10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
     '2025-10-07': ['09:00', '12:00', '13:00', '17:00', '18:00'],
  }
};


interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (dateTime: { date: Date, time: string }) => void;
  agentName: string | null;
}

const AvailabilityModal: React.FC<AvailabilityModalProps> = ({ isOpen, onClose, onSelect, agentName }) => {
  const portalRoot = document.getElementById('portal-root');
  const [daysToShow, setDaysToShow] = useState(30);

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

  const bookedSlotsForAgent = (agentName && mockBookedSlots[agentName]) || {};
  
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
                            const bookedTimes = bookedSlotsForAgent[dateKey] || [];
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
                                            const isBooked = bookedTimes.includes(time);
                                            
                                            if (isWeekend) {
                                               return <div key={hour} className="h-full bg-repeat-space" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ef4444' fill-opacity='0.2' fill-rule='evenodd'%3E%3Cpath d='M5 0h1L0 6V5zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`}}></div>
                                            }

                                            if(isBooked) {
                                                return <div key={hour} className="h-full bg-blue-500"></div>
                                            }
                                            
                                            return (
                                                <div 
                                                    key={hour} 
                                                    className="h-full bg-blue-100/50 hover:bg-green-400 cursor-pointer transition-colors"
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