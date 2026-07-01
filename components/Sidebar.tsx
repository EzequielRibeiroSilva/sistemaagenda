import React from 'react';
// FIX: Removed unused 'BarChart3' import as it is not an exported member of './Icons'.
import {
  Briefcase,
  Calendar,
  Cog,
  LayoutDashboard,
  MapPin,
  Ticket,
  Bell,
  UserPlus,
  Gift,
  Package,
  LineChart,
  Award
} from './Icons';

import { sidebarNavigation, type Role } from '../config/sidebarConfig';
import { NavAccordionItem } from './sidebar/NavAccordionItem';
import { useDespesasVencidasCount } from '../hooks/useDespesasVencidasCount';
import { useCalendarData } from '../hooks/useCalendarData';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  isCollapsed: boolean;
  isActive?: boolean;
  onClick?: () => void;
  badge?: number; // ✨ Novo: suporte para badge de alerta
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, isCollapsed, isActive = false, onClick, badge }) => (
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
    <div>{icon}</div>
    <span className={`ml-3 font-medium flex-1 whitespace-nowrap ${isCollapsed ? 'lg:hidden' : ''}`}>{label}</span>
    {/* 🔔 Badge de Alerta (Red Standard) - Apenas se count > 0 */}
    {badge !== undefined && badge > 0 && (
      <span className={`inline-flex items-center justify-center ml-2 px-2 py-0.5 text-xs font-semibold text-white bg-[#991B1B] rounded-full ${isCollapsed ? 'lg:hidden' : ''}`}>
        {badge > 99 ? '99+' : badge}
      </span>
    )}
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

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  setCollapsed,
  activeView,
  setActiveView,
  userRole,
  isOpenOnMobile,
  setOpenOnMobile
}) => {
  const hasAccess = (allowedRoles?: Role[]) => !allowedRoles || allowedRoles.includes(userRole);

  // 🔔 Hook de contagem de despesas vencidas (Red Standard)
  const { locations } = useCalendarData();
  const selectedLocation = locations && locations.length > 0 ? locations[0] : null;
  const { count: despesasVencidasCount } = useDespesasVencidasCount({
    unidadeId: selectedLocation ? String(selectedLocation.id) : ''
  });

  const isLegacyGroupActive = (view: string, current: string) => {
    if (current === view) return true;

    // Mantém o comportamento legado de highlight durante views de edição
    if (view === 'agents-list') return current.startsWith('agents');
    if (view === 'locations-list') return current.startsWith('locations');
    if (view === 'cupons-list') return current.startsWith('cupons');
    if (view === 'subscriptions-list') return current.startsWith('subscriptions') || current.startsWith('services-subscriptions');

    return false;
  };

  const handleNavItemClick = (view: string) => {
    setActiveView(view);
    setOpenOnMobile(false);
  };

  const sidebarContent = (
    <>
      <div className="flex items-center h-16 border-b border-gray-200 px-4 flex-shrink-0">
        {/* Logo Tally - Desktop (lg+) */}
        <button
          onClick={() => setCollapsed(!isCollapsed)}
          className={`hidden lg:block focus:outline-none transition-all duration-200 hover:opacity-80 ${isCollapsed ? 'mx-auto' : ''}`}
          aria-label="Toggle sidebar"
        >
          <span className="font-genty text-3xl font-bold tracking-wide" style={{ color: '#2663EB' }}>
            {isCollapsed ? 'T' : 'Tally'}
          </span>
        </button>

        {/* Logo Tally - Mobile */}
        <div className="lg:hidden">
          <span className="font-genty text-3xl font-bold tracking-wide" style={{ color: '#2663EB' }}>
            Tally
          </span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {sidebarNavigation.map((category, index) => {
          if (!hasAccess(category.roles)) return null;

          const categoryTopMargin = index === 0 ? 'mt-2' : 'mt-6';

          return (
            <div key={category.title} className="space-y-2">
              {!isCollapsed ? (
                <div className={`text-xs font-semibold text-gray-400 mb-2 px-4 ${categoryTopMargin}`}>{category.title}</div>
              ) : null}

              {category.items.map((item) => {
                if (!hasAccess(item.roles)) return null;

                if (item.children && item.children.length > 0) {
                  return (
                    <NavAccordionItem
                      key={item.view}
                      item={item}
                      currentView={activeView}
                      isCollapsed={isCollapsed}
                      onNavigate={handleNavItemClick}
                    />
                  );
                }

                const Icon = item.icon;

                // Fallback de ícones para manter compatibilidade com config incompleto
                const resolvedIcon = Icon ? (
                  <Icon className="h-5 w-5" />
                ) : item.view === 'dashboard' ? (
                  <LayoutDashboard className="h-5 w-5" />
                ) : item.view === 'calendar' ? (
                  <Calendar className="h-5 w-5" />
                ) : item.view === 'compromissos' ? (
                  <Briefcase className="h-5 w-5" />
                ) : item.view === 'agents-list' ? (
                  <UserPlus className="h-5 w-5" />
                ) : item.view === 'estoque' ? (
                  <Package className="h-5 w-5" />
                ) : item.view === 'despesas' ? (
                  <LineChart className="h-5 w-5" />
                ) : item.view === 'subscriptions-list' ? (
                  <Gift className="h-5 w-5" />
                ) : item.view === 'cupons-list' ? (
                  <Ticket className="h-5 w-5" />
                ) : item.view === 'lembretes' ? (
                  <Bell className="h-5 w-5" />
                ) : item.view === 'pontos' ? (
                  <Award className="h-5 w-5" />
                ) : item.view === 'settings' || item.view === 'agents-edit' ? (
                  <Cog className="h-5 w-5" />
                ) : item.view === 'locations-list' ? (
                  <MapPin className="h-5 w-5" />
                ) : null;

                return (
                  <NavItem
                    key={item.view}
                    icon={resolvedIcon}
                    label={item.label}
                    isCollapsed={isCollapsed}
                    isActive={isLegacyGroupActive(item.view, activeView)}
                    onClick={() => handleNavItemClick(item.view)}
                    badge={item.view === 'despesas' ? despesasVencidasCount : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity ${
          isOpenOnMobile ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ pointerEvents: isOpenOnMobile ? 'auto' : 'none' }}
        onClick={() => setOpenOnMobile(false)}
        aria-hidden="true"
      ></div>
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 flex flex-col w-64 transition-transform duration-300 ease-in-out lg:relative lg:z-30 lg:translate-x-0 ${
          isOpenOnMobile ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;
