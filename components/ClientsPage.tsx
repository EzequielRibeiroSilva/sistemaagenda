import React, { useState, useMemo } from 'react';
import { Download, Plus, CheckCircle, ChevronLeft, ChevronRight, MoreHorizontal } from './Icons';
import type { Client } from '../types';

const mockClients: Client[] = [
    { id: 511, name: 'Charles Gesso', phone: '+558899200566', email: 'tzacharles78@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 51, socialAlert: false },
    { id: 510, name: 'Matheus Silva', phone: '+558598921014', email: 'm4k.u..1a@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 51, socialAlert: false },
    { id: 509, name: 'Marcos Vendramel', phone: '+555198108108', email: 'marcos.vendramel87@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 508, name: 'Caio Felipe', phone: '+5585988923803', email: 'caiofe95@gmail.com', totalApps: 2, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 507, name: 'Eduardo Oliveira', phone: '+558598108108', email: 'eduardoknhling1@gmail.com', socialAlert: true, totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50 },
    { id: 506, name: 'Paulo Eduardo', phone: '+5585981995843', email: 'eduardopinheirosousa09@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 505, name: 'Aldeides Mendes', phone: '+5585921499830', email: 'aldeizmendz80@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 504, name: 'Macon Vitor', phone: '+5585982777701', email: 'maiconvitor76@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 503, name: 'Paulo Ricardo', phone: '+5585981618330', email: 'pauloalvessiq@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 502, name: 'Joao Victor Soares Mesquita', phone: '+5585987725191', email: 'liviaferreirasm@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 501, name: 'Aldeides Mendes', phone: '+5585986445248', email: 'aldeizmendz45@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 500, name: 'Erik Oliveira', phone: '+5585991571524', email: 'erikoliveira2999@gmail.com', socialAlert: true, totalApps: 2, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50 },
    { id: 499, name: 'Caio Felipe', phone: '+5585988238036', email: 'caiofelipevieiradasilva@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 498, name: 'Michael Aquino', phone: '+5585981772516', email: 'michelmotoristadf@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 497, name: 'Erik Leonardo', phone: '+5585988678447', email: 'erikleo929@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 496, name: 'Mateus Leal', phone: '+5585985863174', email: 'lealmateux48@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 495, name: 'Aldeides Mendes', phone: '+5585921499830', email: 'aldeizmendz35@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 494, name: 'Guilherme Soares', phone: '+5585981890822', email: 'euguilhermedesign@gmail.com', socialAlert: true, totalApps: 0, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46 },
    { id: 493, name: 'Sival Filho', phone: '', email: 'sivalfilho@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 492, name: '', phone: '', email: 'gabriel2005paixaomota@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
];

const TOTAL_CLIENTS = 505;

const FilterInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input 
        {...props}
        className="w-full bg-white p-1.5 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-blue-500 focus:border-blue-500"
    />
);

interface ClientsPageProps {
  setActiveView: (view: string) => void;
  onEditClient: (clientId: number) => void;
}

const ClientsPage: React.FC<ClientsPageProps> = ({ setActiveView, onEditClient }) => {
    const [filters, setFilters] = useState({
        id: '',
        name: '',
        phone: '',
    });

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const filteredClients = useMemo(() => {
        return mockClients.filter(client => {
            const idMatch = filters.id ? String(client.id).includes(filters.id) : true;
            const nameMatch = filters.name ? client.name.toLowerCase().includes(filters.name.toLowerCase()) : true;
            const phoneMatch = filters.phone ? client.phone.toLowerCase().includes(filters.phone.toLowerCase()) : true;
            return idMatch && nameMatch && phoneMatch;
        });
    }, [filters]);

    const subscriberCount = useMemo(() => mockClients.filter(client => client.socialAlert).length, []);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
                    <p className="text-sm text-gray-500">Mostrando {filteredClients.length} de {TOTAL_CLIENTS}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                        <Download className="w-4 h-4" />
                        Baixar .csv
                    </button>
                    <button 
                        onClick={() => setActiveView('clients-add')}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700">
                        <Plus className="w-4 h-4" />
                        Novo Cliente
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 text-left font-semibold text-gray-600">ID</th>
                                <th className="p-3 text-left font-semibold text-gray-600">NOME COMPLETO</th>
                                <th className="p-3 text-left font-semibold text-gray-600">TELEFONE</th>
                                <th className="p-3 text-left font-semibold text-gray-600">{subscriberCount} ASSINANTES</th>
                            </tr>
                             <tr>
                                <td className="p-3 border-t border-gray-200">
                                    <FilterInput 
                                        type="text" 
                                        name="id"
                                        placeholder="ID" 
                                        value={filters.id}
                                        onChange={handleFilterChange}
                                    />
                                </td>
                                <td className="p-3 border-t border-gray-200">
                                    <FilterInput 
                                        type="text" 
                                        name="name"
                                        placeholder="Pesquisar por nome" 
                                        value={filters.name}
                                        onChange={handleFilterChange}
                                    />
                                </td>
                                <td className="p-3 border-t border-gray-200">
                                    <FilterInput 
                                        type="text" 
                                        name="phone"
                                        placeholder="Telefone..." 
                                        value={filters.phone}
                                        onChange={handleFilterChange}
                                    />
                                </td>
                                <td className="p-3 border-t border-gray-200"></td>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.map(client => (
                                <tr key={client.id} className="border-t border-gray-200 hover:bg-gray-50">
                                    <td className="p-3 text-gray-500 font-medium">{client.id}</td>
                                    <td className="p-3 font-medium whitespace-nowrap">
                                      <a href="#" onClick={(e) => { e.preventDefault(); onEditClient(client.id); }} className="text-blue-600 hover:underline">
                                        {client.name}
                                      </a>
                                    </td>
                                    <td className="p-3 text-gray-600 whitespace-nowrap">{client.phone}</td>
                                    <td className="p-3 text-center">
                                        {client.socialAlert && <CheckCircle className="w-5 h-5 text-green-500" />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                         <tfoot className="bg-gray-50">
                            <tr>
                                <th className="p-3 text-left font-semibold text-gray-600">ID</th>
                                <th className="p-3 text-left font-semibold text-gray-600">NOME COMPLETO</th>
                                <th className="p-3 text-left font-semibold text-gray-600">TELEFONE</th>
                                <th className="p-3 text-left font-semibold text-gray-600">{subscriberCount} ASSINANTES</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
                <p>Mostrando {filteredClients.length} de {TOTAL_CLIENTS}</p>
                <div className="flex items-center gap-2">
                    <span>Página:</span>
                    <span className="font-semibold text-gray-800">1</span>
                    <div className="flex items-center">
                        <button className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50" disabled><ChevronLeft className="w-4 h-4" /></button>
                        <button className="p-2 rounded-md hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientsPage;
