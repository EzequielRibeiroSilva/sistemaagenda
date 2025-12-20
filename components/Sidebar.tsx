
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
// FIX: Removed unused 'BarChart3' import as it is not an exported member of './Icons'.
import {
  Box, Briefcase, Calendar, ChevronDown, Cog, LayoutDashboard,
  Users, ChevronRight, MapPin, Ticket, Bell
} from './Icons';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  isCollapsed: boolean;
  isActive?: boolean;
  hasSubmenu?: boolean;
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, isCollapsed, isActive = false, hasSubmenu = false, onClick }) => (
  <a
    href="#"
    onClick={(e) => {
        e.preventDefault();
        onClick?.();
    }}
    className={`flex items-center py-2.5 px-4 rounded-lg transition-colors duration-200 ${
      isActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
    } ${isCollapsed ? 'lg:justify-center' : ''}`}
  >
    <div>
      {icon}
    </div>
    <span className={`ml-3 font-medium flex-1 whitespace-nowrap ${isCollapsed ? 'lg:hidden' : ''}`}>{label}</span>
    <div className={`${isCollapsed ? 'lg:hidden' : ''}`}>
      {hasSubmenu && <ChevronDown className="h-4 w-4 text-gray-400" />}
    </div>
  </a>
);

interface SidebarProps {
    isCollapsed: boolean;
    setCollapsed: (isCollapsed: boolean) => void;
    activeView: string;
    setActiveView: (view: string) => void;
    userRole: 'ADMIN' | 'AGENTE';
    isOpenOnMobile: boolean;
    setOpenOnMobile: (isOpen: boolean) => void;
    user?: {
        role: string;
        plano?: string;
        userData?: any;
    };
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, setCollapsed, activeView, setActiveView, userRole, isOpenOnMobile, setOpenOnMobile, user }) => {
  const [clientsSubmenuVisible, setClientsSubmenuVisible] = useState(false);
  const clientsNavItemRef = useRef<HTMLDivElement>(null);
  const [submenuPosition, setSubmenuPosition] = useState({ top: 0, left: 0 });
  const hideSubmenuTimeout = useRef<number | null>(null);

  const [servicesSubmenuVisible, setServicesSubmenuVisible] = useState(false);
  const servicesNavItemRef = useRef<HTMLDivElement>(null);
  const [servicesSubmenuPosition, setServicesSubmenuPosition] = useState({ top: 0, left: 0 });
  const hideServicesSubmenuTimeout = useRef<number | null>(null);

  // Função para verificar se deve mostrar o item LOCAIS
  const shouldShowLocais = () => {
    if (!user) return false;

    // MASTER sempre pode ver LOCAIS
    if (user.role === 'MASTER') {
      return true;
    }

    // ✅ CORREÇÃO: ADMIN sempre pode ver LOCAIS (independente do plano)
    // Mesmo com plano Single, o ADMIN precisa gerenciar seu local (editar horários, bloquear, etc.)
    const isAdmin = user.role === 'salon' || user.userData?.role === 'ADMIN';
    if (isAdmin) {
      return true;
    }

    return false;
  };

  const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

  const handleShowClientsSubmenu = () => {
    if (hideSubmenuTimeout.current) {
        clearTimeout(hideSubmenuTimeout.current);
        hideSubmenuTimeout.current = null;
    }
    if (!isCollapsed && clientsNavItemRef.current) {
        const rect = clientsNavItemRef.current.getBoundingClientRect();
        setSubmenuPosition({ top: rect.top - 16, left: rect.right + 8 });
        setClientsSubmenuVisible(true);
    }
  };

  const handleHideClientsSubmenu = () => {
    hideSubmenuTimeout.current = window.setTimeout(() => {
        setClientsSubmenuVisible(false);
    }, 200);
  };

  const handleShowServicesSubmenu = () => {
    if (hideServicesSubmenuTimeout.current) {
        clearTimeout(hideServicesSubmenuTimeout.current);
        hideServicesSubmenuTimeout.current = null;
    }
    if (!isCollapsed && servicesNavItemRef.current) {
        const rect = servicesNavItemRef.current.getBoundingClientRect();
        setServicesSubmenuPosition({ top: rect.top - 16, left: rect.right + 8 });
        setServicesSubmenuVisible(true);
    }
  };

  const handleHideServicesSubmenu = () => {
    hideServicesSubmenuTimeout.current = window.setTimeout(() => {
        setServicesSubmenuVisible(false);
    }, 200);
  };
  
  const clientsSubmenu = (
    <div
        className={`fixed w-56 bg-blue-600 text-white rounded-lg shadow-xl p-4 z-50 transform transition-all duration-200 ease-in-out ${clientsSubmenuVisible && !isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
        style={{ top: `${submenuPosition.top}px`, left: `${submenuPosition.left}px` }}
        onMouseEnter={handleShowClientsSubmenu}
        onMouseLeave={handleHideClientsSubmenu}
      >
        <h3 className="text-xl font-bold opacity-75 mb-3 px-2">Clientes</h3>
        <ul>
            <li>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveView('clients-list'); setClientsSubmenuVisible(false); setOpenOnMobile(false); }} className="block py-2 rounded hover:bg-blue-700 px-2 font-medium">LISTA DE CLIENTES</a>
            </li>
            <li>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveView('clients-add'); setClientsSubmenuVisible(false); setOpenOnMobile(false); }} className="block py-2 rounded hover:bg-blue-700 px-2 font-medium">NOVO CLIENTE</a>
            </li>
        </ul>
    </div>
  );

  const servicesSubmenu = (
    <div
        className={`fixed w-56 bg-blue-600 text-white rounded-lg shadow-xl p-4 z-50 transform transition-all duration-200 ease-in-out ${servicesSubmenuVisible && !isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
        style={{ top: `${servicesSubmenuPosition.top}px`, left: `${servicesSubmenuPosition.left}px` }}
        onMouseEnter={handleShowServicesSubmenu}
        onMouseLeave={handleHideServicesSubmenu}
      >
        <h3 className="text-xl font-bold opacity-75 mb-3 px-2">Serviços</h3>
        <ul>
            <li>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveView('services-list'); setServicesSubmenuVisible(false); setOpenOnMobile(false); }} className="block py-2 rounded hover:bg-blue-700 px-2 font-medium">SERVIÇOS</a>
            </li>
            <li>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveView('services-extra'); setServicesSubmenuVisible(false); setOpenOnMobile(false); }} className="block py-2 rounded hover:bg-blue-700 px-2 font-medium">SERVIÇOS EXTRAS</a>
            </li>
        </ul>
    </div>
  );
  
  const handleNavItemClick = (view: string) => {
    setActiveView(view);
    setOpenOnMobile(false);
  }

  const sidebarContent = (
    <>
      <div className="flex items-center h-16 border-b border-gray-200 px-4 flex-shrink-0">
        {/* Logo Tally - Desktop (lg+) */}
        <button 
          onClick={() => setCollapsed(!isCollapsed)} 
          className={`hidden lg:block focus:outline-none transition-all duration-200 hover:opacity-80 ${isCollapsed ? 'mx-auto' : ''}`}
          aria-label="Toggle sidebar"
        >
          <span 
            className="font-genty text-3xl font-bold tracking-wide"
            style={{ color: '#2663EB' }}
          >
            {isCollapsed ? 'T' : 'Tally'}
          </span>
        </button>
        
        {/* Logo Tally - Mobile */}
        <div className="lg:hidden">
          <span 
            className="font-genty text-3xl font-bold tracking-wide"
            style={{ color: '#2663EB' }}
          >
            Tally
          </span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <NavItem 
            icon={<LayoutDashboard className="h-5 w-5" />} 
            label="DASHBOARD" 
            isCollapsed={isCollapsed}
            isActive={activeView === 'dashboard'}
            onClick={() => handleNavItemClick('dashboard')}
        />
        <NavItem
            icon={<Calendar className="h-5 w-5" />}
            label="CALENDÁRIO"
            isCollapsed={isCollapsed}
            isActive={activeView === 'calendar'}
            onClick={() => handleNavItemClick('calendar')}
        />
        <NavItem
            icon={<Briefcase className="h-5 w-5" />}
            label="COMPROMISSOS"
            isCollapsed={isCollapsed}
            isActive={activeView === 'compromissos'}
            onClick={() => handleNavItemClick('compromissos')}
        />
        
        {userRole === 'ADMIN' && (
            <div
                ref={clientsNavItemRef}
                className="relative"
            >
                <a
                    href="#"
                    onClick={(e) => {
                        e.preventDefault();
                        handleNavItemClick('clients-list');
                    }}
                    onMouseEnter={handleShowClientsSubmenu}
                    onMouseLeave={handleHideClientsSubmenu}
                    className={`flex items-center py-2.5 px-4 rounded-lg transition-colors duration-200 ${
                        activeView.startsWith('clients') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
                    } ${isCollapsed ? 'lg:justify-center' : ''}`}
                >
                    <div>
                        <Users className="h-5 w-5" />
                    </div>
                    <span className={`ml-3 font-medium flex-1 whitespace-nowrap ${isCollapsed ? 'lg:hidden' : ''}`}>CLIENTES</span>
                    <div className={`${isCollapsed ? 'lg:hidden' : ''}`}>
                       <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                </a>
            </div>
        )}
        
        {userRole === 'ADMIN' && (
            <NavItem
              icon={<Ticket className="h-5 w-5" />}
              label="CUPONS"
              isCollapsed={isCollapsed}
              isActive={activeView.startsWith('cupons')}
              onClick={() => handleNavItemClick('cupons-list')}
            />
        )}
        
        {userRole === 'ADMIN' && (
          <>
            <div className={`pt-4 pb-2 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider ${isCollapsed ? 'lg:hidden' : ''}`}>Recursos</div>
            <div className={`w-full border-t border-gray-200 my-2 ${isCollapsed ? 'lg:hidden' : ''}`}></div>

            <div 
                ref={servicesNavItemRef}
                className="relative"
            >
                <a
                    href="#"
                    onClick={(e) => {
                        e.preventDefault();
                        handleNavItemClick('services-list');
                    }}
                    onMouseEnter={handleShowServicesSubmenu}
                    onMouseLeave={handleHideServicesSubmenu}
                    className={`flex items-center py-2.5 px-4 rounded-lg transition-colors duration-200 ${
                        activeView.startsWith('services') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
                    } ${isCollapsed ? 'lg:justify-center' : ''}`}
                >
                    <div>
                        <Box className="h-5 w-5" />
                    </div>
                    <span className={`ml-3 font-medium flex-1 whitespace-nowrap ${isCollapsed ? 'lg:hidden' : ''}`}>SERVIÇOS</span>
                     <div className={`${isCollapsed ? 'lg:hidden' : ''}`}>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                </a>
            </div>
            <NavItem
              icon={<Users className="h-5 w-5" />}
              label="AGENTES"
              isCollapsed={isCollapsed}
              isActive={activeView.startsWith('agents')}
              onClick={() => handleNavItemClick('agents-list')}
            />
            {shouldShowLocais() && (
              <NavItem
                icon={<MapPin className="h-5 w-5" />}
                label="LOCAIS"
                isCollapsed={isCollapsed}
                isActive={activeView.startsWith('locations')}
                onClick={() => handleNavItemClick('locations-list')}
              />
            )}
          </>
        )}

        <div className={`pt-4 pb-2 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider ${isCollapsed ? 'lg:hidden' : ''}`}>Definições</div>
        <div className={`w-full border-t border-gray-200 my-2 ${isCollapsed ? 'lg:hidden' : ''}`}></div>

        {userRole === 'ADMIN' && (
          <NavItem
            icon={<Bell className="h-5 w-5" />}
            label="LEMBRETES"
            isCollapsed={isCollapsed}
            isActive={activeView === 'lembretes'}
            onClick={() => handleNavItemClick('lembretes')}
          />
        )}

        <NavItem 
            icon={<Cog className="h-5 w-5" />} 
            label="DEFINIÇÕES" 
            isCollapsed={isCollapsed}
            isActive={activeView === 'settings' || (userRole === 'AGENTE' && activeView === 'agents-edit')}
            onClick={() => {
                if (userRole === 'AGENTE') {
                    handleNavItemClick('agents-edit');
                } else {
                    handleNavItemClick('settings');
                }
            }}
        />
      </nav>
      {portalRoot && userRole === 'ADMIN' && createPortal(clientsSubmenu, portalRoot)}
      {portalRoot && userRole === 'ADMIN' && createPortal(servicesSubmenu, portalRoot)}
    </>
  );

  return (
    <>
       <div 
        className={`fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden transition-opacity ${isOpenOnMobile ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setOpenOnMobile(false)}
        aria-hidden="true"
      ></div>
       <div
        className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-gray-200 flex flex-col w-64 transition-transform duration-300 ease-in-out lg:relative lg:z-30 lg:translate-x-0 ${
          isOpenOnMobile ? 'translate-x-0' : '-translate-x-full'
        } ${ isCollapsed ? 'lg:w-20' : 'lg:w-64' }`}
      >
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;
