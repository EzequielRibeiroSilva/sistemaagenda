import React, { useState, useEffect } from 'react';
import { Check } from './Icons';
import { usePontosConfig } from '../hooks/usePontosConfig';
import { useToast } from '../contexts/ToastContext';
import ToggleSwitch from './common/ToggleSwitch';

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

const Input: React.FC<{ 
  defaultValue?: string; 
  type?: string; 
  value?: string; 
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  placeholder?: string; 
  step?: string;
  min?: string;
  max?: string;
}> = ({ defaultValue, type = "text", value, onChange, placeholder, step, min, max }) => (
    <input 
      type={type} 
      defaultValue={defaultValue} 
      value={value} 
      onChange={onChange} 
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500" 
    />
);

const PontosPage: React.FC = () => {
    const toast = useToast();
    const {
        config,
        loading,
        error,
        loadConfig,
        updateConfig,
        clearError
    } = usePontosConfig();

    // Estados para Sistema de Pontos
    const [pontosAtivo, setPontosAtivo] = useState(false);
    const [pontosPorReal, setPontosPorReal] = useState(1.0);
    const [reaisPorPontos, setReaisPorPontos] = useState(10.0);
    const [pontosValidadeMeses, setPontosValidadeMeses] = useState(12);

    // Estado de loading específico
    const [savingSettings, setSavingSettings] = useState(false);

    // Carregar configurações ao montar o componente
    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    // Sincronizar estados locais com configurações carregadas
    useEffect(() => {
        if (config) {
            setPontosAtivo(config.pontos_ativo || false);
            setPontosPorReal(config.pontos_por_real || 1.0);
            setReaisPorPontos(config.reais_por_pontos || 10.0);
            setPontosValidadeMeses(config.pontos_validade_meses || 12);
        }
    }, [config]);

    // ✅ AÇÃO 2.3: Handlers com validação e formatação
    const handlePontosPorRealChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '') {
            setPontosPorReal(0.01);
            return;
        }
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0.01 && numValue <= 100) {
            setPontosPorReal(numValue);
        }
    };

    const handleReaisPorPontosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '') {
            setReaisPorPontos(1);
            return;
        }
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 1 && numValue <= 1000) {
            setReaisPorPontos(Math.floor(numValue));
        }
    };

    const handleValidadeMesesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '') {
            setPontosValidadeMeses(1);
            return;
        }
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue >= 1 && numValue <= 60) {
            setPontosValidadeMeses(numValue);
        }
    };

    // ✅ AÇÃO 2.3: Função de formatação de pontos (SEMPRE inteiro)
    const formatarPontos = (valor: number): string => {
        return Math.floor(valor).toString();
    };

    // Função para salvar configurações de pontos
    const handleSavePointsSettings = async () => {
        setSavingSettings(true);
        clearError();

        try {
            await updateConfig({
                pontos_ativo: pontosAtivo,
                pontos_por_real: pontosPorReal,
                reais_por_pontos: reaisPorPontos,
                pontos_validade_meses: pontosValidadeMeses
            });

            toast.success('Pontos Salvos!', 'Configurações do Sistema de Pontos foram atualizadas com sucesso.');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao salvar configurações de pontos';
            toast.error('Erro ao Salvar', errorMessage);
        } finally {
            setSavingSettings(false);
        }
    };

    // Mostrar loading se ainda não carregou as configurações
    if (loading && !config) {
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
            <h1 className="text-3xl font-bold text-gray-800">Pontos</h1>

            {/* Mostrar erro se houver */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    <div className="flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={clearError} className="text-red-500 hover:text-red-700">×</button>
                    </div>
                </div>
            )}

            <Card title="Configuração do Sistema de Pontos">
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
                                            onChange={handlePontosPorRealChange}
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
                                    Exemplo: Se configurar 1.00, um serviço de R$ 50,00 gera {formatarPontos(50 * pontosPorReal)} pontos
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
                                            onChange={handleReaisPorPontosChange}
                                            type="number"
                                            step="1"
                                            min="1"
                                            max="1000"
                                            placeholder="10"
                                        />
                                        <span className="text-sm text-gray-600 whitespace-nowrap">pontos, o cliente ganha R$ 1,00 de desconto</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                                    Exemplo: Se configurar {formatarPontos(reaisPorPontos)}, o cliente precisa de {formatarPontos(100)} pontos para R$ {(100 / reaisPorPontos).toFixed(2)} de desconto
                                </p>
                            </div>
                        </FormRow>

                        <FormRow label="Validade dos Pontos (meses)">
                            <div className="space-y-3">
                                <Input
                                    value={pontosValidadeMeses.toString()}
                                    onChange={handleValidadeMesesChange}
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
                                        <span>Serviço de R$ 100,00 = <strong>{formatarPontos(100 * pontosPorReal)} pontos</strong></span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="mr-2">•</span>
                                        <span>{formatarPontos(reaisPorPontos)} pontos = <strong>R$ 1,00 de desconto</strong></span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="mr-2">•</span>
                                        <span>{formatarPontos(100 * pontosPorReal)} pontos = <strong>R$ {((100 * pontosPorReal) / reaisPorPontos).toFixed(2)} de desconto</strong></span>
                                    </li>
                                </ul>
                            </div>
                        </FormRow>
                    </>
                )}

                <FormRow label="">
                    <p className="text-sm text-gray-600">
                        {pontosAtivo 
                            ? 'Configure as regras acima e clique em "Salvar Configurações" para ativar o sistema de pontos.'
                            : 'Ative o sistema de pontos para permitir que seus clientes acumulem e utilizem pontos como desconto.'}
                    </p>
                </FormRow>
            </Card>

            <div className="pt-2">
                <button
                    onClick={handleSavePointsSettings}
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
                            Salvar Configurações
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default PontosPage;
