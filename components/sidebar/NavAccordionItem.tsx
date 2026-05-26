import React, { useEffect, useId, useMemo, useState } from 'react';

import type { SidebarItem } from '../../config/sidebarConfig';
import { ChevronDown } from '../Icons';

interface NavAccordionItemProps {
  item: SidebarItem;
  currentView: string;
  isCollapsed: boolean;
  onNavigate: (view: string) => void;
}

export const NavAccordionItem: React.FC<NavAccordionItemProps> = ({
  item,
  currentView,
  isCollapsed,
  onNavigate
}) => {
  const submenuId = useId();

  const isChildActive = useMemo(() => {
    if (!item.children || item.children.length === 0) return false;
    return item.children.some((child) => child.view === currentView);
  }, [item.children, currentView]);

  const isParentActive = currentView === item.view || isChildActive;

  const [isOpen, setIsOpen] = useState<boolean>(isChildActive);

  useEffect(() => {
    if (isChildActive) {
      setIsOpen(true);
    }
  }, [isChildActive]);

  const Icon = item.icon;
  const hasChildren = !!item.children?.length;

  const handleParentClick = () => {
    if (hasChildren) {
      setIsOpen((prev) => !prev);
      return;
    }

    onNavigate(item.view);
  };

  const handleChildClick = (view: string) => {
    onNavigate(view);
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleParentClick}
        className={`w-full flex items-center py-2.5 px-4 rounded-lg transition-colors duration-200 text-left ${
          isParentActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
        } ${isCollapsed ? 'lg:justify-center' : ''}`}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-controls={hasChildren ? submenuId : undefined}
      >
        {Icon ? (
          <span className="shrink-0">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}

        <span className={`ml-3 font-medium flex-1 whitespace-nowrap ${isCollapsed ? 'lg:hidden' : ''}`}>
          {item.label}
        </span>

        {hasChildren && !isCollapsed ? (
          <span
            className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
            aria-hidden="true"
          >
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </span>
        ) : null}
      </button>

      {hasChildren && !isCollapsed ? (
        <div
          id={submenuId}
          className={`ml-4 overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
        >
          <div className="space-y-1 py-1">
            {item.children?.map((child) => {
              const isActive = child.view === currentView;

              return (
                <button
                  key={child.view}
                  type="button"
                  onClick={() => handleChildClick(child.view)}
                  className={`w-full text-left flex items-center py-2 px-3 rounded-md transition-colors duration-200 ${
                    isActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  <span className="text-sm font-medium">{child.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
