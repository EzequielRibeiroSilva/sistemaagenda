import React, { useState, useRef } from 'react';
import { Plus, Check, ImagePlaceholder } from './Icons';
import AgentScheduleEditor from './AgentScheduleEditor';
import { useAgentManagement } from '../hooks/useAgentManagement';

const FormCard: React.FC<{ title: string; children: React.ReactNode; rightContent?: React.ReactNode }> = ({ title, children, rightContent }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      {rightContent}
    </div>
    {children}
  </div>
);

const TextInput: React.FC<{ 
  label: string; 
  placeholder?: string; 
  value: string; 
  onChange: (value: string) => void; 
  type?: string;
  className?: string;
}> = ({ label, placeholder, value, onChange, type = "text", className = "" }) => (
  <div className={className}>
    <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
    <input 
      type={type} 
      placeholder={placeholder} 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" 
    />
  </div>
);

const TextArea: React.FC<{ 
  label: string; 
  placeholder?: string; 
  value: string; 
  onChange: (value: string) => void; 
  rows?: number; 
  className?: string;
}> = ({ label, placeholder, value, onChange, rows = 2, className = "" }) => (
  <div className={className}>
    <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
    <textarea 
      placeholder={placeholder} 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      rows={rows} 
      className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" 
    />
  </div>
);

const ServiceCheckbox: React.FC<{ 
  label: string; 
  checked: boolean; 
  onChange: () => void;
}> = ({ label, checked, onChange }) => (
  <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
    <div className="relative flex items-center">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
    </div>
    <span className={`ml-3 text-sm font-medium ${checked ? 'text-blue-800' : 'text-gray-700'}`}>
      {label}
    </span>
  </label>
);

interface CreateAgentPageProps {
  setActiveView: (view: string) => void;
}

const CreateAgentPage: React.FC<CreateAgentPageProps> = ({ setActiveView }) => {
  // Estados do formulário
  const [formData, setFormData] = useState({
    nome: '',
    sobrenome: '',
    email: '',
    telefone: '',
    senha: '',
    biografia: '',
    nome_exibicao: '',
    // unidade_id: 1, // ✅ REMOVIDO: Backend usa unidade_id do token JWT
    comissao_percentual: 60,
    observacoes: ''
  });
  
  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [customSchedule, setCustomSchedule] = useState(false);
  const [schedule, setSchedule] = useState<any>({
    'Segunda-feira': { isActive: false, periods: [] },
    'Terça': { isActive: false, periods: [] },
    'Quarta-feira': { isActive: false, periods: [] },
    'Quinta': { isActive: false, periods: [] },
    'Sexta-feira': { isActive: false, periods: [] },
    'Sábado': { isActive: false, periods: [] },
    'Domingo': { isActive: false, periods: [] }
  }); // ✅ CORREÇÃO: Inicializar com estrutura dos 7 dias
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Hook para gerenciamento de agentes
  const { services, createAgent, loading, error } = useAgentManagement();

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const toggleService = (serviceId: number) => {
    setSelectedServices(prev => 
      prev.includes(serviceId) 
        ? prev.filter(s => s !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleScheduleChange = (newSchedule: any) => {
    setSchedule(newSchedule);
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Por favor, selecione apenas arquivos de imagem.');
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        alert('A imagem deve ter no máximo 5MB.');
        return;
      }
      
      setAvatarFile(file);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    // ✅ PROTEÇÃO: Evitar duplo submit
    if (isSubmitting) {
      console.log('⚠️ Formulário já está sendo enviado, ignorando clique duplicado');
      return;
    }

    if (!formData.nome || !formData.email) {
      alert('Nome e email são obrigatórios.');
      return;
    }
    
    if (selectedServices.length === 0) {
      alert('Selecione pelo menos um serviço.');
      return;
    }

    setIsSubmitting(true);

    try {
      const agentData = {
        ...formData,
        avatar: avatarFile, // ✅ CORREÇÃO: Incluir arquivo do avatar
        agenda_personalizada: customSchedule,
        servicos_oferecidos: selectedServices,
        horarios_funcionamento: customSchedule ? (() => {
          // ✅ CORREÇÃO: Mapear nomes dos dias para números
          const dayNameToNumber: Record<string, number> = {
            'Domingo': 0,
            'Segunda-feira': 1,
            'Terça': 2,
            'Quarta-feira': 3,
            'Quinta': 4,
            'Sexta-feira': 5,
            'Sábado': 6
          };

          return Object.entries(schedule)
            .filter(([_, dayData]: [string, any]) => dayData.isActive && dayData.periods.length > 0)
            .map(([dayName, dayData]: [string, any]) => ({
              dia_semana: dayNameToNumber[dayName],
              periodos: dayData.periods.map((period: any) => ({
                inicio: period.start,
                fim: period.end
              }))
            }));
        })() : []
      };

      const success = await createAgent(agentData);
      
      if (success) {
        alert('Agente criado com sucesso!');
        setActiveView('agents-list');
      } else {
        alert('Erro ao criar agente. Tente novamente.');
      }
    } catch (error) {
      console.error('Erro ao criar agente:', error);
      alert('Erro ao criar agente. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Criar Novo Agente</h1>
        <button
          onClick={() => setActiveView('agents-list')}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          ← Voltar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <FormCard title="Informações Gerais">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Avatar Upload */}
          <div className="md:col-span-2 flex items-center space-x-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlaceholder className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700">Foto do Agente</h3>
              <p className="text-xs text-gray-500 mt-1">
                Clique no ícone + para adicionar uma foto (máx. 5MB)
              </p>
            </div>
          </div>

          <TextInput
            label="Nome *"
            placeholder="Digite o nome"
            value={formData.nome}
            onChange={(value) => handleInputChange('nome', value)}
          />
          
          <TextInput
            label="Sobrenome"
            placeholder="Digite o sobrenome"
            value={formData.sobrenome}
            onChange={(value) => handleInputChange('sobrenome', value)}
          />
          
          <TextInput
            label="Email *"
            type="email"
            placeholder="Digite o email"
            value={formData.email}
            onChange={(value) => handleInputChange('email', value)}
          />
          
          <TextInput
            label="Telefone"
            placeholder="(11) 99999-9999"
            value={formData.telefone}
            onChange={(value) => handleInputChange('telefone', value)}
          />
          
          <TextInput
            label="Senha"
            type="password"
            placeholder="Digite a senha (opcional)"
            value={formData.senha}
            onChange={(value) => handleInputChange('senha', value)}
          />
          
          <TextInput
            label="Comissão (%)"
            type="number"
            placeholder="60"
            value={formData.comissao_percentual.toString()}
            onChange={(value) => handleInputChange('comissao_percentual', parseFloat(value) || 0)}
          />
        </div>
        
        <div className="mt-6">
          <TextArea
            label="Biografia"
            placeholder="Descreva a experiência e especialidades do agente..."
            value={formData.biografia}
            onChange={(value) => handleInputChange('biografia', value)}
            rows={3}
          />
        </div>
      </FormCard>

      <FormCard title="Serviços Oferecidos">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Carregando serviços...</p>
          </div>
        ) : services.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => (
              <ServiceCheckbox
                key={service.id}
                label={`${service.nome} - R$ ${service.preco}`}
                checked={selectedServices.includes(service.id)}
                onChange={() => toggleService(service.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600">Nenhum serviço disponível</p>
            <p className="text-sm text-gray-500 mt-1">Cadastre serviços primeiro para associá-los ao agente</p>
          </div>
        )}
      </FormCard>

      <FormCard 
        title="Agenda Semanal"
        rightContent={
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={customSchedule}
              onChange={(e) => {
                setCustomSchedule(e.target.checked);
              }}
              className="mr-2"
            />
            <span className="text-sm text-gray-600">Agenda personalizada</span>
          </label>
        }
      >
        {customSchedule ? (
          <AgentScheduleEditor
            schedule={schedule}
            onChange={handleScheduleChange}
          />
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>Usando agenda padrão da unidade</p>
            <p className="text-sm mt-1">Marque "Agenda personalizada" para definir horários específicos</p>
          </div>
        )}
      </FormCard>

      <div className="flex justify-end space-x-4">
        <button
          onClick={() => setActiveView('agents-list')}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={isSubmitting || loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Salvando...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Criar Agente
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CreateAgentPage;
