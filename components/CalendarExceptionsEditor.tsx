import React, { useState } from 'react';
import { Calendar, X, Plus } from './Icons';
import DatePicker from './DatePicker';
import { CalendarException } from '../hooks/useUnitManagement';

interface CalendarExceptionsEditorProps {
    exceptions: CalendarException[];
    onExceptionsChange: (exceptions: CalendarException[]) => void;
}

const CalendarExceptionsEditor: React.FC<CalendarExceptionsEditorProps> = ({
    exceptions,
    onExceptionsChange
}) => {
    const [isAddingException, setIsAddingException] = useState(false);
    const [newException, setNewException] = useState<Omit<CalendarException, 'id'>>({
        data_inicio: '',
        data_fim: '',
        hora_inicio: null,
        hora_fim: null,
        tipo: 'Feriado',
        descricao: ''
    });

    const [blockType, setBlockType] = useState<'full_day' | 'time_range'>('full_day');

    const [selectedRange, setSelectedRange] = useState<{ startDate: Date | null; endDate: Date | null }>({
        startDate: null,
        endDate: null
    });

    const handleDateRangeChange = (range: { startDate: Date | null; endDate: Date | null }) => {
        setSelectedRange(range);
        
        if (range.startDate) {
            setNewException(prev => ({
                ...prev,
                data_inicio: range.startDate!.toISOString().split('T')[0]
            }));
        }
        
        if (range.endDate) {
            setNewException(prev => ({
                ...prev,
                data_fim: range.endDate!.toISOString().split('T')[0]
            }));
        }
    };

    const handleAddException = () => {
        if (!newException.data_inicio || !newException.data_fim || !newException.descricao.trim()) {
            alert('Por favor, preencha todos os campos obrigatórios');
            return;
        }

        if (blockType === 'time_range') {
            const start = (newException.hora_inicio || '').toString().substring(0, 5);
            const end = (newException.hora_fim || '').toString().substring(0, 5);
            if (!start || !end) {
                alert('Por favor, informe hora de início e fim');
                return;
            }

            const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
            if (!isValidTime(start) || !isValidTime(end)) {
                alert('Horários inválidos. Use o formato HH:MM');
                return;
            }

            if (end <= start) {
                alert('A hora de fim deve ser maior que a hora de início');
                return;
            }
        } else {
            // Dia inteiro: limpar horários
            newException.hora_inicio = null;
            newException.hora_fim = null;
        }

        const exceptionToAdd: CalendarException = {
            ...newException,
            id: Date.now() // Temporary ID for new exceptions
        };

        onExceptionsChange([...exceptions, exceptionToAdd]);
        
        // Reset form
        setNewException({
            data_inicio: '',
            data_fim: '',
            hora_inicio: null,
            hora_fim: null,
            tipo: 'Feriado',
            descricao: ''
        });
        setBlockType('full_day');
        setSelectedRange({ startDate: null, endDate: null });
        setIsAddingException(false);
    };

    const handleRemoveException = (index: number) => {
        const updatedExceptions = exceptions.filter((_, i) => i !== index);
        onExceptionsChange(updatedExceptions);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'Data inválida';

        // Criar objeto Date diretamente da string (funciona com ISO e formatos simples)
        const date = new Date(dateStr);

        // Verificar se a data é válida
        if (isNaN(date.getTime())) {
            return 'Data inválida';
        }

        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'UTC' // Garantir que não há problemas de timezone
        });
    };





    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                    Defina datas em que o local estará fechado (feriados, férias, manutenções, etc.)
                </p>
                {!isAddingException && (
                    <button
                        type="button"
                        onClick={() => setIsAddingException(true)}
                        className="flex items-center text-sm font-medium text-white bg-[#2663EB] px-3 py-2 rounded-lg hover:bg-[#1d4ed8] transition-colors"
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        Adicionar Exceção
                    </button>
                )}
            </div>

            {/* Form para adicionar nova exceção */}
            {isAddingException && (
                <div className="bg-[#F0F6FF] border-2 border-blue-200 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-800">Nova Exceção de Calendário</h3>
                        <button
                            type="button"
                            onClick={() => {
                                setIsAddingException(false);
                                setNewException({
                                    data_inicio: '',
                                    data_fim: '',
                                    hora_inicio: null,
                                    hora_fim: null,
                                    tipo: 'Feriado',
                                    descricao: ''
                                });
                                setBlockType('full_day');
                                setSelectedRange({ startDate: null, endDate: null });
                            }}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Seletor de período */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">
                                Período <span className="text-red-500">*</span>
                            </label>
                            <DatePicker
                                mode="range"
                                selectedRange={selectedRange}
                                onDateChange={handleDateRangeChange}
                            />
                            {selectedRange.startDate && selectedRange.endDate && (
                                <p className="text-xs text-gray-600 mt-1">
                                    {formatDate(newException.data_inicio)} até {formatDate(newException.data_fim)}
                                </p>
                            )}
                        </div>

                        {/* Tipo de exceção */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">
                                Tipo <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={newException.tipo}
                                onChange={(e) => setNewException(prev => ({ ...prev, tipo: e.target.value as CalendarException['tipo'] }))}
                                className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="Feriado">Feriado</option>
                                <option value="Férias">Férias</option>
                                <option value="Evento Especial">Evento Especial</option>
                                <option value="Manutenção">Manutenção</option>
                                <option value="Outro">Outro</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                            Bloqueio
                        </label>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="radio"
                                    checked={blockType === 'full_day'}
                                    onChange={() => {
                                        setBlockType('full_day');
                                        setNewException(prev => ({ ...prev, hora_inicio: null, hora_fim: null }));
                                    }}
                                />
                                Dia inteiro
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="radio"
                                    checked={blockType === 'time_range'}
                                    onChange={() => setBlockType('time_range')}
                                />
                                Horário específico
                            </label>
                        </div>
                    </div>

                    {blockType === 'time_range' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">
                                    Hora início <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="time"
                                    value={(newException.hora_inicio || '') as string}
                                    onChange={(e) => setNewException(prev => ({ ...prev, hora_inicio: e.target.value }))}
                                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">
                                    Hora fim <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="time"
                                    value={(newException.hora_fim || '') as string}
                                    onChange={(e) => setNewException(prev => ({ ...prev, hora_fim: e.target.value }))}
                                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>
                    )}

                    {/* Descrição */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                            Descrição <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Ex: Manutenção, Evento interno, Indisponibilidade..."
                            value={newException.descricao}
                            onChange={(e) => setNewException(prev => ({ ...prev, descricao: e.target.value }))}
                            className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Botões de ação */}
                    <div className="flex items-center gap-2 pt-2">
                        <button
                            type="button"
                            onClick={handleAddException}
                            className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                            Adicionar
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsAddingException(false);
                                setNewException({
                                    data_inicio: '',
                                    data_fim: '',
                                    hora_inicio: null,
                                    hora_fim: null,
                                    tipo: 'Feriado',
                                    descricao: ''
                                });
                                setBlockType('full_day');
                                setSelectedRange({ startDate: null, endDate: null });
                            }}
                            className="bg-gray-100 text-gray-700 font-semibold px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Lista de exceções adicionadas */}
            {exceptions.length > 0 ? (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Exceções Cadastradas ({exceptions.length})
                    </h3>
                    {exceptions.map((exception, index) => (
                        <div
                            key={exception.id || index}
                            className="flex items-center justify-between p-3 rounded-lg border-2 bg-[#F0F6FF] border-blue-200 transition-all hover:shadow-sm"
                        >
                            <div className="flex items-center gap-3 flex-1">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-sm">{exception.descricao}</span>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-white bg-opacity-60">
                                            {exception.tipo}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Calendar className="w-3 h-3 opacity-60" />
                                        <span className="text-xs opacity-80">
                                            {formatDate(exception.data_inicio)}
                                            {exception.data_inicio !== exception.data_fim && (
                                                <> até {formatDate(exception.data_fim)}</>
                                            )}
                                        </span>
                                    </div>
                                    {(exception as any).hora_inicio && (exception as any).hora_fim && (
                                        <div className="text-xs text-gray-600 mt-1">
                                            {(exception as any).hora_inicio} - {(exception as any).hora_fim}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleRemoveException(index)}
                                className="text-gray-500 hover:text-red-600 p-2 rounded-lg hover:bg-white hover:bg-opacity-50 transition-colors"
                                title="Remover exceção"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 font-medium">Nenhuma exceção cadastrada</p>
                    <p className="text-xs text-gray-500 mt-1">
                        Adicione feriados, férias ou outros períodos de fechamento
                    </p>
                </div>
            )}
        </div>
    );
};

export default CalendarExceptionsEditor;
