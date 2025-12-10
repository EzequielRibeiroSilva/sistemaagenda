import React, { ReactNode } from 'react';
import { Edit, X } from './Icons';

/**
 * BaseCard - Componente de card padronizado e minimalista
 * 
 * Design System:
 * - Cor principal: #2663EB
 * - Estilo minimalista com bordas sutis
 * - Botões discretos que aparecem no hover
 * - Estrutura flexível para diferentes tipos de conteúdo
 * 
 * Uso: SERVIÇOS, SERVIÇOS EXTRAS, AGENTES, LOCAIS
 */

interface BaseCardProps {
  /** Título principal do card */
  title: string;
  
  /** Conteúdo principal do card (informações, avatares, etc) */
  children: ReactNode;
  
  /** Callback ao clicar em editar */
  onEdit: () => void;
  
  /** Callback ao clicar em excluir */
  onDelete: () => void;
  
  /** Se está em modo de confirmação de exclusão */
  isConfirmingDelete?: boolean;
  
  /** Label customizado do botão editar (padrão: "Editar") */
  editLabel?: string;
  
  /** Conteúdo opcional no topo do card (ex: ícone, imagem, avatar) */
  headerContent?: ReactNode;
  
  /** Se deve mostrar a barra azul no topo */
  showTopBar?: boolean;
}

export const BaseCard: React.FC<BaseCardProps> = ({
  title,
  children,
  onEdit,
  onDelete,
  isConfirmingDelete = false,
  editLabel = 'Editar',
  headerContent,
  showTopBar = false
}) => {
  return (
    <div className="group bg-white rounded-lg border border-gray-200 hover:border-[#2663EB] transition-all duration-200 hover:shadow-md flex flex-col overflow-hidden">
      {/* Barra superior azul (opcional) */}
      {showTopBar && (
        <div className="h-1 bg-[#2663EB]"></div>
      )}

      {/* Conteúdo do card */}
      <div className="p-4 flex-grow">
        {/* Header com título e botões de ação */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            {/* Conteúdo customizado do header (ex: avatar, ícone) */}
            {headerContent && (
              <div className="mb-3">
                {headerContent}
              </div>
            )}
            
            {/* Título */}
            <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
              {title}
            </h3>
          </div>

          {/* Botões de ação - aparecem no hover */}
          <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-3">
            {/* Botão Excluir */}
            <button
              onClick={onDelete}
              className={`p-1.5 rounded-md transition-all duration-200 ${
                isConfirmingDelete
                  ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse shadow-md'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              }`}
              title={isConfirmingDelete ? 'Clique novamente para confirmar' : 'Excluir'}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Botão Editar */}
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-gray-400 hover:text-[#2663EB] hover:bg-blue-50 transition-all duration-200"
              title="Editar"
            >
              <Edit className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Divisor sutil */}
        <div className="border-t border-gray-100 mb-3"></div>

        {/* Conteúdo customizado do card */}
        <div className="space-y-2">
          {children}
        </div>
      </div>

      {/* Footer com botão de ação principal */}
      <div className="p-3 bg-gray-50 border-t border-gray-100">
        <button
          onClick={onEdit}
          className="w-full flex items-center justify-center text-gray-600 hover:text-[#2663EB] font-medium py-2 px-4 rounded-md text-sm transition-colors duration-200 hover:bg-white"
        >
          <Edit className="w-4 h-4 mr-2" />
          {editLabel}
        </button>
      </div>
    </div>
  );
};

/**
 * AddCard - Card para adicionar novos itens
 */
interface AddCardProps {
  onClick: () => void;
  label: string;
  sublabel?: string;
}

export const AddCard: React.FC<AddCardProps> = ({ onClick, label, sublabel }) => {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border-2 border-dashed border-gray-300 hover:border-[#2663EB] flex flex-col items-center justify-center p-6 min-h-[280px] text-center cursor-pointer transition-all duration-200 group hover:bg-blue-50/30"
    >
      <div className="w-12 h-12 bg-[#2663EB] rounded-full flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110 shadow-md">
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <p className="font-semibold text-[#2663EB] text-base">{label}</p>
      {sublabel && (
        <p className="text-sm text-gray-500 mt-1">{sublabel}</p>
      )}
    </div>
  );
};

/**
 * CardInfoRow - Componente auxiliar para linhas de informação
 */
interface CardInfoRowProps {
  label: string;
  value: string | ReactNode;
  valueClassName?: string;
}

export const CardInfoRow: React.FC<CardInfoRowProps> = ({ label, value, valueClassName = '' }) => {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium text-gray-700 ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
};

/**
 * CardAvatarGroup - Componente para exibir grupo de avatares
 */
interface CardAvatarGroupProps {
  avatars: Array<{ id: number; url: string; alt: string }>;
  maxVisible?: number;
  label?: string;
}

export const CardAvatarGroup: React.FC<CardAvatarGroupProps> = ({ 
  avatars, 
  maxVisible = 3,
  label = 'Agentes'
}) => {
  const visibleAvatars = avatars.slice(0, maxVisible);
  const remainingCount = avatars.length - maxVisible;

  return (
    <div className="flex items-center space-x-2">
      {label && <span className="text-sm text-gray-500">{label}:</span>}
      {avatars.length > 0 ? (
        <>
          <div className="flex -space-x-2">
            {visibleAvatars.map((avatar) => (
              <img
                key={avatar.id}
                src={avatar.url}
                alt={avatar.alt}
                className="w-7 h-7 rounded-full border-2 border-white object-cover shadow-sm"
              />
            ))}
          </div>
          {remainingCount > 0 && (
            <span className="text-xs bg-gray-100 px-2 py-1 rounded-full font-medium text-gray-600">
              +{remainingCount}
            </span>
          )}
        </>
      ) : (
        <span className="text-xs text-gray-400">Nenhum agente</span>
      )}
    </div>
  );
};

/**
 * CardStatusBadge - Badge de status padronizado
 */
interface CardStatusBadgeProps {
  status: 'Ativo' | 'Inativo' | 'Bloqueado' | string;
  activeLabel?: string;
  inactiveLabel?: string;
}

export const CardStatusBadge: React.FC<CardStatusBadgeProps> = ({ 
  status, 
  activeLabel = 'Disponível',
  inactiveLabel = 'Indisponível'
}) => {
  const isActive = status === 'Ativo';
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isActive 
        ? 'bg-green-50 text-green-700' 
        : 'bg-red-50 text-red-700'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
        isActive ? 'bg-green-500' : 'bg-red-500'
      }`}></span>
      {isActive ? activeLabel : inactiveLabel}
    </span>
  );
};
