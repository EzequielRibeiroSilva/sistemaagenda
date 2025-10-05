import React, { useState, useMemo } from 'react';
import { Table, Download, MoreHorizontal, ChevronDown, CheckCircle, ChevronLeft, ChevronRight, X, Check, RotateCw, UserX } from './Icons';
import type { AppointmentDetail, AppointmentStatus } from '../types';

const mockAppointments: AppointmentDetail[] = [
  { id: 4172, service: 'CORTE', dateTime: '27 Setembro, 2025 - 18:00', timeRemaining: '1 dias', timeRemainingStatus: 'pending', agent: { name: 'Snake Filho', avatar: 'https://i.pravatar.cc/150?img=1' }, client: { name: 'Vicente Arley', avatar: 'https://i.pravatar.cc/150?img=2' }, status: 'Aprovado', paymentStatus: 'Não Pago', createdAt: '25 Setembro, 2025 - 23:56', paymentMethod: 'Não definido'},
  { id: 4171, service: 'CORTE', dateTime: '26 Setembro, 2025 - 18:00', timeRemaining: '18 horas', timeRemainingStatus: 'soon', agent: { name: 'Snake Filho', avatar: 'https://i.pravatar.cc/150?img=1' }, client: { name: 'Vicente Arley', avatar: 'https://i.pravatar.cc/150?img=2' }, status: 'Aprovado', paymentStatus: 'Não Pago', createdAt: '25 Setembro, 2025 - 23:55', paymentMethod: 'Não definido'},
  { id: 4170, service: 'CORTE', dateTime: '27 Setembro, 2025 - 15:00', timeRemaining: '1 dias', timeRemainingStatus: 'pending', agent: { name: 'Snake Filho', avatar: 'https://i.pravatar.cc/150?img=1' }, client: { name: 'Vicente Arley', avatar: 'https://i.pravatar.cc/150?img=2' }, status: 'Aprovado', paymentStatus: 'Não Pago', createdAt: '25 Setembro, 2025 - 19:04', paymentMethod: 'Não definido'},
  { id: 4169, service: 'CORTE', dateTime: '26 Setembro, 2025 - 18:00', timeRemaining: '18 horas', timeRemainingStatus: 'soon', agent: { name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=3' }, client: { name: 'Vicente Arley', avatar: 'https://i.pravatar.cc/150?img=2' }, status: 'Aprovado', paymentStatus: 'Não Pago', createdAt: '25 Setembro, 2025 - 17:35', paymentMethod: 'Não definido'},
  { id: 4168, service: 'CORTE', dateTime: '25 Setembro, 2025 - 17:00', timeRemaining: 'Passado', timeRemainingStatus: 'overdue', agent: { name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=3' }, client: { name: 'Charles Gesso', avatar: 'https://i.pravatar.cc/150?img=4' }, status: 'Concluído', paymentStatus: 'Pago', createdAt: '25 Setembro, 2025 - 16:55', paymentMethod: 'Cartão Crédito'},
  { id: 4167, service: 'CORTE', dateTime: '25 Setembro, 2025 - 18:00', timeRemaining: 'Passado', timeRemainingStatus: 'overdue', agent: { name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=3' }, client: { name: 'Vicente Arley', avatar: 'https://i.pravatar.cc/150?img=2' }, status: 'Cancelado', paymentStatus: 'Não Pago', createdAt: '25 Setembro, 2025 - 16:55', paymentMethod: 'Não definido'},
  { id: 4166, service: 'CORTE', dateTime: '25 Setembro, 2025 - 16:00', timeRemaining: 'Passado', timeRemainingStatus: 'overdue', agent: { name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=3' }, client: { name: 'Vicente Arley', avatar: 'https://i.pravatar.cc/150?img=2' }, status: 'Concluído', paymentStatus: 'Pago', createdAt: '25 Setembro, 2025 - 15:09', paymentMethod: 'PIX'},
  { id: 4165, service: 'CORTE + BARBA', dateTime: '26 Setembro, 2025 - 18:00', timeRemaining: '17 horas', timeRemainingStatus: 'soon', agent: { name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=3' }, client: { name: 'José Raine', avatar: 'https://i.pravatar.cc/150?img=5' }, status: 'Aprovado', paymentStatus: 'Não Pago', createdAt: '25 Setembro, 2025 - 13:55', paymentMethod: 'Dinheiro'},
  { id: 4164, service: 'CORTE', dateTime: '26 Setembro, 2025 - 09:00', timeRemaining: '7 horas', timeRemainingStatus: 'soon', agent: { name: 'Snake Filho', avatar: 'https://i.pravatar.cc/150?img=1' }, client: { name: 'Vicente Arley', avatar: 'https://i.pravatar.cc/150?img=2' }, status: 'Aprovado', paymentStatus: 'Não Pago', createdAt: '25 Setembro, 2025 - 12:56', paymentMethod: 'Cartão Débito'},
  { id: 4163, service: 'CORTE', dateTime: '25 Setembro, 2025 - 14:00', timeRemaining: 'Passado', timeRemainingStatus: 'overdue', agent: { name: 'Ângelo Paixão', avatar: 'https://i.pravatar.cc/150?img=6' }, client: { name: 'Pedro Hugo', avatar: 'https://i.pravatar.cc/150?img=7' }, status: 'Não Compareceu', paymentStatus: 'Não Pago', createdAt: '25 Setembro, 2025 - 12:45', paymentMethod: 'Não definido'},
];
const TOTAL_APPOINTMENTS = 4087;

const ColumnToggle: React.FC<{ label: string; name: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, checked, onChange }) => (
    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white">
      <label htmlFor={name} className="text-gray-800 font-medium text-sm">{label}</label>
      <button
        id={name}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange({ target: { name, checked: !checked } } as any)}
        className="relative flex items-center justify-center w-6 h-6 cursor-pointer"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <input 
          type="checkbox" 
          checked={checked}
          name={name}
          onChange={onChange}
          className="sr-only"
        />
        <span className={`w-5 h-5 rounded-full border-2 transition-all ${checked ? 'border-blue-600 bg-blue-600' : 'border-gray-400 bg-white'}`}></span>
        {checked && <span className="absolute w-2 h-2 bg-white rounded-full"></span>}
      </button>
    </div>
);

const FilterInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input 
        {...props}
        className="w-full bg-white p-1.5 border border-gray-300 rounded-md text-xs text-gray-700 focus:ring-blue-500 focus:border-blue-500"
    />
);

const FilterSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, ...props }) => (
    <select 
        {...props}
        className="w-full bg-white p-1.5 border border-gray-300 rounded-md text-xs text-gray-700 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
    >
        {children}
    </select>
);

const StyledCheckbox: React.FC<{
  checked: boolean;
  onChange: () => void;
  indeterminate?: boolean;
}> = ({ checked, onChange, indeterminate = false }) => {
  return (
    <div
      onClick={onChange}
      className={`w-5 h-5 flex items-center justify-center border-2 rounded cursor-pointer transition-colors
        ${checked || indeterminate ? 'bg-blue-600 border-blue-600' : 'border-gray-400 bg-white'}
      `}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {checked && <Check className="w-3 h-3 text-white" />}
      {indeterminate && !checked && <div className="w-2 h-0.5 bg-white" />}
    </div>
  );
};

const StatusBadge: React.FC<{ status: AppointmentStatus }> = ({ status }) => {
    const statusStyles: { [key in AppointmentStatus]: { icon: React.ReactNode; text: string; className: string } } = {
        'Aprovado': { icon: <CheckCircle className="w-3 h-3" />, text: 'Aprovado', className: 'bg-green-100 text-green-800' },
        'Concluído': { icon: <Check className="w-3 h-3" />, text: 'Concluído', className: 'bg-blue-100 text-blue-800' },
        'Cancelado': { icon: <X className="w-3 h-3" />, text: 'Cancelado', className: 'bg-red-100 text-red-800' },
        'Não Compareceu': { icon: <UserX className="w-3 h-3" />, text: 'Não Compareceu', className: 'bg-gray-200 text-gray-700' },
    };

    const style = statusStyles[status];

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${style.className}`}>
            {style.icon}
            {style.text}
        </span>
    );
};

interface AppointmentsPageProps {
  loggedInAgentId: string | null;
}

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ loggedInAgentId }) => {
    const [isModalOpen, setModalOpen] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState({
        id: true,
        servico: true,
        dataHora: true,
        tempoRestante: true,
        selecionado: true,
        cliente: true,
        estado: true,
        statusPagamento: true,
        criadoEm: true,
        metodoPagamento: true,
        email: false,
        telefone: false,
        code: false,
        duracao: false,
        sourceId: false,
        pagamentoDeParte: false,
        preco: false,
    });
    const [selectedAppointments, setSelectedAppointments] = useState<Record<number, boolean>>({});

    const initialFilters = {
        id: '',
        service: 'all',
        dateTime: '',
        timeRemainingStatus: 'all' as 'all' | AppointmentDetail['timeRemainingStatus'],
        agent: 'all',
        client: '',
        status: 'all' as AppointmentStatus | 'all',
        paymentStatus: 'all',
        createdAt: '',
        paymentMethod: 'all',
    };

    const [filters, setFilters] = useState(initialFilters);
    
    const handleColumnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setVisibleColumns(prev => ({ ...prev, [name]: checked }));
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const serviceOptions = useMemo(() => [...new Set(mockAppointments.map(a => a.service))], []);
    const agentOptions = useMemo(() => [...new Set(mockAppointments.map(a => a.agent.name))], []);
    const paymentStatusOptions = useMemo(() => [...new Set(mockAppointments.map(a => a.paymentStatus))], []);
    const paymentMethodOptions = ['Não definido', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'PIX'];

    const getRemainingTimeClass = (status: AppointmentDetail['timeRemainingStatus']) => {
        switch (status) {
            case 'soon': return 'bg-orange-100 text-orange-800';
            case 'overdue': return 'bg-gray-100 text-gray-600';
            case 'pending': return 'bg-blue-100 text-blue-800';
            default: return 'bg-gray-100 text-gray-600';
        }
    };
    
    const filteredAppointments = useMemo(() => {
        const agentNameForFilter = loggedInAgentId === '1' ? 'Eduardo Soares' : null;

        return mockAppointments.filter(app => {
            if (agentNameForFilter && app.agent.name !== agentNameForFilter) {
                return false;
            }

            const { id, service, dateTime, timeRemainingStatus, agent, client, status, paymentStatus, createdAt, paymentMethod } = filters;
            
            if (id && !String(app.id).toLowerCase().includes(id.toLowerCase())) return false;
            if (service !== 'all' && app.service !== service) return false;
            if (dateTime && !app.dateTime.toLowerCase().includes(dateTime.toLowerCase())) return false;

            if (status !== 'all' && app.status !== status) return false;
            if (agent !== 'all' && app.agent.name !== agent && !loggedInAgentId) return false;
            if (paymentStatus !== 'all' && app.paymentStatus !== paymentStatus) return false;
            if (paymentMethod !== 'all' && app.paymentMethod !== paymentMethod) return false;
            if (timeRemainingStatus !== 'all' && app.timeRemainingStatus !== timeRemainingStatus) return false;

            if (client && !app.client.name.toLowerCase().includes(client.toLowerCase())) return false;
            if (createdAt && !app.createdAt.toLowerCase().includes(createdAt.toLowerCase())) return false;
            
            return true;
        });
    }, [filters, loggedInAgentId]);

    const allSelected = useMemo(() => 
        filteredAppointments.length > 0 && filteredAppointments.every(app => selectedAppointments[app.id]),
        [selectedAppointments, filteredAppointments]
    );

    const isIndeterminate = useMemo(() => 
        filteredAppointments.some(app => selectedAppointments[app.id]) && !allSelected,
        [selectedAppointments, allSelected, filteredAppointments]
    );

    const handleSelectAll = () => {
        const newSelectedState = !allSelected;
        const newSelectedAppointments = filteredAppointments.reduce((acc, app) => {
            acc[app.id] = newSelectedState;
            return acc;
        }, {} as Record<number, boolean>);
        setSelectedAppointments(newSelectedAppointments);
    };

    const handleSelectOne = (id: number) => {
        setSelectedAppointments(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };
    
    const handleClearFilters = () => {
        setFilters(initialFilters);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Compromissos</h1>
                    <p className="text-sm text-gray-500">Mostrando {filteredAppointments.length} de {TOTAL_APPOINTMENTS}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                        <Download className="w-4 h-4" />
                        Baixar .csv
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1600px] text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 w-12 text-center font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10">
                                    <StyledCheckbox 
                                        checked={allSelected}
                                        indeterminate={isIndeterminate}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                {visibleColumns.id && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">ID</th>}
                                {visibleColumns.servico && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">SERVIÇO</th>}
                                {visibleColumns.dataHora && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">DATA/HORA</th>}
                                {visibleColumns.tempoRestante && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">TEMPO RESTANTE</th>}
                                {visibleColumns.selecionado && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">SELECIONADO</th>}
                                {visibleColumns.cliente && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">CLIENTE</th>}
                                {visibleColumns.estado && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">ESTADO</th>}
                                {visibleColumns.statusPagamento && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">STATUS DE PAGAMENTO</th>}
                                {visibleColumns.criadoEm && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">CRIADO EM</th>}
                                {visibleColumns.metodoPagamento && <th className="p-3 text-left font-semibold text-gray-600 whitespace-nowrap">MÉTODO DE PAGAMENTO</th>}
                            </tr>
                            <tr>
                                <td className="p-3 border-t border-gray-200 sticky left-0 bg-gray-50 z-10"></td>
                                {visibleColumns.id && <td className="p-3 border-t border-gray-200"><FilterInput type="text" name="id" value={filters.id} onChange={handleFilterChange} placeholder="Pesquisar ID" /></td>}
                                {visibleColumns.servico && <td className="p-3 border-t border-gray-200"><FilterSelect name="service" value={filters.service} onChange={handleFilterChange}><option value="all">Todos Os Serviços</option>{serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}</FilterSelect></td>}
                                {visibleColumns.dataHora && <td className="p-3 border-t border-gray-200"><FilterInput type="text" name="dateTime" value={filters.dateTime} onChange={handleFilterChange} placeholder="Pesquisar Data/Hora" /></td>}
                                {visibleColumns.tempoRestante && <td className="p-3 border-t border-gray-200"><FilterSelect name="timeRemainingStatus" value={filters.timeRemainingStatus} onChange={handleFilterChange}><option value="all">Mostrar Todos Os</option><option value="soon">Em breve</option><option value="overdue">Passado</option><option value="pending">Pendente</option></FilterSelect></td>}
                                {visibleColumns.selecionado && <td className="p-3 border-t border-gray-200"><FilterSelect name="agent" value={filters.agent} onChange={handleFilterChange} disabled={!!loggedInAgentId}><option value="all">Todos Os Agentes</option>{agentOptions.map(a => <option key={a} value={a}>{a}</option>)}</FilterSelect></td>}
                                {visibleColumns.cliente && <td className="p-3 border-t border-gray-200"><FilterInput type="text" name="client" value={filters.client} onChange={handleFilterChange} placeholder="Pesquisar por Cliente" /></td>}
                                {visibleColumns.estado && (
                                    <td className="p-3 border-t border-gray-200">
                                        <FilterSelect name="status" value={filters.status} onChange={handleFilterChange}>
                                            <option value="all">Mostrar Todos Os</option>
                                            <option value="Aprovado">Aprovado</option>
                                            <option value="Concluído">Concluído</option>
                                            <option value="Cancelado">Cancelado</option>
                                            <option value="Não Compareceu">Não Compareceu</option>
                                        </FilterSelect>
                                    </td>
                                )}
                                {visibleColumns.statusPagamento && <td className="p-3 border-t border-gray-200"><FilterSelect name="paymentStatus" value={filters.paymentStatus} onChange={handleFilterChange}><option value="all">Mostrar Todos Os</option>{paymentStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}</FilterSelect></td>}
                                {visibleColumns.criadoEm && <td className="p-3 border-t border-gray-200"><FilterInput type="text" name="createdAt" value={filters.createdAt} onChange={handleFilterChange} placeholder="Pesquisar Data Criação" /></td>}
                                {visibleColumns.metodoPagamento && 
                                    <td className="p-3 border-t border-gray-200">
                                        <FilterSelect name="paymentMethod" value={filters.paymentMethod} onChange={handleFilterChange}>
                                            <option value="all">Método De Pagamento</option>
                                            {paymentMethodOptions.map(m => <option key={m} value={m}>{m}</option>)}
                                        </FilterSelect>
                                    </td>
                                }
                                <td className="p-3 border-t border-gray-200" colSpan={visibleColumns.metodoPagamento ? 1 : 2}>
                                     <button
                                        onClick={handleClearFilters}
                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                                    >
                                        <RotateCw className="w-3 h-3" />
                                        Limpar
                                    </button>
                                </td>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAppointments.map(app => (
                                <tr key={app.id} className="border-t border-gray-200 hover:bg-gray-50">
                                    <td className="p-3 text-center sticky left-0 bg-white hover:bg-gray-50 z-10">
                                        <StyledCheckbox
                                            checked={!!selectedAppointments[app.id]}
                                            onChange={() => handleSelectOne(app.id)}
                                        />
                                    </td>
                                    {visibleColumns.id && <td className="p-3 text-gray-500 whitespace-nowrap">{app.id}</td>}
                                    {visibleColumns.servico && <td className="p-3 font-medium text-gray-800 flex items-center gap-2 whitespace-nowrap"><span className={`w-2 h-2 rounded-full ${app.service === 'CORTE' ? 'bg-blue-500' : 'bg-cyan-500'}`}></span>{app.service}</td>}
                                    {visibleColumns.dataHora && <td className="p-3 text-gray-600 whitespace-nowrap">{app.dateTime}</td>}
                                    {visibleColumns.tempoRestante && <td className="p-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${getRemainingTimeClass(app.timeRemainingStatus)}`}>{app.timeRemaining}</span></td>}
                                    {visibleColumns.selecionado && <td className="p-3"><div className="flex items-center gap-2"><img src={app.agent.avatar} alt={app.agent.name} className="w-6 h-6 rounded-full" /><span className="font-medium text-gray-800 whitespace-nowrap">{app.agent.name}</span></div></td>}
                                    {visibleColumns.cliente && <td className="p-3"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><img src={app.client.avatar} alt={app.client.name} className="w-6 h-6 rounded-full" /><span className="font-medium text-gray-800 whitespace-nowrap">{app.client.name}</span></div><button className="text-gray-400 hover:text-gray-700 p-1"><MoreHorizontal className="w-4 h-4" /></button></div></td>}
                                    {visibleColumns.estado && <td className="p-3"><StatusBadge status={app.status} /></td>}
                                    {visibleColumns.statusPagamento && <td className="p-3 text-gray-600 whitespace-nowrap">{app.paymentStatus}</td>}
                                    {visibleColumns.criadoEm && <td className="p-3 text-gray-600 whitespace-nowrap">{app.createdAt}</td>}
                                    {visibleColumns.metodoPagamento && <td className="p-3 text-gray-600 whitespace-nowrap">{app.paymentMethod}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
                <p>Mostrando 1-10 de {TOTAL_APPOINTMENTS}</p>
                <div className="flex items-center gap-2">
                    <span>Página:</span>
                    <span className="font-semibold text-gray-800">1</span>
                    <div className="flex items-center">
                        <button className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50" disabled><ChevronLeft className="w-4 h-4" /></button>
                        <button className="p-2 rounded-md hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
                    <div className="bg-gray-50 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold text-gray-800">Mostrar Colunas Adicionais</h2>
                                <button onClick={() => setModalOpen(false)} className="p-1 rounded-full hover:bg-gray-200">
                                    <X className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 space-y-6 overflow-y-auto">
                           <div>
                               <h3 className="mb-2 text-xs font-semibold text-gray-500 uppercase">CAMPOS DO CLIENTE</h3>
                               <div className="space-y-2">
                                   <ColumnToggle label="E-mail" name="email" checked={visibleColumns.email} onChange={handleColumnChange} />
                                   <ColumnToggle label="Telefone" name="telefone" checked={visibleColumns.telefone} onChange={handleColumnChange} />
                               </div>
                           </div>
                            <div>
                               <h3 className="mb-2 text-xs font-semibold text-gray-500 uppercase">RESERVAS CAMPOS</h3>
                               <div className="space-y-2">
                                   <ColumnToggle label="Code" name="code" checked={visibleColumns.code} onChange={handleColumnChange} />
                                   <ColumnToggle label="Duração" name="duracao" checked={visibleColumns.duracao} onChange={handleColumnChange} />
                                   <ColumnToggle label="Source ID" name="sourceId" checked={visibleColumns.sourceId} onChange={handleColumnChange} />
                                   <ColumnToggle label="Método De Pagamento" name="metodoPagamento" checked={visibleColumns.metodoPagamento} onChange={handleColumnChange} />
                                   <ColumnToggle label="Pagamento De Parte" name="pagamentoDeParte" checked={visibleColumns.pagamentoDeParte} onChange={handleColumnChange} />
                                   <ColumnToggle label="Preço" name="preco" checked={visibleColumns.preco} onChange={handleColumnChange} />
                               </div>
                           </div>
                        </div>
                         <div className="p-6 border-t border-gray-200 bg-white rounded-b-xl">
                            <button onClick={() => setModalOpen(false)} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors">
                                Salvar Colunas Da Tabela
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppointmentsPage;