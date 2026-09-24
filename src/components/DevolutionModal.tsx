import * as React from 'react';
import { useState } from 'react';
import { 
  X, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Send 
} from 'lucide-react';
import { MaterialRequest, RequestItem } from '../types';

interface DevolutionModalProps {
  modalState: { show: boolean, request?: MaterialRequest };
  onClose: () => void;
  allRequestItems: RequestItem[];
  onRequestDevolution: (params: {
    requestId: string;
    itemsToReturn: Array<{ product_id: string, product_name: string, quantity: number }>;
    reason: string;
    observation: string;
  }) => void;
  isProcessing?: boolean;
}

export const DevolutionModal: React.FC<DevolutionModalProps> = ({
  modalState,
  onClose,
  allRequestItems,
  onRequestDevolution,
  isProcessing = false
}) => {
  const req = modalState.request;
  if (!modalState.show || !req) return null;

  const deliveredItems = allRequestItems.filter(ri => ri.request_id === req.id);

  const [returnQtys, setReturnQtys] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    deliveredItems.forEach(item => {
      map[item.id] = 0;
    });
    return map;
  });

  const [reason, setReason] = useState('Não teve uso');
  const [observation, setObservation] = useState('');

  const handleToggleAllOrNone = (all: boolean) => {
    const map: Record<string, number> = {};
    deliveredItems.forEach(item => {
      const max = item.quantity_approved || item.quantity_requested;
      map[item.id] = all ? max : 0;
    });
    setReturnQtys(map);
  };

  const handleQtyChange = (itemId: string, val: number, max: number) => {
    setReturnQtys(prev => ({
      ...prev,
      [itemId]: Math.max(0, Math.min(max, val))
    }));
  };

  const handleSubmit = () => {
    const itemsToReturn: Array<{ product_id: string, product_name: string, quantity: number }> = [];

    deliveredItems.forEach(item => {
      const qty = returnQtys[item.id] || 0;
      if (qty > 0) {
        itemsToReturn.push({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: qty
        });
      }
    });

    if (itemsToReturn.length === 0) {
      alert("Selecione a quantidade de pelo menos um item para devolver.");
      return;
    }

    onRequestDevolution({
      requestId: req.id,
      itemsToReturn,
      reason,
      observation
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black bg-white/20 px-2.5 py-1 rounded-lg">
                Entrega #{req.id.slice(-6).toUpperCase()}
              </span>
              <span className="text-xs font-black bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg">
                {req.sector}
              </span>
            </div>
            <h2 className="text-lg font-black mt-2">Devolução de Materiais ao Almoxarifado</h2>
            <p className="text-xs text-blue-200">
              Selecione quais itens desta entrega serão devolvidos ao estoque geral.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Quick toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase">Itens da Entrega:</span>
            <div className="space-x-2">
              <button
                type="button"
                onClick={() => handleToggleAllOrNone(true)}
                className="text-[11px] font-bold text-blue-600 hover:underline"
              >
                Devolver Todos
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => handleToggleAllOrNone(false)}
                className="text-[11px] font-bold text-slate-500 hover:underline"
              >
                Limpar
              </button>
            </div>
          </div>

          {/* Items selection */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
            {deliveredItems.map(item => {
              const max = item.quantity_approved || item.quantity_requested;
              const current = returnQtys[item.id] || 0;

              return (
                <div key={item.id} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-100 text-xs">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-bold text-slate-800 truncate">{item.product_name}</p>
                    <p className="text-[11px] text-slate-400">Recebido: {max} un.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-medium text-slate-500">Devolver:</span>
                    <input
                      type="number"
                      min="0"
                      max={max}
                      value={current}
                      onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value) || 0, max)}
                      className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-black text-xs text-blue-900 focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[11px] font-bold text-slate-400">/ {max}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-600 mb-1.5">
              Motivo da Devolução:
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="Não teve uso">Não teve uso / Excesso de estoque</option>
              <option value="Item enviado incorreto">Item enviado incorreto</option>
              <option value="Material com defeito ou avaria">Material com defeito ou avaria</option>
              <option value="Validade próxima">Validade próxima</option>
              <option value="Procedimento cancelado">Procedimento cancelado</option>
              <option value="Outros">Outros</option>
            </select>
          </div>

          {/* Observation */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-600 mb-1.5">
              Observação Adicional:
            </label>
            <textarea
              rows={2}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Descreva observações sobre o estado do item ou motivo..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-none font-medium"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-5 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-blue-600/20 transition-all"
          >
            {isProcessing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Send size={14} /> Enviar Devolução
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
