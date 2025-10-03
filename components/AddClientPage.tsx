import React, { useState } from 'react';

const AddClientPage: React.FC = () => {
  const [isSubscriber, setIsSubscriber] = useState(false);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Novo Cliente</h1>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-700 mb-8">Informações Gerais</h2>
        
        <div className="space-y-6">
            
            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div>
                    <label className="text-sm font-medium text-gray-600 mb-2 block">Primeiro Nome</label>
                    <input type="text" className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                
                <div>
                    <label className="text-sm font-medium text-gray-600 mb-2 block">Último Nome</label>
                    <input type="text" className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
                </div>

                <div>
                    <label className="text-sm font-medium text-gray-600 mb-2 block">Telefone (WhatsApp)</label>
                    <div className="relative">
                        <div className="flex items-center w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                            <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                            <span className="text-gray-600 pr-2">+55</span>
                            <input type="tel" placeholder="(00) 90000-0000" className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Este número será usado para notificações e contato via WhatsApp.
                    </p>
                </div>

                <div>
                    <label className="text-sm font-medium text-gray-600 mb-2 block">Assinante</label>
                    <div className="flex items-center space-x-4">
                        <button
                            type="button"
                            className={`${isSubscriber ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
                            role="switch"
                            aria-checked={isSubscriber}
                            onClick={() => setIsSubscriber(!isSubscriber)}
                        >
                            <span
                                aria-hidden="true"
                                className={`${isSubscriber ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                            />
                        </button>
                        <span className={`font-semibold ${isSubscriber ? 'text-green-700 bg-green-100 px-2.5 py-1 rounded-full text-xs' : 'text-red-700 bg-red-100 px-2.5 py-1 rounded-full text-xs'}`}>
                            {isSubscriber ? 'Assinante' : 'Não Assinante'}
                        </span>
                    </div>
                </div>

            </div>
        </div>
      </div>
      
      <div className="mt-6">
        <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            Salvar Cliente
        </button>
      </div>
    </div>
  );
};

export default AddClientPage;