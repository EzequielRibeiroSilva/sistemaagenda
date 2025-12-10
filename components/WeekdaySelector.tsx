import React from 'react';

/**
 * Componente WeekdaySelector
 * 
 * Permite selecionar dias da semana através de checkboxes.
 * Usado para definir em quais dias um cupom pode ser utilizado.
 * 
 * @param selectedDays - Array com dias selecionados (0=Dom, 1=Seg, ..., 6=Sáb)
 * @param onChange - Callback chamado quando a seleção muda
 * @param disabled - Se true, desabilita todos os checkboxes
 */

interface WeekdaySelectorProps {
  selectedDays: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}

const DIAS_SEMANA = [
  { numero: 0, nome: 'Domingo', abrev: 'Dom' },
  { numero: 1, nome: 'Segunda-feira', abrev: 'Seg' },
  { numero: 2, nome: 'Terça-feira', abrev: 'Ter' },
  { numero: 3, nome: 'Quarta-feira', abrev: 'Qua' },
  { numero: 4, nome: 'Quinta-feira', abrev: 'Qui' },
  { numero: 5, nome: 'Sexta-feira', abrev: 'Sex' },
  { numero: 6, nome: 'Sábado', abrev: 'Sáb' },
];

const WeekdaySelector: React.FC<WeekdaySelectorProps> = ({ selectedDays, onChange, disabled = false }) => {
  const handleToggleDay = (dayNumber: number) => {
    if (disabled) return;

    if (selectedDays.includes(dayNumber)) {
      // Remover dia
      onChange(selectedDays.filter(d => d !== dayNumber));
    } else {
      // Adicionar dia (manter ordenado)
      onChange([...selectedDays, dayNumber].sort((a, b) => a - b));
    }
  };

  const handleSelectAll = () => {
    if (disabled) return;
    onChange([0, 1, 2, 3, 4, 5, 6]);
  };

  const handleClearAll = () => {
    if (disabled) return;
    onChange([]);
  };

  const allSelected = selectedDays.length === 7;
  const noneSelected = selectedDays.length === 0;

  return (
    <div className="space-y-3">
      {/* Botões de ação rápida */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSelectAll}
          disabled={disabled || allSelected}
          className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Selecionar Todos
        </button>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={disabled || noneSelected}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Limpar Seleção
        </button>
      </div>

      {/* Grid de checkboxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {DIAS_SEMANA.map((dia) => {
          const isSelected = selectedDays.includes(dia.numero);
          
          return (
            <label
              key={dia.numero}
              className={`
                flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 bg-white hover:border-blue-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggleDay(dia.numero)}
                disabled={disabled}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-800 text-sm">{dia.abrev}</div>
                <div className="text-xs text-gray-500 hidden sm:block">{dia.nome}</div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Mensagem de ajuda */}
      <div className="text-sm text-gray-500">
        {noneSelected && (
          <p>
            Nenhum dia selecionado. O cupom será válido para <strong>todos os dias</strong>.
          </p>
        )}
        {!noneSelected && selectedDays.length < 7 && (
          <p>
            Cupom válido apenas nos dias selecionados ({selectedDays.length} {selectedDays.length === 1 ? 'dia' : 'dias'}).
          </p>
        )}
        {allSelected && (
          <p>
            Cupom válido para <strong>todos os dias da semana</strong>.
          </p>
        )}
      </div>
    </div>
  );
};

export default WeekdaySelector;
