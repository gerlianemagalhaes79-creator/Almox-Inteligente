import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  RotateCcw, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Printer, 
  AlertCircle,
  Package,
  ArrowDownLeft
} from 'lucide-react';
import { MaterialRequest, RequestItem, Item } from '../types';

interface AdminDevolutionsTabProps {
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  items: Item[];
  onApproveDevolution: (requestId: string, devItems: RequestItem[]) => void;
  onRejectDevolution: (requestId: string) => void;
  onPrintRequest: (request: MaterialRequest) => void;
  sectors: string[];
}

export const AdminDevolutionsTab: React.FC<AdminDevolutionsTabProps> = ({
  requests,
  allRequestItems,
  items,
  onApproveDevolution,
  onRejectDevolution,
  onPrintRequest,
  sectors
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Devolutions only
  const devolutionRequests = useMemo(() => {
    return requests.filter(r => (r.isReturn || r.status?.startsWith('DEVOLUCAO_') || r.returnReason) && !r.deletedAt);
  }, [requests]);

  const filteredDevolutions = useMemo(() => {
    return devolutionRequests.filter(req => {
      if (statusFilter !== 'TODOS') {
        if (statusFilter === 'PENDENTE' && req.status !== 'DEVOLUCAO_PENDENTE' && req.status !== 'PENDENTE') return false;
        if (statusFilter === 'APROVADA' && req.status !== 'DEVOLUCAO_APROVADA') return false;
        if (statusFilter === 'RECUSADA' && req.status !== 'DEVOLUCAO_RECUSADA') return false;
      }

      if (sectorFilter !== 'all' && req.sector !== sectorFilter) {
        return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesId = req.id.toLowerCase().includes(term);
        const matchesSector = req.sector.toLowerCase().includes(term);
        const matchesEmail = (req.requesterEmail || '').toLowerCase().includes(term);
        const matchesReason = (req.returnReason || '').toLowerCase().includes(term);
        
        const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
        const matchesItems = reqItems.some(ri => ri.product_name.toLowerCase().includes(term));

        if (!matchesId && !matchesSector && !matchesEmail && !matchesReason && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [devolutionRequests, statusFilter, sectorFilter, searchTerm, allRequestItems]);

  const getStatusBadge = (status: MaterialRequest['status']) => {
    if (status === 'DEVOLUCAO_PENDENTE' || status === 'PENDENTE') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
          <Clock size={12} className="text-amber-600" /> Devolução Pendente
        </span>
      );
    }
    if (status === 'DEVOLUCAO_APROVADA') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
          <CheckCircle2 size={12} className="text-emerald-600" /> Devolução Aceita
        </span>
      );
    }
    if (status === 'DEVOLUCAO_RECUSADA') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200/80">
          <XCircle size={12} className="text-rose-600" /> Devolução Recusada
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-3xl p-6 lg:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-200 text-xs font-black uppercase tracking-widest mb-1">
            <RotateCcw size={16} /> Triagem de Devoluções
          </div>
          <h2 className="text-xl lg:text-2xl font-black">Devoluções de Materiais ao Almoxarifado</h2>
          <p className="text-xs text-blue-200/80 mt-1 max-w-xl">
            Analise os itens devolvidos pelos setores. Ao aprovar uma devolução, os materiais retornam automaticamente ao estoque ativo nos seus respectivos lotes.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 shrink-0">
          <div>
            <p className="text-[10px] uppercase font-bold text-blue-200">Pendentes</p>
            <p className="text-2xl font-black text-amber-300">
              {devolutionRequests.filter(r => r.status === 'DEVOLUCAO_PENDENTE' || r.status === 'PENDENTE').length}
            </p>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div>
            <p className="text-[10px] uppercase font-bold text-blue-200">Aceitas</p>
            <p className="text-2xl font-black text-emerald-300">
              {devolutionRequests.filter(r => r.status === 'DEVOLUCAO_APROVADA').length}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por ID, setor, motivo ou material..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl w-full md:w-auto">
            <Filter size={14} className="text-slate-500 shrink-0" />
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer w-full"
            >
              <option value="all">Todos os Setores</option>
              {sectors.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl w-full md:w-auto">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer w-full"
            >
              <option value="TODOS">Todos os Status</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="APROVADA">Aceitas</option>
              <option value="RECUSADA">Recusadas</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      {filteredDevolutions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <RotateCcw size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800">Nenhuma devolução encontrada</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Não há registros de devolução correspondentes aos filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDevolutions.map(req => {
            const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
            const isPending = req.status === 'DEVOLUCAO_PENDENTE' || req.status === 'PENDENTE';

            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                      #{req.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                      {req.sector}
                    </span>
                    {getStatusBadge(req.status)}
                  </div>
                  <span className="text-xs font-medium text-slate-400">
                    {new Date(req.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <p className="font-bold text-slate-700">
                      Motivo: <span className="font-medium text-slate-600">{req.returnReason || 'Não informado'}</span>
                    </p>
                    <p className="font-bold text-slate-700">
                      Solicitante: <span className="font-medium text-slate-600">{req.requesterEmail || 'Não informado'}</span>
                    </p>
                    {req.observation && (
                      <p className="font-bold text-slate-700">
                        Observação: <span className="font-normal italic text-slate-600">"{req.observation}"</span>
                      </p>
                    )}
                  </div>

                  <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/80">
                    <p className="font-extrabold text-blue-900 mb-2 flex items-center gap-1.5">
                      <ArrowDownLeft size={14} className="text-blue-600" /> Itens para Retorno ao Estoque:
                    </p>
                    <div className="space-y-1.5">
                      {reqItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-blue-100 text-xs">
                          <span className="font-semibold text-slate-800 truncate max-w-[200px] sm:max-w-xs">{item.product_name}</span>
                          <span className="font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            {item.quantity_requested || item.quantity_returned || 1} un.
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    onClick={() => onPrintRequest(req)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                  >
                    <Printer size={14} /> Imprimir Comprovante
                  </button>

                  {isPending && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onRejectDevolution(req.id)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all"
                      >
                        <XCircle size={14} /> Recusar Devolução
                      </button>
                      <button
                        onClick={() => onApproveDevolution(req.id, reqItems)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm shadow-emerald-600/20 transition-all"
                      >
                        <CheckCircle2 size={14} /> Aceitar & Retornar ao Estoque
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
