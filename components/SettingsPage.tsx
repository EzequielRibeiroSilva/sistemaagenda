import React, { useState } from 'react';
import { Plus, Edit } from './Icons';

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
    <h2 className="text-xl font-bold text-gray-800 mb-6">{title}</h2>
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

const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="grid grid-cols-3 gap-4 items-center py-3 border-b border-gray-100 last:border-b-0">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="col-span-2">{children}</div>
    </div>
);

const Select: React.FC<{ children: React.ReactNode, defaultValue?: string }> = ({ children, defaultValue }) => (
    <select defaultValue={defaultValue} className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500">
        {children}
    </select>
);

const Input: React.FC<{ defaultValue?: string, type?: string }> = ({ defaultValue, type = "text" }) => (
    <input type={type} defaultValue={defaultValue} className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500" />
);


// Types from SettingsScheduling
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


const SettingsPage: React.FC = () => {
    // State from SettingsGeneral
    const [showEndTime, setShowEndTime] = useState(true);
    const [disableDateDetection, setDisableDateDetection] = useState(false);
    
    // State and logic from SettingsScheduling
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
      <h1 className="text-3xl font-bold text-gray-800">Definições</h1>

      <Card title="Compromisso Definições">
          <FormRow label="Estado Padrão do Compromisso">
              <Select defaultValue="Aprovado"><option>Aprovado</option></Select>
          </FormRow>
          <FormRow label="Duração do Slot de Tempo">
              <Select defaultValue="30 min"><option>30 min</option></Select>
          </FormRow>
          <FormRow label="Modo de Confirmação">
              <Select><option>Confirme que os pagtos pendentes</option></Select>
          </FormRow>
          <FormRow label="Permitir agendar com o calendário">
              <Select><option>Permitir reserva para o calendário</option></Select>
          </FormRow>
          <FormRow label="Período de 25 horas">
              <Input defaultValue="Período de 25 horas" />
          </FormRow>
          <FormRow label="Formato de Data">
              <Input defaultValue="DD/MM/AAAA" />
          </FormRow>
          <FormRow label="Mostrar compromisso fim do tempo">
              <ToggleSwitch enabled={showEndTime} setEnabled={setShowEndTime} />
          </FormRow>
          <FormRow label="Desativar detecção da data de início">
              <ToggleSwitch enabled={disableDateDetection} setEnabled={setDisableDateDetection} />
          </FormRow>
      </Card>

      <Card title="Restrições">
           <FormRow label="Período para Agendamentos Futuros (dias)">
              <Input defaultValue="365" />
          </FormRow>
          <FormRow label="Período Mínimo para Agendamento (dias)">
              <Input defaultValue="1" />
          </FormRow>
          <FormRow label="Número Máximo de Reservas Futuras por Atleta">
              <Input defaultValue="1" />
          </FormRow>
      </Card>
      
      <Card title="Configurações De Moeda">
           <FormRow label="Símbolo">
              <Input defaultValue="R$" />
          </FormRow>
          <FormRow label="Posição">
               <Select><option>Antes ou depois do preço</option></Select>
          </FormRow>
          <FormRow label="Número de casas decimais">
               <Select><option>2</option></Select>
          </FormRow>
          <FormRow label="Formatação">
               <div className="grid grid-cols-2 gap-4">
                  <Input defaultValue="Ponto (1,000)" />
                  <Input defaultValue="Vírgula (0,90)" />
               </div>
          </FormRow>
      </Card>
      
      <Card title="Geral Programação Semanal">
          <div className="space-y-4">
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

      <div className="pt-2">
          <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
              Salvar Definições
          </button>
      </div>
    </div>
  );
};

export default SettingsPage;
