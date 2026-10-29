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
  ChevronRight
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import { Item, Transaction, MaterialRequest, RequestItem } from '../types';

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
}

type PeriodOption = '1_semestre' | '2_semestre' | 'ano_completo' | 'ultimos_90_dias' | 'personalizado';
type InternalTab = 'visao_geral' | 'situacao_sala' | 'dispensacao_tipo' | 'doacoes';

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
  onOpenRoomMap
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

  const [activeTab, setActiveTab] = useState<InternalTab>('visao_geral');

  // Filters inside tabs
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [typeCategoryFilter, setTypeCategoryFilter] = useState<string>('todas');
  const [typeOriginFilter, setTypeOriginFilter] = useState<string>('todas');
  const [typeSearchTerm, setTypeSearchTerm] = useState<string>('');
  const [donationSubView, setDonationSubView] = useState<'todas' | 'entradas' | 'saidas' | 'estoque'>('todas');
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

  // 1. Active items for current inventoryLocation (ignoring deletedAt)
  const locationItems = useMemo(() => {
    return items.filter(
      item => !item.deletedAt && (item.location || 'Almoxarifado') === inventoryLocation
    );
  }, [items, inventoryLocation]);

  // All non-deleted transactions for current inventoryLocation (across all dates)
  const allLocationTransactions = useMemo(() => {
    return transactions.filter(
      tx => !tx.deletedAt && (tx.location || 'Almoxarifado') === inventoryLocation
    );
  }, [transactions, inventoryLocation]);

  // Map items by ID and normalized name for fast lookup of unit_price, category, room, etc.
  // When multiple batches share a name, compute weighted average / positive unit price fallback
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
    if (tx.item_id && itemMaps.byId.has(tx.item_id)) {
      return itemMaps.byId.get(tx.item_id);
    }
    const normName = (tx.item_name || '').trim().toUpperCase();
    return itemMaps.byName.get(normName);
  };

  const resolveUnitPriceForTx = (tx: Transaction): number => {
    const directItem = tx.item_id ? itemMaps.byId.get(tx.item_id) : undefined;
    if (directItem && (Number(directItem.unit_price) || 0) > 0) {
      return Number(directItem.unit_price) || 0;
    }
    const normName = (directItem?.name || tx.item_name || '').trim().toUpperCase();
    return itemMaps.priceByName.get(normName) || 0;
  };

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

    // Filter valid requests: not deleted, not return, within dateInterval, matching inventoryLocation
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
      const d = parseRecordDate(req.date);
      if (!d || d < dateInterval.start || d > dateInterval.end) return false;

      const rItems = reqItemsByReqId.get(req.id) || [];
      if (rItems.length === 0) {
        return inventoryLocation === 'Almoxarifado';
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
        top5ClassA
      }
    };
  }, [
    locationItems,
    allLocationTransactions,
    requests,
    allRequestItems,
    dateInterval,
    inventoryLocation,
    itemMaps
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

  // 6. Donations Indicators (Tab 4: Doações)
  const donationsMetrics = useMemo(() => {
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

    const donationExits = periodTransactions
      .filter(
        tx =>
          tx.type === 'exit' &&
          (tx.exitReason === 'doacao' || tx.origin === 'donation' || Boolean(tx.donationUnitName))
      )
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
          recipient: tx.donationUnitName || tx.sector || 'Unidade Externa / Parceira',
          docNumber: tx.donationNumber || 'S/N'
        };
      });

    const donationStockItems = locationItems.filter(item => item.origin === 'donation');

    const totalReceivedUnits = donationEntries.reduce((acc, r) => acc + r.qty, 0);
    const totalReceivedValue = donationEntries.reduce((acc, r) => acc + r.finValue, 0);

    const totalDonatedOutUnits = donationExits.reduce((acc, r) => acc + r.qty, 0);
    const totalDonatedOutValue = donationExits.reduce((acc, r) => acc + r.finValue, 0);

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
        e.category.toLowerCase().includes(searchQ)
      );
    });

    const filteredExits = donationExits.filter(e => {
      if (!searchQ) return true;
      return (
        (e.tx.item_name || '').toLowerCase().includes(searchQ) ||
        e.recipient.toLowerCase().includes(searchQ) ||
        e.docNumber.toLowerCase().includes(searchQ) ||
        e.category.toLowerCase().includes(searchQ)
      );
    });

    const filteredStock = donationStockItems.filter(item => {
      if (!searchQ) return true;
      return (
        (item.name || '').toLowerCase().includes(searchQ) ||
        (item.supplier || '').toLowerCase().includes(searchQ) ||
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
      currentDonationStockUnits,
      currentDonationStockValue,
      currentDonationStockCount: donationStockItems.length,
      partnersCount: partnerUnitsSet.size,
      filteredEntries,
      filteredExits,
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
        }))
      ];
      const wsDon = XLSX.utils.json_to_sheet(
        donRows.length > 0
          ? donRows
          : [{ Info: 'Nenhuma movimentação de doação registrada no período selecionado.' }]
      );
      XLSX.utils.book_append_sheet(wb, wsDon, 'Doações');

      XLSX.writeFile(wb, `Indicadores_${inventoryLocation}_${selectedYear}.xlsx`);
      showToast('Planilha de Indicadores exportada com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao exportar indicadores:', error);
      showToast('Não foi possível exportar a planilha.', 'error');
    }
  };

  const { estoqueGiro, disponibilidade, atendimento, perdasValidade, curvaABC } = overviewGroups;

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
                  Monitoramento consolidado de estoque e giro, disponibilidade, atendimento, perdas/validade, Curva ABC, salas e doações.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                onClick={handleExportExcel}
                className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 hover:from-blue-800 hover:to-indigo-950 text-white px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
              >
                <Download size={15} />
                Exportar Indicadores (Excel)
              </button>
            </div>
          </div>

          {/* Period Filter Controls */}
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
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

          {/* 4 Internal Navigation Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            {(
              [
                {
                  id: 'visao_geral',
                  label: 'Visão geral',
                  desc: 'Estoque, giro, atendimento e ABC',
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
          ABA 1: VISÃO GERAL (Organizada nos 4 Grupos + Painel Curva ABC)
         =================================================================== */}
      {activeTab === 'visao_geral' && (
        <div className="space-y-8">
          {/* GRUPO 1: ESTOQUE E GIRO */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* 1.1 Valor Total em Estoque */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Valor Total em Estoque
                      </span>
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                        <DollarSign size={16} />
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatCurrency(estoqueGiro.currentStockValue)}
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {estoqueGiro.currentStockUnits.toLocaleString('pt-BR')} un ativas
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Calculado pela soma da quantidade vezes o preço unitário de todos os lotes ativos do setor.
                  </p>
                </div>
              </div>

              {/* 1.2 Giro do Estoque (e Anualizado) */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Giro do Estoque
                      </span>
                      <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                        <Activity size={16} />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
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
                    <p className="text-[10px] font-semibold text-slate-400">
                      Início: {formatCurrency(estoqueGiro.stockAtStartValue)} • Fim:{' '}
                      {formatCurrency(estoqueGiro.stockAtEndValue)}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Valor consumido no período dividido pelo estoque médio (média entre saldo inicial e final reconstruídos).
                  </p>
                </div>
              </div>

              {/* 1.3 Cobertura em Dias */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-blue-700 to-indigo-800" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Cobertura em Dias
                      </span>
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                        <Calendar size={16} />
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {estoqueGiro.stockCoverageDays !== null
                        ? `${Math.round(estoqueGiro.stockCoverageDays).toLocaleString('pt-BR')} dias`
                        : 'Sem consumo'}
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      Média: {formatCurrency(estoqueGiro.dailyAverageConsumptionValue)}/dia
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Valor atual em estoque dividido pelo consumo médio diário do período ({overviewGroups.periodDays} dias).
                  </p>
                </div>
              </div>

              {/* 1.4 Consumo do Período */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-blue-900" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Consumo do Período
                      </span>
                      <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                        <ArrowUpRight size={16} />
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatCurrency(estoqueGiro.netConsumptionValue)}
                    </p>
                    <p className="text-xs font-extrabold text-indigo-700 mt-1">
                      {estoqueGiro.netConsumptionUnits.toLocaleString('pt-BR')} un líquidas
                    </p>
                    {estoqueGiro.returnsInPeriodUnits > 0 && (
                      <p className="text-[10px] font-semibold text-slate-400">
                        Descontadas {estoqueGiro.returnsInPeriodUnits.toLocaleString('pt-BR')} un devolvidas
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Saídas de consumo (ou sem motivo especificado) no período, descontando as entradas de devolução.
                  </p>
                </div>
              </div>

              {/* 1.5 Entradas do Período */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-cyan-600" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Entradas do Período
                      </span>
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                        <ArrowDownLeft size={16} />
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatCurrency(estoqueGiro.regularEntriesValue)}
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {estoqueGiro.regularEntriesUnits.toLocaleString('pt-BR')} un ({estoqueGiro.regularEntriesCount}{' '}
                      registros)
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Soma das quantidades e valores das entradas de abastecimento no período (excluindo devoluções).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GRUPO 2: DISPONIBILIDADE */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 2.1 Taxa de Ruptura */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Taxa de Ruptura
                      </span>
                      <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-700">
                        <AlertTriangle size={18} />
                      </div>
                    </div>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">
                      {formatDecimal(disponibilidade.stockoutRatePct, 1)}%
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {disponibilidade.stockoutMaterialsCount} zerados hoje de{' '}
                      {disponibilidade.materialsWithCons180Count} materiais com consumo (180d)
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Proporção de materiais consolidados pelo nome que tiveram consumo nos últimos 180 dias e hoje estão com saldo zero.
                  </p>
                </div>
              </div>

              {/* 2.2 Materiais Abaixo ou Igual ao Estoque Mínimo */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-indigo-900" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Saldo &le; Estoque Mínimo
                      </span>
                      <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-700">
                        <TrendingDown size={18} />
                      </div>
                    </div>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">
                      {disponibilidade.belowOrEqualMinMaterialsCount}{' '}
                      <span className="text-sm font-bold text-slate-400">materiais</span>
                    </p>
                    <p className="text-xs font-extrabold text-indigo-700 mt-1">
                      De {disponibilidade.totalConsolidatedMaterials} materiais cadastrados no setor
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Quantidade de materiais cuja soma dos saldos de todos os lotes está igual ou abaixo do estoque mínimo de segurança.
                  </p>
                </div>
              </div>

              {/* 2.3 Materiais com Saldo Sem Consumo nos Últimos 180 Dias */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-slate-700" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Sem Giro há 180 Dias
                      </span>
                      <div className="p-2.5 rounded-2xl bg-slate-100 text-slate-700">
                        <Clock size={18} />
                      </div>
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
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Quantidade e valor financeiro dos materiais com saldo positivo que não tiveram nenhuma saída de consumo nos últimos 180 dias.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GRUPO 3: ATENDIMENTO */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* 3.1 Nível de Serviço */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Nível de Serviço
                      </span>
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                        <CheckCircle size={16} />
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatDecimal(atendimento.serviceLevelPct, 1)}%
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {atendimento.deliveredFullRequestsCount} integrais de{' '}
                      {atendimento.deliveredRequestsCount + atendimento.rejectedRequestsCount} finalizadas
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Proporção de solicitações entregues com todos os itens atendidos integralmente sobre o total de entregues e recusadas.
                  </p>
                </div>
              </div>

              {/* 3.2 Percentual de Itens Atendidos */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-blue-800" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        % de Itens Atendidos
                      </span>
                      <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                        <Percent size={16} />
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatDecimal(atendimento.itemsFulfilledPct, 1)}%
                    </p>
                    <p className="text-xs font-extrabold text-indigo-700 mt-1">
                      {atendimento.totalDeliveredItemsQty.toLocaleString('pt-BR')} /{' '}
                      {atendimento.totalRequestedItemsQty.toLocaleString('pt-BR')} un
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Quantidade física total entregue dividida pela quantidade total solicitada nos pedidos do período.
                  </p>
                </div>
              </div>

              {/* 3.3 Lead Time Médio & % <= 48h */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-700" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Lead Time Médio
                      </span>
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                        <Timer size={16} />
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {atendimento.avgLeadTimeHours !== null
                        ? `${formatDecimal(atendimento.avgLeadTimeHours, 1)}h`
                        : 'Sem dados'}
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {formatDecimal(atendimento.within48hPct, 1)}% entregues em até 48h
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Tempo médio decorrido entre a data da solicitação e a confirmação de entrega (deliveredAt).
                  </p>
                </div>
              </div>

              {/* 3.4 Total de Solicitações (Divisão) */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 to-cyan-600" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Total de Solicitações
                      </span>
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                        <Layers size={16} />
                      </div>
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
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Contagem de requisições ativas no período dividida entre entregues, em aberto e recusadas.
                  </p>
                </div>
              </div>

              {/* 3.5 Taxa de Devolução */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-slate-700" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Taxa de Devolução
                      </span>
                      <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                        <RotateCcw size={16} />
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatDecimal(atendimento.returnRateUnitsPct, 2)}%
                    </p>
                    <p className="text-xs font-extrabold text-blue-700 mt-1">
                      {atendimento.returnsInPeriodUnits.toLocaleString('pt-BR')} un devolvidas (
                      {formatDecimal(atendimento.returnRateValuePct, 2)}% em R$)
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Total de unidades devolvidas ao estoque dividido pelo total de saídas de consumo do período.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GRUPO 4: PERDAS E VALIDADE */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 4.1 Saídas por Vencido ou Perda */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Baixas por Vencimento ou Perda
                      </span>
                      <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-700">
                        <TrendingDown size={18} />
                      </div>
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
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Soma do valor e quantidade das saídas com motivo vencido ou perda e sua proporção sobre o valor total das saídas.
                  </p>
                </div>
              </div>

              {/* 4.2 Lotes com Saldo e Validade Vencida */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-indigo-900" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Lotes com Saldo Vencido Hoje
                      </span>
                      <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-700">
                        <AlertTriangle size={18} />
                      </div>
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
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Quantidade e valor financeiro dos lotes com saldo maior que zero e data de validade anterior a hoje (ignorando Indeterminada).
                  </p>
                </div>
              </div>

              {/* 4.3 Lotes que Vencem nos Próximos 60 Dias */}
              <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all overflow-hidden relative flex flex-col justify-between">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-cyan-600" />
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Vencendo nos Próximos 60 Dias
                      </span>
                      <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-700">
                        <Clock size={18} />
                      </div>
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
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug pt-3 border-t border-slate-100">
                    Quantidade e valor dos lotes com saldo positivo que vencem nos próximos 60 dias corridos (ignorando validade Indeterminada).
                  </p>
                </div>
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
                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200 self-start sm:self-auto">
                  Total Consumido: {formatCurrency(curvaABC.totalAbcValue)}
                </span>
              </div>

              {/* ABC Class Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Classe A */}
                <div className="p-5 rounded-2xl bg-gradient-to-b from-blue-50/60 to-white border border-blue-200/80 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-700 text-white text-xs font-black uppercase tracking-wider">
                      Classe A • 80% do Valor
                    </span>
                    <span className="text-xs font-black text-blue-700">
                      {formatDecimal(curvaABC.classA.pctValue, 1)}% efetivo
                    </span>
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
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-black uppercase tracking-wider">
                      Classe B • 15% Seguintes
                    </span>
                    <span className="text-xs font-black text-indigo-700">
                      {formatDecimal(curvaABC.classB.pctValue, 1)}% efetivo
                    </span>
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
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-700 text-white text-xs font-black uppercase tracking-wider">
                      Classe C • 5% Finais
                    </span>
                    <span className="text-xs font-black text-slate-700">
                      {formatDecimal(curvaABC.classC.pctValue, 1)}% efetivo
                    </span>
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
          <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
            <div className="p-6 sm:p-7 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 text-white shadow-sm">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
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
                <span className="text-xs font-extrabold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                  {roomMetrics.roomSummaries.length}{' '}
                  {roomMetrics.roomSummaries.length === 1 ? 'sala ativa' : 'salas ativas'}
                </span>
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
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-indigo-700" />
              <div className="p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  Volume Total Dispensado
                </p>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                  {dispensationByTypeMetrics.totalUnits.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-bold text-slate-400">un</span>
                </h3>
                <p className="text-xs font-bold text-blue-700 mt-2">
                  {dispensationByTypeMetrics.totalRecords} registros de saída no período
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-blue-800" />
              <div className="p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  Custo Total de Dispensação
                </p>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                  {formatCurrency(dispensationByTypeMetrics.totalValue)}
                </h3>
                <p className="text-xs font-bold text-slate-500 mt-2">
                  Valor calculado pelo custo unitário dos itens
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-cyan-600" />
              <div className="p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  Categorias Movimentadas
                </p>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                  {dispensationByTypeMetrics.categoriesList.length}{' '}
                  <span className="text-xs font-bold text-slate-400">tipos</span>
                </h3>
                <p className="text-xs font-bold text-slate-500 mt-2">
                  Classificações com saída ativa no período
                </p>
              </div>
            </div>
          </div>

          {/* Breakdown by Category & Breakdown by Exit Reason / Origin */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Category Breakdown (2 cols) */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Dispensação por Categoria / Tipo de Material
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Participação percentual, volume físico e impacto financeiro por categoria
                    </p>
                  </div>
                  <Layers size={18} className="text-blue-600" />
                </div>

                {dispensationByTypeMetrics.categoriesList.length > 0 ? (
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
                  <h3 className="text-sm font-black text-slate-900">
                    Por Origem do Recurso
                  </h3>
                  {dispensationByTypeMetrics.originsList.length > 0 ? (
                    dispensationByTypeMetrics.originsList.map(orig => (
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
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 font-semibold">Sem registros.</p>
                  )}
                </div>
              </div>

              {/* By Exit Modality/Reason */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden relative">
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-blue-800" />
                <div className="p-6 space-y-3">
                  <h3 className="text-sm font-black text-slate-900">
                    Por Modalidade de Saída
                  </h3>
                  {dispensationByTypeMetrics.reasonsList.length > 0 ? (
                    dispensationByTypeMetrics.reasonsList.map(rsn => (
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
                    ))
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
          ABA 4: DOAÇÕES
         =================================================================== */}
      {activeTab === 'doacoes' && (
        <div className="space-y-6">
          {/* Donation KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Doações Recebidas */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Doações Recebidas (Entradas)
                  </span>
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-2.5 rounded-2xl">
                    <ArrowDownLeft size={18} />
                  </div>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {donationsMetrics.totalReceivedUnits.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-bold text-slate-400">un</span>
                </h3>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">
                    {donationsMetrics.totalReceivedCount} entradas
                  </span>
                  <span className="font-black text-blue-700">
                    {formatCurrency(donationsMetrics.totalReceivedValue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Doações Concedidas (Saídas) */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-700 to-indigo-900" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Doações Concedidas (Saídas)
                  </span>
                  <div className="bg-gradient-to-br from-indigo-600 to-blue-800 text-white p-2.5 rounded-2xl">
                    <HeartHandshake size={18} />
                  </div>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {donationsMetrics.totalDonatedOutUnits.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-bold text-slate-400">un</span>
                </h3>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">
                    {donationsMetrics.totalDonatedOutCount} saídas por doação
                  </span>
                  <span className="font-black text-indigo-700">
                    {formatCurrency(donationsMetrics.totalDonatedOutValue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Estoque Atual de Doação */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-700" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Estoque Atual (Origem Doação)
                  </span>
                  <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-2.5 rounded-2xl">
                    <Package size={18} />
                  </div>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {donationsMetrics.currentDonationStockUnits.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-bold text-slate-400">un</span>
                </h3>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">
                    {donationsMetrics.currentDonationStockCount} lotes ativos
                  </span>
                  <span className="font-black text-blue-700">
                    {formatCurrency(donationsMetrics.currentDonationStockValue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Unidades / Parceiros */}
            <div className="bg-white rounded-3xl border border-blue-100/90 shadow-sm overflow-hidden relative">
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 to-cyan-600" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Unidades & Doadores
                  </span>
                  <div className="bg-gradient-to-br from-blue-600 to-cyan-700 text-white p-2.5 rounded-2xl">
                    <Building2 size={18} />
                  </div>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {donationsMetrics.partnersCount}
                </h3>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">
                    Instituições / parceiros no período
                  </span>
                  <span className="font-black text-blue-700">Ativos</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-filter and Search for Donations */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden relative">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />
            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'todas', label: 'Visão Completa de Doações' },
                      {
                        id: 'entradas',
                        label: `Entradas Recebidas (${donationsMetrics.filteredEntries.length})`
                      },
                      {
                        id: 'saidas',
                        label: `Saídas / Termos de Doação (${donationsMetrics.filteredExits.length})`
                      },
                      {
                        id: 'estoque',
                        label: `Saldo em Estoque (${donationsMetrics.filteredStock.length})`
                      }
                    ] as { id: 'todas' | 'entradas' | 'saidas' | 'estoque'; label: string }[]
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
                    placeholder="Buscar item, unidade, termo..."
                    className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>

              {/* Table 1: Saídas / Termos de Doação */}
              {(donationSubView === 'todas' || donationSubView === 'saidas') && (
                <div className="space-y-3">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <ArrowUpRight size={16} className="text-indigo-600" />
                    Saídas por Doação Concedida no Período ({donationsMetrics.filteredExits.length})
                  </h4>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Data</th>
                          <th className="py-3 px-4">Nº Termo</th>
                          <th className="py-3 px-4">Unidade Recebedora / CNPJ</th>
                          <th className="py-3 px-4">Material Doado</th>
                          <th className="py-3 px-4">Lote / Validade</th>
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
                            <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                              {row.tx.batch_number || 'S/L'} •{' '}
                              {row.tx.expiry_date ? formatDateBR(row.tx.expiry_date) : '—'}
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
                            <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                              Nenhuma saída por doação registrada no período selecionado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Table 2: Entradas por Doação */}
              {(donationSubView === 'todas' || donationSubView === 'entradas') && (
                <div className="space-y-3">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <ArrowDownLeft size={16} className="text-blue-600" />
                    Entradas Recebidas por Doação no Período ({donationsMetrics.filteredEntries.length})
                  </h4>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Data</th>
                          <th className="py-3 px-4">Material Recebido</th>
                          <th className="py-3 px-4">Categoria</th>
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
                            <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                              Nenhuma entrada de doação registrada no período selecionado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Table 3: Estoque Atual de Origem Doação */}
              {(donationSubView === 'todas' || donationSubView === 'estoque') && (
                <div className="space-y-3">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Package size={16} className="text-blue-700" />
                    Lotes em Estoque Atual de Origem Doação ({donationsMetrics.filteredStock.length})
                  </h4>
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
