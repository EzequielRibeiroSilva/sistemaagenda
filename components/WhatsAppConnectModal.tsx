import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from './Icons';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrcodeBase64: string | null;
  statusText: string;
  connectedNumber?: string | null;
  loading?: boolean;
  onRetry?: () => void;
  debugLastFetchAt?: number | null;
  debugLastRaw?: any;
}

const WhatsAppConnectModal: React.FC<WhatsAppConnectModalProps> = ({
  isOpen,
  onClose,
  qrcodeBase64,
  statusText,
  connectedNumber,
  loading,
  onRetry,
  debugLastFetchAt,
  debugLastRaw
}) => {
  const portalRoot = document.getElementById('portal-root');
  const qrContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => {
      qrContainerRef.current?.scrollIntoView({ block: 'nearest' });
    }, 50);
  }, [isOpen]);

  if (!isOpen || !portalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Conectar WhatsApp</h2>
            <p className="text-sm text-gray-600">Status: {statusText}{connectedNumber ? ` • ${connectedNumber}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-100" aria-label="Fechar">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4" ref={qrContainerRef}>
          <div className="text-sm text-gray-700">
            Abra o WhatsApp no celular, vá em <strong>Dispositivos Conectados</strong> e escaneie o QR Code.
          </div>

          {loading && (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              Gerando QR Code...
            </div>
          )}

          {qrcodeBase64 ? (
            <div className="flex items-center justify-center">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <img
                  src={qrcodeBase64}
                  alt="QR Code WhatsApp"
                  className="w-64 h-64 object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
              Nenhum QR Code disponível no momento.
            </div>
          )}

          {onRetry && (
            <div className="flex justify-end">
              <button
                onClick={onRetry}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Gerar novo QR
              </button>
            </div>
          )}

          {process.env.NODE_ENV === 'development' && (debugLastFetchAt || debugLastRaw) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700">
              <div className="font-semibold mb-1">Debug</div>
              <div>Último poll: {debugLastFetchAt ? new Date(debugLastFetchAt).toLocaleTimeString('pt-BR') : '-'}</div>
              <pre className="mt-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">{debugLastRaw ? JSON.stringify(debugLastRaw, null, 2) : ''}</pre>
            </div>
          )}
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default WhatsAppConnectModal;
