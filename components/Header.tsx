

import React, { useState, useRef, useEffect } from 'react';
import { Search, Menu, Plus, Cog, LogOut, MessageSquare, Inbox, FaUser } from './Icons';
import NewAppointmentModal from './NewAppointmentModal';
import SearchResults from './SearchResults';
import MobileSearchOverlay from './MobileSearchOverlay';
import { useAuth } from '../contexts/AuthContext';
import { getAssetUrl } from '../utils/api';

interface HeaderProps {
  onLogout: () => void;
  setActiveView: (view: string) => void;
  onEditAgent: (agentId: string) => void;
  onEditService: (serviceId: string) => void;
  userRole: 'ADMIN' | 'AGENTE';
  onToggleMobileSidebar: () => void;
  loggedInAgentId: string | null;
}

const Header: React.FC<HeaderProps> = ({ onLogout, setActiveView, onEditAgent, onEditService, userRole, onToggleMobileSidebar, loggedInAgentId }) => {
  const [isModalOpen, setModalOpen] = useState(false);
  const { user } = useAuth();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

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
        
        {/* --- DESKTOP/TABLET HEADER (lg and up) --- */}
        <div className="hidden lg:flex items-center w-full justify-between">
            <div className="relative flex-1 max-w-lg" ref={searchContainerRef}>
                <div className="flex items-center w-full">
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
                    userRole={userRole}
                    loggedInAgentId={loggedInAgentId}
                  />
                )}
            </div>

            <div className="flex items-center space-x-4">
              <div className="h-6 w-px bg-gray-200 "></div>
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors "
              >
                <Plus className="h-5 w-5 mr-2" />
                Novas Reservas
              </button>
              
              {/* Avatar will be rendered outside this div but reuse the logic */}
            </div>
        </div>


        {/* --- MOBILE HEADER (screens smaller than lg) --- */}
        <div className="flex lg:hidden items-center justify-between w-full">
            <button 
              className="p-2 text-blue-600 rounded-md"
              onClick={onToggleMobileSidebar}
              aria-label="Abrir menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="p-2 text-blue-600 rounded-md"
              aria-label="Pesquisar"
            >
              <Search className="h-6 w-6" />
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="p-2 text-blue-600 rounded-md"
            >
              <Plus className="h-6 w-6" />
            </button>
        </div>
        
        {/* --- AVATAR (for all screen sizes) --- */}
        {/* This is separate to work with both layouts */}
        <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!isDropdownOpen)}
              className="focus:outline-none rounded-full"
              aria-label="Menu do usuário"
              aria-haspopup="true"
              aria-expanded={isDropdownOpen}
            >
              {user.avatarUrl ? (
                <img
                  src={getAssetUrl(user.avatarUrl)}
                  alt="User Avatar"
                  className="h-9 w-9 rounded-full object-cover"
                  onError={(e) => {
                    // ✅ CORREÇÃO: Fallback melhorado com logs
                    console.error('❌ Erro ao carregar avatar do usuário:', user.email, user.avatarUrl);
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallbackDiv = target.nextElementSibling as HTMLElement;
                    if (fallbackDiv) {
                      fallbackDiv.classList.remove('hidden');
                    }
                  }}
                />
              ) : null}
              <div className={`h-9 w-9 rounded-full bg-gray-300 flex items-center justify-center ${user.avatarUrl ? 'hidden' : ''}`}>
                <FaUser className="h-5 w-5 text-gray-600" />
              </div>
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
        
      </header>
      <NewAppointmentModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
      {isMobileSearchOpen && (
        <MobileSearchOverlay
          onClose={() => setIsMobileSearchOpen(false)}
          onAddNewAppointment={handleAddNewAppointment}
          onSelectAgent={handleSelectAgent}
          onSelectService={handleSelectService}
          userRole={userRole}
          loggedInAgentId={loggedInAgentId}
        />
      )}
    </>
  );
};

export default Header;
