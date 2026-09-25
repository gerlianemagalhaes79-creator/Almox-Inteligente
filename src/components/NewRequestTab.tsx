import * as React from 'react';
import { useState, useMemo } from 'react';
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
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [selectedMaterialName, setSelectedMaterialName] = useState<string | null>(null);
  const [lastAddedMaterial, setLastAddedMaterial] = useState<string | null>(null);

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
  const materialGroups = useMemo(() => {
    const active = items.filter(i => !i.deletedAt);
    const map = new Map<string, {
      name: string;
      category: string;
      totalStock: number;
      unit: string;
      sampleId: string;
    }>();

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

  // Suggested materials: ONLY populated when searchTerm is non-empty!
  // When search is empty, DO NOT show materials list.
  const suggestedMaterials = useMemo(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      return [];
    }

    const normQuery = normalize(trimmed);
    const tokens = normQuery.split(/\s+/).filter(Boolean);

    return materialGroups.filter(mat => {
      // For requesting sectors without stock permissions, only show materials that have stock available to request,
      // without revealing quantities or depleted stock balances.
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
  }, [materialGroups, selectedCategory, searchTerm, hasStockPermission]);

  const handleAddItemToBasket = (material: { name: string, sampleId: string, totalStock: number }) => {
    const qty = itemQuantities[material.name] || 1;
    if (qty <= 0) return;

    setRequestBasket(prev => {
      const existingIndex = prev.findIndex(p => p.product_name === material.name);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + qty
        };
        return next;
      }
      return [...prev, {
        product_id: material.sampleId,
        product_name: material.name,
        quantity: qty
      }];
    });

    // Reset local counter
    setItemQuantities(prev => ({ ...prev, [material.name]: 1 }));
    setLastAddedMaterial(material.name);
    setTimeout(() => {
      setLastAddedMaterial(prev => prev === material.name ? null : prev);
    }, 2500);
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

  const handleQuickSearch = (keyword: string) => {
    setSearchTerm(keyword);
  };

  const isSearchEmpty = searchTerm.trim().length === 0;

  return (
    <div className="space-y-6">
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
            Pesquise os materiais necessários para o seu setor pelo campo de busca abaixo, selecione as sugestões correspondentes e adicione à sua cesta de solicitação.
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

      {/* Main Grid: Catalogue on Left, Basket on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Catalogue Search & Selection (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search bar & Category filter */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar material... (ex: seringa, ácido, luva)"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedMaterialName(null);
                }}
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedMaterialName(null);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-all"
                  title="Limpar pesquisa"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <Filter size={14} className="text-slate-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer w-full sm:w-auto"
              >
                <option value="all">Todas as Categorias</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Autocomplete / Suggestions Container */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[360px]">
            {isSearchEmpty ? (
              /* State 1: Search is Empty - Do NOT show any materials! */
              <div className="p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner border border-blue-100">
                  <Search size={30} />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-800">
                    Digite no campo acima para pesquisar materiais
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Para solicitar itens, comece a digitar o nome ou parte do material (ex: <span className="font-semibold text-slate-700">seringa</span>, <span className="font-semibold text-slate-700">ácido</span>, <span className="font-semibold text-slate-700">luva</span>). O sistema exibirá as sugestões disponíveis para você selecionar e adicionar à cesta.
                  </p>
                </div>

                {/* Quick suggestion search tags */}
                <div className="pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Sugestões rápidas de busca:
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-sm">
                    {['Seringa', 'Ácido', 'Luva', 'Agulha', 'Álcool', 'Gaze', 'Máscara', 'Cateter'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleQuickSearch(tag)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold transition-all"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : suggestedMaterials.length === 0 ? (
              /* State 2: Term typed, but no materials matched */
              <div className="p-10 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200">
                  <Package size={26} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-extrabold text-slate-700">
                    Nenhum material encontrado com o termo "{searchTerm}"
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    Tente digitar apenas parte do nome (ex: "sering", "acid") ou certifique-se de que a categoria selecionada inclui o material.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="mt-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Limpar busca
                </button>
              </div>
            ) : (
              /* State 3: Matching suggestions list */
              <div>
                {/* Header count */}
                <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-600">
                    <Sparkles size={14} className="text-blue-600" />
                    <span>
                      {suggestedMaterials.length} {suggestedMaterials.length === 1 ? 'sugestão encontrada' : 'sugestões encontradas'} para <span className="text-blue-700 font-extrabold">"{searchTerm}"</span>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Selecione e informe a quantidade
                  </span>
                </div>

                {/* Suggestions items */}
                <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
                  {suggestedMaterials.map(mat => {
                    const qty = itemQuantities[mat.name] || 1;
                    const inBasket = requestBasket.find(b => b.product_name === mat.name);
                    const isSelected = selectedMaterialName === mat.name;
                    const wasJustAdded = lastAddedMaterial === mat.name;

                    return (
                      <div 
                        key={mat.name} 
                        onClick={() => setSelectedMaterialName(mat.name)}
                        className={`p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                          isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs sm:text-sm text-slate-800">
                              {mat.name}
                            </span>
                            {inBasket && (
                              <span className="shrink-0 bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-200">
                                {inBasket.quantity} na cesta
                              </span>
                            )}
                            {wasJustAdded && (
                              <span className="shrink-0 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-200 animate-in fade-in">
                                ✓ Adicionado!
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 flex-wrap">
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

                        {/* Quantity and Add Action */}
                        <div 
                          className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5">
                            <button
                              type="button"
                              onClick={() => setItemQuantities(prev => ({
                                ...prev,
                                [mat.name]: Math.max(1, (prev[mat.name] || 1) - 1)
                              }))}
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition-all"
                              title="Diminuir quantidade"
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={qty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                setItemQuantities(prev => ({
                                  ...prev,
                                  [mat.name]: Math.max(1, val)
                                }));
                              }}
                              className="w-12 px-1 py-1 bg-transparent text-xs font-black text-center text-slate-800 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setItemQuantities(prev => ({
                                ...prev,
                                [mat.name]: (prev[mat.name] || 1) + 1
                              }))}
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition-all"
                              title="Aumentar quantidade"
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddItemToBasket(mat)}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all"
                          >
                            <Plus size={14} /> Adicionar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Request Basket & Submit (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 lg:p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-blue-600" />
                <h3 className="font-extrabold text-sm text-slate-800">Cesta de Solicitação</h3>
              </div>
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                {requestBasket.length} {requestBasket.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {requestBasket.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <ShoppingCart size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600">Sua cesta está vazia</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Pesquise e selecione materiais nas sugestões ao lado para incluir no seu pedido.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {requestBasket.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-bold text-slate-800 truncate">{item.product_name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleUpdateBasketQty(index, parseInt(e.target.value) || 0)}
                        className="w-14 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-center text-slate-800 focus:outline-none"
                      />
                      <button
                        onClick={() => handleRemoveBasketItem(index)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        title="Remover item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Observation field */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-[11px] font-extrabold uppercase text-slate-500">
                Observação / Justificativa (Opcional)
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Material necessário para procedimento cirúrgico na sala 2..."
                value={requestObservation}
                onChange={(e) => setRequestObservation(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none font-medium"
              />
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <button
                onClick={onSubmitRequest}
                disabled={isSubmitting || requestBasket.length === 0}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Send size={15} /> {editingRequest ? 'Salvar Alterações da Solicitação' : 'Enviar Solicitação ao Almoxarifado'}
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
                  className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <CheckCircle2 size={14} className="text-emerald-600" /> Aprovar e Entregar Imediatamente
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
