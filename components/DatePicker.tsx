import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from './Icons';

interface DatePickerProps {
    mode?: 'single' | 'range';
    selectedDate?: Date;
    selectedRange?: { startDate: Date | null; endDate: Date | null };
    onDateChange: (date: Date | { startDate: Date | null; endDate: Date | null }) => void;
}

const DatePicker: React.FC<DatePickerProps> = ({ mode = 'range', selectedDate, selectedRange, onDateChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    // State for range selection
    const [startDate, setStartDate] = useState<Date | null>(() => {
        return selectedRange?.startDate || null;
    });
    const [endDate, setEndDate] = useState<Date | null>(() => {
        return selectedRange?.endDate || null;
    });

    // State for view navigation
    const [viewDate, setViewDate] = useState(() => {
        if (selectedDate) return selectedDate;
        if (selectedRange && selectedRange.startDate) return selectedRange.startDate;
        return new Date();
    });

    const datePickerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Calcular posição do dropdown quando abrir
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const calendarWidth = mode === 'range' ? 600 : 288; // w-[600px] ou w-72 (288px)
            
            // Calcular posição ideal (alinhado à direita do botão)
            let leftPosition = rect.right - calendarWidth;
            
            // Verificar se ultrapassa o limite esquerdo da tela
            if (leftPosition < 8) {
                leftPosition = 8; // Margem mínima de 8px da borda esquerda
            }
            
            // Verificar se ultrapassa o limite direito da tela
            if (leftPosition + calendarWidth > window.innerWidth - 8) {
                leftPosition = window.innerWidth - calendarWidth - 8; // Margem mínima de 8px da borda direita
            }
            
            setDropdownPosition({
                top: rect.bottom + 8,
                left: leftPosition
            });
        }
    }, [isOpen, mode]);

    useEffect(() => {
        if (isOpen) {
            if (selectedDate) {
                setViewDate(selectedDate);
            } else if (selectedRange && selectedRange.startDate) {
                setViewDate(selectedRange.startDate);
            } else {
                setViewDate(new Date());
            }

            if (mode === 'range') {
                setStartDate(selectedRange?.startDate || null);
                setEndDate(selectedRange?.endDate || null);
            }
        }
    }, [isOpen, selectedDate, selectedRange, mode]);
    
    const handleDateClick = (day: number, month: number, year: number) => {
        const clickedDate = new Date(year, month, day);
        if (mode === 'single') {
            onDateChange(clickedDate);
            setIsOpen(false);
        } else { // range mode
            if (!startDate || (startDate && endDate)) {
                setStartDate(clickedDate);
                setEndDate(null);
            } else if (startDate && !endDate) {
                if (clickedDate < startDate) {
                    setEndDate(startDate);
                    setStartDate(clickedDate);
                } else {
                    setEndDate(clickedDate);
                }
            }
        }
    };

    const handleApply = () => {
        if (mode === 'range') {
            onDateChange({ startDate, endDate });
            setIsOpen(false);
        }
    };

    const handleCancel = () => {
        if (mode === 'range') {
            setStartDate(selectedRange?.startDate || null);
            setEndDate(selectedRange?.endDate || null);
        }
        setIsOpen(false);
    };
    
    const prevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };
    
    const nextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };
    
    const formatDisplay = () => {
        if (mode === 'single' && selectedDate) {
            return selectedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        if (mode === 'range') {
            // ✅ MELHORIA: Mostrar período selecionado ao invés de "Período"
            if (selectedRange?.startDate && selectedRange?.endDate) {
                const startFormatted = selectedRange.startDate.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                const endFormatted = selectedRange.endDate.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                return `${startFormatted} à ${endFormatted}`;
            }
            return 'Período';
        }

        return 'Selecione a data';
    };

    const renderCalendar = (month: number, year: number) => {
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];

        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-start-${i}`} className="w-8 h-8 md:w-10 md:h-10"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const currentDate = date.getTime();

            const isSelected = mode === 'single' && selectedDate?.getTime() === currentDate;
            const isSelectedStart = mode === 'range' && startDate && date.getTime() === startDate.getTime();
            const isSelectedEnd = mode === 'range' && endDate && date.getTime() === endDate.getTime();
            const isInRange = mode === 'range' && startDate && endDate && date > startDate && date < endDate;

            let classes = "w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full cursor-pointer transition-colors text-sm ";
            if (isSelected || isSelectedStart || isSelectedEnd) {
                classes += "bg-blue-600 text-white font-bold";
            } else if (isInRange) {
                classes += "bg-blue-100 text-blue-800";
            } else {
                classes += "hover:bg-gray-100 text-gray-700";
            }
            
            days.push(
                <div key={day} className="flex justify-center" onClick={() => handleDateClick(day, month, year)}>
                    <div className={classes}>{day}</div>
                </div>
            );
        }

        const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        const daysOfWeek = ['DO', 'SE', 'TE', 'QU', 'QI', 'SE', 'SA'];

        return (
            <div className="p-4">
                <div className="text-center font-semibold mb-4 capitalize">{monthName}</div>
                <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-blue-600 font-bold mb-2">
                    {daysOfWeek.map(day => <div key={day}>{day}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                    {days}
                </div>
            </div>
        );
    };

    const currentMonth = viewDate.getMonth();
    const currentYear = viewDate.getFullYear();
    const nextCalendarMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextCalendarYear = currentMonth === 11 ? currentYear + 1 : currentYear;

    const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

    const calendarDropdown = isOpen && portalRoot ? (
        <div 
            ref={datePickerRef}
            className={`fixed ${mode === 'range' ? 'w-[600px]' : 'w-72'} bg-white rounded-lg shadow-xl border border-gray-200 z-[100]`}
            style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`
            }}
        >
                    <div className="flex justify-between items-center p-4 border-b">
                        <button onClick={prevMonth} className="p-2 rounded-full hover:bg-gray-100"><ChevronLeft className="h-5 w-5 text-gray-600" /></button>
                        <div className="flex-1 flex justify-around">
                            {/* Month names are now inside renderCalendar */}
                        </div>
                        <button onClick={nextMonth} className="p-2 rounded-full hover:bg-gray-100"><ChevronRight className="h-5 w-5 text-gray-600" /></button>
                    </div>
                    <div className="flex">
                        <div className={mode === 'range' ? 'w-1/2 border-r' : 'w-full'}>{renderCalendar(currentMonth, currentYear)}</div>
                        {mode === 'range' && <div className="w-1/2">{renderCalendar(nextCalendarMonth, nextCalendarYear)}</div>}
                    </div>
                    {mode === 'range' && (
                        <div className="flex justify-end p-4 border-t">
                            <button onClick={handleCancel} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                            <button onClick={handleApply} className="ml-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">Aplicar</button>
                        </div>
                    )}
        </div>
    ) : null;

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 min-w-[160px] justify-between"
            >
                <span>{formatDisplay()}</span>
                <ChevronDown className="h-4 w-4 ml-2 text-gray-500 flex-shrink-0" />
            </button>
            {portalRoot && createPortal(calendarDropdown, portalRoot)}
        </>
    );
};

export default DatePicker;
