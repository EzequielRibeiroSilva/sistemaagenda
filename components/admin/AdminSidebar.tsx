import React from 'react';
import { Users, Menu } from '../Icons';

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
}> = ({ icon, label, isActive = false }) => (
  <a
    href="#"
    onClick={(e) => e.preventDefault()}
    className={`flex items-center py-2.5 px-4 rounded-lg transition-colors duration-200 ${
      isActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
    }`}
  >
    {icon}
    <span className="ml-3 font-medium flex-1">{label}</span>
  </a>
);

const AdminSidebar: React.FC = () => {
  return (
    <div className="relative z-30 bg-white border-r border-gray-200 flex flex-col w-64">
      <div className="flex items-center justify-center h-16 border-b border-gray-200 px-4 flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-800">PAINEL ADMIN</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <NavItem 
            icon={<Users className="h-5 w-5" />} 
            label="USUÁRIOS" 
            isActive={true}
        />
      </nav>
    </div>
  );
};

export default AdminSidebar;
