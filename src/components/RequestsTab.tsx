import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  PackageCheck, 
  XCircle, 
  Printer, 
  Trash2, 
  Eye, 
  Layers, 
  Lock, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Copy, 
  ChevronLeft, 
  ChevronRight, 
  User, 
  MessageSquare, 
  AlertCircle,
  Table as TableIcon,
  LayoutGrid,
  Download
} from 'lucide-react';
import { MaterialRequest, RequestItem, Item } from '../types';

interface RequestsTabProps {
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  items: Item[];
  onOpenDetail: (request: MaterialRequest) => void;
  onPrintRequest: (request: MaterialRequest) => void;
  onPrintFinalDeliverySheet?: (request: MaterialRequest) => void;
  onDeleteRequest: (requestId: string) => void;
  onDeliverRequest: (requestId: string, items: RequestItem[]) => void;
  onApproveRequest: (requestId: string, items: RequestItem[]) => void;
  onRejectRequest: (requestId: string) => void;
  sectors: string[];
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onExportPDF?: () => void;
  appLogo?: string | null;
  appRectangularLogo?: string | null;
}

export const RequestsTab: React.FC<RequestsTabProps> = ({
  requests,
  allRequestItems,
  items,
  onOpenDetail,
  onPrintRequest,
  onPrintFinalDeliverySheet,
  onDeleteRequest,
  showToast,
  onExportPDF,
  appLogo,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
  // UI & Pagination States
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(20);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active requests (not in trash and not returns)
  const activeRequests = useMemo(() => {
    return requests.filter(r => !r.deletedAt && !r.isReturn);
  }, [requests]);

  // Sorted requests (most recent first)
  const filteredRequests = useMemo(() => {
    return [...activeRequests].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeRequests]);

  // Reset page when count changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeRequests.length]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage));
  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRequests.slice(start, start + itemsPerPage);
  }, [filteredRequests, currentPage, itemsPerPage]);

  // Check if request is approved or processed (cannot be deleted)
  const isRequestApproved = (req: MaterialRequest) => {
    return (
      req.status === 'APROVADO' || 
      req.status === 'ENTREGUE' || 
      req.status === 'EM_SEPARACAO' || 
      req.status === 'SEPARADO' ||
      req.status === 'DEVOLUCAO_APROVADA'
    );
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    if (showToast) showToast(`Código #${id.slice(-6).toUpperCase()} copiado!`, 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpand = (id: string) => {
    setExpandedRequests(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusBadge = (status: MaterialRequest['status']) => {
    switch (status) {
      case 'PENDENTE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200/90 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <Clock size={13} className="text-amber-600" /> Pendente
          </span>
        );
      case 'EM_SEPARACAO':
      case 'SEPARADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200/90 shadow-xs">
            <Layers size={13} className="text-blue-600" /> Em Separação
          </span>
        );
      case 'APROVADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-200/90 shadow-xs">
            <CheckCircle2 size={13} className="text-indigo-600" /> Aprovado
          </span>
        );
      case 'ENTREGUE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-xs">
            <PackageCheck size={13} className="text-emerald-600" /> Entregue
          </span>
        );
      case 'RECUSADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-900 border border-rose-200/90 shadow-xs">
            <XCircle size={13} className="text-rose-600" /> Recusado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  const getWorkflowStep = (status: MaterialRequest['status']) => {
    if (status === 'PENDENTE') return 1;
    if (status === 'EM_SEPARACAO' || status === 'SEPARADO') return 2;
    if (status === 'APROVADO' || status === 'ENTREGUE') return 3;
    return 0; // Recusado or other
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {appLogo ? (
            <div className="w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-blue-100 p-0.5 shadow-sm flex items-center justify-center shrink-0 ring-2 ring-blue-500/10">
              <img src={appLogo} alt="Logo Policlínica" className="w-full h-full object-contain rounded-full" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white font-black text-sm flex items-center justify-center shadow-md shadow-blue-500/20 ring-4 ring-blue-50 shrink-0">
              MM
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md">
                Policlínica ALMOXARIFADO
              </span>
              <span className="text-xs font-semibold text-slate-400">
                • {activeRequests.length} solicitações cadastradas
              </span>
            </div>
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              Solicitações de Materiais
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-auto">
          {/* Export PDF Action */}
          {onExportPDF && (
            <button
              onClick={onExportPDF}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm shadow-rose-600/20 cursor-pointer active:scale-95"
              title="Exportar Relatório PDF com todas as solicitações"
            >
              <Download size={14} />
              <span>Exportar PDF</span>
            </button>
          )}

          {/* View Mode Toggle: Table vs Cards */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Visualização em Tabela"
            >
              <TableIcon size={14} />
              <span>Tabela</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Visualização em Cards"
            >
              <LayoutGrid size={14} />
              <span>Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* Requests List: Table View or Cards View */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <FileText size={30} />
          </div>
          <h3 className="text-base font-bold text-slate-800">Nenhuma solicitação encontrada</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Não há solicitações cadastradas no momento.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* Modern White Card Table View */
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4 sm:px-5">Nº / Protocolo</th>
                  <th className="py-3.5 px-4">Data / Hora</th>
                  <th className="py-3.5 px-4">Setor Solicitante</th>
                  <th className="py-3.5 px-4">Solicitante</th>
                  <th className="py-3.5 px-4">Itens Solicitados</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 sm:px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginatedRequests.map(req => {
                  const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
                  const totalRequested = reqItems.reduce((acc, i) => acc + (i.quantity_requested || 0), 0);
                  const isApproved = isRequestApproved(req);
                  const isExpanded = !!expandedRequests[req.id];

                  return (
                    <React.Fragment key={req.id}>
                      <tr className="hover:bg-blue-50/40 transition-colors group">
                        {/* Column 1: Request Protocol / Number */}
                        <td className="py-3.5 px-4 sm:px-5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-slate-900 bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-900 px-2 py-0.5 rounded-lg text-xs tracking-tight transition-colors">
                              #{req.id.slice(-6).toUpperCase()}
                            </span>
                            <button
                              onClick={() => handleCopyId(req.id)}
                              className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-200 transition-colors"
                              title="Copiar ID completo"
                            >
                              {copiedId === req.id ? (
                                <Check size={12} className="text-emerald-600" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Column 2: Date & Time */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          <div className="font-semibold text-slate-800">
                            {new Date(req.date).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {new Date(req.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        {/* Column 3: Sector */}
                        <td className="py-3.5 px-4">
                          <span className="inline-block text-xs font-black text-blue-900 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                            {req.sector}
                          </span>
                        </td>

                        {/* Column 4: Requester */}
                        <td className="py-3.5 px-4 max-w-[200px]">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300 text-slate-700 font-extrabold text-[10px] flex items-center justify-center shrink-0">
                              {(req.requesterEmail || 'U').charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate font-medium text-slate-700" title={req.requesterEmail}>
                              {req.requesterEmail || 'Não informado'}
                            </span>
                          </div>
                        </td>

                        {/* Column 5: Items Preview */}
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => toggleExpand(req.id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-blue-700 transition-colors group/btn"
                          >
                            <span className="bg-slate-100 group-hover/btn:bg-blue-100 text-slate-800 group-hover/btn:text-blue-900 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold">
                              {reqItems.length} {reqItems.length === 1 ? 'item' : 'itens'} ({totalRequested} un)
                            </span>
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                          {reqItems.length > 0 && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[220px] mt-0.5">
                              {reqItems.map(i => `${i.product_name} (${i.quantity_requested})`).join(', ')}
                            </p>
                          )}
                        </td>

                        {/* Column 6: Status Badge */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {getStatusBadge(req.status)}
                        </td>

                        {/* Column 7: Actions */}
                        <td className="py-3.5 px-4 sm:px-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onOpenDetail(req)}
                              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                              title="Ver detalhes da solicitação"
                            >
                              <Eye size={13} />
                              <span className="hidden sm:inline">Detalhes</span>
                            </button>

                            <button
                              onClick={() => (req.status === 'ENTREGUE' && onPrintFinalDeliverySheet) ? onPrintFinalDeliverySheet(req) : onPrintRequest(req)}
                              className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg transition-all shadow-xs cursor-pointer"
                              title={req.status === 'ENTREGUE' ? "Imprimir Folha Final de Entrega" : "Imprimir Guia de Separação Física"}
                            >
                              <Printer size={14} />
                            </button>

                            {isApproved ? (
                              <button
                                disabled
                                className="p-1.5 bg-slate-100 text-slate-300 rounded-lg cursor-not-allowed opacity-50"
                                title="Solicitações aprovadas ou entregues não podem ser apagadas"
                              >
                                <Lock size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => onDeleteRequest(req.id)}
                                className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg transition-all shadow-xs cursor-pointer"
                                title="Enviar para a lixeira"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Sub-row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-100">
                          <td colSpan={7} className="p-4 sm:p-5">
                            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-inner/5">
                              <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                                <span className="font-extrabold text-slate-800">
                                  Relação de Itens da Solicitação ({reqItems.length})
                                </span>
                                {req.observation && (
                                  <span className="text-slate-500 italic text-[11px] truncate max-w-md">
                                    Obs: "{req.observation}"
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                                {reqItems.map(item => (
                                  <div key={item.id || item.product_name} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                                    <span className="font-bold text-slate-800 truncate mr-2" title={item.product_name}>
                                      {item.product_name}
                                    </span>
                                    <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 shrink-0">
                                      {item.quantity_requested} un
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div className="space-y-4">
          {paginatedRequests.map(req => {
            const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
            const totalRequested = reqItems.reduce((acc, i) => acc + (i.quantity_requested || 0), 0);
            const totalApproved = reqItems.reduce((acc, i) => acc + (i.quantity_approved || 0), 0);
            const isApproved = isRequestApproved(req);
            const isExpanded = !!expandedRequests[req.id];
            const step = getWorkflowStep(req.status);

            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:border-blue-300 hover:shadow-md transition-all overflow-hidden"
              >
                {/* Top request bar */}
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Column: Identification and Sector */}
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {/* Header tags */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Request ID Code with Copy */}
                      <button
                        onClick={() => handleCopyId(req.id)}
                        className="group inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-lg text-xs font-black transition-all"
                        title="Clique para copiar o ID completo"
                      >
                        <span>#{req.id.slice(-6).toUpperCase()}</span>
                        {copiedId === req.id ? (
                          <Check size={12} className="text-emerald-600" />
                        ) : (
                          <Copy size={12} className="text-slate-400 group-hover:text-slate-700" />
                        )}
                      </button>

                      {/* Sector Badge */}
                      <span className="text-xs font-extrabold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                        {req.sector}
                      </span>

                      {/* Status Badge */}
                      {getStatusBadge(req.status)}

                      {/* Lock indicator if approved */}
                      {isApproved && (
                        <span 
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200"
                          title="Solicitações aprovadas ou entregues estão protegidas contra exclusão"
                        >
                          <Lock size={11} className="text-slate-500" />
                          <span className="hidden sm:inline">Exclusão Bloqueada</span>
                        </span>
                      )}

                      {/* Timestamp */}
                      <span className="text-[11px] font-medium text-slate-400 ml-auto lg:ml-0">
                        {new Date(req.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>

                    {/* Requester and observations */}
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-slate-400" />
                        <span className="text-slate-500">Solicitante:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[220px]">
                          {req.requesterEmail || 'Não informado'}
                        </span>
                      </div>

                      {req.observation && (
                        <div className="flex items-center gap-1 text-slate-600 italic truncate max-w-md">
                          <MessageSquare size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate">"{req.observation}"</span>
                        </div>
                      )}
                    </div>

                    {/* Almoxarifado notes if present */}
                    {req.adminObservation && (
                      <div className="bg-blue-50/60 border border-blue-100 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 text-blue-900">
                        <span className="font-extrabold uppercase text-[10px] text-blue-700 shrink-0">Almoxarifado:</span>
                        <span className="font-medium truncate">{req.adminObservation}</span>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 shrink-0">
                    {/* View items toggle */}
                    <button
                      onClick={() => toggleExpand(req.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-xs"
                    >
                      <Layers size={14} className="text-slate-500" />
                      <span>{reqItems.length} {reqItems.length === 1 ? 'item' : 'itens'}</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {/* Open Modal Detail */}
                    <button
                      onClick={() => onOpenDetail(req)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-600/10 cursor-pointer"
                    >
                      <Eye size={14} /> Detalhes
                    </button>

                    {/* Print single request guide */}
                    <button
                      onClick={() => (req.status === 'ENTREGUE' && onPrintFinalDeliverySheet) ? onPrintFinalDeliverySheet(req) : onPrintRequest(req)}
                      className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl transition-all shadow-xs cursor-pointer"
                      title={req.status === 'ENTREGUE' ? "Imprimir Folha Final de Entrega" : "Imprimir Guia de Separação Física"}
                    >
                      <Printer size={15} />
                    </button>

                    {/* Delete Request: strictly forbidden if approved */}
                    {isApproved ? (
                      <div className="relative group">
                        <button
                          disabled
                          className="p-2 bg-slate-100/70 text-slate-300 border border-slate-200/60 rounded-xl cursor-not-allowed transition-all opacity-60 flex items-center justify-center"
                          title="Solicitações aprovadas ou entregues não podem ser apagadas"
                        >
                          <Lock size={15} className="text-slate-400" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onDeleteRequest(req.id)}
                        className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl transition-all shadow-xs cursor-pointer"
                        title="Mover solicitação pendente para a lixeira"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Workflow Stepper Line */}
                <div className="px-4 sm:px-5 pb-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                    {/* Step 1: Criada */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${step >= 1 ? 'bg-amber-500' : 'bg-slate-300'}`} />
                      <span className={step >= 1 ? 'text-slate-800 font-bold' : 'text-slate-400'}>1. Solicitada</span>
                    </div>

                    <div className={`flex-1 h-0.5 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-slate-200'}`} />

                    {/* Step 2: Separação */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-slate-300'}`} />
                      <span className={step >= 2 ? 'text-slate-800 font-bold' : 'text-slate-400'}>2. Separação</span>
                    </div>

                    <div className={`flex-1 h-0.5 rounded-full ${step >= 3 ? 'bg-emerald-500' : 'bg-slate-200'}`} />

                    {/* Step 3: Aprovada / Entregue */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${step >= 3 ? 'bg-emerald-600' : req.status === 'RECUSADO' ? 'bg-rose-500' : 'bg-slate-300'}`} />
                      <span className={step >= 3 ? 'text-emerald-700 font-bold' : req.status === 'RECUSADO' ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                        {req.status === 'RECUSADO' ? 'Recusada' : req.status === 'ENTREGUE' ? '3. Entregue' : '3. Aprovada'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded In-Card Items List */}
                {isExpanded && (
                  <div className="bg-slate-50/80 p-4 sm:p-5 border-t border-slate-200/80 space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>Relação Detalhada de Materiais ({reqItems.length} itens, {totalRequested} un. solicitadas)</span>
                      {req.status === 'ENTREGUE' && (
                        <span className="text-emerald-700 font-extrabold">{totalApproved} un. entregues</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {reqItems.map(item => {
                        const stockItems = items.filter(i => i.name === item.product_name && !i.deletedAt);
                        const totalStock = stockItems.reduce((acc, i) => acc + (i.quantity || 0), 0);

                        return (
                          <div
                            key={item.id}
                            className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs flex items-center justify-between text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-slate-800 truncate" title={item.product_name}>
                                {item.product_name}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                Estoque atual: <strong className={totalStock < item.quantity_requested ? 'text-rose-600' : 'text-slate-700'}>{totalStock} un.</strong>
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 block text-center">
                                {item.quantity_requested} un.
                              </span>
                              {item.quantity_approved !== undefined && item.quantity_approved !== null && item.quantity_approved !== item.quantity_requested && (
                                <span className="text-[10px] font-extrabold text-blue-700 block mt-0.5">
                                  Aprov: {item.quantity_approved} un.
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p className="text-slate-500 font-medium text-center sm:text-left">
            Mostrando página <strong className="text-slate-800">{currentPage}</strong> de <strong className="text-slate-800">{totalPages}</strong> (Total: {filteredRequests.length} solicitações)
          </p>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Página Anterior"
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = i + 1;
              if (totalPages > 5) {
                if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-xl font-bold transition-all ${
                    currentPage === pageNum
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Próxima Página"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
