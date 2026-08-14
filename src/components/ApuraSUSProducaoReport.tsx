import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  Package, 
  Download, 
  Printer, 
  Search, 
  Calendar, 
  ChevronRight, 
  ChevronDown, 
  Building2, 
  FileSpreadsheet,
  TrendingUp,
  Activity,
  CheckCircle2,
  Boxes,
  PieChart as PieChartIcon,
  BarChart3,
  Sparkles,
  Layers
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';
import { Item, Transaction } from '../types';

interface ApuraSUSProducaoReportProps {
  transactions: Transaction[];
  items: Item[];
  SECTORS: string[];
  SECTOR_COLORS: Record<string, string>;
  CATEGORY_COLORS: Record<string, string>;
  getCategoryColor: (cat: string) => string;
  letterheadImage: string | null;
  inventoryLocation: 'Almoxarifado' | 'Farmácia';
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  isAdmin: boolean;
  selectedSector: string;
}

export const ApuraSUSProducaoReport: React.FC<ApuraSUSProducaoReportProps> = ({
  transactions,
  items,
  SECTORS,
  SECTOR_COLORS,
  letterheadImage,
  inventoryLocation,
  showToast,
}) => {
  // Current competence month (default: current month)
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => new Date());
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  // Month navigation
  const handlePrevMonth = () => {
    setSelectedMonthDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setSelectedMonthDate(prev => addMonths(prev, 1));
  };

  // Compute period boundaries
  const periodRange = useMemo(() => {
    if (useCustomRange) {
      return {
        start: startOfDay(parseISO(customStartDate)),
        end: endOfDay(parseISO(customEndDate)),
        label: `${format(parseISO(customStartDate), 'dd/MM/yyyy')} a ${format(parseISO(customEndDate), 'dd/MM/yyyy')}`,
        competenceLabel: `Período Customizado (${format(parseISO(customStartDate), 'dd/MM/yyyy')} a ${format(parseISO(customEndDate), 'dd/MM/yyyy')})`
      };
    }
    const start = startOfMonth(selectedMonthDate);
    const end = endOfMonth(selectedMonthDate);
    const monthName = format(selectedMonthDate, 'MMMM / yyyy', { locale: ptBR });
    return {
      start: startOfDay(start),
      end: endOfDay(end),
      label: `${format(start, 'dd/MM/yyyy')} a ${format(end, 'dd/MM/yyyy')}`,
      competenceLabel: monthName.charAt(0).toUpperCase() + monthName.slice(1)
    };
  }, [selectedMonthDate, useCustomRange, customStartDate, customEndDate]);

  // Production data calculations strictly focused on General Quantities and Sectors
  const productionData = useMemo(() => {
    // Map items for name lookup
    const itemMap = new Map<string, Item>();
    items.forEach(i => {
      itemMap.set(i.id, i);
      if (i.name) itemMap.set(i.name.toLowerCase().trim(), i);
    });

    // Filter valid exit transactions in this location & period
    const relevantExits = transactions.filter(t => {
      if (t.deletedAt) return false;
      if (t.type !== 'exit') return false;
      const loc = t.location || 'Almoxarifado';
      if (loc !== inventoryLocation) return false;

      try {
        const transDate = parseISO(t.date);
        if (!isWithinInterval(transDate, { start: periodRange.start, end: periodRange.end })) {
          return false;
        }
      } catch {
        return false;
      }

      if (t.exitReason && t.exitReason !== 'consumo') {
        return false;
      }

      return true;
    });

    let totalGeneralItems = 0;
    let totalTransactionsCount = relevantExits.length;

    // Aggregation per sector
    interface SectorDetailItem {
      itemId: string;
      itemName: string;
      quantity: number;
      unitMeasure: string;
    }

    interface SectorAgg {
      sectorName: string;
      totalQuantity: number;
      transactionCount: number;
      percentage: number;
      itemsList: Map<string, SectorDetailItem>;
    }

    const sectorMap = new Map<string, SectorAgg>();

    relevantExits.forEach(trans => {
      const sectorName = trans.sector?.trim() || 'Não Informado / Geral';
      const qty = Math.abs(trans.quantity || 0);
      totalGeneralItems += qty;

      if (!sectorMap.has(sectorName)) {
        sectorMap.set(sectorName, {
          sectorName,
          totalQuantity: 0,
          transactionCount: 0,
          percentage: 0,
          itemsList: new Map()
        });
      }

      const sectorData = sectorMap.get(sectorName)!;
      sectorData.totalQuantity += qty;
      sectorData.transactionCount += 1;

      // Item lookup for destination breakdown
      const matchedItem = trans.item_id ? itemMap.get(trans.item_id) : (trans.item_name ? itemMap.get(trans.item_name.toLowerCase().trim()) : null);
      const itemName = trans.item_name || matchedItem?.name || 'Item não identificado';
      const itemKey = trans.item_id || itemName;
      const unit = matchedItem?.unit_measure || 'UN';

      if (!sectorData.itemsList.has(itemKey)) {
        sectorData.itemsList.set(itemKey, {
          itemId: itemKey,
          itemName,
          quantity: 0,
          unitMeasure: unit
        });
      }
      sectorData.itemsList.get(itemKey)!.quantity += qty;
    });

    // Calculate percentages and sort descending by totalQuantity
    const sectorsList = Array.from(sectorMap.values()).map(sec => {
      sec.percentage = totalGeneralItems > 0 ? (sec.totalQuantity / totalGeneralItems) * 100 : 0;
      return {
        ...sec,
        sortedItems: Array.from(sec.itemsList.values()).sort((a, b) => b.quantity - a.quantity)
      };
    }).sort((a, b) => b.totalQuantity - a.totalQuantity);

    const activeSectorsCount = sectorsList.filter(s => s.totalQuantity > 0).length;
    const avgItemsPerSector = activeSectorsCount > 0 ? Math.round(totalGeneralItems / activeSectorsCount) : 0;

    return {
      totalGeneralItems,
      totalTransactionsCount,
      activeSectorsCount,
      avgItemsPerSector,
      sectorsList
    };
  }, [transactions, items, inventoryLocation, periodRange]);

  // Filtered sectors list by search
  const filteredSectors = useMemo(() => {
    if (!searchTerm.trim()) return productionData.sectorsList;
    const term = searchTerm.toLowerCase();
    return productionData.sectorsList.filter(s => 
      s.sectorName.toLowerCase().includes(term) ||
      s.sortedItems.some(i => i.itemName.toLowerCase().includes(term))
    );
  }, [productionData.sectorsList, searchTerm]);

  // Chart data for top sectors
  const chartData = useMemo(() => {
    return productionData.sectorsList.slice(0, 10).map(s => ({
      name: s.sectorName.length > 18 ? s.sectorName.substring(0, 16) + '...' : s.sectorName,
      fullName: s.sectorName,
      quantity: s.totalQuantity,
      percentage: Number(s.percentage.toFixed(1))
    }));
  }, [productionData.sectorsList]);

  // Pie chart data
  const pieData = useMemo(() => {
    const topSectors = productionData.sectorsList.slice(0, 7);
    const others = productionData.sectorsList.slice(7);
    const otherQty = others.reduce((acc, curr) => acc + curr.totalQuantity, 0);

    const result = topSectors.map(s => ({
      name: s.sectorName,
      value: s.totalQuantity,
      percentage: Number(s.percentage.toFixed(1))
    }));

    if (otherQty > 0) {
      result.push({
        name: 'Demais Setores',
        value: otherQty,
        percentage: Number(((otherQty / (productionData.totalGeneralItems || 1)) * 100).toFixed(1))
      });
    }

    return result;
  }, [productionData]);

  // Color palette for charts
  const COLOR_PALETTE = [
    '#2563eb', '#3b82f6', '#0284c7', '#0d9488', '#10b981', 
    '#6366f1', '#8b5cf6', '#a855f7', '#d97706', '#f59e0b', '#64748b'
  ];

  // Export to PDF
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      let startY = 15;

      // Header with Letterhead if available
      if (letterheadImage) {
        try {
          doc.addImage(letterheadImage, 'PNG', 14, 10, pageWidth - 28, 25);
          startY = 40;
        } catch {
          startY = 20;
        }
      }

      // Title & Header Information
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(`RELATÓRIO DE PRODUÇÃO MENSAL - ${inventoryLocation.toUpperCase()}`, 14, startY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(`Destinado ao ApuraSUS (Sistema de Apuração e Gestão do Custo do SUS)`, 14, startY + 6);
      doc.text(`Competência: ${periodRange.competenceLabel} (${periodRange.label})`, 14, startY + 11);
      doc.text(`Emissão: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, startY + 16);

      // Summary Box
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, startY + 20, pageWidth - 28, 16, 2, 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 58, 138);
      doc.text(`TOTAL GERAL DE ITENS DISPENSADOS NO MÊS: ${productionData.totalGeneralItems.toLocaleString('pt-BR')} itens`, 18, startY + 27);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Setores Atendidos: ${productionData.activeSectorsCount} | Atendimentos/Baixas: ${productionData.totalTransactionsCount}`, 18, startY + 32);

      // Main Table: Sectors and Quantities
      const tableData = productionData.sectorsList.map((sec, index) => [
        (index + 1).toString(),
        sec.sectorName,
        sec.totalQuantity.toLocaleString('pt-BR') + ' itens',
        sec.percentage.toFixed(2) + ' %',
        sec.transactionCount.toString()
      ]);

      autoTable(doc, {
        startY: startY + 40,
        head: [['#', 'Setor de Destino / Consumidor', 'Quantidade de Itens Recebidos', '% Participação', 'Nº Atendimentos']],
        body: tableData,
        foot: [[
          '',
          'TOTAL GERAL DISPENSADO',
          productionData.totalGeneralItems.toLocaleString('pt-BR') + ' itens',
          '100,00 %',
          productionData.totalTransactionsCount.toString()
        ]],
        theme: 'striped',
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left'
        },
        footStyles: {
          fillColor: [226, 232, 240],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 9
        },
        styles: {
          fontSize: 8.5,
          cellPadding: 3,
          textColor: [30, 41, 59]
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 'auto', fontStyle: 'bold' },
          2: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 28, halign: 'center' }
        }
      });

      // Signatures
      const finalY = (doc as any).lastAutoTable.finalY + 25;
      if (finalY < 265) {
        doc.setDrawColor(148, 163, 184);
        doc.line(20, finalY, 90, finalY);
        doc.line(120, finalY, 190, finalY);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text('Responsável pelo Almoxarifado', 55, finalY + 4, { align: 'center' });
        doc.text('Gestão de Custos / ApuraSUS', 155, finalY + 4, { align: 'center' });
      }

      doc.save(`ApuraSUS_Producao_Mensal_${format(selectedMonthDate, 'yyyy-MM')}.pdf`);
      showToast('Relatório em PDF gerado com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao gerar o relatório em PDF.', 'error');
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    try {
      const wsData = [
        ['RELATÓRIO DE PRODUÇÃO MENSAL DO ALMOXARIFADO (DESTINADO AO APURASUS)'],
        [`Competência: ${periodRange.competenceLabel}`],
        [`Período: ${periodRange.label}`],
        [`Total Geral de Itens Dispensados: ${productionData.totalGeneralItems}`],
        [`Setores Atendidos: ${productionData.activeSectorsCount}`],
        [`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
        [],
        ['Posição', 'Setor de Destino', 'Quantidade de Itens Recebidos', '% Participação', 'Nº de Atendimentos']
      ];

      productionData.sectorsList.forEach((sec, idx) => {
        wsData.push([
          (idx + 1).toString(),
          sec.sectorName,
          sec.totalQuantity.toString(),
          sec.percentage.toFixed(2) + '%',
          sec.transactionCount.toString()
        ]);
      });

      // Total row
      wsData.push([
        '',
        'TOTAL GERAL',
        productionData.totalGeneralItems.toString(),
        '100.00%',
        productionData.totalTransactionsCount.toString()
      ]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Producao_Mensal');
      XLSX.writeFile(wb, `Producao_Mensal_ApuraSUS_${format(selectedMonthDate, 'yyyy-MM')}.xlsx`);
      showToast('Planilha Excel exportada com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao exportar planilha Excel.', 'error');
    }
  };

  return (
    <div className="space-y-6" id="apurasus-producao-report-container">
      {/* Header & Main Period Bar */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">
                ApuraSUS
              </span>
              <span className="text-xs font-bold text-slate-500">
                Produção Física Mensal
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 flex items-center gap-2.5">
              <Package className="text-blue-600 shrink-0" size={26} />
              Produção Mensal do Almoxarifado
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              Controle direto do volume total de itens dispensados no mês e a quantidade exata recebida por cada setor.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportPDF}
              className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
              title="Exportar Relatório Oficial em PDF"
            >
              <Printer size={16} /> Gerar PDF Oficial
            </button>
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
              title="Exportar Tabela em Excel (.xlsx)"
            >
              <FileSpreadsheet size={16} /> Exportar Excel
            </button>
          </div>
        </div>

        {/* Competence & Date Filter Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <div className="flex flex-wrap items-center gap-3">
            {!useCustomRange ? (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 font-bold transition-all cursor-pointer"
                  title="Mês Anterior"
                >
                  &larr;
                </button>
                <div className="flex items-center gap-2 px-2 text-sm font-black text-slate-800">
                  <Calendar size={16} className="text-blue-600" />
                  <span className="capitalize">
                    {format(selectedMonthDate, 'MMMM / yyyy', { locale: ptBR })}
                  </span>
                </div>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 font-bold transition-all cursor-pointer"
                  title="Próximo Mês"
                >
                  &rarr;
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold">
                  <span className="text-slate-500">De:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="font-bold text-slate-800 outline-hidden bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold">
                  <span className="text-slate-500">Até:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="font-bold text-slate-800 outline-hidden bg-transparent"
                  />
                </div>
              </div>
            )}

            <button
              onClick={() => setUseCustomRange(!useCustomRange)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 underline px-2 py-1 cursor-pointer"
            >
              {useCustomRange ? 'Voltar para Visão Mensal' : 'Definir Período Customizado'}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Buscar setor ou item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs font-medium bg-white rounded-xl border border-slate-200 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Main KPI Cards: Direct Total & Quantities */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TOTAL DE ITENS DISPENSADOS (Destaque Principal) */}
        <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white p-5 rounded-3xl shadow-sm border border-blue-600/30 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute right-3 -bottom-4 opacity-10 text-white pointer-events-none">
            <Package size={100} />
          </div>
          <div>
            <div className="flex items-center justify-between text-blue-200 text-xs font-bold uppercase tracking-wider">
              <span>Total Dispensado</span>
              <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-black">
                Geral
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-black mt-2 tracking-tight">
              {productionData.totalGeneralItems.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-blue-100 font-medium mt-1">
              Itens totais entregues no período
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1.5 text-xs text-blue-200 font-medium">
            <Activity size={14} className="text-cyan-300" />
            <span>Mês de {periodRange.competenceLabel}</span>
          </div>
        </div>

        {/* Card 2: Setores Atendidos */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Setores Atendidos</span>
              <Building2 size={18} className="text-slate-400" />
            </div>
            <div className="text-3xl font-black text-slate-900 mt-2">
              {productionData.activeSectorsCount}
              <span className="text-sm font-semibold text-slate-500 ml-1.5">setores</span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Destinos diferentes que receberam itens
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Média por setor:</span>
            <span className="text-blue-700">{productionData.avgItemsPerSector.toLocaleString('pt-BR')} itens</span>
          </div>
        </div>

        {/* Card 3: Total de Baixas/Atendimentos */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Atendimentos / Baixas</span>
              <TrendingUp size={18} className="text-slate-400" />
            </div>
            <div className="text-3xl font-black text-slate-900 mt-2">
              {productionData.totalTransactionsCount}
              <span className="text-sm font-semibold text-slate-500 ml-1.5">dispensações</span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Registros de saída no almoxarifado
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Status:</span>
            <span className="text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={13} /> Processado
            </span>
          </div>
        </div>

        {/* Card 4: Maior Setor Consumidor */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Maior Destino</span>
              <Sparkles size={18} className="text-amber-500" />
            </div>
            {productionData.sectorsList.length > 0 ? (
              <>
                <div className="text-lg font-black text-slate-900 mt-2 truncate" title={productionData.sectorsList[0].sectorName}>
                  {productionData.sectorsList[0].sectorName}
                </div>
                <div className="text-2xl font-black text-blue-700 mt-0.5">
                  {productionData.sectorsList[0].totalQuantity.toLocaleString('pt-BR')} <span className="text-xs font-bold text-slate-500">itens ({productionData.sectorsList[0].percentage.toFixed(1)}%)</span>
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-400 mt-2">Sem movimentações</div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 font-medium">
            Representa o maior volume recebido
          </div>
        </div>
      </div>

      {/* Visual Chart Section */}
      {productionData.sectorsList.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bar Chart: Quantidades por Setor */}
          <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BarChart3 className="text-blue-600" size={20} />
                <h3 className="text-base font-black text-slate-800">
                  Ranking de Quantidade por Setor (Top 10)
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">Volume em Itens</span>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <XAxis 
                    dataKey="name" 
                    interval={0} 
                    angle={-25} 
                    textAnchor="end" 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip 
                    formatter={(value: any) => [`${Number(value).toLocaleString('pt-BR')} itens`, 'Quantidade']}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        return payload[0].payload.fullName;
                      }
                      return label;
                    }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="quantity" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLOR_PALETTE[index % COLOR_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Chart: Percentual de Destino */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PieChartIcon className="text-indigo-600" size={20} />
                <h3 className="text-base font-black text-slate-800">
                  Participação no Total
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">%</span>
            </div>

            <div className="h-60 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={COLOR_PALETTE[index % COLOR_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any, name: any, item: any) => [
                      `${Number(value).toLocaleString('pt-BR')} itens (${item.payload.percentage}%)`,
                      name
                    ]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="text-center text-xs text-slate-500 font-bold">
              Total Geral: <span className="text-blue-700 font-black">{productionData.totalGeneralItems.toLocaleString('pt-BR')} itens (100%)</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Table: Quantidade de Itens que cada setor recebeu */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Building2 className="text-blue-600" size={20} />
              Demonstrativo de Destinação por Setor
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Quantidade exata de itens recebidos por cada setor no mês de {periodRange.competenceLabel}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-black self-start sm:self-auto">
            {filteredSectors.length} {filteredSectors.length === 1 ? 'setor listado' : 'setores listados'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-100/80 text-slate-700 text-xs font-extrabold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 w-12 text-center">#</th>
                <th className="py-3.5 px-4">Setor Consumidor / Destino</th>
                <th className="py-3.5 px-4 text-right">Quantidade de Itens Recebidos</th>
                <th className="py-3.5 px-4 text-left w-48">% do Total Dispensado</th>
                <th className="py-3.5 px-4 text-center">Atendimentos</th>
                <th className="py-3.5 px-4 text-center w-28">Detalhar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSectors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                    <Boxes className="mx-auto mb-2 opacity-40" size={36} />
                    Nenhuma dispensação encontrada para este período ou filtro.
                  </td>
                </tr>
              ) : (
                filteredSectors.map((sec, idx) => {
                  const isExpanded = expandedSector === sec.sectorName;
                  return (
                    <React.Fragment key={sec.sectorName}>
                      <tr 
                        className={`hover:bg-blue-50/40 transition-colors ${isExpanded ? 'bg-blue-50/60' : ''}`}
                      >
                        <td className="py-3.5 px-4 text-center font-bold text-slate-400 text-xs">
                          {idx + 1}
                        </td>
                        <td className="py-3.5 px-4 font-black text-slate-800 text-sm sm:text-base">
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-2.5 h-2.5 rounded-full shrink-0" 
                              style={{ backgroundColor: COLOR_PALETTE[idx % COLOR_PALETTE.length] }} 
                            />
                            {sec.sectorName}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-blue-700 text-base sm:text-lg">
                          {sec.totalQuantity.toLocaleString('pt-BR')}
                          <span className="text-xs font-semibold text-slate-500 ml-1">itens</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                              <span>{sec.percentage.toFixed(2)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(2, sec.percentage))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs font-bold text-slate-600">
                          {sec.transactionCount} baixa(s)
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => setExpandedSector(isExpanded ? null : sec.sectorName)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer mx-auto"
                            title="Ver itens entregues neste setor"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span>{isExpanded ? 'Fechar' : 'Itens'}</span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable row: Items delivered to this sector */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={6} className="p-4 sm:p-5 border-y border-blue-100">
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <Layers size={14} className="text-blue-600" />
                                  Itens entregues para o setor: {sec.sectorName} ({sec.sortedItems.length} itens distintos)
                                </span>
                                <span className="text-xs font-bold text-blue-700">
                                  Total: {sec.totalQuantity.toLocaleString('pt-BR')} unidades
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                                {sec.sortedItems.map(item => (
                                  <div 
                                    key={item.itemId}
                                    className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs"
                                  >
                                    <span className="font-bold text-slate-800 truncate pr-2" title={item.itemName}>
                                      {item.itemName}
                                    </span>
                                    <span className="font-black text-blue-700 shrink-0 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                      {item.quantity.toLocaleString('pt-BR')} {item.unitMeasure}
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
                })
              )}
            </tbody>
            {filteredSectors.length > 0 && (
              <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td className="py-4 px-4 text-center"></td>
                  <td className="py-4 px-4 text-sm sm:text-base">
                    TOTAL GERAL DISPENSADO NO MÊS
                  </td>
                  <td className="py-4 px-4 text-right text-lg sm:text-xl text-blue-800">
                    {productionData.totalGeneralItems.toLocaleString('pt-BR')} itens
                  </td>
                  <td className="py-4 px-4 text-xs font-bold text-slate-600">
                    100,00% do total
                  </td>
                  <td className="py-4 px-4 text-center text-xs">
                    {productionData.totalTransactionsCount} atendimentos
                  </td>
                  <td className="py-4 px-4"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
