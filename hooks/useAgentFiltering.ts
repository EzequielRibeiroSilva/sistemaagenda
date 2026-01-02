import { useMemo } from 'react';
import type { Agent } from '../types';

interface BackendAgente {
  id: number;
  nome: string;
  sobrenome?: string;
  name?: string;
  nome_exibicao?: string;
  email: string;
  telefone?: string;
  avatar?: string;
  avatar_url?: string;
  horarios_funcionamento?: Array<{
    dia_semana: number;
    unidade_id?: number | null;
    periodos?: Array<{ inicio: string; fim: string }>;
  }>;
}

const getDayOfWeekIndex = (date: Date): number => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

const matchesDiaSemana = (recordDiaSemana: number, date: Date): boolean => {
  const jsDay = date.getDay();
  const oneToSeven = getDayOfWeekIndex(date);
  return recordDiaSemana === jsDay || recordDiaSemana === oneToSeven;
};

const isAgentWorkingOnDay = (agent: BackendAgente, date: Date, unidadeId: string): boolean => {
  if (!agent.horarios_funcionamento || agent.horarios_funcionamento.length === 0) {
    return false;
  }

  const schedule = agent.horarios_funcionamento.find(h => {
    const dayMatch = matchesDiaSemana(h.dia_semana, date);
    const unidadeMatch = !h.unidade_id || h.unidade_id.toString() === unidadeId;
    return dayMatch && unidadeMatch;
  });

  if (!schedule) {
    return false;
  }

  if (!schedule.periodos || schedule.periodos.length === 0) {
    return false;
  }

  return true;
};

export const useAgentFiltering = (
  agents: Agent[],
  selectedLocation: string,
  selectedDate: Date,
  backendAgentes: BackendAgente[]
): Agent[] => {
  const backendAgentesById = useMemo(() => {
    const map: Record<string, BackendAgente> = {};
    backendAgentes.forEach(a => {
      map[a.id.toString()] = a;
    });
    return map;
  }, [backendAgentes]);

  const displayedAgents = useMemo(() => {
    if (!selectedLocation || selectedLocation === 'all' || agents.length === 0) {
      return [];
    }

    const locationIdStr = selectedLocation.toString();
    const locationIdNum = parseInt(locationIdStr);
    
    const filtered = agents.filter(agent => {
      const unidadesRaw: any[] = Array.isArray(agent.unidades) ? (agent.unidades as any[]) : [];
      const unidadesStr = unidadesRaw.map(u => u?.toString?.() ?? String(u));
      const hasUnidadesArray = unidadesStr.length > 0;

      const hasLocation = unidadesStr.includes(locationIdStr) ||
        (!Number.isNaN(locationIdNum) && unidadesStr.includes(locationIdNum.toString()));

      const legacyUnidadeId = (agent as any).unidade_id;
      const hasLegacyLocation = !hasUnidadesArray && legacyUnidadeId != null && legacyUnidadeId.toString() === locationIdStr;

      const backendAgent = backendAgentesById[agent.id];
      
      const hasAnyScheduleForUnit = (() => {
        if (!backendAgent?.horarios_funcionamento || backendAgent.horarios_funcionamento.length === 0) {
          return false;
        }

        return backendAgent.horarios_funcionamento.some(h => {
          const unidadeMatch = !h.unidade_id || h.unidade_id.toString() === locationIdStr;
          const hasPeriods = Array.isArray(h.periodos) && h.periodos.length > 0;
          return unidadeMatch && hasPeriods;
        });
      })();

      const worksTodayInUnit = backendAgent
        ? isAgentWorkingOnDay(backendAgent, selectedDate, locationIdStr)
        : false;

      return (hasLocation || hasLegacyLocation) && hasAnyScheduleForUnit && worksTodayInUnit;
    });

    return filtered;
  }, [agents, selectedLocation, selectedDate, backendAgentesById]);

  return displayedAgents;
};
