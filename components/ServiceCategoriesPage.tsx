import React, { useState } from 'react';
import { Menu, ImagePlaceholder, Plus } from './Icons';

const mockCategories = [
  { id: 10, name: 'CORTE+BARBA+PIGMENTAÇÃO DA BARBA' },
  { id: 11, name: 'CORTE+BARBA+PIGMENTAÇÃO BARBA E CABELO' },
  { id: 12, name: 'ALISAMENTO AMERICANO +CORTE' },
  { id: 13, name: 'ALISAMENTO AMERICANO' },
  { id: 14, name: 'LIMPEZA DE PELE' },
  { id: 1, name: 'CORTE' },
  { id: 2, name: 'CORTE + PIGMENTAÇÃO' },
  { id: 3, name: 'CORTE + BARBA' },
  { id: 4, name: 'BARBA + PIGMENTAÇÃO' },
  { id: 7, name: 'LUZES + CORTE' },
  { id: 8, name: 'BARBA' },
  { id: 9, name: 'BARBOTERAPIA' },
];

const ServiceCategoriesPage: React.FC = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {mockCategories.map(category => (
            <div key={category.id} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-lg border border-gray-200">
              <div className="flex items-center">
                <Menu className="h-5 w-5 text-gray-400 cursor-grab mr-4" />
                <span className="font-medium text-gray-700 tracking-wide text-sm">{category.name}</span>
              </div>
              <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-md border border-gray-200/80">
                IDENTIFICAÇÃO: {category.id}
              </span>
            </div>
        ))}
      </div>
      
      {!isFormOpen && (
        <div
          onClick={() => setIsFormOpen(true)}
          className="w-full flex items-center p-4 border-2 border-dotted border-gray-300 rounded-lg cursor-pointer group hover:border-blue-400 hover:bg-white transition-all duration-200"
        >
          <div className="w-9 h-9 flex items-center justify-center bg-blue-50 rounded-full mr-4 shadow-sm group-hover:bg-blue-100 transition-colors">
            <Plus className="w-5 h-5 text-blue-600" />
          </div>
          <span className="text-blue-600 font-semibold">Criar Nova Categoria</span>
        </div>
      )}

      {isFormOpen && (
        <div className="bg-white p-8 rounded-lg border border-gray-200 transition-all duration-300 ease-in-out">
          <h2 className="text-xl font-semibold text-gray-800 mb-8">Criar Nova Categoria De Servico</h2>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <input type="text" placeholder="Nome Da Categoria" className="w-full bg-gray-50 border border-gray-300/70 text-gray-800 text-sm rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500" />
              <input type="text" placeholder="Breve Descrição" className="w-full bg-gray-50 border border-gray-300/70 text-gray-800 text-sm rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              
            </div>
            <div className="flex items-center gap-4 pt-2">
              <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
                Salvar Categoria
              </button>
              <button onClick={() => setIsFormOpen(false)} className="bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceCategoriesPage;