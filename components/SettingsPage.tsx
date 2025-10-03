import React, { useState } from 'react';
import SettingsGeneral from './SettingsGeneral';
import SettingsScheduling from './SettingsScheduling';
import SettingsNotifications from './SettingsNotifications';

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Geral');
  const tabs = ['Geral', 'Programação', 'Passos', 'Notificações'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center border-b border-gray-200">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-1 py-4 text-lg font-semibold mr-8 transition-colors duration-200 relative ${
                activeTab === tab 
                ? 'text-blue-600' 
                : 'text-gray-500 hover:text-gray-800'
              }`}
              aria-current={activeTab === tab ? 'page' : undefined}
            >
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"></div>}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === 'Geral' && <SettingsGeneral />}
        {activeTab === 'Programação' && <SettingsScheduling />}
        {activeTab === 'Notificações' && <SettingsNotifications />}
        {activeTab === 'Passos' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <h2 className="text-xl font-bold text-gray-700">Conteúdo para "Passos"</h2>
                <p className="mt-2 text-gray-500">Esta seção está em desenvolvimento e estará disponível em breve.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
