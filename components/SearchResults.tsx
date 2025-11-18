
import React, { useMemo, useEffect, useState } from 'react';
import { Calendar, Users, Briefcase, Box, Leaf } from './Icons';
import { useClientManagement } from '../hooks/useClientManagement';
import { useAgentManagement } from '../hooks/useAgentManagement';
import { useServiceManagement } from '../hooks/useServiceManagement';
import { useAppointmentManagement } from '../hooks/useAppointmentManagement';
import { getAssetUrl } from '../utils/api';

// ✅ REMOVIDO: Mock data de clientes, agentes e serviços substituído por dados reais do backend

interface SearchResultsProps {
    query: string;
    onAddNewAppointment: () => void;
    onSelectAgent: (agentId: string) => void;
    onSelectService: (serviceId: string) => void;
    onSelectClient: (clientId: number) => void;
    onSelectAppointment: (appointmentId: number, appointmentDate: string) => void; // ✅ NOVO: Callback para navegar ao calendário com data
    userRole: 'ADMIN' | 'AGENTE';
    loggedInAgentId: string | null;
}

const highlightMatch = (text: string, query: string) => {
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <mark key={i} className="bg-yellow-200 px-0 py-0 rounded-sm">{part}</mark>
                ) : (
                    part
                )
            )}
        </span>
    );
};

const SearchResults: React.FC<SearchResultsProps> = ({ query, onAddNewAppointment, onSelectAgent, onSelectService, onSelectClient, onSelectAppointment, userRole, loggedInAgentId }) => {
    const lowerCaseQuery = query.toLowerCase();

    // ✅ NOVO: Hook para buscar clientes reais
    const { clients, fetchClients } = useClientManagement();
    const [isSearchingClients, setIsSearchingClients] = useState(false);

    // ✅ NOVO: Hook para buscar agentes reais
    const { agents } = useAgentManagement();
    const [isSearchingAgents, setIsSearchingAgents] = useState(false);

    // ✅ NOVO: Hook para buscar serviços reais
    const { services } = useServiceManagement();
    const [isSearchingServices, setIsSearchingServices] = useState(false);

    // ✅ NOVO: Hook para buscar agendamentos por ID
    const { fetchAppointmentById } = useAppointmentManagement();
    const [isSearchingAppointment, setIsSearchingAppointment] = useState(false);
    const [foundAppointment, setFoundAppointment] = useState<any>(null);

    // ✅ NOVO: Buscar clientes quando a query mudar
    useEffect(() => {
        const searchClients = async () => {
            if (!query || query.length < 2) {
                return; // Não buscar se query muito curta
            }

            setIsSearchingClients(true);
            try {
                // Verificar se é um ID numérico
                const numericId = parseInt(query);
                if (!isNaN(numericId)) {
                    // Buscar por ID
                    await fetchClients({ id: numericId });
                } else {
                    // Buscar por nome
                    await fetchClients({ nome: query });
                }
            } catch (error) {
                console.error('Erro ao buscar clientes:', error);
            } finally {
                setIsSearchingClients(false);
            }
        };

        // Debounce de 300ms
        const timeoutId = setTimeout(searchClients, 300);
        return () => clearTimeout(timeoutId);
    }, [query, fetchClients]);

    // ✅ NOVO: Buscar agendamento por ID quando a query for numérica
    useEffect(() => {
        const searchAppointment = async () => {
            const numericId = parseInt(query);
            if (!isNaN(numericId) && query.length >= 1) {
                setIsSearchingAppointment(true);
                try {
                    const appointment = await fetchAppointmentById(numericId);
                    if (appointment) {
                        setFoundAppointment(appointment);
                    } else {
                        setFoundAppointment(null);
                    }
                } catch (error) {
                    console.error('Erro ao buscar agendamento:', error);
                    setFoundAppointment(null);
                } finally {
                    setIsSearchingAppointment(false);
                }
            } else {
                setFoundAppointment(null);
            }
        };

        // Debounce de 300ms
        const timeoutId = setTimeout(searchAppointment, 300);
        return () => clearTimeout(timeoutId);
    }, [query, fetchAppointmentById]);

    // ✅ NOVO: Filtrar agentes por nome (busca client-side)
    const filteredAgents = useMemo(() => {
        if (!query || query.length < 2) return [];
        
        let agentsToFilter = agents;
        
        // Se for AGENTE, filtrar apenas o próprio agente
        if (userRole === 'AGENTE' && loggedInAgentId) {
            agentsToFilter = agents.filter(agent => agent.id.toString() === loggedInAgentId);
        }
        
        // Filtrar por nome
        return agentsToFilter.filter(agent => 
            agent.name.toLowerCase().includes(lowerCaseQuery)
        );
    }, [agents, query, lowerCaseQuery, userRole, loggedInAgentId]);

    // ✅ NOVO: Filtrar serviços por nome (busca client-side)
    const filteredServices = useMemo(() => {
        if (!query || query.length < 2) return [];
        
        return services.filter(service => 
            service.nome.toLowerCase().includes(lowerCaseQuery)
        );
    }, [services, query, lowerCaseQuery]);

    // ✅ NOVO: Usar clientes reais do backend
    const filteredClients = clients;

    return (
        <div className="lg:absolute lg:top-full lg:left-0 lg:mt-2 lg:w-[48rem] lg:max-w-2xl bg-white lg:rounded-lg lg:shadow-lg lg:border lg:border-gray-200 z-50 p-6 space-y-6">
            {/* Appointments Section - Busca por ID */}
            <div>
                <div className="flex items-center mb-3">
                    <Calendar className="w-5 h-5 text-gray-500 mr-3" />
                    <h3 className="font-semibold text-gray-800">Compromissos</h3>
                </div>
                {isSearchingAppointment ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        Buscando agendamento...
                    </div>
                ) : foundAppointment ? (
                    <div 
                        onClick={() => onSelectAppointment(foundAppointment.id, foundAppointment.date)}
                        className="flex items-center p-3 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors"
                    >
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-gray-800">Agendamento #{foundAppointment.id}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    foundAppointment.status === 'Confirmado' ? 'bg-green-100 text-green-700' :
                                    foundAppointment.status === 'Pendente' ? 'bg-yellow-100 text-yellow-700' :
                                    foundAppointment.status === 'Cancelado' ? 'bg-red-100 text-red-700' :
                                    'bg-blue-100 text-blue-700'
                                }`}>{foundAppointment.status}</span>
                            </div>
                            <p className="text-xs text-gray-600">Cliente: {foundAppointment.client.name}</p>
                            <p className="text-xs text-gray-600">Serviço: {foundAppointment.service.name}</p>
                            <p className="text-xs text-gray-500"> {foundAppointment.dateTime}</p>
                        </div>
                        <div className="text-xs text-blue-600 font-medium">Ver no Calendário →</div>
                    </div>
                ) : (
                    <button
                        onClick={onAddNewAppointment}
                        className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
                    >
                        Adicionar Novo Compromisso
                    </button>
                )}
            </div>

            {/* Clients Section */}
            <div>
                <div className="flex items-center mb-3">
                    <Users className="w-5 h-5 text-gray-500 mr-3" />
                    <h3 className="font-semibold text-gray-800">Clientes</h3>
                </div>
                {isSearchingClients ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        Buscando clientes...
                    </div>
                ) : filteredClients.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {filteredClients.map(client => (
                            <div 
                                key={client.id} 
                                onClick={() => onSelectClient(client.id)}
                                className="flex items-center p-2 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm mr-2">
                                    {client.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-700">{highlightMatch(client.name, query)}</span>
                                    <span className="text-xs text-gray-500">ID: {client.id}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : query.length >= 2 ? (
                    <p className="text-sm text-gray-500">Nenhum cliente encontrado.</p>
                ) : (
                    <p className="text-sm text-gray-500">Digite pelo menos 2 caracteres para buscar.</p>
                )}
            </div>

            {/* Agents Section */}
            <div>
                <div className="flex items-center mb-3">
                    <Briefcase className="w-5 h-5 text-gray-500 mr-3" />
                    <h3 className="font-semibold text-gray-800">Agentes</h3>
                </div>
                {isSearchingAgents ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        Buscando agentes...
                    </div>
                ) : filteredAgents.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {filteredAgents.map(agent => (
                            <div 
                                key={agent.id} 
                                onClick={() => onSelectAgent(agent.id.toString())}
                                className="flex items-center p-2 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors"
                            >
                                {agent.avatar ? (
                                    <img 
                                        src={getAssetUrl(agent.avatar)} 
                                        alt={agent.name} 
                                        className="w-8 h-8 rounded-full object-cover mr-2"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            const fallback = target.nextElementSibling as HTMLElement;
                                            if (fallback) fallback.classList.remove('hidden');
                                        }}
                                    />
                                ) : null}
                                <div className={`w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm mr-2 ${agent.avatar ? 'hidden' : ''}`}>
                                    {agent.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-700">{highlightMatch(agent.name, query)}</span>
                                    <span className="text-xs text-gray-500">ID: {agent.id}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : query.length >= 2 ? (
                    <p className="text-sm text-gray-500">Nenhum agente encontrado.</p>
                ) : (
                    <p className="text-sm text-gray-500">Digite pelo menos 2 caracteres para buscar.</p>
                )}
            </div>

            {/* Services Section - Busca por Nome */}
            <div>
                <div className="flex items-center mb-3">
                    <Box className="w-5 h-5 text-gray-500 mr-3" />
                    <h3 className="font-semibold text-gray-800">Serviços</h3>
                </div>
                {isSearchingServices ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        Buscando serviços...
                    </div>
                ) : filteredServices.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {filteredServices.map(service => (
                            <div 
                                key={service.id} 
                                onClick={() => onSelectService(service.id.toString())}
                                className="flex items-center p-2 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors"
                            >
                                <Box className="w-6 h-6 text-blue-600 mr-2" />
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-700">{highlightMatch(service.nome, query)}</span>
                                    <span className="text-xs text-gray-500">R$ {Number(service.preco).toFixed(2)} • {service.duracao_minutos} min</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : query.length >= 2 ? (
                    <p className="text-sm text-gray-500">Nenhum serviço encontrado.</p>
                ) : (
                    <p className="text-sm text-gray-500">Digite pelo menos 2 caracteres para buscar.</p>
                )}
            </div>
        </div>
    );
};

export default SearchResults;
