import * as React from 'react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Minus,
  Search, 
  Filter, 
  Trash2, 
  Send, 
  CheckCircle2, 
  ShoppingCart, 
  AlertCircle,
  Package,
  Layers,
  ArrowRight,
  Info,
  X,
  Sparkles,
  Check
} from 'lucide-react';
import { Item, MaterialRequest, UserProfile } from '../types';

interface NewRequestTabProps {
  items: Item[];
  categories: string[];
  selectedSector: string;
  setSelectedSector: (s: string) => void;
  allowedSectors: string[];
  userProfile: UserProfile | null;
  isAdmin: boolean;
  canViewStockQuantity?: boolean;
  requestBasket: Array<{ product_id: string, product_name: string, quantity: number }>;
  setRequestBasket: React.Dispatch<React.SetStateAction<Array<{ product_id: string, product_name: string, quantity: number }>>>;
  requestObservation: string;
  setRequestObservation: (obs: string) => void;
  editingRequest: MaterialRequest | null;
  setEditingRequest: (req: MaterialRequest | null) => void;
  onSubmitRequest: () => void;
  onApproveAndDeliverImmediate?: () => void;
  isSubmitting: boolean;
}

interface MaterialGroup {
  name: string;
  category: string;
  totalStock: number;
  unit: string;
  sampleId: string;
}

// Normalizes strings for robust accent-insensitive and case-insensitive matching
const normalize = (str?: string) => 
  (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const NewRequestTab: React.FC<NewRequestTabProps> = ({
  items,
  categories,
  selectedSector,
  setSelectedSector,
  allowedSectors,
  userProfile,
  isAdmin,
  canViewStockQuantity,
  requestBasket,
  setRequestBasket,
  requestObservation,
  setRequestObservation,
  editingRequest,
  setEditingRequest,
  onSubmitRequest,
  onApproveAndDeliverImmediate,
  isSubmitting
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Single active selected material workflow
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialGroup | null>(null);
  const [selectedQty, setSelectedQty] = useState<number>(1);
  const [lastAddedFeedback, setLastAddedFeedback] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Determine if user has permission to see actual stock quantities (Almoxarifado / Patrimônio / Admin)
  const hasStockPermission = useMemo(() => {
    if (canViewStockQuantity !== undefined) return canViewStockQuantity;
    if (isAdmin) return true;
    if (userProfile?.role === 'ADMIN') return true;
    const isAlmoxOrPatrimonio = (s?: string) => {
      if (!s) return false;
      const lower = s.toLowerCase();
      return lower.includes('almoxarifado') || lower.includes('patrimonio') || lower.includes('patrimônio');
    };
    if (isAlmoxOrPatrimonio(userProfile?.sector)) return true;
    if (userProfile?.allowedSectors?.some(s => isAlmoxOrPatrimonio(s))) return true;
    return false;
  }, [canViewStockQuantity, isAdmin, userProfile]);

  // Group active items by name so user sees unified materials with aggregated available stock
  const materialGroups = useMemo<MaterialGroup[]>(() => {
    const active = items.filter(i => !i.deletedAt);
    const map = new Map<string, MaterialGroup>();

    active.forEach(item => {
      const existing = map.get(item.name);
      if (existing) {
        existing.totalStock += (item.quantity || 0);
      } else {
        map.set(item.name, {
          name: item.name,
          category: item.category || 'Geral',
          totalStock: item.quantity || 0,
          unit: item.unit_measure || 'UN',
          sampleId: item.id
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // Map material name to unit measure for convenient display in basket
  const materialUnitMap = useMemo(() => {
    const map = new Map<string, string>();
    materialGroups.forEach(m => {
      map.set(m.name, m.unit);
    });
    return map;
  }, [materialGroups]);

  // Suggested materials: ONLY populated when searchTerm is non-empty and no material is currently selected
  const suggestedMaterials = useMemo(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed || selectedMaterial) {
      return [];
    }

    const normQuery = normalize(trimmed);
    const tokens = normQuery.split(/\s+/).filter(Boolean);

    return materialGroups.filter(mat => {
      // For requesting sectors without stock permissions, only show materials that have stock available to request
      if (!hasStockPermission && mat.totalStock <= 0) {
        return false;
      }
      if (selectedCategory !== 'all' && mat.category !== selectedCategory) {
        return false;
      }

      const normName = normalize(mat.name);
      const normCat = normalize(mat.category);

      return tokens.every(token => normName.includes(token) || normCat.includes(token));
    });
  }, [materialGroups, selectedCategory, searchTerm, hasStockPermission, selectedMaterial]);

  // Auto-focus quantity input when a material is selected
  useEffect(() => {
    if (selectedMaterial && qtyInputRef.current) {
      qtyInputRef.current.focus();
      qtyInputRef.current.select();
    }
  }, [selectedMaterial]);

  // 1. User clicks/selects a suggested material:
  // IMEDIATAMENTE após a seleção, as sugestões desaparecem e o campo de pesquisa é limpo
  const handleSelectMaterial = (material: MaterialGroup) => {
    setSelectedMaterial(material);
    setSelectedQty(1);
    setSearchTerm(''); // Fechar e ocultar todas as outras sugestões imediatamente
  };

  // 2. User confirms quantity:
  // Material enters the basket, selected material clears, search input becomes ready for the next material
  const handleConfirmAddToBasket = () => {
    if (!selectedMaterial || selectedQty <= 0) return;

    const mat = selectedMaterial;
    const qty = selectedQty;

    setRequestBasket(prev => {
      const existingIndex = prev.findIndex(p => p.product_name === mat.name);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + qty
        };
        return next;
      }
      return [...prev, {
        product_id: mat.sampleId,
        product_name: mat.name,
        quantity: qty
      }];
    });

    // Provide immediate feedback
    setLastAddedFeedback(`${mat.name} (${qty} ${mat.unit}) adicionado à cesta!`);
    setTimeout(() => {
      setLastAddedFeedback(null);
    }, 3500);

    // Reset selection and prepare search for the next material
    setSelectedMaterial(null);
    setSelectedQty(1);
    setSearchTerm('');

    // Re-focus search bar
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 100);
  };

  // User cancels selection / wants to pick another
  const handleCancelSelection = () => {
    setSelectedMaterial(null);
    setSelectedQty(1);
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleUpdateBasketQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveBasketItem(index);
      return;
    }
    setRequestBasket(prev => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: newQty };
      return next;
    });
  };

  const handleRemoveBasketItem = (index: number) => {
    setRequestBasket(prev => prev.filter((_, i) => i !== index));
  };

  const isSearchEmpty = searchTerm.trim().length === 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header card */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white p-6 lg:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-200 text-xs font-black uppercase tracking-widest mb-1">
            <Plus size={16} /> Requisição de Materiais
          </div>
          <h2 className="text-xl lg:text-2xl font-black">
            {editingRequest ? `Editando Solicitação #${editingRequest.id.slice(-6).toUpperCase()}` : 'Nova Solicitação de Materiais'}
          </h2>
          <p className="text-xs text-blue-200/80 mt-1 max-w-xl">
            Pesquise um material por vez, defina a quantidade necessária e adicione à cesta. Ao finalizar, envie o pedido ao almoxarifado.
          </p>
        </div>

        {/* Sector display / selector */}
        <div className="bg-white/10 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-white/10 shrink-0">
          <label className="block text-[10px] uppercase font-bold text-blue-200 mb-1">Setor Solicitante</label>
          {isAdmin || (allowedSectors && allowedSectors.length > 1) ? (
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-white text-slate-900 text-xs font-black px-3 py-1.5 rounded-xl focus:outline-none cursor-pointer shadow-sm"
            >
              {(allowedSectors && allowedSectors.length > 0 ? allowedSectors : [selectedSector]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <span className="text-base font-black text-white">{selectedSector}</span>
          )}
        </div>
      </div>

      {/* Feedback banner when item added */}
      {lastAddedFeedback && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 text-emerald-900 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <span className="text-xs sm:text-sm font-extrabold">{lastAddedFeedback}</span>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
            Item incluído na cesta abaixo
          </span>
        </div>
      )}

      {/* Area 1: Prominent Material Search & Autocomplete Suggestions */}
      <div className="bg-white rounded-3xl border-2 border-blue-100 p-5 sm:p-6 lg:p-7 shadow-lg shadow-blue-500/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Search size={20} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-800">
                Pesquisar Material para Solicitação
              </h3>
              <p className="text-xs text-slate-500">
                Digite o nome ou parte do material (ex: agulha, seringa, ácido, luva)
              </p>
            </div>
          </div>
          
          {/* Category filter */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Filter size={14} className="text-slate-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl focus:outline-none cursor-pointer"
            >
              <option value="all">Todas as Categorias</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Evident Search Bar */}
        <div className="relative">
          <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Pesquisar material... (ex: seringa, agulha, ácido, luva)"
            value={searchTerm}
            disabled={Boolean(selectedMaterial)}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className={`w-full pl-12 pr-12 py-4 rounded-2xl text-sm sm:text-base font-semibold placeholder-slate-400 focus:outline-none transition-all ${
              selectedMaterial 
                ? 'bg-slate-100 border-2 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-slate-50 border-2 border-slate-200 hover:border-blue-300 focus:border-blue-600 focus:bg-white text-slate-800 focus:ring-4 focus:ring-blue-500/10 shadow-inner'
            }`}
          />
          {searchTerm && !selectedMaterial && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-all"
              title="Limpar pesquisa"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Step A: Suggestions List - Only shows while typing and before any selection */}
        {!isSearchEmpty && !selectedMaterial && (
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50 shadow-sm animate-in fade-in slide-in-from-top-2 duration-150">
            {suggestedMaterials.length === 0 ? (
              <div className="p-6 text-center text-slate-500 space-y-1.5 bg-white">
                <Package size={28} className="mx-auto text-slate-300" />
                <p className="text-xs font-extrabold text-slate-700">
                  Nenhum material encontrado com o termo "{searchTerm}"
                </p>
                <p className="text-[11px] text-slate-400">
                  Verifique a grafia, digite apenas uma parte do nome ou altere a categoria selecionada.
                </p>
              </div>
            ) : (
              <div>
                <div className="px-4 py-2.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <Sparkles size={14} className="text-blue-600" />
                    <span>
                      {suggestedMaterials.length} {suggestedMaterials.length === 1 ? 'sugestão encontrada' : 'sugestões encontradas'} para <strong className="text-blue-700">"{searchTerm}"</strong>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-bold">
                    Clique no material para selecioná-lo
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto bg-white">
                  {suggestedMaterials.map(mat => {
                    const inBasket = requestBasket.find(b => b.product_name === mat.name);

                    return (
                      <div 
                        key={mat.name} 
                        onClick={() => handleSelectMaterial(mat)}
                        className="p-3.5 sm:p-4 hover:bg-blue-50/80 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs sm:text-sm text-slate-800 group-hover:text-blue-700 transition-colors">
                              {mat.name}
                            </span>
                            {inBasket && (
                              <span className="shrink-0 bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-200">
                                {inBasket.quantity} já na cesta
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 flex-wrap">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold text-[10px]">
                              {mat.category}
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-slate-600">
                              Unidade: <strong className="text-slate-800">{mat.unit}</strong>
                            </span>

                            {/* Stock visibility control: strictly isolated for requesting sectors */}
                            {hasStockPermission ? (
                              <>
                                <span>•</span>
                                <span className={`font-bold px-2 py-0.5 rounded-md border text-[10px] ${
                                  mat.totalStock > 0 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}>
                                  Estoque: {mat.totalStock} {mat.unit} disponível
                                </span>
                              </>
                            ) : (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[10px]">
                                  <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> Disponível para solicitação
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Click to select button indicator */}
                        <div className="shrink-0 flex items-center gap-1.5 text-xs font-black text-blue-600 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white px-3 py-1.5 rounded-xl border border-blue-200 transition-all">
                          <span>Selecionar</span>
                          <ArrowRight size={13} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step B: Selected Material Configuration Card */}
        {/* Appears IMMEDIATELY when a material is clicked, closing all other suggestions */}
        {selectedMaterial && (
          <div className="p-5 sm:p-6 bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-white rounded-2xl border-2 border-blue-500 shadow-md animate-in fade-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-blue-100 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Material Selecionado
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    {selectedMaterial.category}
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                  {selectedMaterial.name}
                </h4>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold">
                    Unidade de Medida: <strong className="text-slate-900 font-black">{selectedMaterial.unit}</strong>
                  </span>
                  {hasStockPermission ? (
                    <>
                      <span>•</span>
                      <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                        Estoque: {selectedMaterial.totalStock} {selectedMaterial.unit}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>•</span>
                      <span className="font-bold text-emerald-700 text-[11px] inline-flex items-center gap-1">
                        <CheckCircle2 size={12} /> Disponível para solicitação
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancelSelection}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all flex items-center gap-1 shrink-0"
                title="Trocar este material por outro"
              >
                <X size={14} /> Trocar material
              </button>
            </div>

            {/* Quantity selection & confirmation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1.5">
                  Informe a quantidade desejada:
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-white border-2 border-blue-400 rounded-2xl p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setSelectedQty(prev => Math.max(1, prev - 1))}
                      className="p-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all"
                      title="Diminuir quantidade"
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      ref={qtyInputRef}
                      type="number"
                      min="1"
                      value={selectedQty}
                      onChange={(e) => setSelectedQty(Math.max(1, parseInt(e.target.value) || 1))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmAddToBasket();
                        }
                      }}
                      className="w-16 px-1 py-1 bg-transparent text-base font-black text-center text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedQty(prev => prev + 1)}
                      className="p-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all"
                      title="Aumentar quantidade"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <span className="font-black text-slate-700 text-sm">
                    {selectedMaterial.unit}
                  </span>
                </div>
              </div>

              {/* Confirm Add Button */}
              <div className="flex items-center gap-2 self-stretch sm:self-end">
                <button
                  type="button"
                  onClick={handleConfirmAddToBasket}
                  className="flex-1 sm:flex-none px-6 py-3.5 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 hover:from-blue-700 hover:to-indigo-900 active:scale-95 text-white rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Plus size={18} /> Confirmar e Adicionar à Cesta
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Area 2: Cesta de Solicitação (Located directly below the material search area) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 lg:p-7 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-800">Cesta de Solicitação</h3>
              <p className="text-xs text-slate-400">
                Materiais acumulados para o pedido do setor {selectedSector}
              </p>
            </div>
          </div>
          <span className="text-xs font-black text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
            {requestBasket.length} {requestBasket.length === 1 ? 'material' : 'materiais'} na cesta
          </span>
        </div>

        {/* Empty or Populated Basket */}
        {requestBasket.length === 0 ? (
          <div className="py-10 px-4 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center space-y-2">
            <ShoppingCart size={32} className="text-slate-300" />
            <p className="text-xs font-extrabold text-slate-600">Sua cesta de solicitação está vazia</p>
            <p className="text-[11px] text-slate-400 max-w-sm">
              Pesquise o material no campo de busca acima, selecione-o, informe a quantidade e confirme a inclusão na cesta.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {requestBasket.map((item, index) => {
                const unit = materialUnitMap.get(item.product_name) || 'UN';

                return (
                  <div key={index} className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-extrabold text-slate-800 text-xs sm:text-sm truncate">
                        {item.product_name}
                      </p>
                      <span className="text-[11px] text-slate-500 font-semibold">
                        Unidade: <strong className="text-slate-700">{unit}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => handleUpdateBasketQty(index, Math.max(1, item.quantity - 1))}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                          title="Diminuir quantidade"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleUpdateBasketQty(index, Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-14 px-1 py-1 bg-transparent text-xs font-black text-center text-slate-800 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateBasketQty(index, item.quantity + 1)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                          title="Aumentar quantidade"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <button
                        onClick={() => handleRemoveBasketItem(index)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Remover material da cesta"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Observation field */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Observação / Justificativa do Pedido (Opcional)
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Material necessário para procedimentos previstos no setor na data..."
                value={requestObservation}
                onChange={(e) => setRequestObservation(e.target.value)}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none font-medium transition-all"
              />
            </div>

            {/* Actions */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={onSubmitRequest}
                disabled={isSubmitting || requestBasket.length === 0}
                className="w-full py-4 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 hover:from-blue-700 hover:to-indigo-900 disabled:opacity-50 text-white rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-xl shadow-blue-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Send size={16} /> {editingRequest ? 'Salvar Alterações da Solicitação' : 'Enviar Solicitação ao Almoxarifado'}
                  </>
                )}
              </button>

              {editingRequest && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRequest(null);
                    setRequestBasket([]);
                    setRequestObservation('');
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-bold transition-all text-center"
                >
                  Cancelar Edição
                </button>
              )}

              {isAdmin && !editingRequest && onApproveAndDeliverImmediate && requestBasket.length > 0 && (
                <button
                  type="button"
                  onClick={onApproveAndDeliverImmediate}
                  disabled={isSubmitting}
                  className="w-full py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all"
                >
                  <CheckCircle2 size={16} className="text-emerald-600" /> Aprovar e Entregar Imediatamente
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
