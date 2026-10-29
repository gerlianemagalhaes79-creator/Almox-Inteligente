import * as React from 'react';
import { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  Calendar,
  ArrowLeft,
  Layers,
  Boxes,
  CheckCircle,
  AlertTriangle,
  Clock,
  Search,
  Download,
  Building2,
  HeartHandshake,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  ShieldAlert,
  Timer,
  Award,
  Info,
  Percent,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Printer,
  PieChart as PieChartIcon
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import { Item, Transaction, MaterialRequest, RequestItem, UserProfile } from '../types';
import {
  generateCompletePDFReport,
  exportSingleIndicatorPDF,
  printSingleIndicator,
  SingleIndicatorExportParams
} from '../utils/pdfReportGenerator';

export interface IndicadoresReportProps {
  items: Item[];
  transactions: Transaction[];
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  inventoryLocation: 'Almoxarifado' | 'Farmácia';
  getCategoryColor: (cat: string | null) => string;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onBack: () => void;
  onOpenRoomMap?: (roomName: string) => void;
  letterheadImage?: string | null;
  isAdmin?: boolean;
  userProfile?: UserProfile | null;
  selectedSector?: string;
}

type PeriodOption = '1_semestre' | '2_semestre' | 'ano_completo' | 'ultimos_90_dias' | 'personalizado';
type InternalTab = 'visao_geral' | 'situacao_sala' | 'dispensacao_tipo' | 'doacoes';

const CHART_PALETTE = [
  '#2563eb',
  '#4f46e5',
  '#0891b2',
  '#10b981',
  '#f59e0b',
  '#e11d48',
  '#7c3aed',
  '#0d9488',
  '#ea580c',
  '#475569'
];

const parseRecordDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;

  // YYYY-MM-DD or ISO string
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const d = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
};

const isIndeterminateExpiry = (expiryStr?: string | null): boolean => {
  if (!expiryStr) return true;
  const norm = String(expiryStr).trim().toUpperCase();
  return (
    norm === '' ||
    norm === 'N/A' ||
    norm === 'NA' ||
    norm === 'INDETERMINADA' ||
    norm === 'INDETERMINADO' ||
    norm === 'SEM VALIDADE' ||
    norm === '-'
  );
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDecimal = (value: number, decimals = 2) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value || 0);

const formatDateBR = (dateStr?: string | null) => {
  if (isIndeterminateExpiry(dateStr)) return 'Indeterminada';
  const d = parseRecordDate(dateStr);
  if (!d) return dateStr || '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const isEtiquetaMaterial = (name?: string | null, category?: string | null): boolean => {
  const normName = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const normCat = String(category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return normName.includes('ETIQUETA') || normCat.includes('ETIQUETA');
};

const ORIGIN_LABELS: Record<string, string> = {
  contract: 'Contrato / Licitado',
  extra: 'Extra / Compra Direta',
  donation: 'Doação'
};

const EXIT_REASON_LABELS: Record<string, string> = {
  consumo: 'Consumo Interno / Dispensação',
  doacao: 'Doação Externa',
  troca: 'Permuta / Troca',
  vencido: 'Baixa por Validade Vencida',
  perda: 'Avaria / Perda Física'
};

export const IndicadoresReport: React.FC<IndicadoresReportProps> = ({
  items,
  transactions,
  requests,
  allRequestItems,
  inventoryLocation,
  getCategoryColor,
  showToast,
  onBack,
  onOpenRoomMap,
  letterheadImage,
  isAdmin = true,
  selectedSector
}) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const defaultSemester: PeriodOption = now.getMonth() < 6 ? '1_semestre' : '2_semestre';

  const [periodOption, setPeriodOption] = useState<PeriodOption>(defaultSemester);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [customStart, setCustomStart] = useState<string>(() => {
    const startMonth = now.getMonth() < 6 ? '01' : '07';
    return `${currentYear}-${startMonth}-01`;
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return now.toISOString().split('T')[0];
  });

  // Global Interactive Filters (Setor, Categoria, Material)
  const lockedSector =
    !isAdmin && selectedSector && selectedSector !== 'Almoxarifado' ? selectedSector : null;
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>(lockedSector || 'todos');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('todas');
  const [selectedMaterialFilter, setSelectedMaterialFilter] = useState<string>('todos');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<InternalTab>('visao_geral');

  // Filters inside tabs
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [typeCategoryFilter, setTypeCategoryFilter] = useState<string>('todas');
  const [typeOriginFilter, setTypeOriginFilter] = useState<string>('todas');
  const [typeSearchTerm, setTypeSearchTerm] = useState<string>('');
  const [donationSubView, setDonationSubView] = useState<'todas' | 'entradas' | 'saidas' | 'vencidos' | 'estoque'>('todas');
  const [donationSearchTerm, setDonationSearchTerm] = useState<string>('');

  // Available years from existing records + standard window
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([currentYear - 2, currentYear - 1, currentYear, currentYear + 1]);
    transactions.forEach(t => {
      if (t.deletedAt) return;
      const d = parseRecordDate(t.date);
      if (d) yearsSet.add(d.getFullYear());
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  // Compute active date interval
  const dateInterval = useMemo(() => {
    if (periodOption === '1_semestre') {
      return {
        start: new Date(`${selectedYear}-01-01T00:00:00`),
        end: new Date(`${selectedYear}-06-30T23:59:59.999`),
        label: `1º Semestre de ${selectedYear} (Jan - Jun)`
      };
    }
    if (periodOption === '2_semestre') {
      return {
        start: new Date(`${selectedYear}-07-01T00:00:00`),
        end: new Date(`${selectedYear}-12-31T23:59:59.999`),
        label: `2º Semestre de ${selectedYear} (Jul - Dez)`
      };
    }
    if (periodOption === 'ano_completo') {
      return {
        start: new Date(`${selectedYear}-01-01T00:00:00`),
        end: new Date(`${selectedYear}-12-31T23:59:59.999`),
        label: `Ano Completo de ${selectedYear} (Jan - Dez)`
      };
    }
    if (periodOption === 'ultimos_90_dias') {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      return {
        start,
        end,
        label: `Últimos 90 Dias (${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')})`
      };
    }
    // personalizado
    const s = parseRecordDate(customStart) || new Date(`${selectedYear}-01-01T00:00:00`);
    s.setHours(0, 0, 0, 0);
    const e = parseRecordDate(customEnd) || new Date(`${selectedYear}-12-31T23:59:59.999`);
    e.setHours(23, 59, 59, 999);
    return {
      start: s,
      end: e,
      label: `Período Personalizado (${s.toLocaleDateString('pt-BR')} a ${e.toLocaleDateString('pt-BR')})`
    };
  }, [periodOption, selectedYear, customStart, customEnd]);

  // Base unfiltered items & transactions for current inventoryLocation (ignoring deletedAt)
  const rawLocationItems = useMemo(() => {
    return items.filter(
      item => !item.deletedAt && (item.location || 'Almoxarifado') === inventoryLocation
    );
  }, [items, inventoryLocation]);

  const rawLocationTransactions = useMemo(() => {
    return transactions.filter(
      tx => !tx.deletedAt && (tx.location || 'Almoxarifado') === inventoryLocation
    );
  }, [transactions, inventoryLocation]);

  // Map raw items by ID and normalized name for fast lookup
  const rawItemMaps = useMemo(() => {
    const byId = new Map<string, Item>();
    const byName = new Map<string, Item>();
    const priceByName = new Map<string, number>();

    rawLocationItems.forEach(item => {
      byId.set(item.id, item);
      const normName = (item.name || '').trim().toUpperCase();
      const price = Number(item.unit_price) || 0;
      if (normName) {
        if (!byName.has(normName)) {
          byName.set(normName, item);
        }
        if (price > 0 && (!priceByName.has(normName) || priceByName.get(normName) === 0)) {
          priceByName.set(normName, price);
        }
      }
    });
    return { byId, byName, priceByName };
  }, [rawLocationItems]);

  // Options for global filters (Setor, Categoria, Material Consolidado)
  const filterOptions = useMemo(() => {
    const categoriesSet = new Set<string>();
    const materialsMap = new Map<string, { normName: string; name: string; category: string; batchesCount: number; totalUnits: number }>();
    const sectorsSet = new Set<string>();

    rawLocationItems.forEach(item => {
      const cat = (item.category || 'Outros').trim();
      if (cat) categoriesSet.add(cat);

      if (selectedCategoryFilter === 'todas' || cat === selectedCategoryFilter) {
        const cleanName = (item.name || '').trim();
        const normName = cleanName.toUpperCase();
        if (normName) {
          const existing = materialsMap.get(normName) || {
            normName,
            name: cleanName,
            category: cat,
            batchesCount: 0,
            totalUnits: 0
          };
          existing.batchesCount += 1;
          existing.totalUnits += Math.max(0, Number(item.quantity) || 0);
          materialsMap.set(normName, existing);
        }
      }
    });

    rawLocationTransactions.forEach(tx => {
      const sec = (tx.sector || '').trim();
      if (sec) sectorsSet.add(sec);
    });

    requests.forEach(req => {
      if (req.deletedAt) return;
      const sec = (req.sector || '').trim();
      if (sec) sectorsSet.add(sec);
    });

    return {
      categories: Array.from(categoriesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      materials: Array.from(materialsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      sectors: Array.from(sectorsSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    };
  }, [rawLocationItems, rawLocationTransactions, requests, selectedCategoryFilter]);

  // 1. Active items for current inventoryLocation filtered by Category & Material
  const locationItems = useMemo(() => {
    return rawLocationItems.filter(item => {
      const cat = (item.category || 'Outros').trim();
      const normName = (item.name || '').trim().toUpperCase();
      if (selectedCategoryFilter !== 'todas' && cat !== selectedCategoryFilter) return false;
      if (selectedMaterialFilter !== 'todos' && normName !== selectedMaterialFilter) return false;
      return true;
    });
  }, [rawLocationItems, selectedCategoryFilter, selectedMaterialFilter]);

  // Map items by ID and normalized name for fast lookup of unit_price, category, room, etc.
  const itemMaps = useMemo(() => {
    const byId = new Map<string, Item>();
    const byName = new Map<string, Item>();
    const priceByName = new Map<string, number>();

    locationItems.forEach(item => {
      byId.set(item.id, item);
      const normName = (item.name || '').trim().toUpperCase();
      const price = Number(item.unit_price) || 0;
      if (normName) {
        if (!byName.has(normName)) {
          byName.set(normName, item);
        }
        if (price > 0 && (!priceByName.has(normName) || priceByName.get(normName) === 0)) {
          priceByName.set(normName, price);
        }
      }
    });
    return { byId, byName, priceByName };
  }, [locationItems]);

  const resolveItemForTx = (tx: Transaction): Item | undefined => {
    if (tx.item_id && rawItemMaps.byId.has(tx.item_id)) {
      return rawItemMaps.byId.get(tx.item_id);
    }
    const normName = (tx.item_name || '').trim().toUpperCase();
    return rawItemMaps.byName.get(normName);
  };

  const resolveUnitPriceForTx = (tx: Transaction): number => {
    const directItem = tx.item_id ? rawItemMaps.byId.get(tx.item_id) : undefined;
    if (directItem && (Number(directItem.unit_price) || 0) > 0) {
      return Number(directItem.unit_price) || 0;
    }
    const normName = (directItem?.name || tx.item_name || '').trim().toUpperCase();
    return rawItemMaps.priceByName.get(normName) || 0;
  };

  // All non-deleted transactions for current inventoryLocation filtered by Sector, Category, and Material
  const allLocationTransactions = useMemo(() => {
    return rawLocationTransactions.filter(tx => {
      const matchedItem = resolveItemForTx(tx);
      const cat = (matchedItem?.category || 'Outros').trim();
      const normName = (matchedItem?.name || tx.item_name || '').trim().toUpperCase();

      if (selectedCategoryFilter !== 'todas' && cat !== selectedCategoryFilter) return false;
      if (selectedMaterialFilter !== 'todos' && normName !== selectedMaterialFilter) return false;

      if (selectedSectorFilter !== 'todos') {
        const txSector = (tx.sector || '').trim();
        if (tx.type === 'exit' || tx.isReturn) {
          if (txSector !== selectedSectorFilter) return false;
        } else if (txSector && txSector !== selectedSectorFilter) {
          return false;
        }
      }
      return true;
    });
  }, [
    rawLocationTransactions,
    rawItemMaps,
    selectedCategoryFilter,
    selectedMaterialFilter,
    selectedSectorFilter
  ]);

  // 2. Active transactions for current inventoryLocation within dateInterval (ignoring deletedAt)
  const periodTransactions = useMemo(() => {
    return allLocationTransactions.filter(tx => {
      const d = parseRecordDate(tx.date);
      if (!d) return false;
      return d >= dateInterval.start && d <= dateInterval.end;
    });
  }, [allLocationTransactions, dateInterval]);

  // 3. Comprehensive Overview Metrics (Tab 1: Visão geral)
  // Organized into the 4 groups + ABC Curve requested by the user
  const overviewGroups = useMemo(() => {
    const nowTime = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Number of days in the period (if period ends in the future, cap effective elapsed days at today when start <= today, or use full period days if historical/future)
    const effectiveEndForDays =
      dateInterval.start <= nowTime && dateInterval.end > nowTime ? nowTime : dateInterval.end;
    const periodDays = Math.max(
      1,
      Math.ceil((effectiveEndForDays.getTime() - dateInterval.start.getTime()) / (1000 * 60 * 60 * 24))
    );

    // --- GROUP 1: ESTOQUE E GIRO ---
    // Current stock value & units across all active batches
    let currentStockUnits = 0;
    let currentStockValue = 0;
    locationItems.forEach(item => {
      const qty = Math.max(0, Number(item.quantity) || 0);
      const price = Number(item.unit_price) || 0;
      currentStockUnits += qty;
      currentStockValue += qty * price;
    });

    // Reconstruct stock at end of period and start of period from allLocationTransactions
    let entriesAfterEndValue = 0;
    let exitsAfterEndValue = 0;
    let entriesInPeriodAllValue = 0;
    let exitsInPeriodAllValue = 0;

    // Period specific counters
    let regularEntriesUnits = 0;
    let regularEntriesValue = 0;
    let regularEntriesCount = 0;

    let grossConsumptionExitsUnits = 0;
    let grossConsumptionExitsValue = 0;
    let grossConsumptionExitsCount = 0;

    let returnsInPeriodUnits = 0;
    let returnsInPeriodValue = 0;
    let returnsInPeriodCount = 0;

    let totalExitsInPeriodUnits = 0;
    let totalExitsInPeriodValue = 0;

    let lossAndExpiredExitsUnits = 0;
    let lossAndExpiredExitsValue = 0;
    let lossAndExpiredExitsCount = 0;

    // ABC consumption per material (consolidated by name)
    const consumptionByMaterial = new Map<
      string,
      {
        normName: string;
        name: string;
        category: string;
        grossUnits: number;
        grossValue: number;
        returnUnits: number;
        returnValue: number;
      }
    >();

    const ensureMaterialCons = (nameRaw: string, categoryRaw?: string | null) => {
      const cleanName = (nameRaw || 'Material não identificado').trim();
      const normName = cleanName.toUpperCase();
      if (!consumptionByMaterial.has(normName)) {
        consumptionByMaterial.set(normName, {
          normName,
          name: cleanName,
          category: categoryRaw || 'Outros',
          grossUnits: 0,
          grossValue: 0,
          returnUnits: 0,
          returnValue: 0
        });
      }
      return consumptionByMaterial.get(normName)!;
    };

    allLocationTransactions.forEach(tx => {
      const d = parseRecordDate(tx.date);
      if (!d) return;
      const qty = Math.max(0, Number(tx.quantity) || 0);
      const unitPrice = resolveUnitPriceForTx(tx);
      const val = qty * unitPrice;

      // Transactions after period end (to reconstruct stock at dateInterval.end)
      if (d > dateInterval.end) {
        if (tx.type === 'entry') {
          entriesAfterEndValue += val;
        } else if (tx.type === 'exit') {
          exitsAfterEndValue += val;
        }
      }

      // Transactions inside the period
      if (d >= dateInterval.start && d <= dateInterval.end) {
        const matchedItem = resolveItemForTx(tx);
        const matName = matchedItem?.name || tx.item_name || 'Material não identificado';
        const matCat = matchedItem?.category || 'Outros';

        if (tx.type === 'entry') {
          entriesInPeriodAllValue += val;
          if (tx.isReturn) {
            returnsInPeriodUnits += qty;
            returnsInPeriodValue += val;
            returnsInPeriodCount += 1;

            const mCons = ensureMaterialCons(matName, matCat);
            mCons.returnUnits += qty;
            mCons.returnValue += val;
          } else {
            regularEntriesUnits += qty;
            regularEntriesValue += val;
            regularEntriesCount += 1;
          }
        } else if (tx.type === 'exit') {
          exitsInPeriodAllValue += val;
          totalExitsInPeriodUnits += qty;
          totalExitsInPeriodValue += val;

          const isConsumption = !tx.exitReason || tx.exitReason === 'consumo';
          if (isConsumption) {
            grossConsumptionExitsUnits += qty;
            grossConsumptionExitsValue += val;
            grossConsumptionExitsCount += 1;

            const mCons = ensureMaterialCons(matName, matCat);
            mCons.grossUnits += qty;
            mCons.grossValue += val;
          }

          if (tx.exitReason === 'vencido' || tx.exitReason === 'perda') {
            lossAndExpiredExitsUnits += qty;
            lossAndExpiredExitsValue += val;
            lossAndExpiredExitsCount += 1;
          }
        }
      }
    });

    // Net consumption in the period (consumption exits minus returns)
    const netConsumptionUnits = Math.max(0, grossConsumptionExitsUnits - returnsInPeriodUnits);
    const netConsumptionValue = Math.max(0, grossConsumptionExitsValue - returnsInPeriodValue);

    // Reconstructed stock at End and Start of period
    // CurrentStock = StockAtEnd + EntriesAfterEnd - ExitsAfterEnd => StockAtEnd = CurrentStock - EntriesAfterEnd + ExitsAfterEnd
    const stockAtEndValue = Math.max(0, currentStockValue - entriesAfterEndValue + exitsAfterEndValue);
    // StockAtEnd = StockAtStart + EntriesInPeriod - ExitsInPeriod => StockAtStart = StockAtEnd - EntriesInPeriod + ExitsInPeriod
    const stockAtStartValue = Math.max(
      0,
      stockAtEndValue - entriesInPeriodAllValue + exitsInPeriodAllValue
    );
    const averageStockValue = (stockAtStartValue + stockAtEndValue) / 2;

    const stockTurnover = averageStockValue > 0 ? netConsumptionValue / averageStockValue : 0;
    const annualizedTurnover = periodDays > 0 ? stockTurnover * (365 / periodDays) : 0;

    const dailyAverageConsumptionValue = periodDays > 0 ? netConsumptionValue / periodDays : 0;
    const dailyAverageConsumptionUnits = periodDays > 0 ? netConsumptionUnits / periodDays : 0;
    const stockCoverageDays =
      dailyAverageConsumptionValue > 0 ? currentStockValue / dailyAverageConsumptionValue : null;

    // --- GROUP 2: DISPONIBILIDADE (Consolidado por nome do material nos últimos 180 dias) ---
    const start180DaysAgo = new Date(todayStart);
    start180DaysAgo.setDate(start180DaysAgo.getDate() - 180);

    // Also compute 90-day consumption for dynamic min_quantity compatibility
    const start90DaysAgo = new Date(todayStart);
    start90DaysAgo.setDate(start90DaysAgo.getDate() - 90);

    const consumedLast180ByMat = new Map<string, number>();
    const consumedLast90ByMat = new Map<string, number>();

    allLocationTransactions.forEach(tx => {
      const d = parseRecordDate(tx.date);
      if (!d) return;
      const matchedItem = resolveItemForTx(tx);
      const normName = (matchedItem?.name || tx.item_name || '').trim().toUpperCase();
      if (!normName) return;
      const qty = Math.max(0, Number(tx.quantity) || 0);

      if (d >= start180DaysAgo && d <= nowTime) {
        if (tx.type === 'exit' && (!tx.exitReason || tx.exitReason === 'consumo')) {
          consumedLast180ByMat.set(normName, (consumedLast180ByMat.get(normName) || 0) + qty);
        }
      }
      if (d >= start90DaysAgo && d <= nowTime) {
        if (tx.type === 'exit') {
          consumedLast90ByMat.set(normName, (consumedLast90ByMat.get(normName) || 0) + qty);
        } else if (tx.type === 'entry' && tx.isReturn) {
          consumedLast90ByMat.set(normName, (consumedLast90ByMat.get(normName) || 0) - qty);
        }
      }
    });

    const consolidatedMaterials = new Map<
      string,
      {
        normName: string;
        name: string;
        totalUnits: number;
        totalValue: number;
        registeredMinQty: number;
      }
    >();

    locationItems.forEach(item => {
      const normName = (item.name || '').trim().toUpperCase();
      if (!normName) return;
      const qty = Math.max(0, Number(item.quantity) || 0);
      const price = Number(item.unit_price) || 0;
      const minQ = Number(item.min_quantity) || 0;

      const existing = consolidatedMaterials.get(normName) || {
        normName,
        name: item.name.trim(),
        totalUnits: 0,
        totalValue: 0,
        registeredMinQty: minQ
      };
      existing.totalUnits += qty;
      existing.totalValue += qty * price;
      if (minQ > existing.registeredMinQty) {
        existing.registeredMinQty = minQ;
      }
      consolidatedMaterials.set(normName, existing);
    });

    let materialsWithCons180Count = 0;
    let stockoutMaterialsCount = 0; // had consumption in last 180d and today balance == 0
    let belowOrEqualMinMaterialsCount = 0;
    let noConsumptionWithStockCount = 0;
    let noConsumptionWithStockUnits = 0;
    let noConsumptionWithStockValue = 0;

    consolidatedMaterials.forEach(mat => {
      const cons180 = consumedLast180ByMat.get(mat.normName) || 0;
      const cons90 = Math.max(0, consumedLast90ByMat.get(mat.normName) || 0);
      const dynamicMin = cons90 > 0 ? Math.ceil(cons90 / 3) : mat.registeredMinQty;

      if (cons180 > 0) {
        materialsWithCons180Count += 1;
        if (mat.totalUnits === 0) {
          stockoutMaterialsCount += 1;
        }
      }

      if (dynamicMin > 0 && mat.totalUnits <= dynamicMin) {
        belowOrEqualMinMaterialsCount += 1;
      }

      if (mat.totalUnits > 0 && cons180 === 0) {
        noConsumptionWithStockCount += 1;
        noConsumptionWithStockUnits += mat.totalUnits;
        noConsumptionWithStockValue += mat.totalValue;
      }
    });

    const stockoutRatePct =
      materialsWithCons180Count > 0
        ? (stockoutMaterialsCount / materialsWithCons180Count) * 100
        : 0;

    // --- GROUP 3: ATENDIMENTO (requests & request_items) ---
    const reqItemsByReqId = new Map<string, RequestItem[]>();
    allRequestItems.forEach(ri => {
      const list = reqItemsByReqId.get(ri.request_id) || [];
      list.push(ri);
      reqItemsByReqId.set(ri.request_id, list);
    });

    // Filter valid requests: not deleted, not return, within dateInterval, matching inventoryLocation & sector filter
    const validRequests = requests.filter(req => {
      if (req.deletedAt) return false;
      if (req.isReturn) return false;
      if (
        req.status === 'DEVOLUCAO_PENDENTE' ||
        req.status === 'DEVOLUCAO_APROVADA' ||
        req.status === 'DEVOLUCAO_RECUSADA'
      ) {
        return false;
      }
      if (selectedSectorFilter !== 'todos' && (req.sector || '').trim() !== selectedSectorFilter) {
        return false;
      }
      const d = parseRecordDate(req.date);
      if (!d || d < dateInterval.start || d > dateInterval.end) return false;

      const rItems = reqItemsByReqId.get(req.id) || [];
      if (rItems.length === 0) {
        return (
          inventoryLocation === 'Almoxarifado' &&
          selectedCategoryFilter === 'todas' &&
          selectedMaterialFilter === 'todos'
        );
      }
      return rItems.some(ri => {
        const byId = ri.product_id ? itemMaps.byId.get(ri.product_id) : undefined;
        const byName = ri.product_name
          ? itemMaps.byName.get(ri.product_name.trim().toUpperCase())
          : undefined;
        return Boolean(byId || byName);
      });
    });

    let deliveredRequestsCount = 0;
    let deliveredFullRequestsCount = 0;
    let openRequestsCount = 0;
    let rejectedRequestsCount = 0;

    let totalRequestedItemsQty = 0;
    let totalDeliveredItemsQty = 0;

    let leadTimeSumHours = 0;
    let leadTimeValidCount = 0;
    let leadTimeWithin48hCount = 0;

    validRequests.forEach(req => {
      const rItems = (reqItemsByReqId.get(req.id) || []).filter(ri => {
        const byId = ri.product_id ? itemMaps.byId.get(ri.product_id) : undefined;
        const byName = ri.product_name
          ? itemMaps.byName.get(ri.product_name.trim().toUpperCase())
          : undefined;
        if (selectedCategoryFilter !== 'todas' || selectedMaterialFilter !== 'todos') {
          return Boolean(byId || byName);
        }
        return Boolean(byId || byName) || inventoryLocation === 'Almoxarifado';
      });

      rItems.forEach(ri => {
        const qReq = Math.max(0, Number(ri.quantity_requested) || 0);
        const qApp = Math.max(0, Number(ri.quantity_approved) || 0);
        totalRequestedItemsQty += qReq;
        if (req.status === 'ENTREGUE') {
          totalDeliveredItemsQty += qApp;
        }
      });

      if (req.status === 'ENTREGUE') {
        deliveredRequestsCount += 1;

        // Check if all items in the request were fulfilled in full
        const allItemsFulfilledInFull =
          rItems.length > 0 &&
          rItems.every(ri => {
            const qReq = Number(ri.quantity_requested) || 0;
            const qApp = Number(ri.quantity_approved) || 0;
            return qReq > 0 && qApp >= qReq;
          });
        if (allItemsFulfilledInFull) {
          deliveredFullRequestsCount += 1;
        }

        // Lead time calculation between req.date and req.deliveredAt
        if (req.deliveredAt) {
          const startD = parseRecordDate(req.date);
          const endD = parseRecordDate(req.deliveredAt);
          if (startD && endD) {
            const diffHours = Math.max(0, (endD.getTime() - startD.getTime()) / (1000 * 60 * 60));
            leadTimeSumHours += diffHours;
            leadTimeValidCount += 1;
            if (diffHours <= 48) {
              leadTimeWithin48hCount += 1;
            }
          }
        }
      } else if (req.status === 'RECUSADO') {
        rejectedRequestsCount += 1;
      } else {
        openRequestsCount += 1;
      }
    });

    const deliveredPlusRejected = deliveredRequestsCount + rejectedRequestsCount;
    const serviceLevelPct =
      deliveredPlusRejected > 0
        ? (deliveredFullRequestsCount / deliveredPlusRejected) * 100
        : 0;

    const itemsFulfilledPct =
      totalRequestedItemsQty > 0
        ? (totalDeliveredItemsQty / totalRequestedItemsQty) * 100
        : 0;

    const avgLeadTimeHours = leadTimeValidCount > 0 ? leadTimeSumHours / leadTimeValidCount : null;
    const within48hPct =
      leadTimeValidCount > 0 ? (leadTimeWithin48hCount / leadTimeValidCount) * 100 : 0;

    const returnRateUnitsPct =
      grossConsumptionExitsUnits > 0
        ? (returnsInPeriodUnits / grossConsumptionExitsUnits) * 100
        : 0;
    const returnRateValuePct =
      grossConsumptionExitsValue > 0
        ? (returnsInPeriodValue / grossConsumptionExitsValue) * 100
        : 0;

    // --- GROUP 4: PERDAS E VALIDADE ---
    const lossAndExpiredShareOfExitsPct =
      totalExitsInPeriodValue > 0
        ? (lossAndExpiredExitsValue / totalExitsInPeriodValue) * 100
        : 0;

    let expiredStockBatchesCount = 0;
    let expiredStockUnits = 0;
    let expiredStockValue = 0;

    let expiring60dBatchesCount = 0;
    let expiring60dUnits = 0;
    let expiring60dValue = 0;

    locationItems.forEach(item => {
      const qty = Math.max(0, Number(item.quantity) || 0);
      if (qty <= 0) return;
      if (isIndeterminateExpiry(item.expiry_date)) return;

      const expDate = parseRecordDate(item.expiry_date);
      if (!expDate) return;

      const price = Number(item.unit_price) || 0;
      const val = qty * price;
      const diffDays = Math.ceil((expDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        expiredStockBatchesCount += 1;
        expiredStockUnits += qty;
        expiredStockValue += val;
      } else if (diffDays <= 60) {
        expiring60dBatchesCount += 1;
        expiring60dUnits += qty;
        expiring60dValue += val;
      }
    });

    // --- PAINEL CURVA ABC (por valor consumido no período) ---
    const abcItemsRaw = Array.from(consumptionByMaterial.values())
      .map(m => {
        const netUnits = Math.max(0, m.grossUnits - m.returnUnits);
        const netValue = Math.max(0, m.grossValue - m.returnValue);
        return {
          name: m.name,
          category: m.category,
          netUnits,
          netValue
        };
      })
      .filter(m => m.netValue > 0 || m.netUnits > 0)
      .sort((a, b) => b.netValue - a.netValue);

    const totalAbcValue = abcItemsRaw.reduce((acc, it) => acc + it.netValue, 0);

    let cumValue = 0;
    const abcClassified = abcItemsRaw.map(it => {
      const prevPct = totalAbcValue > 0 ? (cumValue / totalAbcValue) * 100 : 0;
      cumValue += it.netValue;
      const currentCumPct = totalAbcValue > 0 ? (cumValue / totalAbcValue) * 100 : 0;
      const sharePct = totalAbcValue > 0 ? (it.netValue / totalAbcValue) * 100 : 0;

      // Class A: accumulates up to 80% (using prevPct < 80 so the item reaching 80% is included in A)
      // Class B: next 15% (prevPct < 95)
      // Class C: final 5%
      let abcClass: 'A' | 'B' | 'C' = 'C';
      if (prevPct < 80) {
        abcClass = 'A';
      } else if (prevPct < 95) {
        abcClass = 'B';
      } else {
        abcClass = 'C';
      }

      return {
        ...it,
        sharePct,
        cumPct: currentCumPct,
        abcClass
      };
    });

    const classAItems = abcClassified.filter(i => i.abcClass === 'A');
    const classBItems = abcClassified.filter(i => i.abcClass === 'B');
    const classCItems = abcClassified.filter(i => i.abcClass === 'C');

    const classAValue = classAItems.reduce((acc, i) => acc + i.netValue, 0);
    const classBValue = classBItems.reduce((acc, i) => acc + i.netValue, 0);
    const classCValue = classCItems.reduce((acc, i) => acc + i.netValue, 0);

    const top5ClassA = classAItems.slice(0, 5);
    const top10AbcItems = abcClassified.slice(0, 10);

    return {
      periodDays,
      estoqueGiro: {
        currentStockValue,
        currentStockUnits,
        stockAtStartValue,
        stockAtEndValue,
        averageStockValue,
        stockTurnover,
        annualizedTurnover,
        stockCoverageDays,
        dailyAverageConsumptionValue,
        dailyAverageConsumptionUnits,
        netConsumptionValue,
        netConsumptionUnits,
        grossConsumptionExitsCount,
        returnsInPeriodUnits,
        returnsInPeriodValue,
        regularEntriesValue,
        regularEntriesUnits,
        regularEntriesCount
      },
      disponibilidade: {
        totalConsolidatedMaterials: consolidatedMaterials.size,
        materialsWithCons180Count,
        regularDemandMaterialsCount: Math.max(0, materialsWithCons180Count - stockoutMaterialsCount),
        stockoutMaterialsCount,
        stockoutRatePct,
        belowOrEqualMinMaterialsCount,
        noConsumptionWithStockCount,
        noConsumptionWithStockUnits,
        noConsumptionWithStockValue
      },
      atendimento: {
        totalValidRequests: validRequests.length,
        deliveredRequestsCount,
        deliveredFullRequestsCount,
        openRequestsCount,
        rejectedRequestsCount,
        serviceLevelPct,
        totalRequestedItemsQty,
        totalDeliveredItemsQty,
        itemsFulfilledPct,
        avgLeadTimeHours,
        leadTimeValidCount,
        leadTimeWithin48hCount,
        within48hPct,
        returnRateUnitsPct,
        returnRateValuePct,
        returnsInPeriodUnits,
        grossConsumptionExitsUnits
      },
      perdasValidade: {
        lossAndExpiredExitsUnits,
        lossAndExpiredExitsValue,
        lossAndExpiredExitsCount,
        totalExitsInPeriodValue,
        lossAndExpiredShareOfExitsPct,
        expiredStockBatchesCount,
        expiredStockUnits,
        expiredStockValue,
        expiring60dBatchesCount,
        expiring60dUnits,
        expiring60dValue
      },
      curvaABC: {
        totalMaterialsConsumed: abcClassified.length,
        totalAbcValue,
        classA: {
          count: classAItems.length,
          value: classAValue,
          pctValue: totalAbcValue > 0 ? (classAValue / totalAbcValue) * 100 : 0,
          pctItems: abcClassified.length > 0 ? (classAItems.length / abcClassified.length) * 100 : 0
        },
        classB: {
          count: classBItems.length,
          value: classBValue,
          pctValue: totalAbcValue > 0 ? (classBValue / totalAbcValue) * 100 : 0,
          pctItems: abcClassified.length > 0 ? (classBItems.length / abcClassified.length) * 100 : 0
        },
        classC: {
          count: classCItems.length,
          value: classCValue,
          pctValue: totalAbcValue > 0 ? (classCValue / totalAbcValue) * 100 : 0,
          pctItems: abcClassified.length > 0 ? (classCItems.length / abcClassified.length) * 100 : 0
        },
        top5ClassA,
        top10AbcItems
      }
    };
  }, [
    locationItems,
    allLocationTransactions,
    requests,
    allRequestItems,
    dateInterval,
    inventoryLocation,
    itemMaps,
    selectedSectorFilter,
    selectedCategoryFilter,
    selectedMaterialFilter
  ]);

  // 3B. Interactive Visual Charts & Consolidated Summary Indicators (Real Data, No Batch Duplication)
  const visualChartsAndKpis = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const start90DaysAgo = new Date(todayStart);
    start90DaysAgo.setDate(start90DaysAgo.getDate() - 90);

    // 90-day consumption per consolidated material for dynamic minimum stock calculation
    const consumed90ByMat = new Map<string, number>();
    rawLocationTransactions.forEach(tx => {
      const d = parseRecordDate(tx.date);
      if (!d || d < start90DaysAgo) return;
      const matched = resolveItemForTx(tx);
      const normName = (matched?.name || tx.item_name || '').trim().toUpperCase();
      if (!normName) return;
      const qty = Math.max(0, Number(tx.quantity) || 0);
      if (tx.type === 'exit') {
        consumed90ByMat.set(normName, (consumed90ByMat.get(normName) || 0) + qty);
      } else if (tx.type === 'entry' && tx.isReturn) {
        consumed90ByMat.set(normName, (consumed90ByMat.get(normName) || 0) - qty);
      }
    });

    // 1. Consolidate materials across batches (sum quantities & values by normalized material name)
    const consolidatedMap = new Map<
      string,
      {
        normName: string;
        name: string;
        category: string;
        unitMeasure: string;
        batchesCount: number;
        totalUnits: number;
        totalValue: number;
        registeredMinQty: number;
      }
    >();

    locationItems.forEach(item => {
      const cleanName = (item.name || 'Sem Nome').trim();
      const normName = cleanName.toUpperCase();
      const qty = Math.max(0, Number(item.quantity) || 0);
      const price = Number(item.unit_price) || 0;
      const minQ = Number(item.min_quantity) || 0;
      const cat = (item.category || 'Outros').trim();

      const existing = consolidatedMap.get(normName) || {
        normName,
        name: cleanName,
        category: cat,
        unitMeasure: item.unit_measure || 'UN',
        batchesCount: 0,
        totalUnits: 0,
        totalValue: 0,
        registeredMinQty: minQ
      };

      existing.batchesCount += 1;
      existing.totalUnits += qty;
      existing.totalValue += qty * price;
      if (minQ > existing.registeredMinQty) {
        existing.registeredMinQty = minQ;
      }
      consolidatedMap.set(normName, existing);
    });

    let regularMaterialsCount = 0;
    let lowStockWithBalanceCount = 0;
    let zeroStockMaterialsCount = 0;
    let lowStockTotalCount = 0;

    const consolidatedList: Array<{
      name: string;
      category: string;
      batchesCount: number;
      totalUnits: number;
      minStock: number;
      totalValue: number;
      status: 'Regular' | 'Estoque Baixo' | 'Zerado (Ruptura)';
    }> = [];

    consolidatedMap.forEach(mat => {
      const cons90 = Math.max(0, consumed90ByMat.get(mat.normName) || 0);
      const dynamicMin = cons90 > 0 ? Math.ceil(cons90 / 3) : mat.registeredMinQty;

      let status: 'Regular' | 'Estoque Baixo' | 'Zerado (Ruptura)' = 'Regular';
      if (mat.totalUnits === 0) {
        zeroStockMaterialsCount += 1;
        status = 'Zerado (Ruptura)';
        if (dynamicMin > 0) {
          lowStockTotalCount += 1;
        }
      } else if (dynamicMin > 0 && mat.totalUnits <= dynamicMin) {
        lowStockWithBalanceCount += 1;
        lowStockTotalCount += 1;
        status = 'Estoque Baixo';
      } else {
        regularMaterialsCount += 1;
        status = 'Regular';
      }

      consolidatedList.push({
        name: mat.name,
        category: mat.category,
        batchesCount: mat.batchesCount,
        totalUnits: mat.totalUnits,
        minStock: dynamicMin,
        totalValue: mat.totalValue,
        status
      });
    });

    consolidatedList.sort((a, b) => {
      const order = { 'Zerado (Ruptura)': 0, 'Estoque Baixo': 1, Regular: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.totalUnits - b.totalUnits;
    });

    // 2. Timeline Chart: Entradas e Saídas por Período
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const diffDaysTotal = Math.max(
      1,
      Math.ceil((dateInterval.end.getTime() - dateInterval.start.getTime()) / (1000 * 60 * 60 * 24))
    );
    const useMonthlyBuckets = diffDaysTotal > 45;

    const timelineMap = new Map<
      string,
      { sortKey: number; label: string; entradas: number; saidas: number; entradaValor: number; saidaValor: number }
    >();

    if (useMonthlyBuckets) {
      const cursor = new Date(dateInterval.start.getFullYear(), dateInterval.start.getMonth(), 1);
      const endMonth = new Date(dateInterval.end.getFullYear(), dateInterval.end.getMonth(), 1);
      while (cursor <= endMonth) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        const label = `${monthNames[m]}/${String(y).slice(-2)}`;
        timelineMap.set(key, {
          sortKey: y * 100 + m,
          label,
          entradas: 0,
          saidas: 0,
          entradaValor: 0,
          saidaValor: 0
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // 3. Sector Consumption Map
    const sectorMap = new Map<string, { sector: string; units: number; value: number; count: number }>();

    // 4. Top Materials Map (Consolidated Consumption & Requisitions)
    const topMatMap = new Map<
      string,
      { normName: string; name: string; category: string; consumido: number; requisitado: number; valor: number }
    >();

    const ensureTopMat = (rawName: string, rawCat?: string | null) => {
      const clean = (rawName || 'Material não identificado').trim();
      const norm = clean.toUpperCase();
      if (!topMatMap.has(norm)) {
        topMatMap.set(norm, {
          normName: norm,
          name: clean,
          category: rawCat || 'Outros',
          consumido: 0,
          requisitado: 0,
          valor: 0
        });
      }
      return topMatMap.get(norm)!;
    };

    // Desconsiderar etiquetas nos gráficos de quantidade (exceto se o usuário filtrou especificamente uma etiqueta)
    const ignoreEtiquetasInCharts =
      selectedMaterialFilter === 'todos' || !isEtiquetaMaterial(selectedMaterialFilter, '');

    // 5. Category Distribution Map
    const categoryMap = new Map<
      string,
      { category: string; stockUnits: number; stockValue: number; consumedUnits: number; consumedValue: number }
    >();

    locationItems.forEach(item => {
      const cat = (item.category || 'Outros').trim();
      if (ignoreEtiquetasInCharts && isEtiquetaMaterial(item.name, cat)) return;
      const qty = Math.max(0, Number(item.quantity) || 0);
      const val = qty * (Number(item.unit_price) || 0);
      const entry = categoryMap.get(cat) || {
        category: cat,
        stockUnits: 0,
        stockValue: 0,
        consumedUnits: 0,
        consumedValue: 0
      };
      entry.stockUnits += qty;
      entry.stockValue += val;
      categoryMap.set(cat, entry);
    });

    let totalEntriesMovements = 0;
    let totalExitsMovements = 0;
    let totalReturnsMovements = 0;
    let chartTimelineEntriesUnits = 0;
    let chartTimelineExitsUnits = 0;

    periodTransactions.forEach(tx => {
      const d = parseRecordDate(tx.date);
      if (!d) return;
      const qty = Math.max(0, Number(tx.quantity) || 0);
      const unitPrice = resolveUnitPriceForTx(tx);
      const val = qty * unitPrice;
      const matched = resolveItemForTx(tx);
      const matName = matched?.name || tx.item_name || 'Material não identificado';
      const matCat = (matched?.category || 'Outros').trim();
      const skipInChart = ignoreEtiquetasInCharts && isEtiquetaMaterial(matName, matCat);

      // Bucket key for timeline
      let bucketKey: string;
      let bucketLabel: string;
      let bucketSort: number;
      if (useMonthlyBuckets) {
        const y = d.getFullYear();
        const m = d.getMonth();
        bucketKey = `${y}-${String(m + 1).padStart(2, '0')}`;
        bucketLabel = `${monthNames[m]}/${String(y).slice(-2)}`;
        bucketSort = y * 100 + m;
      } else {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const day = d.getDate();
        bucketKey = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        bucketLabel = `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
        bucketSort = d.getTime();
      }

      if (!skipInChart && !timelineMap.has(bucketKey)) {
        timelineMap.set(bucketKey, {
          sortKey: bucketSort,
          label: bucketLabel,
          entradas: 0,
          saidas: 0,
          entradaValor: 0,
          saidaValor: 0
        });
      }
      const tBucket = !skipInChart ? timelineMap.get(bucketKey) : undefined;

      if (tx.type === 'entry') {
        if (tx.isReturn) {
          totalReturnsMovements += 1;
        } else {
          totalEntriesMovements += 1;
          if (tBucket) {
            tBucket.entradas += qty;
            tBucket.entradaValor += val;
            chartTimelineEntriesUnits += qty;
          }
        }
      } else if (tx.type === 'exit') {
        totalExitsMovements += 1;
        if (tBucket) {
          tBucket.saidas += qty;
          tBucket.saidaValor += val;
          chartTimelineExitsUnits += qty;
        }

        const isConsumption = !tx.exitReason || tx.exitReason === 'consumo';
        if (isConsumption && !skipInChart) {
          const secName = (tx.sector || 'Geral / Não Informado').trim();
          const secEntry = sectorMap.get(secName) || { sector: secName, units: 0, value: 0, count: 0 };
          secEntry.units += qty;
          secEntry.value += val;
          secEntry.count += 1;
          sectorMap.set(secName, secEntry);

          const tm = ensureTopMat(matName, matCat);
          tm.consumido += qty;
          tm.valor += val;

          const catEntry = categoryMap.get(matCat) || {
            category: matCat,
            stockUnits: 0,
            stockValue: 0,
            consumedUnits: 0,
            consumedValue: 0
          };
          catEntry.consumedUnits += qty;
          catEntry.consumedValue += val;
          categoryMap.set(matCat, catEntry);
        }
      }
    });

    // Also include requested quantities from valid requests in Top Materials
    const reqItemsByReqId = new Map<string, RequestItem[]>();
    allRequestItems.forEach(ri => {
      const list = reqItemsByReqId.get(ri.request_id) || [];
      list.push(ri);
      reqItemsByReqId.set(ri.request_id, list);
    });

    requests.forEach(req => {
      if (req.deletedAt || req.isReturn) return;
      if (selectedSectorFilter !== 'todos' && (req.sector || '').trim() !== selectedSectorFilter) return;
      const d = parseRecordDate(req.date);
      if (!d || d < dateInterval.start || d > dateInterval.end) return;

      const rItems = reqItemsByReqId.get(req.id) || [];
      rItems.forEach(ri => {
        const matched =
          (ri.product_id ? rawItemMaps.byId.get(ri.product_id) : undefined) ||
          (ri.product_name ? rawItemMaps.byName.get(ri.product_name.trim().toUpperCase()) : undefined);

        const cat = (matched?.category || 'Outros').trim();
        const name = matched?.name || ri.product_name || 'Material não identificado';
        const normName = name.trim().toUpperCase();

        if (selectedCategoryFilter !== 'todas' && cat !== selectedCategoryFilter) return;
        if (selectedMaterialFilter !== 'todos' && normName !== selectedMaterialFilter) return;
        if (!matched && inventoryLocation !== 'Almoxarifado') return;
        if (ignoreEtiquetasInCharts && isEtiquetaMaterial(name, cat)) return;

        const qReq = Math.max(0, Number(ri.quantity_requested) || 0);
        if (qReq > 0) {
          const tm = ensureTopMat(name, cat);
          tm.requisitado += qReq;
        }
      });
    });

    const timelineData = Array.from(timelineMap.values()).sort((a, b) => a.sortKey - b.sortKey);

    const sectorData = Array.from(sectorMap.values())
      .filter(s => s.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, 10);

    const topMaterialsData = Array.from(topMatMap.values())
      .filter(m => m.consumido > 0 || m.requisitado > 0)
      .sort((a, b) => b.consumido + b.requisitado - (a.consumido + a.requisitado))
      .slice(0, 10);

    const categoryData = Array.from(categoryMap.values())
      .filter(c => c.stockUnits > 0 || c.consumedUnits > 0)
      .sort((a, b) => b.stockUnits + b.consumedUnits - (a.stockUnits + a.consumedUnits))
      .map((c, idx) => ({
        ...c,
        color: getCategoryColor(c.category) || CHART_PALETTE[idx % CHART_PALETTE.length]
      }));

    const stockStatusData = [
      {
        status: 'Estoque Regular',
        materiais: regularMaterialsCount,
        color: '#10b981',
        desc: 'Materiais com saldo acima do mínimo'
      },
      {
        status: 'Estoque Baixo (<= Mín.)',
        materiais: lowStockWithBalanceCount,
        color: '#f59e0b',
        desc: 'Materiais com saldo positivo porém abaixo/igual ao mínimo'
      },
      {
        status: 'Saldo Zerado (Ruptura)',
        materiais: zeroStockMaterialsCount,
        color: '#e11d48',
        desc: 'Materiais cadastrados com saldo zero'
      },
      {
        status: 'Lotes Vencendo (60d)',
        materiais: overviewGroups.perdasValidade.expiring60dBatchesCount,
        color: '#3b82f6',
        desc: 'Lotes que vencem nos próximos 60 dias'
      },
      {
        status: 'Lotes Vencidos',
        materiais: overviewGroups.perdasValidade.expiredStockBatchesCount,
        color: '#991b1b',
        desc: 'Lotes com validade expirada e saldo > 0'
      }
    ];

    return {
      consolidatedMaterialsCount: consolidatedMap.size,
      totalBatchesCount: locationItems.length,
      regularMaterialsCount,
      lowStockWithBalanceCount,
      zeroStockMaterialsCount,
      lowStockTotalCount,
      consolidatedList,
      totalMovementsCount: periodTransactions.length,
      totalEntriesMovements,
      totalExitsMovements,
      totalReturnsMovements,
      chartTimelineEntriesUnits,
      chartTimelineExitsUnits,
      timelineData,
      sectorData,
      topMaterialsData,
      categoryData,
      stockStatusData
    };
  }, [
    locationItems,
    rawLocationTransactions,
    periodTransactions,
    requests,
    allRequestItems,
    dateInterval,
    inventoryLocation,
    rawItemMaps,
    overviewGroups.perdasValidade,
    selectedSectorFilter,
    selectedCategoryFilter,
    selectedMaterialFilter,
    getCategoryColor
  ]);

  // 4. Room Situation Indicators (Tab 2: Situação de sala - Posição atual do estoque, independente do filtro de período)
  const roomMetrics = useMemo(() => {
    const defaultRoomName =
      inventoryLocation === 'Almoxarifado' ? 'Almoxarifado Principal' : 'Farmácia';

    const roomsMap = new Map<
      string,
      {
        room: string;
        distinctItems: Set<string>;
        batchesCount: number;
        stockUnits: number;
        stockValue: number;
        expiredBatches: number;
        expiring60dBatches: number;
        categoriesMap: Map<string, { category: string; distinctTypes: Set<string>; units: number }>;
        criticalBatchesList: Array<{
          id: string;
          name: string;
          batch_number: string;
          quantity: number;
          unit_measure: string;
          expiry_date: string;
          diffDays: number;
          isExpired: boolean;
        }>;
      }
    >();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Filter only batches with balance greater than zero (quantity > 0)
    locationItems.forEach(item => {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) return;

      const rawRoom = item.room ? item.room.trim() : '';
      const rName = rawRoom || defaultRoomName;

      if (!roomsMap.has(rName)) {
        roomsMap.set(rName, {
          room: rName,
          distinctItems: new Set<string>(),
          batchesCount: 0,
          stockUnits: 0,
          stockValue: 0,
          expiredBatches: 0,
          expiring60dBatches: 0,
          categoriesMap: new Map(),
          criticalBatchesList: []
        });
      }

      const rStat = roomsMap.get(rName)!;
      const price = Number(item.unit_price) || 0;
      const normItemName = (item.name || '').trim().toUpperCase();
      const catName = (item.category || 'Outros').trim();

      rStat.batchesCount += 1;
      if (normItemName) {
        rStat.distinctItems.add(normItemName);
      }
      rStat.stockUnits += qty;
      rStat.stockValue += qty * price;

      // Category summary within this room
      if (!rStat.categoriesMap.has(catName)) {
        rStat.categoriesMap.set(catName, {
          category: catName,
          distinctTypes: new Set<string>(),
          units: 0
        });
      }
      const catStat = rStat.categoriesMap.get(catName)!;
      if (normItemName) {
        catStat.distinctTypes.add(normItemName);
      }
      catStat.units += qty;

      // Check validity (ignoring Indeterminada)
      if (!isIndeterminateExpiry(item.expiry_date)) {
        const expDate = parseRecordDate(item.expiry_date);
        if (expDate) {
          const diffDays = Math.ceil(
            (expDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays < 0) {
            rStat.expiredBatches += 1;
            rStat.criticalBatchesList.push({
              id: item.id,
              name: item.name,
              batch_number: item.batch_number || 'S/L',
              quantity: qty,
              unit_measure: item.unit_measure || 'un',
              expiry_date: item.expiry_date,
              diffDays,
              isExpired: true
            });
          } else if (diffDays <= 60) {
            rStat.expiring60dBatches += 1;
            rStat.criticalBatchesList.push({
              id: item.id,
              name: item.name,
              batch_number: item.batch_number || 'S/L',
              quantity: qty,
              unit_measure: item.unit_measure || 'un',
              expiry_date: item.expiry_date,
              diffDays,
              isExpired: false
            });
          }
        }
      }
    });

    const roomSummaries = Array.from(roomsMap.values())
      .map(r => {
        const status: 'Crítico' | 'Atenção' | 'Regular' =
          r.expiredBatches > 0
            ? 'Crítico'
            : r.expiring60dBatches > 0
            ? 'Atenção'
            : 'Regular';

        const categoriesSummary = Array.from(r.categoriesMap.values())
          .map(c => ({
            category: c.category,
            typesCount: c.distinctTypes.size,
            units: c.units
          }))
          .sort((a, b) => b.units - a.units);

        const sortedCriticalBatches = [...r.criticalBatchesList].sort(
          (a, b) => a.diffDays - b.diffDays
        );

        return {
          room: r.room,
          status,
          distinctItemsCount: r.distinctItems.size,
          batchesCount: r.batchesCount,
          stockUnits: r.stockUnits,
          stockValue: r.stockValue,
          expiredBatches: r.expiredBatches,
          expiring60dBatches: r.expiring60dBatches,
          categoriesSummary,
          criticalBatchesList: sortedCriticalBatches
        };
      })
      .sort((a, b) => b.stockUnits - a.stockUnits);

    return {
      roomSummaries
    };
  }, [locationItems, inventoryLocation]);

  // 5. Dispensation by Type Indicators (Tab 3: Dispensação por tipo)
  const dispensationByTypeMetrics = useMemo(() => {
    const exits = periodTransactions.filter(tx => tx.type === 'exit');

    const byCategory = new Map<
      string,
      { category: string; units: number; value: number; count: number; distinctItems: Set<string> }
    >();
    const byOrigin = new Map<
      string,
      { originKey: string; label: string; units: number; value: number; count: number }
    >();
    const byReason = new Map<
      string,
      { reasonKey: string; label: string; units: number; value: number; count: number }
    >();

    let totalUnits = 0;
    let totalValue = 0;

    const enrichedExits = exits.map(tx => {
      const item = resolveItemForTx(tx);
      const qty = Number(tx.quantity) || 0;
      const unitPrice = resolveUnitPriceForTx(tx);
      const finValue = qty * unitPrice;
      const category = (item?.category || 'Outros').trim();
      const originKey = tx.origin || item?.origin || 'contract';
      const reasonKey = tx.exitReason || 'consumo';

      totalUnits += qty;
      totalValue += finValue;

      const catEntry = byCategory.get(category) || {
        category,
        units: 0,
        value: 0,
        count: 0,
        distinctItems: new Set<string>()
      };
      catEntry.units += qty;
      catEntry.value += finValue;
      catEntry.count += 1;
      catEntry.distinctItems.add((item?.name || tx.item_name || '').trim().toUpperCase());
      byCategory.set(category, catEntry);

      const origEntry = byOrigin.get(originKey) || {
        originKey,
        label: ORIGIN_LABELS[originKey] || originKey,
        units: 0,
        value: 0,
        count: 0
      };
      origEntry.units += qty;
      origEntry.value += finValue;
      origEntry.count += 1;
      byOrigin.set(originKey, origEntry);

      const reasonEntry = byReason.get(reasonKey) || {
        reasonKey,
        label: EXIT_REASON_LABELS[reasonKey] || reasonKey,
        units: 0,
        value: 0,
        count: 0
      };
      reasonEntry.units += qty;
      reasonEntry.value += finValue;
      reasonEntry.count += 1;
      byReason.set(reasonKey, reasonEntry);

      return {
        tx,
        item,
        qty,
        unitPrice,
        finValue,
        category,
        originKey,
        originLabel: ORIGIN_LABELS[originKey] || originKey,
        reasonKey,
        reasonLabel: EXIT_REASON_LABELS[reasonKey] || reasonKey
      };
    });

    const categoriesList = Array.from(byCategory.values())
      .map(c => ({
        ...c,
        distinctItemsCount: c.distinctItems.size,
        percentage: totalUnits > 0 ? Math.round((c.units / totalUnits) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.units - a.units);

    const originsList = Array.from(byOrigin.values())
      .map(o => ({
        ...o,
        percentage: totalUnits > 0 ? Math.round((o.units / totalUnits) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.units - a.units);

    const reasonsList = Array.from(byReason.values())
      .map(r => ({
        ...r,
        percentage: totalUnits > 0 ? Math.round((r.units / totalUnits) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.units - a.units);

    const filteredExits = enrichedExits.filter(row => {
      if (typeCategoryFilter !== 'todas' && row.category !== typeCategoryFilter) return false;
      if (typeOriginFilter !== 'todas' && row.originKey !== typeOriginFilter) return false;
      if (typeSearchTerm.trim()) {
        const q = typeSearchTerm.toLowerCase();
        return (
          (row.tx.item_name || '').toLowerCase().includes(q) ||
          row.category.toLowerCase().includes(q) ||
          (row.tx.sector || '').toLowerCase().includes(q) ||
          row.reasonLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return {
      totalUnits,
      totalValue,
      totalRecords: exits.length,
      categoriesList,
      originsList,
      reasonsList,
      filteredExits
    };
  }, [periodTransactions, typeCategoryFilter, typeOriginFilter, typeSearchTerm]);

  // 6. Donations & Expiry Write-offs Indicators (Tab 4: Doações & Baixas por Vencimento)
  const donationsMetrics = useMemo(() => {
    // Strictly entries received as donation (origin === 'donation' and not a sector return)
    const donationEntries = periodTransactions
      .filter(tx => tx.type === 'entry' && !tx.isReturn && tx.origin === 'donation')
      .map(tx => {
        const item = resolveItemForTx(tx);
        const qty = Number(tx.quantity) || 0;
        const unitPrice = resolveUnitPriceForTx(tx);
        return {
          tx,
          item,
          qty,
          unitPrice,
          finValue: qty * unitPrice,
          category: item?.category || 'Outros'
        };
      });

    // Strictly exits that were ACTUALLY DONATED OUT (exitReason === 'doacao')
    // Does NOT include regular dispensations to internal sectors even if the batch originally came from a donation
    const donationExits = periodTransactions
      .filter(tx => tx.type === 'exit' && tx.exitReason === 'doacao')
      .map(tx => {
        const item = resolveItemForTx(tx);
        const qty = Number(tx.quantity) || 0;
        const unitPrice = resolveUnitPriceForTx(tx);
        return {
          tx,
          item,
          qty,
          unitPrice,
          finValue: qty * unitPrice,
          category: item?.category || 'Outros',
          recipient: tx.donationUnitName || tx.sector || 'Unidade Recebedora Externa',
          docNumber: tx.donationNumber || 'S/N'
        };
      });

    // Baixas por Vencimento (and Perda/Descarte) in the period
    const expiryWriteOffExits = periodTransactions
      .filter(tx => tx.type === 'exit' && (tx.exitReason === 'vencido' || tx.exitReason === 'perda'))
      .map(tx => {
        const item = resolveItemForTx(tx);
        const qty = Number(tx.quantity) || 0;
        const unitPrice = resolveUnitPriceForTx(tx);
        return {
          tx,
          item,
          qty,
          unitPrice,
          finValue: qty * unitPrice,
          category: item?.category || 'Outros',
          reasonType: tx.exitReason === 'perda' ? 'Perda / Avaria' : 'Vencimento / Descarte',
          justification:
            tx.expiryReason ||
            tx.observation ||
            (tx.exitReason === 'perda' ? 'Baixa por perda ou avaria' : 'Baixa por validade vencida')
        };
      });

    const donationStockItems = locationItems.filter(
      item => item.origin === 'donation' && (Number(item.quantity) || 0) > 0
    );

    const totalReceivedUnits = donationEntries.reduce((acc, r) => acc + r.qty, 0);
    const totalReceivedValue = donationEntries.reduce((acc, r) => acc + r.finValue, 0);

    const totalDonatedOutUnits = donationExits.reduce((acc, r) => acc + r.qty, 0);
    const totalDonatedOutValue = donationExits.reduce((acc, r) => acc + r.finValue, 0);

    const totalExpiredExitUnits = expiryWriteOffExits.reduce((acc, r) => acc + r.qty, 0);
    const totalExpiredExitValue = expiryWriteOffExits.reduce((acc, r) => acc + r.finValue, 0);

    const currentDonationStockUnits = donationStockItems.reduce(
      (acc, item) => acc + (Number(item.quantity) || 0),
      0
    );
    const currentDonationStockValue = donationStockItems.reduce(
      (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
      0
    );

    const partnerUnitsSet = new Set<string>();
    donationEntries.forEach(e => {
      if (e.tx.supplier) partnerUnitsSet.add(e.tx.supplier.trim());
    });
    donationExits.forEach(e => {
      if (e.tx.donationUnitName) partnerUnitsSet.add(e.tx.donationUnitName.trim());
    });

    const searchQ = donationSearchTerm.trim().toLowerCase();

    const filteredEntries = donationEntries.filter(e => {
      if (!searchQ) return true;
      return (
        (e.tx.item_name || '').toLowerCase().includes(searchQ) ||
        (e.tx.supplier || '').toLowerCase().includes(searchQ) ||
        (e.tx.batch_number || '').toLowerCase().includes(searchQ) ||
        e.category.toLowerCase().includes(searchQ)
      );
    });

    const filteredExits = donationExits.filter(e => {
      if (!searchQ) return true;
      return (
        (e.tx.item_name || '').toLowerCase().includes(searchQ) ||
        e.recipient.toLowerCase().includes(searchQ) ||
        e.docNumber.toLowerCase().includes(searchQ) ||
        (e.tx.batch_number || '').toLowerCase().includes(searchQ) ||
        e.category.toLowerCase().includes(searchQ)
      );
    });

    const filteredExpiryExits = expiryWriteOffExits.filter(e => {
      if (!searchQ) return true;
      return (
        (e.tx.item_name || '').toLowerCase().includes(searchQ) ||
        (e.tx.batch_number || '').toLowerCase().includes(searchQ) ||
        e.justification.toLowerCase().includes(searchQ) ||
        e.category.toLowerCase().includes(searchQ)
      );
    });

    const filteredStock = donationStockItems.filter(item => {
      if (!searchQ) return true;
      return (
        (item.name || '').toLowerCase().includes(searchQ) ||
        (item.supplier || '').toLowerCase().includes(searchQ) ||
        (item.batch_number || '').toLowerCase().includes(searchQ) ||
        (item.category || '').toLowerCase().includes(searchQ)
      );
    });

    return {
      totalReceivedUnits,
      totalReceivedValue,
      totalReceivedCount: donationEntries.length,
      totalDonatedOutUnits,
      totalDonatedOutValue,
      totalDonatedOutCount: donationExits.length,
      totalExpiredExitUnits,
      totalExpiredExitValue,
      totalExpiredExitCount: expiryWriteOffExits.length,
      currentDonationStockUnits,
      currentDonationStockValue,
      currentDonationStockCount: donationStockItems.length,
      partnersCount: partnerUnitsSet.size,
      expiryWriteOffExits,
      filteredEntries,
      filteredExits,
      filteredExpiryExits,
      filteredStock
    };
  }, [periodTransactions, locationItems, donationSearchTerm]);

  // Export current indicators summary to Excel
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const { estoqueGiro, disponibilidade, atendimento, perdasValidade, curvaABC } = overviewGroups;

      const overviewRows = [
        ['INDICADORES DO ' + inventoryLocation.toUpperCase()],
        ['Período Analisado:', dateInterval.label],
        [''],
        ['GRUPO', 'INDICADOR', 'VALOR PRINCIPAL', 'DETALHAMENTO'],
        [
          'Estoque e Giro',
          'Valor Total em Estoque',
          formatCurrency(estoqueGiro.currentStockValue),
          `${estoqueGiro.currentStockUnits.toLocaleString('pt-BR')} un em todos os lotes`
        ],
        [
          'Estoque e Giro',
          'Giro do Estoque',
          `${formatDecimal(estoqueGiro.stockTurnover, 2)}x (Anualizado: ${formatDecimal(estoqueGiro.annualizedTurnover, 2)}x)`,
          `Estoque médio estimado: ${formatCurrency(estoqueGiro.averageStockValue)} (Início: ${formatCurrency(estoqueGiro.stockAtStartValue)} | Fim: ${formatCurrency(estoqueGiro.stockAtEndValue)})`
        ],
        [
          'Estoque e Giro',
          'Cobertura em Dias',
          estoqueGiro.stockCoverageDays !== null ? `${Math.round(estoqueGiro.stockCoverageDays)} dias` : 'Sem consumo',
          `Consumo médio diário: ${formatCurrency(estoqueGiro.dailyAverageConsumptionValue)}/dia`
        ],
        [
          'Estoque e Giro',
          'Consumo do Período (Líquido)',
          formatCurrency(estoqueGiro.netConsumptionValue),
          `${estoqueGiro.netConsumptionUnits.toLocaleString('pt-BR')} un (descontadas ${estoqueGiro.returnsInPeriodUnits} un devolvidas)`
        ],
        [
          'Estoque e Giro',
          'Entradas do Período',
          formatCurrency(estoqueGiro.regularEntriesValue),
          `${estoqueGiro.regularEntriesUnits.toLocaleString('pt-BR')} un (${estoqueGiro.regularEntriesCount} entradas)`
        ],
        [
          'Disponibilidade',
          'Taxa de Ruptura (180d)',
          `${formatDecimal(disponibilidade.stockoutRatePct, 1)}%`,
          `${disponibilidade.stockoutMaterialsCount} zerados hoje de ${disponibilidade.materialsWithCons180Count} materiais com consumo nos últimos 180 dias`
        ],
        [
          'Disponibilidade',
          'Materiais <= Estoque Mínimo',
          `${disponibilidade.belowOrEqualMinMaterialsCount} materiais`,
          `De ${disponibilidade.totalConsolidatedMaterials} materiais consolidados`
        ],
        [
          'Disponibilidade',
          'Materiais sem Consumo (180d)',
          `${disponibilidade.noConsumptionWithStockCount} materiais (${formatCurrency(disponibilidade.noConsumptionWithStockValue)})`,
          `${disponibilidade.noConsumptionWithStockUnits.toLocaleString('pt-BR')} un paradas com saldo`
        ],
        [
          'Atendimento',
          'Nível de Serviço Integral',
          `${formatDecimal(atendimento.serviceLevelPct, 1)}%`,
          `${atendimento.deliveredFullRequestsCount} atendidas integralmente sobre ${atendimento.deliveredRequestsCount + atendimento.rejectedRequestsCount} (entregues + recusadas)`
        ],
        [
          'Atendimento',
          'Percentual de Itens Atendidos',
          `${formatDecimal(atendimento.itemsFulfilledPct, 1)}%`,
          `${atendimento.totalDeliveredItemsQty.toLocaleString('pt-BR')} un entregues de ${atendimento.totalRequestedItemsQty.toLocaleString('pt-BR')} un solicitadas`
        ],
        [
          'Atendimento',
          'Lead Time Médio',
          atendimento.avgLeadTimeHours !== null ? `${formatDecimal(atendimento.avgLeadTimeHours, 1)}h` : 'N/A',
          `${formatDecimal(atendimento.within48hPct, 1)}% entregues em até 48h`
        ],
        [
          'Atendimento',
          'Total de Solicitações',
          `${atendimento.totalValidRequests}`,
          `Entregues: ${atendimento.deliveredRequestsCount} | Em aberto: ${atendimento.openRequestsCount} | Recusadas: ${atendimento.rejectedRequestsCount}`
        ],
        [
          'Atendimento',
          'Taxa de Devolução',
          `${formatDecimal(atendimento.returnRateUnitsPct, 2)}%`,
          `${atendimento.returnsInPeriodUnits.toLocaleString('pt-BR')} un devolvidas sobre ${atendimento.grossConsumptionExitsUnits.toLocaleString('pt-BR')} un de saídas de consumo`
        ],
        [
          'Perdas e Validade',
          'Saídas por Vencimento ou Perda',
          `${formatCurrency(perdasValidade.lossAndExpiredExitsValue)} (${formatDecimal(perdasValidade.lossAndExpiredShareOfExitsPct, 2)}% das saídas)`,
          `${perdasValidade.lossAndExpiredExitsUnits.toLocaleString('pt-BR')} un baixadas no período`
        ],
        [
          'Perdas e Validade',
          'Lotes com Saldo e Validade Vencida',
          `${perdasValidade.expiredStockBatchesCount} lotes (${formatCurrency(perdasValidade.expiredStockValue)})`,
          `${perdasValidade.expiredStockUnits.toLocaleString('pt-BR')} un vencidas em estoque`
        ],
        [
          'Perdas e Validade',
          'Lotes a Vencer nos Próximos 60 Dias',
          `${perdasValidade.expiring60dBatchesCount} lotes (${formatCurrency(perdasValidade.expiring60dValue)})`,
          `${perdasValidade.expiring60dUnits.toLocaleString('pt-BR')} un a vencer em até 60 dias`
        ],
        [
          'Curva ABC',
          'Classe A (80% do valor)',
          `${curvaABC.classA.count} materiais`,
          formatCurrency(curvaABC.classA.value)
        ],
        [
          'Curva ABC',
          'Classe B (15% seguintes)',
          `${curvaABC.classB.count} materiais`,
          formatCurrency(curvaABC.classB.value)
        ],
        [
          'Curva ABC',
          'Classe C (5% finais)',
          `${curvaABC.classC.count} materiais`,
          formatCurrency(curvaABC.classC.value)
        ]
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
      XLSX.utils.book_append_sheet(wb, wsOverview, 'Visão Geral');

      const roomRows = roomMetrics.roomSummaries.map(r => ({
        Sala: r.room,
        Situação: r.status,
        'Tipos de Material': r.distinctItemsCount,
        'Qtd. de Lotes': r.batchesCount,
        'Total de Unidades': r.stockUnits,
        'Valor em Estoque (R$)': r.stockValue,
        'Lotes Vencidos': r.expiredBatches,
        'Lotes Vencendo em 60d': r.expiring60dBatches
      }));
      const wsRooms = XLSX.utils.json_to_sheet(roomRows);
      XLSX.utils.book_append_sheet(wb, wsRooms, 'Situação de Sala');

      const dispRows = dispensationByTypeMetrics.categoriesList.map(c => ({
        Categoria: c.category,
        'Unidades Dispensadas': c.units,
        'Participação (%)': `${c.percentage}%`,
        Movimentações: c.count,
        'Itens Distintos': c.distinctItemsCount,
        'Valor Dispensado (R$)': c.value
      }));
      const wsDisp = XLSX.utils.json_to_sheet(dispRows);
      XLSX.utils.book_append_sheet(wb, wsDisp, 'Dispensação por Tipo');

      const donRows = [
        ...donationsMetrics.filteredEntries.map(e => ({
          Fluxo: 'ENTRADA (DOAÇÃO RECEBIDA)',
          Data: formatDateBR(e.tx.date),
          Material: e.tx.item_name,
          Categoria: e.category,
          Quantidade: e.qty,
          'Valor Estimado (R$)': e.finValue,
          'Parceiro / Doador / Unidade': e.tx.supplier || 'Não informado',
          'Termo / Documento': 'Entrada de Doação',
          Responsável: e.tx.responsible || '—'
        })),
        ...donationsMetrics.filteredExits.map(e => ({
          Fluxo: 'SAÍDA (DOAÇÃO CONCEDIDA)',
          Data: formatDateBR(e.tx.date),
          Material: e.tx.item_name,
          Categoria: e.category,
          Quantidade: e.qty,
          'Valor Estimado (R$)': e.finValue,
          'Parceiro / Doador / Unidade': e.recipient,
          'Termo / Documento': e.docNumber,
          Responsável: e.tx.responsible || '—'
        })),
        ...donationsMetrics.filteredExpiryExits.map(e => ({
          Fluxo: `BAIXA (${e.reasonType.toUpperCase()})`,
          Data: formatDateBR(e.tx.date),
          Material: e.tx.item_name,
          Categoria: e.category,
          Quantidade: e.qty,
          'Valor Estimado (R$)': e.finValue,
          'Parceiro / Doador / Unidade': e.justification,
          'Termo / Documento': `Lote: ${e.tx.batch_number || 'S/L'}`,
          Responsável: e.tx.responsible || '—'
        }))
      ];
      const wsDon = XLSX.utils.json_to_sheet(
        donRows.length > 0
          ? donRows
          : [{ Info: 'Nenhuma movimentação de doação ou baixa por vencimento registrada no período.' }]
      );
      XLSX.utils.book_append_sheet(wb, wsDon, 'Doações e Baixas');

      XLSX.writeFile(wb, `Indicadores_${inventoryLocation}_${selectedYear}.xlsx`);
      showToast('Planilha de Indicadores exportada com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao exportar indicadores:', error);
      showToast('Não foi possível exportar a planilha.', 'error');
    }
  };

  const selectedMaterialObj = useMemo(() => {
    if (selectedMaterialFilter === 'todos') return null;
    return filterOptions.materials.find(m => m.normName === selectedMaterialFilter) || null;
  }, [selectedMaterialFilter, filterOptions.materials]);

  const handleExportPDF = () => {
    try {
      setIsGeneratingPDF(true);
      const { estoqueGiro, atendimento, perdasValidade } = overviewGroups;

      generateCompletePDFReport({
        title: `Relatório de Indicadores e Gráficos • ${inventoryLocation}`,
        subtitle:
          'Análise gerencial consolidada de estoque, entradas e saídas, consumo por setor, materiais mais requisitados, categorias, validade e Curva ABC',
        letterheadImage,
        isAdmin,
        filters: {
          periodLabel: dateInterval.label,
          location: inventoryLocation,
          sectorFilter: selectedSectorFilter === 'todos' ? 'Todos os Setores' : selectedSectorFilter,
          categoryFilter: selectedCategoryFilter === 'todas' ? 'Todas as Categorias' : selectedCategoryFilter,
          materialFilter: selectedMaterialObj ? selectedMaterialObj.name : 'Todos os Materiais (Consolidados)'
        },
        kpis: {
          consolidatedMaterialsCount: visualChartsAndKpis.consolidatedMaterialsCount,
          activeBatchesCount: visualChartsAndKpis.totalBatchesCount,
          lowStockMaterialsCount: visualChartsAndKpis.lowStockTotalCount,
          stockoutMaterialsCount: visualChartsAndKpis.zeroStockMaterialsCount,
          totalMovementsCount: visualChartsAndKpis.totalMovementsCount,
          entriesCount: estoqueGiro.regularEntriesCount,
          entriesUnits: estoqueGiro.regularEntriesUnits,
          entriesValue: estoqueGiro.regularEntriesValue,
          exitsCount: visualChartsAndKpis.totalExitsMovements,
          exitsUnits: estoqueGiro.netConsumptionUnits + perdasValidade.lossAndExpiredExitsUnits,
          exitsValue: perdasValidade.totalExitsInPeriodValue,
          returnsCount: visualChartsAndKpis.totalReturnsMovements,
          returnsUnits: estoqueGiro.returnsInPeriodUnits,
          returnsValue: estoqueGiro.returnsInPeriodValue,
          netConsumptionUnits: estoqueGiro.netConsumptionUnits,
          netConsumptionValue: estoqueGiro.netConsumptionValue,
          currentStockUnits: estoqueGiro.currentStockUnits,
          currentStockValue: estoqueGiro.currentStockValue,
          stockTurnover: estoqueGiro.stockTurnover,
          annualizedTurnover: estoqueGiro.annualizedTurnover,
          stockCoverageDays: estoqueGiro.stockCoverageDays,
          serviceLevelPct: atendimento.serviceLevelPct,
          itemsFulfilledPct: atendimento.itemsFulfilledPct,
          avgLeadTimeHours: atendimento.avgLeadTimeHours,
          expiredBatchesCount: perdasValidade.expiredStockBatchesCount,
          expiredBatchesValue: perdasValidade.expiredStockValue,
          expiring60dBatchesCount: perdasValidade.expiring60dBatchesCount,
          expiring60dBatchesValue: perdasValidade.expiring60dValue,
          lossAndExpiredExitsUnits: perdasValidade.lossAndExpiredExitsUnits,
          lossAndExpiredExitsValue: perdasValidade.lossAndExpiredExitsValue
        },
        timelineData: visualChartsAndKpis.timelineData.map(t => ({
          label: t.label,
          entries: t.entradas,
          exits: t.saidas,
          entriesValue: t.entradaValor,
          exitsValue: t.saidaValor
        })),
        sectorData: visualChartsAndKpis.sectorData.map(s => ({
          sector: s.sector,
          units: s.units,
          value: s.value,
          movementsCount: s.count
        })),
        topMaterialsData: visualChartsAndKpis.topMaterialsData.map(m => ({
          name: m.name,
          category: m.category,
          consumedUnits: m.consumido,
          requestedUnits: m.requisitado,
          value: m.valor
        })),
        categoryData: visualChartsAndKpis.categoryData.map(c => ({
          category: c.category,
          consumedUnits: c.consumedUnits,
          consumedValue: c.consumedValue,
          stockUnits: c.stockUnits,
          stockValue: c.stockValue,
          materialsCount: 1,
          color: c.color
        })),
        stockStatusSummary: {
          regularCount: visualChartsAndKpis.regularMaterialsCount,
          lowStockCount: visualChartsAndKpis.lowStockWithBalanceCount,
          zeroStockCount: visualChartsAndKpis.zeroStockMaterialsCount,
          expiredBatchesCount: perdasValidade.expiredStockBatchesCount,
          expiring60dBatchesCount: perdasValidade.expiring60dBatchesCount
        },
        consolidatedMaterialsTable: visualChartsAndKpis.consolidatedList.map(item => ({
          name: item.name,
          category: item.category,
          batchesCount: item.batchesCount,
          totalUnits: item.totalUnits,
          minQuantity: item.minStock,
          consumed90d: 0,
          totalValue: item.totalValue,
          status:
            item.status === 'Zerado (Ruptura)'
              ? 'Zerado / Ruptura'
              : item.status === 'Estoque Baixo'
                ? 'Estoque Baixo'
                : 'Regular'
        })),
        roomsTable: roomMetrics.roomSummaries.map(r => ({
          room: r.room,
          status: r.status,
          distinctItemsCount: r.distinctItemsCount,
          batchesCount: r.batchesCount,
          stockUnits: r.stockUnits,
          stockValue: r.stockValue,
          expiredBatches: r.expiredBatches,
          expiring60dBatches: r.expiring60dBatches
        })),
        donationsAndWriteOffsTable: [
          ...donationsMetrics.filteredEntries.map(e => ({
            flow: 'Doação Recebida (Entrada)',
            date: formatDateBR(e.tx.date),
            material: e.tx.item_name,
            category: e.category,
            batch: e.tx.batch_number || 'S/L',
            partnerOrReason: e.tx.supplier || 'Não informado',
            qty: e.qty,
            value: e.finValue
          })),
          ...donationsMetrics.filteredExits.map(e => ({
            flow: 'Doação Concedida (Saída)',
            date: formatDateBR(e.tx.date),
            material: e.tx.item_name,
            category: e.category,
            batch: e.tx.batch_number || 'S/L',
            partnerOrReason: e.recipient,
            qty: e.qty,
            value: e.finValue
          })),
          ...donationsMetrics.filteredExpiryExits.map(e => ({
            flow: `Baixa (${e.reasonType})`,
            date: formatDateBR(e.tx.date),
            material: e.tx.item_name,
            category: e.category,
            batch: e.tx.batch_number || 'S/L',
            partnerOrReason: e.justification,
            qty: e.qty,
            value: e.finValue
          }))
        ],
        fileName: `Relatorio_Indicadores_${inventoryLocation}_${new Date().toISOString().split('T')[0]}.pdf`
      });

      showToast('Relatório em PDF gerado e baixado com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      showToast('Erro ao gerar o relatório em PDF.', 'error');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const { estoqueGiro, disponibilidade, atendimento, perdasValidade, curvaABC } = overviewGroups;
  const hasActiveExtraFilters =
    (selectedSectorFilter !== 'todos' && !lockedSector) ||
    selectedCategoryFilter !== 'todas' ||
    selectedMaterialFilter !== 'todos';

  const activeFilterSummary = useMemo(
    () => ({
      periodLabel: dateInterval.label,
      location: inventoryLocation,
      sectorFilter: selectedSectorFilter === 'todos' ? 'Todos os Setores' : selectedSectorFilter,
      categoryFilter:
        selectedCategoryFilter === 'todas' ? 'Todas as Categorias' : selectedCategoryFilter,
      materialFilter: selectedMaterialObj
        ? selectedMaterialObj.name
        : 'Todos os Materiais (Consolidados)'
    }),
    [
      dateInterval.label,
      inventoryLocation,
      selectedSectorFilter,
      selectedCategoryFilter,
      selectedMaterialObj
    ]
  );

  const handleSingleIndicator = (
    mode: 'print' | 'pdf',
    payload: Omit<SingleIndicatorExportParams, 'filters' | 'letterheadImage'>
  ) => {
    try {
      const fullParams: SingleIndicatorExportParams = {
        ...payload,
        letterheadImage,
        filters: activeFilterSummary
      };
      if (mode === 'print') {
        printSingleIndicator(fullParams);
        showToast(`Preparando impressão de "${payload.title}"...`, 'success');
      } else {
        exportSingleIndicatorPDF(fullParams);
        showToast(`PDF de "${payload.title}" exportado com sucesso!`, 'success');
      }
    } catch (err) {
      console.error('Erro ao processar indicador individual:', err);
      showToast('Não foi possível exportar/imprimir o indicador selecionado.', 'error');
    }
  };

  const renderIndicatorActions = (
    payload: Omit<SingleIndicatorExportParams, 'filters' | 'letterheadImage'>,
    compact = false
  ) => (
    <div
      className="flex items-center gap-1.5 shrink-0"
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => handleSingleIndicator('print', payload)}
        title={`Imprimir apenas o indicador: ${payload.title}`}
        className={`inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/90 hover:border-blue-300 font-extrabold transition-all cursor-pointer ${
          compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]'
        }`}
      >
        <Printer size={compact ? 11 : 12} />
        <span>Imprimir</span>
      </button>
      <button
        type="button"
        onClick={() => handleSingleIndicator('pdf', payload)}
        title={`Exportar PDF apenas do indicador: ${payload.title}`}
        className={`inline-flex items-center gap-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 font-extrabold transition-all cursor-pointer ${
          compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]'
        }`}
      >
        <FileText size={compact ? 11 : 12} />
        <span>Exportar PDF</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Period Filter Card */}
      <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
        <div className="p-6 sm:p-7 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="flex items-start gap-4">
              <button
                onClick={onBack}
                className="p-2.5 rounded-2xl bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200/80 hover:border-blue-200 transition-all shrink-0 cursor-pointer mt-0.5"
                title="Voltar para Visão Geral de Relatórios"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                    Painel Estratégico • {inventoryLocation}
                  </span>
                  <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    {dateInterval.label}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Indicadores do {inventoryLocation}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                  Monitoramento consolidado de estoque e giro, gráficos interativos, disponibilidade, atendimento, perdas/validade, Curva ABC, salas e doações.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                onClick={handleExportPDF}
                disabled={isGeneratingPDF}
                className="bg-gradient-to-r from-rose-600 via-rose-700 to-red-800 hover:from-rose-700 hover:to-red-900 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                <FileText size={15} />
                {isGeneratingPDF ? 'Gerando PDF...' : 'Exportar relatório em PDF'}
              </button>
              <button
                onClick={handleExportExcel}
                className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 hover:from-blue-800 hover:to-indigo-950 text-white px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
              >
                <Download size={15} />
                Exportar Indicadores (Excel)
              </button>
            </div>
          </div>

          {/* Period & Multi-Dimension Filter Controls */}
          <div className="space-y-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
              <div className="space-y-2 flex-1">
                <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-500">
                  <Calendar size={13} className="text-blue-600" />
                  Filtro de Período de Apuração
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: '1_semestre', label: '1º Semestre (Jan-Jun)' },
                      { id: '2_semestre', label: '2º Semestre (Jul-Dez)' },
                      { id: 'ano_completo', label: 'Ano Completo' },
                      { id: 'ultimos_90_dias', label: 'Últimos 90 Dias' },
                      { id: 'personalizado', label: 'Personalizado' }
                    ] as { id: PeriodOption; label: string }[]
                  ).map(opt => {
                    const active = periodOption === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setPeriodOption(opt.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                          active
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-blue-600 shadow-sm shadow-blue-600/20'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50/50 hover:border-blue-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Year Selector or Custom Date Pickers */}
              <div className="flex flex-wrap items-end gap-3 shrink-0">
                {(periodOption === '1_semestre' ||
                  periodOption === '2_semestre' ||
                  periodOption === 'ano_completo') && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">
                      Ano de Referência
                    </label>
                    <select
                      value={selectedYear}
                      onChange={e => setSelectedYear(Number(e.target.value))}
                      className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl font-black text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                    >
                      {availableYears.map(yr => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {periodOption === 'personalizado' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">
                        Data Inicial
                      </label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={e => setCustomStart(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">
                        Data Final
                      </label>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={e => setCustomEnd(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Filters: Setor, Categoria, Material Consolidado */}
            <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">
                  <Filter size={11} className="text-blue-600" />
                  Filtrar por Setor
                </label>
                <select
                  value={selectedSectorFilter}
                  disabled={Boolean(lockedSector)}
                  onChange={e => setSelectedSectorFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer disabled:bg-slate-100"
                >
                  <option value="todos">Todos os Setores</option>
                  {filterOptions.sectors.map(sec => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">
                  <Layers size={11} className="text-blue-600" />
                  Filtrar por Categoria
                </label>
                <select
                  value={selectedCategoryFilter}
                  onChange={e => {
                    setSelectedCategoryFilter(e.target.value);
                    setSelectedMaterialFilter('todos');
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="todas">Todas as Categorias ({filterOptions.categories.length})</option>
                  {filterOptions.categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-2 flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">
                    <Package size={11} className="text-blue-600" />
                    Filtrar por Material Consolidado (Soma de Lotes)
                  </label>
                  <select
                    value={selectedMaterialFilter}
                    onChange={e => setSelectedMaterialFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer truncate"
                  >
                    <option value="todos">
                      Todos os Materiais Consolidados ({filterOptions.materials.length} itens únicos)
                    </option>
                    {filterOptions.materials.map(mat => (
                      <option key={mat.normName} value={mat.normName}>
                        {mat.name} ({mat.totalUnits.toLocaleString('pt-BR')} un • {mat.batchesCount}{' '}
                        {mat.batchesCount === 1 ? 'lote' : 'lotes'})
                      </option>
                    ))}
                  </select>
                </div>

                {hasActiveExtraFilters && (
                  <button
                    onClick={() => {
                      if (!lockedSector) setSelectedSectorFilter('todos');
                      setSelectedCategoryFilter('todas');
                      setSelectedMaterialFilter('todos');
                    }}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-extrabold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                    title="Limpar filtros de setor, categoria e material"
                  >
                    <RotateCcw size={13} />
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Top Executive Strip: Materiais Cadastrados (Consolidados), Estoque Baixo, Movimentações e Situação do Estoque */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Executive KPI 1: Materiais Cadastrados vs Lotes */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/90 via-white to-blue-50/40 border border-blue-200/80 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest block">
                    Materiais Cadastrados
                  </span>
                  <p className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    {visualChartsAndKpis.consolidatedMaterialsCount.toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-bold text-slate-500">materiais</span>
                  </p>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                    Soma de {visualChartsAndKpis.totalBatchesCount.toLocaleString('pt-BR')} lotes (sem duplicar itens)
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs shrink-0">
                  <Package size={18} />
                </div>
              </div>
              <div className="h-24 w-full bg-white/90 rounded-xl border border-blue-100 p-1.5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Materiais', qtd: visualChartsAndKpis.consolidatedMaterialsCount, fill: '#2563eb' },
                      { name: 'Lotes', qtd: visualChartsAndKpis.totalBatchesCount, fill: '#4f46e5' }
                    ]}
                    layout="vertical"
                    margin={{ top: 2, right: 16, left: 4, bottom: 2 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={58}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#334155' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${Number(v).toLocaleString('pt-BR')}`, 'Registros']}
                      contentStyle={{ fontSize: '11px', borderRadius: '10px', fontWeight: 700 }}
                    />
                    <Bar dataKey="qtd" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>
                      <Cell fill="#2563eb" />
                      <Cell fill="#4f46e5" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="pt-1 border-t border-blue-100/80 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">Consolidado por nome</span>
                {renderIndicatorActions(
                  {
                    title: 'Materiais Cadastrados Consolidados vs. Lotes',
                    groupName: 'Resumo Executivo do Estoque',
                    subtitle: 'Consolidação de todos os lotes de mesmo nome sem duplicar materiais.',
                    kpis: [
                      {
                        label: 'Materiais Consolidados',
                        value: `${visualChartsAndKpis.consolidatedMaterialsCount} materiais`,
                        subValue: 'Produtos únicos no catálogo'
                      },
                      {
                        label: 'Total de Lotes',
                        value: `${visualChartsAndKpis.totalBatchesCount} lotes`,
                        subValue: 'Lotes somados por material'
                      }
                    ],
                    chart: {
                      title: 'Comparativo: Materiais Únicos vs. Lotes Registrados',
                      type: 'horizontalBar',
                      unit: 'registros',
                      data: [
                        {
                          label: 'Materiais Consolidados (Únicos)',
                          value: visualChartsAndKpis.consolidatedMaterialsCount,
                          color: '#2563eb'
                        },
                        {
                          label: 'Total de Lotes Cadastrados',
                          value: visualChartsAndKpis.totalBatchesCount,
                          color: '#4f46e5'
                        }
                      ]
                    }
                  },
                  true
                )}
              </div>
            </div>

            {/* Executive KPI 2: Itens com Estoque Baixo */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 border border-amber-200/80 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block">
                    Itens com Estoque Baixo
                  </span>
                  <p className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    {visualChartsAndKpis.lowStockTotalCount.toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-bold text-slate-500">materiais</span>
                  </p>
                  <p className="text-[11px] font-bold text-amber-700 mt-0.5">
                    {visualChartsAndKpis.lowStockWithBalanceCount} abaixo do mín. • {visualChartsAndKpis.zeroStockMaterialsCount} zerados
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs shrink-0">
                  <AlertTriangle size={18} />
                </div>
              </div>
              <div className="h-24 w-full bg-white/90 rounded-xl border border-amber-100 p-1.5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Regulares', qtd: visualChartsAndKpis.regularMaterialsCount },
                      { name: 'Baixo c/ Saldo', qtd: visualChartsAndKpis.lowStockWithBalanceCount },
                      { name: 'Zerados', qtd: visualChartsAndKpis.zeroStockMaterialsCount }
                    ]}
                    layout="vertical"
                    margin={{ top: 2, right: 14, left: 4, bottom: 2 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={74}
                      tick={{ fontSize: 9.5, fontWeight: 700, fill: '#334155' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${Number(v).toLocaleString('pt-BR')} materiais`, 'Qtd']}
                      contentStyle={{ fontSize: '11px', borderRadius: '10px', fontWeight: 700 }}
                    />
                    <Bar dataKey="qtd" radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false}>
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#e11d48" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="pt-1 border-t border-amber-100/80 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">Soma dos lotes &le; mín.</span>
                {renderIndicatorActions(
                  {
                    title: 'Itens com Estoque Baixo e Zerados (Consolidado)',
                    groupName: 'Resumo Executivo do Estoque',
                    subtitle: 'Avaliação pelo saldo consolidado de todos os lotes de cada material frente ao estoque mínimo.',
                    kpis: [
                      {
                        label: 'Estoque Baixo Total',
                        value: `${visualChartsAndKpis.lowStockTotalCount} materiais`,
                        subValue: 'Com saldo <= estoque mínimo'
                      },
                      {
                        label: 'Baixo (Com Saldo > 0)',
                        value: `${visualChartsAndKpis.lowStockWithBalanceCount} materiais`,
                        subValue: 'Atenção para reposição'
                      },
                      {
                        label: 'Saldo Zerado',
                        value: `${visualChartsAndKpis.zeroStockMaterialsCount} materiais`,
                        subValue: 'Em ruptura (saldo = 0)'
                      }
                    ],
                    chart: {
                      title: 'Distribuição dos Materiais Consolidados por Nível de Estoque',
                      type: 'donut',
                      unit: 'materiais',
                      data: [
                        {
                          label: 'Estoque Regular (> Mínimo)',
                          value: visualChartsAndKpis.regularMaterialsCount,
                          color: '#10b981'
                        },
                        {
                          label: 'Estoque Baixo (Com Saldo)',
                          value: visualChartsAndKpis.lowStockWithBalanceCount,
                          color: '#f59e0b'
                        },
                        {
                          label: 'Saldo Zerado (Ruptura)',
                          value: visualChartsAndKpis.zeroStockMaterialsCount,
                          color: '#e11d48'
                        }
                      ]
                    }
                  },
                  true
                )}
              </div>
            </div>

            {/* Executive KPI 3: Movimentações Realizadas */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-white to-indigo-50/40 border border-indigo-200/80 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest block">
                    Movimentações Realizadas
                  </span>
                  <p className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    {visualChartsAndKpis.totalMovementsCount.toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-bold text-slate-500">registros</span>
                  </p>
                  <p className="text-[11px] font-bold text-indigo-700 mt-0.5">
                    {visualChartsAndKpis.totalEntriesMovements} entr. • {visualChartsAndKpis.totalExitsMovements} saídas • {visualChartsAndKpis.totalReturnsMovements} dev.
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
                  <Activity size={18} />
                </div>
              </div>
              <div className="h-24 w-full bg-white/90 rounded-xl border border-indigo-100 p-1.5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Entradas', qtd: visualChartsAndKpis.totalEntriesMovements },
                      { name: 'Saídas', qtd: visualChartsAndKpis.totalExitsMovements },
                      { name: 'Devoluções', qtd: visualChartsAndKpis.totalReturnsMovements }
                    ]}
                    layout="vertical"
                    margin={{ top: 2, right: 14, left: 4, bottom: 2 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={66}
                      tick={{ fontSize: 9.5, fontWeight: 700, fill: '#334155' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${Number(v).toLocaleString('pt-BR')} lançamentos`, 'Movimentações']}
                      contentStyle={{ fontSize: '11px', borderRadius: '10px', fontWeight: 700 }}
                    />
                    <Bar dataKey="qtd" radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false}>
                      <Cell fill="#10b981" />
                      <Cell fill="#2563eb" />
                      <Cell fill="#f59e0b" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="pt-1 border-t border-indigo-100/80 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">No período filtrado</span>
                {renderIndicatorActions(
                  {
                    title: 'Movimentações Realizadas no Período',
                    groupName: 'Resumo Executivo do Estoque',
                    subtitle: 'Total de registros de entradas de abastecimento, saídas e devoluções no período.',
                    kpis: [
                      {
                        label: 'Total de Movimentações',
                        value: `${visualChartsAndKpis.totalMovementsCount} registros`,
                        subValue: dateInterval.label
                      },
                      {
                        label: 'Entradas',
                        value: `${visualChartsAndKpis.totalEntriesMovements} registros`,
                        subValue: `${estoqueGiro.regularEntriesUnits.toLocaleString('pt-BR')} un`
                      },
                      {
                        label: 'Saídas',
                        value: `${visualChartsAndKpis.totalExitsMovements} registros`,
                        subValue: `${estoqueGiro.netConsumptionUnits.toLocaleString('pt-BR')} un líquidas`
                      },
                      {
                        label: 'Devoluções',
                        value: `${visualChartsAndKpis.totalReturnsMovements} registros`,
                        subValue: `${estoqueGiro.returnsInPeriodUnits.toLocaleString('pt-BR')} un`
                      }
                    ],
                    chart: {
                      title: 'Comparativo de Lançamentos por Tipo de Movimentação',
                      type: 'verticalBar',
                      unit: 'registros',
                      data: [
                        {
                          label: 'Entradas Regulares',
                          value: visualChartsAndKpis.totalEntriesMovements,
                          color: '#10b981'
                        },
                        {
                          label: 'Saídas / Dispensações',
                          value: visualChartsAndKpis.totalExitsMovements,
                          color: '#2563eb'
                        },
                        {
                          label: 'Devoluções de Setores',
                          value: visualChartsAndKpis.totalReturnsMovements,
                          color: '#f59e0b'
                        }
                      ]
                    }
                  },
                  true
                )}
              </div>
            </div>

            {/* Executive KPI 4: Situação do Estoque e Validades */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 border border-emerald-200/80 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">
                    Situação do Estoque
                  </span>
                  <p className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    {visualChartsAndKpis.regularMaterialsCount.toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-bold text-slate-500">regulares</span>
                  </p>
                  <p className="text-[11px] font-bold text-emerald-700 mt-0.5">
                    {perdasValidade.expiring60dBatchesCount} lotes (60d) • {perdasValidade.expiredStockBatchesCount} vencidos
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs shrink-0">
                  <CheckCircle size={18} />
                </div>
              </div>
              <div className="h-24 w-full bg-white/90 rounded-xl border border-emerald-100 p-1.5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Regulares', qtd: visualChartsAndKpis.regularMaterialsCount },
                      { name: 'Vencem 60d', qtd: perdasValidade.expiring60dBatchesCount },
                      { name: 'Vencidos', qtd: perdasValidade.expiredStockBatchesCount }
                    ]}
                    layout="vertical"
                    margin={{ top: 2, right: 14, left: 4, bottom: 2 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={68}
                      tick={{ fontSize: 9.5, fontWeight: 700, fill: '#334155' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${Number(v).toLocaleString('pt-BR')}`, 'Quantidade']}
                      contentStyle={{ fontSize: '11px', borderRadius: '10px', fontWeight: 700 }}
                    />
                    <Bar dataKey="qtd" radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false}>
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#e11d48" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="pt-1 border-t border-emerald-100/80 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">Saúde e validade</span>
                {renderIndicatorActions(
                  {
                    title: 'Situação Geral do Estoque e Validades Críticas',
                    groupName: 'Resumo Executivo do Estoque',
                    subtitle: 'Materiais regulares versus lotes com vencimento próximo (60 dias) ou vencidos.',
                    kpis: [
                      {
                        label: 'Materiais Regulares',
                        value: `${visualChartsAndKpis.regularMaterialsCount} materiais`,
                        subValue: 'Saldo acima do estoque mínimo'
                      },
                      {
                        label: 'Vencendo em 60 Dias',
                        value: `${perdasValidade.expiring60dBatchesCount} lotes`,
                        subValue: formatCurrency(perdasValidade.expiring60dValue)
                      },
                      {
                        label: 'Lotes Vencidos Hoje',
                        value: `${perdasValidade.expiredStockBatchesCount} lotes`,
                        subValue: formatCurrency(perdasValidade.expiredStockValue)
                      }
                    ],
                    chart: {
                      title: 'Comparativo: Materiais Regulares e Lotes com Alerta de Validade',
                      type: 'verticalBar',
                      unit: 'registros',
                      data: [
                        {
                          label: 'Materiais Regulares',
                          value: visualChartsAndKpis.regularMaterialsCount,
                          color: '#10b981'
                        },
                        {
                          label: 'Lotes Vencendo (60d)',
                          value: perdasValidade.expiring60dBatchesCount,
                          color: '#f59e0b'
                        },
                        {
                          label: 'Lotes Vencidos',
                          value: perdasValidade.expiredStockBatchesCount,
                          color: '#e11d48'
                        }
                      ]
                    }
                  },
                  true
                )}
              </div>
            </div>
          </div>

          {/* 4 Internal Navigation Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            {(
              [
                {
                  id: 'visao_geral',
                  label: 'Visão geral',
                  desc: 'Gráficos, estoque, giro e ABC',
                  icon: BarChart3
                },
                {
                  id: 'situacao_sala',
                  label: 'Situação de sala',
                  desc: 'Alocação física e saldos por sala',
                  icon: Building2
                },
                {
                  id: 'dispensacao_tipo',
                  label: 'Dispensação por tipo',
                  desc: 'Consumo por categoria e modalidade',
                  icon: Layers
                },
                {
                  id: 'doacoes',
                  label: 'Doações',
                  desc: 'Entradas, saídas e estoque doado',
                  icon: HeartHandshake
                }
              ] as { id: InternalTab; label: string; desc: string; icon: any }[]
            ).map(tab => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white border-blue-800 shadow-md shadow-blue-700/15'
                      : 'bg-white hover:bg-blue-50/40 text-slate-800 border-slate-200/90 hover:border-blue-200'
                  }`}
                >
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      isSelected
                        ? 'bg-white/15 text-white'
                        : 'bg-blue-50 text-blue-700 border border-blue-100'
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-black truncate ${
                        isSelected ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </p>
                    <p
                      className={`text-[10px] font-semibold truncate mt-0.5 ${
                        isSelected ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      {tab.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===================================================================
          ABA 1: VISÃO GERAL (Gráficos Interativos + 4 Grupos + Curva ABC)
         =================================================================== */}
      {activeTab === 'visao_geral' && (
        <div className="space-y-8">
          {/* PAINEL GRÁFICO INTERATIVO (5 Gráficos Visuais com Dados Reais Consolidados) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xs">
                  <BarChart3 size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Painel Gráfico de Movimentações, Setores, Materiais e Estoque
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Visualização interativa atualizada em tempo real conforme período, setor, categoria e material selecionados
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-extrabold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 self-start sm:self-auto">
                Lotes somados por material • Etiquetas desconsideradas nos gráficos
              </span>
            </div>

            {/* Row 1: Entradas e Saídas por Período + Situação do Estoque Consolidado */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Chart 1: Entradas e Saídas por Período */}
              <div className="lg:col-span-7 bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden flex flex-col">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        Entradas e Saídas por Período
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        Evolução física de unidades abastecidas versus unidades dispensadas/baixadas (sem etiquetas)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2.5 text-xs font-extrabold mr-1">
                        <span className="flex items-center gap-1.5 text-blue-700">
                          <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" />
                          Entradas: {visualChartsAndKpis.chartTimelineEntriesUnits.toLocaleString('pt-BR')} un
                        </span>
                        <span className="flex items-center gap-1.5 text-rose-600">
                          <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 inline-block" />
                          Saídas: {visualChartsAndKpis.chartTimelineExitsUnits.toLocaleString('pt-BR')} un
                        </span>
                      </div>
                      {renderIndicatorActions({
                        title: 'Entradas e Saídas por Período',
                        groupName: 'Painel Gráfico Principal',
                        subtitle:
                          'Evolução temporal comparativa de unidades recebidas (entradas) e dispensadas/baixadas (saídas), desconsiderando etiquetas.',
                        kpis: [
                          {
                            label: 'Unidades em Entradas',
                            value: `${visualChartsAndKpis.chartTimelineEntriesUnits.toLocaleString('pt-BR')} un`,
                            subValue: formatCurrency(estoqueGiro.regularEntriesValue)
                          },
                          {
                            label: 'Unidades em Saídas',
                            value: `${visualChartsAndKpis.chartTimelineExitsUnits.toLocaleString('pt-BR')} un`,
                            subValue: formatCurrency(perdasValidade.totalExitsInPeriodValue)
                          }
                        ],
                        chart: {
                          title: 'Evolução Comparativa de Entradas e Saídas no Período (un)',
                          type: 'groupedBar',
                          unit: 'un',
                          seriesLabels: ['Entradas (un)', 'Saídas (un)'],
                          data: visualChartsAndKpis.timelineData.map(t => ({
                            label: t.label,
                            value: t.entradas,
                            secondaryValue: t.saidas,
                            color: '#2563eb'
                          }))
                        },
                        table: {
                          title: 'Detalhamento Temporal de Entradas e Saídas',
                          headers: ['Período / Data', 'Entradas (un)', 'Valor Entradas (R$)', 'Saídas (un)', 'Valor Saídas (R$)'],
                          rows: visualChartsAndKpis.timelineData.map(t => [
                            t.label,
                            `${t.entradas.toLocaleString('pt-BR')} un`,
                            formatCurrency(t.entradaValor),
                            `${t.saidas.toLocaleString('pt-BR')} un`,
                            formatCurrency(t.saidaValor)
                          ])
                        }
                      })}
                    </div>
                  </div>

                  {visualChartsAndKpis.timelineData.length > 0 ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={visualChartsAndKpis.timelineData}
                          margin={{ top: 10, right: 16, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                            axisLine={{ stroke: '#cbd5e1' }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              borderRadius: '14px',
                              border: '1px solid #cbd5e1',
                              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12)',
                              fontSize: '12px',
                              fontWeight: 700
                            }}
                            formatter={(value: any, name: any) => [
                              `${Number(value || 0).toLocaleString('pt-BR')} un`,
                              name
                            ]}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                          <Bar
                            dataKey="entradas"
                            name="Entradas (un)"
                            fill="#2563eb"
                            radius={[6, 6, 0, 0]}
                            isAnimationActive={false}
                          />
                          <Bar
                            dataKey="saidas"
                            name="Saídas (un)"
                            fill="#e11d48"
                            radius={[6, 6, 0, 0]}
                            isAnimationActive={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold text-slate-400">
                      Nenhuma movimentação registrada para os filtros selecionados neste período.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 2: Situação do Estoque Consolidado */}
              <div className="lg:col-span-5 bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden flex flex-col">
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 via-amber-500 to-rose-600" />
                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        Situação do Estoque Consolidado
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        Diagnóstico de cobertura por material único e alerta de validade por lote
                      </p>
                    </div>
                    {renderIndicatorActions({
                      title: 'Situação do Estoque Consolidado',
                      groupName: 'Painel Gráfico Principal',
                      subtitle:
                        'Diagnóstico de cobertura dos materiais consolidados (soma de lotes) e validade dos lotes ativos.',
                      kpis: visualChartsAndKpis.stockStatusData.map(s => ({
                        label: s.status,
                        value: `${s.materiais} registros`,
                        subValue: s.desc
                      })),
                      chart: {
                        title: 'Situação Consolidada do Estoque e Validades',
                        type: 'horizontalBar',
                        unit: 'registros',
                        data: visualChartsAndKpis.stockStatusData.map(s => ({
                          label: s.status,
                          value: s.materiais,
                          color: s.color
                        }))
                      }
                    })}
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={visualChartsAndKpis.stockStatusData}
                        layout="vertical"
                        margin={{ top: 5, right: 24, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="status"
                          width={145}
                          tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 800 }}
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderRadius: '14px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12px',
                            fontWeight: 700
                          }}
                          formatter={(value: any) => [`${Number(value || 0).toLocaleString('pt-BR')} registros`, 'Quantidade']}
                        />
                        <Bar
                          dataKey="materiais"
                          name="Quantidade"
                          radius={[0, 6, 6, 0]}
                          isAnimationActive={false}
                        >
                          {visualChartsAndKpis.stockStatusData.map((entry, index) => (
                            <Cell key={`cell-status-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Consumo por Setor + Materiais Mais Requisitados / Consumidos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Chart 3: Consumo por Setor */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden flex flex-col">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-cyan-600" />
                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        Consumo por Setor Requisitante
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        Unidades dispensadas por setor de destino no período selecionado
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-black">
                        Top {visualChartsAndKpis.sectorData.length} setores
                      </span>
                      {renderIndicatorActions({
                        title: 'Consumo por Setor Requisitante',
                        groupName: 'Painel Gráfico Principal',
                        subtitle: 'Ranking dos setores com maior volume físico e financeiro de consumo no período.',
                        kpis: [
                          {
                            label: 'Setores Atendidos',
                            value: `${visualChartsAndKpis.sectorData.length} setores`,
                            subValue: 'Ranking Top 10'
                          },
                          {
                            label: 'Maior Consumidor',
                            value: visualChartsAndKpis.sectorData[0]?.sector || 'Sem consumo',
                            subValue: visualChartsAndKpis.sectorData[0]
                              ? `${visualChartsAndKpis.sectorData[0].units.toLocaleString('pt-BR')} un`
                              : '—'
                          }
                        ],
                        chart: {
                          title: 'Ranking de Consumo por Setor Requisitante (Unidades)',
                          type: 'horizontalBar',
                          unit: 'un',
                          data: visualChartsAndKpis.sectorData.map((s, idx) => ({
                            label: s.sector,
                            value: s.units,
                            color: CHART_PALETTE[idx % CHART_PALETTE.length]
                          }))
                        },
                        table: {
                          title: 'Tabela de Consumo por Setor',
                          headers: ['Posição', 'Setor', 'Movimentações', 'Unidades Consumidas', 'Valor Consumido (R$)'],
                          rows: visualChartsAndKpis.sectorData.map((s, idx) => [
                            `${idx + 1}º`,
                            s.sector,
                            String(s.count),
                            `${s.units.toLocaleString('pt-BR')} un`,
                            formatCurrency(s.value)
                          ])
                        }
                      })}
                    </div>
                  </div>

                  {visualChartsAndKpis.sectorData.length > 0 ? (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={visualChartsAndKpis.sectorData}
                          layout="vertical"
                          margin={{ top: 5, right: 24, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="sector"
                            width={140}
                            tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }}
                            axisLine={{ stroke: '#cbd5e1' }}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              borderRadius: '14px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12px',
                              fontWeight: 700
                            }}
                            formatter={(value: any, _name: any, props: any) => [
                              `${Number(value || 0).toLocaleString('pt-BR')} un (${formatCurrency(props?.payload?.value || 0)})`,
                              'Consumo do Setor'
                            ]}
                          />
                          <Bar
                            dataKey="units"
                            name="Unidades Consumidas"
                            fill="#4f46e5"
                            radius={[0, 6, 6, 0]}
                            isAnimationActive={false}
                          >
                            {visualChartsAndKpis.sectorData.map((_entry, idx) => (
                              <Cell
                                key={`sector-cell-${idx}`}
                                fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-72 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold text-slate-400">
                      Nenhuma saída de consumo para setores registrada no período selecionado.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 4: Materiais Mais Requisitados e Consumidos (Consolidado sem duplicar lotes) */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden flex flex-col">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900" />
                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        Materiais Mais Requisitados e Consumidos
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        Top 10 materiais consolidados (soma de todos os lotes de mesmo nome)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-black">
                        Top {visualChartsAndKpis.topMaterialsData.length} materiais
                      </span>
                      {renderIndicatorActions({
                        title: 'Materiais Mais Requisitados e Consumidos (Consolidado)',
                        groupName: 'Painel Gráfico Principal',
                        subtitle:
                          'Ranking comparativo de unidades requisitadas em pedidos e unidades efetivamente consumidas (lotes somados).',
                        kpis: [
                          {
                            label: 'Materiais no Ranking',
                            value: `${visualChartsAndKpis.topMaterialsData.length} materiais`,
                            subValue: 'Lotes consolidados pelo nome'
                          },
                          {
                            label: '1º Material Mais Demandado',
                            value: visualChartsAndKpis.topMaterialsData[0]?.name || 'Sem dados',
                            subValue: visualChartsAndKpis.topMaterialsData[0]
                              ? `Consumo: ${visualChartsAndKpis.topMaterialsData[0].consumido.toLocaleString('pt-BR')} un`
                              : '—'
                          }
                        ],
                        chart: {
                          title: 'Ranking de Materiais Mais Consumidos e Requisitados (un)',
                          type: 'horizontalBar',
                          unit: 'un',
                          data: visualChartsAndKpis.topMaterialsData.map((m, idx) => ({
                            label: m.name,
                            value: m.consumido || m.requisitado,
                            secondaryValue: m.requisitado,
                            color: CHART_PALETTE[idx % CHART_PALETTE.length]
                          }))
                        },
                        table: {
                          title: 'Detalhamento dos Top Materiais Requisitados e Consumidos',
                          headers: ['#', 'Material Consolidado', 'Categoria', 'Qtd. Requisitada', 'Qtd. Consumida', 'Valor Consumido (R$)'],
                          rows: visualChartsAndKpis.topMaterialsData.map((m, idx) => [
                            `${idx + 1}º`,
                            m.name,
                            m.category,
                            `${m.requisitado.toLocaleString('pt-BR')} un`,
                            `${m.consumido.toLocaleString('pt-BR')} un`,
                            formatCurrency(m.valor)
                          ])
                        }
                      })}
                    </div>
                  </div>

                  {visualChartsAndKpis.topMaterialsData.length > 0 ? (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={visualChartsAndKpis.topMaterialsData}
                          layout="vertical"
                          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={155}
                            tickFormatter={(val: string) =>
                              val && val.length > 22 ? `${val.slice(0, 21)}…` : val
                            }
                            tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }}
                            axisLine={{ stroke: '#cbd5e1' }}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              borderRadius: '14px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12px',
                              fontWeight: 700
                            }}
                            formatter={(value: any, name: any) => [
                              `${Number(value || 0).toLocaleString('pt-BR')} un`,
                              name
                            ]}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                          <Bar
                            dataKey="consumido"
                            name="Consumido (Saídas)"
                            fill="#1d4ed8"
                            radius={[0, 6, 6, 0]}
                            isAnimationActive={false}
                          />
                          <Bar
                            dataKey="requisitado"
                            name="Requisitado (Pedidos)"
                            fill="#0891b2"
                            radius={[0, 6, 6, 0]}
                            isAnimationActive={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-72 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold text-slate-400">
                      Nenhum material requisitado ou consumido no período filtrado.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: Distribuição por Categoria (Gráfico de Rosca + Tabela Comparativa) */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-700" />
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                      <PieChartIcon size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        Distribuição por Categoria (Estoque Atual e Consumo no Período)
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        Representatividade física e financeira por grupo de material
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                      {visualChartsAndKpis.categoryData.length} categorias ativas
                    </span>
                    {renderIndicatorActions({
                      title: 'Distribuição por Categoria (Estoque Atual e Consumo)',
                      groupName: 'Painel Gráfico Principal',
                      subtitle:
                        'Proporção percentual e financeira de cada categoria de material no estoque e no consumo.',
                      kpis: [
                        {
                          label: 'Categorias Ativas',
                          value: `${visualChartsAndKpis.categoryData.length} categorias`,
                          subValue: 'Com saldo ou movimentação'
                        },
                        {
                          label: 'Categoria Principal',
                          value: visualChartsAndKpis.categoryData[0]?.category || '—',
                          subValue: visualChartsAndKpis.categoryData[0]
                            ? `${visualChartsAndKpis.categoryData[0].stockUnits.toLocaleString('pt-BR')} un em estoque`
                            : '—'
                        }
                      ],
                      chart: {
                        title: 'Distribuição Percentual por Categoria de Material (Estoque em un)',
                        type: 'donut',
                        unit: 'un',
                        data: visualChartsAndKpis.categoryData.map(c => ({
                          label: c.category,
                          value: c.stockUnits || c.consumedUnits,
                          color: c.color
                        }))
                      },
                      table: {
                        title: 'Tabela Comparativa por Categoria',
                        headers: ['Categoria', 'Saldo em Estoque', 'Valor Estoque', 'Consumo no Período', 'Valor Consumido'],
                        rows: visualChartsAndKpis.categoryData.map(c => [
                          c.category,
                          `${c.stockUnits.toLocaleString('pt-BR')} un`,
                          formatCurrency(c.stockValue),
                          `${c.consumedUnits.toLocaleString('pt-BR')} un`,
                          formatCurrency(c.consumedValue)
                        ])
                      }
                    })}
                  </div>
                </div>

                {visualChartsAndKpis.categoryData.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    <div className="lg:col-span-5 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={visualChartsAndKpis.categoryData}
                            dataKey="stockUnits"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={2}
                            isAnimationActive={false}
                          >
                            {visualChartsAndKpis.categoryData.map((entry, index) => (
                              <Cell key={`cat-pie-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              borderRadius: '14px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12px',
                              fontWeight: 700
                            }}
                            formatter={(value: any, name: any, props: any) => [
                              `${Number(value || 0).toLocaleString('pt-BR')} un em estoque (${formatCurrency(props?.payload?.stockValue || 0)})`,
                              name
                            ]}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="lg:col-span-7 overflow-x-auto rounded-2xl border border-slate-200/80">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3.5">Categoria</th>
                            <th className="py-2.5 px-3.5 text-right">Saldo em Estoque</th>
                            <th className="py-2.5 px-3.5 text-right">Valor Estoque</th>
                            <th className="py-2.5 px-3.5 text-right">Consumo Período</th>
                            <th className="py-2.5 px-3.5 text-right">Valor Consumido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {visualChartsAndKpis.categoryData.slice(0, 8).map(cat => (
                            <tr key={cat.category} className="hover:bg-blue-50/30 transition-colors">
                              <td className="py-2.5 px-3.5 font-bold text-slate-900 flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full shrink-0"
                                  style={{ backgroundColor: cat.color }}
                                />
                                <span className="truncate max-w-[180px]">{cat.category}</span>
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-extrabold text-slate-700 whitespace-nowrap">
                                {cat.stockUnits.toLocaleString('pt-BR')} un
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-bold text-slate-600 whitespace-nowrap">
                                {formatCurrency(cat.stockValue)}
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-extrabold text-blue-700 whitespace-nowrap">
                                {cat.consumedUnits.toLocaleString('pt-BR')} un
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-bold text-indigo-700 whitespace-nowrap">
                                {formatCurrency(cat.consumedValue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold text-slate-400">
                    Nenhuma categoria encontrada para os filtros selecionados.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* GRUPO 1: ESTOQUE E GIRO */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                  <Boxes size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Grupo 1 • Estoque e Giro
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Patrimônio em saldo, velocidade de renovação do estoque, cobertura física e fluxo do período
                  </p>
                </div>
              </div>
              {renderIndicatorActions({
                indicatorTitle: 'Grupo 1 • Estoque e Giro (Síntese Financeira)',
                indicatorSubtitle: 'Patrimônio em saldo, reconstrução retrospectiva (início/médio/fim), entradas e consumo líquido',
                groupName: 'Grupo 1 • Estoque e Giro',
                explanation:
                  'Compara os saldos patrimoniais reconstruídos no início e fim do período com o estoque médio, entradas de abastecimento e consumo líquido.',
                kpis: [
                  { label: 'Valor em Estoque Atual', value: formatCurrency(estoqueGiro.currentStockValue), subvalue: `${estoqueGiro.currentStockUnits.toLocaleString('pt-BR')} un ativas`, tone: 'blue' },
                  { label: 'Giro no Período', value: `${formatDecimal(estoqueGiro.stockTurnover, 2)}x`, subvalue: `${formatDecimal(estoqueGiro.annualizedTurnover, 2)}x / ano`, tone: 'indigo' },
                  { label: 'Cobertura em Dias', value: estoqueGiro.stockCoverageDays !== null ? `${Math.round(estoqueGiro.stockCoverageDays)} dias` : 'Sem consumo', subvalue: `Média: ${formatCurrency(estoqueGiro.dailyAverageConsumptionValue)}/dia`, tone: 'emerald' },
                  { label: 'Consumo Líquido', value: formatCurrency(estoqueGiro.netConsumptionValue), subvalue: `${estoqueGiro.netConsumptionUnits.toLocaleString('pt-BR')} un`, tone: 'amber' }
                ],
                chart: {
                  type: 'verticalBar',
                  title: 'Comparativo Financeiro de Estoque, Entradas e Consumo (R$)',
                  subtitle: 'Reconstrução patrimonial e movimentação financeira do período filtrado',
                  valueFormatter: 'currency',
                  data: [
                    { label: 'Saldo Inicial', value: estoqueGiro.stockAtStartValue, color: '#64748b' },
                    { label: 'Estoque Médio', value: estoqueGiro.averageStockValue, color: '#3b82f6' },
                    { label: 'Saldo Final', value: estoqueGiro.stockAtEndValue, color: '#1d4ed8' },
                    { label: 'Entradas', value: estoqueGiro.regularEntriesValue, color: '#10b981' },
                    { label: 'Consumo Líquido', value: estoqueGiro.netConsumptionValue, color: '#4f46e5' }
                  ]
                }
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* 1.1 Valor Total em Estoque */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Valor Total em Estoque
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Valor Total em Estoque',
                          indicatorSubtitle: 'Composição financeira por categoria dos lotes ativos',
                          groupName: 'Grupo 1 • Estoque e Giro',
                          explanation: 'Calculado pela soma da quantidade vezes o preço unitário de todos os lotes ativos do setor.',
                          kpis: [
                            { label: 'Valor Total em Estoque', value: formatCurrency(estoqueGiro.currentStockValue), tone: 'blue' },
                            { label: 'Unidades em Saldo', value: `${estoqueGiro.currentStockUnits.toLocaleString('pt-BR')} un`, tone: 'indigo' }
                          ],
                          chart: {
                            type: 'horizontalBar',
                            title: 'Valor em Estoque por Categoria (R$)',
                            valueFormatter: 'currency',
                            data: visualChartsAndKpis.categoryData
                              .filter(c => c.stockValue > 0)
                              .sort((a, b) => b.stockValue - a.stockValue)
                              .slice(0, 8)
                              .map(c => ({ label: c.category, value: c.stockValue, color: c.color }))
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatCurrency(estoqueGiro.currentStockValue)}
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {estoqueGiro.currentStockUnits.toLocaleString('pt-BR')} un ativas
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={visualChartsAndKpis.categoryData
                            .filter(c => c.stockValue > 0)
                            .sort((a, b) => b.stockValue - a.stockValue)
                            .slice(0, 4)
                            .map(c => ({
                              name: c.category.length > 10 ? `${c.category.slice(0, 10)}…` : c.category,
                              valor: Number(c.stockValue.toFixed(2))
                            }))}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Estoque']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="valor" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={22} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Calculado pela soma da quantidade vezes o preço unitário de todos os lotes ativos do setor.
                  </p>
                </div>
              </div>

              {/* 1.2 Giro do Estoque (e Anualizado) */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Giro do Estoque
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Giro do Estoque e Projeção Anualizada',
                          indicatorSubtitle: 'Relação entre consumo líquido e estoque médio reconstruído no período',
                          groupName: 'Grupo 1 • Estoque e Giro',
                          explanation: 'Valor consumido no período dividido pelo estoque médio (média entre saldo inicial e final reconstruídos).',
                          kpis: [
                            { label: 'Giro no Período', value: `${formatDecimal(estoqueGiro.stockTurnover, 2)}x`, tone: 'indigo' },
                            { label: 'Giro Anualizado', value: `${formatDecimal(estoqueGiro.annualizedTurnover, 2)}x/ano`, tone: 'blue' },
                            { label: 'Estoque Médio', value: formatCurrency(estoqueGiro.averageStockValue), tone: 'slate' },
                            { label: 'Consumo Líquido', value: formatCurrency(estoqueGiro.netConsumptionValue), tone: 'emerald' }
                          ],
                          chart: {
                            type: 'verticalBar',
                            title: 'Saldos Reconstruídos vs. Consumo para Cálculo de Giro (R$)',
                            valueFormatter: 'currency',
                            data: [
                              { label: 'Saldo Inicial', value: estoqueGiro.stockAtStartValue, color: '#64748b' },
                              { label: 'Estoque Médio', value: estoqueGiro.averageStockValue, color: '#3b82f6' },
                              { label: 'Saldo Final', value: estoqueGiro.stockAtEndValue, color: '#1d4ed8' },
                              { label: 'Consumo Período', value: estoqueGiro.netConsumptionValue, color: '#4f46e5' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-2xl font-black text-slate-900 tracking-tight">
                        {formatDecimal(estoqueGiro.stockTurnover, 2)}x
                      </p>
                      <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black">
                        {formatDecimal(estoqueGiro.annualizedTurnover, 2)}x / ano
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-slate-600 mt-1">
                      Estoque médio: {formatCurrency(estoqueGiro.averageStockValue)}
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Início', valor: Number(estoqueGiro.stockAtStartValue.toFixed(2)), fill: '#64748b' },
                            { name: 'Médio', valor: Number(estoqueGiro.averageStockValue.toFixed(2)), fill: '#3b82f6' },
                            { name: 'Fim', valor: Number(estoqueGiro.stockAtEndValue.toFixed(2)), fill: '#1d4ed8' },
                            { name: 'Cons.', valor: Number(estoqueGiro.netConsumptionValue.toFixed(2)), fill: '#4f46e5' }
                          ]}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Valor']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={22}>
                            {[
                              { fill: '#64748b' },
                              { fill: '#3b82f6' },
                              { fill: '#1d4ed8' },
                              { fill: '#4f46e5' }
                            ].map((c, idx) => (
                              <Cell key={idx} fill={c.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Valor consumido no período dividido pelo estoque médio (média entre saldo inicial e final reconstruídos).
                  </p>
                </div>
              </div>

              {/* 1.3 Cobertura em Dias */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-blue-700 to-indigo-800" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Cobertura em Dias
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Cobertura de Estoque em Dias',
                          indicatorSubtitle: `Autonomia estimada com base no consumo médio diário (${overviewGroups.periodDays} dias analisados)`,
                          groupName: 'Grupo 1 • Estoque e Giro',
                          explanation: `Valor atual em estoque dividido pelo consumo médio diário do período (${overviewGroups.periodDays} dias).`,
                          kpis: [
                            { label: 'Cobertura Estimada', value: estoqueGiro.stockCoverageDays !== null ? `${Math.round(estoqueGiro.stockCoverageDays)} dias` : 'Sem consumo', tone: 'blue' },
                            { label: 'Consumo Médio Diário', value: `${formatCurrency(estoqueGiro.dailyAverageConsumptionValue)}/dia`, tone: 'indigo' },
                            { label: 'Valor em Estoque', value: formatCurrency(estoqueGiro.currentStockValue), tone: 'emerald' }
                          ],
                          chart: {
                            type: 'horizontalBar',
                            title: 'Cobertura Atual vs. Parâmetros de Referência (Dias)',
                            valueFormatter: 'days',
                            data: [
                              { label: 'Cobertura Atual', value: Math.round(estoqueGiro.stockCoverageDays || 0), color: '#2563eb' },
                              { label: 'Meta Trimestral (90d)', value: 90, color: '#10b981' },
                              { label: 'Meta Mensal (30d)', value: 30, color: '#64748b' },
                              { label: 'Período Analisado', value: overviewGroups.periodDays, color: '#4f46e5' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {estoqueGiro.stockCoverageDays !== null
                        ? `${Math.round(estoqueGiro.stockCoverageDays).toLocaleString('pt-BR')} dias`
                        : 'Sem consumo'}
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      Média: {formatCurrency(estoqueGiro.dailyAverageConsumptionValue)}/dia
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Atual', dias: Math.round(estoqueGiro.stockCoverageDays || 0), fill: '#2563eb' },
                            { name: '30d', dias: 30, fill: '#94a3b8' },
                            { name: '90d', dias: 90, fill: '#10b981' },
                            { name: 'Período', dias: overviewGroups.periodDays, fill: '#4f46e5' }
                          ]}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} dias`, 'Referência']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="dias" radius={[4, 4, 0, 0]} maxBarSize={22}>
                            {[
                              { fill: '#2563eb' },
                              { fill: '#94a3b8' },
                              { fill: '#10b981' },
                              { fill: '#4f46e5' }
                            ].map((c, idx) => (
                              <Cell key={idx} fill={c.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Valor atual em estoque dividido pelo consumo médio diário do período ({overviewGroups.periodDays} dias).
                  </p>
                </div>
              </div>

              {/* 1.4 Consumo do Período */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-blue-900" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Consumo do Período
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Consumo Líquido do Período',
                          indicatorSubtitle: 'Saídas de consumo descontando entradas de devolução',
                          groupName: 'Grupo 1 • Estoque e Giro',
                          explanation: 'Saídas de consumo (ou sem motivo especificado) no período, descontando as entradas de devolução.',
                          kpis: [
                            { label: 'Consumo Líquido (R$)', value: formatCurrency(estoqueGiro.netConsumptionValue), tone: 'indigo' },
                            { label: 'Consumo Líquido (Un)', value: `${estoqueGiro.netConsumptionUnits.toLocaleString('pt-BR')} un`, tone: 'blue' },
                            { label: 'Devoluções Descontadas', value: `${estoqueGiro.returnsInPeriodUnits.toLocaleString('pt-BR')} un`, subvalue: formatCurrency(estoqueGiro.returnsInPeriodValue), tone: 'emerald' }
                          ],
                          chart: {
                            type: 'line',
                            title: 'Evolução Mensal do Consumo Financeiro (R$)',
                            valueFormatter: 'currency',
                            data: visualChartsAndKpis.timelineData.map(p => ({
                              label: p.label,
                              value: p.saidaValor,
                              color: '#4f46e5'
                            }))
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatCurrency(estoqueGiro.netConsumptionValue)}
                    </p>
                    <p className="text-xs font-extrabold text-indigo-700 mt-1">
                      {estoqueGiro.netConsumptionUnits.toLocaleString('pt-BR')} un líquidas
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={visualChartsAndKpis.timelineData.map(p => ({
                            name: p.label,
                            valor: Number(p.saidaValor.toFixed(2))
                          }))}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Saídas (R$)']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Area type="monotone" dataKey="valor" stroke="#4f46e5" fill="#e0e7ff" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Saídas de consumo (ou sem motivo especificado) no período, descontando as entradas de devolução.
                  </p>
                </div>
              </div>

              {/* 1.5 Entradas do Período */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-cyan-600" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Entradas do Período
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Entradas de Abastecimento do Período',
                          indicatorSubtitle: 'Soma das quantidades e valores das entradas no período (excluindo devoluções)',
                          groupName: 'Grupo 1 • Estoque e Giro',
                          explanation: 'Soma das quantidades e valores das entradas de abastecimento no período (excluindo devoluções).',
                          kpis: [
                            { label: 'Valor de Entradas', value: formatCurrency(estoqueGiro.regularEntriesValue), tone: 'blue' },
                            { label: 'Volume de Entradas', value: `${estoqueGiro.regularEntriesUnits.toLocaleString('pt-BR')} un`, tone: 'emerald' },
                            { label: 'Registros de Entrada', value: `${estoqueGiro.regularEntriesCount} entradas`, tone: 'slate' }
                          ],
                          chart: {
                            type: 'verticalBar',
                            title: 'Evolução Mensal das Entradas Financeiras (R$)',
                            valueFormatter: 'currency',
                            data: visualChartsAndKpis.timelineData.map(p => ({
                              label: p.label,
                              value: p.entradaValor,
                              color: '#2563eb'
                            }))
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatCurrency(estoqueGiro.regularEntriesValue)}
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {estoqueGiro.regularEntriesUnits.toLocaleString('pt-BR')} un ({estoqueGiro.regularEntriesCount}{' '}
                      registros)
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={visualChartsAndKpis.timelineData.map(p => ({
                            name: p.label,
                            valor: Number(p.entradaValor.toFixed(2))
                          }))}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Entradas (R$)']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="valor" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Soma das quantidades e valores das entradas de abastecimento no período (excluindo devoluções).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GRUPO 2: DISPONIBILIDADE */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-700 text-white shadow-xs">
                  <Package size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Grupo 2 • Disponibilidade
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Análise consolidada por material (soma dos lotes de mesmo nome), ruptura, estoque mínimo e itens sem giro
                  </p>
                </div>
              </div>
              {renderIndicatorActions({
                indicatorTitle: 'Grupo 2 • Disponibilidade Consolidada de Materiais',
                indicatorSubtitle: 'Panorama de ruptura (180d), estoque mínimo de segurança e materiais sem giro',
                groupName: 'Grupo 2 • Disponibilidade',
                explanation:
                  'Avalia a disponibilidade física dos materiais consolidados pela soma de todos os lotes de mesmo nome.',
                kpis: [
                  { label: 'Taxa de Ruptura (180d)', value: `${formatDecimal(disponibilidade.stockoutRatePct, 1)}%`, subvalue: `${disponibilidade.stockoutMaterialsCount} de ${disponibilidade.materialsWithCons180Count} zerados`, tone: 'rose' },
                  { label: 'Saldo ≤ Estoque Mínimo', value: `${disponibilidade.belowOrEqualMinMaterialsCount} materiais`, subvalue: `De ${disponibilidade.totalConsolidatedMaterials} cadastrados`, tone: 'amber' },
                  { label: 'Sem Giro há 180 Dias', value: `${disponibilidade.noConsumptionWithStockCount} materiais`, subvalue: formatCurrency(disponibilidade.noConsumptionWithStockValue), tone: 'slate' }
                ],
                chart: {
                  type: 'verticalBar',
                  title: 'Comparativo de Indicadores de Disponibilidade (Qtd. de Materiais)',
                  valueFormatter: 'integer',
                  data: [
                    { label: 'Total Consolidado', value: disponibilidade.totalConsolidatedMaterials, color: '#2563eb' },
                    { label: 'Com Consumo (180d)', value: disponibilidade.materialsWithCons180Count, color: '#10b981' },
                    { label: 'Em Ruptura Hoje', value: disponibilidade.stockoutMaterialsCount, color: '#ef4444' },
                    { label: 'Saldo ≤ Mínimo', value: disponibilidade.belowOrEqualMinMaterialsCount, color: '#f59e0b' },
                    { label: 'Sem Giro (180d)', value: disponibilidade.noConsumptionWithStockCount, color: '#64748b' }
                  ]
                }
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 2.1 Taxa de Ruptura */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Taxa de Ruptura
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Taxa de Ruptura de Estoque (Últimos 180 Dias)',
                          indicatorSubtitle: 'Proporção de materiais com demanda recente que estão com saldo zero hoje',
                          groupName: 'Grupo 2 • Disponibilidade',
                          explanation: 'Proporção de materiais consolidados pelo nome que tiveram consumo nos últimos 180 dias e hoje estão com saldo zero.',
                          kpis: [
                            { label: 'Taxa de Ruptura', value: `${formatDecimal(disponibilidade.stockoutRatePct, 1)}%`, tone: 'rose' },
                            { label: 'Zerados com Demanda', value: `${disponibilidade.stockoutMaterialsCount} materiais`, tone: 'amber' },
                            { label: 'Abastecidos com Demanda', value: `${Math.max(0, disponibilidade.materialsWithCons180Count - disponibilidade.stockoutMaterialsCount)} materiais`, tone: 'emerald' }
                          ],
                          chart: {
                            type: 'donut',
                            title: 'Materiais com Consumo nos Últimos 180 Dias',
                            valueFormatter: 'integer',
                            data: [
                              { label: 'Com Saldo Disponível', value: Math.max(0, disponibilidade.materialsWithCons180Count - disponibilidade.stockoutMaterialsCount), color: '#10b981' },
                              { label: 'Em Ruptura (Saldo Zero)', value: disponibilidade.stockoutMaterialsCount, color: '#ef4444' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">
                      {formatDecimal(disponibilidade.stockoutRatePct, 1)}%
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {disponibilidade.stockoutMaterialsCount} zerados hoje de{' '}
                      {disponibilidade.materialsWithCons180Count} materiais com consumo (180d)
                    </p>

                    <div className="h-28 w-full mt-3 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Disponíveis (180d)', value: Math.max(0, disponibilidade.materialsWithCons180Count - disponibilidade.stockoutMaterialsCount), color: '#10b981' },
                              { name: 'Em Ruptura (Zerados)', value: disponibilidade.stockoutMaterialsCount, color: '#ef4444' }
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={24}
                            outerRadius={42}
                            paddingAngle={3}
                          >
                            <Cell fill="#10b981" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip formatter={(val: any) => [`${Number(val || 0)} materiais`, 'Quantidade']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Proporção de materiais consolidados pelo nome que tiveram consumo nos últimos 180 dias e hoje estão com saldo zero.
                  </p>
                </div>
              </div>

              {/* 2.2 Materiais Abaixo ou Igual ao Estoque Mínimo */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-indigo-900" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Saldo &le; Estoque Mínimo
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Materiais com Saldo Igual ou Abaixo do Estoque Mínimo',
                          indicatorSubtitle: 'Comparação do saldo consolidado frente ao estoque mínimo de segurança',
                          groupName: 'Grupo 2 • Disponibilidade',
                          explanation: 'Quantidade de materiais cuja soma dos saldos de todos os lotes está igual ou abaixo do estoque mínimo de segurança.',
                          kpis: [
                            { label: 'Saldo ≤ Estoque Mínimo', value: `${disponibilidade.belowOrEqualMinMaterialsCount} materiais`, tone: 'amber' },
                            { label: 'Acima do Mínimo', value: `${Math.max(0, disponibilidade.totalConsolidatedMaterials - disponibilidade.belowOrEqualMinMaterialsCount)} materiais`, tone: 'emerald' },
                            { label: 'Total Consolidado', value: `${disponibilidade.totalConsolidatedMaterials} materiais`, tone: 'blue' }
                          ],
                          chart: {
                            type: 'donut',
                            title: 'Posição em Relação ao Estoque Mínimo',
                            valueFormatter: 'integer',
                            data: [
                              { label: 'Acima do Estoque Mínimo', value: Math.max(0, disponibilidade.totalConsolidatedMaterials - disponibilidade.belowOrEqualMinMaterialsCount), color: '#10b981' },
                              { label: 'Saldo ≤ Estoque Mínimo', value: disponibilidade.belowOrEqualMinMaterialsCount, color: '#f59e0b' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">
                      {disponibilidade.belowOrEqualMinMaterialsCount}{' '}
                      <span className="text-sm font-bold text-slate-400">materiais</span>
                    </p>
                    <p className="text-xs font-extrabold text-indigo-700 mt-1">
                      De {disponibilidade.totalConsolidatedMaterials} materiais cadastrados no setor
                    </p>

                    <div className="h-28 w-full mt-3 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Acima Mín.', qtd: Math.max(0, disponibilidade.totalConsolidatedMaterials - disponibilidade.belowOrEqualMinMaterialsCount), fill: '#10b981' },
                            { name: '≤ Mínimo', qtd: disponibilidade.belowOrEqualMinMaterialsCount, fill: '#f59e0b' }
                          ]}
                          layout="vertical"
                          margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" width={68} tick={{ fontSize: 9, fontWeight: 700, fill: '#475569' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [`${Number(val || 0)} materiais`, 'Total']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="qtd" radius={[0, 6, 6, 0]} maxBarSize={20}>
                            <Cell fill="#10b981" />
                            <Cell fill="#f59e0b" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Quantidade de materiais cuja soma dos saldos de todos os lotes está igual ou abaixo do estoque mínimo de segurança.
                  </p>
                </div>
              </div>

              {/* 2.3 Materiais com Saldo Sem Consumo nos Últimos 180 Dias */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-slate-700" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Sem Giro há 180 Dias
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Materiais com Saldo Positivo Sem Giro há 180 Dias',
                          indicatorSubtitle: 'Imobilização física e financeira em materiais sem saída recente',
                          groupName: 'Grupo 2 • Disponibilidade',
                          explanation: 'Quantidade e valor financeiro dos materiais com saldo positivo que não tiveram nenhuma saída de consumo nos últimos 180 dias.',
                          kpis: [
                            { label: 'Materiais Sem Giro (180d)', value: `${disponibilidade.noConsumptionWithStockCount} materiais`, tone: 'slate' },
                            { label: 'Valor Parado', value: formatCurrency(disponibilidade.noConsumptionWithStockValue), tone: 'amber' },
                            { label: 'Unidades Paradas', value: `${disponibilidade.noConsumptionWithStockUnits.toLocaleString('pt-BR')} un`, tone: 'blue' }
                          ],
                          chart: {
                            type: 'donut',
                            title: 'Proporção do Valor em Estoque: Com Giro vs. Sem Giro (180d)',
                            valueFormatter: 'currency',
                            data: [
                              { label: 'Estoque com Giro Ativo (R$)', value: Math.max(0, estoqueGiro.currentStockValue - disponibilidade.noConsumptionWithStockValue), color: '#2563eb' },
                              { label: 'Estoque Sem Giro 180d (R$)', value: disponibilidade.noConsumptionWithStockValue, color: '#64748b' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-3xl font-black text-slate-900 tracking-tight">
                        {disponibilidade.noConsumptionWithStockCount}{' '}
                        <span className="text-sm font-bold text-slate-400">materiais</span>
                      </p>
                    </div>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {formatCurrency(disponibilidade.noConsumptionWithStockValue)} (
                      {disponibilidade.noConsumptionWithStockUnits.toLocaleString('pt-BR')} un paradas)
                    </p>

                    <div className="h-28 w-full mt-3 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Com Giro Ativo (R$)', value: Number(Math.max(0, estoqueGiro.currentStockValue - disponibilidade.noConsumptionWithStockValue).toFixed(2)), color: '#2563eb' },
                              { name: 'Sem Giro 180d (R$)', value: Number(disponibilidade.noConsumptionWithStockValue.toFixed(2)), color: '#64748b' }
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={24}
                            outerRadius={42}
                            paddingAngle={3}
                          >
                            <Cell fill="#2563eb" />
                            <Cell fill="#64748b" />
                          </Pie>
                          <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Valor']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Quantidade e valor financeiro dos materiais com saldo positivo que não tiveram nenhuma saída de consumo nos últimos 180 dias.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GRUPO 3: ATENDIMENTO */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-700 text-white shadow-xs">
                  <CheckCircle size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Grupo 3 • Atendimento de Solicitações
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Eficiência operacional sobre pedidos (excluindo devoluções e registros excluídos) e taxa de retorno
                  </p>
                </div>
              </div>
              {renderIndicatorActions({
                indicatorTitle: 'Grupo 3 • Atendimento de Solicitações (Desempenho Operacional)',
                indicatorSubtitle: 'Nível de serviço, atendimento físico de itens, lead time e status de requisições',
                groupName: 'Grupo 3 • Atendimento de Solicitações',
                explanation:
                  'Avalia o índice de atendimento integral das solicitações dos setores, a proporção de quantidades entregues, o tempo de resposta (SLA 48h) e a taxa de devolução.',
                kpis: [
                  { label: 'Nível de Serviço', value: `${formatDecimal(atendimento.serviceLevelPct, 1)}%`, subvalue: `${atendimento.deliveredFullRequestsCount} integrais`, tone: 'blue' },
                  { label: '% Itens Atendidos', value: `${formatDecimal(atendimento.itemsFulfilledPct, 1)}%`, subvalue: `${atendimento.totalDeliveredItemsQty.toLocaleString('pt-BR')} / ${atendimento.totalRequestedItemsQty.toLocaleString('pt-BR')} un`, tone: 'indigo' },
                  { label: 'Lead Time Médio', value: atendimento.avgLeadTimeHours !== null ? `${formatDecimal(atendimento.avgLeadTimeHours, 1)}h` : 'Sem dados', subvalue: `${formatDecimal(atendimento.within48hPct, 1)}% em até 48h`, tone: 'emerald' },
                  { label: 'Total de Pedidos', value: `${atendimento.totalValidRequests} pedidos`, subvalue: `${atendimento.deliveredRequestsCount} entregues`, tone: 'slate' }
                ],
                chart: {
                  type: 'verticalBar',
                  title: 'Indicadores Percentuais de Qualidade de Atendimento (%)',
                  valueFormatter: 'percent',
                  data: [
                    { label: 'Nível de Serviço', value: Number(atendimento.serviceLevelPct.toFixed(1)), color: '#2563eb' },
                    { label: '% Itens Entregues', value: Number(atendimento.itemsFulfilledPct.toFixed(1)), color: '#4f46e5' },
                    { label: 'Entregas ≤ 48h', value: Number(atendimento.within48hPct.toFixed(1)), color: '#10b981' },
                    { label: 'Taxa Devolução', value: Number(atendimento.returnRateUnitsPct.toFixed(2)), color: '#f59e0b' }
                  ]
                }
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* 3.1 Nível de Serviço */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Nível de Serviço
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Nível de Serviço de Atendimento',
                          indicatorSubtitle: 'Proporção de solicitações entregues integralmente sobre finalizadas',
                          groupName: 'Grupo 3 • Atendimento de Solicitações',
                          explanation: 'Proporção de solicitações entregues com todos os itens atendidos integralmente sobre o total de entregues e recusadas.',
                          kpis: [
                            { label: 'Nível de Serviço', value: `${formatDecimal(atendimento.serviceLevelPct, 1)}%`, tone: 'blue' },
                            { label: 'Atendidas Integralmente', value: `${atendimento.deliveredFullRequestsCount} pedidos`, tone: 'emerald' },
                            { label: 'Parciais ou Recusadas', value: `${Math.max(0, atendimento.deliveredRequestsCount + atendimento.rejectedRequestsCount - atendimento.deliveredFullRequestsCount)} pedidos`, tone: 'amber' }
                          ],
                          chart: {
                            type: 'donut',
                            title: 'Qualidade das Solicitações Finalizadas',
                            valueFormatter: 'integer',
                            data: [
                              { label: 'Entregues Integralmente', value: atendimento.deliveredFullRequestsCount, color: '#2563eb' },
                              { label: 'Atendimento Parcial', value: Math.max(0, atendimento.deliveredRequestsCount - atendimento.deliveredFullRequestsCount), color: '#f59e0b' },
                              { label: 'Recusadas', value: atendimento.rejectedRequestsCount, color: '#ef4444' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatDecimal(atendimento.serviceLevelPct, 1)}%
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {atendimento.deliveredFullRequestsCount} integrais de{' '}
                      {atendimento.deliveredRequestsCount + atendimento.rejectedRequestsCount} finalizadas
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Integrais', value: Math.max(0, atendimento.deliveredFullRequestsCount), color: '#2563eb' },
                              { name: 'Parciais/Recusadas', value: Math.max(0, atendimento.deliveredRequestsCount + atendimento.rejectedRequestsCount - atendimento.deliveredFullRequestsCount), color: '#cbd5e1' }
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={20}
                            outerRadius={36}
                            paddingAngle={2}
                          >
                            <Cell fill="#2563eb" />
                            <Cell fill="#cbd5e1" />
                          </Pie>
                          <Tooltip formatter={(val: any) => [`${Number(val || 0)} pedidos`, 'Total']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Proporção de solicitações entregues com todos os itens atendidos integralmente sobre o total de entregues e recusadas.
                  </p>
                </div>
              </div>

              {/* 3.2 Percentual de Itens Atendidos */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-blue-800" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        % de Itens Atendidos
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Percentual Físico de Itens Atendidos',
                          indicatorSubtitle: 'Comparação entre volume solicitado e volume efetivamente entregue',
                          groupName: 'Grupo 3 • Atendimento de Solicitações',
                          explanation: 'Quantidade física total entregue dividida pela quantidade total solicitada nos pedidos do período.',
                          kpis: [
                            { label: '% Itens Atendidos', value: `${formatDecimal(atendimento.itemsFulfilledPct, 1)}%`, tone: 'indigo' },
                            { label: 'Qtd. Solicitada', value: `${atendimento.totalRequestedItemsQty.toLocaleString('pt-BR')} un`, tone: 'slate' },
                            { label: 'Qtd. Entregue', value: `${atendimento.totalDeliveredItemsQty.toLocaleString('pt-BR')} un`, tone: 'emerald' }
                          ],
                          chart: {
                            type: 'verticalBar',
                            title: 'Volume Solicitado vs. Volume Entregue (Unidades)',
                            valueFormatter: 'integer',
                            data: [
                              { label: 'Qtd. Solicitada', value: atendimento.totalRequestedItemsQty, color: '#64748b' },
                              { label: 'Qtd. Entregue', value: atendimento.totalDeliveredItemsQty, color: '#4f46e5' },
                              { label: 'Déficit Não Atendido', value: Math.max(0, atendimento.totalRequestedItemsQty - atendimento.totalDeliveredItemsQty), color: '#f59e0b' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatDecimal(atendimento.itemsFulfilledPct, 1)}%
                    </p>
                    <p className="text-xs font-extrabold text-indigo-700 mt-1">
                      {atendimento.totalDeliveredItemsQty.toLocaleString('pt-BR')} /{' '}
                      {atendimento.totalRequestedItemsQty.toLocaleString('pt-BR')} un
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Pedido', un: atendimento.totalRequestedItemsQty, fill: '#94a3b8' },
                            { name: 'Entregue', un: atendimento.totalDeliveredItemsQty, fill: '#4f46e5' }
                          ]}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Volume']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="un" radius={[4, 4, 0, 0]} maxBarSize={24}>
                            <Cell fill="#94a3b8" />
                            <Cell fill="#4f46e5" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Quantidade física total entregue dividida pela quantidade total solicitada nos pedidos do período.
                  </p>
                </div>
              </div>

              {/* 3.3 Lead Time Médio & % <= 48h */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-700" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Lead Time Médio
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Lead Time Médio de Entrega e SLA de 48h',
                          indicatorSubtitle: 'Tempo médio entre solicitação e entrega confirmada',
                          groupName: 'Grupo 3 • Atendimento de Solicitações',
                          explanation: 'Tempo médio decorrido entre a data da solicitação e a confirmação de entrega (deliveredAt).',
                          kpis: [
                            { label: 'Lead Time Médio', value: atendimento.avgLeadTimeHours !== null ? `${formatDecimal(atendimento.avgLeadTimeHours, 1)}h` : 'Sem dados', tone: 'blue' },
                            { label: 'Entregues em até 48h', value: `${formatDecimal(atendimento.within48hPct, 1)}%`, tone: 'emerald' }
                          ],
                          chart: {
                            type: 'donut',
                            title: 'Cumprimento do Prazo de 48 Horas (%)',
                            valueFormatter: 'percent',
                            data: [
                              { label: 'Entregues em até 48h (%)', value: Number(atendimento.within48hPct.toFixed(1)), color: '#10b981' },
                              { label: 'Acima de 48h (%)', value: Number(Math.max(0, 100 - atendimento.within48hPct).toFixed(1)), color: '#f59e0b' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {atendimento.avgLeadTimeHours !== null
                        ? `${formatDecimal(atendimento.avgLeadTimeHours, 1)}h`
                        : 'Sem dados'}
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {formatDecimal(atendimento.within48hPct, 1)}% entregues em até 48h
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Até 48h (%)', value: Number(atendimento.within48hPct.toFixed(1)), color: '#10b981' },
                              { name: '> 48h (%)', value: Number(Math.max(0, 100 - atendimento.within48hPct).toFixed(1)), color: '#f59e0b' }
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={20}
                            outerRadius={36}
                            paddingAngle={2}
                          >
                            <Cell fill="#10b981" />
                            <Cell fill="#f59e0b" />
                          </Pie>
                          <Tooltip formatter={(val: any) => [`${formatDecimal(Number(val) || 0, 1)}%`, 'Proporção']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Tempo médio decorrido entre a data da solicitação e a confirmação de entrega (deliveredAt).
                  </p>
                </div>
              </div>

              {/* 3.4 Total de Solicitações (Divisão) */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 to-cyan-600" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Total de Solicitações
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Total de Solicitações por Status',
                          indicatorSubtitle: 'Divisão das requisições do período entre entregues, em aberto e recusadas',
                          groupName: 'Grupo 3 • Atendimento de Solicitações',
                          explanation: 'Contagem de requisições ativas no período dividida entre entregues, em aberto e recusadas.',
                          kpis: [
                            { label: 'Total de Solicitações', value: `${atendimento.totalValidRequests} pedidos`, tone: 'blue' },
                            { label: 'Entregues', value: `${atendimento.deliveredRequestsCount} pedidos`, tone: 'emerald' },
                            { label: 'Em Aberto', value: `${atendimento.openRequestsCount} pedidos`, tone: 'amber' },
                            { label: 'Recusadas', value: `${atendimento.rejectedRequestsCount} pedidos`, tone: 'rose' }
                          ],
                          chart: {
                            type: 'verticalBar',
                            title: 'Distribuição das Solicitações por Status',
                            valueFormatter: 'integer',
                            data: [
                              { label: 'Entregues', value: atendimento.deliveredRequestsCount, color: '#10b981' },
                              { label: 'Em Aberto', value: atendimento.openRequestsCount, color: '#3b82f6' },
                              { label: 'Recusadas', value: atendimento.rejectedRequestsCount, color: '#ef4444' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {atendimento.totalValidRequests}{' '}
                      <span className="text-xs font-bold text-slate-400">pedidos</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] font-black">
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
                        Entregues: {atendimento.deliveredRequestsCount}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        Abertas: {atendimento.openRequestsCount}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800">
                        Recusadas: {atendimento.rejectedRequestsCount}
                      </span>
                    </div>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Entreg.', qtd: atendimento.deliveredRequestsCount, fill: '#10b981' },
                            { name: 'Abertas', qtd: atendimento.openRequestsCount, fill: '#3b82f6' },
                            { name: 'Recus.', qtd: atendimento.rejectedRequestsCount, fill: '#ef4444' }
                          ]}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [`${Number(val || 0)} pedidos`, 'Status']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="qtd" radius={[4, 4, 0, 0]} maxBarSize={22}>
                            <Cell fill="#10b981" />
                            <Cell fill="#3b82f6" />
                            <Cell fill="#ef4444" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Contagem de requisições ativas no período dividida entre entregues, em aberto e recusadas.
                  </p>
                </div>
              </div>

              {/* 3.5 Taxa de Devolução */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-slate-700" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Taxa de Devolução
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Taxa de Devolução ao Almoxarifado',
                          indicatorSubtitle: 'Proporção de unidades devolvidas frente às saídas de consumo',
                          groupName: 'Grupo 3 • Atendimento de Solicitações',
                          explanation: 'Total de unidades devolvidas ao estoque dividido pelo total de saídas de consumo do período.',
                          kpis: [
                            { label: 'Taxa de Devolução (Un)', value: `${formatDecimal(atendimento.returnRateUnitsPct, 2)}%`, tone: 'indigo' },
                            { label: 'Taxa de Devolução (R$)', value: `${formatDecimal(atendimento.returnRateValuePct, 2)}%`, tone: 'blue' },
                            { label: 'Unidades Devolvidas', value: `${atendimento.returnsInPeriodUnits.toLocaleString('pt-BR')} un`, tone: 'emerald' }
                          ],
                          chart: {
                            type: 'verticalBar',
                            title: 'Consumo Líquido vs. Devoluções no Período (Unidades)',
                            valueFormatter: 'integer',
                            data: [
                              { label: 'Consumo Líquido', value: estoqueGiro.netConsumptionUnits, color: '#2563eb' },
                              { label: 'Devoluções', value: atendimento.returnsInPeriodUnits, color: '#10b981' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatDecimal(atendimento.returnRateUnitsPct, 2)}%
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {atendimento.returnsInPeriodUnits.toLocaleString('pt-BR')} un devolvidas (
                      {formatDecimal(atendimento.returnRateValuePct, 2)}% em R$)
                    </p>

                    <div className="h-24 w-full mt-2 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Consumo', un: estoqueGiro.netConsumptionUnits, fill: '#2563eb' },
                            { name: 'Devolvido', un: atendimento.returnsInPeriodUnits, fill: '#10b981' }
                          ]}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Volume']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="un" radius={[4, 4, 0, 0]} maxBarSize={24}>
                            <Cell fill="#2563eb" />
                            <Cell fill="#10b981" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Total de unidades devolvidas ao estoque dividido pelo total de saídas de consumo do período.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GRUPO 4: PERDAS E VALIDADE */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-800 text-white shadow-xs">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Grupo 4 • Perdas e Validade
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Baixas por perda ou vencimento no período e exposição financeira de lotes vencidos ou próximos ao vencimento
                  </p>
                </div>
              </div>
              {renderIndicatorActions({
                indicatorTitle: 'Grupo 4 • Perdas e Exposição de Validade',
                indicatorSubtitle: 'Baixas efetivas por vencimento/perda e risco financeiro em lotes vencidos ou a vencer (60d)',
                groupName: 'Grupo 4 • Perdas e Validade',
                explanation:
                  'Compara o impacto financeiro das baixas realizadas no período por vencimento/perda com o saldo atual em lotes vencidos ou com vencimento nos próximos 60 dias.',
                kpis: [
                  { label: 'Baixas no Período', value: formatCurrency(perdasValidade.lossAndExpiredExitsValue), subvalue: `${perdasValidade.lossAndExpiredExitsUnits.toLocaleString('pt-BR')} un (${formatDecimal(perdasValidade.lossAndExpiredShareOfExitsPct, 2)}%)`, tone: 'rose' },
                  { label: 'Lotes Vencidos Hoje', value: `${perdasValidade.expiredStockBatchesCount} lotes`, subvalue: formatCurrency(perdasValidade.expiredStockValue), tone: 'amber' },
                  { label: 'Vencendo em 60 Dias', value: `${perdasValidade.expiring60dBatchesCount} lotes`, subvalue: formatCurrency(perdasValidade.expiring60dValue), tone: 'blue' }
                ],
                chart: {
                  type: 'verticalBar',
                  title: 'Exposição Financeira de Perdas e Validade (R$)',
                  valueFormatter: 'currency',
                  data: [
                    { label: 'Baixas Realizadas', value: perdasValidade.lossAndExpiredExitsValue, color: '#ef4444' },
                    { label: 'Saldo Vencido Hoje', value: perdasValidade.expiredStockValue, color: '#be123c' },
                    { label: 'Vencendo em 60d', value: perdasValidade.expiring60dValue, color: '#f59e0b' }
                  ]
                }
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 4.1 Saídas por Vencido ou Perda */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Baixas por Vencimento ou Perda
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Baixas por Vencimento ou Perda no Período',
                          indicatorSubtitle: 'Valor e proporção sobre o total financeiro das saídas',
                          groupName: 'Grupo 4 • Perdas e Validade',
                          explanation: 'Soma do valor e quantidade das saídas com motivo vencido ou perda e sua proporção sobre o valor total das saídas.',
                          kpis: [
                            { label: 'Valor Baixado', value: formatCurrency(perdasValidade.lossAndExpiredExitsValue), tone: 'rose' },
                            { label: '% sobre Saídas Totais', value: `${formatDecimal(perdasValidade.lossAndExpiredShareOfExitsPct, 2)}%`, tone: 'amber' },
                            { label: 'Quantidade Baixada', value: `${perdasValidade.lossAndExpiredExitsUnits.toLocaleString('pt-BR')} un`, subvalue: `${perdasValidade.lossAndExpiredExitsCount} registros`, tone: 'slate' }
                          ],
                          chart: {
                            type: 'donut',
                            title: 'Participação de Perdas/Vencidos sobre Saídas Totais (R$)',
                            valueFormatter: 'currency',
                            data: [
                              { label: 'Saídas Regulares / Consumo (R$)', value: Math.max(0, estoqueGiro.netConsumptionValue), color: '#2563eb' },
                              { label: 'Baixas Vencido/Perda (R$)', value: perdasValidade.lossAndExpiredExitsValue, color: '#ef4444' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-3xl font-black text-slate-900 tracking-tight">
                        {formatCurrency(perdasValidade.lossAndExpiredExitsValue)}
                      </p>
                      <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black">
                        {formatDecimal(perdasValidade.lossAndExpiredShareOfExitsPct, 2)}% das saídas
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {perdasValidade.lossAndExpiredExitsUnits.toLocaleString('pt-BR')} un (
                      {perdasValidade.lossAndExpiredExitsCount} registros de baixa)
                    </p>

                    <div className="h-28 w-full mt-3 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Saídas Regulares (R$)', value: Number(Math.max(0.01, estoqueGiro.netConsumptionValue).toFixed(2)), color: '#2563eb' },
                              { name: 'Baixas Perda/Venc. (R$)', value: Number(perdasValidade.lossAndExpiredExitsValue.toFixed(2)), color: '#ef4444' }
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={24}
                            outerRadius={42}
                            paddingAngle={3}
                          >
                            <Cell fill="#2563eb" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Valor']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Soma do valor e quantidade das saídas com motivo vencido ou perda e sua proporção sobre o valor total das saídas.
                  </p>
                </div>
              </div>

              {/* 4.2 Lotes com Saldo e Validade Vencida */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-indigo-900" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Lotes com Saldo Vencido Hoje
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Lotes com Saldo Vencido Hoje',
                          indicatorSubtitle: 'Quantidade e valor financeiro de lotes com saldo > 0 e validade expirada',
                          groupName: 'Grupo 4 • Perdas e Validade',
                          explanation: 'Quantidade e valor financeiro dos lotes com saldo maior que zero e data de validade anterior a hoje (ignorando Indeterminada).',
                          kpis: [
                            { label: 'Lotes Vencidos', value: `${perdasValidade.expiredStockBatchesCount} lotes`, tone: 'rose' },
                            { label: 'Valor Vencido em Saldo', value: formatCurrency(perdasValidade.expiredStockValue), tone: 'amber' },
                            { label: 'Unidades Vencidas', value: `${perdasValidade.expiredStockUnits.toLocaleString('pt-BR')} un`, tone: 'slate' }
                          ],
                          chart: {
                            type: 'verticalBar',
                            title: 'Comparativo de Lotes por Situação de Validade (R$)',
                            valueFormatter: 'currency',
                            data: [
                              { label: 'Saldo Regular', value: Math.max(0, estoqueGiro.currentStockValue - perdasValidade.expiredStockValue - perdasValidade.expiring60dValue), color: '#10b981' },
                              { label: 'Vencendo 60d', value: perdasValidade.expiring60dValue, color: '#f59e0b' },
                              { label: 'Vencido Hoje', value: perdasValidade.expiredStockValue, color: '#ef4444' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-3xl font-black text-slate-900 tracking-tight">
                        {perdasValidade.expiredStockBatchesCount}{' '}
                        <span className="text-sm font-bold text-slate-400">lotes</span>
                      </p>
                      <span className="text-sm font-black text-indigo-700">
                        ({formatCurrency(perdasValidade.expiredStockValue)})
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-slate-600 mt-1">
                      {perdasValidade.expiredStockUnits.toLocaleString('pt-BR')} un em lotes vencidos com saldo
                    </p>

                    <div className="h-28 w-full mt-3 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Vencidos', lotes: perdasValidade.expiredStockBatchesCount, fill: '#ef4444' },
                            { name: 'Venc. 60d', lotes: perdasValidade.expiring60dBatchesCount, fill: '#f59e0b' }
                          ]}
                          layout="vertical"
                          margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" width={62} tick={{ fontSize: 9, fontWeight: 700, fill: '#475569' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [`${Number(val || 0)} lotes`, 'Lotes']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="lotes" radius={[0, 6, 6, 0]} maxBarSize={20}>
                            <Cell fill="#ef4444" />
                            <Cell fill="#f59e0b" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Quantidade e valor financeiro dos lotes com saldo maior que zero e data de validade anterior a hoje (ignorando Indeterminada).
                  </p>
                </div>
              </div>

              {/* 4.3 Lotes que Vencem nos Próximos 60 Dias */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-cyan-600" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Vencendo nos Próximos 60 Dias
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Lotes Vencendo nos Próximos 60 Dias',
                          indicatorSubtitle: 'Monitoramento preventivo de lotes com vencimento próximo',
                          groupName: 'Grupo 4 • Perdas e Validade',
                          explanation: 'Quantidade e valor dos lotes com saldo positivo que vencem nos próximos 60 dias corridos (ignorando validade Indeterminada).',
                          kpis: [
                            { label: 'Lotes Vencendo (60d)', value: `${perdasValidade.expiring60dBatchesCount} lotes`, tone: 'amber' },
                            { label: 'Valor Exposto (60d)', value: formatCurrency(perdasValidade.expiring60dValue), tone: 'blue' },
                            { label: 'Unidades Expostas (60d)', value: `${perdasValidade.expiring60dUnits.toLocaleString('pt-BR')} un`, tone: 'indigo' }
                          ],
                          chart: {
                            type: 'verticalBar',
                            title: 'Unidades Expostas por Faixa de Criticidade de Validade',
                            valueFormatter: 'integer',
                            data: [
                              { label: 'Vencendo em 60d (Un)', value: perdasValidade.expiring60dUnits, color: '#f59e0b' },
                              { label: 'Vencidos Hoje (Un)', value: perdasValidade.expiredStockUnits, color: '#ef4444' },
                              { label: 'Baixados no Período (Un)', value: perdasValidade.lossAndExpiredExitsUnits, color: '#6366f1' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-3xl font-black text-slate-900 tracking-tight">
                        {perdasValidade.expiring60dBatchesCount}{' '}
                        <span className="text-sm font-bold text-slate-400">lotes</span>
                      </p>
                      <span className="text-sm font-black text-blue-700">
                        ({formatCurrency(perdasValidade.expiring60dValue)})
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-slate-600 mt-1">
                      {perdasValidade.expiring60dUnits.toLocaleString('pt-BR')} un com vencimento em até 60 dias
                    </p>

                    <div className="h-28 w-full mt-3 pt-2 border-t border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Venc. 60d', valor: Number(perdasValidade.expiring60dValue.toFixed(2)), fill: '#f59e0b' },
                            { name: 'Vencidos', valor: Number(perdasValidade.expiredStockValue.toFixed(2)), fill: '#ef4444' },
                            { name: 'Baixados', valor: Number(perdasValidade.lossAndExpiredExitsValue.toFixed(2)), fill: '#6366f1' }
                          ]}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Valor (R$)']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={22}>
                            <Cell fill="#f59e0b" />
                            <Cell fill="#ef4444" />
                            <Cell fill="#6366f1" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-2 border-t border-slate-100">
                    Quantidade e valor dos lotes com saldo positivo que vencem nos próximos 60 dias corridos (ignorando validade Indeterminada).
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Table of Expiry / Loss Write-offs inside Grupo 4 */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden relative">
              <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-amber-500 to-blue-700" />
              <div className="p-5 sm:p-6 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-rose-600" />
                      Relação de Baixas por Vencimento e Perda no Período (
                      {donationsMetrics.expiryWriteOffExits.length})
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">
                      Itens efetivamente baixados do estoque por validade vencida ou avaria no período selecionado
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                      Total Baixado: {donationsMetrics.totalExpiredExitUnits.toLocaleString('pt-BR')} un (
                      {formatCurrency(donationsMetrics.totalExpiredExitValue)})
                    </span>
                    {renderIndicatorActions({
                      indicatorTitle: 'Relação de Baixas por Vencimento e Perda no Período',
                      indicatorSubtitle: 'Itens efetivamente baixados do estoque por validade vencida ou avaria',
                      groupName: 'Grupo 4 • Perdas e Validade',
                      explanation: 'Lista detalhada das saídas registradas com motivo vencido ou perda e gráfico dos maiores valores baixados.',
                      kpis: [
                        { label: 'Total de Registros', value: `${donationsMetrics.expiryWriteOffExits.length} baixas`, tone: 'rose' },
                        { label: 'Unidades Baixadas', value: `${donationsMetrics.totalExpiredExitUnits.toLocaleString('pt-BR')} un`, tone: 'amber' },
                        { label: 'Valor Total Baixado', value: formatCurrency(donationsMetrics.totalExpiredExitValue), tone: 'slate' }
                      ],
                      chart: {
                        type: 'horizontalBar',
                        title: 'Principais Materiais Baixados por Vencimento ou Perda (R$)',
                        valueFormatter: 'currency',
                        data: donationsMetrics.expiryWriteOffExits
                          .slice(0, 10)
                          .map(r => ({
                            label: r.tx.item_name,
                            value: r.finValue,
                            color: r.tx.exitReason === 'perda' ? '#f59e0b' : '#ef4444'
                          }))
                      },
                      table: {
                        title: 'Detalhamento das Baixas no Período',
                        headers: ['Data', 'Tipo', 'Material', 'Categoria', 'Lote', 'Qtd.', 'Valor'],
                        rows: donationsMetrics.expiryWriteOffExits.map(r => [
                          formatDateBR(r.tx.date),
                          r.reasonType,
                          r.tx.item_name,
                          r.category,
                          r.tx.batch_number || 'S/L',
                          `-${r.qty.toLocaleString('pt-BR')} un`,
                          formatCurrency(r.finValue)
                        ])
                      }
                    })}
                  </div>
                </div>

                {donationsMetrics.expiryWriteOffExits.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Data da Baixa</th>
                          <th className="py-3 px-4">Tipo de Baixa</th>
                          <th className="py-3 px-4">Material</th>
                          <th className="py-3 px-4">Categoria</th>
                          <th className="py-3 px-4">Lote / Validade</th>
                          <th className="py-3 px-4">Motivo / Justificativa</th>
                          <th className="py-3 px-4">Responsável</th>
                          <th className="py-3 px-4 text-right">Qtd. Baixada</th>
                          <th className="py-3 px-4 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {donationsMetrics.expiryWriteOffExits.map(row => (
                          <tr key={row.tx.id} className="hover:bg-rose-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                              {formatDateBR(row.tx.date)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                                  row.tx.exitReason === 'perda'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-rose-100 text-rose-700 border-rose-200'
                                }`}
                              >
                                {row.reasonType}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">{row.tx.item_name}</td>
                            <td className="py-3 px-4">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                                style={{ backgroundColor: getCategoryColor(row.category) }}
                              >
                                {row.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                              Lote: <strong className="text-slate-800">{row.tx.batch_number || 'S/L'}</strong> • Val:{' '}
                              {row.tx.expiry_date ? formatDateBR(row.tx.expiry_date) : '—'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium">
                              {row.justification}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                              {row.tx.responsible || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-black text-rose-700 whitespace-nowrap">
                              -{row.qty.toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-800 whitespace-nowrap">
                              {formatCurrency(row.finValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-6 text-center bg-slate-50 rounded-2xl border border-slate-100 text-xs font-semibold text-slate-400">
                    Nenhuma baixa por vencimento ou perda registrada no período selecionado.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PAINEL DE CURVA ABC POR VALOR CONSUMIDO NO PERÍODO */}
          <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-900" />
            <div className="p-6 sm:p-7 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 text-white shadow-sm">
                    <Award size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      Painel de Curva ABC por Valor Consumido no Período
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Classificação de Pareto dos materiais consumidos: Classe A (80% do valor), Classe B (15% seguintes) e Classe C (5% finais)
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                    Total Consumido: {formatCurrency(curvaABC.totalAbcValue)}
                  </span>
                  {renderIndicatorActions({
                    indicatorTitle: 'Painel de Curva ABC por Valor Consumido no Período',
                    indicatorSubtitle: 'Classificação de Pareto: Classe A (80%), Classe B (15%) e Classe C (5%)',
                    groupName: 'Curva ABC de Consumo',
                    explanation:
                      'Classifica os materiais consumidos por impacto financeiro decrescente, destacando a concentração de Pareto e os principais itens da Classe A.',
                    kpis: [
                      { label: 'Total Consumido (ABC)', value: formatCurrency(curvaABC.totalAbcValue), tone: 'blue' },
                      { label: 'Classe A (80%)', value: formatCurrency(curvaABC.classA.value), subvalue: `${curvaABC.classA.count} itens (${formatDecimal(curvaABC.classA.pctValue, 1)}%)`, tone: 'indigo' },
                      { label: 'Classe B (15%)', value: formatCurrency(curvaABC.classB.value), subvalue: `${curvaABC.classB.count} itens (${formatDecimal(curvaABC.classB.pctValue, 1)}%)`, tone: 'emerald' },
                      { label: 'Classe C (5%)', value: formatCurrency(curvaABC.classC.value), subvalue: `${curvaABC.classC.count} itens (${formatDecimal(curvaABC.classC.pctValue, 1)}%)`, tone: 'slate' }
                    ],
                    chart: {
                      type: 'pareto',
                      title: 'Curva de Pareto ABC — Principais Materiais Consumidos (R$ e % Acumulado)',
                      subtitle: 'Barras indicam o valor consumido e a linha âmbar indica o percentual acumulado de Pareto',
                      valueFormatter: 'currency',
                      secondaryFormatter: 'percent',
                      seriesALabel: 'Valor Consumido (R$)',
                      seriesBLabel: '% Acumulado',
                      data: curvaABC.top10AbcItems.map(item => ({
                        label: item.name,
                        value: item.netValue,
                        secondaryValue: Number(item.cumPct.toFixed(1)),
                        color: item.abcClass === 'A' ? '#1d4ed8' : item.abcClass === 'B' ? '#4f46e5' : '#64748b'
                      }))
                    },
                    table: {
                      title: 'Maiores Materiais da Classe A no Período',
                      headers: ['Posição', 'Material', 'Categoria', 'Qtd. Consumida', 'Valor Consumido', '% do Total'],
                      rows: curvaABC.top5ClassA.map((it, idx) => [
                        `${idx + 1}º`,
                        it.name,
                        it.category,
                        `${it.netUnits.toLocaleString('pt-BR')} un`,
                        formatCurrency(it.netValue),
                        `${formatDecimal(it.sharePct, 2)}%`
                      ])
                    }
                  })}
                </div>
              </div>

              {/* ABC Visual Charts: Pareto Curve + Class Distribution */}
              {curvaABC.top10AbcItems.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2 p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Gráfico de Pareto (Top Materiais • R$ e % Acumulado)
                      </span>
                      <span className="text-[11px] font-bold text-blue-700">
                        Barras: Valor (R$) • Linha: % Acumulado
                      </span>
                    </div>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={curvaABC.top10AbcItems.map(it => ({
                            name: it.name.length > 14 ? `${it.name.slice(0, 14)}…` : it.name,
                            fullName: it.name,
                            valor: Number(it.netValue.toFixed(2)),
                            acumulado: Number(it.cumPct.toFixed(1)),
                            classe: it.abcClass
                          }))}
                          margin={{ top: 10, right: 12, left: 0, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }}
                            angle={-18}
                            textAnchor="end"
                            height={48}
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                            tickFormatter={v => `R$${Number(v).toLocaleString('pt-BR')}`}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 100]}
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#d97706' }}
                            tickFormatter={v => `${v}%`}
                          />
                          <Tooltip
                            formatter={(val: any, name: string) => {
                              if (name === 'acumulado') return [`${formatDecimal(Number(val) || 0, 1)}%`, '% Acumulado'];
                              return [formatCurrency(Number(val) || 0), 'Valor Consumido'];
                            }}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                            contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}
                          />
                          <Legend
                            formatter={val =>
                              val === 'acumulado' ? '% Acumulado (Pareto)' : 'Valor Consumido (R$)'
                            }
                            wrapperStyle={{ fontSize: '11px', fontWeight: 700 }}
                          />
                          <Bar yAxisId="left" dataKey="valor" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={34} />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="acumulado"
                            stroke="#f59e0b"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#f59e0b' }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider block mb-1">
                        Comparativo Classes A, B e C
                      </span>
                      <p className="text-[11px] text-slate-500 font-medium mb-2">
                        Proporção do Valor Financeiro vs. Quantidade de Itens
                      </p>
                    </div>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            {
                              classe: 'Classe A',
                              pctValor: Number(curvaABC.classA.pctValue.toFixed(1)),
                              pctItens: Number(curvaABC.classA.pctItems.toFixed(1))
                            },
                            {
                              classe: 'Classe B',
                              pctValor: Number(curvaABC.classB.pctValue.toFixed(1)),
                              pctItens: Number(curvaABC.classB.pctItems.toFixed(1))
                            },
                            {
                              classe: 'Classe C',
                              pctValor: Number(curvaABC.classC.pctValue.toFixed(1)),
                              pctItens: Number(curvaABC.classC.pctItems.toFixed(1))
                            }
                          ]}
                          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="classe" tick={{ fontSize: 10, fontWeight: 800, fill: '#334155' }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `${v}%`} />
                          <Tooltip
                            formatter={(val: any, name: string) => [
                              `${formatDecimal(Number(val) || 0, 1)}%`,
                              name === 'pctValor' ? '% do Valor Total' : '% dos Itens'
                            ]}
                            contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}
                          />
                          <Legend
                            formatter={val => (val === 'pctValor' ? '% do Valor (R$)' : '% dos Materiais')}
                            wrapperStyle={{ fontSize: '10px', fontWeight: 700 }}
                          />
                          <Bar dataKey="pctValor" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={24} />
                          <Bar dataKey="pctItens" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ABC Class Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Classe A */}
                <div className="p-5 rounded-2xl bg-gradient-to-b from-blue-50/60 to-white border border-blue-200/80 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-700 text-white text-xs font-black uppercase tracking-wider">
                      Classe A • 80% do Valor
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-blue-700">
                        {formatDecimal(curvaABC.classA.pctValue, 1)}% efetivo
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Curva ABC — Classe A (80% do Valor)',
                          indicatorSubtitle: 'Materiais de maior impacto financeiro no período',
                          groupName: 'Curva ABC de Consumo',
                          explanation: 'Reúne os materiais de maior impacto financeiro que somam os primeiros 80% do valor consumido.',
                          kpis: [
                            { label: 'Valor Consumido (Classe A)', value: formatCurrency(curvaABC.classA.value), tone: 'blue' },
                            { label: '% do Valor Total', value: `${formatDecimal(curvaABC.classA.pctValue, 1)}%`, tone: 'indigo' },
                            { label: 'Qtd. de Materiais', value: `${curvaABC.classA.count} itens (${formatDecimal(curvaABC.classA.pctItems, 1)}%)`, tone: 'slate' }
                          ],
                          chart: {
                            type: 'horizontalBar',
                            title: 'Principais Materiais da Classe A (R$)',
                            valueFormatter: 'currency',
                            data: curvaABC.top5ClassA.map(it => ({
                              label: it.name,
                              value: it.netValue,
                              color: '#1d4ed8'
                            }))
                          }
                        },
                        true
                      )}
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-2">
                    {formatCurrency(curvaABC.classA.value)}
                  </p>
                  <p className="text-xs font-extrabold text-slate-700 mt-1">
                    {curvaABC.classA.count} materiais ({formatDecimal(curvaABC.classA.pctItems, 1)}% dos itens consumidos)
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-2 pt-2 border-t border-blue-100">
                    Reúne os materiais de maior impacto financeiro que somam os primeiros 80% do valor consumido.
                  </p>
                </div>

                {/* Classe B */}
                <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/90 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-black uppercase tracking-wider">
                      Classe B • 15% Seguintes
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-indigo-700">
                        {formatDecimal(curvaABC.classB.pctValue, 1)}% efetivo
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Curva ABC — Classe B (15% Seguintes)',
                          indicatorSubtitle: 'Materiais de impacto financeiro intermediário (80% a 95%)',
                          groupName: 'Curva ABC de Consumo',
                          explanation: 'Reúne os materiais de importância intermediária que compõem os 15% seguintes do consumo (80% a 95%).',
                          kpis: [
                            { label: 'Valor Consumido (Classe B)', value: formatCurrency(curvaABC.classB.value), tone: 'indigo' },
                            { label: '% do Valor Total', value: `${formatDecimal(curvaABC.classB.pctValue, 1)}%`, tone: 'blue' },
                            { label: 'Qtd. de Materiais', value: `${curvaABC.classB.count} itens (${formatDecimal(curvaABC.classB.pctItems, 1)}%)`, tone: 'slate' }
                          ],
                          chart: {
                            type: 'donut',
                            title: 'Participação da Classe B no Valor Total Consumido',
                            valueFormatter: 'currency',
                            data: [
                              { label: 'Classe B (R$)', value: curvaABC.classB.value, color: '#4f46e5' },
                              { label: 'Demais Classes A + C (R$)', value: Math.max(0, curvaABC.totalAbcValue - curvaABC.classB.value), color: '#cbd5e1' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-2">
                    {formatCurrency(curvaABC.classB.value)}
                  </p>
                  <p className="text-xs font-extrabold text-slate-700 mt-1">
                    {curvaABC.classB.count} materiais ({formatDecimal(curvaABC.classB.pctItems, 1)}% dos itens consumidos)
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-2 pt-2 border-t border-slate-200/80">
                    Reúne os materiais de importância intermediária que compõem os 15% seguintes do consumo (80% a 95%).
                  </p>
                </div>

                {/* Classe C */}
                <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/90 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-700 text-white text-xs font-black uppercase tracking-wider">
                      Classe C • 5% Finais
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-700">
                        {formatDecimal(curvaABC.classC.pctValue, 1)}% efetivo
                      </span>
                      {renderIndicatorActions(
                        {
                          indicatorTitle: 'Curva ABC — Classe C (5% Finais)',
                          indicatorSubtitle: 'Materiais de baixo custo individual acumulado (95% a 100%)',
                          groupName: 'Curva ABC de Consumo',
                          explanation: 'Reúne a grande variedade de materiais de baixo custo individual que somam os 5% finais do valor.',
                          kpis: [
                            { label: 'Valor Consumido (Classe C)', value: formatCurrency(curvaABC.classC.value), tone: 'slate' },
                            { label: '% do Valor Total', value: `${formatDecimal(curvaABC.classC.pctValue, 1)}%`, tone: 'blue' },
                            { label: 'Qtd. de Materiais', value: `${curvaABC.classC.count} itens (${formatDecimal(curvaABC.classC.pctItems, 1)}%)`, tone: 'indigo' }
                          ],
                          chart: {
                            type: 'donut',
                            title: 'Participação da Classe C em Quantidade de Itens',
                            valueFormatter: 'integer',
                            data: [
                              { label: 'Itens Classe C', value: curvaABC.classC.count, color: '#334155' },
                              { label: 'Itens Classes A + B', value: curvaABC.classA.count + curvaABC.classB.count, color: '#3b82f6' }
                            ]
                          }
                        },
                        true
                      )}
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-2">
                    {formatCurrency(curvaABC.classC.value)}
                  </p>
                  <p className="text-xs font-extrabold text-slate-700 mt-1">
                    {curvaABC.classC.count} materiais ({formatDecimal(curvaABC.classC.pctItems, 1)}% dos itens consumidos)
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-2 pt-2 border-t border-slate-200/80">
                    Reúne a grande variedade de materiais de baixo custo individual que somam os 5% finais do valor.
                  </p>
                </div>
              </div>

              {/* Top 5 Materials of Class A */}
              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <BarChart3 size={16} className="text-blue-600" />
                  5 Maiores Materiais da Classe A no Período
                </h4>

                {curvaABC.top5ClassA.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Posição</th>
                          <th className="py-3 px-4">Material (Classe A)</th>
                          <th className="py-3 px-4">Categoria</th>
                          <th className="py-3 px-4 text-right">Qtd. Consumida</th>
                          <th className="py-3 px-4 text-right">Valor Consumido</th>
                          <th className="py-3 px-4 text-right">% do Valor Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {curvaABC.top5ClassA.map((item, idx) => (
                          <tr key={item.name} className="hover:bg-blue-50/30 transition-colors">
                            <td className="py-3 px-4">
                              <span className="w-6 h-6 rounded-lg bg-blue-700 text-white text-[11px] font-black inline-flex items-center justify-center">
                                {idx + 1}º
                              </span>
                            </td>
                            <td className="py-3 px-4 font-black text-slate-900">{item.name}</td>
                            <td className="py-3 px-4">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                                style={{ backgroundColor: getCategoryColor(item.category) }}
                              >
                                {item.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-700 whitespace-nowrap">
                              {item.netUnits.toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-3 px-4 text-right font-black text-blue-700 whitespace-nowrap">
                              {formatCurrency(item.netValue)}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-slate-600 whitespace-nowrap">
                              {formatDecimal(item.sharePct, 2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 text-center text-xs font-semibold text-slate-400">
                    Nenhum consumo com valor financeiro registrado no período selecionado para cálculo da Curva ABC.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Methodological Note */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-4 flex items-start gap-3 text-xs text-slate-600">
            <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">
              <strong className="font-black text-slate-800">Nota técnica sobre reconstrução de saldo:</strong> O estoque no início e no fim do período são estimados retrospectivamente a partir do saldo atual e das movimentações registradas no sistema. Ajustes manuais diretos de quantidade no cadastro de itens não geram movimentação no histórico e, portanto, não alteram o cálculo retrospectivo.
            </p>
          </div>
        </div>
      )}

      {/* ===================================================================
          ABA 2: SITUAÇÃO DE SALA (Posição atual do estoque, independente do período)
         =================================================================== */}
      {activeTab === 'situacao_sala' && (
        <div className="space-y-6">
          {/* Room Analytical Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Valor e Unidades por Sala */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
              <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Valor em Estoque por Sala ({inventoryLocation})
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Comparativo financeiro e físico dos lotes ativos alocados em cada sala
                    </p>
                  </div>
                  {renderIndicatorActions({
                    indicatorTitle: `Valor em Estoque por Sala (${inventoryLocation})`,
                    indicatorSubtitle: 'Distribuição patrimonial e física entre as salas de armazenamento',
                    groupName: 'Situação de Sala',
                    explanation: 'Soma do valor financeiro e das unidades em estoque agrupadas pelo campo sala dos lotes com saldo maior que zero.',
                    kpis: [
                      { label: 'Salas Ativas', value: `${roomMetrics.roomSummaries.length} salas`, tone: 'blue' },
                      { label: 'Valor Total Alocado', value: formatCurrency(roomMetrics.roomSummaries.reduce((a, b) => a + b.stockValue, 0)), tone: 'indigo' },
                      { label: 'Total de Unidades', value: `${roomMetrics.roomSummaries.reduce((a, b) => a + b.stockUnits, 0).toLocaleString('pt-BR')} un`, tone: 'emerald' }
                    ],
                    chart: {
                      type: 'horizontalBar',
                      title: 'Ranking de Valor Financeiro por Sala (R$)',
                      valueFormatter: 'currency',
                      data: roomMetrics.roomSummaries.map(r => ({
                        label: r.room,
                        value: r.stockValue,
                        color: r.status === 'Crítico' ? '#ef4444' : r.status === 'Atenção' ? '#f59e0b' : '#2563eb'
                      }))
                    }
                  })}
                </div>

                {roomMetrics.roomSummaries.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={roomMetrics.roomSummaries.map(r => ({
                          name: r.room.length > 18 ? `${r.room.slice(0, 18)}…` : r.room,
                          fullName: r.room,
                          valor: Number(r.stockValue.toFixed(2)),
                          unidades: r.stockUnits
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 24, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `R$${Number(v).toLocaleString('pt-BR')}`} />
                        <YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} />
                        <Tooltip
                          formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Valor em Estoque']}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                          contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}
                        />
                        <Bar dataKey="valor" fill="#2563eb" radius={[0, 6, 6, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs font-bold text-slate-400">
                    Nenhuma sala com saldo positivo encontrada.
                  </div>
                )}
              </div>
            </div>

            {/* Chart 2: Lotes e Criticidade de Validade por Sala */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-emerald-600" />
              <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Lotes e Validade Crítica por Sala
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Total de lotes ativos comparados aos lotes vencidos e vencendo em 60 dias
                    </p>
                  </div>
                  {renderIndicatorActions({
                    indicatorTitle: `Lotes e Validade Crítica por Sala (${inventoryLocation})`,
                    indicatorSubtitle: 'Monitoramento de lotes regulares, vencendo em 60 dias e vencidos por sala',
                    groupName: 'Situação de Sala',
                    explanation: 'Compara a quantidade total de lotes de cada sala com os lotes vencidos (Crítico) e que vencem em até 60 dias (Atenção).',
                    kpis: [
                      { label: 'Total de Lotes', value: `${roomMetrics.roomSummaries.reduce((a, b) => a + b.batchesCount, 0)} lotes`, tone: 'blue' },
                      { label: 'Lotes Vencidos', value: `${roomMetrics.roomSummaries.reduce((a, b) => a + b.expiredBatches, 0)} lotes`, tone: 'rose' },
                      { label: 'Vencem em 60 Dias', value: `${roomMetrics.roomSummaries.reduce((a, b) => a + b.expiring60dBatches, 0)} lotes`, tone: 'amber' }
                    ],
                    chart: {
                      type: 'groupedBar',
                      title: 'Lotes Totais vs. Lotes Críticos (Vencidos + 60d) por Sala',
                      valueFormatter: 'integer',
                      seriesALabel: 'Total de Lotes',
                      seriesBLabel: 'Lotes Críticos (Venc. + 60d)',
                      data: roomMetrics.roomSummaries.map(r => ({
                        label: r.room,
                        value: r.batchesCount,
                        secondaryValue: r.expiredBatches + r.expiring60dBatches,
                        color: '#2563eb',
                        secondaryColor: '#ef4444'
                      }))
                    }
                  })}
                </div>

                {roomMetrics.roomSummaries.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={roomMetrics.roomSummaries.map(r => ({
                          name: r.room.length > 14 ? `${r.room.slice(0, 14)}…` : r.room,
                          fullName: r.room,
                          lotes: r.batchesCount,
                          vencidos: r.expiredBatches,
                          vencendo60d: r.expiring60dBatches
                        }))}
                        margin={{ top: 10, right: 16, left: -12, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} angle={-15} textAnchor="end" height={45} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                        <Tooltip
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                          contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                        <Bar dataKey="lotes" name="Total de Lotes" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={26} />
                        <Bar dataKey="vencendo60d" name="Vencem em 60d" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={26} />
                        <Bar dataKey="vencidos" name="Vencidos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs font-bold text-slate-400">
                    Nenhum lote ativo encontrado.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
            <div className="p-6 sm:p-7 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 text-white shadow-sm">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                        Situação Atual por Sala de Estoque ({inventoryLocation})
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                        Posição Atual em Tempo Real
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Lotes com saldo maior que zero agrupados por sala. Clique em qualquer linha para expandir o resumo por categoria e os lotes críticos.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                    {roomMetrics.roomSummaries.length}{' '}
                    {roomMetrics.roomSummaries.length === 1 ? 'sala ativa' : 'salas ativas'}
                  </span>
                  {renderIndicatorActions({
                    indicatorTitle: `Relatório Geral de Situação por Sala (${inventoryLocation})`,
                    indicatorSubtitle: 'Posição física, financeira e de validade por sala de armazenamento',
                    groupName: 'Situação de Sala',
                    explanation: 'Tabela consolidada por sala com status de validade (Regular, Atenção, Crítico), tipos de material, lotes, unidades e valor.',
                    kpis: [
                      { label: 'Salas Mapeadas', value: `${roomMetrics.roomSummaries.length} salas`, tone: 'blue' },
                      { label: 'Salas Críticas', value: `${roomMetrics.roomSummaries.filter(r => r.status === 'Crítico').length} salas`, tone: 'rose' },
                      { label: 'Salas em Atenção', value: `${roomMetrics.roomSummaries.filter(r => r.status === 'Atenção').length} salas`, tone: 'amber' }
                    ],
                    chart: {
                      type: 'verticalBar',
                      title: 'Valor em Estoque por Sala de Armazenamento (R$)',
                      valueFormatter: 'currency',
                      data: roomMetrics.roomSummaries.map(r => ({
                        label: r.room,
                        value: r.stockValue,
                        color: r.status === 'Crítico' ? '#ef4444' : r.status === 'Atenção' ? '#f59e0b' : '#2563eb'
                      }))
                    },
                    table: {
                      title: 'Tabela de Situação por Sala',
                      headers: ['Sala', 'Situação', 'Tipos', 'Lotes', 'Unidades', 'Valor (R$)', 'Vencidos', 'Venc. 60d'],
                      rows: roomMetrics.roomSummaries.map(r => [
                        r.room,
                        r.status,
                        r.distinctItemsCount.toLocaleString('pt-BR'),
                        r.batchesCount.toLocaleString('pt-BR'),
                        `${r.stockUnits.toLocaleString('pt-BR')} un`,
                        formatCurrency(r.stockValue),
                        String(r.expiredBatches),
                        String(r.expiring60dBatches)
                      ])
                    }
                  })}
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200/90">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4">Sala</th>
                      <th className="py-3.5 px-4">Situação</th>
                      <th className="py-3.5 px-4 text-right">Tipos de Material</th>
                      <th className="py-3.5 px-4 text-right">Qtd. de Lotes</th>
                      <th className="py-3.5 px-4 text-right">Total de Unidades</th>
                      <th className="py-3.5 px-4 text-right">Valor em Estoque</th>
                      <th className="py-3.5 px-4 text-right">Lotes Vencidos</th>
                      <th className="py-3.5 px-4 text-right">Vencem em 60 Dias</th>
                      <th className="py-3.5 px-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {roomMetrics.roomSummaries.map(r => {
                      const isExpanded = expandedRoom === r.room;
                      const badgeStyles =
                        r.status === 'Crítico'
                          ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : r.status === 'Atenção'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-emerald-100 text-emerald-700 border-emerald-200';

                      return (
                        <React.Fragment key={r.room}>
                          <tr
                            onClick={() =>
                              setExpandedRoom(prev => (prev === r.room ? null : r.room))
                            }
                            className={`transition-colors cursor-pointer ${
                              isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50/90'
                            }`}
                          >
                            <td className="py-3.5 px-4 font-black text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown size={15} className="text-blue-600 shrink-0" />
                                ) : (
                                  <ChevronRight size={15} className="text-slate-400 shrink-0" />
                                )}
                                <span>{r.room}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black border ${badgeStyles}`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-extrabold text-slate-800 whitespace-nowrap">
                              {r.distinctItemsCount.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-3.5 px-4 text-right font-extrabold text-slate-800 whitespace-nowrap">
                              {r.batchesCount.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-3.5 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                              {r.stockUnits.toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-3.5 px-4 text-right font-black text-blue-700 whitespace-nowrap">
                              {formatCurrency(r.stockValue)}
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <span
                                className={`font-black ${
                                  r.expiredBatches > 0 ? 'text-rose-600' : 'text-slate-400'
                                }`}
                              >
                                {r.expiredBatches}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <span
                                className={`font-black ${
                                  r.expiring60dBatches > 0 ? 'text-amber-600' : 'text-slate-400'
                                }`}
                              >
                                {r.expiring60dBatches}
                              </span>
                            </td>
                            <td
                              className="py-3.5 px-4 text-center whitespace-nowrap"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => onOpenRoomMap?.(r.room)}
                                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white text-[11px] font-extrabold shadow-xs transition-all cursor-pointer"
                              >
                                Mapa da sala
                              </button>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={9} className="p-5 border-b border-slate-200/80">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                  {/* Left Column: Resumo por Categoria */}
                                  <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3 shadow-2xs">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                        <Layers size={14} className="text-blue-600" />
                                        Resumo por Categoria ({r.categoriesSummary.length})
                                      </h4>
                                      <span className="text-[11px] font-bold text-slate-400">
                                        Tipos e Unidades na Sala
                                      </span>
                                    </div>

                                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                      {r.categoriesSummary.map(cat => (
                                        <div
                                          key={cat.category}
                                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <span
                                              className="w-3 h-3 rounded-full shrink-0"
                                              style={{
                                                backgroundColor: getCategoryColor(cat.category)
                                              }}
                                            />
                                            <span className="text-xs font-extrabold text-slate-800 truncate">
                                              {cat.category}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0 text-xs">
                                            <span className="font-bold text-slate-500">
                                              {cat.typesCount}{' '}
                                              {cat.typesCount === 1 ? 'tipo' : 'tipos'}
                                            </span>
                                            <span className="font-black text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                                              {cat.units.toLocaleString('pt-BR')} un
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Right Column: Lotes Vencidos ou Próximos do Vencimento (60d) */}
                                  <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3 shadow-2xs">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                        <AlertTriangle size={14} className="text-amber-600" />
                                        Lotes Vencidos ou Vencendo em 60 Dias (
                                        {r.criticalBatchesList.length})
                                      </h4>
                                      <span className="text-[11px] font-bold text-slate-400">
                                        Validade Crítica na Sala
                                      </span>
                                    </div>

                                    {r.criticalBatchesList.length > 0 ? (
                                      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-xl border border-slate-100">
                                        <table className="w-full text-left border-collapse">
                                          <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                              <th className="py-2 px-3">Material</th>
                                              <th className="py-2 px-3">Lote</th>
                                              <th className="py-2 px-3 text-right">Quantidade</th>
                                              <th className="py-2 px-3 text-right">Validade</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 text-xs">
                                            {r.criticalBatchesList.map(b => (
                                              <tr key={b.id} className="hover:bg-slate-50">
                                                <td className="py-2 px-3 font-bold text-slate-900">
                                                  {b.name}
                                                </td>
                                                <td className="py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">
                                                  {b.batch_number}
                                                </td>
                                                <td className="py-2 px-3 text-right font-black text-slate-800 whitespace-nowrap">
                                                  {b.quantity.toLocaleString('pt-BR')} {b.unit_measure}
                                                </td>
                                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                                  <span
                                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black ${
                                                      b.isExpired
                                                        ? 'bg-rose-100 text-rose-700'
                                                        : 'bg-amber-100 text-amber-800'
                                                    }`}
                                                  >
                                                    {formatDateBR(b.expiry_date)} (
                                                    {b.isExpired
                                                      ? 'Vencido'
                                                      : `${b.diffDays}d`}
                                                    )
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      <div className="py-10 text-center bg-emerald-50/40 rounded-xl border border-emerald-100">
                                        <CheckCircle
                                          size={22}
                                          className="mx-auto text-emerald-600 mb-1.5"
                                        />
                                        <p className="text-xs font-extrabold text-emerald-800">
                                          Nenhum lote vencido ou vencendo nos próximos 60 dias nesta sala.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {roomMetrics.roomSummaries.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                          Nenhum lote com saldo maior que zero encontrado para {inventoryLocation}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          ABA 3: DISPENSAÇÃO POR TIPO
         =================================================================== */}
      {activeTab === 'dispensacao_tipo' && (
        <div className="space-y-6">
          {/* Summary KPI Cards with Embedded Charts and Print/PDF */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-indigo-700" />
              <div className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Volume Total Dispensado
                    </p>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                      {dispensationByTypeMetrics.totalUnits.toLocaleString('pt-BR')}{' '}
                      <span className="text-xs font-bold text-slate-400">un</span>
                    </h3>
                  </div>
                  {renderIndicatorActions(
                    {
                      indicatorTitle: 'Volume Total Dispensado por Categoria',
                      indicatorSubtitle: 'Unidades físicas dispensadas no período por classificação de material',
                      groupName: 'Dispensação por Tipo',
                      explanation: 'Total de unidades saídas do estoque no período distribuídas entre as categorias movimentadas.',
                      kpis: [
                        { label: 'Volume Total Dispensado', value: `${dispensationByTypeMetrics.totalUnits.toLocaleString('pt-BR')} un`, tone: 'blue' },
                        { label: 'Registros de Saída', value: `${dispensationByTypeMetrics.totalRecords} saídas`, tone: 'indigo' }
                      ],
                      chart: {
                        type: 'horizontalBar',
                        title: 'Unidades Dispensadas por Categoria',
                        valueFormatter: 'integer',
                        data: dispensationByTypeMetrics.categoriesList.map(c => ({
                          label: c.category,
                          value: c.units,
                          color: getCategoryColor(c.category)
                        }))
                      }
                    },
                    true
                  )}
                </div>
                <p className="text-xs font-bold text-blue-700">
                  {dispensationByTypeMetrics.totalRecords} registros de saída no período
                </p>
                <div className="h-24 w-full pt-2 border-t border-slate-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dispensationByTypeMetrics.categoriesList.slice(0, 5).map(c => ({
                        name: c.category.length > 10 ? `${c.category.slice(0, 10)}…` : c.category,
                        un: c.units,
                        color: getCategoryColor(c.category)
                      }))}
                      margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Dispensado']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                      <Bar dataKey="un" radius={[4, 4, 0, 0]} maxBarSize={22}>
                        {dispensationByTypeMetrics.categoriesList.slice(0, 5).map((c, i) => (
                          <Cell key={i} fill={getCategoryColor(c.category)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-blue-800" />
              <div className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Custo Total de Dispensação
                    </p>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                      {formatCurrency(dispensationByTypeMetrics.totalValue)}
                    </h3>
                  </div>
                  {renderIndicatorActions(
                    {
                      indicatorTitle: 'Custo Total de Dispensação por Categoria',
                      indicatorSubtitle: 'Impacto financeiro das dispensações no período analisado',
                      groupName: 'Dispensação por Tipo',
                      explanation: 'Valor total calculado pelo custo unitário dos itens dispensados em cada categoria.',
                      kpis: [
                        { label: 'Custo Total Dispensado', value: formatCurrency(dispensationByTypeMetrics.totalValue), tone: 'indigo' },
                        { label: 'Unidades Dispensadas', value: `${dispensationByTypeMetrics.totalUnits.toLocaleString('pt-BR')} un`, tone: 'blue' }
                      ],
                      chart: {
                        type: 'horizontalBar',
                        title: 'Valor Dispensado por Categoria (R$)',
                        valueFormatter: 'currency',
                        data: dispensationByTypeMetrics.categoriesList
                          .slice()
                          .sort((a, b) => b.value - a.value)
                          .map(c => ({
                            label: c.category,
                            value: c.value,
                            color: getCategoryColor(c.category)
                          }))
                      }
                    },
                    true
                  )}
                </div>
                <p className="text-xs font-bold text-slate-500">
                  Valor calculado pelo custo unitário dos itens
                </p>
                <div className="h-24 w-full pt-2 border-t border-slate-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dispensationByTypeMetrics.categoriesList
                        .slice()
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 5)
                        .map(c => ({
                          name: c.category.length > 10 ? `${c.category.slice(0, 10)}…` : c.category,
                          valor: Number(c.value.toFixed(2))
                        }))}
                      margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Custo (R$)']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                      <Bar dataKey="valor" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-cyan-600" />
              <div className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Categorias Movimentadas
                    </p>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                      {dispensationByTypeMetrics.categoriesList.length}{' '}
                      <span className="text-xs font-bold text-slate-400">tipos</span>
                    </h3>
                  </div>
                  {renderIndicatorActions(
                    {
                      indicatorTitle: 'Participação Percentual das Categorias Movimentadas',
                      indicatorSubtitle: 'Distribuição proporcional do volume dispensado entre categorias',
                      groupName: 'Dispensação por Tipo',
                      explanation: 'Classificações com saída ativa no período e sua participação percentual.',
                      kpis: [
                        { label: 'Categorias com Saída', value: `${dispensationByTypeMetrics.categoriesList.length} categorias`, tone: 'blue' },
                        { label: 'Total Movimentado', value: `${dispensationByTypeMetrics.totalUnits.toLocaleString('pt-BR')} un`, tone: 'emerald' }
                      ],
                      chart: {
                        type: 'donut',
                        title: 'Participação por Categoria Movimentada (Unidades)',
                        valueFormatter: 'integer',
                        data: dispensationByTypeMetrics.categoriesList.map(c => ({
                          label: c.category,
                          value: c.units,
                          color: getCategoryColor(c.category)
                        }))
                      }
                    },
                    true
                  )}
                </div>
                <p className="text-xs font-bold text-slate-500">
                  Classificações com saída ativa no período
                </p>
                <div className="h-24 w-full pt-2 border-t border-slate-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dispensationByTypeMetrics.categoriesList.map(c => ({
                          name: c.category,
                          value: c.units,
                          color: getCategoryColor(c.category)
                        }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={18}
                        outerRadius={36}
                        paddingAngle={2}
                      >
                        {dispensationByTypeMetrics.categoriesList.map((c, idx) => (
                          <Cell key={idx} fill={getCategoryColor(c.category)} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Volume']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown by Category & Breakdown by Exit Reason / Origin */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Category Breakdown (2 cols) */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
              <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Dispensação por Categoria / Tipo de Material
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Participação percentual, volume físico e impacto financeiro por categoria
                    </p>
                  </div>
                  {renderIndicatorActions({
                    indicatorTitle: 'Dispensação por Categoria / Tipo de Material',
                    indicatorSubtitle: 'Volume físico, participação percentual e impacto financeiro por categoria',
                    groupName: 'Dispensação por Tipo',
                    explanation: 'Consolida todas as saídas do período por categoria de material.',
                    kpis: [
                      { label: 'Categorias Movimentadas', value: `${dispensationByTypeMetrics.categoriesList.length}`, tone: 'blue' },
                      { label: 'Total de Unidades', value: `${dispensationByTypeMetrics.totalUnits.toLocaleString('pt-BR')} un`, tone: 'indigo' },
                      { label: 'Custo Total', value: formatCurrency(dispensationByTypeMetrics.totalValue), tone: 'emerald' }
                    ],
                    chart: {
                      type: 'horizontalBar',
                      title: 'Volume Dispensado por Categoria (Unidades)',
                      valueFormatter: 'integer',
                      data: dispensationByTypeMetrics.categoriesList.map(c => ({
                        label: c.category,
                        value: c.units,
                        color: getCategoryColor(c.category)
                      }))
                    },
                    table: {
                      title: 'Resumo de Dispensação por Categoria',
                      headers: ['Categoria', 'Itens Distintos', 'Saídas', 'Unidades', '% Volume', 'Valor (R$)'],
                      rows: dispensationByTypeMetrics.categoriesList.map(c => [
                        c.category,
                        String(c.distinctItemsCount),
                        String(c.count),
                        `${c.units.toLocaleString('pt-BR')} un`,
                        `${c.percentage}%`,
                        formatCurrency(c.value)
                      ])
                    }
                  })}
                </div>

                {dispensationByTypeMetrics.categoriesList.length > 0 ? (
                  <>
                    <div className="h-56 w-full p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dispensationByTypeMetrics.categoriesList.map(c => ({
                            name: c.category.length > 16 ? `${c.category.slice(0, 16)}…` : c.category,
                            fullName: c.category,
                            unidades: c.units,
                            valor: Number(c.value.toFixed(2)),
                            color: getCategoryColor(c.category)
                          }))}
                          layout="vertical"
                          margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                          <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                          <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} />
                          <Tooltip
                            formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Dispensado']}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                            contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}
                          />
                          <Bar dataKey="unidades" radius={[0, 6, 6, 0]} maxBarSize={22}>
                            {dispensationByTypeMetrics.categoriesList.map((c, idx) => (
                              <Cell key={idx} fill={getCategoryColor(c.category)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-3">
                      {dispensationByTypeMetrics.categoriesList.map(cat => (
                        <div
                          key={cat.category}
                          onClick={() =>
                            setTypeCategoryFilter(prev =>
                              prev === cat.category ? 'todas' : cat.category
                            )
                          }
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                            typeCategoryFilter === cat.category
                              ? 'bg-blue-50/70 border-blue-500'
                              : 'bg-slate-50/70 border-slate-100 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: getCategoryColor(cat.category) }}
                              />
                              <span className="text-xs font-black text-slate-900">{cat.category}</span>
                              <span className="text-[10px] font-bold text-slate-400">
                                ({cat.distinctItemsCount} itens • {cat.count} saídas)
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-blue-700">
                                {cat.units.toLocaleString('pt-BR')} un
                              </span>
                              <span className="text-[10px] font-extrabold text-slate-500 ml-2">
                                ({cat.percentage}%)
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-600 to-indigo-700 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(3, cat.percentage))}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1.5 text-[10px] font-bold text-slate-500">
                            <span>Clique para filtrar a tabela abaixo</span>
                            <span className="text-slate-700">{formatCurrency(cat.value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs font-semibold text-slate-400 py-10 text-center">
                    Nenhuma dispensação registrada no período selecionado.
                  </p>
                )}
              </div>
            </div>

            {/* Origin & Exit Reason Breakdown (1 col) */}
            <div className="space-y-6">
              {/* By Origin */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden relative">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-indigo-700" />
                <div className="p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-slate-900">
                      Por Origem do Recurso
                    </h3>
                    {renderIndicatorActions(
                      {
                        indicatorTitle: 'Dispensação por Origem do Recurso',
                        indicatorSubtitle: 'Contrato/Licitado, Compra Extra ou Doação',
                        groupName: 'Dispensação por Tipo',
                        explanation: 'Classifica as saídas conforme a origem cadastral do lote (Contrato, Extra ou Doação).',
                        kpis: dispensationByTypeMetrics.originsList.map(o => ({
                          label: o.label,
                          value: `${o.units.toLocaleString('pt-BR')} un`,
                          subvalue: `${formatCurrency(o.value)} (${o.percentage}%)`,
                          tone: 'blue'
                        })),
                        chart: {
                          type: 'donut',
                          title: 'Distribuição por Origem do Recurso (Unidades)',
                          valueFormatter: 'integer',
                          data: dispensationByTypeMetrics.originsList.map((o, idx) => ({
                            label: o.label,
                            value: o.units,
                            color: ['#2563eb', '#4f46e5', '#10b981', '#f59e0b'][idx % 4]
                          }))
                        }
                      },
                      true
                    )}
                  </div>

                  {dispensationByTypeMetrics.originsList.length > 0 ? (
                    <>
                      <div className="h-36 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dispensationByTypeMetrics.originsList.map((o, idx) => ({
                                name: o.label,
                                value: o.units,
                                color: ['#2563eb', '#4f46e5', '#10b981', '#f59e0b'][idx % 4]
                              }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={24}
                              outerRadius={46}
                              paddingAngle={3}
                            >
                              {dispensationByTypeMetrics.originsList.map((_, idx) => (
                                <Cell key={idx} fill={['#2563eb', '#4f46e5', '#10b981', '#f59e0b'][idx % 4]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Volume']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {dispensationByTypeMetrics.originsList.map(orig => (
                        <div
                          key={orig.originKey}
                          className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-xs font-black text-slate-800">{orig.label}</p>
                            <p className="text-[10px] font-bold text-slate-400">
                              {orig.count} movimentações • {orig.percentage}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-blue-700">
                              {orig.units.toLocaleString('pt-BR')} un
                            </p>
                            <p className="text-[10px] font-bold text-slate-500">
                              {formatCurrency(orig.value)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 font-semibold">Sem registros.</p>
                  )}
                </div>
              </div>

              {/* By Exit Modality/Reason */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden relative">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-blue-800" />
                <div className="p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-slate-900">
                      Por Modalidade de Saída
                    </h3>
                    {renderIndicatorActions(
                      {
                        indicatorTitle: 'Saídas por Modalidade / Motivo',
                        indicatorSubtitle: 'Consumo regular, doação externa, vencimento ou perda',
                        groupName: 'Dispensação por Tipo',
                        explanation: 'Agrupa as baixas do período de acordo com a modalidade registrada na movimentação.',
                        kpis: dispensationByTypeMetrics.reasonsList.map(r => ({
                          label: r.label,
                          value: `${r.units.toLocaleString('pt-BR')} un`,
                          subvalue: `${formatCurrency(r.value)} (${r.percentage}%)`,
                          tone: 'indigo'
                        })),
                        chart: {
                          type: 'verticalBar',
                          title: 'Unidades por Modalidade de Saída',
                          valueFormatter: 'integer',
                          data: dispensationByTypeMetrics.reasonsList.map((r, idx) => ({
                            label: r.label,
                            value: r.units,
                            color: ['#4f46e5', '#2563eb', '#ef4444', '#f59e0b'][idx % 4]
                          }))
                        }
                      },
                      true
                    )}
                  </div>

                  {dispensationByTypeMetrics.reasonsList.length > 0 ? (
                    <>
                      <div className="h-36 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={dispensationByTypeMetrics.reasonsList.map(r => ({
                              name: r.label.length > 12 ? `${r.label.slice(0, 12)}…` : r.label,
                              un: r.units
                            }))}
                            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                          >
                            <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#475569' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Saídas']} contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 700 }} />
                            <Bar dataKey="un" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={24} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {dispensationByTypeMetrics.reasonsList.map(rsn => (
                        <div
                          key={rsn.reasonKey}
                          className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-xs font-black text-slate-800">{rsn.label}</p>
                            <p className="text-[10px] font-bold text-slate-400">
                              {rsn.count} baixas • {rsn.percentage}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-indigo-700">
                              {rsn.units.toLocaleString('pt-BR')} un
                            </p>
                            <p className="text-[10px] font-bold text-slate-500">
                              {formatCurrency(rsn.value)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 font-semibold">Sem registros.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Dispensation Table */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden relative">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
            <div className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Registros de Dispensação Filtrados ({dispensationByTypeMetrics.filteredExits.length})
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Listagem analítica de saídas por categoria, origem e setor
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={typeCategoryFilter}
                    onChange={e => setTypeCategoryFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-800 cursor-pointer"
                  >
                    <option value="todas">Todas as Categorias</option>
                    {dispensationByTypeMetrics.categoriesList.map(c => (
                      <option key={c.category} value={c.category}>
                        {c.category}
                      </option>
                    ))}
                  </select>

                  <select
                    value={typeOriginFilter}
                    onChange={e => setTypeOriginFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-800 cursor-pointer"
                  >
                    <option value="todas">Todas as Origens</option>
                    <option value="contract">Contrato / Licitado</option>
                    <option value="extra">Extra / Compra Direta</option>
                    <option value="donation">Doação</option>
                  </select>

                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={typeSearchTerm}
                      onChange={e => setTypeSearchTerm(e.target.value)}
                      placeholder="Buscar item ou setor..."
                      className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    />
                  </div>

                  {renderIndicatorActions({
                    indicatorTitle: 'Relatório Analítico de Dispensação por Tipo',
                    indicatorSubtitle: `Listagem filtrada (${dispensationByTypeMetrics.filteredExits.length} registros)`,
                    groupName: 'Dispensação por Tipo',
                    kpis: [
                      { label: 'Registros Filtrados', value: `${dispensationByTypeMetrics.filteredExits.length}`, tone: 'blue' },
                      { label: 'Volume Total', value: `${dispensationByTypeMetrics.filteredExits.reduce((a, b) => a + b.qty, 0).toLocaleString('pt-BR')} un`, tone: 'indigo' },
                      { label: 'Valor Total', value: formatCurrency(dispensationByTypeMetrics.filteredExits.reduce((a, b) => a + b.finValue, 0)), tone: 'emerald' }
                    ],
                    chart: {
                      type: 'horizontalBar',
                      title: 'Volume Dispensado por Categoria (Unidades)',
                      valueFormatter: 'integer',
                      data: dispensationByTypeMetrics.categoriesList.map(c => ({
                        label: c.category,
                        value: c.units,
                        color: getCategoryColor(c.category)
                      }))
                    },
                    table: {
                      title: 'Registros de Dispensação Filtrados',
                      headers: ['Data', 'Material', 'Categoria', 'Origem / Modalidade', 'Setor / Destino', 'Qtd.', 'Valor'],
                      rows: dispensationByTypeMetrics.filteredExits.slice(0, 80).map(r => [
                        formatDateBR(r.tx.date),
                        r.tx.item_name,
                        r.category,
                        `${r.originLabel} / ${r.reasonLabel}`,
                        r.tx.sector || r.tx.donationUnitName || '—',
                        `${r.qty.toLocaleString('pt-BR')} un`,
                        formatCurrency(r.finValue)
                      ])
                    }
                  })}
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Material</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4">Origem / Modalidade</th>
                      <th className="py-3 px-4">Setor / Destino</th>
                      <th className="py-3 px-4 text-right">Qtd.</th>
                      <th className="py-3 px-4 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {dispensationByTypeMetrics.filteredExits.slice(0, 100).map(row => (
                      <tr key={row.tx.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                          {formatDateBR(row.tx.date)}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.tx.item_name}</td>
                        <td className="py-3 px-4">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                            style={{ backgroundColor: getCategoryColor(row.category) }}
                          >
                            {row.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-semibold">
                          {row.originLabel} • <span className="text-blue-700">{row.reasonLabel}</span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {row.tx.sector || row.tx.donationUnitName || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                          {row.qty.toLocaleString('pt-BR')} un
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-blue-700 whitespace-nowrap">
                          {formatCurrency(row.finValue)}
                        </td>
                      </tr>
                    ))}
                    {dispensationByTypeMetrics.filteredExits.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400 font-semibold">
                          Nenhuma dispensação encontrada com os filtros atuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          ABA 4: DOAÇÕES E BAIXAS POR VENCIMENTO
         =================================================================== */}
      {activeTab === 'doacoes' && (
        <div className="space-y-6">
          {/* Info Banner clarifying strict donation rule */}
          <div className="bg-blue-50/70 rounded-2xl border border-blue-200/80 px-4 py-3 flex items-center gap-3 text-xs text-blue-900">
            <Info size={16} className="text-blue-600 shrink-0" />
            <p className="font-semibold">
              Esta aba contabiliza <strong>exclusivamente doações efetivas</strong> (entradas recebidas por doação e saídas com termo de doação para outras unidades) e <strong>baixas por vencimento</strong>. Dispensações de rotina para os setores internos não são misturadas às doações realizadas.
            </p>
          </div>

          {/* Donation & Expiry KPI Cards with Embedded Charts and Print/PDF */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* 1. Recebido por Doação (Entradas) */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
              <div className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Recebido por Doação
                  </span>
                  {renderIndicatorActions(
                    {
                      indicatorTitle: 'Materiais Recebidos por Doação (Entradas)',
                      indicatorSubtitle: 'Entradas com origem de doação no período selecionado',
                      groupName: 'Doações e Baixas',
                      explanation: 'Contabiliza exclusivamente as entradas marcadas como doação no período.',
                      kpis: [
                        { label: 'Unidades Recebidas', value: `${donationsMetrics.totalReceivedUnits.toLocaleString('pt-BR')} un`, tone: 'blue' },
                        { label: 'Valor Estimado', value: formatCurrency(donationsMetrics.totalReceivedValue), tone: 'indigo' },
                        { label: 'Registros de Entrada', value: `${donationsMetrics.totalReceivedCount} entradas`, tone: 'emerald' }
                      ],
                      chart: {
                        type: 'horizontalBar',
                        title: 'Principais Itens Recebidos por Doação (Unidades)',
                        valueFormatter: 'integer',
                        data: donationsMetrics.filteredEntries.slice(0, 8).map(e => ({
                          label: e.tx.item_name,
                          value: e.qty,
                          color: '#2563eb'
                        }))
                      }
                    },
                    true
                  )}
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {donationsMetrics.totalReceivedUnits.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-bold text-slate-400">un</span>
                </h3>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">
                    {donationsMetrics.totalReceivedCount} entradas de doação
                  </span>
                  <span className="font-black text-blue-700">
                    {formatCurrency(donationsMetrics.totalReceivedValue)}
                  </span>
                </div>
                <div className="h-20 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        donationsMetrics.filteredEntries.length > 0
                          ? donationsMetrics.filteredEntries.slice(0, 4).map(e => ({
                              name: e.tx.item_name.slice(0, 8),
                              un: e.qty
                            }))
                          : [{ name: 'Sem dados', un: 0 }]
                      }
                      margin={{ top: 2, right: 2, left: -26, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Recebido']} contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 700 }} />
                      <Bar dataKey="un" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 2. Doado de Fato (Saídas Exclusivas por Doação) */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-indigo-900" />
              <div className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Doado (Saídas por Doação)
                  </span>
                  {renderIndicatorActions(
                    {
                      indicatorTitle: 'Materiais Doados para Outras Unidades (Saídas por Doação)',
                      indicatorSubtitle: 'Saídas exclusivas com motivo doação (exclui dispensações internas)',
                      groupName: 'Doações e Baixas',
                      explanation: 'Contabiliza exclusivamente as saídas com termo de doação para unidades externas.',
                      kpis: [
                        { label: 'Unidades Doadas', value: `${donationsMetrics.totalDonatedOutUnits.toLocaleString('pt-BR')} un`, tone: 'indigo' },
                        { label: 'Valor Estimado', value: formatCurrency(donationsMetrics.totalDonatedOutValue), tone: 'blue' },
                        { label: 'Termos de Doação', value: `${donationsMetrics.totalDonatedOutCount} saídas`, tone: 'slate' }
                      ],
                      chart: {
                        type: 'horizontalBar',
                        title: 'Principais Itens Doados no Período (Unidades)',
                        valueFormatter: 'integer',
                        data: donationsMetrics.filteredExits.slice(0, 8).map(e => ({
                          label: e.tx.item_name,
                          value: e.qty,
                          color: '#4f46e5'
                        }))
                      }
                    },
                    true
                  )}
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {donationsMetrics.totalDonatedOutUnits.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-bold text-slate-400">un</span>
                </h3>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">
                    {donationsMetrics.totalDonatedOutCount} doações externas
                  </span>
                  <span className="font-black text-indigo-700">
                    {formatCurrency(donationsMetrics.totalDonatedOutValue)}
                  </span>
                </div>
                <div className="h-20 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        donationsMetrics.filteredExits.length > 0
                          ? donationsMetrics.filteredExits.slice(0, 4).map(e => ({
                              name: e.tx.item_name.slice(0, 8),
                              un: e.qty
                            }))
                          : [{ name: 'Sem dados', un: 0 }]
                      }
                      margin={{ top: 2, right: 2, left: -26, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Doado']} contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 700 }} />
                      <Bar dataKey="un" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 3. Baixas por Vencimento / Perda no Período */}
            <div className="bg-white rounded-3xl border border-rose-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-rose-600 to-amber-500" />
              <div className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Baixas por Vencimento
                  </span>
                  {renderIndicatorActions(
                    {
                      indicatorTitle: 'Baixas por Vencimento e Perda no Período',
                      indicatorSubtitle: 'Saídas definitivas por expiração de validade ou avaria',
                      groupName: 'Doações e Baixas',
                      explanation: 'Soma das unidades e valores baixados por vencimento ou perda no período.',
                      kpis: [
                        { label: 'Unidades Baixadas', value: `${donationsMetrics.totalExpiredExitUnits.toLocaleString('pt-BR')} un`, tone: 'rose' },
                        { label: 'Valor Financeiro', value: formatCurrency(donationsMetrics.totalExpiredExitValue), tone: 'amber' },
                        { label: 'Registros de Baixa', value: `${donationsMetrics.totalExpiredExitCount} baixas`, tone: 'slate' }
                      ],
                      chart: {
                        type: 'horizontalBar',
                        title: 'Principais Itens Baixados por Vencimento/Perda (R$)',
                        valueFormatter: 'currency',
                        data: donationsMetrics.filteredExpiryExits.slice(0, 8).map(e => ({
                          label: e.tx.item_name,
                          value: e.finValue,
                          color: '#ef4444'
                        }))
                      }
                    },
                    true
                  )}
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {donationsMetrics.totalExpiredExitUnits.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-bold text-slate-400">un</span>
                </h3>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">
                    {donationsMetrics.totalExpiredExitCount} baixas no período
                  </span>
                  <span className="font-black text-rose-600">
                    {formatCurrency(donationsMetrics.totalExpiredExitValue)}
                  </span>
                </div>
                <div className="h-20 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        donationsMetrics.filteredExpiryExits.length > 0
                          ? donationsMetrics.filteredExpiryExits.slice(0, 4).map(e => ({
                              name: e.tx.item_name.slice(0, 8),
                              un: e.qty
                            }))
                          : [{ name: 'Sem baixas', un: 0 }]
                      }
                      margin={{ top: 2, right: 2, left: -26, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Baixado']} contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 700 }} />
                      <Bar dataKey="un" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 4. Estoque Atual de Origem Doação */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-700" />
              <div className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Saldo Atual de Doação
                  </span>
                  {renderIndicatorActions(
                    {
                      indicatorTitle: 'Saldo Atual em Estoque de Origem Doação',
                      indicatorSubtitle: 'Lotes ativos atualmente em estoque cadastrados como doação',
                      groupName: 'Doações e Baixas',
                      explanation: 'Soma física e financeira dos lotes ativos com origem de aquisição por doação.',
                      kpis: [
                        { label: 'Saldo em Unidades', value: `${donationsMetrics.currentDonationStockUnits.toLocaleString('pt-BR')} un`, tone: 'blue' },
                        { label: 'Valor em Saldo', value: formatCurrency(donationsMetrics.currentDonationStockValue), tone: 'indigo' },
                        { label: 'Lotes com Saldo', value: `${donationsMetrics.currentDonationStockCount} lotes`, tone: 'emerald' }
                      ],
                      chart: {
                        type: 'horizontalBar',
                        title: 'Maiores Lotes Ativos de Origem Doação (Unidades)',
                        valueFormatter: 'integer',
                        data: donationsMetrics.filteredStock.slice(0, 8).map(it => ({
                          label: it.name,
                          value: Number(it.quantity) || 0,
                          color: '#0284c7'
                        }))
                      }
                    },
                    true
                  )}
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {donationsMetrics.currentDonationStockUnits.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-bold text-slate-400">un</span>
                </h3>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">
                    {donationsMetrics.currentDonationStockCount} lotes com saldo
                  </span>
                  <span className="font-black text-blue-700">
                    {formatCurrency(donationsMetrics.currentDonationStockValue)}
                  </span>
                </div>
                <div className="h-20 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        donationsMetrics.filteredStock.length > 0
                          ? donationsMetrics.filteredStock.slice(0, 4).map(it => ({
                              name: it.name.slice(0, 8),
                              un: Number(it.quantity) || 0
                            }))
                          : [{ name: 'Sem saldo', un: 0 }]
                      }
                      margin={{ top: 2, right: 2, left: -26, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Saldo']} contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 700 }} />
                      <Bar dataKey="un" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Comparative Charts for Donations & Write-offs */}
          <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-rose-600" />
            <div className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Comparativo Gráfico: Doações Recebidas, Doações Realizadas, Baixas e Saldo
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Confronto direto de volume físico (unidades) e impacto financeiro (R$) no período
                  </p>
                </div>
                {renderIndicatorActions({
                  indicatorTitle: 'Comparativo de Doações e Baixas por Vencimento',
                  indicatorSubtitle: 'Doações recebidas, doações realizadas, baixas por vencimento e saldo atual de doação',
                  groupName: 'Doações e Baixas',
                  explanation: 'Visão comparativa consolidada exclusivamente sobre movimentações de doação e descartes por vencimento/perda.',
                  kpis: [
                    { label: 'Recebido por Doação', value: formatCurrency(donationsMetrics.totalReceivedValue), subvalue: `${donationsMetrics.totalReceivedUnits.toLocaleString('pt-BR')} un`, tone: 'blue' },
                    { label: 'Doado (Saídas)', value: formatCurrency(donationsMetrics.totalDonatedOutValue), subvalue: `${donationsMetrics.totalDonatedOutUnits.toLocaleString('pt-BR')} un`, tone: 'indigo' },
                    { label: 'Baixas por Vencimento', value: formatCurrency(donationsMetrics.totalExpiredExitValue), subvalue: `${donationsMetrics.totalExpiredExitUnits.toLocaleString('pt-BR')} un`, tone: 'rose' },
                    { label: 'Saldo Atual Doação', value: formatCurrency(donationsMetrics.currentDonationStockValue), subvalue: `${donationsMetrics.currentDonationStockUnits.toLocaleString('pt-BR')} un`, tone: 'emerald' }
                  ],
                  chart: {
                    type: 'verticalBar',
                    title: 'Comparativo Financeiro de Doações e Baixas por Vencimento (R$)',
                    valueFormatter: 'currency',
                    data: [
                      { label: 'Recebido (Doação)', value: donationsMetrics.totalReceivedValue, color: '#2563eb' },
                      { label: 'Doado (Saídas)', value: donationsMetrics.totalDonatedOutValue, color: '#4f46e5' },
                      { label: 'Baixas Vencimento', value: donationsMetrics.totalExpiredExitValue, color: '#ef4444' },
                      { label: 'Saldo em Estoque', value: donationsMetrics.currentDonationStockValue, color: '#0284c7' }
                    ]
                  }
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-60 w-full p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                  <p className="text-xs font-black text-slate-700 mb-2 uppercase tracking-wider">
                    Comparativo em Valor Financeiro (R$)
                  </p>
                  <ResponsiveContainer width="100%" height="88%">
                    <BarChart
                      data={[
                        { name: 'Recebido', valor: Number(donationsMetrics.totalReceivedValue.toFixed(2)), fill: '#2563eb' },
                        { name: 'Doado', valor: Number(donationsMetrics.totalDonatedOutValue.toFixed(2)), fill: '#4f46e5' },
                        { name: 'Baixas Venc.', valor: Number(donationsMetrics.totalExpiredExitValue.toFixed(2)), fill: '#ef4444' },
                        { name: 'Saldo Atual', valor: Number(donationsMetrics.currentDonationStockValue.toFixed(2)), fill: '#0284c7' }
                      ]}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `R$${Number(v).toLocaleString('pt-BR')}`} />
                      <Tooltip formatter={(val: any) => [formatCurrency(Number(val) || 0), 'Valor (R$)']} contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 700 }} />
                      <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={38}>
                        <Cell fill="#2563eb" />
                        <Cell fill="#4f46e5" />
                        <Cell fill="#ef4444" />
                        <Cell fill="#0284c7" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="h-60 w-full p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                  <p className="text-xs font-black text-slate-700 mb-2 uppercase tracking-wider">
                    Comparativo em Quantidade Física (Unidades)
                  </p>
                  <ResponsiveContainer width="100%" height="88%">
                    <BarChart
                      data={[
                        { name: 'Recebido', un: donationsMetrics.totalReceivedUnits, fill: '#2563eb' },
                        { name: 'Doado', un: donationsMetrics.totalDonatedOutUnits, fill: '#4f46e5' },
                        { name: 'Baixas Venc.', un: donationsMetrics.totalExpiredExitUnits, fill: '#ef4444' },
                        { name: 'Saldo Atual', un: donationsMetrics.currentDonationStockUnits, fill: '#0284c7' }
                      ]}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip formatter={(val: any) => [`${Number(val || 0).toLocaleString('pt-BR')} un`, 'Unidades']} contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 700 }} />
                      <Bar dataKey="un" radius={[6, 6, 0, 0]} maxBarSize={38}>
                        <Cell fill="#2563eb" />
                        <Cell fill="#4f46e5" />
                        <Cell fill="#ef4444" />
                        <Cell fill="#0284c7" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-filter and Search for Donations & Expiry Write-offs */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden relative">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'todas', label: 'Visão Completa' },
                      {
                        id: 'saidas',
                        label: `Doações Realizadas (${donationsMetrics.filteredExits.length})`
                      },
                      {
                        id: 'entradas',
                        label: `Doações Recebidas (${donationsMetrics.filteredEntries.length})`
                      },
                      {
                        id: 'vencidos',
                        label: `Baixas por Vencimento (${donationsMetrics.filteredExpiryExits.length})`
                      },
                      {
                        id: 'estoque',
                        label: `Saldo em Estoque (${donationsMetrics.filteredStock.length})`
                      }
                    ] as {
                      id: 'todas' | 'entradas' | 'saidas' | 'vencidos' | 'estoque';
                      label: string;
                    }[]
                  ).map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => setDonationSubView(btn.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                        donationSubView === btn.id
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={donationSearchTerm}
                    onChange={e => setDonationSearchTerm(e.target.value)}
                    placeholder="Buscar item, lote, unidade, termo..."
                    className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>

              {/* Table 1: Saídas / Termos de Doação (Exclusivamente exitReason === 'doacao') */}
              {(donationSubView === 'todas' || donationSubView === 'saidas') && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <HeartHandshake size={16} className="text-indigo-600" />
                      O que foi Doado no Período • Saídas Exclusivas por Doação (
                      {donationsMetrics.filteredExits.length})
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold text-indigo-700">
                        Total Doado: {donationsMetrics.totalDonatedOutUnits.toLocaleString('pt-BR')} un (
                        {formatCurrency(donationsMetrics.totalDonatedOutValue)})
                      </span>
                      {renderIndicatorActions({
                        indicatorTitle: 'Relação de Doações Realizadas no Período (Saídas por Doação)',
                        indicatorSubtitle: 'Termos de doação emitidos para unidades externas',
                        groupName: 'Doações e Baixas',
                        kpis: [
                          { label: 'Termos / Saídas', value: `${donationsMetrics.filteredExits.length}`, tone: 'indigo' },
                          { label: 'Total Doado (Un)', value: `${donationsMetrics.totalDonatedOutUnits.toLocaleString('pt-BR')} un`, tone: 'blue' },
                          { label: 'Valor Doado', value: formatCurrency(donationsMetrics.totalDonatedOutValue), tone: 'emerald' }
                        ],
                        chart: {
                          type: 'horizontalBar',
                          title: 'Itens Doados por Quantidade (Unidades)',
                          valueFormatter: 'integer',
                          data: donationsMetrics.filteredExits.slice(0, 10).map(r => ({
                            label: r.tx.item_name,
                            value: r.qty,
                            color: '#4f46e5'
                          }))
                        },
                        table: {
                          title: 'Saídas Exclusivas por Doação',
                          headers: ['Data', 'Nº Termo', 'Unidade Recebedora', 'Material', 'Categoria', 'Qtd.', 'Valor'],
                          rows: donationsMetrics.filteredExits.map(r => [
                            formatDateBR(r.tx.date),
                            r.docNumber,
                            r.recipient,
                            r.tx.item_name,
                            r.category,
                            `${r.qty.toLocaleString('pt-BR')} un`,
                            formatCurrency(r.finValue)
                          ])
                        }
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Data</th>
                          <th className="py-3 px-4">Nº Termo</th>
                          <th className="py-3 px-4">Unidade Recebedora / CNPJ</th>
                          <th className="py-3 px-4">Material Doado</th>
                          <th className="py-3 px-4">Categoria</th>
                          <th className="py-3 px-4">Lote / Validade</th>
                          <th className="py-3 px-4">Responsável</th>
                          <th className="py-3 px-4 text-right">Qtd. Doada</th>
                          <th className="py-3 px-4 text-right">Valor Estimado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {donationsMetrics.filteredExits.map(row => (
                          <tr key={row.tx.id} className="hover:bg-blue-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                              {formatDateBR(row.tx.date)}
                            </td>
                            <td className="py-3 px-4 font-black text-blue-700 whitespace-nowrap">
                              {row.docNumber}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-bold text-slate-900">{row.recipient}</p>
                              {row.tx.donationUnitCNPJ && (
                                <p className="text-[10px] font-semibold text-slate-400">
                                  CNPJ: {row.tx.donationUnitCNPJ}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">{row.tx.item_name}</td>
                            <td className="py-3 px-4">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                                style={{ backgroundColor: getCategoryColor(row.category) }}
                              >
                                {row.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                              {row.tx.batch_number || 'S/L'} •{' '}
                              {row.tx.expiry_date ? formatDateBR(row.tx.expiry_date) : '—'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                              {row.tx.responsible || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-black text-indigo-700 whitespace-nowrap">
                              {row.qty.toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-700 whitespace-nowrap">
                              {formatCurrency(row.finValue)}
                            </td>
                          </tr>
                        ))}
                        {donationsMetrics.filteredExits.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-slate-400 font-semibold">
                              Nenhuma saída por doação registrada no período selecionado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Table 2: Entradas Recebidas por Doação */}
              {(donationSubView === 'todas' || donationSubView === 'entradas') && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <ArrowDownLeft size={16} className="text-blue-600" />
                      O que foi Recebido por Doação no Período ({donationsMetrics.filteredEntries.length})
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold text-blue-700">
                        Total Recebido: {donationsMetrics.totalReceivedUnits.toLocaleString('pt-BR')} un (
                        {formatCurrency(donationsMetrics.totalReceivedValue)})
                      </span>
                      {renderIndicatorActions({
                        indicatorTitle: 'Relação de Doações Recebidas no Período (Entradas)',
                        indicatorSubtitle: 'Materiais incorporados ao estoque por doação',
                        groupName: 'Doações e Baixas',
                        kpis: [
                          { label: 'Entradas por Doação', value: `${donationsMetrics.filteredEntries.length}`, tone: 'blue' },
                          { label: 'Total Recebido (Un)', value: `${donationsMetrics.totalReceivedUnits.toLocaleString('pt-BR')} un`, tone: 'indigo' },
                          { label: 'Valor Estimado', value: formatCurrency(donationsMetrics.totalReceivedValue), tone: 'emerald' }
                        ],
                        chart: {
                          type: 'horizontalBar',
                          title: 'Itens Recebidos por Doação (Unidades)',
                          valueFormatter: 'integer',
                          data: donationsMetrics.filteredEntries.slice(0, 10).map(r => ({
                            label: r.tx.item_name,
                            value: r.qty,
                            color: '#2563eb'
                          }))
                        },
                        table: {
                          title: 'Entradas Recebidas por Doação',
                          headers: ['Data', 'Material', 'Categoria', 'Lote', 'Doador / Origem', 'Qtd.', 'Valor'],
                          rows: donationsMetrics.filteredEntries.map(r => [
                            formatDateBR(r.tx.date),
                            r.tx.item_name,
                            r.category,
                            r.tx.batch_number || r.item?.batch_number || 'S/L',
                            r.tx.supplier || 'Doação Institucional',
                            `+${r.qty.toLocaleString('pt-BR')} un`,
                            formatCurrency(r.finValue)
                          ])
                        }
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Data</th>
                          <th className="py-3 px-4">Material Recebido</th>
                          <th className="py-3 px-4">Categoria</th>
                          <th className="py-3 px-4">Lote / Validade</th>
                          <th className="py-3 px-4">Origem / Fornecedor Doador</th>
                          <th className="py-3 px-4">Responsável</th>
                          <th className="py-3 px-4 text-right">Qtd. Recebida</th>
                          <th className="py-3 px-4 text-right">Valor Estimado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {donationsMetrics.filteredEntries.map(row => (
                          <tr key={row.tx.id} className="hover:bg-blue-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                              {formatDateBR(row.tx.date)}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">{row.tx.item_name}</td>
                            <td className="py-3 px-4">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                                style={{ backgroundColor: getCategoryColor(row.category) }}
                              >
                                {row.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                              {row.tx.batch_number || row.item?.batch_number || 'S/L'} •{' '}
                              {row.tx.expiry_date || row.item?.expiry_date
                                ? formatDateBR(row.tx.expiry_date || row.item?.expiry_date)
                                : '—'}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-700">
                              {row.tx.supplier || 'Doação Institucional'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium">
                              {row.tx.responsible || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-black text-blue-700 whitespace-nowrap">
                              +{row.qty.toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-700 whitespace-nowrap">
                              {formatCurrency(row.finValue)}
                            </td>
                          </tr>
                        ))}
                        {donationsMetrics.filteredEntries.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                              Nenhuma entrada de doação registrada no período selecionado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Table 3: Baixas por Vencimento / Perda no Período */}
              {(donationSubView === 'todas' || donationSubView === 'vencidos') && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-rose-600" />
                      Baixas por Vencimento / Descarte no Período (
                      {donationsMetrics.filteredExpiryExits.length})
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold text-rose-600">
                        Total Baixado: {donationsMetrics.totalExpiredExitUnits.toLocaleString('pt-BR')} un (
                        {formatCurrency(donationsMetrics.totalExpiredExitValue)})
                      </span>
                      {renderIndicatorActions({
                        indicatorTitle: 'Relação de Baixas por Vencimento / Descarte',
                        indicatorSubtitle: 'Itens baixados do estoque por validade expirada ou perda',
                        groupName: 'Doações e Baixas',
                        kpis: [
                          { label: 'Total de Baixas', value: `${donationsMetrics.filteredExpiryExits.length}`, tone: 'rose' },
                          { label: 'Qtd. Baixada', value: `${donationsMetrics.totalExpiredExitUnits.toLocaleString('pt-BR')} un`, tone: 'amber' },
                          { label: 'Valor Baixado', value: formatCurrency(donationsMetrics.totalExpiredExitValue), tone: 'slate' }
                        ],
                        chart: {
                          type: 'horizontalBar',
                          title: 'Maiores Baixas por Vencimento/Perda (R$)',
                          valueFormatter: 'currency',
                          data: donationsMetrics.filteredExpiryExits.slice(0, 10).map(r => ({
                            label: r.tx.item_name,
                            value: r.finValue,
                            color: '#ef4444'
                          }))
                        },
                        table: {
                          title: 'Baixas por Vencimento e Perda no Período',
                          headers: ['Data', 'Tipo', 'Material', 'Categoria', 'Lote', 'Justificativa', 'Qtd.', 'Valor'],
                          rows: donationsMetrics.filteredExpiryExits.map(r => [
                            formatDateBR(r.tx.date),
                            r.reasonType,
                            r.tx.item_name,
                            r.category,
                            r.tx.batch_number || 'S/L',
                            r.justification,
                            `-${r.qty.toLocaleString('pt-BR')} un`,
                            formatCurrency(r.finValue)
                          ])
                        }
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Data da Baixa</th>
                          <th className="py-3 px-4">Tipo de Baixa</th>
                          <th className="py-3 px-4">Material Baixado</th>
                          <th className="py-3 px-4">Categoria</th>
                          <th className="py-3 px-4">Lote / Validade</th>
                          <th className="py-3 px-4">Motivo / Justificativa</th>
                          <th className="py-3 px-4">Responsável</th>
                          <th className="py-3 px-4 text-right">Qtd. Baixada</th>
                          <th className="py-3 px-4 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {donationsMetrics.filteredExpiryExits.map(row => (
                          <tr key={row.tx.id} className="hover:bg-rose-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                              {formatDateBR(row.tx.date)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                                  row.tx.exitReason === 'perda'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-rose-100 text-rose-700 border-rose-200'
                                }`}
                              >
                                {row.reasonType}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">{row.tx.item_name}</td>
                            <td className="py-3 px-4">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                                style={{ backgroundColor: getCategoryColor(row.category) }}
                              >
                                {row.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                              {row.tx.batch_number || 'S/L'} •{' '}
                              {row.tx.expiry_date ? formatDateBR(row.tx.expiry_date) : '—'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium">
                              {row.justification}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                              {row.tx.responsible || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-black text-rose-700 whitespace-nowrap">
                              -{row.qty.toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-800 whitespace-nowrap">
                              {formatCurrency(row.finValue)}
                            </td>
                          </tr>
                        ))}
                        {donationsMetrics.filteredExpiryExits.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-slate-400 font-semibold">
                              Nenhuma baixa por vencimento ou perda registrada no período selecionado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Table 4: Estoque Atual de Origem Doação */}
              {(donationSubView === 'todas' || donationSubView === 'estoque') && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Package size={16} className="text-blue-700" />
                      Lotes em Estoque Atual de Origem Doação ({donationsMetrics.filteredStock.length})
                    </h4>
                    {renderIndicatorActions({
                      indicatorTitle: 'Lotes em Estoque Atual de Origem Doação',
                      indicatorSubtitle: 'Posição atual dos lotes ativos recebidos por doação',
                      groupName: 'Doações e Baixas',
                      kpis: [
                        { label: 'Lotes Ativos', value: `${donationsMetrics.filteredStock.length} lotes`, tone: 'blue' },
                        { label: 'Saldo em Unidades', value: `${donationsMetrics.currentDonationStockUnits.toLocaleString('pt-BR')} un`, tone: 'indigo' },
                        { label: 'Valor em Saldo', value: formatCurrency(donationsMetrics.currentDonationStockValue), tone: 'emerald' }
                      ],
                      chart: {
                        type: 'horizontalBar',
                        title: 'Lotes em Estoque de Origem Doação por Saldo (Unidades)',
                        valueFormatter: 'integer',
                        data: donationsMetrics.filteredStock.slice(0, 10).map(it => ({
                          label: it.name,
                          value: Number(it.quantity) || 0,
                          color: '#0284c7'
                        }))
                      },
                      table: {
                        title: 'Lotes Ativos de Origem Doação',
                        headers: ['Material', 'Categoria', 'Sala', 'Lote / Validade', 'Saldo Atual', 'Valor'],
                        rows: donationsMetrics.filteredStock.map(it => {
                          const q = Number(it.quantity) || 0;
                          const v = q * (Number(it.unit_price) || 0);
                          return [
                            it.name,
                            it.category || 'Outros',
                            it.room || `${inventoryLocation} Principal`,
                            `${it.batch_number || 'S/L'} • ${formatDateBR(it.expiry_date)}`,
                            `${q.toLocaleString('pt-BR')} ${it.unit_measure || 'un'}`,
                            formatCurrency(v)
                          ];
                        })
                      }
                    })}
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Material</th>
                          <th className="py-3 px-4">Categoria</th>
                          <th className="py-3 px-4">Sala</th>
                          <th className="py-3 px-4">Lote / Validade</th>
                          <th className="py-3 px-4 text-right">Saldo Atual</th>
                          <th className="py-3 px-4 text-right">Valor em Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {donationsMetrics.filteredStock.map(item => {
                          const qty = Number(item.quantity) || 0;
                          const val = qty * (Number(item.unit_price) || 0);
                          return (
                            <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-900">{item.name}</td>
                              <td className="py-3 px-4">
                                <span
                                  className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                                  style={{ backgroundColor: getCategoryColor(item.category) }}
                                >
                                  {item.category || 'Outros'}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-bold text-blue-800">
                                {item.room || `${inventoryLocation} Principal`}
                              </td>
                              <td className="py-3 px-4 text-slate-600 font-medium">
                                {item.batch_number || 'S/L'} • {formatDateBR(item.expiry_date)}
                              </td>
                              <td className="py-3 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                                {qty.toLocaleString('pt-BR')} {item.unit_measure || 'un'}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-blue-700 whitespace-nowrap">
                                {formatCurrency(val)}
                              </td>
                            </tr>
                          );
                        })}
                        {donationsMetrics.filteredStock.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                              Nenhum lote ativo de origem doação encontrado no estoque atual.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
