import React from 'react';
import { createPortal } from 'react-dom';
import { X, Crown } from './Icons';

interface PendingAppointmentsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    pendentesAtrasados: any[];
    onOpenPendente: (agendamentoId: number) => void;
}

const PendingAppointmentsDrawer: React.FC<PendingAppointmentsDrawerProps> = ({
    isOpen,
    onClose,
    pendentesAtrasados,
    onOpenPendente
}) => {
    const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

    const formatDatePtBr = (isoOrYmd: string) => {
        const ymd = String(isoOrYmd || '').split('T')[0];
        const parts = ymd.split('-');
        if (parts.length !== 3) return ymd;
        const [yyyy, mm, dd] = parts;
        return `${dd}/${mm}/${yyyy}`;
    };

    const formatTimeShort = (time: string) => {
        const raw = String(time || '').trim();
        if (!raw) return '';
        const parts = raw.split(':');
        if (parts.length < 2) return raw;
        return `${parts[0]}:${parts[1]}`;
    };

    const formatMoneyBr = (value: unknown) => {
        const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
        const safe = Number.isFinite(n) ? n : 0;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safe);
    };

    if (!isOpen || !portalRoot) return null;

    return createPortal(
        <>
            <div
                className="fixed inset-0 z-50 bg-black/60 flex justify-end"
                onClick={onClose}
                aria-labelledby="pending-appointments-drawer-title"
                role="dialog"
                aria-modal="true"
            >
                <div
                    className="relative flex w-full max-w-2xl flex-col bg-gray-50 shadow-xl transform transition-transform duration-300 ease-in-out"
                    onClick={(e) => e.stopPropagation()}
                    style={{ animation: 'slideInFromRight 0.3s forwards' }}
                >
                    <style>{`
                        @keyframes slideInFromRight {
                            from { transform: translateX(100%); }
                            to { transform: translateX(0); }
                        }
                    `}</style>

                    <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white flex-shrink-0">
                        <h2
                            className="text-xl font-bold text-gray-800"
                            id="pending-appointments-drawer-title"
                        >
                            Agendamentos Pendentes
                        </h2>
                        <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="text-sm text-gray-500">Aprovados com término já passado</div>

                        {pendentesAtrasados.length === 0 ? (
                            <div className="text-sm text-gray-600">Nenhum agendamento pendente no período atual.</div>
                        ) : (
                            <div className="space-y-3">
                                {pendentesAtrasados.map((a: any) => {
                                    const dateStr = String(a.data_agendamento || '').split('T')[0];
                                    const start = formatTimeShort(a.hora_inicio || '');
                                    const end = formatTimeShort(a.hora_fim || '');
                                    const horario = start && end ? `${start} às ${end}` : `${start || ''}${end ? ` às ${end}` : ''}`;
                                    const clientName = (a as any).cliente_nome || (a as any).clienteNome || (a as any).cliente_name || `Cliente #${a.cliente_id}`;
                                    const agentName = (a as any).agente_nome || (a as any).agenteNome || (a as any).profissional_nome || '';
                                    const isClube = (a as any).coberto_clube === true;

                                    const servicos = Array.isArray((a as any).servicos) ? (a as any).servicos : [];
                                    const servicoNome = servicos.length > 0 ? String(servicos[0]?.nome || '').trim() : '';
                                    const valor = formatMoneyBr((a as any).valor_total);

                                    return (
                                        <div
                                            key={a.id}
                                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                                            onClick={() => onOpenPendente(a.id)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    onOpenPendente(a.id);
                                                }
                                            }}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                                                        <span className="truncate">{clientName}</span>
                                                        {isClube && (
                                                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 text-[11px] font-semibold flex-shrink-0">
                                                                <Crown className="h-3 w-3" />
                                                                Clube
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="text-xs text-gray-700 mt-1 truncate">
                                                        {servicoNome ? `${servicoNome} • ${valor}` : valor}
                                                    </div>

                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {formatDatePtBr(dateStr)}{horario ? ` • ${horario}` : ''}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onOpenPendente(a.id);
                                                        }}
                                                    >
                                                        Gerir
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                                                <span className="font-medium text-gray-700">Equipe:</span>{' '}
                                                <span>{agentName || `Agente #${a.agente_id}`}</span>{' '}
                                                <span className="text-gray-400">•</span>{' '}
                                                <span className="text-gray-500">#{a.numero_agendamento || a.id}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>,
        portalRoot
    );
};

export default PendingAppointmentsDrawer;
