import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  AlertTriangle, 
  Clock, 
  Search, 
  Package, 
  ArrowLeftRight, 
  FileText,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Item, Transaction, MaterialRequest, RequestItem } from '../types';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

interface TrashTabProps {
  items: Item[];
  transactions: Transaction[];
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const TrashTab: React.FC<TrashTabProps> = ({
  items,
  transactions,
  requests,
  allRequestItems,
  showToast
}) => {
  const [subTab, setSubTab] = useState<'items' | 'transactions' | 'requests'>('items');
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Deleted records
  const deletedItems = useMemo(() => {
    return items.filter(i => !!i.deletedAt);
  }, [items]);

  const deletedTransactions = useMemo(() => {
    return transactions.filter(t => !!t.deletedAt);
  }, [transactions]);

  const deletedRequests = useMemo(() => {
    return requests.filter(r => !!r.deletedAt);
  }, [requests]);

  // Restore Handlers
  const handleRestoreItem = async (itemId: string) => {
    try {
      setIsProcessing(true);
      await updateDoc(doc(db, 'items', itemId), {
        deletedAt: null,
        deletedBy: null
      });
      showToast("Item restaurado com sucesso para o estoque ativo!", "success");
    } catch (e: any) {
      console.error(e);
      showToast("Erro ao restaurar item.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePermanentDeleteItem = async (itemId: string) => {
    if (!window.confirm("Atenção: Esta ação é definitiva e não poderá ser desfeita. Excluir permanentemente?")) {
      return;
    }
    try {
      setIsProcessing(true);
      await deleteDoc(doc(db, 'items', itemId));
      showToast("Item excluído permanentemente.", "info");
    } catch (e: any) {
      console.error(e);
      showToast("Erro ao excluir item permanentemente.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreTransaction = async (transId: string) => {
    try {
      setIsProcessing(true);
      await updateDoc(doc(db, 'transactions', transId), {
        deletedAt: null,
        deletionReason: null,
        deletedByEmail: null
      });
      showToast("Movimentação restaurada com sucesso!", "success");
    } catch (e: any) {
      console.error(e);
      showToast("Erro ao restaurar movimentação.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePermanentDeleteTransaction = async (transId: string) => {
    if (!window.confirm("Excluir esta movimentação permanentemente?")) {
      return;
    }
    try {
      setIsProcessing(true);
      await deleteDoc(doc(db, 'transactions', transId));
      showToast("Movimentação excluída permanentemente.", "info");
    } catch (e: any) {
      console.error(e);
      showToast("Erro ao excluir movimentação permanentemente.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreRequest = async (requestId: string) => {
    try {
      setIsProcessing(true);
      await updateDoc(doc(db, 'requests', requestId), {
        deletedAt: null,
        deletedBy: null
      });
      showToast("Solicitação restaurada com sucesso!", "success");
    } catch (e: any) {
      console.error(e);
      showToast("Erro ao restaurar solicitação.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePermanentDeleteRequest = async (requestId: string) => {
    if (!window.confirm("Excluir esta solicitação e todos os seus itens permanentemente?")) {
      return;
    }
    try {
      setIsProcessing(true);
      // Delete request doc
      await deleteDoc(doc(db, 'requests', requestId));
      // Delete child items
      const childItems = allRequestItems.filter(ri => ri.request_id === requestId);
      for (const ci of childItems) {
        if (ci.id) await deleteDoc(doc(db, 'request_items', ci.id));
      }
      showToast("Solicitação excluída permanentemente.", "info");
    } catch (e: any) {
      console.error(e);
      showToast("Erro ao excluir solicitação permanentemente.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmptyTrash = async () => {
    const totalCount = deletedItems.length + deletedTransactions.length + deletedRequests.length;
    if (totalCount === 0) {
      showToast("A lixeira já está vazia.", "info");
      return;
    }
    if (!window.confirm(`Tem certeza que deseja esvaziar a lixeira e apagar definitivamente ${totalCount} registros? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      setIsProcessing(true);
      const batch = writeBatch(db);
      deletedItems.forEach(i => {
        if (i.id) batch.delete(doc(db, 'items', i.id));
      });
      deletedTransactions.forEach(t => {
        if (t.id) batch.delete(doc(db, 'transactions', t.id));
      });
      deletedRequests.forEach(r => {
        if (r.id) batch.delete(doc(db, 'requests', r.id));
      });
      await batch.commit();
      showToast("Lixeira esvaziada com sucesso!", "success");
    } catch (e: any) {
      console.error(e);
      showToast("Erro ao esvaziar lixeira.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter lists based on search
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return deletedItems;
    const term = searchTerm.toLowerCase();
    return deletedItems.filter(i => 
      i.name.toLowerCase().includes(term) || 
      (i.supplier || '').toLowerCase().includes(term) || 
      (i.category || '').toLowerCase().includes(term)
    );
  }, [deletedItems, searchTerm]);

  const filteredTransactions = useMemo(() => {
    if (!searchTerm.trim()) return deletedTransactions;
    const term = searchTerm.toLowerCase();
    return deletedTransactions.filter(t => 
      t.item_name.toLowerCase().includes(term) || 
      (t.sector || '').toLowerCase().includes(term) || 
      (t.responsible || '').toLowerCase().includes(term) ||
      (t.deletionReason || '').toLowerCase().includes(term)
    );
  }, [deletedTransactions, searchTerm]);

  const filteredRequests = useMemo(() => {
    if (!searchTerm.trim()) return deletedRequests;
    const term = searchTerm.toLowerCase();
    return deletedRequests.filter(r => 
      r.id.toLowerCase().includes(term) || 
      r.sector.toLowerCase().includes(term) || 
      (r.requesterEmail || '').toLowerCase().includes(term)
    );
  }, [deletedRequests, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      <div className="bg-amber-50 border border-amber-200/80 rounded-3xl p-5 lg:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-amber-100 text-amber-700 rounded-2xl shrink-0 mt-0.5">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-amber-900">Política de Retenção da Lixeira</h3>
            <p className="text-xs text-amber-700/90 mt-0.5 max-w-2xl leading-relaxed">
              Os registros nesta lixeira são preservados por até 3 dias antes de serem expurgados permanentemente. Você pode restaurar qualquer item, movimentação ou solicitação a qualquer momento.
            </p>
          </div>
        </div>

        <button
          onClick={handleEmptyTrash}
          disabled={isProcessing || (deletedItems.length === 0 && deletedTransactions.length === 0 && deletedRequests.length === 0)}
          className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold shadow-md shadow-rose-600/10 transition-all shrink-0"
        >
          <Trash2 size={14} /> Esvaziar Lixeira
        </button>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setSubTab('items')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            subTab === 'items'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Package size={15} /> Itens de Estoque ({deletedItems.length})
        </button>

        <button
          onClick={() => setSubTab('transactions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            subTab === 'transactions'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ArrowLeftRight size={15} /> Movimentações ({deletedTransactions.length})
        </button>

        <button
          onClick={() => setSubTab('requests')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            subTab === 'requests'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileText size={15} /> Solicitações ({deletedRequests.length})
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative w-full max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Filtrar registros na lixeira..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
        />
      </div>

      {/* Subtab Content */}
      {subTab === 'items' && (
        <div>
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
              <Package size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">Nenhum item de estoque na lixeira</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-100 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">Material</th>
                      <th className="p-4">Categoria</th>
                      <th className="p-4">Qtd Restante</th>
                      <th className="p-4">Data de Exclusão</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-bold text-slate-800">
                          {item.name}
                          {item.batch_number && (
                            <span className="block text-[10px] font-normal text-slate-400">
                              Lote: {item.batch_number}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-slate-600">{item.category || 'Geral'}</td>
                        <td className="p-4 font-extrabold text-slate-700">{item.quantity} {item.unit_measure || 'UN'}</td>
                        <td className="p-4 text-slate-500">
                          {item.deletedAt ? new Date(item.deletedAt).toLocaleString('pt-BR') : '-'}
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => handleRestoreItem(item.id)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl font-bold text-xs transition-all"
                          >
                            <RotateCcw size={13} /> Restaurar
                          </button>
                          <button
                            onClick={() => handlePermanentDeleteItem(item.id)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-xs transition-all"
                          >
                            <Trash2 size={13} /> Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'transactions' && (
        <div>
          {filteredTransactions.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
              <ArrowLeftRight size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">Nenhuma movimentação na lixeira</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-100 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">Tipo</th>
                      <th className="p-4">Item</th>
                      <th className="p-4">Qtd / Setor</th>
                      <th className="p-4">Motivo da Exclusão</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.map(trans => (
                      <tr key={trans.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] ${
                            trans.type === 'entry' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {trans.type === 'entry' ? 'ENTRADA' : 'SAÍDA'}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-800">{trans.item_name}</td>
                        <td className="p-4 text-slate-600">
                          {trans.quantity} un. {trans.sector && `• ${trans.sector}`}
                        </td>
                        <td className="p-4 text-slate-500 italic max-w-xs truncate">
                          "{trans.deletionReason || 'Sem motivo registrado'}"
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => handleRestoreTransaction(trans.id)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl font-bold text-xs transition-all"
                          >
                            <RotateCcw size={13} /> Restaurar
                          </button>
                          <button
                            onClick={() => handlePermanentDeleteTransaction(trans.id)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-xs transition-all"
                          >
                            <Trash2 size={13} /> Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'requests' && (
        <div>
          {filteredRequests.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
              <FileText size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">Nenhuma solicitação na lixeira</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-100 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">ID</th>
                      <th className="p-4">Setor</th>
                      <th className="p-4">Data</th>
                      <th className="p-4">Solicitante</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-black text-slate-800">#{req.id.slice(-6).toUpperCase()}</td>
                        <td className="p-4 font-bold text-blue-700">{req.sector}</td>
                        <td className="p-4 text-slate-500">{new Date(req.date).toLocaleDateString('pt-BR')}</td>
                        <td className="p-4 text-slate-600">{req.requesterEmail || '-'}</td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => handleRestoreRequest(req.id)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl font-bold text-xs transition-all"
                          >
                            <RotateCcw size={13} /> Restaurar
                          </button>
                          <button
                            onClick={() => handlePermanentDeleteRequest(req.id)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-xs transition-all"
                          >
                            <Trash2 size={13} /> Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
