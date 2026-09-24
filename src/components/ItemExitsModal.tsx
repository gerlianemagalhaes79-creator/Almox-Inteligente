import React, { useState, useMemo } from 'react';
import { 
  X, 
  Eye, 
  ArrowUpRight, 
  Calendar, 
  Package, 
  Layers, 
  Building2, 
  Search, 
  Printer, 
  User, 
  Info,
  Clock
} from 'lucide-react';
import { Transaction, Item } from '../types';

interface ItemExitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  materialName: string;
  initialBatchNumber?: string | null;
  transactions: Transaction[];
  items: Item[];
  appLogo?: string | null;
  appRectangularLogo?: string | null;
}

const normalize = (str: string | null | undefined) => 
  (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export const ItemExitsModal: React.FC<ItemExitsModalProps> = ({
  isOpen,
  onClose,
  materialName,
  initialBatchNumber,
  transactions,
  items,
  appLogo,
  appRectangularLogo
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState<string>(initialBatchNumber || 'all');

  // Update batch filter if initialBatchNumber changes
  React.useEffect(() => {
    setBatchFilter(initialBatchNumber || 'all');
  }, [initialBatchNumber]);

  // Find all current stock batches for this item
  const currentBatches = useMemo(() => {
    const normTarget = normalize(materialName);
    return items.filter(i => !i.deletedAt && normalize(i.name) === normTarget);
  }, [items, materialName]);

  const totalCurrentStock = useMemo(() => {
    return currentBatches.reduce((acc, b) => acc + (Number(b.quantity) || 0), 0);
  }, [currentBatches]);

  const unitMeasure = currentBatches[0]?.unit_measure || 'un';

  // Filter all exit transactions for this material
  const materialItemIds = useMemo(() => {
    const normTarget = normalize(materialName);
    return new Set(items.filter(i => normalize(i.name) === normTarget).map(i => i.id));
  }, [items, materialName]);

  const allMaterialExits = useMemo(() => {
    if (!materialName) return [];
    const normTarget = normalize(materialName);

    return transactions
      .filter(t => {
        if (t.type !== 'exit' || t.deletedAt) return false;
        const normItemName = normalize(t.item_name);
        const matchesName = normItemName === normTarget || normItemName.includes(normTarget) || normTarget.includes(normItemName);
        const matchesId = materialItemIds.has(t.item_id);
        return matchesName || matchesId;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, materialName, materialItemIds]);

  // Distinct sectors from exits
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    allMaterialExits.forEach(t => {
      if (t.sector) set.add(t.sector);
    });
    return Array.from(set).sort();
  }, [allMaterialExits]);

  // Distinct batches from exits
  const availableBatches = useMemo(() => {
    const set = new Set<string>();
    allMaterialExits.forEach(t => {
      if (t.batch_number) set.add(t.batch_number);
    });
    return Array.from(set).sort();
  }, [allMaterialExits]);

  // Filtered exits based on modal search and selects
  const filteredExits = useMemo(() => {
    return allMaterialExits.filter(t => {
      if (sectorFilter !== 'all' && t.sector !== sectorFilter) return false;
      if (batchFilter !== 'all' && t.batch_number !== batchFilter) return false;

      if (searchTerm.trim()) {
        const term = normalize(searchTerm);
        const matchSector = normalize(t.sector).includes(term);
        const matchBatch = normalize(t.batch_number).includes(term);
        const matchResp = normalize(t.responsible).includes(term) || normalize(t.responsibleEmail).includes(term);
        const matchObs = normalize(t.observation).includes(term) || normalize(t.expiryReason).includes(term);
        const matchReason = normalize(t.exitReason).includes(term);

        if (!matchSector && !matchBatch && !matchResp && !matchObs && !matchReason) {
          return false;
        }
      }

      return true;
    });
  }, [allMaterialExits, sectorFilter, batchFilter, searchTerm]);

  // Metrics
  const metrics = useMemo(() => {
    const totalExitsCount = allMaterialExits.length;
    const totalQuantityExited = allMaterialExits.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0);
    const uniqueSectors = new Set(allMaterialExits.map(t => t.sector).filter(Boolean)).size;
    const uniqueBatches = new Set(allMaterialExits.map(t => t.batch_number).filter(Boolean)).size;

    // Sector breakdown
    const sectorTotals: Record<string, number> = {};
    allMaterialExits.forEach(t => {
      const s = t.sector || 'Outros / Não informado';
      sectorTotals[s] = (sectorTotals[s] || 0) + (Number(t.quantity) || 0);
    });
    const sortedSectorTotals = Object.entries(sectorTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalExitsCount,
      totalQuantityExited,
      uniqueSectors,
      uniqueBatches,
      sortedSectorTotals
    };
  }, [allMaterialExits]);

  // Print function
  const handlePrintExits = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const nowStr = new Date().toLocaleString('pt-BR');
    const logoToUse = appRectangularLogo || appLogo;

    const content = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>Histórico de Saídas - ${materialName}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm 15mm; }
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0F172A; font-size: 11px; padding: 10px; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0284C7; padding-bottom: 10px; margin-bottom: 15px; }
            .title { font-size: 16px; font-weight: 900; color: #0369A1; }
            .subtitle { font-size: 11px; color: #64748B; font-weight: 600; margin-top: 2px; }
            .stats-bar { display: flex; gap: 15px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px 14px; border-radius: 8px; margin-bottom: 15px; }
            .stat-box { flex: 1; }
            .stat-label { font-size: 9px; text-transform: uppercase; color: #64748B; font-weight: bold; }
            .stat-val { font-size: 14px; font-weight: 900; color: #0F172A; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
            th { background: #0F172A; color: #FFF; padding: 7px 8px; text-align: left; font-size: 9px; text-transform: uppercase; font-weight: 800; }
            td { padding: 7px 8px; border-bottom: 1px solid #E2E8F0; }
            tr:nth-child(even) { background: #F8FAFC; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; }
            .badge-sector { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
            .badge-batch { font-family: monospace; font-weight: bold; background: #F1F5F9; color: #334155; }
            .qty { font-weight: 900; color: #0F172A; font-size: 11px; }
            .footer { margin-top: 20px; font-size: 8px; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">Relatório de Saídas por Material</div>
              <div class="subtitle">Insumo: <strong>${materialName.toUpperCase()}</strong> • Saldo atual em estoque: ${totalCurrentStock} ${unitMeasure}</div>
            </div>
            ${logoToUse ? `<img src="${logoToUse}" style="max-height: 40px; max-width: 130px; object-fit: contain;" />` : ''}
          </div>

          <div class="stats-bar">
            <div class="stat-box">
              <div class="stat-label">Total de Saídas</div>
              <div class="stat-val">${metrics.totalExitsCount} registros</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Volume Total Saído</div>
              <div class="stat-val">${metrics.totalQuantityExited.toLocaleString('pt-BR')} ${unitMeasure}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Setores Atendidos</div>
              <div class="stat-val">${metrics.uniqueSectors} setores</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Lotes Utilizados</div>
              <div class="stat-val">${metrics.uniqueBatches} lotes</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Data / Hora</th>
                <th>Setor Destino</th>
                <th>Qtd Saída</th>
                <th>Lote</th>
                <th>Validade Lote</th>
                <th>Motivo</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              ${filteredExits.map((t, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${new Date(t.date).toLocaleDateString('pt-BR')} ${new Date(t.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span class="badge badge-sector">${t.sector || '---'}</span></td>
                  <td class="qty">${t.quantity} ${unitMeasure}</td>
                  <td><span class="badge badge-batch">${t.batch_number || 'S/N'}</span></td>
                  <td>${t.expiry_date && t.expiry_date !== 'Indeterminada' ? new Date(t.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR') : '---'}</td>
                  <td>${t.exitReason === 'doacao' ? 'Doação' : t.exitReason === 'vencido' ? 'Descarte / Vencido' : t.exitReason === 'perda' ? 'Perda / Avaria' : 'Consumo do Setor'}</td>
                  <td>${t.responsible || t.responsibleEmail || '---'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            Documento emitido eletronicamente via Sistema de Almoxarifado • Policlínica Bernardo Félix da Silva • ${nowStr}
          </div>

          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-blue-500/20 text-blue-300 rounded-2xl border border-blue-400/30 shrink-0">
              <Eye size={22} className="text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-md border border-blue-400/30">
                  Histórico de Saídas
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  • Saldo atual: <strong className="text-white">{totalCurrentStock} {unitMeasure}</strong>
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
                {materialName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handlePrintExits}
              disabled={filteredExits.length === 0}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Imprimir histórico ou gerar PDF"
            >
              <Printer size={15} />
              <span>Imprimir / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              title="Fechar janela"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50/70 border border-blue-100 p-3.5 rounded-2xl">
              <div className="flex items-center justify-between text-blue-700">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Volume Total Saído</span>
                <ArrowUpRight size={16} />
              </div>
              <p className="text-2xl font-black text-blue-900 mt-1">
                {metrics.totalQuantityExited.toLocaleString('pt-BR')} <span className="text-xs font-bold text-blue-700">{unitMeasure}</span>
              </p>
              <p className="text-[10px] text-blue-600 font-semibold mt-0.5">Em todo o período registrado</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl">
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Total de Baixas</span>
                <Clock size={16} />
              </div>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {metrics.totalExitsCount} <span className="text-xs font-bold text-slate-500">registros</span>
              </p>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Operações de saída efetuadas</p>
            </div>

            <div className="bg-indigo-50/70 border border-indigo-100 p-3.5 rounded-2xl">
              <div className="flex items-center justify-between text-indigo-700">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Setores Atendidos</span>
                <Building2 size={16} />
              </div>
              <p className="text-2xl font-black text-indigo-900 mt-1">
                {metrics.uniqueSectors} <span className="text-xs font-bold text-indigo-700">setores</span>
              </p>
              <p className="text-[10px] text-indigo-600 font-semibold mt-0.5">Destinos distintos atendidos</p>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-100 p-3.5 rounded-2xl">
              <div className="flex items-center justify-between text-emerald-700">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Lotes Movimentados</span>
                <Layers size={16} />
              </div>
              <p className="text-2xl font-black text-emerald-900 mt-1">
                {metrics.uniqueBatches} <span className="text-xs font-bold text-emerald-700">lotes</span>
              </p>
              <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Remessas que tiveram baixa</p>
            </div>
          </div>

          {/* Top consuming sectors preview (if multiple) */}
          {metrics.sortedSectorTotals.length > 1 && (
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-2">
                Principais Setores Solicitantes deste Insumo:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {metrics.sortedSectorTotals.map(([sectorName, qty]) => {
                  const percent = metrics.totalQuantityExited > 0 ? Math.round((qty / metrics.totalQuantityExited) * 100) : 0;
                  return (
                    <div 
                      key={sectorName} 
                      onClick={() => setSectorFilter(sectorName)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                        sectorFilter === sectorName 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                      }`}
                      title={`Filtrar apenas ${sectorName}`}
                    >
                      <span>{sectorName}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                        sectorFilter === sectorName ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {qty} {unitMeasure} ({percent}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por setor, lote, solicitante ou observação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Sector Select */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <Building2 size={14} className="text-slate-500 shrink-0" />
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos os Setores ({availableSectors.length})</option>
                  {availableSectors.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Batch Select */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <Layers size={14} className="text-slate-500 shrink-0" />
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos os Lotes ({availableBatches.length})</option>
                  {availableBatches.map(b => (
                    <option key={b} value={b}>Lote: {b}</option>
                  ))}
                </select>
              </div>

              {(sectorFilter !== 'all' || batchFilter !== 'all' || searchTerm) && (
                <button
                  onClick={() => { setSectorFilter('all'); setBatchFilter('all'); setSearchTerm(''); }}
                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold border border-rose-200 transition-all cursor-pointer"
                  title="Limpar filtros"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Exits Listing Table */}
          {filteredExits.length === 0 ? (
            <div className="py-14 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
              <Package size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-800">Nenhum registro de saída encontrado</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {allMaterialExits.length === 0 
                  ? "Este material ainda não possui nenhuma saída ou baixa registrada no histórico." 
                  : "Nenhuma saída corresponde aos filtros aplicados nesta busca."}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-extrabold text-[11px] uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Data / Hora</th>
                      <th className="py-3 px-4">Setor Destino</th>
                      <th className="py-3 px-4 text-center">Quantidade</th>
                      <th className="py-3 px-4">Lote Utilizado</th>
                      <th className="py-3 px-4">Validade Lote</th>
                      <th className="py-3 px-4">Motivo / Operação</th>
                      <th className="py-3 px-4">Responsável</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExits.map((t) => {
                      const exitDate = new Date(t.date);
                      const isDonation = t.exitReason === 'doacao';
                      const isExpiredWaste = t.exitReason === 'vencido';
                      const isLoss = t.exitReason === 'perda';

                      return (
                        <tr key={t.id} className="hover:bg-blue-50/40 transition-colors">
                          {/* Date & Time */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-bold text-slate-800">
                              <Calendar size={13} className="text-slate-400" />
                              <span>{exitDate.toLocaleDateString('pt-BR')}</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                {exitDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </td>

                          {/* Sector */}
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              <Building2 size={12} className="text-blue-600" />
                              {t.sector || 'Não informado'}
                            </span>
                          </td>

                          {/* Quantity */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center justify-center font-black text-sm text-slate-900 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                              {t.quantity} <span className="text-[10px] font-bold text-slate-500 ml-1">{unitMeasure}</span>
                            </span>
                          </td>

                          {/* Batch */}
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 inline-block">
                              {t.batch_number || 'Sem lote'}
                            </span>
                          </td>

                          {/* Expiry Date */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {t.expiry_date && t.expiry_date !== 'Indeterminada' ? (
                              <span className="text-slate-600 font-semibold">
                                {new Date(t.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Indeterminada</span>
                            )}
                          </td>

                          {/* Exit Reason */}
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${
                              isDonation ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                              isExpiredWaste ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              isLoss ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              {isDonation ? 'Doação' : 
                               isExpiredWaste ? 'Descarte / Vencido' : 
                               isLoss ? 'Perda / Avaria' : 
                               'Consumo do Setor'}
                            </span>
                            {t.expiryReason && (
                              <p className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1">
                                {t.expiryReason}
                              </p>
                            )}
                          </td>

                          {/* Responsible */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1 text-slate-700 font-medium">
                              <User size={12} className="text-slate-400 shrink-0" />
                              <span className="truncate max-w-[140px]" title={t.responsible || t.responsibleEmail || ''}>
                                {t.responsible || t.responsibleEmail || '---'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer with quick count */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span>
                  Exibindo <strong>{filteredExits.length}</strong> de <strong>{allMaterialExits.length}</strong> saídas
                </span>
                <span className="font-bold text-slate-700">
                  Total filtrado: <strong>{filteredExits.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0).toLocaleString('pt-BR')}</strong> {unitMeasure}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <Info size={14} className="text-blue-600" />
            <span>As saídas são registradas automaticamente a cada entrega de pedido ou baixa manual de estoque.</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
