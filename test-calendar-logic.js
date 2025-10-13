// 🧪 Teste da Lógica do Calendário - BookingPage.tsx
// Simula exatamente a lógica implementada

console.log('🧪 TESTE DA LÓGICA DO CALENDÁRIO');
console.log('================================');

// Dados reais do agente (da API)
const salonData = {
  horarios_agentes: [
    { agente_id: 23, dia_semana: 0, ativo: true, periodos: [] }, // Domingo - FOLGA
    { agente_id: 23, dia_semana: 1, ativo: true, periodos: [] }, // Segunda - FOLGA
    { agente_id: 23, dia_semana: 2, ativo: true, periodos: [] }, // Terça - FOLGA
    { agente_id: 23, dia_semana: 3, ativo: true, periodos: [{ inicio: "10:00", fim: "16:00" }] }, // Quarta - TRABALHA
    { agente_id: 23, dia_semana: 4, ativo: true, periodos: [{ inicio: "10:00", fim: "16:00" }] }, // Quinta - TRABALHA
    { agente_id: 23, dia_semana: 5, ativo: true, periodos: [{ inicio: "09:00", fim: "12:00" }, { inicio: "14:00", fim: "16:00" }] }, // Sexta - TRABALHA
    { agente_id: 23, dia_semana: 6, ativo: true, periodos: [] } // Sábado - FOLGA
  ]
};

const selectedAgentId = 23;

// 🔧 LÓGICA CORRIGIDA (implementada no BookingPage.tsx)
const agentWorkingDays = salonData.horarios_agentes
  .filter(h => {
    // Dia deve estar ativo E ter pelo menos um período de trabalho definido
    return h.agente_id === selectedAgentId && 
           h.ativo && 
           h.periodos && 
           h.periodos.length > 0;
  })
  .map(h => h.dia_semana);

console.log('📊 Horários do agente:', salonData.horarios_agentes.filter(h => h.agente_id === selectedAgentId));
console.log('✅ Dias de trabalho (nova lógica):', agentWorkingDays);

// 🗓️ TESTE DO CALENDÁRIO DE OUTUBRO 2025
console.log('\n🗓️ TESTE DO CALENDÁRIO DE OUTUBRO 2025');
console.log('=====================================');

const today = new Date('2025-10-13'); // Data atual (13 de outubro)
today.setHours(0, 0, 0, 0);

const year = 2025;
const month = 9; // Outubro (0-indexed)
const daysInMonth = 31;

const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

console.log('Data atual:', today.toLocaleDateString('pt-BR'));
console.log('Dias de trabalho do agente:', agentWorkingDays.map(d => dayNames[d]).join(', '));

console.log('\n📅 STATUS DOS DIAS:');
console.log('==================');

for (let day = 1; day <= daysInMonth; day++) {
  const date = new Date(year, month, day);
  const dayOfWeek = date.getDay();
  const worksThatDay = agentWorkingDays.includes(dayOfWeek);
  const isPastDate = date < today;
  const isAvailable = date >= today && worksThatDay;

  let status = '';
  let style = '';
  
  if (isPastDate) {
    status = '⏰ PASSADO';
    style = 'CINZA';
  } else if (worksThatDay) {
    status = '✅ DISPONÍVEL';
    style = 'VERDE';
  } else {
    status = '❌ FOLGA';
    style = 'CINZA';
  }

  console.log(`${day.toString().padStart(2, '0')}/10 (${dayNames[dayOfWeek]}): ${status} - ${style}`);
}

console.log('\n🎯 RESUMO ESPERADO:');
console.log('==================');
console.log('🟢 VERDE (disponível): Quartas, quintas e sextas futuras (≥ 13/10)');
console.log('🔘 CINZA (indisponível): Dias passados (1-12/10) + Domingos, segundas, terças e sábados futuros');

// 📊 CONTADORES
const totalDays = daysInMonth;
const pastDays = Array.from({length: daysInMonth}, (_, i) => {
  const date = new Date(year, month, i + 1);
  return date < today;
}).filter(Boolean).length;

const futureDays = totalDays - pastDays;
const futureWorkingDays = Array.from({length: daysInMonth}, (_, i) => {
  const date = new Date(year, month, i + 1);
  const dayOfWeek = date.getDay();
  return date >= today && agentWorkingDays.includes(dayOfWeek);
}).filter(Boolean).length;

const futureOffDays = futureDays - futureWorkingDays;

console.log('\n📊 ESTATÍSTICAS:');
console.log('===============');
console.log(`Total de dias: ${totalDays}`);
console.log(`Dias passados (cinza): ${pastDays}`);
console.log(`Dias futuros: ${futureDays}`);
console.log(`  - Dias de trabalho (verde): ${futureWorkingDays}`);
console.log(`  - Dias de folga (cinza): ${futureOffDays}`);
