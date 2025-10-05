import React, { useState, useEffect, useMemo } from 'react';
import type { Client } from '../types';

// Copied from ClientsPage.tsx for demonstration
const mockClients: Client[] = [
    { id: 511, name: 'Charles Gesso', phone: '+558899200566', email: 'tzacharles78@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 51, socialAlert: false },
    { id: 510, name: 'Matheus Silva', phone: '+558598921014', email: 'm4k.u..1a@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 51, socialAlert: false },
    { id: 509, name: 'Marcos Vendramel', phone: '+555198108108', email: 'marcos.vendramel87@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 508, name: 'Caio Felipe', phone: '+5585988923803', email: 'caiofe95@gmail.com', totalApps: 2, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 507, name: 'Eduardo Oliveira', phone: '+558598108108', email: 'eduardoknhling1@gmail.com', socialAlert: true, totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50 },
    { id: 506, name: 'Paulo Eduardo', phone: '+5585981995843', email: 'eduardopinheirosousa09@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 505, name: 'Aldeides Mendes', phone: '+5585921499830', email: 'aldeizmendz80@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 504, name: 'Macon Vitor', phone: '+5585982777701', email: 'maiconvitor76@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 503, name: 'Paulo Ricardo', phone: '+5585981618330', email: 'pauloalvessiq@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 502, name: 'Joao Victor Soares Mesquita', phone: '+5585987725191', email: 'liviaferreirasm@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 501, name: 'Aldeides Mendes', phone: '+5585986445248', email: 'aldeizmendz45@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50, socialAlert: false },
    { id: 500, name: 'Erik Oliveira', phone: '+5585991571524', email: 'erikoliveira2999@gmail.com', socialAlert: true, totalApps: 2, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 50 },
    { id: 499, name: 'Caio Felipe', phone: '+5585988238036', email: 'caiofelipevieiradasilva@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 498, name: 'Michael Aquino', phone: '+5585981772516', email: 'michelmotoristadf@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 497, name: 'Erik Leonardo', phone: '+5585988678447', email: 'erikleo929@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 496, name: 'Mateus Leal', phone: '+5585985863174', email: 'lealmateux48@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 495, name: 'Aldeides Mendes', phone: '+5585921499830', email: 'aldeizmendz35@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 494, name: 'Guilherme Soares', phone: '+5585981890822', email: 'euguilhermedesign@gmail.com', socialAlert: true, totalApps: 0, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46 },
    { id: 493, name: 'Sival Filho', phone: '', email: 'sivalfilho@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
    { id: 492, name: '', phone: '', email: 'gabriel2005paixaomota@gmail.com', totalApps: 1, nextAppStatus: 'n/a', timeToNext: 'Passado', wpId: 46, socialAlert: false },
];

interface EditClientPageProps {
  clientId: number | null;
  setActiveView: (view: string) => void;
}

const EditClientPage: React.FC<EditClientPageProps> = ({ clientId, setActiveView }) => {
  const clientToEdit = useMemo(() => mockClients.find(c => c.id === clientId), [clientId]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [subscriptionStartDate, setSubscriptionStartDate] = useState('');

  useEffect(() => {
    if (clientToEdit) {
      const nameParts = clientToEdit.name.split(' ');
      setFirstName(nameParts[0] || '');
      setLastName(nameParts.slice(1).join(' '));
      setPhone(clientToEdit.phone.replace('+55', ''));
      const isSub = !!clientToEdit.socialAlert;
      setIsSubscriber(isSub);
      if (isSub) {
        // In a real app, this date would come from the client data.
        // For this mock, we default to today's date if they are a subscriber.
        setSubscriptionStartDate(new Date().toISOString().split('T')[0]);
      } else {
        setSubscriptionStartDate('');
      }
    }
  }, [clientToEdit]);

  const handleSubscriberToggle = () => {
    const newIsSubscriber = !isSubscriber;
    setIsSubscriber(newIsSubscriber);
    if (newIsSubscriber) {
      setSubscriptionStartDate(new Date().toISOString().split('T')[0]);
    } else {
      setSubscriptionStartDate('');
    }
  };

  if (!clientToEdit) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-xl font-semibold text-gray-700">Cliente não encontrado.</h2>
        <button onClick={() => setActiveView('clients-list')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Voltar para a lista de clientes
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Editar Cliente</h1>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-700 mb-8">Informações Gerais</h2>
        
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div>
                    <label className="text-sm font-medium text-gray-600 mb-2 block">Primeiro Nome</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                
                <div>
                    <label className="text-sm font-medium text-gray-600 mb-2 block">Último Nome</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
                </div>

                <div>
                    <label className="text-sm font-medium text-gray-600 mb-2 block">Telefone (WhatsApp)</label>
                    <div className="relative">
                        <div className="flex items-center w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                            <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                            <span className="text-gray-600 pr-2">+55</span>
                            <input type="tel" placeholder="(00) 90000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400" />
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
                            onClick={handleSubscriberToggle}
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

                {isSubscriber && (
                    <div className="md:col-span-2">
                        <label className="text-sm font-medium text-gray-600 mb-2 block">Data de Início da Assinatura</label>
                        <input 
                            type="date" 
                            value={subscriptionStartDate}
                            onChange={(e) => setSubscriptionStartDate(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" 
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Esta data será usada para calcular o período da assinatura e enviar notificações.
                        </p>
                    </div>
                )}

            </div>
        </div>
      </div>
      
      <div className="mt-6 flex items-center gap-4">
        <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            Salvar Alterações
        </button>
        <button onClick={() => setActiveView('clients-list')} className="bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors">
            Cancelar
        </button>
      </div>
    </div>
  );
};

export default EditClientPage;