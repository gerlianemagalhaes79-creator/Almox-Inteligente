import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  PackageCheck, 
  XCircle, 
  Printer, 
  Edit3, 
  Trash2, 
  RotateCcw,
  Plus,
  Layers,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { MaterialRequest, RequestItem, UserProfile } from '../types';

interface MyRequestsTabProps {
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  selectedSector: string;
  userProfile: UserProfile | null;
  onEditRequest: (req: MaterialRequest) => void;
  onDeleteRequest: (requestId: string) => void;
  onPrintRequest: (req: MaterialRequest) => void;
  onOpenDevolutionModal: (req: MaterialRequest) => void;
  onNavigateToNewRequest: () => void;
}

export const MyRequestsTab: React.FC<MyRequestsTabProps> = ({
  requests,
  allRequestItems,
  selectedSector,
  userProfile,
  onEditRequest,
  onDeleteRequest,
  onPrintRequest,
  onOpenDevolutionModal,
  onNavigateToNewRequest
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  // Sector's active requests - strictly isolated for Leaders / non-admin to what is registered in their user profile
  const sectorRequests = useMemo(() => {
    const isAdmin = userProfile?.role === 'ADMIN';
    const userSectors = (userProfile?.allowedSectors && userProfile.allowedSectors.length > 0)
      ? userProfile.allowedSectors
      : [userProfile?.sector].filter(Boolean) as string[];

    return requests.filter(r => {
      if (r.deletedAt || r.isReturn) return false;

      // Almoxarifado / Patrimônio has full visibility
      if (isAdmin) {
        return !selectedSector || selectedSector === 'all' || r.sector === selectedSector;
      }

      // Leaders / Setores ONLY have access to what is registered in their user profile
      const belongsToUser = userSectors.includes(r.sector) || 
        (Boolean(r.requesterEmail) && r.requesterEmail?.toLowerCase() === userProfile?.email?.toLowerCase());

      if (!belongsToUser) return false;

      // If a sector filter is active, ensure it belongs to user's allowed sectors
      if (selectedSector && selectedSector !== 'all') {
        return r.sector === selectedSector;
      }

      return true;
    });
  }, [requests, selectedSector, userProfile]);

  // Filtered list
  const filteredRequests = useMemo(() => {
    return sectorRequests.filter(req => {
      if (statusFilter !== 'TODOS') {
        if (statusFilter === 'EM_SEPARACAO') {
          if (req.status !== 'EM_SEPARACAO' && req.status !== 'SEPARADO') return false;
        } else if (req.status !== statusFilter) {
          return false;
        }
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesId = req.id.toLowerCase().includes(term);
        const matchesObs = (req.observation || '').toLowerCase().includes(term);
        const matchesAdminObs = (req.adminObservation || '').toLowerCase().includes(term);
        
        const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
        const matchesItems = reqItems.some(ri => ri.product_name.toLowerCase().includes(term));

        if (!matchesId && !matchesObs && !matchesAdminObs && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [sectorRequests, statusFilter, searchTerm, allRequestItems]);

  const getStatusBadge = (status: MaterialRequest['status']) => {
    switch (status) {
      case 'PENDENTE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
            <Clock size={12} className="text-amber-600" /> Pendente no Almoxarifado
          </span>
        );
      case 'EM_SEPARACAO':
      case 'SEPARADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200/80">
            <Layers size={12} className="text-blue-600" /> Em Separação
          </span>
        );
      case 'APROVADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200/80">
            <CheckCircle2 size={12} className="text-indigo-600" /> Aprovado
          </span>
        );
      case 'ENTREGUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
            <PackageCheck size={12} className="text-emerald-600" /> Entregue ao Setor
          </span>
        );
      case 'RECUSADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200/80">
            <XCircle size={12} className="text-rose-600" /> Não Atendido / Recusado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card with action */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">
            Minhas Solicitações de Materiais
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Acompanhe em tempo real o status de atendimento e entrega dos pedidos do setor <strong className="text-blue-700">{selectedSector}</strong>.
          </p>
        </div>

        <button
          onClick={onNavigateToNewRequest}
          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/20 transition-all shrink-0"
        >
          <Plus size={16} /> Nova Solicitação
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código ou material..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Filtrar por Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-2 rounded-xl focus:outline-none cursor-pointer w-full md:w-auto"
          >
            <option value="TODOS">Todas as Solicitações</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="EM_SEPARACAO">Em Separação</option>
            <option value="ENTREGUE">Entregues</option>
            <option value="RECUSADO">Recusadas</option>
          </select>
        </div>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
          <FileText size={32} className="text-slate-300 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-800">Nenhuma solicitação encontrada</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Você ainda não realizou solicitações com esses filtros para o setor {selectedSector}.
          </p>
          <button
            onClick={onNavigateToNewRequest}
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all"
          >
            <Plus size={14} /> Fazer Primeira Solicitação
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map(req => {
            const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
            const isPending = req.status === 'PENDENTE';
            const isDelivered = req.status === 'ENTREGUE';
            const isExpanded = expandedRequestId === req.id;

            return (
              <div
                key={req.id}
                className="bg-white rounded-3xl border border-slate-200/90 p-5 lg:p-6 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-xl">
                      #{req.id.slice(-6).toUpperCase()}
                    </span>
                    {getStatusBadge(req.status)}
                    <span className="text-xs text-slate-400 font-medium">
                      {new Date(req.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPrintRequest(req)}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all border border-slate-200"
                      title="Imprimir Guia"
                    >
                      <Printer size={15} />
                    </button>

                    {isPending && (
                      <>
                        <button
                          onClick={() => onEditRequest(req)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition-all"
                        >
                          <Edit3 size={13} /> Editar
                        </button>
                        <button
                          onClick={() => onDeleteRequest(req.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-all"
                          title="Cancelar Solicitação"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}

                    {isDelivered && (
                      <button
                        onClick={() => onOpenDevolutionModal(req)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-bold transition-all"
                      >
                        <RotateCcw size={13} /> Devolver Materiais
                      </button>
                    )}
                  </div>
                </div>

                {/* Items preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Itens Solicitados ({reqItems.length}):
                    </span>
                    <button
                      onClick={() => setExpandedRequestId(isExpanded ? null : req.id)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      {isExpanded ? <>Recolher <ChevronUp size={14} /></> : <>Ver todos os itens <ChevronDown size={14} /></>}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {(isExpanded ? reqItems : reqItems.slice(0, 3)).map(item => (
                      <div key={item.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs flex items-center justify-between">
                        <span className="font-semibold text-slate-800 truncate pr-2">{item.product_name}</span>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {item.quantity_requested} un.
                          </span>
                          {isDelivered && (
                            <span className="block text-[10px] text-emerald-700 font-extrabold mt-0.5">
                              Entregue: {item.quantity_approved} un.
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {!isExpanded && reqItems.length > 3 && (
                    <p className="text-[11px] text-slate-400 font-semibold cursor-pointer" onClick={() => setExpandedRequestId(req.id)}>
                      +{reqItems.length - 3} outros itens nesta solicitação...
                    </p>
                  )}
                </div>

                {/* Observations if any */}
                {(req.observation || req.adminObservation) && (
                  <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {req.observation && (
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <span className="font-bold text-slate-500 uppercase text-[10px] block">Sua Observação:</span>
                        <p className="text-slate-700 italic mt-0.5">"{req.observation}"</p>
                      </div>
                    )}
                    {req.adminObservation && (
                      <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
                        <span className="font-bold text-blue-800 uppercase text-[10px] block">Resposta do Almoxarifado:</span>
                        <p className="text-blue-900 font-medium mt-0.5">{req.adminObservation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
