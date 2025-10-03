import React from 'react';

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
    <h2 className="text-xl font-bold text-gray-800 mb-6">{title}</h2>
    {children}
  </div>
);


const SettingsNotifications: React.FC = () => {
    return (
        <div className="space-y-6">
            <Card title="Configurações de Notificação">
                <div className="space-y-4">
                    <p className="text-gray-600">As notificações de agendamento são enviadas automaticamente via WhatsApp para garantir que seus clientes nunca percam um compromisso.</p>
                    <div className="flex items-center space-x-2 py-2">
                        <p className="font-medium text-gray-800">Status da API do WhatsApp:</p>
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Conectado</span>
                    </div>
                    <div className="pt-2">
                         <button className="bg-white text-gray-700 border border-gray-300 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                            Enviar Teste de Notificação
                        </button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default SettingsNotifications;
