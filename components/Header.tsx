
import React, { useState, useRef, useEffect } from 'react';
import { Search, MessageSquare, LineChart, Gift, Plus, Cog, LogOut } from './Icons';
import NewAppointmentModal from './NewAppointmentModal';
import SearchResults from './SearchResults';

interface HeaderProps {
  onLogout: () => void;
  setActiveView: (view: string) => void;
  onEditAgent: (agentId: string) => void;
  onEditService: (serviceId: string) => void;
  userRole: 'salon' | 'agent';
}

const Header: React.FC<HeaderProps> = ({ onLogout, setActiveView, onEditAgent, onEditService, userRole }) => {
  const [isModalOpen, setModalOpen] = useState(false);
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  const handleAddNewAppointment = () => {
    setIsSearchFocused(false);
    setSearchQuery('');
    setModalOpen(true);
  };

  const handleSelectAgent = (agentId: string) => {
    setIsSearchFocused(false);
    setSearchQuery('');
    onEditAgent(agentId);
  };

  const handleSelectService = (serviceId: string) => {
    setIsSearchFocused(false);
    setSearchQuery('');
    onEditService(serviceId);
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 flex-shrink-0">
        <div className="relative flex-1" ref={searchContainerRef}>
            <div className="flex items-center w-full max-w-lg">
                <Search className="h-5 w-5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Comece a digitar para localizar reservas, clientes, agentes ou serviços..."
                    className="ml-3 w-full bg-transparent focus:outline-none text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                />
            </div>
            {isSearchFocused && searchQuery && (
              <SearchResults 
                query={searchQuery} 
                onAddNewAppointment={handleAddNewAppointment}
                onSelectAgent={handleSelectAgent}
                onSelectService={handleSelectService}
              />
            )}
        </div>


        <div className="flex items-center space-x-4">
          
          
          
          <div className="h-6 w-px bg-gray-200"></div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            Novas Reservas
          </button>
          
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!isDropdownOpen)}
              className="focus:outline-none rounded-full"
              aria-label="Menu do usuário"
              aria-haspopup="true"
              aria-expanded={isDropdownOpen}
            >
              <img
                src="https://picsum.photos/id/1027/200/200"
                alt="User Avatar"
                className="h-9 w-9 rounded-full object-cover"
              />
            </button>
            {isDropdownOpen && (
              <div 
                className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200"
                role="menu"
                aria-orientation="vertical"
                aria-labelledby="user-menu-button"
              >
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (userRole === 'agent') {
                      setActiveView('agents-edit');
                    } else {
                      setActiveView('settings');
                    }
                    setDropdownOpen(false);
                  }}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  role="menuitem"
                >
                  <Cog className="w-4 h-4 mr-3" />
                  Definições
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onLogout();
                    setDropdownOpen(false);
                  }}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Sair
                </a>
              </div>
            )}
          </div>
        </div>
      </header>
      <NewAppointmentModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

export default Header;
