import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  FileText,
  Layers,
  Package,
  Printer,
  RotateCcw,
  Search,
  Building2,
  Eye,
  X,
  ArrowLeft,
  TrendingUp,
  History,
  Edit3
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Item, Transaction } from '../types';
import { getCategorizedExitType } from '../utils/exitReasonUtils';

export interface MonthlySectorConsumptionReportProps {
  items: Item[];
  transactions: Transaction[];
  inventoryLocation: 'Almoxarifado' | 'Farmácia';
  letterheadImage?: string | null;
  isAdmin?: boolean;
  selectedSector?: string;
  getCategoryColor?: (cat: string) => string;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onBack?: () => void;
  embedded?: boolean;
  onOpenFullReport?: () => void;
}

type PeriodMode = 'year' | 'custom_range';
type YearSubFilter = 'full_year' | 'sem1' | 'sem2';

interface MonthBucket {
  key: string; // YYYY-MM
  year: number;
  monthIndex: number; // 0-11
  label: string; // Janeiro, Fevereiro...
  shortLabel: string; // Jan, Fev...
  color: string;
}

interface ConsolidatedMaterialConsumption {
  normName: string;
  name: string;
  category: string;
  unitMeasure: string;
  batchesSet: Set<string>;
  monthlyQty: number[];
  totalQty: number;
  totalValue: number;
  movementsCount: number;
}

interface SectorMovementDetail {
  id: string;
  date: string;
  parsedDate: Date;
  monthKey: string;
  monthLabel: string;
  itemName: string;
  batchNumber: string;
  quantity: number;
  unitMeasure: string;
  unitPrice: number;
  totalValue: number;
  responsible: string;
  isRetroactive: boolean;
  isReturn: boolean;
}

interface SectorMonthlyRow {
  sector: string;
  monthlyValues: number[];
  total: number;
  totalValue: number;
  sharePct: number;
  movementsCount: number;
  materialsCount: number;
  materials: ConsolidatedMaterialConsumption[];
  movements: SectorMovementDetail[];
}

const MONTH_NAMES_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

const MONTH_NAMES_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez'
];

// High-contrast distinct colors for each month (modeled after institutional stacked bar chart)
const MONTH_COLORS = [
  '#1d4ed8', // Janeiro - Azul Royal
  '#b91c1c', // Fevereiro - Vermelho Institucional
  '#b45309', // Março - Âmbar / Ocre
  '#15803d', // Abril - Verde Floresta
  '#c2410c', // Maio - Laranja Terracota
  '#0284c7', // Junho - Azul Celeste
  '#6d28d9', // Julho - Roxo
  '#be185d', // Agosto - Magenta
  '#0f766e', // Setembro - Verde Petróleo
  '#a16207', // Outubro - Dourado Escuro
  '#4338ca', // Novembro - Índigo
  '#334155'  // Dezembro - Ardósia Escuro
];

const normalizeText = (str?: string | null): string =>
  String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const parseFlexibleDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const d = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
};

const formatInt = (val: number): string =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(val || 0));

const formatCurrency = (val: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

/**
 * Calculates the visual width percentage (summing to 100%) for each month in a sector row.
 * Preserves real quantities while guaranteeing a minimum visual width for every active month (val > 0)
 * so that all colored segments fill the full rectangular bar and their centered quantities are always legible.
 */
function computeVisualSegmentWidths(monthlyValues: number[]): number[] {
  const n = monthlyValues.length;
  const activeIndices: number[] = [];
  let total = 0;

  for (let i = 0; i < n; i++) {
    const v = monthlyValues[i] || 0;
    if (v > 0) {
      activeIndices.push(i);
      total += v;
    }
  }

  const result = new Array(n).fill(0);
  const k = activeIndices.length;
  if (k === 0 || total <= 0) return result;
  if (k === 1) {
    result[activeIndices[0]] = 100;
    return result;
  }

  const baseMinPct =
    k === 2
      ? 16
      : k === 3
      ? 12
      : k === 4
      ? 10
      : k <= 6
      ? 8.5
      : k <= 9
      ? 7.2
      : Math.min(86 / k, 6.5);

  const minPcts = new Array(n).fill(0);
  let sumMin = 0;
  for (const idx of activeIndices) {
    const valStr = formatInt(monthlyValues[idx]);
    const charBasedMin = Math.max(baseMinPct, valStr.length * 1.4 + 3.2);
    minPcts[idx] = charBasedMin;
    sumMin += charBasedMin;
  }

  const maxAllowedMinSum = 86;
  if (sumMin > maxAllowedMinSum) {
    const scale = maxAllowedMinSum / sumMin;
    for (const idx of activeIndices) {
      minPcts[idx] *= scale;
    }
  }

  const locked = new Set<number>();
  let remainingPct = 100;
  let remainingValue = total;

  while (true) {
    let clampedAny = false;
    for (const idx of activeIndices) {
      if (locked.has(idx)) continue;
      const rawShare =
        remainingValue > 0
          ? (monthlyValues[idx] / remainingValue) * remainingPct
          : remainingPct / (k - locked.size);
      if (rawShare < minPcts[idx]) {
        result[idx] = minPcts[idx];
        locked.add(idx);
        remainingPct -= minPcts[idx];
        remainingValue -= monthlyValues[idx];
        clampedAny = true;
      }
    }
    if (!clampedAny) break;
  }

  const unlocked = activeIndices.filter(idx => !locked.has(idx));
  if (unlocked.length > 0) {
    let distributed = 0;
    unlocked.forEach((idx, uPos) => {
      if (uPos === unlocked.length - 1) {
        result[idx] = Math.max(0, remainingPct - distributed);
      } else {
        const share =
          remainingValue > 0
            ? (monthlyValues[idx] / remainingValue) * remainingPct
            : remainingPct / unlocked.length;
        result[idx] = share;
        distributed += share;
      }
    });
  } else {
    const currentSum = activeIndices.reduce((acc, idx) => acc + result[idx], 0);
    if (currentSum > 0) {
      for (const idx of activeIndices) {
        result[idx] = (result[idx] / currentSum) * 100;
      }
    }
  }

  return result;
}

/**
 * Renders the Horizontal Stacked Bar Chart onto an offscreen HiDPI HTML5 Canvas
 * so PDF exports and Print views have crisp, vector-grade legibility with month colors,
 * per-month values, sector totals, and general category total.
 */
function renderMonthlyStackedChartCanvas(params: {
  title: string;
  subtitle: string;
  months: MonthBucket[];
  sectors: SectorMonthlyRow[];
  grandTotal: number;
}): { dataUrl: string; width: number; height: number } {
  const { title, subtitle, months, sectors, grandTotal } = params;
  const W = 1120;
  const rowsCount = Math.max(1, sectors.length);
  // Adapt row height when many sectors exist so the chart always fits comfortably on a single page
  const rowH = rowsCount > 14 ? 25 : rowsCount > 10 ? 28 : 32;
  const barH = Math.max(17, rowH - 10);
  const headerH = 66;
  const legendH = 52;
  const H = headerH + rowsCount * rowH + legendH + 18;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // White card background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Title & Grand Total badge
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14.5px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title.toUpperCase(), 22, 26);

  ctx.fillStyle = '#475569';
  ctx.font = '11px Helvetica, Arial, sans-serif';
  ctx.fillText(subtitle, 22, 43);

  // Grand total pill on top right
  const totalBadgeText = `TOTAL GERAL DA CATEGORIA: ${formatInt(grandTotal)} UN`;
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  const badgeW = Math.max(235, ctx.measureText(totalBadgeText).width + 26);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(W - badgeW - 22, 14, badgeW, 28);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(totalBadgeText, W - badgeW / 2 - 22, 32);

  // Divider line
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(22, 54);
  ctx.lineTo(W - 22, 54);
  ctx.stroke();

  if (sectors.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 13px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Nenhuma saída registrada para esta categoria nos meses selecionados.',
      W / 2,
      headerH + 22
    );
    return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
  }

  const barLeft = 215;
  const totalColW = 92;
  const barMaxW = W - barLeft - totalColW - 26;

  sectors.forEach((sec, rIdx) => {
    const y = headerH + rIdx * rowH;
    const textBaselineY = y + 3 + barH / 2 + 3.5;

    // Alternating subtle row background
    if (rIdx % 2 === 0) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(14, y - 2, W - 28, rowH - 2);
    }

    // Sector Label on Left
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${rowsCount > 14 ? '9.5px' : '10.5px'} Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'right';
    const cleanSecName =
      sec.sector.length > 25 ? sec.sector.slice(0, 24) + '…' : sec.sector;
    ctx.fillText(cleanSecName.toUpperCase(), barLeft - 12, textBaselineY);

    // Track bar rectangle
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(barLeft, y + 3, barMaxW, barH);

    // Compute visual widths that completely fill the rectangular bar with a minimum width per active month
    const visualWidthsPct = computeVisualSegmentWidths(sec.monthlyValues);

    let currentX = barLeft;
    sec.monthlyValues.forEach((val, mIdx) => {
      if (val <= 0 || sec.total <= 0) return;
      const segW = (visualWidthsPct[mIdx] / 100) * barMaxW;
      const color = months[mIdx]?.color || MONTH_COLORS[mIdx % MONTH_COLORS.length];

      ctx.fillStyle = color;
      ctx.fillRect(currentX, y + 3, segW, barH);

      // Subtle vertical separator between adjacent month segments
      if (currentX > barLeft + 0.5) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(currentX, y + 3);
        ctx.lineTo(currentX, y + 3 + barH);
        ctx.stroke();
      }

      // Always draw the quantity centered inside the colored segment
      const valStr = formatInt(val);
      ctx.font = `bold ${rowsCount > 14 ? '9px' : '10px'} Helvetica, Arial, sans-serif`;
      let textW = ctx.measureText(valStr).width;
      if (textW > segW - 6) {
        ctx.font = 'bold 8px Helvetica, Arial, sans-serif';
        textW = ctx.measureText(valStr).width;
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(valStr, currentX + segW / 2, textBaselineY);

      currentX += segW;
    });

    // Crisp outer border around the filled rectangle
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(barLeft, y + 3, barMaxW, barH);

    // Sector Total Badge on the Right
    const badgeX = barLeft + barMaxW + 10;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(badgeX, y + 3, totalColW - 10, barH);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${rowsCount > 14 ? '9.5px' : '10.5px'} Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(formatInt(sec.total), badgeX + (totalColW - 10) / 2, textBaselineY);
  });

  // Legend at the bottom
  const legendTop = headerH + rowsCount * rowH + 10;
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(22, legendTop - 4);
  ctx.lineTo(W - 22, legendTop - 4);
  ctx.stroke();

  let legX = 28;
  const legY = legendTop + 13;
  ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';

  months.forEach((m, idx) => {
    const itemText = m.label;
    const itemW = ctx.measureText(itemText).width + 26;
    if (legX + itemW > W - 140) {
      legX = 28;
    }
    ctx.fillStyle = m.color || MONTH_COLORS[idx % MONTH_COLORS.length];
    ctx.fillRect(legX, legY - 9, 11, 11);
    ctx.fillStyle = '#1e293b';
    ctx.fillText(itemText, legX + 15, legY);
    legX += itemW;
  });

  // Total Geral legend item
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(legX + 6, legY - 9, 11, 11);
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Total por Setor', legX + 21, legY);

  return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
}

export const MonthlySectorConsumptionReport: React.FC<MonthlySectorConsumptionReportProps> = ({
  items,
  transactions,
  inventoryLocation,
  letterheadImage,
  isAdmin = true,
  selectedSector,
  showToast,
  onBack,
  embedded = false,
  onOpenFullReport
}) => {
  // 1. Build comprehensive Material & Category Maps across all batches (without duplicating products)
  const materialCatalog = useMemo(() => {
    const byId = new Map<string, Item>();
    const byNormName = new Map<string, { category: string; unitMeasure: string; unitPrice: number; name: string }>();
    const categoryCounts = new Map<string, { materialsSet: Set<string>; batchesCount: number }>();

    items.forEach(item => {
      if (item.deletedAt) return;
      const loc = item.location || 'Almoxarifado';
      if (loc !== inventoryLocation) return;

      byId.set(item.id, item);

      const cleanName = (item.name || '').trim();
      const normName = normalizeText(cleanName);
      const rawCat = (item.category || 'Outros').trim() || 'Outros';
      const unitMeasure = (item.unit_measure || 'UN').trim() || 'UN';
      const price = Number(item.unit_price) || 0;

      if (normName) {
        const existing = byNormName.get(normName);
        if (!existing) {
          byNormName.set(normName, {
            name: cleanName,
            category: rawCat,
            unitMeasure,
            unitPrice: price
          });
        } else {
          if (existing.category === 'Outros' && rawCat !== 'Outros') {
            existing.category = rawCat;
          }
          if (existing.unitPrice === 0 && price > 0) {
            existing.unitPrice = price;
          }
        }
      }

      if (!categoryCounts.has(rawCat)) {
        categoryCounts.set(rawCat, { materialsSet: new Set(), batchesCount: 0 });
      }
      const catEntry = categoryCounts.get(rawCat)!;
      if (normName) catEntry.materialsSet.add(normName);
      catEntry.batchesCount += 1;
    });

    // Also inspect all exit transactions in this location so categories with historical movements are always listed
    transactions.forEach(tx => {
      if (tx.deletedAt || tx.type !== 'exit') return;
      const loc = tx.location || 'Almoxarifado';
      if (loc !== inventoryLocation) return;
      const matchedById = tx.item_id ? byId.get(tx.item_id) : undefined;
      const normName = normalizeText(matchedById?.name || tx.item_name);
      const matchedByName = normName ? byNormName.get(normName) : undefined;
      const cat = (matchedById?.category || matchedByName?.category || 'Outros').trim() || 'Outros';
      if (!categoryCounts.has(cat)) {
        categoryCounts.set(cat, { materialsSet: new Set(), batchesCount: 0 });
      }
      if (normName) {
        categoryCounts.get(cat)!.materialsSet.add(normName);
      }
    });

    const categoriesList = Array.from(categoryCounts.entries())
      .map(([name, info]) => ({
        name,
        materialsCount: info.materialsSet.size,
        batchesCount: info.batchesCount
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return { byId, byNormName, categoriesList };
  }, [items, transactions, inventoryLocation]);

  // Available years based on real transactions
  const availableYears = useMemo(() => {
    const currentYr = new Date().getFullYear();
    const yearsSet = new Set<number>([currentYr - 2, currentYr - 1, currentYr]);
    transactions.forEach(tx => {
      if (tx.deletedAt) return;
      const d = parseFlexibleDate(tx.date);
      if (d) yearsSet.add(d.getFullYear());
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [transactions]);

  // Determine best initial year & category that actually has exit movements so the report is immediately populated
  const initialDefaults = useMemo(() => {
    const currentYr = new Date().getFullYear();
    const yearTotals = new Map<number, number>();
    const catTotals = new Map<string, number>();

    transactions.forEach(tx => {
      if (tx.deletedAt || tx.type !== 'exit') return;
      if ((tx.location || 'Almoxarifado') !== inventoryLocation) return;
      if (getCategorizedExitType(tx) !== 'consumo') return;
      const d = parseFlexibleDate(tx.date);
      if (!d) return;
      const yr = d.getFullYear();
      const qty = Math.max(0, Number(tx.quantity) || 0);
      yearTotals.set(yr, (yearTotals.get(yr) || 0) + qty);

      const matchedById = tx.item_id ? materialCatalog.byId.get(tx.item_id) : undefined;
      const normName = normalizeText(matchedById?.name || tx.item_name);
      const matchedByName = normName ? materialCatalog.byNormName.get(normName) : undefined;
      const cat = (matchedById?.category || matchedByName?.category || 'Outros').trim() || 'Outros';
      catTotals.set(cat, (catTotals.get(cat) || 0) + qty);
    });

    let bestYear = currentYr;
    if (!yearTotals.has(currentYr) && yearTotals.size > 0) {
      bestYear = Array.from(yearTotals.entries()).sort((a, b) => b[1] - a[1])[0][0];
    }

    // Prefer "Médico Hospitalar" / "Material Hospitalar" if it has movements, otherwise top category with movements
    let bestCategory = 'TODAS';
    const hospitalarCat = materialCatalog.categoriesList.find(c => {
      const n = normalizeText(c.name);
      return n.includes('HOSPITALAR') || n.includes('MEDICO');
    });

    if (hospitalarCat && (catTotals.get(hospitalarCat.name) || 0) > 0) {
      bestCategory = hospitalarCat.name;
    } else if (catTotals.size > 0) {
      bestCategory = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1])[0][0];
    } else if (hospitalarCat) {
      bestCategory = hospitalarCat.name;
    } else if (materialCatalog.categoriesList.length > 0) {
      bestCategory = materialCatalog.categoriesList[0].name;
    }

    return { bestYear, bestCategory };
  }, [transactions, inventoryLocation, materialCatalog]);

  const [selectedCategory, setSelectedCategory] = useState<string>(initialDefaults.bestCategory);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('year');
  const [selectedYear, setSelectedYear] = useState<number>(initialDefaults.bestYear);
  const [yearSubFilter, setYearSubFilter] = useState<YearSubFilter>('full_year');
  const [customStartDate, setCustomStartDate] = useState<string>(`${initialDefaults.bestYear}-01-01`);
  const [customEndDate, setCustomEndDate] = useState<string>(`${initialDefaults.bestYear}-12-31`);
  const [sectorSearch, setSectorSearch] = useState<string>('');
  const [detailSectorRow, setDetailSectorRow] = useState<SectorMonthlyRow | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);

  // Build ordered Month Buckets for the selected period
  const periodInfo = useMemo(() => {
    let start: Date;
    let end: Date;
    let periodLabel: string;

    if (periodMode === 'year') {
      if (yearSubFilter === 'sem1') {
        start = new Date(`${selectedYear}-01-01T00:00:00`);
        end = new Date(`${selectedYear}-06-30T23:59:59.999`);
        periodLabel = `1º Semestre de ${selectedYear} (Janeiro a Junho)`;
      } else if (yearSubFilter === 'sem2') {
        start = new Date(`${selectedYear}-07-01T00:00:00`);
        end = new Date(`${selectedYear}-12-31T23:59:59.999`);
        periodLabel = `2º Semestre de ${selectedYear} (Julho a Dezembro)`;
      } else {
        start = new Date(`${selectedYear}-01-01T00:00:00`);
        end = new Date(`${selectedYear}-12-31T23:59:59.999`);
        periodLabel = `Ano de ${selectedYear} (Janeiro a Dezembro)`;
      }
    } else {
      const s = parseFlexibleDate(customStartDate) || new Date(`${selectedYear}-01-01T00:00:00`);
      const e = parseFlexibleDate(customEndDate) || new Date(`${selectedYear}-12-31T23:59:59.999`);
      start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
      end = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
      if (end < start) {
        end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
      }
      periodLabel = `${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`;
    }

    // Generate month buckets between start and end (up to 24 months max for legibility)
    const months: MonthBucket[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const multiYear = start.getFullYear() !== end.getFullYear();

    while (cursor <= endMonth && months.length < 24) {
      const yr = cursor.getFullYear();
      const mIdx = cursor.getMonth();
      const key = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
      const fullLabel = multiYear
        ? `${MONTH_NAMES_SHORT[mIdx]}/${String(yr).slice(-2)}`
        : MONTH_NAMES_FULL[mIdx];
      const shortLabel = multiYear
        ? `${MONTH_NAMES_SHORT[mIdx]}/${String(yr).slice(-2)}`
        : MONTH_NAMES_SHORT[mIdx];

      months.push({
        key,
        year: yr,
        monthIndex: mIdx,
        label: fullLabel,
        shortLabel,
        color: MONTH_COLORS[mIdx % MONTH_COLORS.length]
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { start, end, periodLabel, months };
  }, [periodMode, selectedYear, yearSubFilter, customStartDate, customEndDate]);

  // Core Aggregation: Real Exit Movements by Sector and Month for the Selected Category
  const reportAggregation = useMemo(() => {
    const { start, end, months } = periodInfo;
    const monthKeyToIndex = new Map<string, number>();
    months.forEach((m, idx) => monthKeyToIndex.set(m.key, idx));

    const seenTxIds = new Set<string>();
    const sectorMap = new Map<
      string,
      {
        sector: string;
        monthlyValues: number[];
        total: number;
        totalValue: number;
        movementsCount: number;
        materialsMap: Map<string, ConsolidatedMaterialConsumption>;
        movements: SectorMovementDetail[];
      }
    >();

    const matchesSelectedCategory = (itemCategory: string): boolean => {
      if (selectedCategory === 'TODAS') return true;
      return normalizeText(itemCategory) === normalizeText(selectedCategory);
    };

    const resolveMaterialInfo = (tx: Transaction) => {
      const directItem = tx.item_id ? materialCatalog.byId.get(tx.item_id) : undefined;
      const cleanName = (directItem?.name || tx.item_name || 'Material não identificado').trim();
      const normName = normalizeText(cleanName);
      const fallbackInfo = normName ? materialCatalog.byNormName.get(normName) : undefined;

      const category = (directItem?.category || fallbackInfo?.category || 'Outros').trim() || 'Outros';
      const unitMeasure = (directItem?.unit_measure || fallbackInfo?.unitMeasure || 'UN').trim() || 'UN';
      const unitPrice = Number(directItem?.unit_price) || fallbackInfo?.unitPrice || 0;
      const batchNumber = (tx.batch_number || directItem?.batch_number || 'S/L').trim() || 'S/L';

      return {
        cleanName,
        normName: normName || 'SEM_NOME',
        category,
        unitMeasure,
        unitPrice,
        batchNumber
      };
    };

    const ensureSector = (secNameRaw?: string | null) => {
      let cleanSec = (secNameRaw || 'Setor Não Informado').trim();
      if (cleanSec === 'Farmácia (Consumo Interno)') cleanSec = 'Farmácia';
      if (!cleanSec) cleanSec = 'Setor Não Informado';

      // Respect non-admin sector visibility if applicable
      const normKey = normalizeText(cleanSec);
      if (!sectorMap.has(normKey)) {
        sectorMap.set(normKey, {
          sector: cleanSec,
          monthlyValues: new Array(months.length).fill(0),
          total: 0,
          totalValue: 0,
          movementsCount: 0,
          materialsMap: new Map(),
          movements: []
        });
      }
      return sectorMap.get(normKey)!;
    };

    // Process real transactions without duplicating movements and without counting entries as consumption
    transactions.forEach(tx => {
      if (tx.deletedAt) return;
      if (tx.id && seenTxIds.has(tx.id)) return;
      if (tx.id) seenTxIds.add(tx.id);

      const loc = tx.location || 'Almoxarifado';
      if (loc !== inventoryLocation) return;

      // Only count exits of departmental consumption (never entries, never write-offs/donations)
      // Note: Retroactive exits (tx.isRetroactive === true / tx.stockAffected === false) ARE included here
      // as valid historical exits on their original date without affecting current stock balances.
      const isConsumptionExit = tx.type === 'exit' && getCategorizedExitType(tx) === 'consumo';
      if (!isConsumptionExit) return;

      // If user is not admin and restricted to a sector
      if (!isAdmin && selectedSector && selectedSector !== 'Almoxarifado') {
        const txSecNorm = normalizeText(tx.sector);
        const userSecNorm = normalizeText(selectedSector);
        if (txSecNorm !== userSecNorm) return;
      }

      const d = parseFlexibleDate(tx.date);
      if (!d || d < start || d > end) return;

      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mIdx = monthKeyToIndex.get(mKey);
      if (mIdx === undefined) return;

      const matInfo = resolveMaterialInfo(tx);
      if (!matchesSelectedCategory(matInfo.category)) return;

      const qty = Math.max(0, Number(tx.quantity) || 0);
      if (qty <= 0) return;

      const finVal = qty * matInfo.unitPrice;
      const secEntry = ensureSector(tx.sector);

      secEntry.monthlyValues[mIdx] += qty;
      secEntry.total += qty;
      secEntry.totalValue += finVal;
      secEntry.movementsCount += 1;

      // Consolidate material across multiple batches/lots
      if (!secEntry.materialsMap.has(matInfo.normName)) {
        secEntry.materialsMap.set(matInfo.normName, {
          normName: matInfo.normName,
          name: matInfo.cleanName,
          category: matInfo.category,
          unitMeasure: matInfo.unitMeasure,
          batchesSet: new Set(),
          monthlyQty: new Array(months.length).fill(0),
          totalQty: 0,
          totalValue: 0,
          movementsCount: 0
        });
      }
      const matCons = secEntry.materialsMap.get(matInfo.normName)!;
      matCons.batchesSet.add(matInfo.batchNumber);
      matCons.monthlyQty[mIdx] += qty;
      matCons.totalQty += qty;
      matCons.totalValue += finVal;
      matCons.movementsCount += 1;

      secEntry.movements.push({
        id: tx.id,
        date: tx.date,
        parsedDate: d,
        monthKey: mKey,
        monthLabel: months[mIdx].label,
        itemName: matInfo.cleanName,
        batchNumber: matInfo.batchNumber,
        quantity: qty,
        unitMeasure: matInfo.unitMeasure,
        unitPrice: matInfo.unitPrice,
        totalValue: finVal,
        responsible: tx.responsible || tx.responsibleEmail || 'Almoxarifado',
        isRetroactive: Boolean(tx.isRetroactive || tx.stockAffected === false),
        isReturn: false
      });
    });

    // Build final sorted sector rows (only sectors that had consumption > 0 in the period)
    const activeRowsRaw = Array.from(sectorMap.values()).filter(s => s.total > 0);
    const grandTotal = activeRowsRaw.reduce((acc, s) => acc + s.total, 0);
    const grandTotalValue = activeRowsRaw.reduce((acc, s) => acc + s.totalValue, 0);
    const totalMovementsCount = activeRowsRaw.reduce((acc, s) => acc + s.movementsCount, 0);

    const monthTotals = months.map((_, mIdx) =>
      activeRowsRaw.reduce((sum, sec) => sum + (sec.monthlyValues[mIdx] || 0), 0)
    );

    const sectorsList: SectorMonthlyRow[] = activeRowsRaw
      .map(s => ({
        sector: s.sector,
        monthlyValues: s.monthlyValues,
        total: s.total,
        totalValue: s.totalValue,
        sharePct: grandTotal > 0 ? (s.total / grandTotal) * 100 : 0,
        movementsCount: s.movementsCount,
        materialsCount: s.materialsMap.size,
        materials: Array.from(s.materialsMap.values()).sort((a, b) => b.totalQty - a.totalQty),
        movements: s.movements.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime())
      }))
      .sort((a, b) => b.total - a.total);

    // Peak month calculation
    let peakMonthLabel = '—';
    let peakMonthQty = 0;
    monthTotals.forEach((mSum, idx) => {
      if (mSum > peakMonthQty) {
        peakMonthQty = mSum;
        peakMonthLabel = months[idx]?.label || '—';
      }
    });

    return {
      sectorsList,
      monthTotals,
      grandTotal,
      grandTotalValue,
      totalMovementsCount,
      peakMonthLabel,
      peakMonthQty
    };
  }, [periodInfo, transactions, inventoryLocation, selectedCategory, materialCatalog, isAdmin, selectedSector]);

  // Filter sectors by search term
  const filteredSectors = useMemo(() => {
    if (!sectorSearch.trim()) return reportAggregation.sectorsList;
    const q = normalizeText(sectorSearch);
    return reportAggregation.sectorsList.filter(
      s =>
        normalizeText(s.sector).includes(q) ||
        s.materials.some(m => normalizeText(m.name).includes(q))
    );
  }, [reportAggregation.sectorsList, sectorSearch]);

  // Filtered monthly totals when search is active (or full totals)
  const displayedMonthTotals = useMemo(() => {
    return periodInfo.months.map((_, mIdx) =>
      filteredSectors.reduce((acc, s) => acc + (s.monthlyValues[mIdx] || 0), 0)
    );
  }, [periodInfo.months, filteredSectors]);

  const displayedGrandTotal = useMemo(
    () => filteredSectors.reduce((acc, s) => acc + s.total, 0),
    [filteredSectors]
  );

  const categoryDisplayLabel =
    selectedCategory === 'TODAS' ? 'Todas as Categorias' : selectedCategory;

  // Individualized Automatic Critical Analysis Generator based on the active chart data
  const autoGeneratedCriticalAnalysis = useMemo(() => {
    if (filteredSectors.length === 0 || displayedGrandTotal <= 0) {
      return `Verifica-se que não houve registro de dispensação de materiais da categoria ${categoryDisplayLabel.toUpperCase()} durante o período selecionado (${periodInfo.periodLabel}).`;
    }

    const activeMonthsWithTotals = periodInfo.months
      .map((m, idx) => ({
        label: m.label,
        total: displayedMonthTotals[idx] || 0
      }))
      .filter(m => m.total > 0);

    const sortedMonths = [...activeMonthsWithTotals].sort((a, b) => b.total - a.total);
    const highestMonth = sortedMonths[0];
    const lowestMonth = sortedMonths.length > 1 ? sortedMonths[sortedMonths.length - 1] : null;

    const topSector = filteredSectors[0];
    const secondSector = filteredSectors.length > 1 ? filteredSectors[1] : null;
    const lowestSector =
      filteredSectors.length > 2 ? filteredSectors[filteredSectors.length - 1] : null;

    const parts: string[] = [];

    // 1. General overview & sector concentration
    if (filteredSectors.length === 1) {
      parts.push(
        `Verifica-se que a dispensação de materiais da categoria ${categoryDisplayLabel.toUpperCase()} no período analisado (${periodInfo.periodLabel}) totalizou ${formatInt(displayedGrandTotal)} unidades, integralmente destinadas ao setor ${topSector.sector} (100,0% do volume dispensado).`
      );
    } else {
      const topTwoSum = topSector.total + (secondSector ? secondSector.total : 0);
      const topTwoPct = ((topTwoSum / displayedGrandTotal) * 100).toFixed(1).replace('.', ',');
      const topShareStr = topSector.sharePct.toFixed(1).replace('.', ',');

      let sectorSentence = `Verifica-se que a dispensação de materiais da categoria ${categoryDisplayLabel.toUpperCase()} ao longo do período analisado (${periodInfo.periodLabel}) totalizou ${formatInt(displayedGrandTotal)} unidades distribuídas entre ${filteredSectors.length} setores requisitantes, com maior concentração de demanda no setor ${topSector.sector}, responsável por ${formatInt(topSector.total)} unidades (${topShareStr}% do total)`;

      if (secondSector) {
        const secShareStr = secondSector.sharePct.toFixed(1).replace('.', ',');
        sectorSentence += `, seguido por ${secondSector.sector} com ${formatInt(secondSector.total)} unidades (${secShareStr}%), concentrando juntos ${topTwoPct}% do consumo da categoria`;
      }

      if (lowestSector && lowestSector.sector !== secondSector?.sector) {
        sectorSentence += `, enquanto o menor volume ocorreu no setor ${lowestSector.sector} (${formatInt(lowestSector.total)} un).`;
      } else {
        sectorSentence += '.';
      }
      parts.push(sectorSentence);
    }

    // 2. Monthly variation & seasonality
    if (highestMonth) {
      const peakPct = ((highestMonth.total / displayedGrandTotal) * 100)
        .toFixed(1)
        .replace('.', ',');
      if (lowestMonth && lowestMonth.label !== highestMonth.label) {
        const avgMonthly = Math.round(displayedGrandTotal / activeMonthsWithTotals.length);
        parts.push(
          `Na evolução mensal, observaram-se oscilações de consumo em ${activeMonthsWithTotals.length} ${activeMonthsWithTotals.length === 1 ? 'mês com movimentação' : 'meses com movimentação'} (média de ${formatInt(avgMonthly)} un/mês), registrando-se pico de dispensação em ${highestMonth.label} (${formatInt(highestMonth.total)} unidades; ${peakPct}% do período) e menor demanda em ${lowestMonth.label} (${formatInt(lowestMonth.total)} unidades).`
        );
      } else {
        parts.push(
          `Quanto à distribuição temporal, o consumo concentrou-se no mês de ${highestMonth.label}, totalizando ${formatInt(highestMonth.total)} unidades dispensadas no período.`
        );
      }
    }

    return parts.join(' ');
  }, [
    filteredSectors,
    displayedGrandTotal,
    categoryDisplayLabel,
    periodInfo.periodLabel,
    periodInfo.months,
    displayedMonthTotals
  ]);

  // Unique key per chart configuration so custom edits are preserved per category + period
  const chartAnalysisKey = useMemo(() => {
    const monthsKey = periodInfo.months.map(m => m.key).join('_');
    return `${inventoryLocation}__${normalizeText(selectedCategory)}__${monthsKey}__${normalizeText(sectorSearch)}`;
  }, [inventoryLocation, selectedCategory, periodInfo.months, sectorSearch]);

  const [customCriticalAnalysisMap, setCustomCriticalAnalysisMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('almox_monthly_sector_critical_analysis_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        'almox_monthly_sector_critical_analysis_v1',
        JSON.stringify(customCriticalAnalysisMap)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [customCriticalAnalysisMap]);

  const isCustomAnalysisEdited = Object.prototype.hasOwnProperty.call(
    customCriticalAnalysisMap,
    chartAnalysisKey
  );

  const currentCriticalAnalysisText = isCustomAnalysisEdited
    ? customCriticalAnalysisMap[chartAnalysisKey]
    : autoGeneratedCriticalAnalysis;

  const handleCriticalAnalysisChange = (newText: string) => {
    setCustomCriticalAnalysisMap(prev => ({
      ...prev,
      [chartAnalysisKey]: newText
    }));
  };

  const handleResetCriticalAnalysis = () => {
    setCustomCriticalAnalysisMap(prev => {
      const next = { ...prev };
      delete next[chartAnalysisKey];
      return next;
    });
    showToast('Análise crítica restaurada para o texto gerado automaticamente.', 'info');
  };

  // Strip any leading "ANÁLISE CRÍTICA:" if the user typed it manually so we never duplicate the label
  const normalizedAnalysisBody = useMemo(() => {
    const raw = (currentCriticalAnalysisText || '').trim();
    return raw.replace(/^AN[ÁA]LISE\s+CR[ÍI]TICA\s*:\s*/i, '').trim();
  }, [currentCriticalAnalysisText]);

  // Export to PDF — Single-Page Landscape A4 containing Header, KPIs, Stacked Bar Chart & Critical Analysis
  const handleExportPDF = () => {
    try {
      setIsExportingPDF(true);
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
      const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      const nowStr = new Date().toLocaleString('pt-BR');

      let y = 7;
      if (letterheadImage) {
        try {
          const fmt = letterheadImage.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(letterheadImage, fmt, margin, 5, contentWidth, 16, undefined, 'FAST');
          y = 23;
        } catch {
          y = 7;
        }
      }

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(
        `RELATÓRIO DE CONSUMO MENSAL POR SETOR — CATEGORIA: ${categoryDisplayLabel.toUpperCase()}`,
        margin,
        y + 4.5
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Unidade: ${inventoryLocation}   |   Período Analisado: ${periodInfo.periodLabel}   |   Emitido em: ${nowStr}`,
        margin,
        y + 9.2
      );

      const dividerY = y + 11.8;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(margin, dividerY, pageWidth - margin, dividerY);

      let currentY = dividerY + 3;

      // Summary KPI Strip in PDF (compact for single-page guarantee)
      const kpis = [
        {
          label: 'CATEGORIA ANALISADA',
          value: categoryDisplayLabel,
          sub: `Unidade: ${inventoryLocation}`
        },
        {
          label: 'TOTAL GERAL CONSUMIDO',
          value: `${formatInt(displayedGrandTotal)} unidades`,
          sub: isAdmin
            ? `Valor estimado: ${formatCurrency(reportAggregation.grandTotalValue)}`
            : `${reportAggregation.totalMovementsCount} saídas registradas`
        },
        {
          label: 'SETORES COM CONSUMO',
          value: `${filteredSectors.length} setores`,
          sub: filteredSectors[0]
            ? `Maior: ${filteredSectors[0].sector} (${formatInt(filteredSectors[0].total)} un)`
            : 'Sem consumo no período'
        },
        {
          label: 'MÊS DE MAIOR DEMANDA',
          value: reportAggregation.peakMonthLabel,
          sub:
            reportAggregation.peakMonthQty > 0
              ? `${formatInt(reportAggregation.peakMonthQty)} un dispensadas no mês`
              : '—'
        }
      ];

      const cardW = (contentWidth - 9) / 4;
      const cardH = 13.5;
      kpis.forEach((k, idx) => {
        const x = margin + idx * (cardW + 3);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(x, currentY, cardW, cardH, 1.5, 1.5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.8);
        doc.setTextColor(100, 116, 139);
        doc.text(k.label, x + 2.8, currentY + 4);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        const valText = k.value.length > 34 ? k.value.slice(0, 33) + '…' : k.value;
        doc.text(valText, x + 2.8, currentY + 8.6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(71, 85, 105);
        const subText = k.sub.length > 44 ? k.sub.slice(0, 43) + '…' : k.sub;
        doc.text(subText, x + 2.8, currentY + 12);
      });

      currentY += cardH + 3.5;

      // Prepare Critical Analysis text and calculate its exact height so Chart + Analysis fit on 1 page
      const fullAnalysisParagraph = `ANÁLISE CRÍTICA: ${normalizedAnalysisBody || autoGeneratedCriticalAnalysis}`;
      let analysisFontSize = 8.5;
      let lineH = 3.8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(analysisFontSize);
      let wrappedAnalysisLines: string[] = doc.splitTextToSize(
        fullAnalysisParagraph,
        contentWidth - 8
      );

      if (wrappedAnalysisLines.length > 5) {
        analysisFontSize = 7.6;
        lineH = 3.3;
        doc.setFontSize(analysisFontSize);
        wrappedAnalysisLines = doc.splitTextToSize(fullAnalysisParagraph, contentWidth - 8);
      }
      if (wrappedAnalysisLines.length > 8) {
        wrappedAnalysisLines = wrappedAnalysisLines.slice(0, 8);
      }

      const analysisBoxH = Math.max(14, wrappedAnalysisLines.length * lineH + 7);
      const footerReserve = 10;

      // Render Horizontal Stacked Bar Chart Image scaled to fit remaining single-page height
      const chartRender = renderMonthlyStackedChartCanvas({
        title: `Gráfico de Consumo Mensal por Setor — ${categoryDisplayLabel}`,
        subtitle: `Período: ${periodInfo.periodLabel} • Quantidade consumida mês a mês por setor (lotes consolidados)`,
        months: periodInfo.months,
        sectors: filteredSectors,
        grandTotal: displayedGrandTotal
      });

      const availableForChart = pageHeight - footerReserve - currentY - analysisBoxH - 3.5;
      const naturalChartH = (contentWidth * chartRender.height) / chartRender.width;
      const finalChartH = Math.max(45, Math.min(naturalChartH, availableForChart));

      // Center chart horizontally if height-constrained so aspect ratio remains crisp
      const finalChartW =
        finalChartH < naturalChartH
          ? (finalChartH * chartRender.width) / chartRender.height
          : contentWidth;
      const chartX = margin + (contentWidth - finalChartW) / 2;

      doc.addImage(
        chartRender.dataUrl,
        'PNG',
        chartX,
        currentY,
        finalChartW,
        finalChartH,
        undefined,
        'FAST'
      );
      currentY += finalChartH + 3.5;

      // Draw Critical Analysis Box right below the Chart (without any author/user identification)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, currentY, contentWidth, analysisBoxH, 1.5, 1.5, 'FD');

      // Render "ANÁLISE CRÍTICA:" in bold followed by the analysis text
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(analysisFontSize);

      wrappedAnalysisLines.forEach((lineText, idx) => {
        const lineY = currentY + 4.8 + idx * lineH;
        if (idx === 0 && lineText.toUpperCase().startsWith('ANÁLISE CRÍTICA:')) {
          const prefix = 'ANÁLISE CRÍTICA: ';
          doc.setFont('helvetica', 'bold');
          doc.text(prefix, margin + 4, lineY);
          const prefixW = doc.getTextWidth(prefix);
          doc.setFont('helvetica', 'normal');
          doc.text(lineText.slice(prefix.length), margin + 4 + prefixW, lineY);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.text(lineText, margin + 4, lineY);
        }
      });

      // Single-page Footer
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 8.5, pageWidth - margin, pageHeight - 8.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Consumo Mensal por Setor • Categoria: ${categoryDisplayLabel} • Emitido em ${nowStr}`,
        margin,
        pageHeight - 4.5
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Página 1 de 1', pageWidth - margin, pageHeight - 4.5, {
        align: 'right'
      });

      const safeCat = normalizeText(categoryDisplayLabel).replace(/[^A-Z0-9]/g, '_');
      doc.save(
        `Consumo_Mensal_Por_Setor_${safeCat}_${new Date().toISOString().slice(0, 10)}.pdf`
      );
      showToast('Relatório "Consumo Mensal por Setor" exportado em PDF (página única)!', 'success');
    } catch (error) {
      console.error('Erro ao exportar PDF de Consumo Mensal por Setor:', error);
      showToast('Erro ao gerar o PDF do relatório.', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Print Report — Single-Page Landscape A4 with Chart + Critical Analysis (no table, no author info)
  const handlePrintReport = () => {
    try {
      const chartRender = renderMonthlyStackedChartCanvas({
        title: `Gráfico de Consumo Mensal por Setor — ${categoryDisplayLabel}`,
        subtitle: `Período: ${periodInfo.periodLabel} • Quantidade consumida mês a mês por setor`,
        months: periodInfo.months,
        sectors: filteredSectors,
        grandTotal: displayedGrandTotal
      });

      const printWin = window.open('', '_blank', 'width=1200,height=850');
      if (!printWin) {
        window.print();
        return;
      }

      const safeAnalysisHtml = (normalizedAnalysisBody || autoGeneratedCriticalAnalysis)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');

      printWin.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Consumo Mensal por Setor - ${categoryDisplayLabel}</title>
          <style>
            @page { size: A4 landscape; margin: 8mm 10mm; }
            * { box-sizing: border-box; }
            html, body {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
              font-family: Helvetica, Arial, sans-serif;
              color: #0f172a;
              overflow: hidden;
            }
            .page-container {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              height: 190mm;
              max-height: 190mm;
              page-break-after: avoid;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .top-section {
              flex-shrink: 0;
            }
            .header {
              background: transparent;
              color: #0f172a;
              padding: 2px 0 6px;
              border-bottom: 1px solid #cbd5e1;
              margin-bottom: 8px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .header h1 { margin: 0; font-size: 14px; text-transform: uppercase; color: #0f172a; }
            .header p { margin: 2px 0 0; font-size: 10px; color: #475569; }
            .kpis {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 8px;
              margin-bottom: 8px;
            }
            .kpi {
              border: 1px solid #cbd5e1;
              background: #f8fafc;
              border-radius: 6px;
              padding: 6px 10px;
            }
            .kpi-label { font-size: 8.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
            .kpi-val { font-size: 12.5px; font-weight: 800; color: #0f172a; margin-top: 2px; }
            .chart-box {
              flex: 1 1 auto;
              min-height: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 8px;
              overflow: hidden;
            }
            .chart-box img {
              width: 100%;
              height: 100%;
              max-height: ${letterheadImage ? '106mm' : '120mm'};
              object-fit: contain;
              border-radius: 6px;
            }
            .analysis-box {
              flex-shrink: 0;
              border: 1px solid #cbd5e1;
              background: #f8fafc;
              border-radius: 6px;
              padding: 9px 12px;
              font-size: 10.5px;
              line-height: 1.42;
              color: #0f172a;
              text-align: justify;
            }
            .footer {
              flex-shrink: 0;
              border-top: 1px solid #e2e8f0;
              padding-top: 4px;
              margin-top: 6px;
              display: flex;
              justify-content: space-between;
              font-size: 9px;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            <div class="top-section">
              ${
                letterheadImage
                  ? `<div style="text-align:center;margin-bottom:4px;"><img src="${letterheadImage}" style="max-height:42px;object-fit:contain;" /></div>`
                  : ''
              }
              <div class="header">
                <div>
                  <h1>Relatório de Consumo Mensal por Setor — Categoria: ${categoryDisplayLabel}</h1>
                  <p>Unidade: ${inventoryLocation} • Período Analisado: ${periodInfo.periodLabel} • Emitido em ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:9px;color:#475569;text-transform:uppercase;font-weight:700;">Total Geral da Categoria</div>
                  <div style="font-size:15px;font-weight:900;color:#0f172a;">${formatInt(displayedGrandTotal)} un</div>
                </div>
              </div>

              <div class="kpis">
                <div class="kpi">
                  <div class="kpi-label">Categoria Selecionada</div>
                  <div class="kpi-val">${categoryDisplayLabel}</div>
                </div>
                <div class="kpi">
                  <div class="kpi-label">Total Geral Consumido</div>
                  <div class="kpi-val">${formatInt(displayedGrandTotal)} un</div>
                </div>
                <div class="kpi">
                  <div class="kpi-label">Setores Atendidos</div>
                  <div class="kpi-val">${filteredSectors.length} setores</div>
                </div>
                <div class="kpi">
                  <div class="kpi-label">Mês de Maior Consumo</div>
                  <div class="kpi-val">${reportAggregation.peakMonthLabel} (${formatInt(reportAggregation.peakMonthQty)} un)</div>
                </div>
              </div>
            </div>

            <div class="chart-box">
              <img src="${chartRender.dataUrl}" alt="Gráfico de Consumo Mensal por Setor" />
            </div>

            <div class="analysis-box">
              <strong>ANÁLISE CRÍTICA:</strong> ${safeAnalysisHtml}
            </div>

            <div class="footer">
              <span>Consumo Mensal por Setor • Categoria: ${categoryDisplayLabel}</span>
              <strong style="color:#0f172a;">Página 1 de 1</strong>
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 250);
            };
          </script>
        </body>
        </html>
      `);
      printWin.document.close();
    } catch (error) {
      console.error('Erro ao imprimir relatório:', error);
      window.print();
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    try {
      const rows = filteredSectors.map(sec => {
        const rowObj: Record<string, any> = {
          Setor: sec.sector
        };
        periodInfo.months.forEach((m, idx) => {
          rowObj[m.label] = sec.monthlyValues[idx] || 0;
        });
        rowObj['Total Consumido por Setor'] = sec.total;
        rowObj['% Participação'] = `${sec.sharePct.toFixed(2)}%`;
        return rowObj;
      });

      const totalRow: Record<string, any> = {
        Setor: 'TOTAL GERAL'
      };
      periodInfo.months.forEach((m, idx) => {
        totalRow[m.label] = displayedMonthTotals[idx] || 0;
      });
      totalRow['Total Consumido por Setor'] = displayedGrandTotal;
      totalRow['% Participação'] = displayedGrandTotal > 0 ? '100.00%' : '0.00%';
      rows.push(totalRow);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Consumo Mensal Setor');

      // Second sheet with detailed sector breakdown by consolidated material
      const detailRows: Record<string, any>[] = [];
      filteredSectors.forEach(sec => {
        sec.materials.forEach(mat => {
          const itemRow: Record<string, any> = {
            Setor: sec.sector,
            'Material (Consolidado)': mat.name,
            Categoria: mat.category,
            Unidade: mat.unitMeasure,
            'Lotes Movimentados': Array.from(mat.batchesSet).join(', ')
          };
          periodInfo.months.forEach((m, idx) => {
            itemRow[m.label] = mat.monthlyQty[idx] || 0;
          });
          itemRow['Total Consumido'] = mat.totalQty;
          detailRows.push(itemRow);
        });
      });

      if (detailRows.length > 0) {
        const wsDetails = XLSX.utils.json_to_sheet(detailRows);
        XLSX.utils.book_append_sheet(wb, wsDetails, 'Detalhes por Setor');
      }

      const safeCat = normalizeText(categoryDisplayLabel).replace(/[^A-Z0-9]/g, '_');
      XLSX.writeFile(
        wb,
        `Consumo_Mensal_Por_Setor_${safeCat}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      showToast('Planilha Excel exportada com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      showToast('Erro ao exportar planilha Excel.', 'error');
    }
  };


  return (
    <div className="space-y-6">
      {/* Top Control & Filter Card */}
      <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900" />
        <div className="p-5 sm:p-6 space-y-5">
          {/* Header Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-start gap-3.5">
              {onBack && !embedded && (
                <button
                  onClick={onBack}
                  className="p-2.5 rounded-2xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-colors cursor-pointer shrink-0 mt-0.5"
                  title="Voltar"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                    Relatório Analítico Mensal • {inventoryLocation}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {periodInfo.periodLabel}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Lotes Consolidados • Saídas Reais
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-700 shrink-0" />
                  Consumo Mensal por Setor
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Distribuição mês a mês das movimentações de saída da categoria selecionada por setor requisitante, com gráfico empilhado e análise crítica.
                </p>
              </div>
            </div>

            {/* Action Buttons: Print, Export PDF, Excel, Expand */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {embedded && onOpenFullReport && (
                <button
                  type="button"
                  onClick={onOpenFullReport}
                  className="px-3.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Eye size={14} />
                  Abrir em Tela Cheia
                </button>
              )}
              <button
                type="button"
                onClick={handlePrintReport}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                title="Imprimir este relatório com gráfico e tabela"
              >
                <Printer size={15} className="text-slate-700" />
                Imprimir
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                title="Exportar tabela mensal e detalhes por setor em Excel"
              >
                <Download size={15} className="text-emerald-700" />
                Excel
              </button>
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExportingPDF}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 via-rose-700 to-red-800 hover:from-rose-700 hover:to-red-900 disabled:opacity-60 text-white font-extrabold text-xs flex items-center gap-2 shadow-md shadow-rose-600/20 transition-all cursor-pointer whitespace-nowrap"
                title="Exportar relatório em PDF com gráfico empilhado e tabela mensal"
              >
                <FileText size={15} />
                {isExportingPDF ? 'Gerando PDF...' : 'Exportar em PDF'}
              </button>
            </div>
          </div>

          {/* Filter Controls Bar: Category Selector + Period Mode (Ano / Intervalo de Datas) + Search */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
            {/* 1. Material Category Selector */}
            <div className="md:col-span-4">
              <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">
                <Layers size={12} className="text-blue-600" />
                1. Selecionar Categoria de Material
              </label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl font-extrabold text-xs text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer shadow-2xs"
              >
                {materialCatalog.categoriesList.map(cat => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name.toUpperCase()} ({cat.materialsCount}{' '}
                    {cat.materialsCount === 1 ? 'material' : 'materiais'})
                  </option>
                ))}
                <option value="TODAS">TODAS AS CATEGORIAS (CONSOLIDADO GERAL)</option>
              </select>
            </div>

            {/* 2. Period Mode Toggle */}
            <div className="md:col-span-3">
              <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">
                <Calendar size={12} className="text-blue-600" />
                2. Tipo de Período
              </label>
              <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPeriodMode('year')}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                    periodMode === 'year'
                      ? 'bg-blue-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Por Ano
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode('custom_range')}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                    periodMode === 'custom_range'
                      ? 'bg-blue-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Intervalo de Datas
                </button>
              </div>
            </div>

            {/* 3. Year / Sub-period OR Custom Date Range */}
            {periodMode === 'year' ? (
              <>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">
                    Ano de Análise
                  </label>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-xs text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
                  >
                    {availableYears.map(yr => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">
                    Recorte Mensal do Ano
                  </label>
                  <select
                    value={yearSubFilter}
                    onChange={e => setYearSubFilter(e.target.value as YearSubFilter)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
                  >
                    <option value="full_year">Ano Completo (Jan a Dez)</option>
                    <option value="sem1">1º Semestre (Jan a Jun)</option>
                    <option value="sem2">2º Semestre (Jul a Dez)</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">
                    Data Inicial
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">
                    Data Final
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </>
            )}
          </div>

          {/* Quick Category Pills for fast switching */}
          {materialCatalog.categoriesList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1 shrink-0">
                Categorias:
              </span>
              {materialCatalog.categoriesList.map(cat => {
                const isSelected =
                  selectedCategory !== 'TODAS' &&
                  normalizeText(selectedCategory) === normalizeText(cat.name);
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                      isSelected
                        ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50/60 hover:border-blue-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedCategory('TODAS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                  selectedCategory === 'TODAS'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todas as Categorias
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Executive KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-blue-100 shadow-2xs flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 block">
              Categoria Selecionada
            </span>
            <p className="text-lg font-black text-slate-900 mt-1 leading-tight">
              {categoryDisplayLabel}
            </p>
            <p className="text-[11px] font-bold text-slate-500 mt-1">
              {periodInfo.months.length} {periodInfo.months.length === 1 ? 'mês analisado' : 'meses analisados'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
            <Layers size={18} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-indigo-100 shadow-2xs flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 block">
              Total Geral de Consumo da Categoria
            </span>
            <p
              className="text-2xl font-black text-slate-900 mt-0.5 tracking-tight"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatInt(displayedGrandTotal)}{' '}
              <span className="text-xs font-bold text-slate-500">unidades</span>
            </p>
            <p className="text-[11px] font-bold text-indigo-700 mt-0.5">
              {isAdmin
                ? `Custo estimado: ${formatCurrency(reportAggregation.grandTotalValue)}`
                : `${reportAggregation.totalMovementsCount} saídas no período`}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
            <Package size={18} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-100 shadow-2xs flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 block">
              Setores com Consumo no Período
            </span>
            <p
              className="text-2xl font-black text-slate-900 mt-0.5 tracking-tight"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {filteredSectors.length}{' '}
              <span className="text-xs font-bold text-slate-500">setores</span>
            </p>
            <p className="text-[11px] font-bold text-emerald-700 mt-0.5 truncate max-w-[210px]">
              {filteredSectors[0]
                ? `1º ${filteredSectors[0].sector} (${formatInt(filteredSectors[0].total)} un)`
                : 'Nenhuma saída no período'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs shrink-0">
            <Building2 size={18} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-amber-100 shadow-2xs flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 block">
              Mês de Pico de Consumo
            </span>
            <p className="text-xl font-black text-slate-900 mt-0.5 tracking-tight">
              {reportAggregation.peakMonthLabel}
            </p>
            <p
              className="text-[11px] font-bold text-amber-700 mt-0.5"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {reportAggregation.peakMonthQty > 0
                ? `${formatInt(reportAggregation.peakMonthQty)} unidades dispensadas`
                : 'Sem movimentação'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs shrink-0">
            <TrendingUp size={18} />
          </div>
        </div>
      </div>

      {/* ===================================================================
          SECTION 2: HORIZONTAL STACKED BAR CHART (GRÁFICO DE BARRAS HORIZONTAIS EMPILHADAS)
         =================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white">
                  Gráfico de Barras Horizontais Empilhadas
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Clique em qualquer setor para visualizar os dados detalhados
                </span>
              </div>
              <h4 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
                Quantitativo de {categoryDisplayLabel} Dispensados por Setor Mês a Mês
              </h4>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filter Input for Sector or Material */}
              <div className="relative min-w-[210px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={sectorSearch}
                  onChange={e => setSectorSearch(e.target.value)}
                  placeholder="Filtrar setor ou material..."
                  className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {sectorSearch && (
                  <button
                    type="button"
                    onClick={() => setSectorSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Total Geral Pill */}
              <div className="px-4 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-2.5 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-200">
                  Total Geral da Categoria:
                </span>
                <span
                  className="text-sm font-black text-white"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatInt(displayedGrandTotal)} un
                </span>
              </div>
            </div>
          </div>

          {filteredSectors.length > 0 ? (
            <div className="space-y-3">
              {/* Column Headers above Stacked Bars */}
              <div className="flex items-center gap-3 px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <div className="w-36 sm:w-48 text-right shrink-0">Setor Destino</div>
                <div className="flex-1">
                  Distribuição Mensal de Consumo (Quantidade por Mês)
                </div>
                <div className="w-24 text-right shrink-0">Total Setor</div>
                <div className="w-20 text-center shrink-0 hidden sm:block">Detalhes</div>
              </div>

              {/* One Horizontal Stacked Bar Row per Sector */}
              <div className="space-y-2">
                {filteredSectors.map(sec => {
                  const visualWidthsPct = computeVisualSegmentWidths(sec.monthlyValues);

                  return (
                    <div
                      key={sec.sector}
                      onClick={() => setDetailSectorRow(sec)}
                      className="group flex items-center gap-3 p-2 rounded-2xl hover:bg-blue-50/50 border border-transparent hover:border-blue-200/80 transition-all cursor-pointer"
                      title={`Clique para ver os materiais e lotes consumidos pelo setor ${sec.sector}`}
                    >
                      {/* Sector Name */}
                      <div className="w-36 sm:w-48 text-right shrink-0">
                        <span className="text-xs font-black text-slate-800 group-hover:text-blue-700 uppercase tracking-tight truncate block">
                          {sec.sector}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 block">
                          {sec.materialsCount} {sec.materialsCount === 1 ? 'item' : 'itens'} •{' '}
                          {sec.sharePct.toFixed(1)}%
                        </span>
                      </div>

                      {/* Horizontal Stacked Bar Track (Filled 100% by active month rectangles) */}
                      <div className="flex-1 h-8 bg-slate-100 border border-slate-300/90 rounded-lg overflow-hidden flex items-center">
                        <div className="w-full h-full flex overflow-hidden">
                          {sec.monthlyValues.map((val, mIdx) => {
                            if (val <= 0 || sec.total <= 0) return null;
                            const visualWidthPct = visualWidthsPct[mIdx];
                            const monthObj = periodInfo.months[mIdx];
                            const bgColor =
                              monthObj?.color || MONTH_COLORS[mIdx % MONTH_COLORS.length];

                            return (
                              <div
                                key={monthObj?.key || mIdx}
                                className="h-full flex items-center justify-center text-[10px] sm:text-[11px] font-black text-white px-1 overflow-hidden whitespace-nowrap border-r border-white/30 last:border-r-0 transition-opacity hover:opacity-90"
                                style={{
                                  width: `${visualWidthPct}%`,
                                  backgroundColor: bgColor,
                                  fontVariantNumeric: 'tabular-nums'
                                }}
                                title={`${sec.sector} • ${monthObj?.label}: ${formatInt(val)} un (${((val / sec.total) * 100).toFixed(1)}% do setor)`}
                              >
                                {formatInt(val)}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Total Consumed by Sector Badge */}
                      <div className="w-24 text-right shrink-0">
                        <span
                          className="px-2.5 py-1.5 rounded-xl bg-slate-900 group-hover:bg-blue-700 text-white font-black text-xs shadow-2xs inline-block text-center w-full transition-colors"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatInt(sec.total)} un
                        </span>
                      </div>

                      {/* Quick Action Button */}
                      <div className="w-20 text-center shrink-0 hidden sm:block">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 group-hover:bg-blue-100 text-slate-700 group-hover:text-blue-800 text-[11px] font-extrabold transition-colors">
                          <Eye size={12} />
                          Ver
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend of Months + Grand Total */}
              <div className="pt-4 mt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {periodInfo.months.map((m, mIdx) => {
                    const mTotal = displayedMonthTotals[mIdx] || 0;
                    return (
                      <div
                        key={m.key}
                        className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/80"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-xs inline-block shrink-0 shadow-2xs"
                          style={{ backgroundColor: m.color }}
                        />
                        <span className="text-xs font-extrabold text-slate-800">{m.label}:</span>
                        <span
                          className="text-xs font-black text-slate-900"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatInt(mTotal)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 bg-slate-900 text-white px-3.5 py-1.5 rounded-xl text-xs font-black">
                  <span>TOTAL GERAL ({categoryDisplayLabel}):</span>
                  <span
                    className="text-amber-300 text-sm"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatInt(displayedGrandTotal)} un
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 px-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
              <Package size={36} className="mx-auto text-slate-300" />
              <p className="text-sm font-black text-slate-700">
                Nenhuma saída de consumo encontrada para a categoria "{categoryDisplayLabel}" neste período.
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Selecione outra categoria de material ou ajuste o ano/intervalo de datas acima para visualizar a distribuição mensal por setor.
              </p>
            </div>
          )}
          {/* ===================================================================
              ANÁLISE CRÍTICA IMEDIATAMENTE ABAIXO DO GRÁFICO (AUTOMÁTICA E EDITÁVEL, SEM AUTORIA)
             =================================================================== */}
          <div className="pt-5 mt-2 border-t border-slate-200/90">
            <div className="bg-slate-50/90 rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Edit3 size={16} className="text-blue-700 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                    ANÁLISE CRÍTICA:
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    (Gerada automaticamente para este gráfico — clique no texto abaixo para editar antes de imprimir ou exportar)
                  </span>
                </div>

                {isCustomAnalysisEdited && (
                  <button
                    type="button"
                    onClick={handleResetCriticalAnalysis}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-extrabold transition-colors cursor-pointer"
                    title="Restaurar a análise automática calculada pelos dados do gráfico"
                  >
                    <RotateCcw size={12} />
                    Restaurar Análise Automática
                  </button>
                )}
              </div>

              <textarea
                value={currentCriticalAnalysisText}
                onChange={e => handleCriticalAnalysisChange(e.target.value)}
                rows={3}
                placeholder="ANÁLISE CRÍTICA: Verifica-se que a dispensação de materiais..."
                className="w-full p-3.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm font-medium text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-y"
              />

              {/* Document Preview formatting showing exact "ANÁLISE CRÍTICA: ..." appearance without any user identification */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 text-xs sm:text-[13px] text-slate-800 leading-relaxed text-justify">
                <strong className="font-black text-slate-900 uppercase">ANÁLISE CRÍTICA: </strong>
                <span>{normalizedAnalysisBody || autoGeneratedCriticalAnalysis}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          MODAL: DADOS DETALHADOS DO SETOR SELECIONADO
         =================================================================== */}
      {detailSectorRow && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setDetailSectorRow(null)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden my-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-200 border border-blue-400/30">
                    Detalhamento por Setor
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200">
                    Categoria: {categoryDisplayLabel}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200">
                    {periodInfo.periodLabel}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                  <Building2 size={20} className="text-blue-400" />
                  Setor: {detailSectorRow.sector}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Total consumido na categoria:{' '}
                  <strong className="text-white">{formatInt(detailSectorRow.total)} unidades</strong> (
                  {detailSectorRow.sharePct.toFixed(1)}% do total da categoria) em{' '}
                  {detailSectorRow.movementsCount} movimentações de saída.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDetailSectorRow(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Fechar detalhes do setor"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
              {/* Monthly Mini Summary for this Sector */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Consumo Mês a Mês do Setor ({detailSectorRow.sector})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                  {periodInfo.months.map((m, idx) => {
                    const val = detailSectorRow.monthlyValues[idx] || 0;
                    return (
                      <div
                        key={m.key}
                        className={`p-3 rounded-xl border ${
                          val > 0
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-slate-50/40 border-slate-100 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: m.color }}
                          />
                          <span className="text-[11px] font-extrabold text-slate-600 truncate">
                            {m.label}
                          </span>
                        </div>
                        <p
                          className="text-base font-black text-slate-900"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatInt(val)} <span className="text-[10px] font-bold text-slate-400">un</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Table 1: Materiais Consolidados Consumidos pelo Setor (Lotes Somados) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Package size={15} className="text-blue-600" />
                    1. Materiais Consolidados Consumidos pelo Setor ({detailSectorRow.materials.length}{' '}
                    {detailSectorRow.materials.length === 1 ? 'material' : 'materiais'})
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                    Diferentes lotes do mesmo material somados automaticamente
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                        <th className="py-2.5 px-3.5">Material (Consolidado)</th>
                        <th className="py-2.5 px-3">Lotes Utilizados</th>
                        {periodInfo.months.map(m => (
                          <th key={m.key} className="py-2.5 px-2.5 text-right">
                            {m.shortLabel}
                          </th>
                        ))}
                        <th className="py-2.5 px-3.5 text-right bg-blue-50/60 text-blue-950">
                          Total Consumido
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailSectorRow.materials.map(mat => (
                        <tr key={mat.normName} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3.5 font-bold text-slate-900">{mat.name}</td>
                          <td className="py-2.5 px-3 text-[11px] font-mono text-slate-600">
                            {Array.from(mat.batchesSet).join(', ')}
                          </td>
                          {mat.monthlyQty.map((q, mIdx) => (
                            <td
                              key={mIdx}
                              className={`py-2.5 px-2.5 text-right ${
                                q > 0 ? 'font-bold text-slate-800' : 'text-slate-300'
                              }`}
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {formatInt(q)}
                            </td>
                          ))}
                          <td
                            className="py-2.5 px-3.5 text-right font-black text-blue-900 bg-blue-50/30"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {formatInt(mat.totalQty)} {mat.unitMeasure}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: Individual Exit Movements History */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <History size={15} className="text-indigo-600" />
                  2. Histórico Individual de Saídas Registradas para {detailSectorRow.sector} (
                  {detailSectorRow.movements.length} lançamentos)
                </h4>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 sticky top-0 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3.5">Data</th>
                        <th className="py-2.5 px-3.5">Mês</th>
                        <th className="py-2.5 px-3.5">Material</th>
                        <th className="py-2.5 px-3.5">Lote</th>
                        <th className="py-2.5 px-3.5">Responsável</th>
                        <th className="py-2.5 px-3.5 text-right">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailSectorRow.movements.map(mov => (
                        <tr key={mov.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3.5 font-bold text-slate-700 whitespace-nowrap">
                            {mov.parsedDate.toLocaleDateString('pt-BR')}
                            {mov.isRetroactive && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-black uppercase">
                                Retroativa
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 font-semibold text-slate-600">
                            {mov.monthLabel}
                          </td>
                          <td className="py-2.5 px-3.5 font-bold text-slate-900">{mov.itemName}</td>
                          <td className="py-2.5 px-3.5 font-mono text-slate-600">
                            {mov.batchNumber}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">{mov.responsible}</td>
                          <td
                            className="py-2.5 px-3.5 text-right font-black text-rose-700 whitespace-nowrap"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {formatInt(mov.quantity)} {mov.unitMeasure}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                Setor: <strong className="text-slate-800">{detailSectorRow.sector}</strong> • Total:{' '}
                <strong className="text-blue-700">{formatInt(detailSectorRow.total)} un</strong>
              </span>
              <button
                type="button"
                onClick={() => setDetailSectorRow(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
