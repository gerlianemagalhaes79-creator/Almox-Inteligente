import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  ShieldCheck, 
  Package, 
  FileText, 
  Clock, 
  CheckCircle2, 
  RotateCcw, 
  Printer, 
  Plus, 
  TrendingUp, 
  Award, 
  Layers, 
  ExternalLink,
  ChevronRight,
  UserCheck,
  Building2,
  Mail,
  Calendar
} from 'lucide-react';
import { MaterialRequest, RequestItem, Item, UserProfile } from '../types';

interface LeadersSystemTabProps {
  usersList: UserProfile[];
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  items: Item[];
  sectors: string[];
  onOpenRequestDetail: (req: MaterialRequest) => void;
  onPrintRequest: (req: MaterialRequest) => void;
  onNavigateToNewRequestForSector: (sector: string) => void;
  onSelectSector: (sector: string) => void;
}

export const LeadersSystemTab: React.FC<LeadersSystemTabProps> = ({
  usersList,
  requests,
  allRequestItems,
  items,
  sectors,
  onOpenRequestDetail,
  onPrintRequest,
  onNavigateToNewRequestForSector,
  onSelectSector
}) => {
  // Filter registered leaders / sector users
  const leadersList = useMemo(() => {
    return usersList.filter(u => u.role === 'LÍDER' || u.role === 'SETOR');
  }, [usersList]);

  // Selected leader state (default to first leader or null)
  const [selectedLeaderEmail, setSelectedLeaderEmail] = useState<string>(
    leadersList[0]?.email || ''
  );
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('all');
  const [leaderSearch, setLeaderSearch] = useState<string>('');
  const [activeLeaderSubTab, setActiveLeaderSubTab] = useState<'requests' | 'delivered_stock' | 'devolutions' | 'stats'>('requests');

  // Filtered leaders
  const filteredLeaders = useMemo(() => {
    return leadersList.filter(l => {
      if (leaderSearch.trim()) {
        const term = leaderSearch.toLowerCase();
        const matchesName = (l.name || '').toLowerCase().includes(term);
        const matchesEmail = (l.email || '').toLowerCase().includes(term);
        const matchesSectors = (l.allowedSectors || [l.sector]).some(s => (s || '').toLowerCase().includes(term));
        if (!matchesName && !matchesEmail && !matchesSectors) return false;
      }
      if (selectedSectorFilter !== 'all') {
        const hasSector = (l.allowedSectors || [l.sector]).includes(selectedSectorFilter);
        if (!hasSector) return false;
      }
      return true;
    });
  }, [leadersList, leaderSearch, selectedSectorFilter]);

  // Current active leader profile
  const currentLeader = useMemo(() => {
    return leadersList.find(l => l.email === selectedLeaderEmail) || filteredLeaders[0] || null;
  }, [leadersList, selectedLeaderEmail, filteredLeaders]);

  // Current leader sectors
  const currentLeaderSectors = useMemo(() => {
    if (!currentLeader) return [];
    return (currentLeader.allowedSectors && currentLeader.allowedSectors.length > 0)
      ? currentLeader.allowedSectors
      : [currentLeader.sector].filter(Boolean) as string[];
  }, [currentLeader]);

  // Requests associated with current leader (either made by this leader email or for their sectors)
  const leaderRequests = useMemo(() => {
    if (!currentLeader) return [];
    return requests.filter(r => {
      if (r.deletedAt) return false;
      const matchesEmail = r.requesterEmail?.toLowerCase() === currentLeader.email?.toLowerCase();
      const matchesSector = currentLeaderSectors.includes(r.sector);
      return matchesEmail || matchesSector;
    });
  }, [requests, currentLeader, currentLeaderSectors]);

  // Normal requests vs Devolutions
  const normalRequests = useMemo(() => {
    return leaderRequests.filter(r => !r.isReturn && !r.status?.startsWith('DEVOLUCAO_'));
  }, [leaderRequests]);

  const leaderDevolutions = useMemo(() => {
    return leaderRequests.filter(r => r.isReturn || r.status?.startsWith('DEVOLUCAO_'));
  }, [leaderRequests]);

  // Delivered items in possession of this leader's sector(s)
  const deliveredItems = useMemo(() => {
    const productMap = new Map<string, {
      product_name: string;
      totalDelivered: number;
      totalReturned: number;
      lastDeliveredDate: string;
      sectors: Set<string>;
    }>();

    normalRequests.filter(r => r.status === 'ENTREGUE').forEach(deliv => {
      const dItems = allRequestItems.filter(ri => ri.request_id === deliv.id);
      dItems.forEach(item => {
        const qtyApproved = item.quantity_approved || 0;
        const qtyReturned = item.quantity_returned || 0;
        const existing = productMap.get(item.product_name);
        if (existing) {
          existing.totalDelivered += qtyApproved;
          existing.totalReturned += qtyReturned;
          existing.sectors.add(deliv.sector);
          if (new Date(deliv.date) > new Date(existing.lastDeliveredDate)) {
            existing.lastDeliveredDate = deliv.date;
          }
        } else {
          productMap.set(item.product_name, {
            product_name: item.product_name,
            totalDelivered: qtyApproved,
            totalReturned: qtyReturned,
            lastDeliveredDate: deliv.date,
            sectors: new Set([deliv.sector])
          });
        }
      });
    });

    return Array.from(productMap.values()).map(p => ({
      ...p,
      sectorsList: Array.from(p.sectors),
      currentBalance: Math.max(0, p.totalDelivered - p.totalReturned)
    })).sort((a, b) => b.currentBalance - a.currentBalance);
  }, [normalRequests, allRequestItems]);

  // Leader Performance Stats
  const leaderStats = useMemo(() => {
    const total = normalRequests.length;
    const delivered = normalRequests.filter(r => r.status === 'ENTREGUE').length;
    const pending = normalRequests.filter(r => r.status === 'PENDENTE').length;
    const inSeparation = normalRequests.filter(r => r.status === 'EM_SEPARACAO' || r.status === 'SEPARADO').length;

    const requestedMap = new Map<string, number>();
    normalRequests.forEach(r => {
      const rItems = allRequestItems.filter(ri => ri.request_id === r.id);
      rItems.forEach(ri => {
        requestedMap.set(ri.product_name, (requestedMap.get(ri.product_name) || 0) + (ri.quantity_requested || 0));
      });
    });

    const topRequested = Array.from(requestedMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      total,
      delivered,
      pending,
      inSeparation,
      devolutionsCount: leaderDevolutions.length,
      fulfillmentRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
      topRequested
    };
  }, [normalRequests, leaderDevolutions, allRequestItems]);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-3xl p-6 lg:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-300 text-xs font-black uppercase tracking-widest mb-1">
            <ShieldCheck size={18} className="text-blue-400" /> Acesso Total do Patrimônio & Almoxarifado
          </div>
          <h2 className="text-xl lg:text-3xl font-black tracking-tight">Sistema dos Líderes de Setor</h2>
          <p className="text-xs text-slate-300/80 mt-1 max-w-2xl leading-relaxed">
            Como gestores do patrimônio, o almoxarifado tem acesso integral a tudo. Aqui você pode inspecionar individualmente o sistema de cada líder, seus pedidos, materiais entregues, devoluções e índices de consumo.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 flex items-center gap-6 shrink-0">
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-200 block">Líderes Cadastrados</span>
            <span className="text-2xl font-black text-white">{leadersList.length}</span>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-200 block">Total de Setores</span>
            <span className="text-2xl font-black text-amber-300">{sectors.length}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Leaders List on Left, Active Leader System on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Leader Selector (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                <Users size={16} className="text-blue-600" /> Selecionar Líder / Setor
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                {filteredLeaders.length} encontrados
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, e-mail ou setor..."
                value={leaderSearch}
                onChange={(e) => setLeaderSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Sector Filter */}
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-slate-400 shrink-0" />
              <select
                value={selectedSectorFilter}
                onChange={(e) => setSelectedSectorFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-2.5 py-1.5 rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="all">Todos os Setores</option>
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Leaders List */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
            {filteredLeaders.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Users size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs font-bold">Nenhum líder cadastrado com esses filtros.</p>
                <p className="text-[11px] text-slate-400 mt-1">Cadastre líderes na aba de Usuários.</p>
              </div>
            ) : (
              filteredLeaders.map(leader => {
                const isSelected = currentLeader?.email === leader.email;
                const leaderSectors = (leader.allowedSectors && leader.allowedSectors.length > 0)
                  ? leader.allowedSectors
                  : [leader.sector].filter(Boolean);

                const countReqs = requests.filter(r => 
                  !r.deletedAt && (
                    r.requesterEmail?.toLowerCase() === leader.email?.toLowerCase() ||
                    leaderSectors.includes(r.sector)
                  )
                ).length;

                return (
                  <button
                    key={leader.id || leader.email}
                    onClick={() => setSelectedLeaderEmail(leader.email)}
                    className={`w-full p-3.5 text-left transition-all flex items-start justify-between gap-3 ${
                      isSelected 
                        ? 'bg-blue-50/80 border-l-4 border-blue-600' 
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-slate-900 truncate">
                          {leader.name || 'Sem Nome'}
                        </span>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                          leader.role === 'LÍDER' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {leader.role || 'SETOR'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{leader.email}</p>
                      
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {leaderSectors.map(s => (
                          <span key={s} className="bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        {countReqs} {countReqs === 1 ? 'pedido' : 'pedidos'}
                      </span>
                      <ChevronRight size={14} className={`mt-2 ml-auto ${isSelected ? 'text-blue-600' : 'text-slate-300'}`} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Leader's Entire System (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {currentLeader ? (
            <>
              {/* Leader Profile Hero Card */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-800 text-white font-black text-lg flex items-center justify-center shadow-md">
                      {currentLeader.name ? currentLeader.name.slice(0, 2).toUpperCase() : 'LD'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-slate-900">{currentLeader.name}</h3>
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                          {currentLeader.role === 'LÍDER' ? 'Líder de Setor' : 'Colaborador de Setor'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1"><Mail size={12} /> {currentLeader.email}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions for Patrimônio */}
                  <div className="flex flex-wrap items-center gap-2">
                    {currentLeaderSectors.length > 0 && (
                      <button
                        onClick={() => {
                          const sec = currentLeaderSectors[0];
                          onSelectSector(sec);
                          onNavigateToNewRequestForSector(sec);
                        }}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <Plus size={14} /> Fazer Pedido p/ este Líder
                      </button>
                    )}
                  </div>
                </div>

                {/* Assigned Sectors Badges */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-extrabold uppercase text-slate-400 text-[10px]">Setor(es) Autorizado(s):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentLeaderSectors.map(sec => (
                      <span key={sec} className="bg-slate-100 text-slate-800 font-extrabold px-2.5 py-1 rounded-xl border border-slate-200 flex items-center gap-1">
                        <Building2 size={12} className="text-blue-600" /> {sec}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Quick KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Pedidos</span>
                    <span className="text-lg font-black text-slate-800">{leaderStats.total}</span>
                  </div>
                  <div className="bg-amber-50/60 p-3 rounded-2xl border border-amber-100">
                    <span className="text-[10px] uppercase font-bold text-amber-600 block">Pendentes</span>
                    <span className="text-lg font-black text-amber-700">{leaderStats.pending}</span>
                  </div>
                  <div className="bg-emerald-50/60 p-3 rounded-2xl border border-emerald-100">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block">Entregues</span>
                    <span className="text-lg font-black text-emerald-700">{leaderStats.delivered}</span>
                  </div>
                  <div className="bg-blue-50/60 p-3 rounded-2xl border border-blue-100">
                    <span className="text-[10px] uppercase font-bold text-blue-600 block">Atendimento</span>
                    <span className="text-lg font-black text-blue-700">{leaderStats.fulfillmentRate}%</span>
                  </div>
                </div>
              </div>

              {/* Subtabs for inspecting this Leader's views */}
              <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                <button
                  onClick={() => setActiveLeaderSubTab('requests')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                    activeLeaderSubTab === 'requests'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <FileText size={14} /> Solicitações do Líder ({normalRequests.length})
                </button>

                <button
                  onClick={() => setActiveLeaderSubTab('delivered_stock')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                    activeLeaderSubTab === 'delivered_stock'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Package size={14} /> Materiais Entregues / Em Posse ({deliveredItems.length})
                </button>

                <button
                  onClick={() => setActiveLeaderSubTab('devolutions')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                    activeLeaderSubTab === 'devolutions'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <RotateCcw size={14} /> Devoluções ({leaderDevolutions.length})
                </button>

                <button
                  onClick={() => setActiveLeaderSubTab('stats')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                    activeLeaderSubTab === 'stats'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <TrendingUp size={14} /> Indicadores de Consumo
                </button>
              </div>

              {/* Subtab 1: Leader's Requests */}
              {activeLeaderSubTab === 'requests' && (
                <div className="space-y-3">
                  {normalRequests.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-10 text-center">
                      <FileText size={28} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700">Nenhuma solicitação feita por este líder ou vinculada ao(s) seu(s) setor(es).</p>
                    </div>
                  ) : (
                    normalRequests.map(req => {
                      const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
                      return (
                        <div key={req.id} className="bg-white p-4 lg:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                                #{req.id.slice(-6).toUpperCase()}
                              </span>
                              <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
                                {req.sector}
                              </span>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                req.status === 'ENTREGUE' ? 'bg-emerald-100 text-emerald-800' :
                                req.status === 'PENDENTE' ? 'bg-amber-100 text-amber-800' :
                                req.status === 'RECUSADO' ? 'bg-rose-100 text-rose-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {req.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">
                                {new Date(req.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                              <button
                                onClick={() => onPrintRequest(req)}
                                className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                                title="Imprimir Guia"
                              >
                                <Printer size={14} />
                              </button>
                              <button
                                onClick={() => onOpenRequestDetail(req)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all"
                              >
                                Detalhes / Atender
                              </button>
                            </div>
                          </div>

                          {/* Items */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {reqItems.map(item => (
                              <div key={item.id} className="bg-slate-50 p-2 rounded-xl text-xs flex justify-between items-center">
                                <span className="font-semibold text-slate-800 truncate pr-2">{item.product_name}</span>
                                <span className="font-bold text-slate-900 shrink-0">
                                  {item.quantity_requested} un.
                                  {req.status === 'ENTREGUE' && item.quantity_approved && (
                                    <span className="text-emerald-700 ml-1">({item.quantity_approved} entregue)</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>

                          {req.observation && (
                            <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg">
                              Observação do Líder: "{req.observation}"
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Subtab 2: Delivered Items / Stock in Sector Possession */}
              {activeLeaderSubTab === 'delivered_stock' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h4 className="font-black text-sm text-slate-900">
                      Materiais Entregues sob Responsabilidade deste Líder
                    </h4>
                    <span className="text-xs font-bold text-slate-400">
                      {deliveredItems.length} materiais distintos
                    </span>
                  </div>

                  {deliveredItems.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">Nenhuma entrega registrada ainda para o setor deste líder.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {deliveredItems.map((prod, idx) => (
                        <div key={idx} className="py-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="font-extrabold text-slate-800 block truncate">{prod.product_name}</span>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                              <span>Setores: {prod.sectorsList.join(', ')}</span>
                              <span>•</span>
                              <span>Última entrega: {new Date(prod.lastDeliveredDate).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                              Saldo: {prod.currentBalance} un.
                            </span>
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              (Total entregue: {prod.totalDelivered} | Devolvido: {prod.totalReturned})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Subtab 3: Devolutions */}
              {activeLeaderSubTab === 'devolutions' && (
                <div className="space-y-3">
                  {leaderDevolutions.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-10 text-center">
                      <RotateCcw size={28} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700">Nenhuma devolução solicitada por este líder.</p>
                    </div>
                  ) : (
                    leaderDevolutions.map(dev => {
                      const devItems = allRequestItems.filter(ri => ri.request_id === dev.id);
                      return (
                        <div key={dev.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2 text-xs">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg">
                                #{dev.id.slice(-6).toUpperCase()}
                              </span>
                              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                                {dev.sector}
                              </span>
                              <span className="font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                {dev.status}
                              </span>
                            </div>
                            <span className="text-slate-400">{new Date(dev.date).toLocaleDateString('pt-BR')}</span>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-xl">
                            <span className="font-bold text-slate-500 uppercase text-[10px] block">Motivo Informado pelo Líder:</span>
                            <p className="font-semibold text-slate-800 mt-0.5">{dev.returnReason || 'Não especificado'}</p>
                          </div>

                          <div className="space-y-1 pt-1">
                            <span className="font-bold text-slate-600 block text-[10px] uppercase">Itens da Devolução:</span>
                            {devItems.map(item => (
                              <div key={item.id} className="flex justify-between text-slate-700">
                                <span>{item.product_name}</span>
                                <span className="font-bold text-blue-700">{item.quantity_requested || item.quantity_returned} un.</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Subtab 4: Stats */}
              {activeLeaderSubTab === 'stats' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
                  <div>
                    <h4 className="font-black text-sm text-slate-900">Ranking de Materiais Mais Pedidos por este Líder</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Visão consolidada de consumo para balizar o planejamento de compras do patrimônio.</p>
                  </div>

                  {leaderStats.topRequested.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">Sem dados de consumo para este líder ainda.</p>
                  ) : (
                    <div className="space-y-3">
                      {leaderStats.topRequested.map((item, idx) => (
                        <div key={item.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-black text-[10px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-800 truncate">{item.name}</span>
                          </div>
                          <span className="font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 shrink-0">
                            {item.qty} un. solicitadas
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-16 text-center">
              <UserCheck size={36} className="text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-800">Selecione um líder ao lado</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Escolha um líder de setor na lista para visualizar o sistema e todos os dados patrimoniais vinculados a ele.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
