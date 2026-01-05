
import React, { useState, useEffect } from 'react';
import { Copy, Check, MessageSquare, Eye, Upload } from './Icons';
import { useSettingsManagement } from '../hooks/useSettingsManagement';
import { useAuth } from '../contexts/AuthContext';
import { getAssetUrl } from '../utils/api';
import { useToast } from '../contexts/ToastContext';
import WhatsAppConnectModal from './WhatsAppConnectModal';
import { useWhatsAppConnection } from '../hooks/useWhatsAppConnection';

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
    <h2 className="text-xl font-bold text-gray-800 mb-6">{title}</h2>
    {children}
  </div>
);

const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="grid grid-cols-3 gap-4 items-center py-3 border-b border-gray-100 last:border-b-0">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="col-span-2">{children}</div>
    </div>
);

const Input: React.FC<{ defaultValue?: string, type?: string, value?: string, onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder?: string, autoComplete?: string }> = ({ defaultValue, type = "text", value, onChange, placeholder, autoComplete }) => (
    <input type={type} defaultValue={defaultValue} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500" />
);

const ToggleSwitch: React.FC<{ enabled: boolean; setEnabled: (enabled: boolean) => void }> = ({ enabled, setEnabled }) => (
    <button
        type="button"
        className={`${enabled ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled(!enabled)}
    >
        <span
            aria-hidden="true"
            className={`${enabled ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
    </button>
);

interface SettingsPageProps {
  onShowPreview: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onShowPreview }) => {
    const { user, updateUser } = useAuth();
    const toast = useToast();
    const {
        settings,
        loading,
        error,
        loadSettings,
        saveAllSettings,
        generateBookingLink,
        copyBookingLink,
        clearError
    } = useSettingsManagement();

    // Estados locais para formulários
    const [copied, setCopied] = useState(false);
    const [businessName, setBusinessName] = useState('');
    const [serviceDuration, setServiceDuration] = useState(1.0);
    const [bookingTimeLimit, setBookingTimeLimit] = useState(2);
    const [allowCancellation, setAllowCancellation] = useState(true);
    const [cancellationTimeLimit, setCancellationTimeLimit] = useState(4);
    const [futurePeriod, setFuturePeriod] = useState(365);

    // Estados para Sistema de Pontos
    const [pontosAtivo, setPontosAtivo] = useState(false);
    const [pontosPorReal, setPontosPorReal] = useState(1.0);
    const [reaisPorPontos, setReaisPorPontos] = useState(10.0);
    const [pontosValidadeMeses, setPontosValidadeMeses] = useState(12);

    // Estados para alteração de senha
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Estados para upload de logo
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // WhatsApp
    const canManageWhatsApp = user?.role === 'ADMIN' || user?.role === 'MASTER';
    const [showWhatsAppConnect, setShowWhatsAppConnect] = useState(false);
    const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
    const {
        status: whatsappStatus,
        statusLabel: whatsappStatusLabel,
        statusLoading: whatsappStatusLoading,
        connectLoading: whatsappConnectLoading,
        disconnectLoading: whatsappDisconnectLoading,
        qrcodeBase64,
        setQrcodeBase64,
        error: whatsappError,
        lastStatusFetchAt: whatsappLastStatusFetchAt,
        lastStatusRaw: whatsappLastStatusRaw,
        connect: connectWhatsApp,
        disconnect: disconnectWhatsApp,
        fetchStatus: fetchWhatsAppStatus,
        isConnected: isWhatsAppConnected
    } = useWhatsAppConnection({
        autoPoll: canManageWhatsApp,
        pollIntervalMs: isWhatsAppModalOpen ? 2000 : 30000
    });

    const [confirmingWhatsAppDisconnect, setConfirmingWhatsAppDisconnect] = useState(false);

    useEffect(() => {
        if (!canManageWhatsApp) return;
        const hasKnownState = whatsappStatus.whatsapp_status !== 'unknown';
        const hasAnyWhatsAppData = Boolean(whatsappStatus.whatsapp_instance_name || whatsappStatus.whatsapp_number || hasKnownState);
        if (hasAnyWhatsAppData) {
            setShowWhatsAppConnect(true);
        }
    }, [canManageWhatsApp, whatsappStatus.whatsapp_instance_name, whatsappStatus.whatsapp_number, whatsappStatus.whatsapp_status]);

    // Estados de loading específicos
    const [savingSettings, setSavingSettings] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    // Carregar configurações ao montar o componente
    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        if (whatsappError) {
            toast.error('WhatsApp', whatsappError);
        }
    }, [toast, whatsappError]);

    useEffect(() => {
        if (isWhatsAppModalOpen && isWhatsAppConnected) {
            setIsWhatsAppModalOpen(false);
            toast.success('WhatsApp', 'Conectado com sucesso.');
        }
    }, [isWhatsAppConnected, isWhatsAppModalOpen, toast]);

    // Sincronizar estados locais com configurações carregadas
    useEffect(() => {
        if (settings) {
            setBusinessName(settings.nome_negocio);
            setServiceDuration(settings.duracao_servico_horas);
            setBookingTimeLimit(settings.tempo_limite_agendar_horas);
            setAllowCancellation(settings.permitir_cancelamento);
            setCancellationTimeLimit(settings.tempo_limite_cancelar_horas);
            setFuturePeriod(settings.periodo_futuro_dias);
            // Sincronizar estados de pontos
            setPontosAtivo(settings.pontos_ativo || false);
            setPontosPorReal(settings.pontos_por_real || 1.0);
            setReaisPorPontos(settings.reais_por_pontos || 10.0);
            setPontosValidadeMeses(settings.pontos_validade_meses || 12);
        }
    }, [settings]);

    // Função para lidar com upload de logo
    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validar tipo de arquivo
            if (!file.type.startsWith('image/')) {
                alert('Por favor, selecione apenas arquivos de imagem.');
                return;
            }

            // Validar tamanho (5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('O arquivo deve ter no máximo 5MB.');
                return;
            }

            setLogoFile(file);

            // Criar preview
            const reader = new FileReader();
            reader.onload = (e) => {
                setLogoPreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    // Função removida - usando apenas handleSaveAllSettings

    // Funções redundantes removidas - usando apenas handleSaveAllSettings

    // Função para copiar link de agendamento
    const handleCopyLink = async () => {
        const success = await copyBookingLink();
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } else {
            alert('Erro ao copiar link. Tente novamente.');
        }
    };

    // Gerar link de reserva usando nome do negócio e unidade_id
    const bookingLink = generateBookingLink() || 'Carregando...';

    // Função para salvar todas as definições (transação unificada)
    const handleSaveAllSettings = async () => {
        setSavingSettings(true);
        clearError();

        try {
            // Validações no frontend
            if (currentPassword && newPassword && confirmPassword) {
                if (newPassword !== confirmPassword) {
                    throw new Error('As senhas não coincidem');
                }
                // ✅ CORREÇÃO 1.9: Validação robusta de senha
                if (newPassword.length < 8) {
                    throw new Error('A nova senha deve ter pelo menos 8 caracteres');
                }
                if (!/[A-Z]/.test(newPassword)) {
                    throw new Error('A senha deve conter pelo menos uma letra maiúscula');
                }
                if (!/[a-z]/.test(newPassword)) {
                    throw new Error('A senha deve conter pelo menos uma letra minúscula');
                }
                if (!/[0-9]/.test(newPassword)) {
                    throw new Error('A senha deve conter pelo menos um número');
                }
                if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
                    throw new Error('A senha deve conter pelo menos um caractere especial');
                }
            }

            // Chamar função unificada
            const result = await saveAllSettings({
                // Configurações
                nome_negocio: businessName,
                duracao_servico_horas: serviceDuration,
                tempo_limite_agendar_horas: bookingTimeLimit,
                permitir_cancelamento: allowCancellation,
                tempo_limite_cancelar_horas: cancellationTimeLimit,
                periodo_futuro_dias: futurePeriod,
                // Sistema de Pontos
                pontos_ativo: pontosAtivo,
                pontos_por_real: pontosPorReal,
                reais_por_pontos: reaisPorPontos,
                pontos_validade_meses: pontosValidadeMeses,
                // Logo
                logoFile: logoFile || undefined,
                // Senha
                senha_atual: currentPassword || undefined,
                nova_senha: newPassword || undefined,
                confirmacao_senha: confirmPassword || undefined
            });

            // Atualizar AuthContext se logo foi alterada
            if (logoFile && result && result.logo_url) {
                updateUser({ avatarUrl: result.logo_url });
            }

            // Limpar estados de formulários após sucesso
            if (currentPassword && newPassword && confirmPassword) {
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }

            // Limpar estados de logo APÓS garantir que settings foi atualizado
            // O result já contém logo_url atualizado, e saveAllSettings já chamou setSettings(result)
            if (logoFile) {
                setLogoFile(null);
                // Usar pequeno delay para garantir que o React processou a atualização do settings
                setTimeout(() => {
                    setLogoPreview(null);
                }, 100);
            }

            toast.success('Definições Salvas!', 'Todas as configurações foram atualizadas com sucesso.');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao salvar definições';
            toast.error('Erro ao Salvar', errorMessage);
        } finally {
            setSavingSettings(false);
        }
    };

    // Mostrar loading se ainda não carregou as configurações
    if (loading && !settings) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-gray-500">Carregando configurações...</div>
                </div>
            </div>
        );
    }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Configurações</h1>

      {/* Mostrar erro se houver */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex justify-between items-center">
            <span>{error}</span>
            <button onClick={clearError} className="text-red-500 hover:text-red-700">×</button>
          </div>
        </div>
      )}

      <Card title="Link do Cliente">
          <FormRow label="Seu link de agendamento">
              <div className="flex items-center gap-2">
                  <input
                      type="text"
                      readOnly
                      value={bookingLink}
                      className="w-full bg-gray-100 border border-gray-300 text-gray-600 text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                      onClick={handleCopyLink}
                  />
                  <button
                      onClick={handleCopyLink}
                      className={`flex items-center justify-center px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors w-32 ${
                          copied ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                  >
                      {copied ? (
                          <>
                              <Check className="w-4 h-4 mr-2" />
                              Copiado!
                          </>
                      ) : (
                          <>
                              <Copy className="w-4 h-4 mr-2" />
                              Copiar
                          </>
                      )}
                  </button>
              </div>
          </FormRow>
      </Card>

      <Card title="Informações do Negócio">
          <FormRow label="Logo do Negócio">
              <div className="flex items-center gap-4">
                  <img
                      src={logoPreview || getAssetUrl(settings?.logo_url) || '/default-logo.png'}
                      alt="Logo do Negócio"
                      className="w-16 h-16 rounded-full object-cover bg-gray-200"
                      onError={(e) => {
                      }}
                  />
                  <div className="flex flex-col gap-2">
                      <label htmlFor="logo-upload" className="cursor-pointer bg-white text-gray-700 border border-gray-300 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                          {logoFile ? 'Alterar Arquivo' : 'Selecionar Logo'}
                      </label>
                      <input
                          id="logo-upload"
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleLogoChange}
                      />
                      {logoFile && (
                          <p className="text-sm text-green-600 font-medium">
                              Logo selecionada! Clique em "Salvar Definições" para aplicar.
                          </p>
                      )}
                  </div>
              </div>
          </FormRow>
          <FormRow label="Nome do Negócio">
              <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Digite o nome do seu negócio"
              />
          </FormRow>
      </Card>

      {canManageWhatsApp && (
        <>
          <Card title="Conectar WhatsApp">
            <FormRow label="Mostrar configuração do WhatsApp">
              <ToggleSwitch enabled={showWhatsAppConnect} setEnabled={setShowWhatsAppConnect} />
            </FormRow>

            {showWhatsAppConnect && (
              <>
                <FormRow label="Status">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${
                      whatsappStatus.whatsapp_status === 'open'
                        ? 'text-green-600'
                        : whatsappStatus.whatsapp_status === 'connecting'
                          ? 'text-yellow-700'
                          : whatsappStatus.whatsapp_status === 'close'
                            ? 'text-red-600'
                            : 'text-gray-500'
                    }`}>
                      {whatsappStatusLabel}
                    </span>

                    {whatsappStatusLoading && (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    )}

                    <button
                      type="button"
                      onClick={() => fetchWhatsAppStatus()}
                      className="text-xs font-semibold text-gray-900 hover:underline"
                    >
                      Atualizar
                    </button>
                  </div>
                </FormRow>

                <FormRow label="Número conectado">
                  <span className="text-sm text-gray-700 font-medium">
                    {whatsappStatus.whatsapp_number || '-'}
                  </span>
                </FormRow>

                <FormRow label="">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        setIsWhatsAppModalOpen(true);
                        setQrcodeBase64(null);
                        await connectWhatsApp();
                        await fetchWhatsAppStatus();
                      }}
                      disabled={whatsappConnectLoading || isWhatsAppConnected}
                      className={`flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors w-44 ${
                        isWhatsAppConnected
                          ? 'bg-green-600'
                          : 'bg-blue-600 hover:bg-blue-700'
                      } ${
                        (whatsappConnectLoading || isWhatsAppConnected) ? 'opacity-90 cursor-not-allowed' : ''
                      }`}
                    >
                      {whatsappConnectLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span className="ml-2">Conectando...</span>
                        </>
                      ) : (
                        <>
                          {isWhatsAppConnected ? 'Conectado' : 'Conectar'}
                        </>
                      )}
                    </button>

                    {!!whatsappStatus.whatsapp_instance_name && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirmingWhatsAppDisconnect) {
                            setConfirmingWhatsAppDisconnect(true);
                            setTimeout(() => setConfirmingWhatsAppDisconnect(false), 5000);
                            toast.error('Desconectar WhatsApp', 'Clique novamente em 5s para confirmar a desconexão.');
                            return;
                          }

                          const ok = await disconnectWhatsApp();
                          setConfirmingWhatsAppDisconnect(false);
                          if (ok) {
                            await fetchWhatsAppStatus();
                            toast.success('WhatsApp', 'Desconectado. Você já pode conectar outro número.');
                          }
                        }}
                        disabled={whatsappDisconnectLoading}
                        className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                          confirmingWhatsAppDisconnect
                            ? 'bg-gray-700 text-white hover:bg-gray-800'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        } ${whatsappDisconnectLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        {whatsappDisconnectLoading ? 'Desconectando...' : (confirmingWhatsAppDisconnect ? 'Confirmar' : 'Desconectar')}
                      </button>
                    )}
                  </div>
                </FormRow>

                <FormRow label="">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 font-semibold mb-3">
                      Para evitar bloqueios do número ao usar o WhatsApp, evite:
                    </p>
                    <ul className="text-sm text-blue-700 space-y-2">
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Disparos em massa e picos de envio (muitas mensagens em pouco tempo)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Repetir o mesmo texto para muitos contatos (conteúdo repetitivo / comportamento de spam)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Usar número de celular novo/recém-criado para envios automáticos (aquecimento gradual é recomendado)</span>
                      </li>
                    </ul>
                  </div>
                </FormRow>
              </>
            )}
          </Card>

          <WhatsAppConnectModal
            isOpen={isWhatsAppModalOpen}
            onClose={() => setIsWhatsAppModalOpen(false)}
            qrcodeBase64={qrcodeBase64}
            statusText={whatsappStatusLabel}
            connectedNumber={whatsappStatus.whatsapp_number}
            loading={whatsappConnectLoading}
            debugLastFetchAt={whatsappLastStatusFetchAt}
            debugLastRaw={whatsappLastStatusRaw}
            onRetry={async () => {
              setQrcodeBase64(null);
              await connectWhatsApp();
            }}
          />
        </>
      )}

      <Card title="Compromissos e Definições">
          <FormRow label="Duração do Serviço (Horas)">
              <Input
                  value={serviceDuration.toString()}
                  onChange={(e) => setServiceDuration(parseFloat(e.target.value) || 1)}
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="8"
              />
          </FormRow>
          <FormRow label="Tempo limite para agendar (Horas)">
              <Input
                  value={bookingTimeLimit.toString()}
                  onChange={(e) => setBookingTimeLimit(parseInt(e.target.value) || 0)}
                  type="number"
                  min="0"
                  max="168"
              />
          </FormRow>
          <FormRow label="Permitir que os clientes cancelem suas reservas">
              <ToggleSwitch enabled={allowCancellation} setEnabled={setAllowCancellation} />
          </FormRow>
          {allowCancellation && (
              <FormRow label="Tempo limite para cancelar (Horas)">
                  <Input
                      value={cancellationTimeLimit.toString()}
                      onChange={(e) => setCancellationTimeLimit(parseInt(e.target.value) || 0)}
                      type="number"
                      min="0"
                      max="168"
                  />
              </FormRow>
          )}
          <FormRow label="Período para Agendamentos Futuros (dias)">
              <Input
                  value={futurePeriod.toString()}
                  onChange={(e) => setFuturePeriod(parseInt(e.target.value) || 1)}
                  type="number"
                  min="1"
                  max="730"
              />
          </FormRow>
          <FormRow label="">
              <p className="text-sm text-gray-600">
                  Configure os valores acima e clique em "Salvar Definições" no final da página.
              </p>
          </FormRow>
      </Card>

      <Card title="Sistema de Pontos">
          <FormRow label="Ativar Sistema de Pontos">
              <ToggleSwitch enabled={pontosAtivo} setEnabled={setPontosAtivo} />
          </FormRow>
          
          {pontosAtivo && (
              <>
                  <FormRow label="">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-800 font-semibold mb-3">
                              Como funciona o sistema de pontos?
                          </p>
                          <ul className="text-sm text-blue-700 space-y-2">
                              <li className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>Cliente ganha pontos a cada real gasto (após descontos)</span>
                              </li>
                              <li className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>Pontos podem ser convertidos em descontos futuros</span>
                              </li>
                              <li className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>Pontos expiram após o período de validade configurado</span>
                              </li>
                          </ul>
                      </div>
                  </FormRow>

                  <FormRow label="Regra de Ganho">
                      <div className="space-y-3">
                          <div className="space-y-2">
                              <label className="text-sm text-gray-700 font-medium block">
                                  A cada R$ 1,00 gasto, o cliente ganha
                              </label>
                              <div className="flex items-center gap-2">
                                  <Input
                                      value={pontosPorReal.toString()}
                                      onChange={(e) => setPontosPorReal(parseFloat(e.target.value) || 1.0)}
                                      type="number"
                                      step="0.01"
                                      min="0.01"
                                      max="100"
                                      placeholder="1.00"
                                  />
                                  <span className="text-sm text-gray-600 whitespace-nowrap">ponto(s)</span>
                              </div>
                          </div>
                          <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                              Exemplo: Se configurar 1.00, um serviço de R$ 50,00 gera 50 pontos
                          </p>
                      </div>
                  </FormRow>

                  <FormRow label="Regra de Conversão">
                      <div className="space-y-3">
                          <div className="space-y-2">
                              <label className="text-sm text-gray-700 font-medium block">
                                  A cada
                              </label>
                              <div className="flex items-center gap-2">
                                  <Input
                                      value={reaisPorPontos.toString()}
                                      onChange={(e) => setReaisPorPontos(parseFloat(e.target.value) || 10.0)}
                                      type="number"
                                      step="1"
                                      min="1"
                                      max="1000"
                                      placeholder="10.00"
                                  />
                                  <span className="text-sm text-gray-600 whitespace-nowrap">pontos, o cliente ganha R$ 1,00 de desconto</span>
                              </div>
                          </div>
                          <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                              Exemplo: Se configurar 10, o cliente precisa de 100 pontos para R$ 10,00 de desconto
                          </p>
                      </div>
                  </FormRow>

                  <FormRow label="Validade dos Pontos (meses)">
                      <div className="space-y-3">
                          <Input
                              value={pontosValidadeMeses.toString()}
                              onChange={(e) => setPontosValidadeMeses(parseInt(e.target.value) || 12)}
                              type="number"
                              min="1"
                              max="60"
                              placeholder="12"
                          />
                          <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                              Pontos expiram após {pontosValidadeMeses} {pontosValidadeMeses === 1 ? 'mês' : 'meses'} da data de ganho
                          </p>
                      </div>
                  </FormRow>

                  <FormRow label="">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-800 font-semibold mb-3">
                              Simulação com suas configurações:
                          </p>
                          <ul className="text-sm text-blue-700 space-y-2">
                              <li className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>Serviço de R$ 100,00 = <strong>{(100 * pontosPorReal).toFixed(0)} pontos</strong></span>
                              </li>
                              <li className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>{reaisPorPontos} pontos = <strong>R$ 1,00 de desconto</strong></span>
                              </li>
                              <li className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>{(100 * pontosPorReal).toFixed(0)} pontos = <strong>R$ {((100 * pontosPorReal) / reaisPorPontos).toFixed(2)} de desconto</strong></span>
                              </li>
                          </ul>
                      </div>
                  </FormRow>
              </>
          )}

          <FormRow label="">
              <p className="text-sm text-gray-600">
                  {pontosAtivo 
                      ? 'Configure as regras acima e clique em "Salvar Definições" para ativar o sistema de pontos.'
                      : 'Ative o sistema de pontos para permitir que seus clientes acumulem e utilizem pontos como desconto.'}
              </p>
          </FormRow>
      </Card>

      <Card title="Alterar Senha">
        <form onSubmit={(e) => e.preventDefault()}>
          <FormRow label="Senha Atual">
              <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                  autoComplete="current-password"
              />
          </FormRow>
          <FormRow label="Nova Senha">
              <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Digite a nova senha (mín. 6 caracteres)"
                  autoComplete="new-password"
              />
          </FormRow>
          <FormRow label="Confirmar Nova Senha">
              <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme a nova senha"
                  autoComplete="new-password"
              />
          </FormRow>
          <FormRow label="">
              <p className="text-sm text-gray-600">
                  Preencha os campos acima e clique em "Salvar Definições" para alterar sua senha.
              </p>
          </FormRow>
        </form>
      </Card>

      <Card title="Suporte">
        <p className="text-sm text-gray-600 mb-4">
            Precisa de ajuda ou tem alguma dúvida? Nossa equipe de suporte está pronta para te atender. Clique no botão abaixo para iniciar uma conversa via WhatsApp.
        </p>
        <a
            href="https://wa.me/5585912345678"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors"
        >
            <MessageSquare className="w-5 h-5" />
            Contatar Suporte via WhatsApp
        </a>
      </Card>

      <div className="pt-2">
          <button
              onClick={handleSaveAllSettings}
              disabled={savingSettings}
              className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center gap-2"
          >
              {savingSettings ? (
                  <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Salvando...
                  </>
              ) : (
                  <>
                      <Check className="w-4 h-4" />
                      Salvar Definições
                  </>
              )}
          </button>
      </div>
    </div>
  );
};

export default SettingsPage;
