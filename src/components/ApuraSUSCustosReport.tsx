import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Download, 
  Printer, 
  Search, 
  Filter, 
  Calendar, 
  ChevronRight, 
  ChevronDown, 
  Building2, 
  Layers, 
  FileSpreadsheet,
  TrendingUp,
  Activity,
  PieChart as PieChartIcon,
  BarChart3,
  Percent,
  Coins,
  ArrowUpRight
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend } from 'recharts';
import { Item, Transaction } from '../types';

interface ApuraSUSCustosReportProps {
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

export const ApuraSUSCustosReport: React.FC<ApuraSUSCustosReportProps> = ({
  transactions,
  items,
  SECTORS,
  SECTOR_COLORS,
  CATEGORY_COLORS,
  getCategoryColor,
  letterheadImage,
  inventoryLocation,
  showToast,
  isAdmin,
  selectedSector
}) => {
  // Current competence month (default: current month)
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => new Date());
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'by_category' | 'matrix' | 'by_item'>('by_category');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Navigation between months
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

  // Cost Data Calculations
  const costData = useMemo(() => {
    const itemMap = new Map<string, Item>();
    items.forEach(i => {
      itemMap.set(i.id, i);
      if (i.name) itemMap.set(i.name.toLowerCase().trim(), i);
    });

    // Filter exits in period
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

    interface SectorCost {
      sector: string;
      value: number;
      quantity: number;
      percentageOfCategory: number;
      percentageOfTotal: number;
      items: Record<string, { name: string; quantity: number; unitPrice: number; value: number }>;
    }

    interface CategoryCost {
      category: string;
      totalValue: number;
      totalQuantity: number;
      percentageOfTotal: number;
      sectors: Record<string, SectorCost>;
      items: Record<string, { name: string; unitPrice: number; totalQuantity: number; totalValue: number; sectors: Record<string, { quantity: number; value: number }> }>;
    }

    interface SectorSummary {
      sector: string;
      totalValue: number;
      totalQuantity: number;
      percentageOfTotal: number;
      categories: Record<string, number>;
    }

    interface ItemCostSummary {
      name: string;
      category: string;
      unitPrice: number;
      totalQuantity: number;
      totalValue: number;
      sectors: Record<string, { sector: string; quantity: number; value: number }>;
    }

    const categoriesMap: Record<string, CategoryCost> = {};
    const sectorsMap: Record<string, SectorSummary> = {};
    const itemsMap: Record<string, ItemCostSummary> = {};

    let grandTotalCost = 0;
    let grandTotalUnits = 0;

    relevantExits.forEach(t => {
      const item = itemMap.get(t.item_id) || itemMap.get(t.item_name?.toLowerCase().trim());
      const category = item?.category || 'Outros';
      const unitPrice = Number(item?.unit_price) || 0;
      const quantity = Number(t.quantity) || 0;
      const value = quantity * unitPrice;
      const sector = t.sector || 'Não Informado';

      grandTotalCost += value;
      grandTotalUnits += quantity;

      // Category Grouping
      if (!categoriesMap[category]) {
        categoriesMap[category] = {
          category,
          totalValue: 0,
          totalQuantity: 0,
          percentageOfTotal: 0,
          sectors: {},
          items: {}
        };
      }
      categoriesMap[category].totalValue += value;
      categoriesMap[category].totalQuantity += quantity;

      // Sector inside Category
      if (!categoriesMap[category].sectors[sector]) {
        categoriesMap[category].sectors[sector] = {
          sector,
          value: 0,
          quantity: 0,
          percentageOfCategory: 0,
          percentageOfTotal: 0,
          items: {}
        };
      }
      categoriesMap[category].sectors[sector].value += value;
      categoriesMap[category].sectors[sector].quantity += quantity;
      if (!categoriesMap[category].sectors[sector].items[t.item_name]) {
        categoriesMap[category].sectors[sector].items[t.item_name] = {
          name: t.item_name,
          quantity: 0,
          unitPrice,
          value: 0
        };
      }
      categoriesMap[category].sectors[sector].items[t.item_name].quantity += quantity;
      categoriesMap[category].sectors[sector].items[t.item_name].value += value;

      // Item inside Category
      if (!categoriesMap[category].items[t.item_name]) {
        categoriesMap[category].items[t.item_name] = {
          name: t.item_name,
          unitPrice,
          totalQuantity: 0,
          totalValue: 0,
          sectors: {}
        };
      }
      categoriesMap[category].items[t.item_name].totalQuantity += quantity;
      categoriesMap[category].items[t.item_name].totalValue += value;
      if (!categoriesMap[category].items[t.item_name].sectors[sector]) {
        categoriesMap[category].items[t.item_name].sectors[sector] = { quantity: 0, value: 0 };
      }
      categoriesMap[category].items[t.item_name].sectors[sector].quantity += quantity;
      categoriesMap[category].items[t.item_name].sectors[sector].value += value;

      // Sector Summary
      if (!sectorsMap[sector]) {
        sectorsMap[sector] = {
          sector,
          totalValue: 0,
          totalQuantity: 0,
          percentageOfTotal: 0,
          categories: {}
        };
      }
      sectorsMap[sector].totalValue += value;
      sectorsMap[sector].totalQuantity += quantity;
      sectorsMap[sector].categories[category] = (sectorsMap[sector].categories[category] || 0) + value;

      // Item Summary
      if (!itemsMap[t.item_name]) {
        itemsMap[t.item_name] = {
          name: t.item_name,
          category,
          unitPrice,
          totalQuantity: 0,
          totalValue: 0,
          sectors: {}
        };
      }
      itemsMap[t.item_name].totalQuantity += quantity;
      itemsMap[t.item_name].totalValue += value;
      if (!itemsMap[t.item_name].sectors[sector]) {
        itemsMap[t.item_name].sectors[sector] = { sector, quantity: 0, value: 0 };
      }
      itemsMap[t.item_name].sectors[sector].quantity += quantity;
      itemsMap[t.item_name].sectors[sector].value += value;
    });

    // Calculate percentages
    Object.values(categoriesMap).forEach(cat => {
      cat.percentageOfTotal = grandTotalCost > 0 ? (cat.totalValue / grandTotalCost) * 100 : 0;
      Object.values(cat.sectors).forEach(sec => {
        sec.percentageOfCategory = cat.totalValue > 0 ? (sec.value / cat.totalValue) * 100 : 0;
        sec.percentageOfTotal = grandTotalCost > 0 ? (sec.value / grandTotalCost) * 100 : 0;
      });
    });

    Object.values(sectorsMap).forEach(sec => {
      sec.percentageOfTotal = grandTotalCost > 0 ? (sec.totalValue / grandTotalCost) * 100 : 0;
    });

    const categoryList = Object.values(categoriesMap).sort((a, b) => b.totalValue - a.totalValue);
    const sectorList = Object.values(sectorsMap).sort((a, b) => b.totalValue - a.totalValue);
    const allItemsList = Object.values(itemsMap).sort((a, b) => b.totalValue - a.totalValue);

    // Top Category and Top Sector
    const topCategory = categoryList[0] || null;
    const topSector = sectorList[0] || null;

    // Charts data
    const categoryPieChart = categoryList.map(c => ({
      name: c.category,
      value: Math.round(c.totalValue * 100) / 100,
      percentage: c.percentageOfTotal.toFixed(1),
      color: getCategoryColor(c.category)
    }));

    const sectorBarChart = sectorList.slice(0, 8).map(s => ({
      name: s.sector.length > 15 ? s.sector.slice(0, 13) + '...' : s.sector,
      fullName: s.sector,
      value: Math.round(s.totalValue * 100) / 100,
      percentage: s.percentageOfTotal.toFixed(1),
      color: SECTOR_COLORS[s.sector] || '#3b82f6'
    }));

    return {
      grandTotalCost,
      grandTotalUnits,
      categoryList,
      sectorList,
      allItemsList,
      topCategory,
      topSector,
      categoryPieChart,
      sectorBarChart
    };
  }, [transactions, items, periodRange, inventoryLocation, SECTOR_COLORS, getCategoryColor]);

  // Filtered views based on search & filters
  const filteredCategoryList = useMemo(() => {
    return costData.categoryList
      .filter(cat => categoryFilter === 'all' || cat.category === categoryFilter)
      .map(cat => {
        // Filter sectors inside category
        const sectorEntries = Object.values(cat.sectors).filter(s => {
          if (sectorFilter !== 'all' && s.sector !== sectorFilter) return false;
          if (searchTerm.trim() !== '') {
            // Check if sector has matching items or sector name matches
            const matchSectorName = s.sector.toLowerCase().includes(searchTerm.toLowerCase().trim());
            const hasMatchingItem = Object.keys(s.items).some(itemName => 
              itemName.toLowerCase().includes(searchTerm.toLowerCase().trim())
            );
            return matchSectorName || hasMatchingItem;
          }
          return true;
        });

        // Filter items in category
        const itemEntries = Object.values(cat.items).filter(i => {
          if (searchTerm.trim() !== '' && !i.name.toLowerCase().includes(searchTerm.toLowerCase().trim())) {
            return false;
          }
          if (sectorFilter !== 'all' && !i.sectors[sectorFilter]) {
            return false;
          }
          return true;
        });

        const totalFilteredValue = sectorEntries.reduce((sum, s) => sum + s.value, 0);

        return {
          ...cat,
          filteredSectors: sectorEntries.sort((a, b) => b.value - a.value),
          filteredItems: itemEntries.sort((a, b) => b.totalValue - a.totalValue),
          totalFilteredValue
        };
      })
      .filter(cat => cat.filteredSectors.length > 0 || cat.filteredItems.length > 0);
  }, [costData.categoryList, categoryFilter, sectorFilter, searchTerm]);

  // Toggle category
  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catName]: prev[catName] === undefined ? true : !prev[catName]
    }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    costData.categoryList.forEach(c => { all[c.category] = true; });
    setExpandedCategories(all);
  };

  const collapseAll = () => {
    setExpandedCategories({});
  };

  // Export Official PDF for ApuraSUS
  const handleExportPDF = () => {
    try {
      showToast("Gerando Demonstrativo de Custos por Tipo de Item (ApuraSUS)...", "info");
      // @ts-ignore
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      let startY = 16;

      // Letterhead support
      if (letterheadImage) {
        try {
          const formatImg = letterheadImage.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(letterheadImage, formatImg, margin, 8, pageWidth - (margin * 2), 24, undefined, 'FAST');
          startY = 36;
        } catch (e) {
          console.warn("Could not load letterhead:", e);
        }
      }

      // Header Titles
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text('DEMONSTRATIVO DE CUSTO POR TIPO DE ITEM E SETORES — APURASUS', pageWidth / 2, startY, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Competência: ${periodRange.competenceLabel} • Período: ${periodRange.label} • Policlínica de Sobral`,
        pageWidth / 2,
        startY + 5,
        { align: 'center' }
      );

      // KPI Summary Box
      const kpiY = startY + 8;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, kpiY, pageWidth - (margin * 2), 16, 2, 2, 'FD');

      const colW = (pageWidth - (margin * 2)) / 3;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);

      doc.text('CUSTO TOTAL DISPENSADO', margin + colW * 0.5, kpiY + 5, { align: 'center' });
      doc.setFontSize(11);
      doc.setTextColor(30, 64, 175);
      doc.text(
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costData.grandTotalCost),
        margin + colW * 0.5,
        kpiY + 12,
        { align: 'center' }
      );

      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text('CATEGORIA MAIOR ABSORÇÃO', margin + colW * 1.5, kpiY + 5, { align: 'center' });
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      const topCatText = costData.topCategory 
        ? `${costData.topCategory.category} (${costData.topCategory.percentageOfTotal.toFixed(0)}%)` 
        : 'N/D';
      doc.text(topCatText, margin + colW * 1.5, kpiY + 12, { align: 'center' });

      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text('SETOR MAIOR CONSUMO', margin + colW * 2.5, kpiY + 5, { align: 'center' });
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      const topSecText = costData.topSector 
        ? `${costData.topSector.sector} (${costData.topSector.percentageOfTotal.toFixed(0)}%)` 
        : 'N/D';
      doc.text(topSecText, margin + colW * 2.5, kpiY + 12, { align: 'center' });

      // Table Construction
      const tableRows: any[] = [];

      filteredCategoryList.forEach(cat => {
        const sectorBreakdownText = cat.filteredSectors
          .map(s => `${s.sector}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.value)} (${s.percentageOfCategory.toFixed(1)}%)`)
          .join('\n');

        tableRows.push([
          cat.category,
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cat.totalValue),
          `${cat.percentageOfTotal.toFixed(1)}%`,
          sectorBreakdownText || 'Nenhum setor registrado'
        ]);
      });

      // Total Row
      tableRows.push([
        {
          content: 'TOTAL GERAL DISPENSADO',
          styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] }
        },
        {
          content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costData.grandTotalCost),
          styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [30, 64, 175] }
        },
        {
          content: '100,0%',
          styles: { fontStyle: 'bold', halign: 'center', fillColor: [241, 245, 249], textColor: [15, 23, 42] }
        },
        {
          content: `${costData.sectorList.length} setores consumidores atendidos no período`,
          styles: { fontStyle: 'italic', fillColor: [241, 245, 249], textColor: [71, 85, 105] }
        }
      ]);

      autoTable(doc, {
        startY: kpiY + 20,
        head: [['Tipo / Categoria de Item', 'Valor Total (R$)', '% Total', 'Distribuição / Valor por Setor Consumidor']],
        body: tableRows,
        margin: { left: margin, right: margin, bottom: 26 },
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 3,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240]
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left'
        },
        columnStyles: {
          0: { cellWidth: 42, fontStyle: 'bold' },
          1: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 'auto' }
        },
        didDrawPage: (data) => {
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Sistema ApuraSUS • Gestão de Custos • Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
            margin,
            pageHeight - 8
          );
          doc.text(
            `Página ${data.pageNumber}`,
            pageWidth - margin,
            pageHeight - 8,
            { align: 'right' }
          );
        }
      });

      // Signature section on last page
      let finalY = (doc as any).lastAutoTable?.finalY || 200;
      if (finalY > pageHeight - 35) {
        doc.addPage();
        finalY = 20;
      } else {
        finalY += 10;
      }

      const signWidth = 70;
      const sign1X = margin + 10;
      const sign2X = pageWidth - margin - signWidth - 10;

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.5);
      doc.line(sign1X, finalY + 12, sign1X + signWidth, finalY + 12);
      doc.line(sign2X, finalY + 12, sign2X + signWidth, finalY + 12);

      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.text('Responsável Almoxarifado / Estoque', sign1X + (signWidth / 2), finalY + 16, { align: 'center' });
      doc.text('Coordenação de Custos / ApuraSUS', sign2X + (signWidth / 2), finalY + 16, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Aferição de dispensação física', sign1X + (signWidth / 2), finalY + 20, { align: 'center' });
      doc.text('Apropriação contábil por centro de custos', sign2X + (signWidth / 2), finalY + 20, { align: 'center' });

      doc.save(`ApuraSUS_Demonstrativo_Custos_${format(selectedMonthDate, 'yyyy_MM')}.pdf`);
      showToast("PDF de Custos ApuraSUS gerado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao gerar PDF de custos:", err);
      showToast("Erro ao exportar PDF de custos.", "error");
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    try {
      const summaryRows: any[] = [];
      const matrixRows: any[] = [];
      const itemRows: any[] = [];

      // 1. Resumo por Categoria e Setor
      filteredCategoryList.forEach(cat => {
        cat.filteredSectors.forEach(sec => {
          summaryRows.push({
            'Competência': periodRange.competenceLabel,
            'Período': periodRange.label,
            'Categoria / Tipo de Item': cat.category,
            'Valor Total da Categoria (R$)': cat.totalValue,
            'Setor Consumidor': sec.sector,
            'Valor Consumido pelo Setor (R$)': sec.value,
            '% Participação na Categoria': `${sec.percentageOfCategory.toFixed(2)}%`,
            '% Custo Total Geral': `${sec.percentageOfTotal.toFixed(2)}%`,
            'Qtd Itens Consumidos': sec.quantity
          });
        });
      });

      // 2. Matriz Setores x Categorias
      costData.sectorList.forEach(s => {
        const row: Record<string, any> = { 'Setor Consumidor': s.sector };
        costData.categoryList.forEach(c => {
          row[c.category] = s.categories[c.category] || 0;
        });
        row['Custo Total Setor (R$)'] = s.totalValue;
        row['% do Total Geral'] = `${s.percentageOfTotal.toFixed(2)}%`;
        matrixRows.push(row);
      });

      // 3. Detalhamento por Item Individual
      costData.allItemsList.forEach(item => {
        Object.values(item.sectors).forEach(sec => {
          itemRows.push({
            'Competência': periodRange.competenceLabel,
            'Categoria': item.category,
            'Material / Item': item.name,
            'Valor Unitário (R$)': item.unitPrice,
            'Setor Consumidor': sec.sector,
            'Qtd no Setor': sec.quantity,
            'Valor no Setor (R$)': sec.value,
            'Qtd Total Item': item.totalQuantity,
            'Valor Total Item (R$)': item.totalValue
          });
        });
      });

      if (summaryRows.length === 0) {
        showToast("Nenhum dado financeiro para exportar.", "info");
        return;
      }

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(summaryRows);
      const ws2 = XLSX.utils.json_to_sheet(matrixRows);
      const ws3 = XLSX.utils.json_to_sheet(itemRows);

      XLSX.utils.book_append_sheet(wb, ws1, "Resumo Categoria e Setor");
      XLSX.utils.book_append_sheet(wb, ws2, "Matriz Setor x Categoria");
      XLSX.utils.book_append_sheet(wb, ws3, "Detalhamento por Item");

      XLSX.writeFile(wb, `ApuraSUS_Custos_Insumos_${format(selectedMonthDate, 'yyyy_MM')}.xlsx`);
      showToast("Planilha Excel com abas analíticas exportada com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao gerar Excel de custos:", err);
      showToast("Erro ao exportar planilha de custos.", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Card */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-xs space-y-6">
        {/* Title Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200/80">
                ApuraSUS • Apuração de Custos
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {inventoryLocation}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Competência: {periodRange.competenceLabel}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
              Relatório de Custo por Tipo de Item e Setores
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-3xl">
              Demonstração do valor total dispensado por tipo/categoria de insumo e mapeamento da distribuição financeira absorvida por cada setor consumidor para prestação de contas no ApuraSUS.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 font-extrabold text-xs flex items-center gap-2 hover:bg-slate-200 transition-all border border-slate-200/80 cursor-pointer"
            >
              <Download size={15} /> Excel (.xlsx)
            </button>
            <button
              onClick={handleExportPDF}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-black text-xs flex items-center gap-2 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              <Printer size={15} /> Exportar PDF ApuraSUS
            </button>
          </div>
        </div>

        {/* Month Selector & Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Competence Month Selector */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Mês de Competência
            </label>
            {!useCustomRange ? (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 rounded-2xl p-1">
                <button
                  onClick={handlePrevMonth}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-black text-xs border border-slate-200 shadow-2xs cursor-pointer transition-all"
                  title="Mês Anterior"
                >
                  &larr;
                </button>
                <div className="flex-1 text-center font-black text-xs text-slate-800 capitalize py-1">
                  {format(selectedMonthDate, 'MMMM yyyy', { locale: ptBR })}
                </div>
                <button
                  onClick={handleNextMonth}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-black text-xs border border-slate-200 shadow-2xs cursor-pointer transition-all"
                  title="Próximo Mês"
                >
                  &rarr;
                </button>
                <button
                  onClick={() => setSelectedMonthDate(new Date())}
                  className="px-2 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-extrabold text-[10px] cursor-pointer"
                  title="Mês Atual"
                >
                  Atual
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800"
                />
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800"
                />
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setUseCustomRange(!useCustomRange)}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                {useCustomRange ? 'Usar Seleção Mensal Padrão' : 'Personalizar Intervalo de Datas'}
              </button>
            </div>
          </div>

          {/* Category Filter */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Tipo / Categoria
            </label>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              >
                <option value="all">Todas as Categorias ({costData.categoryList.length})</option>
                {Object.keys(CATEGORY_COLORS).sort().map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sector Filter */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Setor Consumidor
            </label>
            <div className="relative">
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              >
                <option value="all">Todos os Setores ({costData.sectorList.length})</option>
                {SECTORS.map(sec => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Buscar Material
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por item ou setor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('by_category')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'by_category'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rateio por Tipo / Categoria
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'matrix'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matriz Financeira (Setor x Categoria)
            </button>
            <button
              onClick={() => setViewMode('by_item')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'by_item'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Detalhamento por Item
            </button>
          </div>

          {viewMode === 'by_category' && (
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="text-[11px] font-extrabold text-slate-600 hover:text-blue-700 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer"
              >
                Expandir Tudo
              </button>
              <button
                onClick={collapseAll}
                className="text-[11px] font-extrabold text-slate-600 hover:text-blue-700 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer"
              >
                Recolher Tudo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-blue-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl">
            <DollarSign size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Custo Total Período</p>
            <p className="text-lg sm:text-xl font-black text-blue-950">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costData.grandTotalCost)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
            <Layers size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Maior Categoria</p>
            <p className="text-base sm:text-lg font-black text-slate-900 truncate max-w-[150px]" title={costData.topCategory?.category}>
              {costData.topCategory?.category || 'Nenhum'}
            </p>
            {costData.topCategory && (
              <p className="text-xs font-bold text-emerald-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costData.topCategory.totalValue)} ({costData.topCategory.percentageOfTotal.toFixed(0)}%)
              </p>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-purple-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-700 rounded-2xl">
            <Building2 size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Setor Maior Custo</p>
            <p className="text-base sm:text-lg font-black text-slate-900 truncate max-w-[150px]" title={costData.topSector?.sector}>
              {costData.topSector?.sector || 'Nenhum'}
            </p>
            {costData.topSector && (
              <p className="text-xs font-bold text-purple-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costData.topSector.totalValue)} ({costData.topSector.percentageOfTotal.toFixed(0)}%)
              </p>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-amber-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl">
            <Percent size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Média por Setor</p>
            <p className="text-lg sm:text-xl font-black text-slate-900">
              {costData.sectorList.length > 0 
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costData.grandTotalCost / costData.sectorList.length)
                : 'R$ 0,00'}
            </p>
          </div>
        </div>
      </div>

      {/* Cost Analytics Visuals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Cost by Category Chart */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Layers size={16} className="text-blue-600" />
                Participação dos Custos por Tipo de Item
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Distribuição percentual do orçamento consumido</p>
            </div>
            <span className="text-[11px] font-extrabold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
              Orçamento
            </span>
          </div>

          <div className="h-56 w-full">
            {costData.categoryPieChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costData.categoryPieChart} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 9, fill: '#475569', fontWeight: 'bold' }} 
                    interval={0} 
                    angle={-15} 
                    textAnchor="end" 
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    tickFormatter={(val) => `R$${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} 
                  />
                  <Tooltip
                    formatter={(value: any) => [
                      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value)),
                      'Custo'
                    ]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {costData.categoryPieChart.map((entry, index) => (
                      <Cell key={`cell-bar-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-bold italic">
                Nenhum custo registrado para o período.
              </div>
            )}
          </div>
        </div>

        {/* Cost by Sector Chart */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Building2 size={16} className="text-purple-600" />
                Absorção de Custos por Setor Consumidor
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Ranking de despesas alocadas por centro de custo</p>
            </div>
            <span className="text-[11px] font-extrabold bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full">
              Centros de Custo
            </span>
          </div>

          <div className="h-56 w-full">
            {costData.sectorBarChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costData.sectorBarChart} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <XAxis 
                    type="number" 
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `R$${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                  />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#334155', fontWeight: 'bold' }} width={80} />
                  <Tooltip
                    formatter={(value: any) => [
                      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value)),
                      'Custo Absorvido'
                    ]}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {costData.sectorBarChart.map((entry, index) => (
                      <Cell key={`cell-sec-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-bold italic">
                Nenhum dado registrado para setores.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: RATEIO POR TIPO / CATEGORIA (Highlights User's Exact Example) */}
      {viewMode === 'by_category' && (
        <div className="space-y-5">
          {filteredCategoryList.map((categoryGroup) => {
            const isExpanded = expandedCategories[categoryGroup.category] !== false; // Default expanded
            const categoryColor = getCategoryColor(categoryGroup.category);

            return (
              <div 
                key={categoryGroup.category} 
                className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
              >
                {/* Category Card Header */}
                <div 
                  onClick={() => toggleCategory(categoryGroup.category)}
                  className="p-5 bg-gradient-to-r from-slate-50/90 to-white hover:bg-slate-100/80 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <span 
                      className="w-4 h-4 rounded-full shrink-0 shadow-2xs mt-1 sm:mt-0" 
                      style={{ backgroundColor: categoryColor }} 
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-black text-slate-900">
                          {categoryGroup.category}
                        </h4>
                        <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                          {categoryGroup.percentageOfTotal.toFixed(1)}% do Custo Total
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {categoryGroup.filteredSectors.length} setores consumidores • {categoryGroup.totalQuantity.toLocaleString('pt-BR')} itens físicos dispensados
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 self-end md:self-auto">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Custo Total Tipo</p>
                      <p className="text-xl font-black text-blue-950">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(categoryGroup.totalValue)}
                      </p>
                    </div>
                    <div className="p-2 text-slate-400 hover:text-slate-700">
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-5 space-y-5">
                    {/* Visual Proportion Bar (Distribution across sectors) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-black text-slate-600">
                        <span>Distribuição de Custos por Setor</span>
                        <span className="text-slate-400 font-bold">{categoryGroup.filteredSectors.length} centros de absorção</span>
                      </div>
                      <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                        {categoryGroup.filteredSectors.map((sec, sIdx) => {
                          const secColor = SECTOR_COLORS[sec.sector] || '#3b82f6';
                          const widthPct = Math.max(sec.percentageOfCategory, 1.5);
                          return (
                            <div
                              key={sIdx}
                              style={{ width: `${widthPct}%`, backgroundColor: secColor }}
                              className="h-full transition-all hover:opacity-90 relative group cursor-pointer"
                              title={`${sec.sector}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sec.value)} (${sec.percentageOfCategory.toFixed(1)}%)`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Sectors Breakdown Table */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                            <th className="py-3 px-4">Setor Consumidor</th>
                            <th className="py-3 px-4 text-center">Itens Recebidos</th>
                            <th className="py-3 px-4 text-right">Valor Consumido (R$)</th>
                            <th className="py-3 px-4 text-right">% na Categoria</th>
                            <th className="py-3 px-4 text-right">% no Custo Geral</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                          {categoryGroup.filteredSectors.map((sec, idx) => {
                            const secColor = SECTOR_COLORS[sec.sector] || '#3b82f6';
                            return (
                              <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2.5">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: secColor }} />
                                  <span>{sec.sector}</span>
                                </td>
                                <td className="py-3.5 px-4 text-center font-semibold text-slate-600">
                                  {sec.quantity.toLocaleString('pt-BR')} un
                                </td>
                                <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sec.value)}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-700 font-extrabold rounded-lg border border-blue-200/60">
                                    {sec.percentageOfCategory.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right text-slate-500 font-semibold">
                                  {sec.percentageOfTotal.toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50/80 font-black text-xs text-slate-900 border-t border-slate-200">
                            <td className="py-3 px-4">TOTAL DA CATEGORIA</td>
                            <td className="py-3 px-4 text-center">{categoryGroup.totalQuantity.toLocaleString('pt-BR')} un</td>
                            <td className="py-3 px-4 text-right text-blue-900 text-sm font-black">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(categoryGroup.totalValue)}
                            </td>
                            <td className="py-3 px-4 text-right">100,0%</td>
                            <td className="py-3 px-4 text-right text-blue-900 font-black">{categoryGroup.percentageOfTotal.toFixed(1)}%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredCategoryList.length === 0 && (
            <div className="bg-white p-12 rounded-3xl border border-slate-200/90 text-center space-y-3">
              <DollarSign size={36} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-700">Nenhum custo registrado para os filtros selecionados.</p>
              <p className="text-xs text-slate-400">Verifique a competência selecionada ou limpe a busca.</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: MATRIZ FINANCEIRA APURASUS (Setores x Categorias) */}
      {viewMode === 'matrix' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-base font-black text-slate-900">
                Matriz Financeira de Custos ApuraSUS (Centros de Consumo x Tipos de Materiais)
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Valores consolidados em Reais (R$) alocados para cada setor por categoria
              </p>
            </div>
            <span className="text-xs font-black text-blue-900 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costData.grandTotalCost)}
            </span>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left border-collapse text-xs min-w-[950px]">
              <thead className="sticky top-0 bg-slate-100 z-10">
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-600">
                  <th className="py-3 px-4 bg-slate-100 sticky left-0 z-20">Setor Consumidor</th>
                  {costData.categoryList.map(c => (
                    <th key={c.category} className="py-3 px-3 text-right whitespace-nowrap">
                      {c.category}
                    </th>
                  ))}
                  <th className="py-3 px-4 text-right font-black bg-blue-50 text-blue-900 whitespace-nowrap">
                    Total Setor (R$)
                  </th>
                  <th className="py-3 px-3 text-center bg-blue-50 text-blue-900 whitespace-nowrap">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {costData.sectorList.map((sec, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-900 bg-white sticky left-0 z-10 whitespace-nowrap shadow-2xs">
                      <span 
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: SECTOR_COLORS[sec.sector] || '#3b82f6' }}
                      />
                      {sec.sector}
                    </td>
                    {costData.categoryList.map(c => {
                      const val = sec.categories[c.category] || 0;
                      return (
                        <td key={c.category} className="py-2.5 px-3 text-right whitespace-nowrap">
                          {val > 0 ? (
                            <span className="font-bold text-slate-800">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-4 text-right font-black text-blue-950 bg-blue-50/40 whitespace-nowrap">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sec.totalValue)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-600 bg-blue-50/40">
                      {sec.percentageOfTotal.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-100 font-black text-xs z-10 border-t-2 border-slate-300">
                <tr>
                  <td className="py-3 px-4 bg-slate-100 sticky left-0 z-20 text-slate-900">
                    TOTAL POR CATEGORIA
                  </td>
                  {costData.categoryList.map(c => (
                    <td key={c.category} className="py-3 px-3 text-right text-blue-900 whitespace-nowrap">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.totalValue)}
                    </td>
                  ))}
                  <td className="py-3 px-4 text-right text-blue-950 font-black text-sm bg-blue-100/80 whitespace-nowrap">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costData.grandTotalCost)}
                  </td>
                  <td className="py-3 px-3 text-center text-blue-950 bg-blue-100/80">
                    100%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: DETALHAMENTO POR ITEM INDIVIDUAL */}
      {viewMode === 'by_item' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-base font-black text-slate-900">
                Detalhamento de Custos por Material Individual
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Custos unitários, quantidade dispensada e absorção financeira por setor
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {costData.allItemsList.length} itens movimentados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[750px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-5">Material / Item</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-3 text-right">Preço Unit.</th>
                  <th className="py-3 px-3 text-center">Qtd Total</th>
                  <th className="py-3 px-4 text-right">Custo Total</th>
                  <th className="py-3 px-5">Rateio Financeiro por Setor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {costData.allItemsList
                  .filter(item => {
                    const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
                    const matchSearch = searchTerm.trim() === '' || item.name.toLowerCase().includes(searchTerm.toLowerCase().trim());
                    const matchSec = sectorFilter === 'all' || Boolean(item.sectors[sectorFilter]);
                    return matchCat && matchSearch && matchSec;
                  })
                  .map((item, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-3.5 px-5 font-bold text-slate-900">
                        {item.name}
                      </td>
                      <td className="py-3.5 px-4">
                        <span 
                          className="text-[10px] font-black px-2.5 py-1 rounded-md text-white whitespace-nowrap"
                          style={{ backgroundColor: getCategoryColor(item.category) }}
                        >
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-semibold text-slate-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)}
                      </td>
                      <td className="py-3.5 px-3 text-center font-black text-slate-900">
                        {item.totalQuantity}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-blue-950">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.totalValue)}
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {Object.values(item.sectors)
                            .sort((a, b) => b.value - a.value)
                            .map((sec, sIdx) => {
                              const secColor = SECTOR_COLORS[sec.sector] || '#3b82f6';
                              return (
                                <span
                                  key={sIdx}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-50 border border-slate-200/90 shadow-2xs"
                                >
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: secColor }} />
                                  <span className="text-slate-800">{sec.sector}:</span>
                                  <span className="font-extrabold text-blue-700">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sec.value)}
                                  </span>
                                </span>
                              );
                            })}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
