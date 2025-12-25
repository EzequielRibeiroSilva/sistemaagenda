

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, CheckCircle, Calendar, Users, Briefcase, Tag, X } from './Icons';
import { usePublicBooking, SalonData, PublicAgente, PublicServico, PublicExtra, SlotDisponivel } from '../hooks/usePublicBooking';
import { useCupomManagement } from '../hooks/useCupomManagement';
import { getAssetUrl, API_BASE_URL } from '../utils/api';
import { StepHeader, SelectionCard } from './booking/SharedComponents';

interface BookingPageProps {
  isPreview?: boolean;
  onExitPreview?: () => void;
}

const BookingPage: React.FC<BookingPageProps> = ({ isPreview = false, onExitPreview }) => {
  const { salonData, availableLocations, isLoading, error, unavailableUsuarioId, loadSalonData, loadAvailableLocations, findUnidadeBySlug, getAgenteDisponibilidade, createAgendamento, getExtrasByServices } = usePublicBooking();

  const [unidadeId, setUnidadeId] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [tempSelectedLocationId, setTempSelectedLocationId] = useState<number | null>(null);
  // ✅ NOVO: Estado para alternativas quando unidade não está disponível
  const [alternativeLocations, setAlternativeLocations] = useState<any[]>([]);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [usuarioId, setUsuarioId] = useState<number | null>(null);
  
  // ✅ CRÍTICO: Preservar configurações iniciais da empresa (logo e nome)
  // Essas configurações não devem mudar ao trocar de local
  const [businessConfig, setBusinessConfig] = useState<{ logo_url: string | null; nome_negocio: string } | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [selectedExtraServiceIds, setSelectedExtraServiceIds] = useState<number[]>([]);
  const [filteredExtras, setFilteredExtras] = useState<PublicExtra[]>([]);
  const [isLoadingExtras, setIsLoadingExtras] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [bookingSubmitError, setBookingSubmitError] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<SlotDisponivel[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isCreatingAppointment, setIsCreatingAppointment] = useState(false);
  const [noSlotsMessage, setNoSlotsMessage] = useState<string | null>(null);
  
  // Estados para cupom de desconto
  const [cupomCodigo, setCupomCodigo] = useState('');
  const [cupomAplicado, setCupomAplicado] = useState<any>(null);
  const [cupomErro, setCupomErro] = useState<string | null>(null);
  const [isValidatingCupom, setIsValidatingCupom] = useState(false);
  const [clienteId, setClienteId] = useState<number | null>(null);

  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // Estados temporários para seleções
  const [tempSelectedAgentId, setTempSelectedAgentId] = useState<number | null>(null);
  const [tempSelectedServiceIds, setTempSelectedServiceIds] = useState<number[]>([]);
  const [tempSelectedExtraServiceIds, setTempSelectedExtraServiceIds] = useState<number[]>([]);
  const [tempSelectedTime, setTempSelectedTime] = useState<string | null>(null);

  // Estados para o novo calendário
  const [viewDate, setViewDate] = useState(new Date());
  const [availableTimeSlots, setAvailableTimeSlots] = useState<{hora_inicio: string; hora_fim: string; disponivel: boolean}[]>([]);

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const autoSelectDateRequestRef = useRef(0);
  const selectedDateRef = useRef<Date | null>(null);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    if (bookingSubmitError) {
      setBookingSubmitError(null);
    }
  }, [currentStep]);

  // ✅ CORREÇÃO CRÍTICA: Função utilitária para converter data para string YYYY-MM-DD
  // Usando formato local (não UTC) para evitar problemas de timezone
  const formatDateToYYYYMMDD = useCallback((date: Date): string => {
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }, []);

  // Efeito para carregar os dados do salão
  // ✅ CORREÇÃO: Agora usa usuario_id ao invés de unidade_id na URL
  useEffect(() => {
    const loadData = async () => {
      setIsBootstrapping(true);
      if (isPreview) {
        // Para preview, usar unidade_id 4 (dados de teste)
        setUnidadeId(4);
        await loadSalonData(4);
        setIsBootstrapping(false);
        return;
      }

      // Extrair usuario_id da URL: /booking/:usuarioId
      const pathParts = window.location.pathname.split('/').filter(Boolean);

      if (pathParts.length >= 2 && pathParts[0] === 'booking') {
        // Formato: /booking/:usuarioId
        const userId = parseInt(pathParts[1]);
        if (!isNaN(userId)) {
          setUsuarioId(userId);

          // Buscar unidades ativas do usuário
          try {
            const response = await fetch(`${API_BASE_URL}/public/usuario/${userId}/unidades`);
            const data = await response.json();

            if (!response.ok || !data.success) {
              setIsBootstrapping(false);
              return;
            }

            const { nome_negocio, logo_url, unidades } = data.data;

            // Salvar configurações do negócio (logo e nome)
            setBusinessConfig({ logo_url, nome_negocio });

            // Se tiver apenas 1 unidade ativa, selecionar automaticamente
            if (unidades.length === 1) {
              setUnidadeId(unidades[0].id);
              setSelectedLocationId(unidades[0].id);
              await loadSalonData(unidades[0].id);
              setCurrentStep(2); // Pular para seleção de agente
              setIsBootstrapping(false);
            } else {
              // Se tiver múltiplas unidades, mostrar step de seleção
              setAlternativeLocations(unidades);
              setCurrentStep(1); // Mostrar seleção de local
              setIsBootstrapping(false);
            }
          } catch (err) {
            setIsBootstrapping(false);
          }
          return;
        }
      }

      // Não foi possível extrair usuario_id da URL
      setIsBootstrapping(false);
    };

    loadData();
  }, [isPreview, loadSalonData]);

  // ✅ NOVO: Buscar unidades alternativas quando a unidade atual não está disponível
  useEffect(() => {
    const fetchAlternatives = async () => {
      if (error && unavailableUsuarioId && alternativeLocations.length === 0) {
        setIsLoadingAlternatives(true);
        try {
          const alternatives = await loadAvailableLocations(unavailableUsuarioId);
          setAlternativeLocations(alternatives || []);
        } catch (err) {
          setAlternativeLocations([]);
        } finally {
          setIsLoadingAlternatives(false);
        }
      }
    };
    fetchAlternatives();
  }, [error, unavailableUsuarioId, loadAvailableLocations, alternativeLocations.length]);

  // ✅ CRÍTICO: Preservar configurações da empresa na primeira carga
  // Logo e nome do negócio não devem mudar ao trocar de local
  useEffect(() => {
    if (salonData && !businessConfig) {
      setBusinessConfig({
        logo_url: salonData.configuracoes.logo_url,
        nome_negocio: salonData.configuracoes.nome_negocio
      });
    }
  }, [salonData, businessConfig]);

  // Efeito para carregar locais disponíveis e decidir se mostra step 1 ou pula
  useEffect(() => {
    const loadLocationsAndDecide = async () => {
      // ✅ CORREÇÃO CRÍTICA: Remover verificação de currentStep para evitar race condition
      // Este useEffect deve executar SEMPRE que salonData estiver disponível
      if (!salonData) return;

      // salonData carregado, iniciando verificação de locais

      // Extrair usuario_id dos dados do salão
      const userId = salonData.unidade.usuario_id;
      if (!userId) {
        setCurrentStep(2); // Pular para serviços se não conseguir carregar locais
        return;
      }

      setUsuarioId(userId);

      // Carregar todos os locais disponíveis do usuário
      const locations = await loadAvailableLocations(userId);

      // Locais carregados

      if (locations.length === 0) {
        setCurrentStep(2); // Pular para seleção de serviços
      } else if (locations.length === 1) {
        // Apenas 1 local: auto-selecionar e pular para serviços
        setSelectedLocationId(locations[0].id);
        setTempSelectedLocationId(locations[0].id);
        setCurrentStep(2); // Pular para seleção de serviços
      } else {
        // Múltiplos locais: permanecer no step 1 para seleção
        // Múltiplos locais disponíveis
        // ✅ CRÍTICO: NÃO mudar o currentStep, deixar em 1 para mostrar seleção de locais
      }
    };

    loadLocationsAndDecide();
  }, [salonData, loadAvailableLocations]); // ✅ CORREÇÃO: Remover currentStep das dependências

  // Efeito para carregar extras filtrados quando serviços são selecionados
  useEffect(() => {
    const loadFilteredExtras = async () => {
      if (!unidadeId || selectedServiceIds.length === 0) {
        setFilteredExtras([]);
        return;
      }

      setIsLoadingExtras(true);
      try {
        const extras = await getExtrasByServices(unidadeId, selectedServiceIds);
        setFilteredExtras(extras);
      } catch (error) {
        // Erro ao carregar extras filtrados
        setFilteredExtras([]);
      } finally {
        setIsLoadingExtras(false);
      }
    };

    loadFilteredExtras();
  }, [unidadeId, selectedServiceIds, getExtrasByServices]);

  const resetToStep = (step: number) => {
    setCurrentStep(step);
    if (step <= 1) { setSelectedLocationId(null); setTempSelectedLocationId(null); }
    if (step <= 2) { setSelectedServiceIds([]); setTempSelectedServiceIds([]); }
    if (step <= 3) { setSelectedAgentId(null); setTempSelectedAgentId(null); }
    if (step <= 4) { setSelectedExtraServiceIds([]); setTempSelectedExtraServiceIds([]); }
    if (step <= 5) { setSelectedDate(new Date()); setSelectedTime(null); setTempSelectedTime(null); setAvailableSlots([]); }
    if (step <= 6) { setClientName(''); setClientPhone(''); }
  };

  // Função para avançar da seleção de serviços (passo 2) para próximo passo
  const handleAdvanceFromServices = async () => {
    setSelectedServiceIds(tempSelectedServiceIds);
    // Avançar para seleção de agente
    setCurrentStep(3);
  };

  const selectedAgent = useMemo(() => salonData?.agentes.find(a => a.id === selectedAgentId), [salonData, selectedAgentId]);
  const selectedServices = useMemo(() => salonData?.servicos.filter(s => selectedServiceIds.includes(s.id)) || [], [salonData, selectedServiceIds]);

  // ✅ CORREÇÃO CRÍTICA: Calcular dias disponíveis baseado na INTERSEÇÃO entre unidade E agente
  // REGRA: Um dia só está disponível se AMBOS (unidade E agente) estiverem abertos
  const availableDays = useMemo(() => {
    const agentId = selectedAgentId || tempSelectedAgentId; // Usar temp para preview
    if (!salonData?.horarios_agentes || !salonData?.horarios_unidade || !agentId) return [];

    // 1. Buscar dias em que a UNIDADE está aberta
    const unidadeOpenDays = salonData.horarios_unidade
      .filter(h => h.is_aberto && h.horarios_json && h.horarios_json.length > 0)
      .map(h => h.dia_semana);

    // 2. Buscar dias em que o AGENTE trabalha
    const agentWorkingDays = salonData.horarios_agentes
      .filter(h => {
        // Dia deve estar ativo E ter pelo menos um período de trabalho definido
        return h.agente_id === agentId &&
               h.ativo &&
               h.periodos &&
               h.periodos.length > 0;
      })
      .map(h => h.dia_semana);

    // 3. INTERSEÇÃO: Dias disponíveis = dias que a unidade está aberta E o agente trabalha
    const daysAvailable = unidadeOpenDays.filter(day => agentWorkingDays.includes(day));
    
    return daysAvailable;
  }, [salonData, selectedAgentId, tempSelectedAgentId]);

  const availableAgents = useMemo(() => {
    if (!salonData) return [];
    
    // Agentes disponíveis calculados
    
    return salonData.agentes;
  }, [salonData]);

  const availableServices = useMemo(() => {
    if (!salonData) return [];

    // ✅ NOVA LÓGICA: Mostrar TODOS os serviços do local (sem filtrar por agente)
    // O agente será selecionado DEPOIS dos serviços
    // Serviços disponíveis no local
    return salonData.servicos;
  }, [salonData]);

  const bookingProgress = useMemo(() => {
    const getStage = (step: number) => {
      if (step <= 1) return 1;
      if (step === 2) return 2;
      if (step === 3 || step === 4) return 3;
      if (step === 5) return 4;
      if (step === 6) return 5;
      return 6;
    };

    const stage = getStage(currentStep);
    const totalStages = 6;
    const percent = Math.min(100, Math.max(0, (stage / totalStages) * 100));

    let stageLabel = 'Unidade';
    if (currentStep === 2) stageLabel = 'Serviços';
    else if (currentStep === 3) stageLabel = 'Profissional';
    else if (currentStep === 4) stageLabel = 'Extras';
    else if (currentStep === 5) stageLabel = 'Data e Hora';
    else if (currentStep === 6) stageLabel = 'Seus Dados';
    else if (currentStep === 7) stageLabel = 'Revisão';
    else if (currentStep === 8) stageLabel = 'Concluído';

    return { stage, totalStages, percent, stageLabel };
  }, [currentStep]);

  const bookingHeaderSummary = useMemo(() => {
    const parts: string[] = [];

    if (currentStep === 1) {
      parts.push('Escolha uma unidade');
      return parts.join(' • ');
    }

    if (selectedLocationId) {
      parts.push(salonData?.unidade?.nome || 'Unidade selecionada');
    }

    if (selectedAgent) {
      parts.push(`Profissional: ${selectedAgent.nome_exibicao || selectedAgent.nome}`);
    }

    const maxNames = 2;
    const serviceNames = (selectedServices || []).map(s => s.nome).filter(Boolean);
    const servicesPreview = serviceNames.slice(0, maxNames).join(', ');
    const servicesRemaining = Math.max(0, serviceNames.length - maxNames);

    if (selectedServiceIds.length > 0) {
      const suffix = servicesRemaining > 0 ? ` +${servicesRemaining}` : '';
      parts.push(`Serviços: ${servicesPreview}${suffix}`);
    }

    const extrasSelected = filteredExtras.filter(e => selectedExtraServiceIds.includes(e.id));
    if (extrasSelected.length > 0) {
      parts.push(`Extras: ${extrasSelected.length}`);
    }

    if (selectedDate && selectedTime) {
      parts.push(`${selectedDate.toLocaleDateString('pt-BR')} ${selectedTime}`);
    }

    return parts.join(' • ');
  }, [currentStep, selectedLocationId, salonData?.unidade?.nome, selectedAgent, selectedServices, selectedServiceIds.length, filteredExtras, selectedExtraServiceIds, selectedDate, selectedTime]);

  const handleToggleService = (serviceId: number) => {
    setTempSelectedServiceIds(prev => {
      if (prev.includes(serviceId)) {
        return prev.filter(id => id !== serviceId);
      } else {
        return [...prev, serviceId];
      }
    });
  };

  const handleToggleExtraService = (extraId: number) => {
    setTempSelectedExtraServiceIds(prev => {
      if (prev.includes(extraId)) {
        return prev.filter(id => id !== extraId);
      } else {
        return [...prev, extraId];
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
      setAvailableSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // ✅ OTIMIZAÇÃO: Carregar horários automaticamente quando entrar no Step 5
  useEffect(() => {
    const autoLoadSlotsOnStep5 = async () => {
      // Verificar se acabou de entrar no Step 5
      if (currentStep !== 5) return;
      
      // Verificar se tem agente e serviços selecionados
      if (!selectedAgent || !selectedServices || selectedServices.length === 0) {
        return;
      }
      
      // Verificar se já tem uma data selecionada
      if (!selectedDate) {
        return;
      }
      
      const requestId = ++autoSelectDateRequestRef.current;

      setIsLoadingSlots(true);
      setAvailableTimeSlots([]);
      setTempSelectedTime('');

      try {
        const totalDuration = selectedServices.reduce((sum, service) => sum + service.duracao_minutos, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const maxDaysToSearch = (salonData?.configuracoes?.periodo_futuro_dias || 60);
        let candidate = selectedDateRef.current ? new Date(selectedDateRef.current) : new Date();
        candidate.setHours(0, 0, 0, 0);

        if (candidate < today) {
          candidate = new Date(today);
        }

        for (let i = 0; i <= maxDaysToSearch; i++) {
          if (autoSelectDateRequestRef.current !== requestId) return;

          const dayOfWeek = candidate.getDay();
          const isDayAvailable = availableDays.includes(dayOfWeek);

          if (!isDayAvailable) {
            candidate.setDate(candidate.getDate() + 1);
            continue;
          }

          const dateStr = formatDateToYYYYMMDD(candidate);
          const disponibilidade = await getAgenteDisponibilidade(
            selectedAgent.id,
            dateStr,
            totalDuration,
            unidadeId || undefined
          );

          if (autoSelectDateRequestRef.current !== requestId) return;

          const slots = disponibilidade?.slots_disponiveis || [];
          if (slots.length > 0) {
            if (selectedDate.toDateString() !== candidate.toDateString()) {
              const newSelectedDate = new Date(candidate);
              setSelectedDate(newSelectedDate);
              setViewDate(new Date(newSelectedDate.getFullYear(), newSelectedDate.getMonth(), 1));
            }
            setAvailableTimeSlots(slots);
            return;
          }

          candidate.setDate(candidate.getDate() + 1);
        }

        setAvailableTimeSlots([]);
      } catch (error) {
        setAvailableTimeSlots([]);
      } finally {
        if (autoSelectDateRequestRef.current === requestId) {
          setIsLoadingSlots(false);
        }
      }
    };

    autoLoadSlotsOnStep5();
  }, [currentStep, selectedAgent, selectedServices, availableDays, unidadeId, getAgenteDisponibilidade, formatDateToYYYYMMDD, salonData?.configuracoes?.periodo_futuro_dias]);

  if (isBootstrapping || isLoading || isLoadingAlternatives) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-50" style={{ minHeight: '100dvh' }}><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div></div>;
  }

  // ✅ NOVO: Mostrar alternativas quando unidade não está disponível
  if (error && alternativeLocations.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4" style={{ minHeight: '100dvh' }}>
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-yellow-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Local Indisponível</h2>
            <p className="text-gray-600">Este local não está mais disponível para agendamentos.</p>
            <p className="text-gray-500 text-sm mt-2">Mas você pode escolher outro local abaixo:</p>
          </div>

          <div className="space-y-3">
            {alternativeLocations.map(location => (
              <button
                key={location.id}
                onClick={() => {
                  // Redirecionar para a unidade alternativa
                  const pathParts = window.location.pathname.split('/').filter(Boolean);
                  const slug = pathParts[0] || '';
                  const newUrl = slug ? `/${slug}/booking/${location.id}` : `/booking/${location.id}`;
                  window.location.href = newUrl;
                }}
                className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
              >
                <div className="font-semibold text-gray-800">{location.nome}</div>
                {location.endereco && (
                  <div className="text-sm text-gray-500 mt-1">{location.endereco}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!salonData) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-red-500 font-semibold p-4" style={{ minHeight: '100dvh' }}>{error || "Não foi possível carregar os dados do salão."}</div>;
  }

  // Render Steps

  const renderLocationSelection = () => {
    return (
      <div className="flex flex-col">
        <StepHeader title="Escolha um local" />
        <div className="p-4 space-y-3">
          {availableLocations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Carregando locais disponíveis...</p>
            </div>
          ) : (
            availableLocations.map(location => (
              <SelectionCard
                key={location.id}
                title={location.nome}
                subtitle={location.endereco}
                onClick={() => setTempSelectedLocationId(location.id)}
                isSelected={tempSelectedLocationId === location.id}
              />
            ))
          )}
        </div>
        <div className="p-4 mt-auto shrink-0 border-t border-gray-200 bg-white">
          <button
            onClick={async () => {
              if (!tempSelectedLocationId) return;
              
              // Confirmar seleção do local
              setSelectedLocationId(tempSelectedLocationId);
              
              // Atualizar unidadeId para o local selecionado
              setUnidadeId(tempSelectedLocationId);
              
              // Carregar dados do local selecionado
              await loadSalonData(tempSelectedLocationId);
              
              // Avançar para seleção de serviços
              setCurrentStep(2);
            }}
            disabled={!tempSelectedLocationId || availableLocations.length === 0}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
          >
            Próximo
          </button>
        </div>
      </div>
    );
  };

  const renderAgentSelection = () => (
     <div className="flex flex-col">
      <StepHeader title="Escolha um profissional" onBack={() => resetToStep(2)} />
      <div className="p-4 space-y-3">
        {availableAgents.map(agent => (
          <SelectionCard
            key={agent.id}
            imageUrl={agent.avatar_url ? getAssetUrl(agent.avatar_url) : `https://ui-avatars.com/api/?name=${encodeURIComponent(agent.nome || 'A')}&background=2563eb&color=fff&size=128`}
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
            
            // Verificar se há extras disponíveis antes de avançar
            if (filteredExtras.length === 0) {
              setCurrentStep(5);
            } else {
              setCurrentStep(4);
            }
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
    <div className="flex flex-col">
      <StepHeader title="Escolha um ou mais serviços" onBack={() => resetToStep(1)} />
      <div className="p-4 space-y-3">
        {availableServices.map(service => (
          <SelectionCard
            key={service.id}
            title={service.nome}
            subtitle={`${service.duracao_minutos} min - R$ ${(Number(service.preco) || 0).toFixed(2).replace('.', ',')}`}
            onClick={() => handleToggleService(service.id)}
            isSelected={tempSelectedServiceIds.includes(service.id)}
          />
        ))}
      </div>
      <div className="p-4 mt-auto shrink-0 border-t border-gray-200 bg-white">
        <button
          onClick={handleAdvanceFromServices}
          disabled={tempSelectedServiceIds.length === 0}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
        >
            Próximo
        </button>
      </div>
    </div>
  );

  const renderExtraServiceSelection = () => {
    // Verifica se algum serviço extra foi selecionado para mudar o texto do botão
    const hasSelection = tempSelectedExtraServiceIds.length > 0;

    return (
        <div className="flex flex-col">
            <StepHeader title="Deseja adicionar algum extra?" onBack={() => resetToStep(3)} />
            <div className="p-4 space-y-3">
                {isLoadingExtras ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500">Carregando extras disponíveis...</p>
                    </div>
                ) : filteredExtras.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500">Nenhum serviço extra disponível para os serviços selecionados.</p>
                        <p className="text-gray-400 text-sm mt-2">Clique em "Pular esta etapa" para continuar.</p>
                    </div>
                ) : (
                    filteredExtras.map(extra => (
                        <SelectionCard
                            key={extra.id}
                            title={extra.name}
                            subtitle={`${extra.duration} min - R$ ${extra.price.toFixed(2).replace('.', ',')}`}
                            onClick={() => handleToggleExtraService(extra.id)}
                            isSelected={tempSelectedExtraServiceIds.includes(extra.id)}
                        />
                    ))
                )}
            </div>
            <div className="p-4 mt-auto shrink-0 border-t border-gray-200 bg-white">
                <button
                    onClick={() => {
                        // Confirma a seleção (ou vazio se pulou) e avança para a próxima etapa (passo 5)
                        setSelectedExtraServiceIds(tempSelectedExtraServiceIds);
                        setCurrentStep(5);
                    }}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    {hasSelection ? 'Próximo' : 'Pular esta etapa'}
                </button>
            </div>
        </div>
    );
  };

  // Função para buscar disponibilidade quando uma data é selecionada
  const handleDateSelect = async (date: Date) => {
    // ✅ CORREÇÃO: Usar formatDateToYYYYMMDD em vez de toISOString para evitar problemas de timezone
    const dateStr = formatDateToYYYYMMDD(date);

    // ✅ IMPORTANTE: Cancelar qualquer auto-seleção em andamento para não sobrescrever o clique do usuário
    autoSelectDateRequestRef.current++;

    setSelectedDate(date);
    setTempSelectedTime('');
    setIsLoadingSlots(true);
    setAvailableTimeSlots([]);
    setNoSlotsMessage(null);

    try {
      if (!selectedAgent) {
        setIsLoadingSlots(false);
        return;
      }

      if (!selectedServices || selectedServices.length === 0) {
        setIsLoadingSlots(false);
        return;
      }

      // Calcular duração total dos serviços selecionados
      const totalDuration = selectedServices.reduce((sum, service) => sum + service.duracao_minutos, 0);

      // Passar unidadeId para filtrar horários do agente multi-unidade
      const disponibilidade = await getAgenteDisponibilidade(selectedAgent.id, dateStr, totalDuration, unidadeId || undefined);

      if (disponibilidade && disponibilidade.slots_disponiveis) {
        setAvailableTimeSlots(disponibilidade.slots_disponiveis);

        if (disponibilidade.slots_disponiveis.length === 0) {
          const timeLimitHours = salonData?.configuracoes?.tempo_limite_agendar_horas || 0;
          const isToday = date.toDateString() === new Date().toDateString();
          if (isToday && timeLimitHours > 0) {
            setNoSlotsMessage(`Hoje não há horários disponíveis devido ao prazo mínimo de agendamento (${timeLimitHours}h).`);
          }
        }
      } else {
        setAvailableTimeSlots([]);

        const timeLimitHours = salonData?.configuracoes?.tempo_limite_agendar_horas || 0;
        const isToday = date.toDateString() === new Date().toDateString();
        if (isToday && timeLimitHours > 0) {
          setNoSlotsMessage(`Hoje não há horários disponíveis devido ao prazo mínimo de agendamento (${timeLimitHours}h).`);
        }
      }
    } catch (error) {
      setAvailableTimeSlots([]);
      setNoSlotsMessage(null);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // Função para renderizar a seleção de data e hora com design melhorado e API real
  const renderDateTimeSelection = () => {
    // Função para verificar se um dia tem slots disponíveis (para indicadores visuais)
    const getDayAvailabilityIndicator = async (date: Date): Promise<number> => {
      if (!selectedAgent) return 0;

      try {
        const totalDuration = selectedServices.reduce((sum, service) => sum + service.duracao_minutos, 0);
        // ✅ Usar formatDateToYYYYMMDD do escopo pai
        const dateStr = formatDateToYYYYMMDD(date);
        const disponibilidade = await getAgenteDisponibilidade(selectedAgent.id, dateStr, totalDuration);

        if (disponibilidade && disponibilidade.slots_disponiveis) {
          const slotsCount = disponibilidade.slots_disponiveis.length;
          if (slotsCount <= 5) return 1;
          else if (slotsCount <= 10) return 2;
          else return 3;
        }
        return 0;
      } catch {
        return 0;
      }
    };

    const Calendar = () => {
      const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
      const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const dayOfWeekOffset = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return (
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <button onClick={handlePrevMonth} className="p-2 rounded-full hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h3 className="font-bold text-gray-800 capitalize">
              {viewDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5 text-gray-500 rotate-180" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500 mb-2 uppercase">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map(d => <div key={d}>{d}</div>)}
            <div className="text-yellow-600">Sáb</div>
            <div className="text-yellow-600">Dom</div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: dayOfWeekOffset }).map((_, i) => <div key={`blank-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(year, month, day);
              const dayOfWeek = date.getDay(); // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
              const isDayAvailable = availableDays.includes(dayOfWeek); // ✅ CORREÇÃO: Usar interseção unidade + agente
              const isPastDate = date < today;
              const isAvailable = date >= today && isDayAvailable; // ✅ Só disponível se for futuro E (unidade aberta E agente trabalha)
              const isSelected = selectedDate?.toDateString() === date.toDateString();

              // Determinar estilo baseado no status do dia
              let buttonStyle = '';
              let textStyle = '';

              if (isSelected) {
                buttonStyle = 'bg-[#2663EB] text-white';
                textStyle = 'text-white';
              } else if (isAvailable) {
                buttonStyle = 'bg-lime-100/60 hover:bg-lime-200';
                textStyle = 'text-gray-800';
              } else {
                // Dias passados OU dias de folga recebem o mesmo estilo cinza
                buttonStyle = 'cursor-not-allowed bg-gray-100';
                textStyle = 'text-gray-400';
              }

              return (
                <button
                  key={day}
                  disabled={!isAvailable}
                  onClick={() => {
                    if (isAvailable) {
                      handleDateSelect(date);
                    }
                  }}
                  className={`relative flex flex-col items-center justify-center h-12 rounded-lg transition-colors focus:outline-none ${buttonStyle}`}
                  title={
                    isPastDate ? 'Data já passou' :
                    !isDayAvailable ? 'Local fechado ou agente não trabalha neste dia' :
                    'Clique para selecionar'
                  }
                >
                  <span className={`font-semibold ${textStyle}`}>
                    {day}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col">
        <StepHeader title="Escolha data e hora" onBack={() => {
          // ✅ CRÍTICO: Voltar para Step 4 se houver extras, senão voltar para Step 3
          if (filteredExtras.length > 0) {
            resetToStep(4);
          } else {
            resetToStep(3);
          }
        }} />
        <div className="p-4 space-y-4">
          <Calendar />
          {selectedDate && (
            <div>
              <div className="text-center font-semibold text-gray-700 py-3 mb-2 border-b-2 border-dotted">
                Escolha um horário disponível {selectedDate.toLocaleDateString('pt-BR', {day: 'numeric', month: 'long'})}
              </div>

              {/* Loading de slots */}
              {isLoadingSlots && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-600">Carregando horários...</span>
                </div>
              )}

              {/* Slots disponíveis da API */}
              {!isLoadingSlots && availableTimeSlots.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {availableTimeSlots.map(slot => (
                    <button
                      key={slot.hora_inicio}
                      onClick={() => setTempSelectedTime(slot.hora_inicio)}
                      className={`p-3 rounded-lg border font-semibold text-center transition-colors ${
                        tempSelectedTime === slot.hora_inicio ? 'bg-[#2663EB] text-white border-[#2663EB]' :
                        'bg-lime-100/60 border-lime-200 text-gray-800 hover:border-lime-500'
                      }`}
                    >
                      {slot.hora_inicio}
                    </button>
                  ))}
                </div>
              )}

              {/* Mensagem quando não há slots */}
              {!isLoadingSlots && availableTimeSlots.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>{noSlotsMessage || 'Nenhum horário disponível neste dia.'}</p>
                  <p className="text-sm mt-1">Tente selecionar outra data.</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-4 mt-auto shrink-0 border-t border-gray-200 bg-white">
          <button
            onClick={() => {
              setSelectedTime(tempSelectedTime);
              setCurrentStep(6);
            }}
            disabled={!tempSelectedTime || !selectedDate}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
          >
            Próximo
          </button>
        </div>
      </div>
    );
  };

  const renderClientDetails = () => (
    <div className="flex flex-col">
      <StepHeader title="Seus dados" onBack={() => resetToStep(5)} />
      <div className="p-4 space-y-4">
        {/* Título da seção */}
        <h3 className="text-base font-semibold text-gray-800">Informações do Cliente</h3>
        
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Nome Completo</label>
          <input
            type="text"
            value={clientName}
            onChange={e => {
              if (bookingSubmitError) {
                setBookingSubmitError(null);
              }
              setClientName(e.target.value);
            }}
            className="w-full bg-white border border-gray-300 text-gray-800 text-base rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Telefone (WhatsApp)</label>
          <input
            type="tel"
            value={clientPhone}
            onChange={e => {
              if (bookingSubmitError) {
                setBookingSubmitError(null);
              }
              setClientPhone(e.target.value);
            }}
            placeholder="(85) 99999-9999"
            className="w-full bg-white border border-gray-300 text-gray-800 text-base rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500"
          />
          {bookingSubmitError && (
            <p className="text-sm text-red-600 mt-2 font-medium">{bookingSubmitError}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">Você receberá a confirmação do agendamento neste número.</p>
        </div>
      </div>
       <div className="p-4 mt-auto border-t border-gray-200 bg-white">
        <button 
          onClick={async () => {
            // ✅ Validação de telefone já na etapa "Seus dados" (mais profissional)
            // Regra: DDD (2 dígitos) + 9 + 8 dígitos (11 dígitos no total)
            let telefoneLimpo = clientPhone.trim().replace(/\D/g, '');
            if (telefoneLimpo.startsWith('55') && telefoneLimpo.length >= 12) {
              telefoneLimpo = telefoneLimpo.substring(2);
            }

            if (telefoneLimpo.length !== 11) {
              setBookingSubmitError('Informe um número válido com DDD + 9 + 8 dígitos (ex: (85) 9 9999-9999)');
              return;
            }

            // Terceiro dígito (após DDD) deve ser 9
            if (telefoneLimpo[2] !== '9') {
              setBookingSubmitError('O número deve ser um celular com 9 dígitos após o DDD (ex: (85) 9 9999-9999)');
              return;
            }

            // Buscar cliente existente antes de ir para revisão
            await buscarClienteExistente(clientPhone);
            setCurrentStep(7);
          }} 
          disabled={!clientName || !clientPhone} 
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
        >
            Continuar para Revisão
        </button>
      </div>
    </div>
  );

  // Função para criar o agendamento
  const handleCreateAppointment = async () => {
    if (!unidadeId || !selectedAgentId || !selectedServiceIds.length || !selectedDate || !selectedTime || !clientName || !clientPhone) {
      setBookingSubmitError('Dados incompletos para criar o agendamento');
      return;
    }

    // Validar formato do telefone
    const phoneRegex = /^(\+55\s?)?(\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}$/;
    if (!phoneRegex.test(clientPhone.trim())) {
      setBookingSubmitError('Por favor, insira um número de telefone válido (ex: (85) 99999-9999)');
      return;
    }

    if (bookingSubmitError) {
      setBookingSubmitError(null);
    }
    setIsCreatingAppointment(true);

    try {
      // Formatar telefone para o padrão brasileiro
      let formattedPhone = clientPhone.trim().replace(/\D/g, '');
      if (formattedPhone.length === 11 && !formattedPhone.startsWith('55')) {
        formattedPhone = `+55${formattedPhone}`;
      } else if (formattedPhone.length === 13 && formattedPhone.startsWith('55')) {
        formattedPhone = `+${formattedPhone}`;
      } else if (!formattedPhone.startsWith('+55')) {
        formattedPhone = `+55${formattedPhone}`;
      }

      const agendamentoData = {
        unidade_id: unidadeId,
        agente_id: selectedAgentId,
        servico_ids: selectedServiceIds,
        servico_extra_ids: selectedExtraServiceIds,
        data_agendamento: selectedDate.toISOString().split('T')[0], // YYYY-MM-DD
        hora_inicio: selectedTime,
        cliente_nome: clientName.trim(),
        cliente_telefone: formattedPhone,
        observacoes: ''
      };

      const agendamentoCriado = await createAgendamento(agendamentoData);

      if (agendamentoCriado) {
        // ✅ Atualizar nome do cliente com o nome completo retornado do backend
        // Isso garante que se o cliente já existia, o nome completo será exibido
        if (agendamentoCriado.cliente?.nome) {
          setClientName(agendamentoCriado.cliente.nome);
        }
        
        setCurrentStep(8); // Ir para tela de sucesso
      }

    } catch (error) {
      // Mensagens de erro mais específicas
      let errorMessage = 'Erro ao criar agendamento';
      if (error.message.includes('Horário indisponível')) {
        errorMessage = 'Este horário já foi ocupado. Por favor, escolha outro horário.';
      } else if (error.message.includes('WhatsApp')) {
        errorMessage = 'Agendamento criado, mas houve problema no envio do WhatsApp. Entre em contato conosco.';
      } else if (error.message.includes('cliente')) {
        errorMessage = 'Erro ao processar seus dados. Verifique as informações e tente novamente.';
      }

      setBookingSubmitError(errorMessage);
    } finally {
      setIsCreatingAppointment(false);
    }
  };

  // Função para buscar cliente existente por telefone
  const buscarClienteExistente = async (telefone: string) => {
    try {
      // Formatar telefone para busca
      const telefoneLimpo = telefone.trim().replace(/\D/g, '');
      
      // Buscar cliente no backend
      const response = await fetch(`${API_BASE_URL}/public/cliente/buscar?telefone=${telefoneLimpo}&unidade_id=${unidadeId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.cliente) {
          // Cliente encontrado - atualizar nome completo
          const nomeCompleto = `${data.cliente.primeiro_nome} ${data.cliente.ultimo_nome}`.trim();
          if (nomeCompleto && nomeCompleto !== clientName) {
            setClientName(nomeCompleto);
          }
        }
      }
    } catch (error) {
      // Não bloquear o fluxo se houver erro
    }
  };

  // Função para validar cupom
  const handleValidarCupom = async () => {
    if (!cupomCodigo.trim()) {
      setCupomErro('Digite um código de cupom');
      return;
    }

    if (!unidadeId) {
      setCupomErro('Erro: Unidade não identificada');
      return;
    }

    setIsValidatingCupom(true);
    setCupomErro(null);

    try {
      // Calcular valor total dos serviços e extras
      const selectedExtraServices = filteredExtras.filter(e => selectedExtraServiceIds.includes(e.id));
      const valorServicos = selectedServices.reduce((total, s) => total + (Number(s.preco) || 0), 0);
      const valorExtras = selectedExtraServices.reduce((total, e) => total + (Number(e.preco) || 0), 0);
      const valorTotal = valorServicos + valorExtras;

      const response = await fetch(`${API_BASE_URL}/public/cupons/validar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          codigo: cupomCodigo.trim().toUpperCase(),
          cliente_id: clienteId || null, // ✅ Enviar null se não tiver cliente_id
          valor_pedido: valorTotal,
          unidade_id: unidadeId, // ✅ CRÍTICO: Enviar unidade_id para validação de propriedade
          servico_ids: selectedServiceIds // ✅ Enviar serviços para validação de restrições
        })
      });

      const data = await response.json();

      if (data.success && data.valido) {
        setCupomAplicado({
          codigo: cupomCodigo.trim().toUpperCase(),
          tipo_desconto: data.cupom.tipo_desconto,
          valor_desconto: data.cupom.valor_desconto,
          desconto_calculado: data.desconto.valor_desconto
        });
        setCupomErro(null);
      } else {
        setCupomErro(data.error || 'Cupom inválido');
        setCupomAplicado(null);
      }
    } catch (error) {
      setCupomErro('Erro ao validar cupom. Tente novamente.');
      setCupomAplicado(null);
    } finally {
      setIsValidatingCupom(false);
    }
  };

  // Função para remover cupom
  const handleRemoverCupom = () => {
    setCupomAplicado(null);
    setCupomCodigo('');
    setCupomErro(null);
  };

  // Renderizar Fase 7: Revisão e Checkout
  const renderCheckout = () => {
    // Buscar objetos completos dos extras selecionados
    const selectedExtraServices = filteredExtras.filter(e => selectedExtraServiceIds.includes(e.id));
    
    const valorServicos = selectedServices.reduce((total, s) => total + (Number(s.preco) || 0), 0);
    const valorExtras = selectedExtraServices.reduce((total, e) => total + (Number(e.preco) || 0), 0);
    const subtotal = valorServicos + valorExtras;
    const desconto = cupomAplicado ? cupomAplicado.desconto_calculado : 0;
    const valorFinal = Math.max(0, subtotal - desconto);
    const totalDuration = selectedServices.reduce((total, s) => total + s.duracao_minutos, 0) + 
                         selectedExtraServices.reduce((total, e) => total + e.duracao_minutos, 0);

    return (
      <div className="flex flex-col">
        <StepHeader title="Detalhes da Reserva" onBack={() => resetToStep(6)} />
        
        <div className="p-4 space-y-4">
          {/* Mensagem informativa */}
          <p className="text-sm text-gray-600">
            Revise os detalhes abaixo. Você pode voltar para editar ou confirmar sua reserva.
          </p>

          {bookingSubmitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700 font-medium">{bookingSubmitError}</p>
            </div>
          )}

          {/* Serviço Principal */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Serviço</h3>
            {selectedServices.map(service => (
              <div key={service.id} className="flex justify-between items-center mb-2">
                <span className="text-gray-800 font-medium">{service.nome}</span>
                <span className="text-gray-800 font-semibold">R$ {(Number(service.preco) || 0).toFixed(2).replace('.', ',')}</span>
              </div>
            ))}
            {selectedExtraServices.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Serviços Extras:</p>
                {selectedExtraServices.map(extra => (
                  <div key={extra.id} className="flex justify-between items-center mb-1 text-sm">
                    <span className="text-gray-600">{extra.nome}</span>
                    <span className="text-gray-600">R$ {(Number(extra.preco) || 0).toFixed(2).replace('.', ',')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Data e Horário */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Data e Horário</h3>
            <div className="flex items-center gap-2 text-blue-600 font-medium">
              <Calendar className="w-5 h-5" />
              <span>
                {selectedDate?.toLocaleDateString('pt-BR', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'long',
                  year: 'numeric'
                }).replace(/^\w/, c => c.toUpperCase())}, {selectedTime}
              </span>
            </div>
          </div>

          {/* Cliente */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Cliente</h3>
            <div>
              <p className="text-gray-800 font-medium">{clientName}</p>
              <p className="text-sm text-gray-500">{clientPhone}</p>
            </div>
          </div>

          {/* Profissional Selecionado */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Selecionado</h3>
            <div className="flex items-center gap-3">
              {selectedAgent?.avatar_url ? (
                <img 
                  src={getAssetUrl(selectedAgent.avatar_url)} 
                  alt={selectedAgent.nome_exibicao || selectedAgent.nome}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold">
                  {(selectedAgent?.nome_exibicao || selectedAgent?.nome || '').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-gray-800 font-medium">{selectedAgent?.nome_exibicao || selectedAgent?.nome}</p>
                <p className="text-sm text-gray-500">Profissional</p>
              </div>
            </div>
          </div>

          {/* Cupom de Desconto */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Cupom de Desconto</h3>
            
            {!cupomAplicado ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cupomCodigo}
                    onChange={(e) => {
                      setCupomCodigo(e.target.value.toUpperCase());
                      setCupomErro(null);
                    }}
                    placeholder="Digite o código do cupom"
                    className="flex-1 bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 uppercase"
                    disabled={isValidatingCupom}
                  />
                  <button
                    onClick={handleValidarCupom}
                    disabled={isValidatingCupom || !cupomCodigo.trim()}
                    className="px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isValidatingCupom ? 'Validando...' : 'Aplicar'}
                  </button>
                </div>
                {cupomErro && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <X className="w-3 h-3" />
                    {cupomErro}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-green-800">{cupomAplicado.codigo}</p>
                      <p className="text-xs text-green-600">
                        {cupomAplicado.tipo_desconto === 'percentual' 
                          ? `${cupomAplicado.valor_desconto}% de desconto`
                          : `R$ ${cupomAplicado.valor_desconto.toFixed(2).replace('.', ',')} de desconto`
                        }
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoverCupom}
                    className="p-1 hover:bg-green-100 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-green-700" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Resumo de Valores */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Resumo</h3>
            <div className="space-y-2">
              {valorServicos > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Serviços</span>
                  <span className="text-gray-800">R$ {valorServicos.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              {valorExtras > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Extras</span>
                  <span className="text-gray-800">R$ {valorExtras.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              {desconto > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Desconto</span>
                  <span className="text-green-600 font-semibold">- R$ {desconto.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-gray-800">Preço Total</span>
                  <span className="text-xl font-bold text-gray-900">R$ {valorFinal.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Botão de Confirmação */}
        <div className="p-4 mt-auto border-t border-gray-200 bg-white">
          <button 
            onClick={handleCreateAppointment} 
            disabled={isCreatingAppointment} 
            className="w-full bg-[#2663EB] text-white font-bold py-4 rounded-lg hover:bg-[#1d4ed8] transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
          >
            {isCreatingAppointment ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Confirmando reserva...
              </>
            ) : (
              'Confirmar reserva'
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderSuccess = () => (
    <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-6">
        <CheckCircle className="w-20 h-20 text-green-500" />

        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Agendamento Confirmado!</h2>
          <p className="text-gray-600">
              Obrigado, <span className="font-semibold">{clientName}</span>!
          </p>
        </div>

        {/* Informações do processo */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center justify-center space-x-2 mb-3">
            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            <span className="text-sm font-medium text-green-800">WhatsApp Enviado</span>
          </div>
          <ul className="text-xs text-green-700 space-y-1">
            <li>✓ Seus dados foram {clientPhone ? 'atualizados' : 'cadastrados'} com sucesso</li>
            <li>✓ Confirmação enviada para {clientPhone}</li>
            <li>✓ Você receberá lembretes automáticos</li>
          </ul>
        </div>

        <div className="space-y-3 w-full max-w-sm">
          <button
            onClick={() => resetToStep(1)}
            className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Fazer Novo Agendamento
          </button>

          <p className="text-xs text-gray-500">
            Precisa de ajuda? Entre em contato conosco pelo WhatsApp
          </p>
        </div>
    </div>
  );


  const renderStep = () => {
    switch(currentStep) {
      case 1: return renderLocationSelection();
      case 2: return renderServiceSelection();
      case 3: return renderAgentSelection();
      case 4: return renderExtraServiceSelection();
      case 5: return renderDateTimeSelection();
      case 6: return renderClientDetails();
      case 7: return renderCheckout();
      case 8: return renderSuccess();
      default: return renderLocationSelection();
    }
  }

  const mainContainerClass = isPreview 
    ? "w-full max-w-none bg-gray-50 flex flex-col flex-1 h-full overflow-hidden"
    : "bg-gray-100 flex flex-col items-center";
  
  const contentWrapperClass = isPreview 
    ? "h-full flex flex-col" 
    : "w-full max-w-md bg-gray-50 flex flex-col flex-1 shadow-lg";

  return (
    <div className={mainContainerClass} style={!isPreview ? { minHeight: '100dvh' } : undefined}>
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
          <header className="bg-gray-100 border-b border-gray-200">
            <div className="p-3">
              <button
                type="button"
                onClick={() => {
                  if (mainScrollRef.current) {
                    mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                  } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-200 px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={(businessConfig?.logo_url || salonData.configuracoes.logo_url) ? getAssetUrl(businessConfig?.logo_url || salonData.configuracoes.logo_url) : `https://ui-avatars.com/api/?name=${encodeURIComponent(businessConfig?.nome_negocio || salonData.configuracoes.nome_negocio || 'Negócio')}&background=2563eb&color=fff&size=128`}
                    alt={businessConfig?.nome_negocio || salonData.configuracoes.nome_negocio}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      const name = businessConfig?.nome_negocio || salonData.configuracoes.nome_negocio || 'N';
                      target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff&size=128`;
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    <h1 className="text-lg font-bold text-gray-900 leading-tight truncate">
                      {businessConfig?.nome_negocio || salonData.configuracoes.nome_negocio}
                    </h1>
                    <p className="text-sm text-gray-600 leading-snug truncate">
                      {bookingHeaderSummary}
                    </p>
                    {salonData.unidade.endereco && currentStep !== 1 && (
                      <p className="text-xs text-gray-500 leading-snug truncate">
                        {salonData.unidade.endereco}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${bookingProgress.percent}%` }}
                    />
                  </div>
                  <div className="mt-1 text-center text-sm font-medium text-gray-700">
                    {bookingProgress.stageLabel}
                  </div>
                </div>
              </button>
            </div>
          </header>
        </div>

        <main
          ref={(el) => { mainScrollRef.current = el; }}
          onScroll={(e) => {
            const target = e.currentTarget;
            setShowBackToTop(target.scrollTop > 240);
          }}
          className="flex-1 flex flex-col overflow-y-auto"
        >
          {renderStep()}
        </main>

        {showBackToTop && (
          <button
            type="button"
            onClick={() => {
              if (mainScrollRef.current) {
                mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="fixed bottom-5 right-5 z-30 bg-blue-600 text-white font-semibold px-4 py-3 rounded-full shadow-lg hover:bg-blue-700"
          >
            Voltar ao topo
          </button>
        )}
      </div>
    </div>
  );
};

export default BookingPage;