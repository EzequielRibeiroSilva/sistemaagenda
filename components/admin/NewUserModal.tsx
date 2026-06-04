import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from '../Icons';
import type { AdminUser } from '../../types';

type UserDataPayload = Omit<AdminUser, 'status' | 'id' | 'units' | 'clientCount'> & { id?: number; password?: string };

interface NewUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: UserDataPayload) => void;
  userToEdit: AdminUser | null;
}

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="text-sm font-medium text-gray-700 block mb-1">{children}</label>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
  />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select
        {...props}
        className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
    />
);

const NewUserModal: React.FC<NewUserModalProps> = ({ isOpen, onClose, onSave, userToEdit }) => {
  const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [contact, setContact] = useState('');
  const [plan] = useState<'Single' | 'Multi'>('Single'); // ✅ LOCKED: Sempre 'Single'
  const [unitLimit] = useState(1); // ✅ LOCKED: Sempre 1
  const [iaEnabled, setIaEnabled] = useState(true); // ✅ Feature Flag IA: Default TRUE

  // ✅ Função de formatação de telefone (XX) XXXXX-XXXX
  const formatPhone = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setContact(formatted);
  };

  useEffect(() => {
    if (isOpen) {
      if (userToEdit) {
        setName(userToEdit.name);
        setEmail(userToEdit.email);
        setContact(formatPhone(userToEdit.contact)); // ✅ Formatar telefone ao carregar
        setIaEnabled(userToEdit.iaEnabled ?? true); // ✅ Carregar estado IA do usuário
        setPassword('');
      } else {
        setName('');
        setEmail('');
        setPassword('');
        setContact('');
        setIaEnabled(true); // ✅ Default TRUE para novos usuários
      }
    }
  }, [userToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const userData: UserDataPayload = {
      id: userToEdit?.id,
      name,
      email,
      contact,
      plan,
      unitLimit,
      iaEnabled, // ✅ Enviar estado da IA
    };
    if (password) {
      userData.password = password;
    }
    onSave(userData);
  };

  if (!isOpen || !portalRoot) return null;

  const modalTitle = userToEdit ? 'Editar Usuário' : 'Criar Novo Usuário';

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">{modalTitle}</h2>
            <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <Label>Nome</Label>
            <Input type="text" placeholder="Nome completo do usuário" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" placeholder={userToEdit ? "Deixe em branco para não alterar" : "••••••••"} value={password} onChange={(e) => setPassword(e.target.value)} required={!userToEdit} />
          </div>
          <div>
            <Label>Contato (Telefone)</Label>
            <Input 
              type="tel" 
              placeholder="(00) 00000-0000" 
              value={contact} 
              onChange={handleContactChange}
              maxLength={15}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Plano</Label>
              <Select value={plan} disabled>
                <option value="Single">Single - R$ 99,90/mês</option>
              </Select>
            </div>
            <div>
              <Label>Limite de Unidades</Label>
              <Input type="number" value={unitLimit} disabled />
            </div>
          </div>
          <div>
            <Label>Recepcionista IA</Label>
            <div className="flex items-center gap-3 mt-1">
              <button
                type="button"
                onClick={() => setIaEnabled(!iaEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  iaEnabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
                aria-label="Toggle Recepcionista IA"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    iaEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm font-medium ${iaEnabled ? 'text-blue-700' : 'text-gray-500'}`}>
                {iaEnabled ? 'Habilitada' : 'Desabilitada'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Quando desabilitada, mensagens do WhatsApp não serão processadas pela IA
            </p>
          </div>
        </div>
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
          <button type="button" onClick={onClose} className="bg-white text-gray-700 border border-gray-300 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Salvar Usuário
          </button>
        </div>
      </form>
    </div>,
    portalRoot
  );
};

export default NewUserModal;