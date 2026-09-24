import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  RotateCcw, 
  Package, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Printer, 
  AlertCircle,
  ArrowDownLeft,
  Plus,
  Trash2,
  Send,
  Info
} from 'lucide-react';
import { MaterialRequest, RequestItem, Item, UserProfile } from '../types';

interface DevolutionTabProps {
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  items: Item[];
  selectedSector: string;
  userProfile: UserProfile | null;
  devolutionSubTab: 'my_returns' | 'eligible_deliveries' | 'sector_stock';
  setDevolutionSubTab: (tab: 'my_returns' | 'eligible_deliveries' | 'sector_stock') => void;
  devolutionBasket: Array<{ product_id: string, product_name: string, quantity: number, maxQty: number, selectedBatchId: string }>;
  setDevolutionBasket: React.Dispatch<React.SetStateAction<Array<{ product_id: string, product_name: string, quantity: number, maxQty: number, selectedBatchId: string }>>>;
  selectedDevProduct: string;
  setSelectedDevProduct: (p: string) => void;
  devolutionReason: string;
  setDevolutionReason: (r: string) => void;
  devolutionObservation: string;
  setDevolutionObservation: (obs: string) => void;
  onRequestDevolution: () => void;
  isProcessingDevolution: boolean;
  onPrintRequest: (req: MaterialRequest) => void;
  onOpenDevolutionModal: (req: MaterialRequest) => void;
}

export const DevolutionTab: React.FC<DevolutionTabProps> = ({
  requests,
  allRequestItems,
  items,
  selectedSector,
  userProfile,
  devolutionSubTab,
  setDevolutionSubTab,
  devolutionBasket,
  setDevolutionBasket,
  selectedDevProduct,
  setSelectedDevProduct,
  devolutionReason,
  setDevolutionReason,
  devolutionObservation,
  setDevolutionObservation,
  onRequestDevolution,
  isProcessingDevolution,
  onPrintRequest,
  onOpenDevolutionModal
}) => {
  const userSectors = useMemo(() => {
    if (userProfile?.role === 'ADMIN') return null; // Admin can access any
    return (userProfile?.allowedSectors && userProfile.allowedSectors.length > 0)
      ? userProfile.allowedSectors
      : [userProfile?.sector].filter(Boolean) as string[];
  }, [userProfile]);

  // My Sector's devolution requests (guarded by user permissions)
  const myDevolutions = useMemo(() => {
    return requests.filter(r => {
      if (r.deletedAt) return false;
      const isDev = r.isReturn || r.status?.startsWith('DEVOLUCAO_') || Boolean(r.returnReason);
      if (!isDev) return false;

      if (userSectors) {
        // Non-admin: strictly limited to registered user sectors
        const belongsToUser = userSectors.includes(r.sector) || 
          (Boolean(r.requesterEmail) && r.requesterEmail?.toLowerCase() === userProfile?.email?.toLowerCase());
        if (!belongsToUser) return false;
      }

      return !selectedSector || selectedSector === 'all' || r.sector === selectedSector;
    });
  }, [requests, selectedSector, userSectors, userProfile]);

  // Delivered requests for my sector eligible for return
  const eligibleDeliveries = useMemo(() => {
    return requests.filter(r => {
      if (r.deletedAt || r.isReturn || r.status !== 'ENTREGUE') return false;

      if (userSectors) {
        // Non-admin: strictly limited to registered user sectors
        const belongsToUser = userSectors.includes(r.sector) || 
          (Boolean(r.requesterEmail) && r.requesterEmail?.toLowerCase() === userProfile?.email?.toLowerCase());
        if (!belongsToUser) return false;
      }

      return !selectedSector || selectedSector === 'all' || r.sector === selectedSector;
    });
  }, [requests, selectedSector, userSectors, userProfile]);

  // Distinct products delivered to this sector
  const deliveredProducts = useMemo(() => {
    const productMap = new Map<string, {
      product_name: string;
      product_id: string;
      totalDelivered: number;
      totalReturned: number;
    }>();

    eligibleDeliveries.forEach(deliv => {
      const delivItems = allRequestItems.filter(ri => ri.request_id === deliv.id);
      delivItems.forEach(item => {
        const existing = productMap.get(item.product_name);
        if (existing) {
          existing.totalDelivered += (item.quantity_approved || 0);
          existing.totalReturned += (item.quantity_returned || 0);
        } else {
          productMap.set(item.product_name, {
            product_name: item.product_name,
            product_id: item.product_id,
            totalDelivered: item.quantity_approved || 0,
            totalReturned: item.quantity_returned || 0
          });
        }
      });
    });

    return Array.from(productMap.values()).filter(p => (p.totalDelivered - p.totalReturned) > 0);
  }, [eligibleDeliveries, allRequestItems]);

  const handleAddProductToDevolutionBasket = () => {
    if (!selectedDevProduct) return;
    const prod = deliveredProducts.find(p => p.product_name === selectedDevProduct);
    if (!prod) return;

    const availableToReturn = Math.max(1, prod.totalDelivered - prod.totalReturned);

    setDevolutionBasket(prev => {
      if (prev.some(b => b.product_name === prod.product_name)) {
        return prev;
      }
      return [...prev, {
        product_id: prod.product_id,
        product_name: prod.product_name,
        quantity: 1,
        maxQty: availableToReturn,
        selectedBatchId: ''
      }];
    });

    setSelectedDevProduct('');
  };

  const handleUpdateBasketQty = (index: number, qty: number) => {
    setDevolutionBasket(prev => {
      const next = [...prev];
      const max = next[index].maxQty;
      next[index] = { ...next[index], quantity: Math.max(1, Math.min(max, qty)) };
      return next;
    });
  };

  const handleRemoveFromBasket = (index: number) => {
    setDevolutionBasket(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-3xl p-6 lg:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-200 text-xs font-black uppercase tracking-widest mb-1">
            <RotateCcw size={16} /> Devolução de Materiais
          </div>
          <h2 className="text-xl lg:text-2xl font-black">Central de Devolução - {selectedSector}</h2>
          <p className="text-xs text-blue-200/80 mt-1 max-w-xl">
            Devolva itens não utilizados, enviados por engano ou em excesso ao almoxarifado para reincorporação imediata ao estoque geral.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shrink-0">
          <span className="text-xs font-bold text-blue-200">Devoluções em Andamento:</span>
          <span className="text-lg font-black text-amber-300">
            {myDevolutions.filter(r => r.status === 'DEVOLUCAO_PENDENTE' || r.status === 'PENDENTE').length}
          </span>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setDevolutionSubTab('my_returns')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            devolutionSubTab === 'my_returns'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <RotateCcw size={15} /> Minhas Devoluções ({myDevolutions.length})
        </button>

        <button
          onClick={() => setDevolutionSubTab('eligible_deliveries')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            devolutionSubTab === 'eligible_deliveries'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Package size={15} /> Entregas Recebidas Elegíveis ({eligibleDeliveries.length})
        </button>

        <button
          onClick={() => setDevolutionSubTab('sector_stock')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            devolutionSubTab === 'sector_stock'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Plus size={15} /> Nova Devolução Avulsa
        </button>
      </div>

      {/* Subtab 1: My Returns */}
      {devolutionSubTab === 'my_returns' && (
        <div>
          {myDevolutions.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
              <RotateCcw size={32} className="text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-800">Nenhuma devolução registrada</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Seu setor ainda não solicitou nenhuma devolução de materiais.
              </p>
              <button
                onClick={() => setDevolutionSubTab('eligible_deliveries')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all inline-flex items-center gap-1.5"
              >
                Ver Entregas Recebidas
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myDevolutions.map(req => {
                const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
                const isPending = req.status === 'DEVOLUCAO_PENDENTE' || req.status === 'PENDENTE';
                const isApproved = req.status === 'DEVOLUCAO_APROVADA';

                return (
                  <div key={req.id} className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                          #{req.id.slice(-6).toUpperCase()}
                        </span>
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
                            <Clock size={12} className="text-amber-600" /> Aguardando Almoxarifado
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                            <CheckCircle2 size={12} className="text-emerald-600" /> Aceita & Retornada ao Estoque
                          </span>
                        )}
                        {req.status === 'DEVOLUCAO_RECUSADA' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200/80">
                            <XCircle size={12} className="text-rose-600" /> Devolução Recusada
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-medium">
                        {new Date(req.date).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <span className="font-bold text-slate-500 block text-[10px] uppercase">Motivo da Devolução:</span>
                        <p className="font-semibold text-slate-800 mt-0.5">{req.returnReason || 'Não informado'}</p>
                        {req.observation && <p className="text-slate-600 italic mt-1">"{req.observation}"</p>}
                      </div>
                      <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/80">
                        <span className="font-bold text-blue-900 block text-[10px] uppercase">Itens Devolvidos:</span>
                        <div className="mt-1 space-y-1">
                          {reqItems.map(item => (
                            <div key={item.id} className="flex justify-between font-medium text-slate-700">
                              <span>{item.product_name}</span>
                              <span className="font-bold text-blue-700">{item.quantity_requested || item.quantity_returned || 1} un.</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => onPrintRequest(req)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                      >
                        <Printer size={13} /> Imprimir Comprovante
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Eligible Deliveries */}
      {devolutionSubTab === 'eligible_deliveries' && (
        <div className="space-y-4">
          {eligibleDeliveries.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
              <Package size={32} className="text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-800">Nenhuma entrega elegível encontrada</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Não há solicitações entregues registradas para o setor {selectedSector}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {eligibleDeliveries.map(deliv => {
                const delivItems = allRequestItems.filter(ri => ri.request_id === deliv.id);
                return (
                  <div
                    key={deliv.id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-4 lg:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                          Entrega #{deliv.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                          Entregue
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(deliv.deliveredAt || deliv.date).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 flex flex-wrap gap-2 mt-2">
                        {delivItems.map(item => (
                          <span key={item.id} className="bg-slate-50 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 font-semibold">
                            {item.product_name} ({item.quantity_approved || item.quantity_requested} un.)
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenDevolutionModal(deliv)}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-sm transition-all shrink-0"
                    >
                      <RotateCcw size={14} /> Devolver Desta Entrega
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Subtab 3: Sector Stock / New Return Form */}
      {devolutionSubTab === 'sector_stock' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 lg:p-8 shadow-sm space-y-6">
          <div className="max-w-2xl">
            <h3 className="text-lg font-black text-slate-900">Formulário de Devolução Avulsa</h3>
            <p className="text-xs text-slate-500 mt-1">
              Selecione os materiais recebidos pelo setor {selectedSector} que você deseja devolver ao almoxarifado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Product Selection */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                  1. Selecione o Material Recebido:
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedDevProduct}
                    onChange={(e) => setSelectedDevProduct(e.target.value)}
                    className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Selecione um produto entregue...</option>
                    {deliveredProducts.map(p => (
                      <option key={p.product_name} value={p.product_name}>
                        {p.product_name} (Disponível p/ devolver: {p.totalDelivered - p.totalReturned})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddProductToDevolutionBasket}
                    disabled={!selectedDevProduct}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                  2. Motivo da Devolução:
                </label>
                <select
                  value={devolutionReason}
                  onChange={(e) => setDevolutionReason(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="Não teve uso">Não teve uso / Excesso de estoque</option>
                  <option value="Item enviado incorreto">Item enviado incorreto</option>
                  <option value="Material com defeito ou avaria">Material com defeito ou avaria</option>
                  <option value="Validade próxima">Validade próxima</option>
                  <option value="Procedimento cancelado">Procedimento cancelado</option>
                  <option value="Outros">Outros (especificar na observação)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                  3. Observações Adicionais (Opcional):
                </label>
                <textarea
                  rows={3}
                  value={devolutionObservation}
                  onChange={(e) => setDevolutionObservation(e.target.value)}
                  placeholder="Detalhes sobre a devolução..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            {/* Right: Selected Basket */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="font-extrabold text-xs text-slate-700 uppercase">Itens na Lista de Devolução:</span>
                  <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    {devolutionBasket.length} itens
                  </span>
                </div>

                {devolutionBasket.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Nenhum item adicionado à lista de devolução.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {devolutionBasket.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200 text-xs">
                        <span className="font-bold text-slate-800 truncate pr-2">{item.product_name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            min="1"
                            max={item.maxQty}
                            value={item.quantity}
                            onChange={(e) => handleUpdateBasketQty(idx, parseInt(e.target.value) || 1)}
                            className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-black"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveFromBasket(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onRequestDevolution}
                disabled={isProcessingDevolution || devolutionBasket.length === 0}
                className="w-full mt-4 py-3.5 bg-gradient-to-r from-blue-700 to-indigo-900 hover:from-blue-800 hover:to-indigo-950 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                {isProcessingDevolution ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Send size={14} /> Enviar Devolução ao Almoxarifado
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
