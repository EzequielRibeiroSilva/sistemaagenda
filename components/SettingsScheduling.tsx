import React, { useState } from 'react';
import { Plus, Edit } from './Icons';

const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
    {title && <h2 className="text-xl font-bold text-gray-800 mb-6">{title}</h2>}
    {children}
  </div>
);

const ToggleSwitch: React.FC<{ enabled: boolean; setEnabled: (enabled: boolean) => void }> = ({ enabled, setEnabled }) => (
    <button
        type="button"
        className={`${enabled ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled(!enabled)}
    >
        <span
            aria-hidden="true"
            className={`${enabled ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
    </button>
);

// FIX: Define types for schedule state to ensure correct type inference.
interface DaySchedule {
  enabled: boolean;
  times: string[];
}

interface Schedule {
  [key: string]: DaySchedule;
}

const initialSchedule: Schedule = {
  'Segunda-feira': { enabled: true, times: ['08:00-12:00', '14:00-19:00'] },
  'Terca': { enabled: true, times: ['08:00-12:00', '14:00-20:00'] },
  'Quarta-feira': { enabled: true, times: ['08:00-12:00', '14:00-20:00'] },
  'Quinta': { enabled: true, times: ['08:00-12:00', '14:00-21:00'] },
  'Sexta-feira': { enabled: true, times: ['08:00-12:00', '14:00-21:00'] },
  'Sábado': { enabled: true, times: ['08:00-13:00', '14:00-21:00'] },
  'Domingo': { enabled: false, times: [] },
};

const SettingsScheduling: React.FC = () => {
    // FIX: Apply the explicit Schedule type to useState.
    const [schedule, setSchedule] = useState<Schedule>(initialSchedule);

    const handleToggle = (day: string) => {
        setSchedule(prev => {
            const daySchedule = prev[day];
            if (!daySchedule) {
                return prev;
            }
            return {
                ...prev,
                [day]: { ...daySchedule, enabled: !daySchedule.enabled },
            };
        });
    };
    
    return (
        <div className="space-y-6">
            <Card title="Geral Programação Semanal">
                <div className="space-y-4">
                    {/* FIX: Switched to Object.keys to ensure proper type inference for schedule data. */}
                    {Object.keys(schedule).map((day) => {
                        const dayData = schedule[day];
                        if (!dayData) return null;
                        const { enabled, times } = dayData;
                        return (
                        <div key={day} className={`flex items-center justify-between p-4 rounded-lg ${enabled ? 'bg-gray-50/80' : 'bg-gray-50/50'}`}>
                            <div className="flex items-center">
                                <ToggleSwitch enabled={enabled} setEnabled={() => handleToggle(day)} />
                                <span className={`ml-4 font-semibold ${enabled ? 'text-gray-800' : 'text-gray-400'}`}>{day}</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="space-x-2 font-mono text-sm text-gray-600">
                                    {enabled ? times.map(time => <span key={time}>{time}</span>) : <span className="text-gray-400">Dia de folga</span>}
                                </div>
                                <button disabled={!enabled} className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Edit className="w-5 h-5 text-blue-600" />
                                </button>
                            </div>
                        </div>
                    )})}
                </div>
                <div className="mt-6">
                    <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
                        Gravar A Programação Semanal
                    </button>
                </div>
            </Card>

            <Card title="Dias Com Agendas Personalizadas">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex items-center justify-center text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 group transition-colors">
                    <div className="flex flex-col items-center text-gray-600 group-hover:text-blue-600">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-100 group-hover:bg-blue-100 mb-2">
                             <Plus className="w-6 h-6 text-gray-500 group-hover:text-blue-600" />
                        </div>
                        <span className="font-semibold">Adicione Dia</span>
                    </div>
                </div>
            </Card>

            <Card title="Feriados E Dias De Folga">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex items-center justify-center text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 group transition-colors">
                    <div className="flex flex-col items-center text-gray-600 group-hover:text-blue-600">
                         <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-100 group-hover:bg-blue-100 mb-2">
                             <Plus className="w-6 h-6 text-gray-500 group-hover:text-blue-600" />
                        </div>
                        <span className="font-semibold">Adicione Dia</span>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default SettingsScheduling;