
import React, { useState, useRef, useEffect } from 'react';
import { Search, LogOut, Cog } from '../Icons';

interface AdminHeaderProps {
  onLogout: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const AdminHeader: React.FC<AdminHeaderProps> = ({ onLogout, searchQuery, setSearchQuery }) => {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 flex-shrink-0">
      {/* Search bar */}
      <div className="flex items-center w-full max-w-lg">
        <Search className="h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Pesquisar usuários..."
          className="ml-3 w-full bg-transparent focus:outline-none text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* User/Logout section */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!isDropdownOpen)}
          className="flex items-center space-x-3 focus:outline-none rounded-full"
          aria-label="Menu do usuário"
          aria-haspopup="true"
          aria-expanded={isDropdownOpen}
        >
          <img
            src="https://picsum.photos/id/1027/200/200"
            alt="Admin Avatar"
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
                // Placeholder for settings
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
  );
};

export default AdminHeader;
