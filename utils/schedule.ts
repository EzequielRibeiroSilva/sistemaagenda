/**
 * Utilitários para gerenciamento de horários de funcionamento
 * 
 * Este módulo centraliza a lógica de criação e formatação de horários
 * para unidades/locais e agentes, garantindo consistência em todo o sistema.
 */

// Tipo para representar um dia da semana com seus horários
export interface ScheduleDay {
  dia_semana: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  is_aberto: boolean;
  periodos: { inicio: string; fim: string }[];
}

/**
 * Gera um array padrão de 7 dias da semana, todos fechados
 * 
 * @returns Array com 7 objetos ScheduleDay (Domingo a Sábado), todos com is_aberto: false
 * 
 * @example
 * const schedule = getDefaultSchedule();
 * // Retorna: [
 * //   { dia_semana: 0, is_aberto: false, periodos: [] }, // Domingo
 * //   { dia_semana: 1, is_aberto: false, periodos: [] }, // Segunda
 * //   ...
 * // ]
 */
export const getDefaultSchedule = (): ScheduleDay[] => {
  return Array.from({ length: 7 }, (_, index) => ({
    dia_semana: index,
    is_aberto: false,
    periodos: []
  }));
};

/**
 * Mescla horários parciais do backend com o esqueleto de 7 dias
 * 
 * Garante que o array resultante sempre tenha 7 dias, preenchendo
 * dias ausentes com valores padrão (fechado, sem períodos).
 * 
 * @param horariosDoBackend - Array parcial de horários retornado pela API
 * @returns Array completo com 7 dias, ordenado por dia_semana
 * 
 * @example
 * const parcial = [
 *   { dia_semana: 1, is_aberto: true, periodos: [{inicio: "09:00", fim: "18:00"}] },
 *   { dia_semana: 5, is_aberto: true, periodos: [{inicio: "10:00", fim: "14:00"}] }
 * ];
 * const completo = mergeWithDefaultSchedule(parcial);
 * // Retorna array com 7 dias, onde Segunda e Sexta têm os dados do backend,
 * // e os outros dias estão fechados
 */
export const mergeWithDefaultSchedule = (horariosDoBackend: ScheduleDay[]): ScheduleDay[] => {
  // Criar um mapa para acesso rápido aos dados do backend
  const horariosMap = new Map(horariosDoBackend.map(h => [h.dia_semana, h]));

  // Mesclar com o padrão de 7 dias
  const horariosCompletos = Array.from({ length: 7 }, (_, index) => {
    const diaDoBackend = horariosMap.get(index);
    return diaDoBackend || {
      dia_semana: index,
      is_aberto: false,
      periodos: []
    };
  }).sort((a, b) => a.dia_semana - b.dia_semana);

  return horariosCompletos;
};

/**
 * Formata o payload de horários para envio ao backend
 * 
 * IMPORTANTE: O backend SEMPRE espera 7 dias, mesmo que alguns estejam fechados.
 * Esta função garante que o array está no formato correto.
 * 
 * @param schedule - Array de horários (deve ter 7 elementos)
 * @returns O mesmo array, validado e pronto para envio
 * 
 * @throws Error se o array não tiver exatamente 7 dias
 */
export const formatScheduleForSubmission = (schedule: ScheduleDay[]): ScheduleDay[] => {
  if (schedule.length !== 7) {
    throw new Error(`Horários devem conter exatamente 7 dias. Recebido: ${schedule.length}`);
  }
  
  // Backend espera os 7 dias. Não filtramos dias fechados.
  return schedule;
};

/**
 * Nomes dos dias da semana em português (ordem: Domingo a Sábado)
 */
export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
] as const;

/**
 * Nomes abreviados dos dias da semana
 */
export const DIAS_SEMANA_ABREV = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb'
] as const;
