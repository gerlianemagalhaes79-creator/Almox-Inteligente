import * as React from 'react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Package, 
  X, 
  Plus, 
  Copy, 
  Trash2, 
  Sparkles, 
  CheckCircle2, 
  Building2, 
  Check, 
  Layers,
  Search,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { Item, Transaction } from '../types';

export interface BulkEntryItem {
  id: string;
  name: string;
  initial_quantity: number | string;
  min_quantity: number | string;
  batch_number: string;
  expiry_date: string;
  is_indeterminate_expiry?: boolean;
  unit_price: number | string;
  unit_measure: string;
  medication_type?: string;
}

export interface BulkEntryState {
  supplier: string;
  category: string;
  origin: 'contract' | 'extra' | 'donation';
  room: string;
  items: BulkEntryItem[];
}

export interface BulkEntryModalProps {
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
  bulkEntry: BulkEntryState;
  setBulkEntry: React.Dispatch<React.SetStateAction<BulkEntryState>>;
  categories: string[];
  handleAddItem: (e: React.FormEvent) => void;
  addBulkItemRow: () => void;
  duplicateBulkItem: (id: string) => void;
  removeBulkItemRow: (id: string) => void;
  updateBulkItem: (id: string, field: string, value: any) => void;
  items?: Item[];
  transactions?: Transaction[];
}

interface SupplierMemoryItem {
  name: string;
  normalized: string;
  count: number;
}

interface MaterialMemoryItem {
  name: string;
  normalized: string;
  category: string;
  unit_measure: string;
  unit_price: number;
  min_quantity?: number;
  supplier?: string;
  totalStock: number;
  batchesCount: number;
}

interface UnitOption {
  code: string;
  label: string;
  normalized: string;
  count: number;
}

const DEFAULT_UNITS = [
  { code: 'UN', label: 'Unidade (UN)' },
  { code: 'CX', label: 'Caixa (CX)' },
  { code: 'PCT', label: 'Pacote (PCT)' },
  { code: 'FR', label: 'Frasco (FR)' },
  { code: 'AMP', label: 'Ampola (AMP)' },
  { code: 'BSN', label: 'Bisnaga (BSN)' },
  { code: 'ENV', label: 'Envelope (ENV)' },
  { code: 'GL', label: 'Galão (GL)' },
  { code: 'L', label: 'Litro (L)' },
  { code: 'ML', label: 'Mililitro (ML)' },
  { code: 'KG', label: 'Quilograma (KG)' },
  { code: 'G', label: 'Grama (G)' },
  { code: 'RL', label: 'Rolo (RL)' },
  { code: 'CRT', label: 'Cartela (CRT)' },
  { code: 'PAR', label: 'Par (PAR)' },
  { code: 'TB', label: 'Tubo (TB)' },
  { code: 'KIT', label: 'Kit (KIT)' },
  { code: 'M', label: 'Metro (M)' },
  { code: 'POT', label: 'Pote (POT)' },
  { code: 'DOS', label: 'Dose (DOS)' },
  { code: 'FD', label: 'Fardo (FD)' },
  { code: 'SC', label: 'Saco (SC)' },
  { code: 'BOB', label: 'Bobina (BOB)' },
  { code: 'CT', label: 'Cento (CT)' }
];

const normalize = (str: string | null | undefined): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

export const BulkEntryModal: React.FC<BulkEntryModalProps> = ({
  showAddModal,
  setShowAddModal,
  bulkEntry,
  setBulkEntry,
  categories,
  handleAddItem,
  addBulkItemRow,
  duplicateBulkItem,
  removeBulkItemRow,
  updateBulkItem,
  items = [],
  transactions = []
}) => {
  // Autocomplete UI states
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [activeMaterialDropdownRowId, setActiveMaterialDropdownRowId] = useState<string | null>(null);
  const [activeUnitDropdownRowId, setActiveUnitDropdownRowId] = useState<string | null>(null);

  const supplierContainerRef = useRef<HTMLDivElement>(null);
  const materialDropdownRefs = useRef<{ [rowId: string]: HTMLDivElement | null }>({});
  const unitDropdownRefs = useRef<{ [rowId: string]: HTMLDivElement | null }>({});

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (supplierContainerRef.current && !supplierContainerRef.current.contains(target)) {
        setShowSupplierDropdown(false);
      }
      if (activeMaterialDropdownRowId) {
        const matRef = materialDropdownRefs.current[activeMaterialDropdownRowId];
        if (matRef && !matRef.contains(target)) {
          setActiveMaterialDropdownRowId(null);
        }
      }
      if (activeUnitDropdownRowId) {
        const unitRef = unitDropdownRefs.current[activeUnitDropdownRowId];
        if (unitRef && !unitRef.contains(target)) {
          setActiveUnitDropdownRowId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMaterialDropdownRowId, activeUnitDropdownRowId]);

  // Build supplier memory (sorted by frequency of use)
  const supplierMemory = useMemo<SupplierMemoryItem[]>(() => {
    const counts: { [key: string]: { name: string; count: number } } = {};

    // Count from items
    items.forEach(i => {
      if (!i.supplier) return;
      const trimmed = i.supplier.trim();
      if (!trimmed) return;
      const key = normalize(trimmed);
      if (!counts[key]) {
        counts[key] = { name: trimmed, count: 0 };
      }
      counts[key].count += 1;
    });

    // Count from transactions
    transactions.forEach(t => {
      if (!t.supplier) return;
      const trimmed = t.supplier.trim();
      if (!trimmed) return;
      const key = normalize(trimmed);
      if (!counts[key]) {
        counts[key] = { name: trimmed, count: 0 };
      }
      counts[key].count += 1;
    });

    return Object.entries(counts)
      .map(([key, val]) => ({
        name: val.name,
        normalized: key,
        count: val.count
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [items, transactions]);

  // Build material memory (distinct materials aggregated from items & transactions)
  const materialMemory = useMemo<MaterialMemoryItem[]>(() => {
    const map: { [key: string]: MaterialMemoryItem } = {};

    items.forEach(i => {
      if (!i.name || i.deletedAt) return;
      const trimmed = i.name.trim();
      if (!trimmed) return;
      const key = normalize(trimmed);

      if (!map[key]) {
        map[key] = {
          name: trimmed.toUpperCase(),
          normalized: key,
          category: i.category || 'Outros',
          unit_measure: i.unit_measure || 'Unidade (UN)',
          unit_price: Number(i.unit_price) || 0,
          min_quantity: i.min_quantity,
          supplier: i.supplier || undefined,
          totalStock: Number(i.quantity) || 0,
          batchesCount: 1
        };
      } else {
        map[key].totalStock += Number(i.quantity) || 0;
        map[key].batchesCount += 1;
        if (!map[key].unit_price && i.unit_price) {
          map[key].unit_price = Number(i.unit_price);
        }
        if (!map[key].min_quantity && i.min_quantity) {
          map[key].min_quantity = i.min_quantity;
        }
        if (!map[key].supplier && i.supplier) {
          map[key].supplier = i.supplier;
        }
      }
    });

    // Check transactions for any historical materials not currently in stock
    transactions.forEach(t => {
      if (!t.item_name) return;
      const trimmed = t.item_name.trim();
      if (!trimmed) return;
      const key = normalize(trimmed);
      if (!map[key]) {
        map[key] = {
          name: trimmed.toUpperCase(),
          normalized: key,
          category: 'Outros',
          unit_measure: 'Unidade (UN)',
          unit_price: 0,
          supplier: t.supplier || undefined,
          totalStock: 0,
          batchesCount: 0
        };
      }
    });

    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, transactions]);

  // Build unit of measure memory (standard units + any units found in existing items)
  const unitMemory = useMemo<UnitOption[]>(() => {
    const counts: { [key: string]: number } = {};

    items.forEach(i => {
      if (!i.unit_measure) return;
      const trimmed = i.unit_measure.trim();
      if (!trimmed) return;
      const norm = normalize(trimmed);
      counts[norm] = (counts[norm] || 0) + 1;
    });

    const resultMap = new Map<string, UnitOption>();

    DEFAULT_UNITS.forEach(u => {
      const norm = normalize(u.label);
      const normCode = normalize(u.code);
      const count = counts[norm] || counts[normCode] || 0;
      resultMap.set(norm, {
        code: u.code,
        label: u.label,
        normalized: norm,
        count
      });
    });

    items.forEach(i => {
      if (!i.unit_measure) return;
      const trimmed = i.unit_measure.trim();
      if (!trimmed) return;
      const norm = normalize(trimmed);
      if (!resultMap.has(norm)) {
        const codeMatch = trimmed.match(/\(([^)]+)\)/);
        const code = codeMatch ? codeMatch[1].toUpperCase() : trimmed.slice(0, 4).toUpperCase();
        resultMap.set(norm, {
          code,
          label: trimmed,
          normalized: norm,
          count: counts[norm] || 1
        });
      }
    });

    return Array.from(resultMap.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [items]);

  // Filter supplier suggestions based on user input
  const filteredSuppliers = useMemo(() => {
    const query = normalize(bulkEntry.supplier);
    if (!query) {
      // Return top 8 frequent suppliers when field is empty
      return supplierMemory.slice(0, 8);
    }
    return supplierMemory
      .filter(s => s.normalized.includes(query))
      .slice(0, 8);
  }, [bulkEntry.supplier, supplierMemory]);

  // Check if current supplier is an exact match or has a near match
  const supplierStatus = useMemo(() => {
    const trimmed = bulkEntry.supplier.trim();
    if (!trimmed) return null;
    const query = normalize(trimmed);

    const exactMatch = supplierMemory.find(s => s.normalized === query);
    if (exactMatch) {
      return { type: 'exact' as const, match: exactMatch };
    }

    const closeMatch = supplierMemory.find(s => 
      s.normalized.includes(query) || query.includes(s.normalized)
    );
    if (closeMatch) {
      return { type: 'close' as const, match: closeMatch };
    }

    return { type: 'new' as const };
  }, [bulkEntry.supplier, supplierMemory]);

  // Helper to handle material selection from memory
  const handleSelectMaterial = (rowId: string, item: MaterialMemoryItem) => {
    // 1. Update row name to exact registered name
    updateBulkItem(rowId, 'name', item.name);

    // 2. Auto-fill unit_measure if row has default or empty
    const currentRow = bulkEntry.items.find(r => r.id === rowId);
    if (currentRow) {
      if (item.unit_measure && (!currentRow.unit_measure || currentRow.unit_measure === 'Unidade (UN)')) {
        updateBulkItem(rowId, 'unit_measure', item.unit_measure);
      }
      if (item.unit_price && (!currentRow.unit_price || Number(currentRow.unit_price) === 0)) {
        updateBulkItem(rowId, 'unit_price', item.unit_price);
      }
      if (item.min_quantity && (isNaN(Number(currentRow.min_quantity)) || Number(currentRow.min_quantity) === 0)) {
        updateBulkItem(rowId, 'min_quantity', item.min_quantity);
      }
    }

    // 3. If bulk category is generic and material has a specific category, auto-adjust category
    if (item.category && item.category !== 'Outros' && (bulkEntry.category === 'Expediente' || !bulkEntry.category)) {
      setBulkEntry(prev => ({ ...prev, category: item.category }));
    }

    // 4. If bulk supplier is empty and material has known supplier, auto-fill supplier
    if (!bulkEntry.supplier.trim() && item.supplier) {
      setBulkEntry(prev => ({ ...prev, supplier: item.supplier! }));
    }

    setActiveMaterialDropdownRowId(null);
  };

  if (!showAddModal) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-3xl max-w-5xl w-full p-6 lg:p-8 shadow-2xl max-h-[90vh] flex flex-col border border-slate-200 transition-all duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-2.5 rounded-2xl shadow-md shadow-blue-500/20">
              <Package size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">Nova Entrada de Materiais</h3>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <Sparkles size={11} className="text-emerald-600" />
                  Memória Anti-Duplicidade Ativa
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sugestão automática de materiais e fornecedores cadastrados para prevenir duplicidades.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowAddModal(false)}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleAddItem} className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
          {/* General Entry Details */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
            {/* Fornecedor with Memory Suggestions */}
            <div className="relative" ref={supplierContainerRef}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-700">Fornecedor</label>
                {supplierMemory.length > 0 && (
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.2 rounded-md border border-blue-100 flex items-center gap-1">
                    <Building2 size={10} />
                    {supplierMemory.length} em memória
                  </span>
                )}
              </div>

              <div className="relative">
                <input 
                  type="text"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all pr-8"
                  placeholder="Ex: Distribuidora Med"
                  value={bulkEntry.supplier}
                  onFocus={() => setShowSupplierDropdown(true)}
                  onChange={e => {
                    setBulkEntry(prev => ({ ...prev, supplier: e.target.value }));
                    setShowSupplierDropdown(true);
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowSupplierDropdown(prev => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
                  title="Ver fornecedores em memória"
                >
                  <Search size={14} />
                </button>
              </div>

              {/* Status Indicator beneath Supplier input */}
              {supplierStatus && (
                <div className="mt-1.5">
                  {supplierStatus.type === 'exact' && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                      Fornecedor cadastrado na memória ({supplierStatus.match.count} registros)
                    </div>
                  )}
                  {supplierStatus.type === 'close' && supplierStatus.match.name !== bulkEntry.supplier && (
                    <div className="flex items-center justify-between gap-1 text-[10px] font-medium text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      <span className="truncate">
                        💡 Evite duplicar: <strong>{supplierStatus.match.name}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkEntry(prev => ({ ...prev, supplier: supplierStatus.match.name }));
                          setShowSupplierDropdown(false);
                        }}
                        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[9px] shrink-0 cursor-pointer"
                      >
                        Usar
                      </button>
                    </div>
                  )}
                  {supplierStatus.type === 'new' && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 px-1">
                      <Sparkles size={10} className="text-blue-500 shrink-0" />
                      Novo fornecedor (será salvo na memória)
                    </div>
                  )}
                </div>
              )}

              {/* Floating Supplier Suggestions Dropdown */}
              {showSupplierDropdown && filteredSuppliers.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden py-1.5 max-h-56 overflow-y-auto animate-in fade-in-50 duration-150">
                  <div className="px-3 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between bg-slate-50 border-b border-slate-100">
                    <span>Fornecedores na Memória</span>
                    <span>Registros</span>
                  </div>
                  {filteredSuppliers.map(s => {
                    const isSelected = normalize(bulkEntry.supplier) === s.normalized;
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => {
                          setBulkEntry(prev => ({ ...prev, supplier: s.name }));
                          setShowSupplierDropdown(false);
                        }}
                        className={`w-full px-3.5 py-2 text-left text-xs font-bold flex items-center justify-between hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50/70 text-blue-700 font-black' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Building2 size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{s.name}</span>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                          {s.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Categoria Geral */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">Categoria Geral</label>
              <select 
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                value={bulkEntry.category}
                onChange={e => setBulkEntry(prev => ({ ...prev, category: e.target.value }))}
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Origem */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">Origem</label>
              <select 
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                value={bulkEntry.origin}
                onChange={e => setBulkEntry(prev => ({ ...prev, origin: e.target.value as any }))}
              >
                <option value="contract">Contrato</option>
                <option value="extra">Extra</option>
                <option value="donation">Doação</option>
              </select>
            </div>

            {/* Local / Sala */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">Local / Sala</label>
              <input 
                type="text"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500/20"
                placeholder="Ex: Almoxarifado Principal"
                value={bulkEntry.room}
                onChange={e => setBulkEntry(prev => ({ ...prev, room: e.target.value }))}
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm text-slate-800">Itens da Entrada ({bulkEntry.items.length})</h4>
                <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">
                  {materialMemory.length} materiais cadastrados na memória
                </span>
              </div>
              <button 
                type="button"
                onClick={addBulkItemRow}
                className="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-200/80 px-3 py-1.5 rounded-xl hover:bg-blue-100 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus size={15} /> Adicionar Linha
              </button>
            </div>

            <div className="space-y-4">
              {bulkEntry.items.map((row, index) => {
                const rowQuery = normalize(row.name);
                
                // Matches from memory for this row
                const rowSuggestions = rowQuery
                  ? materialMemory
                      .filter(m => m.normalized.includes(rowQuery))
                      .slice(0, 8)
                  : materialMemory.slice(0, 6);

                // Check exact match and close matches
                const exactMatch = rowQuery ? materialMemory.find(m => m.normalized === rowQuery) : null;
                const closeMatch = (!exactMatch && rowQuery.length >= 3)
                  ? materialMemory.find(m => m.normalized.includes(rowQuery) || rowQuery.includes(m.normalized))
                  : null;

                const isDropdownOpen = activeMaterialDropdownRowId === row.id;

                const rowUnitQuery = normalize(row.unit_measure);
                const rowUnitSuggestions = rowUnitQuery
                  ? unitMemory.filter(u => u.normalized.includes(rowUnitQuery) || normalize(u.code).includes(rowUnitQuery)).slice(0, 10)
                  : unitMemory.slice(0, 10);
                const isUnitDropdownOpen = activeUnitDropdownRowId === row.id;

                return (
                  <div key={row.id} className="p-4.5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3 relative hover:border-slate-300 transition-all">
                    {/* Row Header Bar */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                          #{index + 1}
                        </span>
                        {exactMatch && (
                          <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <CheckCircle2 size={11} /> Item Registrado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          type="button"
                          onClick={() => duplicateBulkItem(row.id)}
                          className="text-slate-500 hover:text-blue-700 p-1.5 rounded-lg hover:bg-slate-100 text-xs flex items-center gap-1 font-bold cursor-pointer transition-all"
                          title="Duplicar linha"
                        >
                          <Copy size={13} /> Duplicar
                        </button>
                        {bulkEntry.items.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => removeBulkItemRow(row.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 text-xs cursor-pointer transition-all"
                            title="Remover linha"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Form Fields Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      {/* Nome do Material with Autocomplete & Duplicate Prevention */}
                      <div 
                        className="md:col-span-2 relative" 
                        ref={el => { materialDropdownRefs.current[row.id] = el; }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                            Nome do Material *
                          </label>
                          <span className="text-[9px] font-bold text-blue-600 flex items-center gap-0.5">
                            <Sparkles size={9} /> Sugestões
                          </span>
                        </div>

                        <div className="relative">
                          <input 
                            type="text"
                            required
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase"
                            placeholder="Digite o nome ou selecione..."
                            value={row.name}
                            onFocus={() => setActiveMaterialDropdownRowId(row.id)}
                            onChange={e => {
                              updateBulkItem(row.id, 'name', e.target.value);
                              setActiveMaterialDropdownRowId(row.id);
                            }}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={() => setActiveMaterialDropdownRowId(prev => prev === row.id ? null : row.id)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
                            title="Ver catálogo de materiais"
                          >
                            <Search size={13} />
                          </button>
                        </div>

                        {/* Duplicate Alert / Success Indicator */}
                        {exactMatch && (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200/80">
                            <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                            <span>Material existente na memória (saldo atual: {exactMatch.totalStock} {exactMatch.unit_measure})</span>
                          </div>
                        )}

                        {!exactMatch && closeMatch && (
                          <div className="mt-1 flex items-center justify-between gap-1 text-[10px] font-medium text-amber-900 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                            <span className="truncate">
                              💡 Já existe: <strong>{closeMatch.name}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSelectMaterial(row.id, closeMatch)}
                              className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[9px] shrink-0 cursor-pointer"
                              title="Usar este nome para evitar duplicação"
                            >
                              Usar este
                            </button>
                          </div>
                        )}

                        {!exactMatch && !closeMatch && row.name.trim() !== '' && (
                          <div className="mt-1 flex items-center gap-1 text-[9.5px] text-slate-500 px-1">
                            <Sparkles size={10} className="text-blue-500 shrink-0" />
                            Novo material (será catalogado na memória)
                          </div>
                        )}

                        {/* Floating Material Autocomplete Dropdown */}
                        {isDropdownOpen && rowSuggestions.length > 0 && (
                          <div className="absolute z-40 left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden py-1 max-h-64 overflow-y-auto animate-in fade-in-50 duration-150 min-w-[280px]">
                            <div className="px-3 py-1 text-[9.5px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between bg-slate-50 border-b border-slate-100">
                              <span>Materiais Cadastrados</span>
                              <span>Estoque</span>
                            </div>
                            {rowSuggestions.map(mat => {
                              const isCurrent = rowQuery === mat.normalized;
                              return (
                                <button
                                  key={mat.name}
                                  type="button"
                                  onClick={() => handleSelectMaterial(row.id, mat)}
                                  className={`w-full px-3 py-2 text-left flex flex-col gap-1 hover:bg-blue-50/80 transition-colors border-b border-slate-50 last:border-b-0 cursor-pointer ${
                                    isCurrent ? 'bg-blue-50 text-blue-700 font-black' : 'text-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-extrabold truncate text-slate-900">
                                      {mat.name}
                                    </span>
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                      mat.totalStock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {mat.totalStock} {mat.unit_measure || 'un'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[9.5px] text-slate-500">
                                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold">
                                      {mat.category}
                                    </span>
                                    {mat.unit_price > 0 && (
                                      <span>• R$ {mat.unit_price.toFixed(2)}</span>
                                    )}
                                    {mat.supplier && (
                                      <span className="truncate">• {mat.supplier}</span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Quantidade */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Qtd *</label>
                        <input 
                          type="number"
                          min="1"
                          required
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-blue-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                          value={row.initial_quantity}
                          onChange={e => updateBulkItem(row.id, 'initial_quantity', Number(e.target.value))}
                        />
                      </div>

                      {/* Qtd Mínima */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Qtd Mínima</label>
                        <input 
                          type="number"
                          min="0"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                          placeholder="Auto (8 sem)"
                          value={isNaN(Number(row.min_quantity)) ? '' : row.min_quantity}
                          onChange={e => updateBulkItem(row.id, 'min_quantity', e.target.value === '' ? NaN : Number(e.target.value))}
                        />
                      </div>

                      {/* Valor Unit. */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Valor Unit. (R$)</label>
                        <input 
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                          placeholder="0.00"
                          value={row.unit_price}
                          onChange={e => updateBulkItem(row.id, 'unit_price', Number(e.target.value))}
                        />
                      </div>

                      {/* Unidade with Autocomplete & Suggestions Dropdown */}
                      <div 
                        className="relative" 
                        ref={el => { unitDropdownRefs.current[row.id] = el; }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                            Unidade *
                          </label>
                          <span className="text-[9px] font-bold text-blue-600 flex items-center gap-0.5">
                            <Sparkles size={9} /> Opções
                          </span>
                        </div>

                        <div className="relative">
                          <input 
                            type="text"
                            required
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all pr-7"
                            placeholder="UN, CX, PCT..."
                            value={row.unit_measure || ''}
                            onFocus={() => setActiveUnitDropdownRowId(row.id)}
                            onChange={e => {
                              updateBulkItem(row.id, 'unit_measure', e.target.value);
                              setActiveUnitDropdownRowId(row.id);
                            }}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={() => setActiveUnitDropdownRowId(prev => prev === row.id ? null : row.id)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
                            title="Ver opções de unidade"
                          >
                            <ChevronDown size={14} className={`transition-transform duration-150 ${isUnitDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                          </button>
                        </div>

                        {/* Quick chips below input for frequent units */}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {['UN', 'CX', 'PCT', 'FR', 'AMP'].map(code => {
                            const isSelected = (row.unit_measure || '').toUpperCase().includes(code);
                            const matchingOpt = unitMemory.find(u => u.code === code) || { label: code };
                            return (
                              <button
                                key={code}
                                type="button"
                                onClick={() => {
                                  updateBulkItem(row.id, 'unit_measure', matchingOpt.label);
                                  setActiveUnitDropdownRowId(null);
                                }}
                                className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border transition-all cursor-pointer ${
                                  isSelected 
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' 
                                    : 'bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border-slate-200/80'
                                }`}
                                title={`Selecionar ${matchingOpt.label}`}
                              >
                                {code}
                              </button>
                            );
                          })}
                        </div>

                        {/* Floating Units Dropdown */}
                        {isUnitDropdownOpen && rowUnitSuggestions.length > 0 && (
                          <div className="absolute z-50 left-auto right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden py-1 max-h-56 overflow-y-auto animate-in fade-in-50 duration-150 min-w-[210px]">
                            <div className="px-3 py-1 text-[9.5px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between bg-slate-50 border-b border-slate-100">
                              <span>Opções de Unidade</span>
                              <span>Código</span>
                            </div>
                            {rowUnitSuggestions.map(u => {
                              const isCurrent = normalize(row.unit_measure) === u.normalized || normalize(row.unit_measure) === normalize(u.code);
                              return (
                                <button
                                  key={u.label}
                                  type="button"
                                  onClick={() => {
                                    updateBulkItem(row.id, 'unit_measure', u.label);
                                    setActiveUnitDropdownRowId(null);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-blue-50/80 transition-colors border-b border-slate-50 last:border-b-0 cursor-pointer ${
                                    isCurrent ? 'bg-blue-50 text-blue-700 font-black' : 'text-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="text-xs font-bold truncate">{u.label}</span>
                                    {u.count > 0 && (
                                      <span className="text-[9px] text-slate-400 font-medium">({u.count})</span>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                                    {u.code}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Batch Number & Expiry */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nº Lote</label>
                        <input 
                          type="text"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500/20 uppercase"
                          placeholder="Lote / Referência"
                          value={row.batch_number}
                          onChange={e => updateBulkItem(row.id, 'batch_number', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Validade</label>
                        <input 
                          type="date"
                          disabled={row.is_indeterminate_expiry}
                          className={`w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 ${row.is_indeterminate_expiry ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-50'}`}
                          value={row.expiry_date}
                          onChange={e => updateBulkItem(row.id, 'expiry_date', e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <input 
                          type="checkbox"
                          id={`indet-${row.id}`}
                          checked={row.is_indeterminate_expiry}
                          onChange={e => updateBulkItem(row.id, 'is_indeterminate_expiry', e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <label htmlFor={`indet-${row.id}`} className="text-xs font-bold text-slate-600 cursor-pointer">
                          Validade Indeterminada
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <Sparkles size={14} className="text-indigo-600" />
              <span>O sistema aprende novos nomes automaticamente a cada entrada confirmada.</span>
            </div>

            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 rounded-2xl text-slate-600 font-bold hover:bg-slate-100 text-sm transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white rounded-2xl font-black text-sm hover:from-blue-800 hover:to-indigo-950 shadow-lg shadow-blue-900/20 transition-all cursor-pointer flex items-center gap-2"
              >
                <Check size={16} /> Salvar Entrada
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
