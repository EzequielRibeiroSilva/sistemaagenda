import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from './Icons';

interface PreviewDatePickerProps {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

const PreviewDatePicker: React.FC<PreviewDatePickerProps> = ({ selectedDate, onDateChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(selectedDate);
    const datePickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    useEffect(() => {
        // If the date picker is opened, sync the view to the selected date's month
        if(isOpen) {
            setViewDate(selectedDate);
        }
    }, [isOpen, selectedDate]);

    const daysOfWeek = ['DO', 'SE', 'TE', 'QU', 'QI', 'SE', 'SA'];

    const getCalendarGrid = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const cells = [];

        // Previous month's days
        for (let i = firstDayOfMonth - 1; i >= 0; i--) {
            cells.push(
                <button
                    key={`prev-${i}`}
                    disabled
                    className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium text-gray-400"
                >
                    {daysInPrevMonth - i}
                </button>
            );
        }

        // Current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const isSelected = selectedDate.getFullYear() === year &&
                               selectedDate.getMonth() === month &&
                               selectedDate.getDate() === day;
            cells.push(
                <button
                    key={day}
                    onClick={() => handleDateClick(day)}
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                        isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'
                    }`}
                >
                    {day}
                </button>
            );
        }
        
        // Next month's days
        const totalCells = cells.length;
        const remainingCells = 42 - totalCells; // 6 rows * 7 columns = 42

        for (let i = 1; i <= remainingCells; i++) {
            cells.push(
                <button
                    key={`next-${i}`}
                    disabled
                    className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium text-gray-400"
                >
                    {i}
                </button>
            );
        }
        
        return cells;
    };


    const handleDateClick = (day: number) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        onDateChange(newDate);
        setIsOpen(false);
    };

    const prevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const formatDisplayDate = (date: Date) => {
        return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const formatCalendarHeaderDate = (date: Date) => {
        const month = date.toLocaleString('pt-BR', { month: 'short' });
        const year = date.getFullYear();
        return `${month} ${year}`;
    }

    return (
        <div className="relative" ref={datePickerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 capitalize"
            >
                {formatDisplayDate(selectedDate)}
                <ChevronDown className="h-4 w-4 ml-2 text-gray-500" />
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 p-4">
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={prevMonth} className="p-1 rounded-full hover:bg-gray-100">
                            <ChevronLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <span className="font-semibold text-gray-800 capitalize">
                            {formatCalendarHeaderDate(viewDate)}
                        </span>
                        <button onClick={nextMonth} className="p-1 rounded-full hover:bg-gray-100">
                            <ChevronRight className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs text-blue-600 font-bold mb-2">
                        {daysOfWeek.map(day => <div key={day}>{day}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1 gap-x-1 place-items-center">
                        {getCalendarGrid()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PreviewDatePicker;
