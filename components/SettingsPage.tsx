

import React, { useState } from 'react';
import { Copy, Check, MessageSquare, Eye } from './Icons';

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
    <h2 className="text-xl font-bold text-gray-800 mb-6">{title}</h2>
    {children}
  </div>
);

const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="grid grid-cols-3 gap-4 items-center py-3 border-b border-gray-100 last:border-b-0">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="col-span-2">{children}</div>
    </div>
);

const Input: React.FC<{ defaultValue?: string, type?: string, value?: string, onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder?: string }> = ({ defaultValue, type = "text", value, onChange, placeholder }) => (
    <input type={type} defaultValue={defaultValue} value={value} onChange={onChange} placeholder={placeholder} className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500" />
);

const ToggleSwitch: React.FC<{ enabled: boolean; setEnabled: (enabled: boolean) => void }> = ({ enabled, setEnabled }) => (
    <button
        type="button"
        className={`${enabled ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled(!enabled)}
    >
        <span
            aria-hidden="true"
            className={`${enabled ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
    </button>
);

interface SettingsPageProps {
  onShowPreview: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onShowPreview }) => {
    const [copied, setCopied] = useState(false);
    const [allowCancellation, setAllowCancellation] = useState(true);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [businessName, setBusinessName] = useState('Salão do Eduardo');
    const [businessLogo, setBusinessLogo] = useState('https://picsum.photos/id/1027/200/200');

    const bookingLink = `${window.location.origin}/reservar?salao=123`;

    const handleCopy = () => {
      navigator.clipboard.writeText(bookingLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };
    
    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onloadend = () => {
          setBusinessLogo(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Definições</h1>
      
      <Card title="Link do Cliente">
          <FormRow label="Seu link de agendamento">
              <div className="flex items-center gap-2">
                  <input
                      type="text"
                      readOnly
                      value={bookingLink}
                      className="w-full bg-gray-100 border border-gray-300 text-gray-600 text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                      onClick={handleCopy}
                  />
                  <button
                      onClick={handleCopy}
                      className={`flex items-center justify-center px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors w-32 ${
                          copied ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                  >
                      {copied ? (
                          <>
                              <Check className="w-4 h-4 mr-2" />
                              Copiado!
                          </>
                      ) : (
                          <>
                              <Copy className="w-4 h-4 mr-2" />
                              Copiar
                          </>
                      )}
                  </button>
                  <a
                    href={bookingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Visualizar
                  </a>
                   <button
                    onClick={onShowPreview}
                    className="flex items-center justify-center px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Ver
                  </button>
              </div>
          </FormRow>
      </Card>

      <Card title="Informações do Negócio">
          <FormRow label="Logo do Negócio">
              <div className="flex items-center gap-4">
                  <img src={businessLogo} alt="Logo do Negócio" className="w-16 h-16 rounded-full object-cover bg-gray-200" />
                  <label htmlFor="logo-upload" className="cursor-pointer bg-white text-gray-700 border border-gray-300 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                      Alterar
                  </label>
                  <input id="logo-upload" type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
              </div>
          </FormRow>
          <FormRow label="Nome do Negócio">
              <Input 
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
              />
          </FormRow>
      </Card>

      <Card title="Compromissos e Definições">
          <FormRow label="Duração do Serviço (Horas)">
              <Input defaultValue="1" type="number" />
          </FormRow>
          <FormRow label="Tempo limite para agendar (Horas)">
              <Input defaultValue="2" type="number" />
          </FormRow>
          <FormRow label="Permitir que os clientes a cancelar suas reservas">
              <ToggleSwitch enabled={allowCancellation} setEnabled={setAllowCancellation} />
          </FormRow>
          {allowCancellation && (
              <FormRow label="Tempo limite para cancelar (Horas)">
                  <Input defaultValue="4" type="number" />
              </FormRow>
          )}
          <FormRow label="Período para Agendamentos Futuros (dias)">
              <Input defaultValue="365" type="number" />
          </FormRow>
      </Card>

      <Card title="Acesso">
        <FormRow label="Nova Senha">
            <Input 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha"
            />
        </FormRow>
        <FormRow label="Confirmar Nova Senha">
            <Input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirme a nova senha"
            />
        </FormRow>
      </Card>

      <Card title="Suporte">
        <p className="text-sm text-gray-600 mb-4">
            Precisa de ajuda ou tem alguma dúvida? Nossa equipe de suporte está pronta para te atender. Clique no botão abaixo para iniciar uma conversa via WhatsApp.
        </p>
        <a
            href="https://wa.me/5585912345678"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors"
        >
            <MessageSquare className="w-5 h-5" />
            Contatar Suporte via WhatsApp
        </a>
      </Card>

      <div className="pt-2">
          <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
              Salvar Definições
          </button>
      </div>
    </div>
  );
};

export default SettingsPage;
