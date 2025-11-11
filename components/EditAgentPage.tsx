import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Check, Leaf, ImagePlaceholder } from './Icons';
import AgentScheduleEditor from './AgentScheduleEditor';
import { useAgentManagement, AgentDetails } from '../hooks/useAgentManagement';
import { useAuth } from '../contexts/AuthContext';
import { getAssetUrl } from '../utils/api';

const FormCard: React.FC<{ title: string; children: React.ReactNode; rightContent?: React.ReactNode }> = ({ title, children, rightContent }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      {rightContent}
    </div>
    {children}
  </div>
);

const TextInput: React.FC<{ label: string; placeholder?: string; defaultValue?: string; className?: string, value?: string, onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void, type?: string, readOnly?: boolean }> = ({ label, placeholder, defaultValue, className = "", value, onChange, type="text", readOnly = false }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <input type={type} placeholder={placeholder} defaultValue={defaultValue} value={value} onChange={onChange} readOnly={readOnly} className={`w-full border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 ${readOnly ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'}`} />
    </div>
);
const TextArea: React.FC<{ label: string; placeholder?: string; rows?: number; className?: string }> = ({ label, placeholder, rows = 2, className = "" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <textarea placeholder={placeholder} rows={rows} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
    </div>
);

const SelectInput: React.FC<{ label: string; children: React.ReactNode, className?: string, value?: string, onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void }> = ({ label, children, className="", value, onChange }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <select value={value} onChange={onChange} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500">
            {children}
        </select>
    </div>
);

const servicesList = [
    'CORTE', 'CORTE + PIGMENTAÇÃO', 'CORTE + BARBA', 'BARBA + PIGMENTAÇÃO', 'LUZES + CORTE',
    'BARBA', 'BARBOTERAPIA', 'CORTE+BARBA+PIGMENTAÇÃO DA BARBA', 'CORTE+BARBA+PIGMENTAÇÃO BARBA E CABELO',
    'ALISAMENTO AMERICANO +CORTE', 'ALISAMENTO AMERICANO', 'LIMPEZA DE PELE'
];

const ServiceCheckboxWithIcon: React.FC<{ label: string, checked: boolean, onChange: () => void }> = ({ label, checked, onChange }) => (
    <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
        </div>
        <span className="ml-3 font-medium text-gray-800 text-sm">{label}</span>
    </label>
);



interface EditAgentPageProps {
  setActiveView: (view: string) => void;
  agentId: string | null;
}

const EditAgentPage: React.FC<EditAgentPageProps> = ({ setActiveView, agentId }) => {
    const { fetchAgentById, updateAgent, loading, error } = useAgentManagement();
    const { user, updateUser } = useAuth();
    const [agentData, setAgentData] = useState<AgentDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState(''); // ✅ CORREÇÃO: Estado para capturar nova senha
    const [status, setStatus] = useState<'Ativo' | 'Bloqueado'>('Ativo');

    // Estados que são usados no useEffect devem ser declarados ANTES
    const [checkedServices, setCheckedServices] = useState<Record<number, boolean>>({});
    const [isCustomSchedule, setIsCustomSchedule] = useState(true);
    const [scheduleData, setScheduleData] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string>('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let isMounted = true; // Flag para evitar updates em componente desmontado

        const loadAgent = async () => {
            if (agentId && isMounted) {
                setIsLoading(true);
                const agent = await fetchAgentById(parseInt(agentId));
                if (agent && isMounted) {
                    setAgentData(agent);
                    // Preencher formulário com dados do agente
                    setFirstName(agent.nome || '');
                    setLastName(agent.sobrenome || '');
                    setPhone(agent.telefone || '');
                    setEmail(agent.email || '');
                    setStatus(agent.status || 'Ativo');

                    // Implementar pré-seleção de serviços
                    if (agent.servicos_disponiveis && agent.servicos_atuais_ids) {
                        const initialCheckedServices: Record<number, boolean> = {};
                        agent.servicos_disponiveis.forEach(servico => {
                            // Marcar como true se o serviço está na lista de serviços atuais do agente
                            initialCheckedServices[servico.id] = agent.servicos_atuais_ids.includes(servico.id);
                        });
                        setCheckedServices(initialCheckedServices);
                    }

                    // Implementar pré-seleção da agenda personalizada
                    setIsCustomSchedule(agent.agenda_personalizada);

                    // Inicializar agenda personalizada
                    if (agent.agenda_personalizada && agent.horarios_funcionamento) {
                        setScheduleData(agent.horarios_funcionamento);
                    } else {
                        // Se não tem agenda personalizada, inicializar com padrão vazio
                        setScheduleData(Array.from({ length: 7 }, (_, index) => ({
                            dia_semana: index,
                            is_aberto: false,
                            periodos: []
                        })));
                    }

                    // ✅ CORREÇÃO: Definir preview da imagem atual com fallback robusto
                    const avatarUrl = agent.avatar_url || agent.avatar;
                    if (avatarUrl) {
                        const fullUrl = avatarUrl.startsWith('http') ? avatarUrl : getAssetUrl(avatarUrl);
                        setAvatarPreview(fullUrl);
                    }
                }
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadAgent();

        return () => {
            isMounted = false; // Cleanup para evitar memory leaks
        };
    }, [agentId]); // Removido fetchAgentById das dependências

    const handleSelectAllServices = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        if (agentData?.servicos_disponiveis) {
            const newCheckedState: Record<number, boolean> = {};
            agentData.servicos_disponiveis.forEach(servico => {
                newCheckedState[servico.id] = isChecked;
            });
            setCheckedServices(newCheckedState);
        }
    };

    const handleServiceCheck = (servicoId: number) => {
        setCheckedServices(prev => ({ ...prev, [servicoId]: !prev[servicoId] }));
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

    const allServicesSelected = useMemo(() => {
        if (!agentData?.servicos_disponiveis?.length) return false;
        return agentData.servicos_disponiveis.every(servico => checkedServices[servico.id] === true);
    }, [checkedServices, agentData?.servicos_disponiveis]);

    const handleSave = async () => {
        if (!agentData) {
            return;
        }

        setIsSaving(true);
        try {
            // Coletar apenas os IDs dos serviços marcados
            const servicosSelecionados = Object.entries(checkedServices)
                .filter(([_, isChecked]) => isChecked)
                .map(([servicoId, _]) => parseInt(servicoId));

            const updateData = {
                nome: firstName,
                sobrenome: lastName,
                email: email,
                telefone: phone,
                status: status, // ✅ CORREÇÃO: Incluir campo status
                unidade_id: agentData.unidade_id, // Incluir unidade_id obrigatório
                agenda_personalizada: isCustomSchedule,
                servicos_oferecidos: servicosSelecionados,
                horarios_funcionamento: isCustomSchedule ? scheduleData : [],
                avatar: avatarFile,
                ...(password.trim() !== '' && { senha: password }) // ✅ CORREÇÃO CRÍTICA: Incluir senha apenas se preenchida
            };

            const result = await updateAgent(agentData.id, updateData);

            if (result) {
                alert('Agente atualizado com sucesso!');

                // Se o usuário logado é o agente que foi editado, atualizar o avatar no contexto
                if (user.agentId === agentData.id.toString() && result?.avatar_url) {
                    updateUser({ avatarUrl: result.avatar_url });
                }

                // Redirecionar para lista de agentes
                setActiveView('agents-list');
            } else {
                throw new Error('Erro ao atualizar agente');
            }
        } catch (error) {
            alert('Erro ao salvar alterações: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Carregando dados do agente...</p>
                </div>
            </div>
        );
    }

    if (!agentData) {
        return (
            <div className="p-4 text-center">
                <h2 className="text-xl font-semibold text-gray-700">Agente não encontrado.</h2>
                <button onClick={() => setActiveView('agents-list')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Voltar para a lista de agentes
                </button>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Editar Agente</h1>

            <FormCard title="Informações Gerais">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Avatar Upload */}
                    <div className="md:col-span-2 flex items-center space-x-6">
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                                {avatarPreview ? (
                                    <img
                                        src={avatarPreview}
                                        alt="Preview"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            const fallbackDiv = target.nextElementSibling as HTMLElement;
                                            if (fallbackDiv) {
                                                fallbackDiv.classList.remove('hidden');
                                            }
                                        }}
                                    />
                                ) : null}
                                <div className={`w-full h-full flex items-center justify-center ${avatarPreview ? 'hidden' : ''}`}>
                                    <ImagePlaceholder className="w-8 h-8 text-gray-400" />
                                </div>
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
                                Clique no botão + para alterar a foto. Máximo 5MB.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <TextInput label="Primeiro Nome" value={firstName} onChange={e => setFirstName(e.target.value)} />
                    <TextInput label="Último Nome" value={lastName} onChange={e => setLastName(e.target.value)} />
                    <TextInput label="Nome De Exibição" className="md:col-span-2" value={`${firstName} ${lastName}`} readOnly />
                    <TextInput label="Endereço De E-Mail" className="md:col-span-2" value={email} onChange={e => setEmail(e.target.value)} />
                    <TextInput 
                        label="Senha" 
                        type="password" 
                        placeholder="Deixe em branco para não alterar" 
                        className="md:col-span-2" 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />

                    <div className="relative">
                        <label className="text-sm font-medium text-gray-600 mb-2 block">Telefone</label>
                        <div className="flex items-center w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                            <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                            <span className="text-gray-600 pr-2">+55</span>
                            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="11 96123-4567" className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400" />
                        </div>
                    </div>

                    <SelectInput
                        label="Estado"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as 'Ativo' | 'Bloqueado')}
                    >
                        <option value="Ativo">Ativo</option>
                        <option value="Bloqueado">Bloqueado</option>
                    </SelectInput>
                </div>
            </FormCard>

            <FormCard 
                title="Serviços Oferecidos"
                rightContent={
                    <label className="flex items-center cursor-pointer">
                        <div className="relative flex items-center">
                             <input type="checkbox" checked={allServicesSelected} onChange={handleSelectAllServices} className="sr-only" />
                             <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${allServicesSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                {allServicesSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </div>
                        <span className="ml-2 font-medium text-sm text-gray-700">Selecionar Todos</span>
                    </label>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {agentData?.servicos_disponiveis?.map(servico => (
                        <ServiceCheckboxWithIcon
                            key={servico.id}
                            label={`${servico.nome} - R$ ${servico.preco} (${servico.duracao_minutos}min)`}
                            checked={checkedServices[servico.id] || false}
                            onChange={() => handleServiceCheck(servico.id)}
                        />
                    ))}
                </div>
            </FormCard>
            
            <FormCard
                title="Agenda Semanal"
                rightContent={
                     <label className="flex items-center text-sm font-medium text-blue-600 cursor-pointer">
                        <div className="relative flex items-center">
                            <input
                                type="checkbox"
                                checked={isCustomSchedule}
                                onChange={() => setIsCustomSchedule(!isCustomSchedule)}
                                className="sr-only"
                            />
                            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${isCustomSchedule ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                {isCustomSchedule && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </div>
                        <span className="ml-2 font-semibold">Agenda personalizada</span>
                    </label>
                }
            >
                {isCustomSchedule ? (
                    <AgentScheduleEditor
                        scheduleData={scheduleData}
                        onScheduleChange={setScheduleData}
                    />
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <p>Usando agenda padrão da unidade</p>
                        <p className="text-sm mt-1">Marque "Agenda personalizada" para definir horários específicos</p>
                    </div>
                )}
            </FormCard>

            <div className="pt-2">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`font-semibold px-8 py-3 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                        isSaving
                            ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
            </div>
        </div>
    );
};

export default EditAgentPage;