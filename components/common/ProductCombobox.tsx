import React, { useEffect, useMemo, useRef, useState } from 'react';

export type ProductComboboxItem = {
  id: number;
  nome: string;
  marca?: string | null;
};

interface ProductComboboxProps {
  label?: string;
  items: ProductComboboxItem[];
  selectedId: string;
  onSelect: (nextId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ProductCombobox: React.FC<ProductComboboxProps> = ({
  label = 'Produto',
  items,
  selectedId,
  onSelect,
  disabled,
  placeholder = 'Busque pelo nome…'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => {
    const idNum = Number(selectedId);
    if (!Number.isFinite(idNum)) return null;
    return items.find((p) => Number(p.id) === idNum) || null;
  }, [items, selectedId]);

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (isOpen) return;
    setQuery('');
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((p) => {
      const nome = String(p.nome || '').toLowerCase();
      const marca = String(p.marca || '').toLowerCase();
      return nome.includes(q) || (marca && marca.includes(q));
    });
  }, [items, query]);

  const displayValue = selected
    ? `${selected.nome}${selected.marca ? ` - ${selected.marca}` : ''}`
    : '';

  return (
    <div ref={containerRef}>
      {label ? <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label> : null}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? query : displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-10 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
          placeholder={placeholder}
          disabled={disabled}
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />

        {selectedId ? (
          <button
            type="button"
            onClick={() => {
              onSelect('');
              setIsOpen(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            disabled={disabled}
            aria-label="Limpar produto selecionado"
          >
            ×
          </button>
        ) : null}

        {isOpen && !disabled ? (
          <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">Nenhum produto encontrado</div>
            ) : (
              filtered.slice(0, 200).map((p) => {
                const labelText = `${p.nome}${p.marca ? ` - ${p.marca}` : ''}`;
                const isSelected = String(p.id) === String(selectedId);

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelect(String(p.id));
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    <div className="font-medium text-gray-800 truncate">{labelText}</div>
                  </button>
                );
              })
            )}

            {filtered.length > 200 ? (
              <div className="p-3 text-xs text-gray-400 border-t border-gray-100">
                Mostrando 200 de {filtered.length} resultados. Refine a busca.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ProductCombobox;
