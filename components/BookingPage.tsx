

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, CheckCircle, Calendar, Users, Briefcase } from './Icons';
import { usePublicBooking, SalonData, PublicAgente, PublicServico, SlotDisponivel } from '../hooks/usePublicBooking';
import { getAssetUrl } from '../utils/api';

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
  const { salonData, isLoading, error, loadSalonData, findUnidadeBySlug, getAgenteDisponibilidade, createAgendamento } = usePublicBooking();

  const [unidadeId, setUnidadeId] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [availableSlots, setAvailableSlots] = useState<SlotDisponivel[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isCreatingAppointment, setIsCreatingAppointment] = useState(false);

  // Estados temporários para seleções
  const [tempSelectedAgentId, setTempSelectedAgentId] = useState<number | null>(null);
  const [tempSelectedServiceIds, setTempSelectedServiceIds] = useState<number[]>([]);
  const [tempSelectedTime, setTempSelectedTime] = useState<string | null>(null);

  // Efeito para carregar os dados do salão
  useEffect(() => {
    const loadData = async () => {
      if (isPreview) {
        // Para preview, usar unidade_id 4 (dados de teste)
        setUnidadeId(4);
        await loadSalonData(4);
        return;
      }

      // Extrair unidade_id da URL: /booking/:unidadeId ou /:slug/booking/:unidadeId
      const pathParts = window.location.pathname.split('/').filter(Boolean);

      if (pathParts.length >= 2 && pathParts[pathParts.length - 2] === 'booking') {
        // Formato: /booking/:unidadeId
        const id = parseInt(pathParts[pathParts.length - 1]);
        if (!isNaN(id)) {
          setUnidadeId(id);
          await loadSalonData(id);
          return;
        }
      }

      if (pathParts.length >= 3 && pathParts[pathParts.length - 2] === 'booking') {
        // Formato: /:slug/booking/:unidadeId
        const slug = pathParts[pathParts.length - 3];
        const id = parseInt(pathParts[pathParts.length - 1]);

        if (!isNaN(id)) {
          setUnidadeId(id);
          await loadSalonData(id);
          return;
        }

        // Se não conseguir extrair ID, tentar buscar por slug
        const unidadeData = await findUnidadeBySlug(slug);
        if (unidadeData) {
          setUnidadeId(unidadeData.unidade_id);
          await loadSalonData(unidadeData.unidade_id);
          return;
        }
      }

      console.error('[BookingPage] Não foi possível extrair unidade_id da URL:', window.location.pathname);
    };

    loadData();
  }, [isPreview, loadSalonData, findUnidadeBySlug]);

  // Efeito para pular para seleção de agente (não há múltiplas unidades na API pública)
  useEffect(() => {
    if (salonData && currentStep === 1) {
      setCurrentStep(2); // Pular direto para seleção de agente
    }
  }, [salonData, currentStep]);


  const resetToStep = (step: number) => {
    setCurrentStep(step);
    if (step <= 2) { setSelectedAgentId(null); setTempSelectedAgentId(null); }
    if (step <= 3) { setSelectedServiceIds([]); setTempSelectedServiceIds([]); }
    if (step <= 4) { setSelectedDate(new Date()); setSelectedTime(null); setTempSelectedTime(null); setAvailableSlots([]); }
    if (step <= 5) { setClientName(''); setClientPhone(''); }
  };

  const selectedAgent = useMemo(() => salonData?.agentes.find(a => a.id === selectedAgentId), [salonData, selectedAgentId]);
  const selectedServices = useMemo(() => salonData?.servicos.filter(s => selectedServiceIds.includes(s.id)) || [], [salonData, selectedServiceIds]);

  const availableAgents = useMemo(() => {
    if (!salonData) return [];
    return salonData.agentes;
  }, [salonData]);

  const availableServices = useMemo(() => {
    if (!salonData) return [];
    // Para simplificar, todos os serviços estão disponíveis para todos os agentes
    // Em uma implementação mais complexa, poderia haver relacionamento agente-serviço
    return salonData.servicos;
  }, [salonData]);

  const handleToggleService = (serviceId: number) => {
    setTempSelectedServiceIds(prev => {
      if (prev.includes(serviceId)) {
        return prev.filter(id => id !== serviceId);
      } else {
        return [...prev, serviceId];
      }
    });
  };

  // Carregar slots disponíveis quando agente e data forem selecionados
  const loadAvailableSlots = async (agenteId: number, date: Date) => {
    if (!agenteId || !date) return;

    setIsLoadingSlots(true);
    setAvailableSlots([]);

    try {
      const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const disponibilidade = await getAgenteDisponibilidade(agenteId, dateString);

      if (disponibilidade) {
        setAvailableSlots(disponibilidade.slots_disponiveis);
      } else {
        setAvailableSlots([]);
      }
    } catch (error) {
      console.error('[BookingPage] Erro ao carregar slots:', error);
      setAvailableSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // Efeito para carregar slots quando agente ou data mudarem
  useEffect(() => {
    if (selectedAgentId && selectedDate && currentStep === 4) {
      loadAvailableSlots(selectedAgentId, selectedDate);
    }
  }, [selectedAgentId, selectedDate, currentStep, getAgenteDisponibilidade]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-50"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div></div>;
  }

  if (error || !salonData) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-red-500 font-semibold p-4">{error || "Não foi possível carregar os dados do salão."}</div>;
  }

  // Render Steps

  const renderAgentSelection = () => (
     <div className="flex flex-col h-full">
      <StepHeader title="Escolha um profissional" />
      <div className="p-4 space-y-3 overflow-y-auto">
        {availableAgents.map(agent => (
          <SelectionCard
            key={agent.id}
            imageUrl={agent.avatar_url ? getAssetUrl(agent.avatar_url) : `https://avatar.iran.liara.run/public/boy?username=${agent.nome}`}
            title={agent.nome_exibicao || agent.nome}
            subtitle={agent.biografia}
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
            title={service.nome}
            subtitle={`${service.duracao_minutos} min - R$ ${service.preco.toFixed(2).replace('.', ',')}`}
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

          {/* Loading de slots */}
          {isLoadingSlots && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600">Carregando horários...</span>
            </div>
          )}

          {/* Slots disponíveis */}
          {!isLoadingSlots && availableSlots.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {availableSlots.map(slot => (
                <button
                  key={slot.hora_inicio}
                  onClick={() => setTempSelectedTime(slot.hora_inicio)}
                  disabled={!slot.disponivel}
                  className={`p-3 rounded-lg border-2 font-semibold text-center transition-colors ${
                    tempSelectedTime === slot.hora_inicio
                      ? 'bg-blue-600 text-white border-blue-600'
                      : slot.disponivel
                        ? 'bg-white border-gray-300 text-gray-800 hover:border-blue-500'
                        : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {slot.hora_inicio}
                </button>
              ))}
            </div>
          )}

          {/* Mensagem quando não há slots */}
          {!isLoadingSlots && availableSlots.length === 0 && selectedDate && (
            <div className="text-center py-8 text-gray-500">
              <p>Nenhum horário disponível para esta data.</p>
              <p className="text-sm mt-1">Tente selecionar outra data.</p>
            </div>
          )}
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
        <button onClick={handleCreateAppointment} disabled={!clientName || !clientPhone || isCreatingAppointment} className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400">
            {isCreatingAppointment ? 'Criando agendamento...' : 'Finalizar Agendamento'}
        </button>
      </div>
    </div>
  );

  // Função para criar o agendamento
  const handleCreateAppointment = async () => {
    if (!unidadeId || !selectedAgentId || !selectedServiceIds.length || !selectedDate || !selectedTime || !clientName || !clientPhone) {
      alert('Dados incompletos para criar o agendamento');
      return;
    }

    setIsCreatingAppointment(true);

    try {
      const agendamentoData = {
        unidade_id: unidadeId,
        agente_id: selectedAgentId,
        servico_ids: selectedServiceIds,
        data_agendamento: selectedDate.toISOString().split('T')[0], // YYYY-MM-DD
        hora_inicio: selectedTime,
        cliente_nome: clientName.trim(),
        cliente_telefone: clientPhone.trim(),
        observacoes: ''
      };

      console.log('[BookingPage] Criando agendamento:', agendamentoData);

      const agendamentoCriado = await createAgendamento(agendamentoData);

      if (agendamentoCriado) {
        console.log('[BookingPage] Agendamento criado com sucesso:', agendamentoCriado.agendamento_id);
        setCurrentStep(6); // Ir para tela de sucesso
      }

    } catch (error) {
      console.error('[BookingPage] Erro ao criar agendamento:', error);
      alert(`Erro ao criar agendamento: ${error.message}`);
    } finally {
      setIsCreatingAppointment(false);
    }
  };

  const renderConfirmation = () => {
    const totalPrice = useMemo(() => selectedServices.reduce((total, s) => total + s.preco, 0), [selectedServices]);
    const totalDuration = useMemo(() => selectedServices.reduce((total, s) => total + s.duracao_minutos, 0), [selectedServices]);

    return (
     <div className="flex flex-col h-full">
      <StepHeader title="Resumo do Agendamento" onBack={() => resetToStep(4)} />
       <div className="p-6 space-y-4 text-gray-700 overflow-y-auto">
          <div className="py-2 border-b border-gray-200">
            <span className="font-semibold flex items-center gap-2 mb-2"><Briefcase className="w-4 h-4 text-gray-400" /> Serviços</span>
            <ul className="list-disc list-inside pl-2 space-y-1">
              {selectedServices.map(service => (
                <li key={service.id} className="flex justify-between">
                  <span>{service.nome}</span>
                  <span>R$ {service.preco.toFixed(2).replace('.', ',')}</span>
                </li>
              ))}
            </ul>
          </div>
         <div className="flex justify-between items-center py-2 border-b border-gray-200">
           <span className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" /> Profissional</span>
           <span>{selectedAgent?.nome_exibicao || selectedAgent?.nome}</span>
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
           <span className="font-bold text-lg text-blue-600">R$ {totalPrice.toFixed(2).replace('.', ',')}</span>
         </div>
       </div>
       <div className="p-4 mt-auto border-t border-gray-200 bg-white">
        <button onClick={handleCreateAppointment} disabled={isCreatingAppointment} className="w-full bg-green-600 text-white font-bold py-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400">
            {isCreatingAppointment ? 'Confirmando...' : 'Confirmar Agendamento'}
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
      case 2: return renderAgentSelection();
      case 3: return renderServiceSelection();
      case 4: return renderDateTimeSelection();
      case 5: return renderClientDetails();
      case 6: return renderSuccess();
      default: return renderAgentSelection();
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
            <img
              src={salonData.configuracoes.logo_url ? getAssetUrl(salonData.configuracoes.logo_url) : `https://avatar.iran.liara.run/public/boy?username=${salonData.configuracoes.nome_negocio}`}
              alt={salonData.configuracoes.nome_negocio}
              className="w-16 h-16 rounded-full mx-auto mb-2 object-cover"
            />
            <h1 className="text-xl font-bold text-gray-900">{salonData.configuracoes.nome_negocio}</h1>
            {salonData.unidade.endereco && (
              <p className="text-sm text-gray-600 mt-1">{salonData.unidade.endereco}</p>
            )}
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