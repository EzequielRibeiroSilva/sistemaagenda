

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import CalendarPage from './components/CalendarPage';
import DashboardPage from './components/DashboardPage';
import AppointmentsPage from './components/AppointmentsPage';
import ClientsPage from './components/ClientsPage';
import AddClientPage from './components/AddClientPage';
import EditClientPage from './components/EditClientPage';
import ServicesPage from './components/ServicesPage';
import CreateServicePage from './components/CreateServicePage';
import EditServicePage from './components/EditServicePage';
import CreateExtraServicePage from './components/CreateExtraServicePage';
import EditExtraServicePage from './components/EditExtraServicePage';
import AgentsPage from './components/AgentsPage';
import CreateAgentPage from './components/CreateAgentPage';
import EditAgentPage from './components/EditAgentPage';
import TestAgentsPage from './components/TestAgentsPage';
import LocationsPage from './components/LocationsPage';
import CreateLocationPage from './components/CreateLocationPage';
import EditLocationPage from './components/EditLocationPage';
import SettingsPage from './components/SettingsPage';
import LoginPage from './components/LoginPage';
import AdminSidebar from './components/admin/AdminSidebar';
import AdminDashboardPage from './components/admin/AdminDashboardPage';
import AdminHeader from './components/admin/AdminHeader';
import BookingPage from './components/BookingPage';
import { useMasterUsers } from './hooks/useMasterUsers';
import { useAuth } from './contexts/AuthContext';

const App: React.FC = () => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('dashboard');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [editingExtraServiceId, setEditingExtraServiceId] = useState<string | null>(null);
  const [isPreviewingBookingPage, setIsPreviewingBookingPage] = useState(false);

  // Usar AuthContext
  const { user, isAuthenticated, isLoading, login, logout: authLogout } = useAuth();

  // Limpar estados de edição quando muda de view (mas não quando entra na página de edição)
  useEffect(() => {
    if (activeView !== 'services-extra-edit' && activeView !== 'services-extra') {
      if (editingExtraServiceId) {
        setEditingExtraServiceId(null);
      }
    }
    if (activeView !== 'services-edit' && activeView !== 'services') {
      if (editingServiceId) {
        setEditingServiceId(null);
      }
    }
    if (activeView !== 'agents-edit' && activeView !== 'agents-list') {
      if (editingAgentId) {
        setEditingAgentId(null);
      }
    }
  }, [activeView, editingExtraServiceId, editingServiceId, editingAgentId]);

  // Hook para usuários master (sempre chamado, mas só usado se for MASTER)
  const masterUsersHook = useMasterUsers();

  const handleEditAgent = (agentId: string) => {
    setEditingAgentId(agentId);
    setActiveView('agents-edit');
  };

  const handleEditService = (serviceId: number | string) => {
    setEditingServiceId(String(serviceId));
    setActiveView('services-edit');
  };

  const handleEditClient = (clientId: number) => {
    setEditingClientId(clientId);
    setActiveView('clients-edit');
  };

  const handleEditLocation = (locationId: number) => {
    setEditingLocationId(locationId);
    setActiveView('locations-edit');
  };
  
  const handleEditExtraService = (extraServiceId: string) => {
    setEditingExtraServiceId(extraServiceId);
    setActiveView('services-extra-edit');
  };

  const handleLoginSuccess = (loginData: {
    email: string;
    role: string;
    redirectTo: string;
    permissions: any;
    token: string;
    user: any;
  }) => {


    // Mapear roles do backend para o frontend
    let frontendRole: 'none' | 'salon' | 'admin' | 'agent' | 'MASTER' | 'ADMIN' | 'AGENTE' = 'salon';

    switch (loginData.role) {
      case 'MASTER':
        frontendRole = 'MASTER';
        break;
      case 'ADMIN':
        frontendRole = 'ADMIN';
        break;
      case 'AGENTE':
        frontendRole = 'AGENTE';
        break;
      default:
        frontendRole = 'salon';
    }

    // Usar login do AuthContext
    login(loginData);

    // Definir view inicial baseada no redirectTo
    if (loginData.redirectTo === '/AdminDashboardPage') {
      setActiveView('admin-dashboard');
    } else {
      setActiveView('dashboard');
    }
  };
  
  const handleLogout = async () => {
    if (user.role === 'MASTER') {
      // Para usuários MASTER, usar o logout do hook que chama a API
      await masterUsersHook.logout();
    } else {
      // Para outros usuários, usar logout do AuthContext
      authLogout();
    }
  };

  // Loading Guard - não renderizar nada enquanto está carregando
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Simple Router
  const path = window.location.pathname;

  if (path === '/reservar') {
    return <BookingPage />;
  }

  if (!isAuthenticated || user.role === 'none') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }
  
  // Renderizar AdminDashboardPage para usuários MASTER
  if (user.role === 'MASTER') {
    return (
      <div className="flex h-screen bg-gray-100 text-gray-800">
        <AdminSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AdminHeader
            onLogout={handleLogout}
            searchQuery={user.role === 'MASTER' ? masterUsersHook.searchQuery : ''}
            setSearchQuery={user.role === 'MASTER' ? masterUsersHook.setSearchQuery : (() => {})}
          />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 lg:p-6">
            <AdminDashboardPage searchQuery={masterUsersHook?.searchQuery || ''} />
          </main>
        </div>
      </div>
    );
  }
  
  const renderMainContent = () => {
    if (isPreviewingBookingPage) {
      return <BookingPage isPreview={true} onExitPreview={() => setIsPreviewingBookingPage(false)} />;
    }

    switch (activeView) {
      case 'admin-dashboard': return <AdminDashboardPage searchQuery={user.role === 'MASTER' ? masterUsersHook.searchQuery : ''} />;
      case 'dashboard': return <DashboardPage loggedInAgentId={user.agentId} />;
      case 'calendar': return <CalendarPage loggedInAgentId={user.agentId} userRole={user.role as 'ADMIN' | 'AGENTE'} />;
      case 'compromissos': return <AppointmentsPage loggedInAgentId={user.agentId} />;
      case 'clients-list': return <ClientsPage setActiveView={setActiveView} onEditClient={handleEditClient} />;
      case 'clients-add': return <AddClientPage setActiveView={setActiveView} />;
      case 'clients-edit': return <EditClientPage setActiveView={setActiveView} clientId={editingClientId} />;
      case 'services-list':
      case 'services-extra':
        return <ServicesPage
          initialTab={activeView === 'services-extra' ? 'Serviços Extras' : 'Serviços'}
          setActiveView={setActiveView}
          onEditService={handleEditService}
          onEditExtraService={handleEditExtraService}
        />;
      case 'services-create': return <CreateServicePage setActiveView={setActiveView} />;
      case 'services-edit': return <EditServicePage setActiveView={setActiveView} serviceId={editingServiceId} />;
      case 'services-extra-create': return <CreateExtraServicePage setActiveView={setActiveView} />;
      case 'services-extra-edit': return <EditExtraServicePage setActiveView={setActiveView} extraServiceId={editingExtraServiceId} />;
      case 'agents-list': return <AgentsPage setActiveView={setActiveView} onEditAgent={handleEditAgent} />;
      case 'agents-create': return <CreateAgentPage setActiveView={setActiveView} />;
      case 'agents-edit': return <EditAgentPage setActiveView={setActiveView} agentId={user.role === 'agent' ? user.agentId : editingAgentId} />;
      case 'test-agents': return <TestAgentsPage />;
      case 'locations-list': return <LocationsPage setActiveView={setActiveView} onEditLocation={handleEditLocation} />;
      case 'locations-create': return <CreateLocationPage setActiveView={setActiveView} />;
      case 'locations-edit': return <EditLocationPage setActiveView={setActiveView} locationId={editingLocationId} />;
      case 'settings': return <SettingsPage onShowPreview={() => setIsPreviewingBookingPage(true)} />;
      default: return <DashboardPage loggedInAgentId={user.agentId} />;
    }
  }

  return (
    <div className="flex h-screen bg-gray-100 text-gray-800">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        activeView={activeView}
        setActiveView={setActiveView}
        userRole={user.role as 'ADMIN' | 'AGENTE'}
        isOpenOnMobile={isMobileSidebarOpen}
        setOpenOnMobile={setMobileSidebarOpen}
        user={{
          role: user.role,
          plano: user.userData?.plano,
          userData: user.userData
        }}
      />
      <div className="relative z-20 flex-1 flex flex-col overflow-hidden">
        <Header 
          onLogout={handleLogout} 
          setActiveView={setActiveView} 
          onEditAgent={handleEditAgent}
          onEditService={handleEditService}
          userRole={user.role as 'ADMIN' | 'AGENTE'}
          loggedInAgentId={user.agentId}
          onToggleMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 lg:p-6">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
};

export default App;
