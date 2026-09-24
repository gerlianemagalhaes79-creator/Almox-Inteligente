import * as React from 'react';
import { useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  PackageCheck, 
  Clock, 
  FileText, 
  Layers, 
  RotateCcw,
  Sparkles,
  Award
} from 'lucide-react';
import { MaterialRequest, RequestItem, UserProfile } from '../types';

interface LeaderStatsTabProps {
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  selectedSector: string;
  userProfile: UserProfile | null;
}

export const LeaderStatsTab: React.FC<LeaderStatsTabProps> = ({
  requests,
  allRequestItems,
  selectedSector,
  userProfile
}) => {
  // Sector requests - strictly isolated for Leaders / non-admin to their user profile
  const sectorRequests = useMemo(() => {
    const isAdmin = userProfile?.role === 'ADMIN';
    const userSectors = (userProfile?.allowedSectors && userProfile.allowedSectors.length > 0)
      ? userProfile.allowedSectors
      : [userProfile?.sector].filter(Boolean) as string[];

    return requests.filter(r => {
      if (r.deletedAt) return false;

      // Almoxarifado / Patrimônio sees all
      if (isAdmin) {
        return !selectedSector || selectedSector === 'all' || r.sector === selectedSector;
      }

      // Leaders / Setores ONLY see what is registered in their user profile
      const belongsToUser = userSectors.includes(r.sector) || 
        (Boolean(r.requesterEmail) && r.requesterEmail?.toLowerCase() === userProfile?.email?.toLowerCase());

      if (!belongsToUser) return false;

      if (selectedSector && selectedSector !== 'all') {
        return r.sector === selectedSector;
      }

      return true;
    });
  }, [requests, selectedSector, userProfile]);

  // Overall metrics
  const stats = useMemo(() => {
    const totalRequests = sectorRequests.length;
    const delivered = sectorRequests.filter(r => r.status === 'ENTREGUE').length;
    const pending = sectorRequests.filter(r => r.status === 'PENDENTE').length;
    const inSeparation = sectorRequests.filter(r => r.status === 'EM_SEPARACAO' || r.status === 'SEPARADO').length;
    const devolutions = sectorRequests.filter(r => r.isReturn || r.status?.startsWith('DEVOLUCAO_')).length;

    // Calculate total units
    let totalItemsRequested = 0;
    let totalItemsDelivered = 0;

    const requestedMap = new Map<string, number>();
    const deliveredMap = new Map<string, number>();

    sectorRequests.forEach(req => {
      const items = allRequestItems.filter(ri => ri.request_id === req.id);
      items.forEach(item => {
        const reqQty = item.quantity_requested || 0;
        const delivQty = item.quantity_approved || 0;

        totalItemsRequested += reqQty;
        requestedMap.set(item.product_name, (requestedMap.get(item.product_name) || 0) + reqQty);

        if (req.status === 'ENTREGUE') {
          totalItemsDelivered += delivQty;
          deliveredMap.set(item.product_name, (deliveredMap.get(item.product_name) || 0) + delivQty);
        }
      });
    });

    const topRequested = Array.from(requestedMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    const topDelivered = Array.from(deliveredMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    return {
      totalRequests,
      delivered,
      pending,
      inSeparation,
      devolutions,
      totalItemsRequested,
      totalItemsDelivered,
      topRequested,
      topDelivered,
      fulfillmentRate: totalRequests > 0 ? Math.round((delivered / totalRequests) * 100) : 0
    };
  }, [sectorRequests, allRequestItems]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-3xl p-6 lg:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-200 text-xs font-black uppercase tracking-widest mb-1">
            <BarChart3 size={16} /> Painel de Desempenho
          </div>
          <h2 className="text-xl lg:text-2xl font-black">Indicadores do Setor - {selectedSector}</h2>
          <p className="text-xs text-blue-200/80 mt-1 max-w-xl">
            Acompanhe o volume de solicitações, taxa de atendimento pelo almoxarifado e os materiais mais consumidos pelo setor.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 flex items-center gap-4 shrink-0">
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-blue-200 block">Taxa de Atendimento</span>
            <span className="text-3xl font-black text-emerald-300">{stats.fulfillmentRate}%</span>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-400">Total Solicitações</span>
            <FileText size={18} className="text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-800 mt-2">{stats.totalRequests}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{stats.totalItemsRequested} unidades solicitadas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-amber-600">Pendentes</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-700 mt-2">{stats.pending}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Aguardando no Almoxarifado</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-blue-600">Em Separação</span>
            <Layers size={18} className="text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-700 mt-2">{stats.inSeparation}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Em triagem / separação</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-emerald-600">Entregues</span>
            <PackageCheck size={18} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{stats.delivered}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{stats.totalItemsDelivered} un. recebidas</p>
        </div>
      </div>

      {/* Top Consumed Materials Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Requested */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Award size={18} className="text-blue-600" />
              <h3 className="font-extrabold text-sm text-slate-800">Materiais Mais Solicitados</h3>
            </div>
            <span className="text-[11px] font-bold text-slate-400">Total Solicitado</span>
          </div>

          {stats.topRequested.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Nenhum dado de solicitação ainda.</p>
          ) : (
            <div className="space-y-3">
              {stats.topRequested.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-black text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-800 truncate">{item.name}</span>
                  </div>
                  <span className="font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 shrink-0">
                    {item.qty} un.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Delivered */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600" />
              <h3 className="font-extrabold text-sm text-slate-800">Materiais Mais Entregues</h3>
            </div>
            <span className="text-[11px] font-bold text-slate-400">Total Recebido</span>
          </div>

          {stats.topDelivered.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Nenhuma entrega recebida ainda.</p>
          ) : (
            <div className="space-y-3">
              {stats.topDelivered.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                    <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 font-black text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-800 truncate">{item.name}</span>
                  </div>
                  <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 shrink-0">
                    {item.qty} un.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
