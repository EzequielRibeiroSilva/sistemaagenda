import { useMemo } from 'react';

interface UnitSchedule {
  dia_semana: number;
  is_aberto: boolean;
  horarios_json: Array<{
    inicio: string;
    fim: string;
  }>;
}

interface TimelineCalculations {
  startHour: number;
  endHour: number;
  hours: number[];
  timeToPercentage: (time: string) => number;
  getSlotStyle: (start: number, end: number) => { left: string; width: string };
  getAppointmentCardStyle: (startTime: string, endTime: string) => { left: string; width: string };
}

const matchesDiaSemana = (recordDiaSemana: number, date: Date): boolean => {
  const jsDay = date.getDay();
  const oneToSeven = jsDay === 0 ? 7 : jsDay;
  return recordDiaSemana === jsDay || recordDiaSemana === oneToSeven;
};

export const useTimelineCalculations = (
  selectedLocation: string,
  unitSchedules: Record<string, UnitSchedule[]>,
  selectedDate: Date
): TimelineCalculations => {
  const { startHour, endHour } = useMemo(() => {
    if (selectedLocation && selectedLocation !== 'all' && unitSchedules[selectedLocation]) {
      const schedules = unitSchedules[selectedLocation];
      const daySchedule = schedules.find(s => matchesDiaSemana(s.dia_semana, selectedDate));
      
      if (daySchedule && daySchedule.is_aberto && Array.isArray(daySchedule.horarios_json) && daySchedule.horarios_json.length > 0) {
        let minHour = 23;
        let maxHour = 0;
        
        daySchedule.horarios_json.forEach(periodo => {
          const startH = parseInt(periodo.inicio.split(':')[0]);
          const endH = parseInt(periodo.fim.split(':')[0]);
          
          if (startH < minHour) minHour = startH;
          if (endH > maxHour) maxHour = endH;
        });
        
        return { startHour: minHour, endHour: maxHour };
      }
    }
    
    return { startHour: 9, endHour: 21 };
  }, [selectedLocation, unitSchedules, selectedDate]);

  const hours = useMemo(() => {
    const hourCount = endHour - startHour + 1;
    return Array.from({ length: hourCount }, (_, i) => i + startHour);
  }, [startHour, endHour]);

  const timeToPercentage = (time: string): number => {
    if (!time || typeof time !== 'string') return 0;
    
    const parts = time.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || '0', 10);
    
    if (isNaN(h) || isNaN(m)) return 0;
    
    const totalMinutes = (h - startHour) * 60 + m;
    const totalDurationMinutes = (endHour - startHour) * 60;
    
    if (totalDurationMinutes <= 0) return 0;
    
    return (totalMinutes / totalDurationMinutes) * 100;
  };

  const getSlotStyle = (start: number, end: number) => {
    const totalHours = endHour - startHour;
    const left = ((start - startHour) / totalHours) * 100;
    const width = ((end - start) / totalHours) * 100;
    return { left: `${left}%`, width: `${width}%` };
  };

  const getAppointmentCardStyle = (startTime: string, endTime: string) => {
    const left = timeToPercentage(startTime);
    const right = timeToPercentage(endTime);
    const width = right - left;
    
    const minWidthPx = 60;
    
    return { 
      left: `${left}%`, 
      width: `max(${width}%, ${minWidthPx}px)`
    };
  };

  return {
    startHour,
    endHour,
    hours,
    timeToPercentage,
    getSlotStyle,
    getAppointmentCardStyle
  };
};
