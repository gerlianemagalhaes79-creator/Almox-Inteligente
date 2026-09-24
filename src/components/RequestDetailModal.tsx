import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  X, 
  CheckCircle2, 
  PackageCheck, 
  XCircle, 
  Layers, 
  Printer, 
  Plus, 
  Clock, 
  AlertCircle,
  FileText,
  Save,
  MessageSquare
} from 'lucide-react';
import { MaterialRequest, RequestItem, Item } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface RequestDetailModalProps {
  modalState: { show: boolean, request?: MaterialRequest };
  onClose: () => void;
  allRequestItems: RequestItem[];
  items: Item[];
  onDeliverRequest: (requestId: string, items: RequestItem[]) => void;
  onApproveRequest: (requestId: string, items: RequestItem[]) => void;
  onRejectRequest: (requestId: string) => void;
  onPrintRequest: (request: MaterialRequest) => void;
  onAddExtraItem?: (requestId: string, productName: string, productId: string, qty: number) => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({
  modalState,
  onClose,
  allRequestItems,
  items,
  onDeliverRequest,
  onApproveRequest,
  onRejectRequest,
  onPrintRequest,
  onAddExtraItem,
  showToast
}) => {
  const req = modalState.request;
  if (!modalState.show || !req) return null;

  const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
  
  // Local state for editable approved quantities
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    reqItems.forEach(ri => {
      map[ri.id] = ri.quantity_approved !== undefined && ri.quantity_approved !== null ? ri.quantity_approved : ri.quantity_requested;
    });
    return map;
  });

  const [adminNote, setAdminNote] = useState<string>(req.adminObservation || '');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Add extra item state
  const [showAddExtra, setShowAddExtra] = useState(false);
  const [extraItemSearch, setExtraItemSearch] = useState('');
  const [extraItemQty, setExtraItemQty] = useState(1);
  const [selectedExtraItem, setSelectedExtraItem] = useState<Item | null>(null);

  // Active items for adding extra
  const activeItems = useMemo(() => items.filter(i => !i.deletedAt), [items]);

  const handleSaveAdminNote = async () => {
    try {
      setIsSavingNote(true);
      await updateDoc(doc(db, 'requests', req.id), {
        adminObservation: adminNote
      });
      if (showToast) showToast("Observação do Almoxarifado salva!", "success");
    } catch (e) {
      console.error(e);
      if (showToast) showToast("Erro ao salvar observação.", "error");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleProcessDelivery = () => {
    const updatedItems = reqItems.map(item => ({
      ...item,
      quantity_approved: approvedQtys[item.id] !== undefined ? approvedQtys[item.id] : item.quantity_requested
    }));
    onDeliverRequest(req.id, updatedItems);
  };

  const handleStartSeparation = () => {
    const updatedItems = reqItems.map(item => ({
      ...item,
      quantity_approved: approvedQtys[item.id] !== undefined ? approvedQtys[item.id] : item.quantity_requested
    }));
    onApproveRequest(req.id, updatedItems);
  };

  const handleConfirmAddExtra = () => {
    if (!selectedExtraItem || extraItemQty <= 0) return;
    if (onAddExtraItem) {
      onAddExtraItem(req.id, selectedExtraItem.name, selectedExtraItem.id, extraItemQty);
      setSelectedExtraItem(null);
      setExtraItemSearch('');
      setShowAddExtra(false);
    }
  };

  const isPending = req.status === 'PENDENTE';
  const isInSeparation = req.status === 'EM_SEPARACAO' || req.status === 'SEPARADO';
  const isDelivered = req.status === 'ENTREGUE';
  const isRejected = req.status === 'RECUSADO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black bg-white/20 px-2.5 py-1 rounded-lg">
                #{req.id.slice(-6).toUpperCase()}
              </span>
              <span className="text-xs font-black bg-blue-500 text-white px-2.5 py-1 rounded-lg">
                {req.sector}
              </span>
              <span className="text-xs font-bold bg-white/10 px-2.5 py-1 rounded-lg">
                {new Date(req.date).toLocaleString('pt-BR')}
              </span>
            </div>
            <h2 className="text-lg font-black mt-2">Detalhamento da Solicitação</h2>
            <p className="text-xs text-blue-200">
              Solicitante: <span className="font-semibold text-white">{req.requesterEmail || 'Não informado'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Sector's Observation */}
          {req.observation && (
            <div className="bg-amber-50 border border-amber-200/80 p-4 rounded-2xl text-xs">
              <p className="font-bold text-amber-900 uppercase text-[10px]">Justificativa do Setor:</p>
              <p className="text-amber-800 font-medium italic mt-0.5">"{req.observation}"</p>
            </div>
          )}

          {/* Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Itens da Solicitação ({reqItems.length})
              </h3>
              {!isDelivered && !isRejected && onAddExtraItem && (
                <button
                  onClick={() => setShowAddExtra(!showAddExtra)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  <Plus size={14} /> Adicionar Item Extra
                </button>
              )}
            </div>

            {/* Extra Item Form */}
            {showAddExtra && (
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 space-y-3">
                <p className="text-xs font-extrabold text-blue-900">Incluir Item Extra na Solicitação</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <select
                      value={selectedExtraItem?.id || ''}
                      onChange={(e) => {
                        const it = activeItems.find(i => i.id === e.target.value);
                        setSelectedExtraItem(it || null);
                      }}
                      className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      <option value="">Selecione um item do estoque...</option>
                      {activeItems.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.quantity} {i.unit_measure || 'UN'} disponíveis)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      value={extraItemQty}
                      onChange={(e) => setExtraItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 p-2 bg-white border border-blue-200 rounded-xl text-xs font-bold text-center"
                    />
                    <button
                      onClick={handleConfirmAddExtra}
                      disabled={!selectedExtraItem}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 disabled:opacity-50"
                    >
                      Incluir
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-500 font-black uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Material</th>
                    <th className="p-3 text-center">Qtd Solicitada</th>
                    <th className="p-3 text-center">Qtd Aprovada</th>
                    <th className="p-3 text-center">Estoque Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reqItems.map(item => {
                    // Match inventory item for stock info
                    const stockItems = items.filter(i => i.name === item.product_name && !i.deletedAt);
                    const totalAvailable = stockItems.reduce((acc, i) => acc + (i.quantity || 0), 0);
                    const currentApproved = approvedQtys[item.id] !== undefined ? approvedQtys[item.id] : item.quantity_requested;

                    return (
                      <tr key={item.id} className="bg-white">
                        <td className="p-3 font-bold text-slate-800">{item.product_name}</td>
                        <td className="p-3 text-center font-bold text-slate-600">{item.quantity_requested} un.</td>
                        <td className="p-3 text-center">
                          {isDelivered || isRejected ? (
                            <span className="font-extrabold text-emerald-700">{item.quantity_approved || item.quantity_requested} un.</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              value={currentApproved}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setApprovedQtys(prev => ({ ...prev, [item.id]: isNaN(val) ? 0 : val }));
                              }}
                              className="w-16 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-center font-black text-xs text-blue-900 focus:outline-none focus:border-blue-500"
                            />
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`font-bold ${totalAvailable < item.quantity_requested ? 'text-rose-600' : 'text-slate-600'}`}>
                            {totalAvailable} un.
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Admin Observation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase text-slate-500">
                Observação do Almoxarifado / Motivo:
              </label>
              <button
                onClick={handleSaveAdminNote}
                disabled={isSavingNote}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
              >
                <Save size={12} /> Salvar Nota
              </button>
            </div>
            <textarea
              rows={2}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Ex: Liberado conforme cota mensal do setor..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-none font-medium"
            />
          </div>
        </div>

        {/* Modal Footer / Workflow Actions */}
        <div className="bg-slate-50 p-5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPrintRequest(req)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-sm transition-all"
            >
              <Printer size={14} /> Imprimir Guia
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isDelivered && !isRejected && (
              <>
                <button
                  onClick={() => onRejectRequest(req.id)}
                  className="flex items-center gap-1 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all"
                >
                  <XCircle size={14} /> Recusar
                </button>

                {isPending && (
                  <button
                    onClick={handleStartSeparation}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all"
                  >
                    <Layers size={14} /> Iniciar Separação
                  </button>
                )}

                <button
                  onClick={handleProcessDelivery}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all"
                >
                  <PackageCheck size={14} /> Aprovar & Entregar
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
