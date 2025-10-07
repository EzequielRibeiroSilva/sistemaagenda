

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, CheckCircle, Calendar, Users, Briefcase } from './Icons';

// --- Tipos e Dados Mockados para a Página de Agendamento ---

interface BookingLocation {
  id: string;
  name: string;
}

interface BookingAgent {
  id: string;
  name:string;
  avatar: string;
  locationIds: string[];
  serviceIds: string[];
}

interface BookingService {
  id: string;
  name: string;
  duration: number; // in minutes
  price: number;
}

interface SalonPublicData {
  name: string;
  logo: string;
  locations: BookingLocation[];
  agents: BookingAgent[];
  services: BookingService[];
}

const mockSalonData: SalonPublicData = {
  name: "Salão do Eduardo",
  logo: "https://picsum.photos/id/1027/200/200",
  locations: [
    { id: 'loc1', name: 'Unidade Centro' },
    // { id: 'loc2', name: 'Unidade Praia Shopping' }, // Temporarily comment out to test single location
  ],
  agents: [
    { id: '1', name: 'Eduardo Soares', avatar: 'https://picsum.photos/id/1005/100/100', locationIds: ['loc1', 'loc2'], serviceIds: ['s1', 's2', 's3'] },
    { id: '2', name: 'Ângelo Paixão', avatar: 'https://picsum.photos/id/1011/100/100', locationIds: ['loc1'], serviceIds: ['s1', 's3'] },
    { id: '3', name: 'Snake Filho', avatar: 'https://picsum.photos/id/1012/100/100', locationIds: ['loc2'], serviceIds: ['s1', 's2'] },
  ],
  services: [
    { id: 's1', name: 'Corte de Cabelo', duration: 45, price: 50 },
    { id: 's2', name: 'Corte + Barba', duration: 75, price: 80 },
    { id: 's3', name: 'Barba', duration: 30, price: 35 },
  ]
};

// --- Componentes da UI ---

const StepHeader: React.FC<{ title: string; onBack?: () => void }> = ({ title, onBack }) => (
  <div className="relative text-center p-4 border-b border-gray-200 shrink-0 bg-white">
    {onBack && (
      <button onClick={onBack} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-gray-100">
        <ChevronLeft className="w-6 h-6 text-gray-600" />
      </button>
    )}
    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
  </div>
);

const SelectionCard: React.FC<{
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

interface BookingPageProps {
  isPreview?: boolean;
  onExitPreview?: () => void;
}

const BookingPage: React.FC<BookingPageProps> = ({ isPreview = false, onExitPreview }) => {
  const [salonId, setSalonId] = useState<string | null>(null);
  const [salonData, setSalonData] = useState<SalonPublicData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // Estados temporários para seleções
  const [tempSelectedAgentId, setTempSelectedAgentId] = useState<string | null>(null);
  const [tempSelectedServiceIds, setTempSelectedServiceIds] = useState<string[]>([]);
  const [tempSelectedTime, setTempSelectedTime] = useState<string | null>(null);

  // Efeito para carregar os dados do salão
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('salao');
    if (id || isPreview) {
      setSalonId(id || '123'); // Use preview ID if no query param
      // Simula uma chamada de API
      setTimeout(() => {
        setSalonData(mockSalonData);
        setIsLoading(false);
      }, 500);
    } else {
      setError("ID do salão não encontrado na URL.");
      setIsLoading(false);
    }
  }, [isPreview]);

  // Efeito para gerenciar o fluxo de etapas (ex: pular seleção de local se houver apenas um)
  useEffect(() => {
    if (salonData && currentStep === 1 && salonData.locations.length === 1) {
      setSelectedLocationId(salonData.locations[0].id);
      setCurrentStep(2);
    }
  }, [salonData, currentStep]);


  const resetToStep = (step: number) => {
    setCurrentStep(step);
    if (step <= 1) setSelectedLocationId(null);
    if (step <= 2) { setSelectedAgentId(null); setTempSelectedAgentId(null); }
    if (step <= 3) { setSelectedServiceIds([]); setTempSelectedServiceIds([]); }
    if (step <= 4) { setSelectedDate(new Date()); setSelectedTime(null); setTempSelectedTime(null); }
    if (step <= 5) { setClientName(''); setClientPhone(''); }
  };

  const selectedLocation = useMemo(() => salonData?.locations.find(l => l.id === selectedLocationId), [salonData, selectedLocationId]);
  const selectedAgent = useMemo(() => salonData?.agents.find(a => a.id === selectedAgentId), [salonData, selectedAgentId]);
  const selectedServices = useMemo(() => salonData?.services.filter(s => selectedServiceIds.includes(s.id)) || [], [salonData, selectedServiceIds]);


  const availableAgents = useMemo(() => {
    if (!salonData || !selectedLocationId) return [];
    return salonData.agents.filter(agent => agent.locationIds.includes(selectedLocationId));
  }, [salonData, selectedLocationId]);
  
  const availableServices = useMemo(() => {
    if (!salonData || !selectedAgentId) return [];
    const agent = salonData.agents.find(a => a.id === selectedAgentId);
    if (!agent && selectedAgentId !== 'any') return [];
    
    if (selectedAgentId === 'any') {
        // Se 'Qualquer Profissional' for selecionado, mostre todos os serviços disponíveis no local
        const agentIdsInLocation = salonData.agents
            .filter(a => a.locationIds.includes(selectedLocationId!))
            .map(a => a.id);

        const serviceIds = new Set<string>();
        salonData.agents
            .filter(a => agentIdsInLocation.includes(a.id))
            .forEach(a => a.serviceIds.forEach(sid => serviceIds.add(sid)));
            
        return salonData.services.filter(s => serviceIds.has(s.id));
    }

    if (!agent) return [];
    return salonData.services.filter(service => agent.serviceIds.includes(service.id));
  }, [salonData, selectedAgentId, selectedLocationId]);

  const handleToggleService = (serviceId: string) => {
    setTempSelectedServiceIds(prev => {
      if (prev.includes(serviceId)) {
        return prev.filter(id => id !== serviceId);
      } else {
        return [...prev, serviceId];
      }
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-50"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div></div>;
  }

  if (error || !salonData) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-red-500 font-semibold p-4">{error || "Não foi possível carregar os dados do salão."}</div>;
  }

  // Render Steps
  const renderLocationSelection = () => (
    <div className="flex flex-col h-full">
      <StepHeader title="Escolha uma unidade" />
      <div className="p-4 space-y-3 overflow-y-auto">
        {salonData.locations.map(location => (
          <SelectionCard
            key={location.id}
            title={location.name}
            onClick={() => {
              setSelectedLocationId(location.id);
              setCurrentStep(2);
            }}
            isSelected={selectedLocationId === location.id}
          />
        ))}
      </div>
    </div>
  );

  const renderAgentSelection = () => (
     <div className="flex flex-col h-full">
      <StepHeader title="Escolha um profissional" onBack={salonData.locations.length > 1 ? () => resetToStep(1) : undefined} />
      <div className="p-4 space-y-3 overflow-y-auto">
        <SelectionCard
          key="any"
          imageUrl="https://avatar.iran.liara.run/public/boy?username=any"
          title="Qualquer Profissional"
          onClick={() => setTempSelectedAgentId('any')}
          isSelected={tempSelectedAgentId === 'any'}
        />
        {availableAgents.map(agent => (
          <SelectionCard
            key={agent.id}
            imageUrl={agent.avatar}
            title={agent.name}
            onClick={() => setTempSelectedAgentId(agent.id)}
            isSelected={tempSelectedAgentId === agent.id}
          />
        ))}
      </div>
      <div className="p-4 mt-auto shrink-0 border-t border-gray-200 bg-white">
        <button 
          onClick={() => {
            setSelectedAgentId(tempSelectedAgentId);
            setCurrentStep(3);
          }} 
          disabled={!tempSelectedAgentId} 
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
        >
            Próximo
        </button>
      </div>
    </div>
  );
  
  const renderServiceSelection = () => (
    <div className="flex flex-col h-full">
      <StepHeader title="Escolha um ou mais serviços" onBack={() => resetToStep(2)} />
      <div className="p-4 space-y-3 overflow-y-auto">
        {availableServices.map(service => (
          <SelectionCard
            key={service.id}
            title={service.name}
            subtitle={`${service.duration} min - R$ ${service.price},00`}
            onClick={() => handleToggleService(service.id)}
            isSelected={tempSelectedServiceIds.includes(service.id)}
          />
        ))}
      </div>
      <div className="p-4 mt-auto shrink-0 border-t border-gray-200 bg-white">
        <button 
          onClick={() => {
            setSelectedServiceIds(tempSelectedServiceIds);
            setCurrentStep(4);
          }} 
          disabled={tempSelectedServiceIds.length === 0} 
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
        >
            Próximo
        </button>
      </div>
    </div>
  );

  const renderDateTimeSelection = () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d;
    });
    
    const timeSlots = ["09:00", "09:45", "10:30", "11:15", "14:00", "14:45", "15:30", "16:15", "17:00"];

    return (
      <div className="flex flex-col h-full">
        <StepHeader title="Escolha data e hora" onBack={() => resetToStep(3)} />
        <div className="p-4 overflow-y-auto">
          <div className="overflow-x-auto whitespace-nowrap scrollbar-hide pb-3 mb-4">
            {days.map(day => (
              <button 
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`inline-block text-center px-4 py-2 rounded-lg mr-2 border transition-colors ${selectedDate?.toDateString() === day.toDateString() ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-700'}`}
              >
                <p className="text-xs">{day.toLocaleDateString('pt-BR', { weekday: 'short' })}</p>
                <p className="font-bold text-lg">{day.getDate()}</p>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {timeSlots.map(time => (
              <button
                key={time}
                onClick={() => setTempSelectedTime(time)}
                className={`p-3 rounded-lg border-2 font-semibold text-center transition-colors ${tempSelectedTime === time ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-800 hover:border-blue-500'}`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 mt-auto shrink-0 border-t border-gray-200 bg-white">
            <button 
              onClick={() => {
                setSelectedTime(tempSelectedTime);
                setCurrentStep(5);
              }} 
              disabled={!tempSelectedTime} 
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
                Próximo
            </button>
        </div>
      </div>
    );
  };
  
  const renderClientDetails = () => (
    <div className="flex flex-col h-full">
      <StepHeader title="Seus dados" onBack={() => resetToStep(4)} />
      <div className="p-4 space-y-4 overflow-y-auto">
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Nome Completo</label>
          <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Telefone (WhatsApp)</label>
          <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(00) 90000-0000" className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500" />
          <p className="text-xs text-gray-500 mt-1">Você receberá a confirmação do agendamento neste número.</p>
        </div>
      </div>
       <div className="p-4 mt-auto border-t border-gray-200 bg-white">
        <button onClick={() => setCurrentStep(6)} disabled={!clientName || !clientPhone} className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400">
            Finalizar Agendamento
        </button>
      </div>
    </div>
  );

  const renderConfirmation = () => {
    const totalPrice = useMemo(() => selectedServices.reduce((total, s) => total + s.price, 0), [selectedServices]);
    const totalDuration = useMemo(() => selectedServices.reduce((total, s) => total + s.duration, 0), [selectedServices]);

    return (
     <div className="flex flex-col h-full">
      <StepHeader title="Resumo do Agendamento" onBack={() => resetToStep(5)} />
       <div className="p-6 space-y-4 text-gray-700 overflow-y-auto">
          <div className="py-2 border-b border-gray-200">
            <span className="font-semibold flex items-center gap-2 mb-2"><Briefcase className="w-4 h-4 text-gray-400" /> Serviços</span>
            <ul className="list-disc list-inside pl-2 space-y-1">
              {selectedServices.map(service => (
                <li key={service.id} className="flex justify-between">
                  <span>{service.name}</span>
                  <span>R$ {service.price},00</span>
                </li>
              ))}
            </ul>
          </div>
         <div className="flex justify-between items-center py-2 border-b border-gray-200">
           <span className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" /> Profissional</span>
           <span>{selectedAgent?.name || 'Qualquer um'}</span>
         </div>
         <div className="flex justify-between items-center py-2 border-b border-gray-200">
           <span className="font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> Data e Hora</span>
           <span className="text-right">{selectedDate?.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}, {selectedTime}</span>
         </div>
         <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="font-semibold">Duração Total</span>
            <span className="font-semibold">{totalDuration} min</span>
          </div>
         <div className="flex justify-between items-center pt-4">
           <span className="font-bold text-lg">Valor Total</span>
           <span className="font-bold text-lg text-blue-600">R$ {totalPrice},00</span>
         </div>
       </div>
       <div className="p-4 mt-auto border-t border-gray-200 bg-white">
        <button onClick={() => setCurrentStep(7)} className="w-full bg-green-600 text-white font-bold py-4 rounded-lg hover:bg-green-700 transition-colors">
            Confirmar Agendamento
        </button>
      </div>
    </div>
    );
  };

  const renderSuccess = () => (
    <div className="p-8 flex flex-col items-center justify-center text-center h-full">
        <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">Agendamento Confirmado!</h2>
        <p className="text-gray-600 mt-2">
            Obrigado, {clientName}.<br />
            Enviamos a confirmação e os detalhes do seu agendamento para o seu WhatsApp.
        </p>
        <button onClick={() => resetToStep(1)} className="mt-8 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors">
            Fazer Novo Agendamento
        </button>
    </div>
  );


  const renderStep = () => {
    switch(currentStep) {
      case 1: return salonData.locations.length > 1 ? renderLocationSelection() : null; // A tela branca acontece aqui
      case 2: return renderAgentSelection();
      case 3: return renderServiceSelection();
      case 4: return renderDateTimeSelection();
      case 5: return renderClientDetails();
      case 6: return renderConfirmation();
      case 7: return renderSuccess();
      default: return salonData.locations.length > 1 ? renderLocationSelection() : renderAgentSelection();
    }
  }

  const mainContainerClass = isPreview 
    ? "w-full max-w-none bg-gray-50 flex flex-col flex-1 h-full overflow-hidden"
    : "min-h-screen bg-gray-100 flex flex-col items-center";
  
  const contentWrapperClass = isPreview 
    ? "h-full flex flex-col" 
    : "w-full max-w-md bg-gray-50 flex flex-col flex-1 shadow-lg";

  return (
    <div className={mainContainerClass}>
      <div className={contentWrapperClass}>
        <div className="sticky top-0 z-20 shrink-0">
          {isPreview && (
            <div className="p-3 bg-yellow-100 border-b-2 border-yellow-300 text-center">
              <div className='flex justify-center items-center'>
                  <p className="text-xs text-yellow-800 mr-4">Você está no modo de pré-visualização.</p>
                  <button
                      onClick={onExitPreview}
                      className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                  >
                      Sair da Visualização
                  </button>
              </div>
            </div>
          )}
          <header className="p-4 text-center bg-white border-b border-gray-200">
            <img src={salonData.logo} alt={salonData.name} className="w-16 h-16 rounded-full mx-auto mb-2"/>
            <h1 className="text-xl font-bold text-gray-900">{salonData.name}</h1>
          </header>
        </div>

        <main className="flex-1 flex flex-col overflow-y-hidden">
          {renderStep()}
        </main>
      </div>
    </div>
  );
};

export default BookingPage;