import React, { useState, useEffect } from 'react';
import { Calendar, X, CheckCircle, AlertCircle } from './Icons';
import { useManageBooking, AgendamentoDetalhes, HorarioFuncionamentoUnidade } from '../hooks/useManageBooking';
import { usePublicBooking, SalonData } from '../hooks/usePublicBooking';
import { getAssetUrl, API_BASE_URL } from '../utils/api';
import { StepHeader, ActionButton, InfoCard, LoadingSpinner, ErrorMessage } from './booking/SharedComponents';

const ManageBookingPage: React.FC = () => {
  // Estados principais
  const [currentStep, setCurrentStep] = useState(1); // 1=Validar, 2=Escolher Ação, 3=Reagendar, 4=Cancelar, 5=Sucesso
  const [agendamentoId, setAgendamentoId] = useState<number | null>(null);
  const [clientPhone, setClientPhone] = useState('');
  const [agendamento, setAgendamento] = useState<AgendamentoDetalhes | null>(null);
  const [action, setAction] = useState<'reagendar' | 'cancelar' | null>(null);
  
  // ✅ CRÍTICO: Preservar configurações iniciais da empresa (logo e nome)
  // Essas configurações não devem mudar
  const [businessConfig, setBusinessConfig] = useState<{ logo_url: string | null; nome_negocio: string } | null>(null);
  
  // Estados para reagendamento
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<{hora_inicio: string; hora_fim: string; disponivel: boolean}[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  // ✅ NOVO: Horários de funcionamento da unidade
  const [horariosUnidade, setHorariosUnidade] = useState<HorarioFuncionamentoUnidade[]>([]);
  
  // Estados para cancelamento
  const [cancelReason, setCancelReason] = useState('');
  
  // ✅ CORREÇÃO CRÍTICA: Estado para contagem regressiva (movido para o topo do componente)
  const [countdown, setCountdown] = useState(60);
  
  // Hooks
  const { isLoading, error, fetchAgendamento, reagendarAgendamento, cancelarAgendamento, fetchHorariosUnidade } = useManageBooking();
  const { salonData, getAgenteDisponibilidade, loadSalonData } = usePublicBooking();

  // ✅ CRÍTICO: Preservar configurações da empresa na primeira carga
  // Logo e nome do negócio não devem mudar
  useEffect(() => {
    if (salonData && !businessConfig) {
      setBusinessConfig({
        logo_url: salonData.configuracoes.logo_url,
        nome_negocio: salonData.configuracoes.nome_negocio
      });
    }
  }, [salonData, businessConfig]);

  // Extrair ID da URL e carregar dados básicos do agendamento
  useEffect(() => {
    const loadInitialData = async () => {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2 && pathParts[0] === 'gerenciar-agendamento') {
        const id = parseInt(pathParts[1]);
        if (!isNaN(id)) {
          setAgendamentoId(id);
          
          // Buscar dados básicos do agendamento sem validação de telefone
          // para carregar o logo da unidade
          try {
            const response = await fetch(`${API_BASE_URL}/public/agendamento/${id}/preview`);
            const data = await response.json();
            
            if (data.success && data.data.unidade_id) {
              // Carregar dados da unidade para exibir logo
              await loadSalonData(data.data.unidade_id);
            }
          } catch (error) {
            // Erro silencioso - não expor detalhes no console
          }
        }
      }
    };
    
    loadInitialData();
  }, [loadSalonData]);

  // Validar telefone e buscar agendamento
  const handleValidatePhone = async () => {
    if (!agendamentoId || !clientPhone) {
      alert('Por favor, informe seu telefone');
      return;
    }

    const data = await fetchAgendamento(agendamentoId, clientPhone);
    if (data) {
      setAgendamento(data);
      
      // Buscar horários de funcionamento da unidade
      const horarios = await fetchHorariosUnidade(data.unidade.id);
      setHorariosUnidade(horarios);
      
      setCurrentStep(2); // Ir para escolha de ação
    } else {
      alert(error || 'Não foi possível validar o agendamento');
    }
  };

  // Buscar horários disponíveis para reagendamento
  const handleDateSelect = async (date: Date) => {
    if (!agendamento) return;

    setSelectedDate(date);
    setSelectedTime(null);
    setIsLoadingSlots(true);
    setAvailableTimeSlots([]);

    try {
      const totalDuration = agendamento.servicos.reduce((sum, s) => sum + s.duracao_minutos, 0);
      const dateStr = date.toISOString().split('T')[0];

      // Verificar se temos o ID do agente
      if (!agendamento.agente.id) {
        return;
      }

      // Passar agendamentoId para excluir da verificação de conflitos
      const disponibilidade = await getAgenteDisponibilidade(
        agendamento.agente.id,
        dateStr,
        totalDuration,
        agendamento.unidade.id,
        agendamentoId || undefined // ✅ Excluir agendamento atual
      );

      if (disponibilidade && disponibilidade.slots_disponiveis) {
        setAvailableTimeSlots(disponibilidade.slots_disponiveis);
      } else {
        setAvailableTimeSlots([]);
      }
    } catch (error) {
      // Erro silencioso - não expor detalhes no console
      setAvailableTimeSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // ✅ NOVO: Verificar se a unidade está aberta em um dia específico
  const isUnidadeAberta = (date: Date): boolean => {
    const diaSemana = date.getDay(); // 0 = Domingo, 6 = Sábado
    const horario = horariosUnidade.find(h => h.dia_semana === diaSemana);
    return horario?.is_aberto && horario.horarios_json && horario.horarios_json.length > 0;
  };

  // Confirmar reagendamento
  const handleConfirmReschedule = async () => {
    if (!agendamentoId || !selectedDate || !selectedTime || !clientPhone) {
      alert('Selecione data e horário');
      return;
    }

    const result = await reagendarAgendamento(agendamentoId, {
      telefone: clientPhone,
      data_agendamento: selectedDate.toISOString().split('T')[0],
      hora_inicio: selectedTime
    });

    if (result.success) {
      setCurrentStep(5); // Tela de sucesso
    } else {
      alert(result.error || error || 'Erro ao reagendar');
    }
  };

  // Confirmar cancelamento
  const handleConfirmCancel = async () => {
    if (!agendamentoId || !clientPhone) return;

    const confirmed = window.confirm('Tem certeza que deseja cancelar este agendamento?');
    if (!confirmed) return;

    const result = await cancelarAgendamento(agendamentoId, {
      telefone: clientPhone,
      motivo: cancelReason
    });

    if (result.success) {
      setCurrentStep(5); // Tela de sucesso
    } else {
      alert(result.error || error || 'Erro ao cancelar');
    }
  };

  // Renderizar Step 1: Validação de telefone
  const renderPhoneValidation = () => (
    <div className="flex flex-col h-full">
      <StepHeader title="Gerenciar Agendamento" />
      <div className="p-6 space-y-6 overflow-y-auto flex-1">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-[#2663EB]" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Agendamento #{agendamentoId}</h2>
          <p className="text-gray-600 text-sm">
            Para gerenciar seu agendamento, confirme seu telefone cadastrado
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600 mb-2 block">Telefone (WhatsApp)</label>
          <input
            type="tel"
            value={clientPhone}
            onChange={e => setClientPhone(e.target.value)}
            placeholder="(85) 99999-9999"
            className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-2">
            Você pode digitar com ou sem DDD e com ou sem código do país. Ex: +5585985502643, 85985502643, 985502643 ou 85502643
          </p>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 bg-white">
        <button
          onClick={handleValidatePhone}
          disabled={!clientPhone || isLoading}
          className="w-full bg-[#2663EB] text-white font-bold py-4 rounded-lg hover:bg-[#1d4ed8] transition-colors disabled:bg-gray-400"
        >
          {isLoading ? 'Validando...' : 'Continuar'}
        </button>
      </div>
    </div>
  );

  // Renderizar Step 2: Escolher ação
  const renderActionSelection = () => {
    if (!agendamento) return null;

    // Verificar se pode reagendar ou cancelar
    const canReschedule = agendamento.status === 'Aprovado';
    const canCancel = agendamento.status === 'Aprovado';

    return (
      <div className="flex flex-col h-full">
        <StepHeader title="Gerenciar Agendamento" />
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Resumo do agendamento */}
          <InfoCard title="Detalhes do Agendamento">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">
                  {new Date(agendamento.data_agendamento).toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}, {agendamento.hora_inicio}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Cliente</p>
                <p className="font-medium text-gray-800">{agendamento.cliente.nome}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Profissional</p>
                <p className="font-medium text-gray-800">{agendamento.agente.nome}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Serviços</p>
                {agendamento.servicos.map(s => (
                  <p key={s.id} className="text-gray-800">{s.nome}</p>
                ))}
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                  agendamento.status === 'Aprovado' ? 'bg-green-100 text-green-700' :
                  agendamento.status === 'Cancelado' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {agendamento.status}
                </span>
              </div>
            </div>
          </InfoCard>

          {/* Ações disponíveis */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-800">O que você deseja fazer?</h3>
            
            {canReschedule && (
              <ActionButton
                icon={<Calendar className="w-6 h-6 text-[#2663EB]" />}
                title="Reagendar"
                description="Alterar data e horário do agendamento"
                onClick={() => {
                  setAction('reagendar');
                  setCurrentStep(3);
                }}
                variant="primary"
              />
            )}

            {canCancel && (
              <ActionButton
                icon={<X className="w-6 h-6 text-red-600" />}
                title="Cancelar"
                description="Cancelar este agendamento"
                onClick={() => {
                  setAction('cancelar');
                  setCurrentStep(4);
                }}
                variant="danger"
              />
            )}

            {!canReschedule && !canCancel && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  Este agendamento não pode ser modificado devido ao seu status atual.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Renderizar Step 3: Reagendar (calendário)
  const renderReschedule = () => {
    if (!agendamento) return null;

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
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="font-bold text-gray-800 capitalize">
              {viewDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-gray-100">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
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
              const isPastDate = date < today;
              // ✅ CORREÇÃO CRÍTICA: Validar se a unidade está aberta neste dia
              const isUnidadeOpen = isUnidadeAberta(date);
              const isAvailable = date >= today && isUnidadeOpen;
              const isSelected = selectedDate?.toDateString() === date.toDateString();

              let buttonStyle = '';
              let textStyle = '';

              if (isSelected) {
                buttonStyle = 'bg-[#2663EB] text-white';
                textStyle = 'text-white';
              } else if (isAvailable) {
                buttonStyle = 'bg-lime-100/60 hover:bg-lime-200';
                textStyle = 'text-gray-800';
              } else if (!isUnidadeOpen && date >= today) {
                // ✅ FEEDBACK VISUAL: Dia fechado (cinza #F3F4F6 - padronizado com BookingPage)
                buttonStyle = 'cursor-not-allowed bg-[#F3F4F6]';
                textStyle = 'text-gray-400';
              } else {
                // Dia passado (cinza)
                buttonStyle = 'cursor-not-allowed bg-gray-100';
                textStyle = 'text-gray-400';
              }

              return (
                <button
                  key={day}
                  disabled={!isAvailable}
                  onClick={() => isAvailable ? handleDateSelect(date) : undefined}
                  className={`relative flex flex-col items-center justify-center h-12 rounded-lg transition-colors focus:outline-none ${buttonStyle}`}
                  title={!isUnidadeOpen && date >= today ? 'Local fechado neste dia' : ''}
                >
                  <span className={`font-semibold ${textStyle}`}>{day}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full">
        <StepHeader title="Escolha nova data e hora" onBack={() => setCurrentStep(2)} />
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          <Calendar />
          {selectedDate && (
            <div>
              <div className="text-center font-semibold text-gray-700 py-3 mb-2 border-b-2 border-dotted">
                Horários disponíveis para {selectedDate.toLocaleDateString('pt-BR', {day: 'numeric', month: 'long'})}
              </div>

              {isLoadingSlots && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-600">Carregando horários...</span>
                </div>
              )}

              {!isLoadingSlots && availableTimeSlots.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {availableTimeSlots.map(slot => (
                    <button
                      key={slot.hora_inicio}
                      onClick={() => setSelectedTime(slot.hora_inicio)}
                      className={`p-3 rounded-lg border font-semibold text-center transition-colors ${
                        selectedTime === slot.hora_inicio ? 'bg-[#2663EB] text-white border-[#2663EB]' :
                        'bg-lime-100/60 border-lime-200 text-gray-800 hover:border-lime-500'
                      }`}
                    >
                      {slot.hora_inicio}
                    </button>
                  ))}
                </div>
              )}

              {!isLoadingSlots && availableTimeSlots.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>Nenhum horário disponível neste dia.</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 bg-white">
          <button
            onClick={handleConfirmReschedule}
            disabled={!selectedDate || !selectedTime || isLoading}
            className="w-full bg-[#2663EB] text-white font-bold py-4 rounded-lg hover:bg-[#1d4ed8] transition-colors disabled:bg-gray-400"
          >
            {isLoading ? 'Reagendando...' : 'Confirmar Reagendamento'}
          </button>
        </div>
      </div>
    );
  };

  // Renderizar Step 4: Cancelar
  const renderCancel = () => {
    if (!agendamento) return null;

    return (
      <div className="flex flex-col h-full">
        <StepHeader title="Cancelar Agendamento" onBack={() => setCurrentStep(2)} />
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 mb-1">Atenção!</p>
                <p className="text-sm text-red-700">
                  Ao cancelar este agendamento, você perderá sua reserva. Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
          </div>

          <InfoCard title="Agendamento a ser cancelado">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-700">
                <Calendar className="w-5 h-5" />
                <span>
                  {new Date(agendamento.data_agendamento).toLocaleDateString('pt-BR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}, {agendamento.hora_inicio}
                </span>
              </div>
              <p className="text-gray-600">{agendamento.servicos.map(s => s.nome).join(', ')}</p>
            </div>
          </InfoCard>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-2 block">
              Motivo do cancelamento (opcional)
            </label>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Nos ajude a melhorar informando o motivo..."
              rows={4}
              className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-white">
          <button
            onClick={handleConfirmCancel}
            disabled={isLoading}
            className="w-full bg-red-600 text-white font-bold py-4 rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400"
          >
            {isLoading ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    );
  };

  // ✅ CORREÇÃO CRÍTICA: useEffect para contagem regressiva (movido para o topo)
  useEffect(() => {
    // Iniciar contagem regressiva apenas quando estiver no step 5 (sucesso)
    if (currentStep !== 5) {
      setCountdown(60); // Resetar contador quando não estiver no step 5
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Fechar página automaticamente
          window.close();
          // Se window.close() não funcionar (página não foi aberta via script), 
          // tentar redirecionar para about:blank
          setTimeout(() => {
            window.location.href = 'about:blank';
          }, 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentStep]);

  // Renderizar Step 5: Sucesso
  const renderSuccess = () => {

    const handleClosePage = () => {
      window.close();
      // Fallback se window.close() não funcionar
      setTimeout(() => {
        window.location.href = 'about:blank';
      }, 100);
    };

    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-6">
        <CheckCircle className="w-20 h-20 text-green-500" />

        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {action === 'reagendar' ? 'Reagendamento Confirmado!' : 'Agendamento Cancelado'}
          </h2>
          <p className="text-gray-600">
            {action === 'reagendar' 
              ? 'Seu agendamento foi reagendado com sucesso. Você receberá uma confirmação por WhatsApp.'
              : 'Seu agendamento foi cancelado. Esperamos vê-lo em breve!'}
          </p>
        </div>

        {action === 'reagendar' && selectedDate && selectedTime && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full max-w-sm">
            <p className="text-sm font-semibold text-green-800 mb-2">Nova data e horário:</p>
            <div className="flex items-center justify-center gap-2 text-green-700">
              <Calendar className="w-5 h-5" />
              <span>
                {selectedDate.toLocaleDateString('pt-BR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}, {selectedTime}
              </span>
            </div>
          </div>
        )}

        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={handleClosePage}
            className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Fechar Página
          </button>

          <p className="text-sm text-gray-500">
            Esta página será fechada automaticamente em <span className="font-semibold text-gray-700">{countdown}s</span>
          </p>
        </div>
      </div>
    );
  };

  // Renderizar step atual
  const renderStep = () => {
    switch (currentStep) {
      case 1: return renderPhoneValidation();
      case 2: return renderActionSelection();
      case 3: return renderReschedule();
      case 4: return renderCancel();
      case 5: return renderSuccess();
      default: return renderPhoneValidation();
    }
  };

  if (isLoading && currentStep === 1) {
    return <LoadingSpinner message="Carregando agendamento..." />;
  }

  if (!agendamentoId) {
    return <ErrorMessage message="ID do agendamento não encontrado na URL" />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center" style={{ minHeight: '100dvh' }}>
      <div className="w-full max-w-md bg-gray-50 flex flex-col flex-1 shadow-lg">
        <div className="sticky top-0 z-20 shrink-0">
          <header className="p-4 text-center bg-white border-b border-gray-200">
            {salonData ? (
              <>
                <img
                  src={(businessConfig?.logo_url || salonData.configuracoes.logo_url) ? getAssetUrl(businessConfig?.logo_url || salonData.configuracoes.logo_url) : `https://ui-avatars.com/api/?name=${encodeURIComponent(businessConfig?.nome_negocio || salonData.configuracoes.nome_negocio || 'Negócio')}&background=2563eb&color=fff&size=128`}
                  alt={businessConfig?.nome_negocio || salonData.configuracoes.nome_negocio}
                  className="w-16 h-16 rounded-full mx-auto mb-2 object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    const name = businessConfig?.nome_negocio || salonData.configuracoes.nome_negocio || 'N';
                    target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff&size=128`;
                  }}
                />
                <h1 className="text-xl font-bold text-gray-900">{businessConfig?.nome_negocio || salonData.configuracoes.nome_negocio}</h1>
                {agendamento && (
                  <div className="mt-1">
                    <p className="text-sm font-semibold text-gray-700">{agendamento.unidade.nome}</p>
                    {agendamento.unidade.endereco && (
                      <p className="text-sm text-gray-600">{agendamento.unidade.endereco}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-gray-900">Gerenciar Agendamento</h1>
                <p className="text-sm text-gray-600 mt-1">#{agendamentoId}</p>
              </>
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

export default ManageBookingPage;
