import type React from 'react';

import {
  LayoutDashboard,
  Calendar,
  Briefcase,
  Users,
  UserPlus,
  Package,
  LineChart,
  Gift,
  Ticket,
  Bell,
  Cog,
  MapPin,
  Box,
  Award
} from '../components/Icons';

export type Role = 'ADMIN' | 'AGENTE' | 'MASTER';

export interface SidebarItem {
  label: string;
  icon?: React.ElementType;
  view: string;
  roles?: Role[];
  children?: SidebarItem[];
}

export interface SidebarCategory {
  title: string;
  roles?: Role[];
  items: SidebarItem[];
}

export const sidebarNavigation: SidebarCategory[] = [
  {
    title: 'DIA A DIA',
    items: [
      { label: 'PAINEL', icon: LayoutDashboard, view: 'dashboard' },
      { label: 'AGENDA', icon: Calendar, view: 'calendar' },
      { label: 'LISTA DE RESERVAS', icon: Briefcase, view: 'compromissos' },
      {
        label: 'CLIENTES',
        icon: Users,
        view: 'clients',
        roles: ['ADMIN'],
        children: [
          { label: 'Lista de Clientes', view: 'clients-list' },
          { label: 'Novo Cliente', view: 'clients-add' }
        ]
      }
    ]
  },
  {
    title: 'GESTÃO',
    roles: ['ADMIN'],
    items: [
      { label: 'EQUIPE', icon: UserPlus, view: 'agents-list' },
      {
        label: 'SERVIÇOS',
        icon: Box,
        view: 'services',
        children: [
          { label: 'Lista de Serviços', view: 'services-list' },
          { label: 'Serviços Extras', view: 'services-extra' }
        ]
      },
      { label: 'UNIDADE', icon: MapPin, view: 'locations-list', roles: ['ADMIN'] },
      { label: 'ESTOQUE', icon: Package, view: 'estoque' }
    ]
  },
  {
    title: 'FINANCEIRO',
    roles: ['ADMIN'],
    items: [{ label: 'VISÃO GERAL / CAIXAS', icon: LineChart, view: 'despesas' }]
  },
  {
    title: 'MARKETING / VENDAS',
    roles: ['ADMIN'],
    items: [
      { label: 'CLUBE', icon: Gift, view: 'subscriptions-list' },
      { label: 'CUPONS', icon: Ticket, view: 'cupons-list' },
      { label: 'PONTOS', icon: Award, view: 'pontos' }
    ]
  },
  {
    title: 'SISTEMA',
    items: [
      { label: 'AVISOS', icon: Bell, view: 'lembretes', roles: ['ADMIN'] },
      { label: 'CONFIGURAÇÕES', icon: Cog, view: 'settings', roles: ['ADMIN'] },
      { label: 'CONFIGURAÇÕES', icon: Cog, view: 'agents-edit', roles: ['AGENTE'] }
    ]
  }
];
