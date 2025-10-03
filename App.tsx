
import React, { useState } from 'react';
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
import LocationsPage from './components/LocationsPage';
import CreateLocationPage from './components/CreateLocationPage';
import EditLocationPage from './components/EditLocationPage';
import SettingsPage from './components/SettingsPage';
import LoginPage from './components/LoginPage';
import AdminSidebar from './components/admin/AdminSidebar';
import AdminDashboardPage from './components/admin/AdminDashboardPage';
import AdminHeader from './components/admin/AdminHeader';

const App: React.FC = () => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('dashboard');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingExtraServiceId, setEditingExtraServiceId] = useState<string | null>(null);
  const [user, setUser] = useState<{ role: 'none' | 'salon' | 'admin' | 'agent', agentId: string | null }>({ role: 'none', agentId: null });
  const [adminSearchQuery, setAdminSearchQuery] = useState('');

  const handleEditAgent = (agentId: string) => {
    setEditingAgentId(agentId);
    setActiveView('agents-edit');
  };

  const handleEditService = (serviceId: string) => {
    setEditingServiceId(serviceId);
    setActiveView('services-edit');
  };

  const handleEditClient = (clientId: number) => {
    setEditingClientId(clientId);
    setActiveView('clients-edit');
  };

  const handleEditLocation = (locationId: string) => {
    setEditingLocationId(locationId);
    setActiveView('locations-edit');
  };
  
  const handleEditExtraService = (extraServiceId: string) => {
    setEditingExtraServiceId(extraServiceId);
    setActiveView('services-extra-edit');
  };

  const handleLoginSuccess = (email: string) => {
    const lowerEmail = email.toLowerCase();
    if (lowerEmail === 'admin@admin.com') {
      setUser({ role: 'admin', agentId: null });
    } else if (lowerEmail === 'agenteeduardo@email.com') {
      setUser({ role: 'agent', agentId: '1' }); // ID '1' for Eduardo Soares
    }
    else {
      setUser({ role: 'salon', agentId: null });
    }
    setActiveView('dashboard');
  };
  
  const handleLogout = () => {
    setUser({ role: 'none', agentId: null });
  };

  if (user.role === 'none') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }
  
  if (user.role === 'admin') {
    return (
      <div className="flex h-screen bg-gray-100 text-gray-800">
        <AdminSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AdminHeader 
            onLogout={handleLogout} 
            searchQuery={adminSearchQuery}
            setSearchQuery={setAdminSearchQuery}
          />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 lg:p-6">
            <AdminDashboardPage searchQuery={adminSearchQuery} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 text-gray-800">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        setCollapsed={setSidebarCollapsed} 
        activeView={activeView}
        setActiveView={setActiveView}
        userRole={user.role as 'salon' | 'agent'}
        isOpenOnMobile={isMobileSidebarOpen}
        setOpenOnMobile={setMobileSidebarOpen}
      />
      <div className="relative z-20 flex-1 flex flex-col overflow-hidden">
        <Header 
          onLogout={handleLogout} 
          setActiveView={setActiveView} 
          onEditAgent={handleEditAgent}
          onEditService={handleEditService}
          userRole={user.role as 'salon' | 'agent'}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 lg:p-6">
          {activeView === 'dashboard' && <DashboardPage loggedInAgentId={user.agentId} />}
          {activeView === 'calendar' && <CalendarPage loggedInAgentId={user.agentId} />}
          {activeView === 'compromissos' && <AppointmentsPage loggedInAgentId={user.agentId} />}
          {activeView === 'clients-list' && <ClientsPage setActiveView={setActiveView} onEditClient={handleEditClient} />}
          {activeView === 'clients-add' && <AddClientPage />}
          {activeView === 'clients-edit' && <EditClientPage setActiveView={setActiveView} clientId={editingClientId} />}
          {(activeView === 'services-list' || activeView === 'services-extra') && 
            <ServicesPage 
              initialTab={
                activeView === 'services-extra' ? 'Serviços Extras' :
                'Serviços'
              } 
              setActiveView={setActiveView}
              onEditService={handleEditService}
              onEditExtraService={handleEditExtraService}
            />
          }
          {activeView === 'services-create' && <CreateServicePage />}
          {activeView === 'services-edit' && <EditServicePage setActiveView={setActiveView} serviceId={editingServiceId} />}
          {activeView === 'services-extra-create' && <CreateExtraServicePage setActiveView={setActiveView} />}
          {activeView === 'services-extra-edit' && <EditExtraServicePage setActiveView={setActiveView} extraServiceId={editingExtraServiceId} />}
          {activeView === 'agents-list' && <AgentsPage setActiveView={setActiveView} onEditAgent={handleEditAgent} />}
          {activeView === 'agents-create' && <CreateAgentPage setActiveView={setActiveView} />}
          {activeView === 'agents-edit' && <EditAgentPage setActiveView={setActiveView} agentId={user.role === 'agent' ? user.agentId : editingAgentId} />}
          {activeView === 'locations-list' && <LocationsPage setActiveView={setActiveView} onEditLocation={handleEditLocation} />}
          {activeView === 'locations-create' && <CreateLocationPage setActiveView={setActiveView} />}
          {activeView === 'locations-edit' && <EditLocationPage setActiveView={setActiveView} locationId={editingLocationId} />}
          {activeView === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
};

export default App;
