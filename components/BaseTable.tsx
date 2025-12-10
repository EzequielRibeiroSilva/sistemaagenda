import React, { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from './Icons';

// ========================================
// INTERFACES E TIPOS
// ========================================

export interface PaginationConfig {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export interface TableColumn<T = any> {
  key: string;
  label: string;
  width?: string; // Ex: "w-32", "w-64"
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => ReactNode;
  filterType?: 'text' | 'select' | 'none';
  filterPlaceholder?: string;
  filterOptions?: Array<{ value: string; label: string }>;
}

export interface BaseTableProps<T = any> {
  // Dados
  data: T[];
  columns: TableColumn<T>[];
  
  // Estado de carregamento
  isLoading?: boolean;
  loadingMessage?: string;
  
  // Estado vazio
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  
  // Erro
  error?: string | null;
  
  // Paginação
  pagination?: PaginationConfig;
  
  // Filtros
  filters?: Record<string, string>;
  onFilterChange?: (filterKey: string, value: string) => void;
  onClearFilters?: () => void;
  showClearFilters?: boolean;
  
  // Estilo
  minWidth?: string; // Ex: "min-w-[800px]"
  rowClassName?: string | ((row: T) => string);
  
  // Hover
  enableRowHover?: boolean;
}

// ========================================
// COMPONENTES AUXILIARES
// ========================================

const FilterInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input 
    {...props}
    className="w-full bg-white p-1.5 border border-gray-300 rounded-md text-xs text-gray-700 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export function BaseTable<T = any>({
  data,
  columns,
  isLoading = false,
  loadingMessage = 'Carregando...',
  emptyMessage = 'Nenhum registro encontrado',
  emptyIcon,
  error,
  pagination,
  filters = {},
  onFilterChange,
  onClearFilters,
  showClearFilters = true,
  minWidth = 'min-w-[800px]',
  rowClassName,
  enableRowHover = true,
}: BaseTableProps<T>) {
  
  // Calcular colspan para mensagens
  const colspan = columns.length;
  
  // Verificar se há filtros ativos
  const hasActiveFilters = Object.values(filters).some(value => value && value !== 'all');
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`w-full ${minWidth} text-sm`}>
          {/* CABEÇALHO */}
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`p-3 ${column.width || ''} text-${column.align || 'left'} font-semibold text-gray-600 whitespace-nowrap`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
            
            {/* LINHA DE FILTROS */}
            {onFilterChange && (
              <tr>
                {columns.map((column) => (
                  <td
                    key={`filter-${column.key}`}
                    className={`p-3 ${column.width || ''} border-t border-gray-200`}
                  >
                    {column.filterType === 'text' && (
                      <FilterInput
                        type="text"
                        value={filters[column.key] || ''}
                        onChange={(e) => onFilterChange(column.key, e.target.value)}
                        placeholder={column.filterPlaceholder || `Pesquisar...`}
                        disabled={isLoading}
                      />
                    )}
                    
                    {column.filterType === 'select' && column.filterOptions && (
                      <FilterSelect
                        value={filters[column.key] || 'all'}
                        onChange={(e) => onFilterChange(column.key, e.target.value)}
                        disabled={isLoading}
                      >
                        <option value="all">Todos</option>
                        {column.filterOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </FilterSelect>
                    )}
                    
                    {/* Botão Limpar Filtros na última coluna */}
                    {column.key === columns[columns.length - 1].key && 
                     showClearFilters && 
                     onClearFilters && 
                     hasActiveFilters && (
                      <button
                        onClick={onClearFilters}
                        className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                        disabled={isLoading}
                      >
                        Limpar Filtros
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            )}
          </thead>
          
          {/* CORPO DA TABELA */}
          <tbody>
            {/* ESTADO: Carregando */}
            {isLoading ? (
              <tr>
                <td colSpan={colspan} className="p-8 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    {loadingMessage}
                  </div>
                </td>
              </tr>
            ) : error ? (
              /* ESTADO: Erro */
              <tr>
                <td colSpan={colspan} className="p-8 text-center">
                  <div className="text-red-600">
                    <strong>Erro:</strong> {error}
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              /* ESTADO: Vazio */
              <tr>
                <td colSpan={colspan} className="p-8 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    {emptyIcon}
                    <p className="text-gray-600 font-medium">{emptyMessage}</p>
                    {hasActiveFilters && onClearFilters && (
                      <button
                        onClick={onClearFilters}
                        className="text-blue-600 hover:text-blue-800 underline text-sm font-medium"
                      >
                        Limpar filtros para ver todos os registros
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              /* ESTADO: Dados */
              data.map((row, rowIndex) => {
                const rowClass = typeof rowClassName === 'function' 
                  ? rowClassName(row) 
                  : rowClassName || '';
                
                const hoverClass = enableRowHover ? 'hover:bg-gray-50' : '';
                
                return (
                  <tr
                    key={rowIndex}
                    className={`border-t border-gray-200 ${hoverClass} ${rowClass} transition-colors`}
                  >
                    {columns.map((column) => (
                      <td
                        key={`${rowIndex}-${column.key}`}
                        className={`p-3 ${column.width || ''} text-${column.align || 'left'} whitespace-nowrap`}
                      >
                        {column.render 
                          ? column.render(row) 
                          : (row as any)[column.key]
                        }
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
          
          {/* RODAPÉ (opcional - para totais, etc) */}
          {!isLoading && !error && data.length > 0 && (
            <tfoot className="bg-gray-50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={`footer-${column.key}`}
                    className={`p-3 ${column.width || ''} text-${column.align || 'left'} font-semibold text-gray-600`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      
      {/* PAGINAÇÃO */}
      {pagination && pagination.totalPages > 1 && (
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Mostrando{' '}
            <span className="font-medium">
              {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1}
            </span>{' '}
            a{' '}
            <span className="font-medium">
              {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)}
            </span>{' '}
            de <span className="font-medium">{pagination.totalItems}</span> registros
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <span className="text-sm text-gray-700">
              Página <span className="font-medium">{pagination.currentPage}</span> de{' '}
              <span className="font-medium">{pagination.totalPages}</span>
            </span>
            
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.totalPages}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// EXPORTS
// ========================================

export default BaseTable;
