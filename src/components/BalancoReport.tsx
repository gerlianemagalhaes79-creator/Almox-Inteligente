import * as React from 'react';
import { useState, useMemo } from 'react';
import { 
  ClipboardList, 
  Printer, 
  Download, 
  Search, 
  Filter, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Boxes, 
  Layers, 
  Clock, 
  ArrowUpDown, 
  FileSpreadsheet, 
  ChevronLeft, 
  Eye, 
  Sparkles, 
  RefreshCw, 
  ShieldAlert, 
  Check,
  DollarSign,
  Package,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Item } from '../types';

interface BalancoReportProps {
  items: Item[];
  categories: string[];
  CATEGORY_COLORS: Record<string, string>;
  getCategoryColor: (cat: string) => string;
  letterheadImage: string | null;
  inventoryLocation: 'Almoxarifado' | 'Farmácia';
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onBack?: () => void;
}

type StockFilter = 'all' | 'with_stock' | 'zero_stock' | 'critical_batches';
type SortField = 'name_asc' | 'expiry_asc' | 'qty_desc' | 'qty_asc' | 'batch_asc';

// Safe date parsing helper that gracefully handles ISO (YYYY-MM-DD), Brazilian (DD/MM/YYYY), timestamps, and non-date strings
const parseSafeDate = (dateVal: any): Date | null => {
  if (!dateVal) return null;

  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : dateVal;
  }

  if (typeof dateVal !== 'string') {
    if (typeof dateVal === 'number') {
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof dateVal.toDate === 'function') {
      try {
        const d = dateVal.toDate();
        return isNaN(d.getTime()) ? null : d;
      } catch {}
    }
    return null;
  }

  const cleaned = dateVal.trim();
  if (
    !cleaned ||
    cleaned.toLowerCase() === 'indeterminada' ||
    cleaned.toLowerCase() === 'sem validade' ||
    cleaned.toLowerCase() === 'n/a' ||
    cleaned.toLowerCase() === 'na' ||
    cleaned.toLowerCase() === 'null' ||
    cleaned.toLowerCase() === 'undefined' ||
    cleaned === '-'
  ) {
    return null;
  }

  // Handle Brazilian format DD/MM/YYYY or DD-MM-YYYY
  const brMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Handle standard ISO format YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Try parseISO from date-fns
  try {
    const parsed = parseISO(cleaned);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {}

  // Fallback to native Date
  try {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d;
  } catch {}

  return null;
};

// Safe date formatting helper to avoid "Invalid time value" RangeError
const formatSafeDate = (dateVal: any): string => {
  const d = parseSafeDate(dateVal);
  if (!d) return 'Sem Validade';
  try {
    return format(d, 'dd/MM/yyyy');
  } catch {
    return 'Sem Validade';
  }
};

export const BalancoReport: React.FC<BalancoReportProps> = ({
  items,
  categories,
  CATEGORY_COLORS,
  getCategoryColor,
  letterheadImage,
  inventoryLocation,
  showToast,
  onBack
}) => {
  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>(inventoryLocation || 'all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('with_stock');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name_asc');

  // Count Mode state: physical count entries typed in UI [itemId -> count]
  const [isCountMode, setIsCountMode] = useState<boolean>(false);
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>({});

  // Active items (excluding soft deleted)
  const activeItems = useMemo(() => {
    return items.filter(i => !i.deletedAt);
  }, [items]);

  // Dynamic available categories from both list and items
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    Object.keys(CATEGORY_COLORS).forEach(c => set.add(c));
    categories.forEach(c => set.add(c));
    activeItems.forEach(i => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set).sort();
  }, [activeItems, categories, CATEGORY_COLORS]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const map: Record<string, { count: number; totalQty: number; value: number }> = {};
    activeItems.forEach(item => {
      const cat = item.category || 'Não Informado';
      if (!map[cat]) {
        map[cat] = { count: 0, totalQty: 0, value: 0 };
      }
      map[cat].count += 1;
      map[cat].totalQty += (item.quantity || 0);
      map[cat].value += (item.quantity || 0) * (item.unit_price || 0);
    });
    return map;
  }, [activeItems]);

  // Helper for batch expiry status
  const getExpiryStatus = (expiryDateStr: any) => {
    const expDate = parseSafeDate(expiryDateStr);
    if (!expDate) {
      return { 
        status: 'none', 
        label: typeof expiryDateStr === 'string' && expiryDateStr && expiryDateStr.toLowerCase() !== 'indeterminada' ? expiryDateStr : 'Sem Validade', 
        color: 'text-slate-400 bg-slate-100 border-slate-200', 
        days: null 
      };
    }

    try {
      const exp = startOfDay(expDate);
      const today = startOfDay(new Date());
      const diffDays = differenceInDays(exp, today);

      if (isNaN(diffDays)) {
        return { 
          status: 'none', 
          label: formatSafeDate(expDate), 
          color: 'text-slate-400 bg-slate-100 border-slate-200', 
          days: null 
        };
      }

      if (diffDays < 0) {
        return { 
          status: 'expired', 
          label: `Vencido (${Math.abs(diffDays)}d atrás)`, 
          color: 'text-rose-700 bg-rose-50 border-rose-200 font-black', 
          days: diffDays 
        };
      }
      if (diffDays <= 30) {
        return { 
          status: 'critical', 
          label: `Vence em ${diffDays}d!`, 
          color: 'text-amber-800 bg-amber-50 border-amber-300 font-extrabold', 
          days: diffDays 
        };
      }
      if (diffDays <= 90) {
        return { 
          status: 'warning', 
          label: `Vence em ${diffDays}d`, 
          color: 'text-yellow-800 bg-yellow-50 border-yellow-200 font-bold', 
          days: diffDays 
        };
      }
      return { 
        status: 'valid', 
        label: formatSafeDate(exp), 
        color: 'text-emerald-700 bg-emerald-50 border-emerald-200', 
        days: diffDays 
      };
    } catch {
      return { status: 'none', label: 'Sem Validade', color: 'text-slate-400 bg-slate-100 border-slate-200', days: null };
    }
  };

  // Filtered & Sorted items for the balance sheet
  const balanceItems = useMemo(() => {
    let result = activeItems.filter(item => {
      // Material Type / Category Filter
      if (selectedCategory !== 'all') {
        if ((item.category || 'Não Informado') !== selectedCategory) return false;
      }

      // Location Filter
      if (selectedLocation !== 'all') {
        const itemLoc = item.location || 'Almoxarifado';
        if (itemLoc !== selectedLocation) return false;
      }

      // Stock Status Filter
      if (stockFilter === 'with_stock' && (item.quantity || 0) <= 0) {
        return false;
      }
      if (stockFilter === 'zero_stock' && (item.quantity || 0) > 0) {
        return false;
      }
      if (stockFilter === 'critical_batches') {
        const exp = getExpiryStatus(item.expiry_date);
        if (exp.status !== 'expired' && exp.status !== 'critical' && exp.status !== 'warning') {
          return false;
        }
      }

      // Search Term (Matches Name, Batch, Supplier, Description)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesName = (item.name || '').toLowerCase().includes(term);
        const matchesBatch = (item.batch_number || '').toLowerCase().includes(term);
        const matchesSupplier = (item.supplier || '').toLowerCase().includes(term);
        const matchesDesc = (item.description || '').toLowerCase().includes(term);
        if (!matchesName && !matchesBatch && !matchesSupplier && !matchesDesc) {
          return false;
        }
      }

      return true;
    });

    // Sort Items
    return result.sort((a, b) => {
      if (sortField === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortField === 'qty_desc') {
        return (b.quantity || 0) - (a.quantity || 0);
      }
      if (sortField === 'qty_asc') {
        return (a.quantity || 0) - (b.quantity || 0);
      }
      if (sortField === 'batch_asc') {
        return (a.batch_number || '').localeCompare(b.batch_number || '');
      }
      if (sortField === 'expiry_asc') {
        const dateA = parseSafeDate(a.expiry_date);
        const dateB = parseSafeDate(b.expiry_date);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.getTime() - dateB.getTime();
      }
      return 0;
    });
  }, [activeItems, selectedCategory, selectedLocation, stockFilter, searchTerm, sortField]);

  // Overall Statistics for current selection
  const stats = useMemo(() => {
    const totalBatches = balanceItems.length;
    const uniqueProducts = new Set(balanceItems.map(i => i.name?.trim().toLowerCase())).size;
    const totalUnits = balanceItems.reduce((acc, i) => acc + (i.quantity || 0), 0);
    const totalValue = balanceItems.reduce((acc, i) => acc + ((i.quantity || 0) * (i.unit_price || 0)), 0);
    
    let expiredCount = 0;
    let criticalCount = 0;
    balanceItems.forEach(i => {
      const exp = getExpiryStatus(i.expiry_date);
      if (exp.status === 'expired') expiredCount++;
      if (exp.status === 'critical' || exp.status === 'warning') criticalCount++;
    });

    // In count mode: count discrepancies
    let totalPhysicalUnits = 0;
    let discrepanciesCount = 0;
    let countedItemsCount = 0;

    balanceItems.forEach(i => {
      if (physicalCounts[i.id] !== undefined) {
        countedItemsCount++;
        const pQty = physicalCounts[i.id];
        totalPhysicalUnits += pQty;
        if (pQty !== i.quantity) {
          discrepanciesCount++;
        }
      }
    });

    return {
      totalBatches,
      uniqueProducts,
      totalUnits,
      totalValue,
      expiredCount,
      criticalCount,
      totalPhysicalUnits,
      discrepanciesCount,
      countedItemsCount
    };
  }, [balanceItems, physicalCounts]);

  // Handle setting physical count for an item
  const handlePhysicalCountChange = (itemId: string, val: string) => {
    const num = val === '' ? undefined : parseInt(val, 10);
    setPhysicalCounts(prev => {
      const copy = { ...prev };
      if (num === undefined || isNaN(num)) {
        delete copy[itemId];
      } else {
        copy[itemId] = num;
      }
      return copy;
    });
  };

  // Clear all physical counts
  const handleResetCounts = () => {
    if (Object.keys(physicalCounts).length === 0) return;
    if (window.confirm("Deseja zerar todas as contagens físicas anotadas nesta sessão?")) {
      setPhysicalCounts({});
      showToast("Contagens reiniciadas.", "info");
    }
  };

  // Export PDF - Official Balance / Inventory Count Sheet
  const handleExportPDF = (withValues: boolean = false) => {
    try {
      showToast("Gerando Folha de Balanço Oficial...", "info");

      // Landscape mode A4 gives optimal horizontal space for batches, expiry and count fields
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      let startY = 14;

      // Header with custom letterhead if present
      if (letterheadImage) {
        try {
          doc.addImage(letterheadImage, 'PNG', 14, 8, pageWidth - 28, 26);
          startY = 38;
        } catch {
          startY = 16;
        }
      } else {
        // Clinical Government Header
        doc.setFillColor(30, 58, 138); // blue-900
        doc.rect(14, 10, 4, 18, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.text('POLICLÍNICA REGIONAL BERNARDO FÉLIX DA SILVA', 22, 16);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(37, 99, 235);
        doc.text('RELATÓRIO DE BALANÇO E INVENTÁRIO FÍSICO DE ESTOQUE', 22, 22);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('Setor de Gestão de Insumos, Almoxarifado Central e Farmácia Hospitalar', 22, 27);

        startY = 34;
      }

      // Metadata Info Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, startY, pageWidth - 28, 16, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);

      const categoryLabel = selectedCategory === 'all' ? 'TODOS OS TIPOS DE MATERIAL' : selectedCategory.toUpperCase();
      const locationLabel = selectedLocation === 'all' ? 'TODAS AS UNIDADES' : selectedLocation.toUpperCase();
      const dateStr = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

      doc.text(`TIPO DE MATERIAL:`, 18, startY + 6);
      doc.setFont('helvetica', 'normal');
      doc.text(categoryLabel, 55, startY + 6);

      doc.setFont('helvetica', 'bold');
      doc.text(`LOCALIZAÇÃO:`, 18, startY + 12);
      doc.setFont('helvetica', 'normal');
      doc.text(locationLabel, 55, startY + 12);

      doc.setFont('helvetica', 'bold');
      doc.text(`EMISSÃO:`, 150, startY + 6);
      doc.setFont('helvetica', 'normal');
      doc.text(dateStr, 175, startY + 6);

      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL LOTES:`, 150, startY + 12);
      doc.setFont('helvetica', 'normal');
      doc.text(`${stats.totalBatches} lotes (${stats.totalUnits.toLocaleString('pt-BR')} unidades no sistema)`, 175, startY + 12);

      if (withValues) {
        doc.setFont('helvetica', 'bold');
        doc.text(`VALOR TOTAL:`, 230, startY + 6);
        doc.setFont('helvetica', 'normal');
        doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalValue), 255, startY + 6);
      }

      // Table Setup
      const headColumns = withValues ? [
        ['Nº', 'Material / Descrição', 'Tipo / Categoria', 'Lote', 'Validade', 'Und.', 'Qtd. Sistema', 'Contagem Física', 'Divergência', 'Vlr. Unit.', 'Vlr. Total']
      ] : [
        ['Nº', 'Material / Descrição', 'Tipo / Categoria', 'Lote', 'Validade', 'Und.', 'Qtd. Sistema', 'Contagem Física [ _____ ]', 'Diferença (+ / -)', 'Fornecedor / Origem']
      ];

      const bodyRows = balanceItems.map((item, idx) => {
        const exp = getExpiryStatus(item.expiry_date);
        let expiryDisplay = formatSafeDate(item.expiry_date);
        if (exp.status === 'expired') {
          expiryDisplay += ' (VENCIDO)';
        } else if (exp.status === 'critical') {
          expiryDisplay += ` (${exp.days}d)`;
        }

        const physical = physicalCounts[item.id];
        const divergence = physical !== undefined ? physical - (item.quantity || 0) : '';

        if (withValues) {
          return [
            String(idx + 1),
            item.name || 'Sem nome',
            item.category || 'Geral',
            item.batch_number || 'S/ Lote',
            expiryDisplay,
            item.unit_measure || 'UN',
            String(item.quantity || 0),
            physical !== undefined ? String(physical) : '[         ]',
            divergence !== '' ? (divergence > 0 ? `+${divergence}` : String(divergence)) : '[         ]',
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price || 0),
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((item.quantity || 0) * (item.unit_price || 0))
          ];
        }

        return [
          String(idx + 1),
          item.name || 'Sem nome',
          item.category || 'Geral',
          item.batch_number || 'S/ Lote',
          expiryDisplay,
          item.unit_measure || 'UN',
          String(item.quantity || 0),
          physical !== undefined ? String(physical) : '[                  ]',
          divergence !== '' ? (divergence > 0 ? `+${divergence}` : String(divergence)) : '[                  ]',
          item.supplier || (item.origin ? item.origin.toUpperCase() : 'Não inf.')
        ];
      });

      autoTable(doc, {
        startY: startY + 20,
        head: headColumns,
        body: bodyRows,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          valign: 'middle',
          font: 'helvetica',
          lineColor: [203, 213, 225],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center'
        },
        columnStyles: withValues ? {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 55, halign: 'left' },
          2: { cellWidth: 32, halign: 'left' },
          3: { cellWidth: 24, halign: 'center' },
          4: { cellWidth: 28, halign: 'center' },
          5: { cellWidth: 14, halign: 'center' },
          6: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 24, halign: 'center' },
          8: { cellWidth: 20, halign: 'center' },
          9: { cellWidth: 20, halign: 'right' },
          10: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
        } : {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 70, halign: 'left' },
          2: { cellWidth: 38, halign: 'left' },
          3: { cellWidth: 28, halign: 'center' },
          4: { cellWidth: 32, halign: 'center' },
          5: { cellWidth: 14, halign: 'center' },
          6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 26, halign: 'center' },
          8: { cellWidth: 22, halign: 'center' },
          9: { cellWidth: 32, halign: 'left' }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didParseCell: (data) => {
          // Highlight expired or critical rows in red/amber font
          if (data.section === 'body' && data.column.index === 4) {
            const val = String(data.cell.raw);
            if (val.includes('VENCIDO')) {
              data.cell.styles.textColor = [190, 18, 60]; // rose-700
              data.cell.styles.fontStyle = 'bold';
            } else if (val.includes('d)')) {
              data.cell.styles.textColor = [180, 83, 9]; // amber-700
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        margin: { left: 14, right: 14 }
      });

      // Signatures section at bottom of document
      const lastTableY = (doc as any).lastAutoTable.finalY || 150;
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // If table ended too low, add page for signatures
      let signatureY = lastTableY + 16;
      if (signatureY + 30 > pageHeight) {
        doc.addPage();
        signatureY = 35;
      }

      // Responsibilities statement
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        'Declaramos para os devidos fins de auditoria, conformidade e prestação de contas que o inventário físico acima foi conferido in loco nesta data.',
        pageWidth / 2,
        signatureY,
        { align: 'center' }
      );

      // Signature Lines
      const lineY = signatureY + 16;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.5);

      // Line 1: Conferente
      doc.line(30, lineY, 100, lineY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('Conferente / Responsável pela Contagem', 65, lineY + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Assinatura e Matrícula', 65, lineY + 7.5, { align: 'center' });

      // Line 2: Almoxarife / Farmacêutico
      doc.line(115, lineY, 185, lineY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('Responsável pelo Almoxarifado / Farmácia', 150, lineY + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Carimbo e Assinatura', 150, lineY + 7.5, { align: 'center' });

      // Line 3: Controle Interno / Direção
      doc.line(200, lineY, 270, lineY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('Direção Administrativa / Auditoria', 235, lineY + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Visto de Homologação', 235, lineY + 7.5, { align: 'center' });

      // Footer numbering
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Policlínica Regional Bernardo Félix da Silva • Folha de Balanço de Estoque • Página ${i} de ${totalPages}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      const fileName = `Balanco_Estoque_${selectedCategory.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      showToast("Folha de Balanço Oficial (PDF) exportada com sucesso!", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`Erro ao gerar PDF: ${err.message}`, "error");
    }
  };

  // Export Excel (.xlsx)
  const handleExportExcel = () => {
    try {
      showToast("Gerando Planilha do Balanço...", "info");

      const rows = balanceItems.map((item, index) => {
        const exp = getExpiryStatus(item.expiry_date);
        const physical = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : '';
        const diff = physical !== '' ? (Number(physical) - (item.quantity || 0)) : '';

        return {
          'Nº': index + 1,
          'Nome do Material': item.name || '',
          'Descrição': item.description || '',
          'Tipo de Material (Categoria)': item.category || 'Geral',
          'Número do Lote': item.batch_number || 'S/ LOTE',
          'Data de Validade': formatSafeDate(item.expiry_date),
          'Status da Validade': exp.label,
          'Dias até Vencer': exp.days !== null ? exp.days : 'N/A',
          'Unidade de Medida': item.unit_measure || 'UN',
          'Qtd. no Sistema': item.quantity || 0,
          'Contagem Física Real': physical,
          'Diferença (Físico - Sistema)': diff,
          'Preço Unitário (R$)': item.unit_price || 0,
          'Valor Total no Sistema (R$)': (item.quantity || 0) * (item.unit_price || 0),
          'Fornecedor / Fabricante': item.supplier || '',
          'Origem': item.origin ? item.origin.toUpperCase() : 'CONTRATO',
          'Local': item.location || 'Almoxarifado',
          'Sala / Armário': item.room || ''
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      // Auto width for columns
      const colWidths = [
        { wch: 6 },
        { wch: 35 },
        { wch: 25 },
        { wch: 20 },
        { wch: 16 },
        { wch: 14 },
        { wch: 18 },
        { wch: 14 },
        { wch: 10 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
        { wch: 20 },
        { wch: 25 },
        { wch: 12 },
        { wch: 15 },
        { wch: 15 }
      ];
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, "Balanço de Estoque");
      const fileName = `Balanco_Estoque_${selectedCategory.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast("Planilha Excel exportada com sucesso!", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`Erro ao exportar Excel: ${err.message}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title Bar */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {onBack && (
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-all"
                >
                  <ChevronLeft size={14} /> Voltar
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200/80">
                <ClipboardList size={13} className="text-blue-600" />
                Módulo Oficial de Balanço & Inventário Físico
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                {selectedCategory === 'all' ? 'Todos os Tipos de Material' : selectedCategory}
              </span>
            </div>

            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Relatório de Balanço e Inventário de Estoque
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-3xl leading-relaxed">
              Realize a contagem física, conferência de lotes e controle de datas de validade por tipo de material. 
              Gere folhas oficiais para preenchimento ou digite os dados diretamente para apuração de sobras e faltas.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => handleExportPDF(false)}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 hover:from-blue-800 hover:to-indigo-950 text-white rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
              title="Gerar Folha de Balanço Oficial em PDF para prancheta"
            >
              <Printer size={16} /> Folha de Contagem (PDF)
            </button>

            <button
              onClick={() => handleExportPDF(true)}
              className="px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-2xs cursor-pointer"
              title="Gerar Relatório com Valores Financeiros"
            >
              <FileSpreadsheet size={16} className="text-slate-600" /> PDF com Valores
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-2xs cursor-pointer"
              title="Exportar Planilha Excel Completa"
            >
              <Download size={16} className="text-emerald-600" /> Exportar Excel
            </button>
          </div>
        </div>

        {/* Mode Selector: View Mode vs Interactive Count Mode */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCountMode(!isCountMode)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
                isCountMode
                  ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <ClipboardList size={15} />
              <span>{isCountMode ? 'Modo Digitação de Balanço Ativo' : 'Ativar Digitação de Contagem em Tela'}</span>
            </button>

            {isCountMode && stats.countedItemsCount > 0 && (
              <button
                onClick={handleResetCounts}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 underline decoration-dotted flex items-center gap-1"
              >
                <RefreshCw size={12} /> Limpar contagens digitadas ({stats.countedItemsCount})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span>Última atualização: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Lotes */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Lotes Listados</span>
            <Boxes size={18} className="text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-1.5 tracking-tight">{stats.totalBatches}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{stats.uniqueProducts} produtos distintos</p>
        </div>

        {/* Quantidade em Estoque */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Saldo no Sistema</span>
            <Package size={18} className="text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-indigo-700 mt-1.5 tracking-tight">
            {stats.totalUnits.toLocaleString('pt-BR')}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">unidades físicas</p>
        </div>

        {/* Valor Total Inventariado */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Valor em Estoque</span>
            <DollarSign size={18} className="text-emerald-600" />
          </div>
          <p className="text-xl font-black text-emerald-700 mt-1.5 tracking-tight truncate">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.totalValue)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">patrimônio avaliado</p>
        </div>

        {/* Lotes Vencidos */}
        <div className={`p-4 rounded-2xl border shadow-xs ${
          stats.expiredCount > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200/90'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-black uppercase tracking-wider ${stats.expiredCount > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
              Lotes Vencidos
            </span>
            <XCircle size={18} className={stats.expiredCount > 0 ? 'text-rose-600' : 'text-slate-400'} />
          </div>
          <p className={`text-2xl font-black mt-1.5 tracking-tight ${stats.expiredCount > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
            {stats.expiredCount}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">descarte / baixa necessária</p>
        </div>

        {/* Lotes Críticos / Próximos */}
        <div className={`p-4 rounded-2xl border shadow-xs ${
          stats.criticalCount > 0 ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-slate-200/90'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-black uppercase tracking-wider ${stats.criticalCount > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
              Vencem em Breve
            </span>
            <AlertTriangle size={18} className={stats.criticalCount > 0 ? 'text-amber-600' : 'text-slate-400'} />
          </div>
          <p className={`text-2xl font-black mt-1.5 tracking-tight ${stats.criticalCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
            {stats.criticalCount}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">priorizar saída (FEFO)</p>
        </div>
      </div>

      {/* Discrepancies Alert in Count Mode */}
      {isCountMode && stats.countedItemsCount > 0 && (
        <div className="bg-amber-50 border border-amber-200/90 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0">
              <ClipboardList size={20} />
            </div>
            <div>
              <p className="text-xs font-black text-amber-900">
                Apuração em Andamento: {stats.countedItemsCount} de {stats.totalBatches} lotes conferidos
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Total Físico Contado: <strong>{stats.totalPhysicalUnits}</strong> un. | 
                Divergências Encontradas: <strong className={stats.discrepanciesCount > 0 ? 'text-rose-700' : 'text-emerald-700'}>{stats.discrepanciesCount} lotes com sobra ou falta</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleExportPDF(false)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 transition-all"
          >
            Imprimir com Contagens
          </button>
        </div>
      )}

      {/* Filter and Configuration Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
        {/* Row 1: Primary Category Selection Pill Bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} className="text-blue-600" />
              Escolher Tipo de Material para o Balanço:
            </span>
            <span className="text-[11px] font-bold text-slate-400">
              {availableCategories.length} categorias disponíveis
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Todos os Tipos ({activeItems.length})
            </button>

            {availableCategories.map(cat => {
              const count = categoryCounts[cat]?.count || 0;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{cat}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-blue-800 text-blue-100' : 'bg-slate-200/80 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Search, Location, Stock Status, Sort */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, lote ou fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Location selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 shrink-0">Unidade:</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none w-full cursor-pointer"
            >
              <option value="all">Todas as Unidades</option>
              <option value="Almoxarifado">Almoxarifado Geral</option>
              <option value="Farmácia">Farmácia Hospitalar</option>
            </select>
          </div>

          {/* Stock status selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 shrink-0">Saldo:</span>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none w-full cursor-pointer"
            >
              <option value="with_stock">Apenas com Estoque (&gt;0)</option>
              <option value="all">Todos os Lotes e Itens</option>
              <option value="zero_stock">Estoque Zerado (=0)</option>
              <option value="critical_batches">Lotes Críticos / Vencendo</option>
            </select>
          </div>

          {/* Sort order */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
            <ArrowUpDown size={14} className="text-slate-500 shrink-0" />
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none w-full cursor-pointer"
            >
              <option value="name_asc">Nome do Material (A-Z)</option>
              <option value="expiry_asc">Validade mais próxima (FEFO)</option>
              <option value="qty_desc">Maior Quantidade</option>
              <option value="qty_asc">Menor Quantidade</option>
              <option value="batch_asc">Número do Lote</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table of Inventory Batches */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-700">
              Relação de Lotes para Conferência:
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-black text-xs">
              {balanceItems.length} lotes encontrados
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
            <span>Dica: Para o balanço impresso, clique em <strong>Folha de Contagem (PDF)</strong></span>
          </div>
        </div>

        {balanceItems.length === 0 ? (
          <div className="p-12 text-center">
            <Boxes size={36} className="mx-auto text-slate-300 mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Nenhum lote encontrado</h4>
            <p className="text-xs text-slate-400 mt-1">
              Verifique os filtros selecionados (tipo de material, saldo ou termo de busca).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200/80">
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-3">Material / Especificação</th>
                  <th className="py-3 px-3">Tipo de Material</th>
                  <th className="py-3 px-3">Lote</th>
                  <th className="py-3 px-3">Validade</th>
                  <th className="py-3 px-3 text-center">Und.</th>
                  <th className="py-3 px-3 text-right">Qtd. Sistema</th>
                  <th className="py-3 px-3 text-center bg-blue-50/40 border-x border-blue-100">
                    Contagem Física
                  </th>
                  {isCountMode && (
                    <th className="py-3 px-3 text-center bg-blue-50/70">
                      Divergência
                    </th>
                  )}
                  <th className="py-3 px-3 text-right">Vlr. Unitário</th>
                  <th className="py-3 px-3 text-right">Vlr. Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balanceItems.map((item, index) => {
                  const exp = getExpiryStatus(item.expiry_date);
                  const physicalVal = physicalCounts[item.id];
                  const hasPhysical = physicalVal !== undefined;
                  const diff = hasPhysical ? physicalVal - (item.quantity || 0) : null;

                  return (
                    <tr 
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        exp.status === 'expired' ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                        {index + 1}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800 text-xs">
                          {item.name}
                        </div>
                        {item.description && (
                          <div className="text-[10px] text-slate-400 truncate max-w-xs">
                            {item.description}
                          </div>
                        )}
                        {item.room && (
                          <div className="text-[10px] text-blue-600 font-semibold mt-0.5">
                            Local: {item.room}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <span 
                          className="inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white"
                          style={{ backgroundColor: getCategoryColor(item.category || 'Geral') }}
                        >
                          {item.category || 'Geral'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                        {item.batch_number ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {item.batch_number}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">S/ Lote</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border ${exp.color}`}>
                          <Calendar size={11} />
                          {exp.label}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono font-bold">
                        {item.unit_measure || 'UN'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-black text-slate-900 font-mono text-sm">
                        {(item.quantity || 0).toLocaleString('pt-BR')}
                      </td>

                      {/* Physical count column */}
                      <td className="py-2 px-3 text-center bg-blue-50/20 border-x border-blue-100/60">
                        {isCountMode ? (
                          <input
                            type="number"
                            min="0"
                            placeholder="Qtd."
                            value={physicalVal !== undefined ? physicalVal : ''}
                            onChange={(e) => handlePhysicalCountChange(item.id, e.target.value)}
                            className="w-20 px-2 py-1 text-center font-mono font-bold text-xs bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 shadow-2xs"
                          />
                        ) : (
                          <div className="w-20 mx-auto py-1 border border-dashed border-slate-300 rounded text-center text-slate-300 font-mono text-[10px]">
                            [ ______ ]
                          </div>
                        )}
                      </td>

                      {/* Discrepancy column in Count Mode */}
                      {isCountMode && (
                        <td className="py-2.5 px-3 text-center bg-blue-50/30 font-mono font-extrabold">
                          {diff !== null ? (
                            diff === 0 ? (
                              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                                OK (0)
                              </span>
                            ) : diff > 0 ? (
                              <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 text-[11px]">
                                +{diff} (Sobra)
                              </span>
                            ) : (
                              <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 text-[11px]">
                                {diff} (Falta)
                              </span>
                            )
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      )}

                      <td className="py-2.5 px-3 text-right text-slate-600 font-mono">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price || 0)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((item.quantity || 0) * (item.unit_price || 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer summary bar */}
        <div className="bg-slate-50 p-4 border-t border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold text-slate-700">
          <div>
            Total: <strong>{balanceItems.length} lotes</strong> | Unidades no Sistema: <strong>{stats.totalUnits.toLocaleString('pt-BR')}</strong>
          </div>
          <div>
            Patrimônio Avaliado: <strong className="text-emerald-700 font-black text-sm">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalValue)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
