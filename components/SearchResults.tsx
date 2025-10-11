
import React, { useMemo } from 'react';
import { Calendar, Users, Briefcase, Box, Leaf } from './Icons';

// Mock data for search results
const mockClients = [
    { id: 'c1', name: 'Ezequiel ribeiro', avatar: 'https://i.pravatar.cc/150?img=51' },
    { id: 'c2', name: 'Ezequiel Ribeiro', avatar: '' },
    { id: 'c3', name: 'Eduardo Soares', avatar: '' },
    { id: 'c4', name: 'Jordeson Oliveira', avatar: '' },
];

const mockAgents = [
    { id: '1', name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=1' },
    { id: '2', name: 'Ângelo Paixão', avatar: 'https://i.pravatar.cc/150?img=2' },
    { id: '3', name: 'Snake Filho', avatar: 'https://i.pravatar.cc/150?img=3' },
];

const mockServices = [
    { id: 's1', name: 'CORTE' },
    { id: 's2', name: 'CORTE + PIGMENTAÇÃO' },
    { id: 's3', name: 'CORTE + BARBA' },
    { id: 's4', name: 'BARBA + PIGMENTAÇÃO' },
];

interface SearchResultsProps {
    query: string;
    onAddNewAppointment: () => void;
    onSelectAgent: (agentId: string) => void;
    onSelectService: (serviceId: string) => void;
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

const SearchResults: React.FC<SearchResultsProps> = ({ query, onAddNewAppointment, onSelectAgent, onSelectService, userRole, loggedInAgentId }) => {
    const lowerCaseQuery = query.toLowerCase();

    const agentsToSearch = useMemo(() => {
        if (userRole === 'AGENTE' && loggedInAgentId) {
            return mockAgents.filter(agent => agent.id === loggedInAgentId);
        }
        return mockAgents;
    }, [userRole, loggedInAgentId]);

    const filteredClients = mockClients.filter(c => c.name.toLowerCase().includes(lowerCaseQuery));
    const filteredAgents = agentsToSearch.filter(a => a.name.toLowerCase().includes(lowerCaseQuery));
    const filteredServices = mockServices.filter(s => s.name.toLowerCase().includes(lowerCaseQuery));

    return (
        <div className="lg:absolute lg:top-full lg:left-0 lg:mt-2 lg:w-[48rem] lg:max-w-2xl bg-white lg:rounded-lg lg:shadow-lg lg:border lg:border-gray-200 z-50 p-6 space-y-6">
            {/* Appointments Section */}
            <div>
                <div className="flex items-center mb-3">
                    <Calendar className="w-5 h-5 text-gray-500 mr-3" />
                    <h3 className="font-semibold text-gray-800">Compromissos</h3>
                </div>
                <p className="text-sm text-gray-500">
                    Não Correspondidos Compromissos encontrado. <a href="#" onClick={(e) => { e.preventDefault(); onAddNewAppointment(); }} className="text-blue-600 font-semibold hover:underline">Adicionar Compromisso</a>
                </p>
            </div>

            {/* Clients Section */}
            <div>
                <div className="flex items-center mb-3">
                    <Users className="w-5 h-5 text-gray-500 mr-3" />
                    <h3 className="font-semibold text-gray-800">Clientes</h3>
                </div>
                {filteredClients.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {filteredClients.map(client => (
                            <div key={client.id} className="flex items-center p-2 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-gray-300">
                                {client.avatar ?
                                    <img src={client.avatar} alt={client.name} className="w-8 h-8 rounded-full object-cover mr-2" /> :
                                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold text-sm mr-2">{client.name.charAt(0)}</div>
                                }
                                <span className="text-sm font-medium text-gray-700">{highlightMatch(client.name, query)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">Nenhum cliente encontrado.</p>
                )}
            </div>

            {/* Agents Section */}
            <div>
                <div className="flex items-center mb-3">
                    <Briefcase className="w-5 h-5 text-gray-500 mr-3" />
                    <h3 className="font-semibold text-gray-800">Agentes</h3>
                </div>
                 {filteredAgents.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {filteredAgents.map(agent => (
                            <div 
                                key={agent.id} 
                                onClick={() => onSelectAgent(agent.id)}
                                className="flex items-center p-2 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-gray-300"
                            >
                                <img src={agent.avatar} alt={agent.name} className="w-8 h-8 rounded-full object-cover mr-2" />
                                <span className="text-sm font-medium text-gray-700">{highlightMatch(agent.name, query)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">Nenhum agente encontrado.</p>
                )}
            </div>

            {/* Services Section */}
            <div>
                <div className="flex items-center mb-3">
                    <Box className="w-5 h-5 text-gray-500 mr-3" />
                    <h3 className="font-semibold text-gray-800">Serviços</h3>
                </div>
                {filteredServices.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {filteredServices.map(service => (
                            <div 
                                key={service.id} 
                                onClick={() => onSelectService(service.id)}
                                className="flex items-center p-2 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-gray-300"
                            >
                               
                                <span className="text-sm font-medium text-gray-700">{highlightMatch(service.name, query)}</span>
                            </div>
                        ))}
                    </div>
                 ) : (
                    <p className="text-sm text-gray-500">Nenhum serviço encontrado.</p>
                )}
            </div>
        </div>
    );
};

export default SearchResults;
