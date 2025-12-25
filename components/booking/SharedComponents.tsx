import React from 'react';
import { ChevronLeft } from '../Icons';

// --- Componentes Compartilhados para BookingPage e ManageBookingPage ---

export const StepHeader: React.FC<{ title: string; onBack?: () => void }> = ({ title, onBack }) => (
  <div className="relative text-center p-4 border-b border-gray-200 shrink-0 bg-white">
    {onBack && (
      <button onClick={onBack} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-gray-100">
        <ChevronLeft className="w-6 h-6 text-gray-600" />
      </button>
    )}
    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
  </div>
);

export const SelectionCard: React.FC<{
  imageUrl?: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
  isSelected: boolean;
}> = ({ imageUrl, title, subtitle, onClick, isSelected }) => (
  <button onClick={onClick} className={`w-full flex items-center p-4 bg-white rounded-lg border-2 transition-all text-left ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400'}`}>
    {imageUrl && <img src={imageUrl} alt={title} className="w-12 h-12 rounded-full object-cover mr-4" />}
    <div>
      <p className="font-bold text-gray-800">{title}</p>
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
    </div>
  </button>
);

export const ActionButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  variant?: 'primary' | 'danger';
}> = ({ icon, title, description, onClick, variant = 'primary' }) => {
  const colorClasses = variant === 'danger' 
    ? 'border-red-200 hover:border-red-400 hover:bg-red-50' 
    : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center p-4 bg-white rounded-lg border-2 transition-all text-left ${colorClasses}`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${variant === 'danger' ? 'bg-red-100' : 'bg-blue-100'}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className={`font-bold ${variant === 'danger' ? 'text-red-700' : 'text-gray-800'}`}>{title}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
    </button>
  );
};

export const InfoCard: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-4">
    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">{title}</h3>
    {children}
  </div>
);

export const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Carregando...' }) => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50" style={{ minHeight: '100dvh' }}>
    <div className="text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
      <p className="text-gray-600">{message}</p>
    </div>
  </div>
);

export const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50 text-red-500 font-semibold p-4" style={{ minHeight: '100dvh' }}>
    {message}
  </div>
);
