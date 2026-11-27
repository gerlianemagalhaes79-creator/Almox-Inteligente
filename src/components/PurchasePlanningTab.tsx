import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  X
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { auth, db } from '../firebase';
import {
  Item,
  MaterialRequest,
  PurchaseExclusionReason,
  PurchasePlan,
  PurchasePlanLineItem,
  PurchasePlanModality,
  PurchasePlanStatus,
  PurchasePlanningExclusion,
  RequestItem,
  Transaction,
  UserProfile
} from '../types';
import { getCategorizedExitType } from '../utils/exitReasonUtils';
import { isMedicamentosCategory } from '../utils/medicamentosFilter';
import {
  attachLetterheadToDoc,
  drawContinuationAndPageNumbers,
  drawInstitutionalReportHeader
} from '../utils/letterheadLayout';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

interface PurchasePlanningTabProps {
  items: Item[];
  transactions: Transaction[];
  requests: MaterialRequest[];
  allRequestItems: RequestItem[];
  inventoryLocation: 'Almoxarifado' | 'Farmácia';
  letterheadImage?: string | null;
  userProfile: UserProfile | null;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  isAdmin: boolean;
}

type PlanningSubTab = 'analysis' | 'plans' | 'risks' | 'excluded';
type SafetyOption = 'margin_10' | 'margin_20' | 'days_30' | 'days_60' | 'none';
type GroupByMode = 'none' | 'supplier' | 'category' | 'origin';
type SortMode = 'urgency' | 'cost_desc' | 'qty_desc' | 'name_asc';
type UrgencyLevel = 'ZERADO' | 'URGENTE' | 'PROGRAMAR' | 'SEGURO';
type TrendDirection = 'SUBINDO' | 'ESTAVEL' | 'CAINDO' | 'SEM_HISTORICO';

interface AnalyzedPurchaseItem {
  materialKey: string;
  code: string;
  name: string;
  category: string;
  supplier: string;
  unit_measure: string;
  origin: 'contract' | 'extra' | 'donation';
  abcClass: 'A' | 'B' | 'C';
  physicalStock: number;
  expiredStock: number;
  usableStock: number;
  expiringBeforeConsumption: number;
  expiringFinancialRisk: number;
  earliestExpiringDate: string | null;
  dailyRate: number;
  monthlyRate: number;
  trend: TrendDirection;
  trendPct: number;
  periodDemand: number;
  safetyStock: number;
  totalRequired: number;
  inTransitUnits: number;
  inTransitPlans: string[];
  suggestedQty: number;
  plannedQty: number;
  isManuallyEdited: boolean;
  unitPrice: number;
  missingPrice: boolean;
  estimatedTotal: number;
  coverageDays: number | null;
  daysUntilDeadline: number | null;
  orderDeadlineLabel: string;
  urgency: UrgencyLevel;
  repressedDemandUnits: number;
  repressedRequestsCount: number;
  batchesCount: number;
  note: string;
}

const MONTH_NAMES = [
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

const STATUS_META: Record<
  PurchasePlanStatus,
  { label: string; badge: string; dot: string; countsInTransit: boolean }
> = {
  RASCUNHO: {
    label: 'Rascunho',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
    countsInTransit: false
  },
  ENVIADO: {
    label: 'Enviado p/ Compras / CPSMS',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    countsInTransit: true
  },
  EMPENHADO: {
    label: 'Aprovado / Empenhado',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-600',
    countsInTransit: true
  },
  PARCIAL: {
    label: 'Recebido Parcial',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    countsInTransit: true
  },
  CONCLUIDO: {
    label: 'Recebido / Concluído',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    countsInTransit: false
  },
  CANCELADO: {
    label: 'Cancelado',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    countsInTransit: false
  }
};

const MODALITY_LABELS: Record<PurchasePlanModality, string> = {
  ATA_CONTRATO: 'Ata / Contrato Vigente',
  LICITACAO: 'Processo Licitatório',
  COMPRA_EXTRA: 'Compra Extra / Emergencial',
  DISPENSA: 'Dispensa de Licitação',
  GERAL: 'Planejamento Geral'
};

const ORIGIN_LABELS: Record<'contract' | 'extra' | 'donation', string> = {
  contract: 'Contrato / Ata',
  extra: 'Compra Extra',
  donation: 'Doação'
};

const SAFETY_LABELS: Record<SafetyOption, string> = {
  margin_10: 'Margem +10%',
  margin_20: 'Margem +20%',
  days_30: 'Reserva de 30 dias',
  days_60: 'Reserva de 60 dias',
  none: 'Sem margem extra (0%)'
};

const EXCLUSION_REASON_META: Record<
  PurchaseExclusionReason,
  { label: string; shortLabel: string; badge: string }
> = {
  COMPRA_OCASIONAL: {
    label: 'Compra ocasional / pontual',
    shortLabel: 'Compra Ocasional',
    badge: 'bg-amber-50 text-amber-800 border-amber-200'
  },
  SUBSTITUIDO: {
    label: 'Substituído por outro material',
    shortLabel: 'Substituído',
    badge: 'bg-indigo-50 text-indigo-800 border-indigo-200'
  },
  DESCONTINUADO: {
    label: 'Descontinuado / Sem uso',
    shortLabel: 'Descontinuado',
    badge: 'bg-slate-100 text-slate-700 border-slate-200'
  },
  OUTRO: {
    label: 'Outro motivo',
    shortLabel: 'Outro',
    badge: 'bg-slate-100 text-slate-600 border-slate-200'
  }
};

const normalizeStr = (val?: string | null): string =>
  String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const parseDateSafe = (raw?: string | null): Date | null => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (
    upper === 'N/A' ||
    upper === 'NA' ||
    upper === 'INDETERMINADA' ||
    upper === 'INDETERMINADO' ||
    upper === 'SEM VALIDADE' ||
    upper === '-'
  ) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
    return isNaN(d.getTime()) ? null : d;
  }
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const formatCurrency = (val: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const formatDateBR = (date: Date | string | null | undefined): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseDateSafe(date) : date;
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const PurchasePlanningTab: React.FC<PurchasePlanningTabProps> = ({
  items,
  transactions,
  requests,
  allRequestItems,
  inventoryLocation,
  letterheadImage,
  userProfile,
  showToast,
  isAdmin
}) => {
  // Default target horizon: +3 months from current date
  const defaultTarget = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return { month: d.getMonth(), year: d.getFullYear() };
  }, []);

  // Navigation sub-tab
  const [subTab, setSubTab] = useState<PlanningSubTab>('analysis');

  // Engine parameters (always Almoxarifado; Medicamentos excluded)
  const planningLocation = 'Almoxarifado' as const;
  const leadTimeDays = 0;
  const deductExpiring = false;
  const deductInTransit = false;
  const [targetMonth, setTargetMonth] = useState<number>(defaultTarget.month);
  const [targetYear, setTargetYear] = useState<number>(defaultTarget.year);
  const [historyWindowDays, setHistoryWindowDays] = useState<90 | 180 | 365>(90);
  const [safetyOption, setSafetyOption] = useState<SafetyOption>('margin_10');

  // Filters & view options
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'contract' | 'extra' | 'donation'>('all');
  const [abcFilter, setAbcFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [statusFilter, setStatusFilter] = useState<
    'deficit' | 'all' | 'urgent' | 'repressed' | 'no_price' | 'expiring'
  >('deficit');
  const [groupBy, setGroupBy] = useState<GroupByMode>('none');
  const [sortBy, setSortBy] = useState<SortMode>('urgency');

  // Interactive overrides & selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [hasUserInteractedSelection, setHasUserInteractedSelection] = useState<boolean>(false);
  const [manualQtyMap, setManualQtyMap] = useState<Record<string, number>>({});
  const [itemNotesMap, setItemNotesMap] = useState<Record<string, string>>({});
  const [expandedNoteKey, setExpandedNoteKey] = useState<string | null>(null);

  // Saved purchase plans (Firestore)
  const [savedPlans, setSavedPlans] = useState<PurchasePlan[]>([]);
  const [plansLoading, setPlansLoading] = useState<boolean>(true);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [planStatusFilter, setPlanStatusFilter] = useState<'ALL' | 'OPEN' | PurchasePlanStatus>('ALL');
  const [planToDelete, setPlanToDelete] = useState<PurchasePlan | null>(null);
  const [savingPlan, setSavingPlan] = useState<boolean>(false);

  // Save plan modal state
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [newPlanTitle, setNewPlanTitle] = useState<string>('');
  const [newPlanModality, setNewPlanModality] = useState<PurchasePlanModality>('ATA_CONTRATO');
  const [newPlanStatus, setNewPlanStatus] = useState<PurchasePlanStatus>('ENVIADO');
  const [newPlanProtocol, setNewPlanProtocol] = useState<string>('');
  const [newPlanNotes, setNewPlanNotes] = useState<string>('');

  // Excluded materials (occasional, replaced, discontinued) persisted in Firestore
  const [exclusions, setExclusions] = useState<PurchasePlanningExclusion[]>([]);
  const [excludedSearch, setExcludedSearch] = useState<string>('');
  const [excludedReasonFilter, setExcludedReasonFilter] = useState<'ALL' | PurchaseExclusionReason>('ALL');
  const [itemToExclude, setItemToExclude] = useState<{
    materialKey: string;
    name: string;
    category: string;
  } | null>(null);
  const [excludeReason, setExcludeReason] = useState<PurchaseExclusionReason>('COMPRA_OCASIONAL');
  const [excludeReplacedBy, setExcludeReplacedBy] = useState<string>('');
  const [excludeNote, setExcludeNote] = useState<string>('');
  const [savingExclusion, setSavingExclusion] = useState<boolean>(false);

  // Firestore real-time listener for purchase_plans
  useEffect(() => {
    if (!auth.currentUser) {
      setPlansLoading(false);
      return;
    }
    const colRef = collection(db, 'purchase_plans');
    const unsubscribe = onSnapshot(
      colRef,
      snapshot => {
        const list: PurchasePlan[] = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PurchasePlan, 'id'>)
        }));
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setSavedPlans(list);
        setPlansLoading(false);
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'purchase_plans');
        setPlansLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Firestore real-time listener for purchase_planning_exclusions
  useEffect(() => {
    if (!auth.currentUser) return;
    const colRef = collection(db, 'purchase_planning_exclusions');
    const unsubscribe = onSnapshot(
      colRef,
      snapshot => {
        const list: PurchasePlanningExclusion[] = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PurchasePlanningExclusion, 'id'>)
        }));
        list.sort((a, b) => (b.excludedAt || '').localeCompare(a.excludedAt || ''));
        setExclusions(list);
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'purchase_planning_exclusions');
      }
    );
    return () => unsubscribe();
  }, []);

  // Active excluded material keys for Almoxarifado
  const activeExcludedKeys = useMemo(() => {
    const set = new Set<string>();
    exclusions.forEach(ex => {
      const applies = ex.location === 'all' || ex.location === planningLocation;
      if (applies && ex.materialKey) {
        set.add(ex.materialKey);
      }
    });
    return set;
  }, [exclusions]);

  // Core procurement analysis engine
  const analysis = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const targetDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    const horizonDays = Math.max(
      7,
      Math.ceil((targetDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
    );
    const targetPeriodLabel = `${MONTH_NAMES[targetMonth] || 'Mês'}/${targetYear}`;

    const windowStart = new Date(todayStart.getTime() - historyWindowDays * 24 * 60 * 60 * 1000);
    const windowMid = new Date(
      todayStart.getTime() - Math.floor(historyWindowDays / 2) * 24 * 60 * 60 * 1000
    );

    // 1. Filter active items strictly for Almoxarifado and exclude Medicamentos
    const activeItems = items.filter(item => {
      if (item.deletedAt) return false;
      const loc = item.location || 'Almoxarifado';
      if (loc !== planningLocation) return false;
      if (isMedicamentosCategory(item.category)) return false;
      return true;
    });

    // 2. Group batches by consolidated material key
    interface MaterialAccumulator {
      materialKey: string;
      code: string;
      name: string;
      category: string;
      supplier: string;
      unit_measure: string;
      batches: Item[];
      originCounts: Record<'contract' | 'extra' | 'donation', number>;
    }

    const materialMap = new Map<string, MaterialAccumulator>();
    const itemIdToMaterialKey = new Map<string, string>();

    activeItems.forEach(item => {
      const normName = normalizeStr(item.name);
      if (!normName) return;
      if (activeExcludedKeys.has(normName)) return;
      const key = normName;
      itemIdToMaterialKey.set(item.id, key);

      let acc = materialMap.get(key);
      if (!acc) {
        acc = {
          materialKey: key,
          code: item.material_code || item.code || '',
          name: (item.name || '').trim(),
          category: item.category || 'Sem Categoria',
          supplier: item.supplier || 'Não informado',
          unit_measure: item.unit_measure || 'UN',
          batches: [],
          originCounts: { contract: 0, extra: 0, donation: 0 }
        };
        materialMap.set(key, acc);
      }

      acc.batches.push(item);
      if (!acc.code && (item.material_code || item.code)) {
        acc.code = item.material_code || item.code || '';
      }
      if (item.category && acc.category === 'Sem Categoria') {
        acc.category = item.category;
      }
      if (item.supplier && (acc.supplier === 'Não informado' || (Number(item.quantity) || 0) > 0)) {
        acc.supplier = item.supplier;
      }
      if (item.unit_measure) {
        acc.unit_measure = item.unit_measure;
      }
      const orig: 'contract' | 'extra' | 'donation' =
        item.origin === 'extra' || item.origin === 'donation' ? item.origin : 'contract';
      acc.originCounts[orig] += Math.max(1, Number(item.quantity) || 0);
    });

    // 3. Aggregate REAL consumption exits only (excluding doacao, troca, vencido, perda, ajuste_balanco, returns)
    const consumptionTotalByKey = new Map<string, number>();
    const consumptionFirstHalfByKey = new Map<string, number>();
    const consumptionSecondHalfByKey = new Map<string, number>();

    transactions.forEach(tx => {
      if (tx.deletedAt) return;
      if (tx.type !== 'exit' || tx.isReturn) return;
      const loc = tx.location || 'Almoxarifado';
      if (loc !== planningLocation) return;

      // Exclude non-consumption exits strictly
      if (tx.exitReason === 'troca') return;
      const catExit = getCategorizedExitType(tx);
      if (catExit !== 'consumo') return;

      const txDate = parseDateSafe(tx.date);
      if (!txDate || txDate < windowStart || txDate > now) return;

      const qty = Math.max(0, Number(tx.quantity) || 0);
      if (qty <= 0) return;

      const key = itemIdToMaterialKey.get(tx.item_id) || normalizeStr(tx.item_name);
      if (!key || !materialMap.has(key)) return;

      consumptionTotalByKey.set(key, (consumptionTotalByKey.get(key) || 0) + qty);
      if (txDate >= windowMid) {
        consumptionSecondHalfByKey.set(key, (consumptionSecondHalfByKey.get(key) || 0) + qty);
      } else {
        consumptionFirstHalfByKey.set(key, (consumptionFirstHalfByKey.get(key) || 0) + qty);
      }
    });

    // 4. Detect Repressed Demand (unfulfilled / refused / pending sector requests in the window)
    const requestById = new Map<string, MaterialRequest>();
    requests.forEach(req => {
      if (req.deletedAt || req.isReturn) return;
      const reqDate = parseDateSafe(req.date);
      if (!reqDate || reqDate < windowStart) return;
      requestById.set(req.id, req);
    });

    const repressedUnitsByKey = new Map<string, number>();
    const repressedReqSetByKey = new Map<string, Set<string>>();

    allRequestItems.forEach(ri => {
      const req = requestById.get(ri.request_id);
      if (!req) return;
      const key = itemIdToMaterialKey.get(ri.product_id) || normalizeStr(ri.product_name);
      if (!key || !materialMap.has(key)) return;

      const reqQty = Math.max(0, Number(ri.quantity_requested) || 0);
      const appQty = Math.max(0, Number(ri.quantity_approved) || 0);
      let unfulfilled = 0;

      if (req.status === 'PENDENTE' || req.status === 'RECUSADO') {
        unfulfilled = reqQty;
      } else if (
        req.status === 'APROVADO' ||
        req.status === 'SEPARADO' ||
        req.status === 'EM_SEPARACAO' ||
        req.status === 'ENTREGUE'
      ) {
        unfulfilled = Math.max(0, reqQty - appQty);
      }

      if (unfulfilled > 0) {
        repressedUnitsByKey.set(key, (repressedUnitsByKey.get(key) || 0) + unfulfilled);
        let set = repressedReqSetByKey.get(key);
        if (!set) {
          set = new Set<string>();
          repressedReqSetByKey.set(key, set);
        }
        set.add(req.id);
      }
    });

    // 5. Aggregate In-Transit quantities from open saved purchase_plans
    const inTransitUnitsByKey = new Map<string, number>();
    const inTransitPlansByKey = new Map<string, string[]>();

    savedPlans.forEach(plan => {
      if (!STATUS_META[plan.status]?.countsInTransit) return;
      const locMatches = plan.location === 'all' || plan.location === planningLocation;
      if (!locMatches) return;

      (plan.items || []).forEach(line => {
        const key = line.materialKey || normalizeStr(line.name);
        const pending = Math.max(0, (Number(line.plannedQty) || 0) - (Number(line.receivedQty) || 0));
        if (pending <= 0) return;
        inTransitUnitsByKey.set(key, (inTransitUnitsByKey.get(key) || 0) + pending);
        const arr = inTransitPlansByKey.get(key) || [];
        if (!arr.includes(plan.code)) arr.push(plan.code);
        inTransitPlansByKey.set(key, arr);
      });
    });

    // 6. Compute full per-material metrics (including FIFO expiry-aware usable stock)
    interface RawAnalyzed extends Omit<AnalyzedPurchaseItem, 'abcClass'> {
      annualizedConsumptionValue: number;
    }

    const rawList: RawAnalyzed[] = [];

    materialMap.forEach(mat => {
      const totalConsumedInWindow = consumptionTotalByKey.get(mat.materialKey) || 0;
      const dailyRate = totalConsumedInWindow / historyWindowDays;
      const monthlyRate = dailyRate * 30;

      // Trend analysis
      const firstHalf = consumptionFirstHalfByKey.get(mat.materialKey) || 0;
      const secondHalf = consumptionSecondHalfByKey.get(mat.materialKey) || 0;
      let trend: TrendDirection = 'ESTAVEL';
      let trendPct = 0;
      if (firstHalf === 0 && secondHalf === 0) {
        trend = 'SEM_HISTORICO';
        trendPct = 0;
      } else if (firstHalf === 0 && secondHalf > 0) {
        trend = 'SUBINDO';
        trendPct = 100;
      } else {
        trendPct = Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
        if (trendPct >= 15) trend = 'SUBINDO';
        else if (trendPct <= -15) trend = 'CAINDO';
        else trend = 'ESTAVEL';
      }

      // Latest non-zero unit price across batches
      let unitPrice = 0;
      const pricedBatches = mat.batches.filter(b => (Number(b.unit_price) || 0) > 0);
      if (pricedBatches.length > 0) {
        unitPrice = Number(pricedBatches[pricedBatches.length - 1].unit_price) || 0;
      }

      // Predominant origin
      let origin: 'contract' | 'extra' | 'donation' = 'contract';
      if (
        mat.originCounts.extra >= mat.originCounts.contract &&
        mat.originCounts.extra >= mat.originCounts.donation &&
        mat.originCounts.extra > 0
      ) {
        origin = 'extra';
      } else if (
        mat.originCounts.donation > mat.originCounts.contract &&
        mat.originCounts.donation > mat.originCounts.extra
      ) {
        origin = 'donation';
      }

      // FIFO / FEFO expiry-aware usable stock simulation
      let physicalStock = 0;
      let expiredStock = 0;
      let usableStock = 0;
      let expiringBeforeConsumption = 0;
      let expiringFinancialRisk = 0;
      let earliestExpiringDate: string | null = null;

      interface BatchSim {
        qty: number;
        expiry: Date | null;
        daysUntilExpiry: number;
        price: number;
      }

      const validBatches: BatchSim[] = [];
      mat.batches.forEach(b => {
        const qty = Math.max(0, Number(b.quantity) || 0);
        if (qty <= 0) return;
        physicalStock += qty;
        const bPrice = (Number(b.unit_price) || 0) > 0 ? Number(b.unit_price) : unitPrice;
        const expDate = parseDateSafe(b.expiry_date);
        if (expDate && expDate < todayStart) {
          expiredStock += qty;
          return;
        }
        const daysUntilExpiry = expDate
          ? Math.max(0, Math.floor((expDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)))
          : Number.POSITIVE_INFINITY;
        validBatches.push({ qty, expiry: expDate, daysUntilExpiry, price: bPrice });
      });

      validBatches.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

      let daysConsumedCursor = 0;
      validBatches.forEach(b => {
        if (!Number.isFinite(b.daysUntilExpiry) || b.daysUntilExpiry >= horizonDays) {
          usableStock += b.qty;
          if (dailyRate > 0) {
            daysConsumedCursor += b.qty / dailyRate;
          }
        } else {
          // Batch expires BEFORE the target horizon ends
          if (dailyRate > 0) {
            const availDays = Math.max(0, b.daysUntilExpiry - daysConsumedCursor);
            const maxConsumable = Math.floor(availDays * dailyRate);
            const consumedBeforeExp = Math.min(b.qty, maxConsumable);
            const wasted = b.qty - consumedBeforeExp;
            usableStock += consumedBeforeExp;
            if (wasted > 0) {
              expiringBeforeConsumption += wasted;
              expiringFinancialRisk += wasted * b.price;
              if (!earliestExpiringDate && b.expiry) {
                earliestExpiringDate = b.expiry.toISOString();
              }
            }
            daysConsumedCursor += consumedBeforeExp / dailyRate;
          } else {
            // Zero consumption in history window -> batch expiring before target horizon is at risk
            expiringBeforeConsumption += b.qty;
            expiringFinancialRisk += b.qty * b.price;
            if (!earliestExpiringDate && b.expiry) {
              earliestExpiringDate = b.expiry.toISOString();
            }
          }
        }
      });

      const effectiveStock = deductExpiring
        ? usableStock
        : Math.max(0, physicalStock - expiredStock);

      const periodDemand = Math.ceil(dailyRate * horizonDays);

      let safetyStock = 0;
      if (safetyOption === 'margin_10') {
        safetyStock = Math.ceil(periodDemand * 0.1);
      } else if (safetyOption === 'margin_20') {
        safetyStock = Math.ceil(periodDemand * 0.2);
      } else if (safetyOption === 'days_30') {
        safetyStock = Math.ceil(dailyRate * 30);
      } else if (safetyOption === 'days_60') {
        safetyStock = Math.ceil(dailyRate * 60);
      } else {
        safetyStock = 0;
      }

      const inTransitUnits = inTransitUnitsByKey.get(mat.materialKey) || 0;
      const inTransitPlans = inTransitPlansByKey.get(mat.materialKey) || [];
      const effectiveInTransit = deductInTransit ? inTransitUnits : 0;

      const totalRequired = periodDemand + safetyStock;
      const suggestedQty = Math.max(0, totalRequired - effectiveStock - effectiveInTransit);

      const hasManualOverride = Object.prototype.hasOwnProperty.call(manualQtyMap, mat.materialKey);
      const plannedQty = hasManualOverride
        ? Math.max(0, Math.round(manualQtyMap[mat.materialKey]))
        : suggestedQty;

      const coverageDays =
        dailyRate > 0 ? Math.floor((effectiveStock + effectiveInTransit) / dailyRate) : null;
      const daysUntilDeadline = coverageDays;

      const repressedDemandUnits = repressedUnitsByKey.get(mat.materialKey) || 0;
      const repressedRequestsCount = repressedReqSetByKey.get(mat.materialKey)?.size || 0;

      let orderDeadlineLabel = 'Sob demanda';
      if (effectiveStock === 0 && dailyRate > 0) {
        orderDeadlineLabel = 'Zerado';
      } else if (coverageDays !== null) {
        orderDeadlineLabel = `${coverageDays} dias`;
      }

      let urgency: UrgencyLevel = 'SEGURO';
      if (effectiveStock === 0 && dailyRate > 0) {
        urgency = 'ZERADO';
      } else if (coverageDays !== null && coverageDays <= 30 && suggestedQty > 0) {
        urgency = 'URGENTE';
      } else if (suggestedQty > 0) {
        urgency = 'PROGRAMAR';
      } else {
        urgency = 'SEGURO';
      }

      rawList.push({
        materialKey: mat.materialKey,
        code: mat.code,
        name: mat.name,
        category: mat.category,
        supplier: mat.supplier,
        unit_measure: mat.unit_measure,
        origin,
        physicalStock,
        expiredStock,
        usableStock,
        expiringBeforeConsumption,
        expiringFinancialRisk,
        earliestExpiringDate,
        dailyRate,
        monthlyRate,
        trend,
        trendPct,
        periodDemand,
        safetyStock,
        totalRequired,
        inTransitUnits,
        inTransitPlans,
        suggestedQty,
        plannedQty,
        isManuallyEdited: hasManualOverride && plannedQty !== suggestedQty,
        unitPrice,
        missingPrice: unitPrice <= 0,
        estimatedTotal: plannedQty * unitPrice,
        coverageDays,
        daysUntilDeadline,
        orderDeadlineLabel,
        urgency,
        repressedDemandUnits,
        repressedRequestsCount,
        batchesCount: mat.batches.filter(b => (Number(b.quantity) || 0) > 0).length,
        note: itemNotesMap[mat.materialKey] || '',
        annualizedConsumptionValue: dailyRate * 365 * unitPrice
      });
    });

    // 7. Assign ABC Curve based on annualized consumption financial value
    const sortedForABC = [...rawList].sort(
      (a, b) => b.annualizedConsumptionValue - a.annualizedConsumptionValue
    );
    const totalAnnualValue = sortedForABC.reduce((acc, r) => acc + r.annualizedConsumptionValue, 0);
    const abcMap = new Map<string, 'A' | 'B' | 'C'>();
    let cumValue = 0;
    sortedForABC.forEach(r => {
      if (totalAnnualValue <= 0 || r.annualizedConsumptionValue <= 0) {
        abcMap.set(r.materialKey, 'C');
        return;
      }
      const prevPct = cumValue / totalAnnualValue;
      cumValue += r.annualizedConsumptionValue;
      if (prevPct < 0.8) abcMap.set(r.materialKey, 'A');
      else if (prevPct < 0.95) abcMap.set(r.materialKey, 'B');
      else abcMap.set(r.materialKey, 'C');
    });

    const allAnalyzed: AnalyzedPurchaseItem[] = rawList.map(r => {
      const { annualizedConsumptionValue: _ignored, ...rest } = r;
      return {
        ...rest,
        abcClass: abcMap.get(r.materialKey) || 'C'
      };
    });

    // Collect filter options
    const categories = Array.from(new Set(allAnalyzed.map(i => i.category))).sort((a, b) =>
      a.localeCompare(b)
    );
    const suppliers = Array.from(new Set(allAnalyzed.map(i => i.supplier))).sort((a, b) =>
      a.localeCompare(b)
    );

    // Risk lists (computed across full location scope for the Risk Radar tab)
    const urgentRiskItems = allAnalyzed
      .filter(i => i.urgency === 'ZERADO' || i.urgency === 'URGENTE')
      .sort((a, b) => {
        if (a.urgency !== b.urgency) return a.urgency === 'ZERADO' ? -1 : 1;
        return (a.coverageDays ?? -1) - (b.coverageDays ?? -1);
      });

    const expiringRiskItems = allAnalyzed
      .filter(i => i.expiringBeforeConsumption > 0)
      .sort((a, b) => b.expiringFinancialRisk - a.expiringFinancialRisk || b.expiringBeforeConsumption - a.expiringBeforeConsumption);

    const repressedRiskItems = allAnalyzed
      .filter(i => i.repressedDemandUnits > 0)
      .sort((a, b) => b.repressedDemandUnits - a.repressedDemandUnits);

    const missingPriceDeficitItems = allAnalyzed
      .filter(i => i.missingPrice && i.plannedQty > 0)
      .sort((a, b) => b.plannedQty - a.plannedQty);

    return {
      targetPeriodLabel,
      horizonDays,
      horizonMonths: Number((horizonDays / 30).toFixed(1)),
      allAnalyzed,
      categories,
      suppliers,
      urgentRiskItems,
      expiringRiskItems,
      repressedRiskItems,
      missingPriceDeficitItems,
      totalDeficitItems: allAnalyzed.filter(i => i.plannedQty > 0).length,
      totalInTransitUnits: allAnalyzed.reduce((acc, i) => acc + i.inTransitUnits, 0),
      totalExpiringUnits: allAnalyzed.reduce((acc, i) => acc + i.expiringBeforeConsumption, 0),
      totalExpiringRiskValue: allAnalyzed.reduce((acc, i) => acc + i.expiringFinancialRisk, 0)
    };
  }, [
    items,
    transactions,
    requests,
    allRequestItems,
    savedPlans,
    targetMonth,
    targetYear,
    historyWindowDays,
    safetyOption,
    manualQtyMap,
    itemNotesMap,
    activeExcludedKeys
  ]);

  // Initialize default selection once with items that have deficit > 0
  useEffect(() => {
    if (!hasUserInteractedSelection && analysis.allAnalyzed.length > 0) {
      const defaults = new Set<string>(
        analysis.allAnalyzed.filter(i => i.plannedQty > 0).map(i => i.materialKey)
      );
      setSelectedKeys(defaults);
    }
  }, [analysis.allAnalyzed, hasUserInteractedSelection]);

  // Apply table filters & sorting
  const filteredItems = useMemo(() => {
    const q = normalizeStr(searchQuery);
    const list = analysis.allAnalyzed.filter(item => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (supplierFilter !== 'all' && item.supplier !== supplierFilter) return false;
      if (originFilter !== 'all' && item.origin !== originFilter) return false;
      if (abcFilter !== 'all' && item.abcClass !== abcFilter) return false;

      if (statusFilter === 'deficit' && item.plannedQty <= 0 && !item.isManuallyEdited) return false;
      if (statusFilter === 'urgent' && item.urgency !== 'ZERADO' && item.urgency !== 'URGENTE')
        return false;
      if (statusFilter === 'repressed' && item.repressedDemandUnits <= 0) return false;
      if (statusFilter === 'no_price' && !(item.missingPrice && item.plannedQty > 0)) return false;
      if (statusFilter === 'expiring' && item.expiringBeforeConsumption <= 0) return false;

      if (q) {
        const match =
          normalizeStr(item.name).includes(q) ||
          normalizeStr(item.category).includes(q) ||
          normalizeStr(item.supplier).includes(q) ||
          normalizeStr(item.code).includes(q);
        if (!match) return false;
      }
      return true;
    });

    const urgencyRank: Record<UrgencyLevel, number> = {
      ZERADO: 0,
      URGENTE: 1,
      PROGRAMAR: 2,
      SEGURO: 3
    };

    list.sort((a, b) => {
      if (sortBy === 'urgency') {
        if (urgencyRank[a.urgency] !== urgencyRank[b.urgency]) {
          return urgencyRank[a.urgency] - urgencyRank[b.urgency];
        }
        const covA = a.coverageDays ?? 99999;
        const covB = b.coverageDays ?? 99999;
        if (covA !== covB) return covA - covB;
        return b.estimatedTotal - a.estimatedTotal;
      }
      if (sortBy === 'cost_desc') return b.estimatedTotal - a.estimatedTotal;
      if (sortBy === 'qty_desc') return b.plannedQty - a.plannedQty;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [
    analysis.allAnalyzed,
    searchQuery,
    categoryFilter,
    supplierFilter,
    originFilter,
    abcFilter,
    statusFilter,
    sortBy
  ]);

  // Grouping for Supplier / Category / Origin views
  const groupedItems = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupName: 'Todos os Materiais', items: filteredItems }];
    }
    const map = new Map<string, AnalyzedPurchaseItem[]>();
    filteredItems.forEach(item => {
      const gKey =
        groupBy === 'supplier'
          ? item.supplier
          : groupBy === 'category'
            ? item.category
            : ORIGIN_LABELS[item.origin];
      const arr = map.get(gKey) || [];
      arr.push(item);
      map.set(gKey, arr);
    });
    return Array.from(map.entries())
      .map(([groupName, groupList]) => ({ groupName, items: groupList }))
      .sort((a, b) => {
        const costA = a.items.reduce((s, x) => s + x.estimatedTotal, 0);
        const costB = b.items.reduce((s, x) => s + x.estimatedTotal, 0);
        return costB - costA;
      });
  }, [filteredItems, groupBy]);

  // Selected items summary
  const selectedItems = useMemo(
    () => analysis.allAnalyzed.filter(i => selectedKeys.has(i.materialKey) && i.plannedQty > 0),
    [analysis.allAnalyzed, selectedKeys]
  );

  const selectedSummary = useMemo(() => {
    const totalUnits = selectedItems.reduce((acc, i) => acc + i.plannedQty, 0);
    const totalCost = selectedItems.reduce((acc, i) => acc + i.estimatedTotal, 0);
    const missingPriceCount = selectedItems.filter(i => i.missingPrice).length;
    const urgentCount = selectedItems.filter(
      i => i.urgency === 'ZERADO' || i.urgency === 'URGENTE'
    ).length;
    return {
      count: selectedItems.length,
      totalUnits,
      totalCost,
      missingPriceCount,
      urgentCount
    };
  }, [selectedItems]);

  // Selection helpers
  const toggleItemSelection = (key: string) => {
    setHasUserInteractedSelection(true);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisibleDeficit = () => {
    setHasUserInteractedSelection(true);
    setSelectedKeys(new Set(filteredItems.filter(i => i.plannedQty > 0).map(i => i.materialKey)));
  };

  const clearSelection = () => {
    setHasUserInteractedSelection(true);
    setSelectedKeys(new Set());
  };

  const handleManualQtyChange = (key: string, rawVal: string) => {
    const cleaned = rawVal.replace(/[^\d]/g, '');
    const num = cleaned === '' ? 0 : Math.max(0, Math.min(9999999, parseInt(cleaned, 10)));
    setManualQtyMap(prev => ({ ...prev, [key]: num }));
    if (num > 0) {
      setHasUserInteractedSelection(true);
      setSelectedKeys(prev => new Set(prev).add(key));
    }
  };

  const resetManualQty = (key: string) => {
    setManualQtyMap(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const jumpToAnalysisWithItems = (
    keys: string[],
    filterMode: 'deficit' | 'all' | 'urgent' | 'repressed' | 'no_price' | 'expiring'
  ) => {
    setHasUserInteractedSelection(true);
    setSelectedKeys(new Set(keys));
    setStatusFilter(filterMode);
    setSubTab('analysis');
  };

  // Generate institutional horizontal A4 PDF for current selection OR a saved PurchasePlan
  const exportPlanToPDF = (options?: { savedPlan?: PurchasePlan }) => {
    try {
      const plan = options?.savedPlan;
      const rowsSource = plan
        ? plan.items
        : selectedItems.length > 0
          ? selectedItems
          : filteredItems.filter(i => i.plannedQty > 0);

      if (!rowsSource || rowsSource.length === 0) {
        showToast('Selecione ou filtre ao menos um item com quantidade a comprar para gerar o PDF.', 'error');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const layout = attachLetterheadToDoc(doc, letterheadImage);

      const totalUnits = rowsSource.reduce((acc, r) => acc + r.plannedQty, 0);
      const totalValue = rowsSource.reduce((acc, r) => acc + r.estimatedTotal, 0);
      const missingPriceCount = rowsSource.filter(r => (r.unitPrice || 0) <= 0).length;

      const title = plan
        ? `Solicitação / Plano de Compras — ${plan.code}`
        : `Planejamento Estratégico de Compras`;
      const subtitle = plan
        ? `${plan.title} • ${MODALITY_LABELS[plan.modality] || plan.modality}`
        : `Cobertura projetada até ${analysis.targetPeriodLabel} (${analysis.horizonDays} dias) • Base de consumo real de ${historyWindowDays} dias`;

      const locLabel = 'Almoxarifado';

      const startY = drawInstitutionalReportHeader(doc, layout, {
        kicker: `POLICLÍNICA DE SOBRAL • ${locLabel.toUpperCase()}`,
        title,
        subtitle,
        emissionText: `Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        rightHighlight: {
          label: 'VALOR ESTIMADO TOTAL',
          value: formatCurrency(totalValue),
          valueColor: [30, 58, 138]
        },
        metadata: [
          { label: 'Horizonte Alvo', value: plan ? plan.targetPeriodLabel : analysis.targetPeriodLabel },
          { label: 'Unidade / Estoque', value: locLabel },
          {
            label: 'Base de Consumo',
            value: `Últimos ${plan ? plan.historyWindowDays : historyWindowDays} dias`
          },
          {
            label: 'Itens / Unidades',
            value: `${rowsSource.length} itens (${totalUnits.toLocaleString('pt-BR')} un)`
          },
          {
            label: plan ? 'Status do Plano' : 'Margem de Segurança',
            value: plan
              ? STATUS_META[plan.status]?.label || plan.status
              : SAFETY_LABELS[safetyOption]
          },
          {
            label: plan?.protocolNumber ? 'Protocolo / Processo' : 'Responsável',
            value: plan?.protocolNumber || plan?.createdBy || userProfile?.name || 'Almoxarifado'
          }
        ],
        metadataColumns: 3,
        observation:
          missingPriceCount > 0
            ? `Atenção: ${missingPriceCount} ${missingPriceCount === 1 ? 'item não possui' : 'itens não possuem'} preço unitário cadastrado; o valor total estimado considera apenas itens precificados.`
            : plan?.notes || undefined,
        observationTone: missingPriceCount > 0 ? 'warning' : 'info',
        methodology:
          'Metodologia: consumo médio do Almoxarifado baseado exclusivamente em saídas reais de consumo interno dos setores (excluindo medicamentos, doações, trocas, perdas e baixas por vencimento).'
      });

      const head = [
        [
          '#',
          'Material / Especificação',
          'Categoria',
          'Fornecedor / Origem',
          'ABC',
          'Estoque Atual',
          'Cons./Mês',
          'Cobert.',
          'Qtd. Comprar',
          'Vlr. Unit.',
          'Vlr. Estimado',
          'Observação'
        ]
      ];

      const body = rowsSource.map((item: any, idx: number) => {
        const currentStock = Math.max(
          0,
          (item.currentPhysicalStock ?? item.physicalStock ?? 0) - (item.expiredStock ?? 0)
        );
        const monthly = item.monthlyConsumption ?? item.monthlyRate ?? 0;
        const covDays = item.coverageDays;
        const originText = ORIGIN_LABELS[item.origin as 'contract' | 'extra' | 'donation'] || 'Contrato';

        return [
          String(idx + 1),
          `${item.name} (${item.unit_measure || 'UN'})`,
          item.category || '—',
          `${item.supplier || 'Diversos'}\n[${originText}]`,
          item.abcClass || 'C',
          `${currentStock.toLocaleString('pt-BR')} un`,
          `${monthly.toFixed(1)}`,
          covDays !== null && covDays !== undefined ? `${covDays} d` : '—',
          `${item.plannedQty.toLocaleString('pt-BR')} un`,
          item.unitPrice > 0 ? formatCurrency(item.unitPrice) : 'S/ preço',
          item.unitPrice > 0 ? formatCurrency(item.estimatedTotal) : '—',
          item.note || 'Reposição programada'
        ];
      });

      autoTable(doc, {
        head,
        body,
        startY,
        margin: {
          top: layout.continuationTop,
          bottom: layout.marginBottom,
          left: layout.marginLeft,
          right: layout.marginRight
        },
        styles: {
          fontSize: 7.4,
          cellPadding: 2,
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
          valign: 'middle',
          textColor: [30, 41, 59]
        },
        headStyles: {
          fillColor: [15, 76, 129],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.4,
          halign: 'center'
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 7 },
          1: { halign: 'left', cellWidth: 52 },
          2: { halign: 'left', cellWidth: 26 },
          3: { halign: 'left', cellWidth: 36 },
          4: { halign: 'center', cellWidth: 9 },
          5: { halign: 'right', cellWidth: 18 },
          6: { halign: 'right', cellWidth: 16 },
          7: { halign: 'center', cellWidth: 14 },
          8: { halign: 'right', cellWidth: 20, fontStyle: 'bold', textColor: [30, 58, 138] },
          9: { halign: 'right', cellWidth: 18 },
          10: { halign: 'right', cellWidth: 22, fontStyle: 'bold' },
          11: { halign: 'left' }
        }
      });

      const finalY = (doc as any).lastAutoTable?.finalY || startY + 20;
      const sigY = finalY + 14;
      if (sigY + 14 < layout.contentBottom) {
        const lineW = 80;
        const leftX = layout.marginLeft + 18;
        const rightX = layout.pageWidth - layout.marginRight - lineW - 18;
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.3);
        doc.line(leftX, sigY, leftX + lineW, sigY);
        doc.line(rightX, sigY, rightX + lineW, sigY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text(userProfile?.name || 'Responsável pelo Almoxarifado', leftX + lineW / 2, sigY + 4.5, {
          align: 'center'
        });
        doc.text('Direção Administrativa / Compras CPSMS', rightX + lineW / 2, sigY + 4.5, {
          align: 'center'
        });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('Planejamento de Compras • Policlínica de Sobral', leftX + lineW / 2, sigY + 8.5, {
          align: 'center'
        });
        doc.text('Ciência e Encaminhamento', rightX + lineW / 2, sigY + 8.5, {
          align: 'center'
        });
      }

      drawContinuationAndPageNumbers(doc, layout, {
        title,
        rightHeaderText: plan ? plan.code : `Até ${analysis.targetPeriodLabel}`,
        footerLeftText: 'Policlínica de Sobral • Planejamento de Compras'
      });

      const fileDate = new Date().toISOString().split('T')[0];
      const safeSlug = (plan ? plan.code : analysis.targetPeriodLabel).replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`Planejamento_Compras_${safeSlug}_${fileDate}.pdf`);
      showToast('PDF institucional de Planejamento de Compras gerado com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao gerar PDF de Planejamento de Compras:', err);
      showToast('Erro ao gerar PDF do Planejamento de Compras.', 'error');
    }
  };

  // Multi-sheet Excel export
  const exportPlanToExcel = (options?: { savedPlan?: PurchasePlan }) => {
    try {
      const plan = options?.savedPlan;
      const rowsSource = plan
        ? plan.items
        : selectedItems.length > 0
          ? selectedItems
          : filteredItems.filter(i => i.plannedQty > 0);

      if (!rowsSource || rowsSource.length === 0) {
        showToast('Nenhum item com quantidade a comprar para exportar.', 'error');
        return;
      }

      const wb = XLSX.utils.book_new();

      // Sheet 1: Lista de Compras
      const mainRows = rowsSource.map((item: any) => ({
        Material: item.name,
        Unidade: item.unit_measure || 'UN',
        Categoria: item.category,
        Fornecedor: item.supplier,
        Origem: ORIGIN_LABELS[item.origin as 'contract' | 'extra' | 'donation'] || 'Contrato',
        'Curva ABC': item.abcClass,
        'Estoque Atual': Math.max(
          0,
          (item.currentPhysicalStock ?? item.physicalStock ?? 0) - (item.expiredStock ?? 0)
        ),
        'Consumo Mensal Real': Number((item.monthlyConsumption ?? item.monthlyRate ?? 0).toFixed(2)),
        'Cobertura (Dias)': item.coverageDays ?? 'S/ consumo',
        'Qtd. Sugerida': item.suggestedQty ?? item.plannedQty,
        'Qtd. a Comprar': item.plannedQty,
        'Preço Unitário (R$)': Number((item.unitPrice || 0).toFixed(2)),
        'Valor Estimado (R$)': Number((item.estimatedTotal || 0).toFixed(2)),
        Observação: item.note || ''
      }));
      const ws1 = XLSX.utils.json_to_sheet(mainRows);
      XLSX.utils.book_append_sheet(wb, ws1, 'Lista de Compras');

      // Sheet 2: Resumo por Fornecedor
      const bySup = new Map<string, { itens: number; unidades: number; valor: number }>();
      rowsSource.forEach((item: any) => {
        const sup = item.supplier || 'Não informado';
        const cur = bySup.get(sup) || { itens: 0, unidades: 0, valor: 0 };
        cur.itens += 1;
        cur.unidades += item.plannedQty || 0;
        cur.valor += item.estimatedTotal || 0;
        bySup.set(sup, cur);
      });
      const supRows = Array.from(bySup.entries())
        .map(([fornecedor, d]) => ({
          Fornecedor: fornecedor,
          'Qtd. Itens': d.itens,
          'Total Unidades': d.unidades,
          'Valor Estimado (R$)': Number(d.valor.toFixed(2))
        }))
        .sort((a, b) => b['Valor Estimado (R$)'] - a['Valor Estimado (R$)']);
      const ws2 = XLSX.utils.json_to_sheet(supRows);
      XLSX.utils.book_append_sheet(wb, ws2, 'Por Fornecedor');

      // Sheet 3: Alertas de Risco (when exporting live analysis)
      if (!plan) {
        const riskRows = [
          ...analysis.urgentRiskItems.map(i => ({
            Tipo: i.urgency === 'ZERADO' ? 'Ruptura (Zerado)' : 'Comprar Urgente (< Lead Time)',
            Material: i.name,
            Categoria: i.category,
            Detalhe: `Cobertura: ${i.coverageDays ?? 0} dias | Estoque útil: ${i.usableStock} un`,
            'Qtd. / Risco': i.plannedQty,
            'Impacto (R$)': Number(i.estimatedTotal.toFixed(2))
          })),
          ...analysis.expiringRiskItems.map(i => ({
            Tipo: 'Lote Vencendo Antes do Consumo',
            Material: i.name,
            Categoria: i.category,
            Detalhe: `Vencimento próximo: ${formatDateBR(i.earliestExpiringDate)}`,
            'Qtd. / Risco': i.expiringBeforeConsumption,
            'Impacto (R$)': Number(i.expiringFinancialRisk.toFixed(2))
          })),
          ...analysis.repressedRiskItems.map(i => ({
            Tipo: 'Demanda Reprimida',
            Material: i.name,
            Categoria: i.category,
            Detalhe: `${i.repressedRequestsCount} requisição(ões) não atendida(s) integralmente`,
            'Qtd. / Risco': i.repressedDemandUnits,
            'Impacto (R$)': Number((i.repressedDemandUnits * i.unitPrice).toFixed(2))
          }))
        ];
        if (riskRows.length > 0) {
          const ws3 = XLSX.utils.json_to_sheet(riskRows);
          XLSX.utils.book_append_sheet(wb, ws3, 'Alertas de Risco');
        }
      }

      const fileDate = new Date().toISOString().split('T')[0];
      const safeSlug = (plan ? plan.code : analysis.targetPeriodLabel).replace(/[^a-zA-Z0-9_-]/g, '_');
      XLSX.writeFile(wb, `Planejamento_Compras_${safeSlug}_${fileDate}.xlsx`);
      showToast('Planilha Excel de Planejamento de Compras baixada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      showToast('Erro ao gerar planilha Excel.', 'error');
    }
  };

  // Open Save Plan Modal
  const handleOpenSaveModal = () => {
    if (selectedItems.length === 0) {
      showToast('Selecione ao menos um item com quantidade maior que zero para salvar o plano.', 'error');
      return;
    }
    setNewPlanTitle(`Compra Almoxarifado — Cobertura até ${analysis.targetPeriodLabel}`);
    setNewPlanModality(originFilter === 'extra' ? 'COMPRA_EXTRA' : 'ATA_CONTRATO');
    setNewPlanStatus('ENVIADO');
    setNewPlanProtocol('');
    setNewPlanNotes('');
    setShowSaveModal(true);
  };

  // Persist new PurchasePlan in Firestore
  const handleConfirmSavePlan = async () => {
    if (!isAdmin) {
      showToast('Apenas administradores podem salvar planos de compra.', 'error');
      return;
    }
    const cleanTitle = newPlanTitle.trim().slice(0, 160);
    if (!cleanTitle) {
      showToast('Informe um título para o plano de compra.', 'error');
      return;
    }
    if (selectedItems.length === 0) {
      showToast('Nenhum item selecionado para salvar.', 'error');
      return;
    }

    setSavingPlan(true);
    try {
      const nowIso = new Date().toISOString();
      const seqNum = String(savedPlans.length + 1).padStart(3, '0');
      const code = `PC-${new Date().getFullYear()}-${seqNum}`.slice(0, 40);

      const lineItems: PurchasePlanLineItem[] = selectedItems.slice(0, 500).map(item => ({
        materialKey: item.materialKey,
        name: item.name,
        category: item.category,
        supplier: item.supplier,
        unit_measure: item.unit_measure,
        origin: item.origin,
        abcClass: item.abcClass,
        currentPhysicalStock: item.physicalStock,
        usableStock: Math.max(0, item.physicalStock - item.expiredStock),
        expiringBeforeConsumption: 0,
        monthlyConsumption: Number(item.monthlyRate.toFixed(2)),
        coverageDays: item.coverageDays,
        suggestedQty: item.suggestedQty,
        plannedQty: item.plannedQty,
        receivedQty: 0,
        unitPrice: Number(item.unitPrice.toFixed(2)),
        estimatedTotal: Number(item.estimatedTotal.toFixed(2)),
        orderDeadline: item.orderDeadlineLabel,
        note: (item.note || '').slice(0, 300)
      }));

      const payload: Omit<PurchasePlan, 'id'> = {
        code,
        title: cleanTitle,
        status: newPlanStatus,
        modality: newPlanModality,
        location: planningLocation,
        targetPeriodLabel: analysis.targetPeriodLabel.slice(0, 60),
        targetMonth,
        targetYear,
        historyWindowDays,
        leadTimeDays,
        safetyOption,
        budgetCap: null,
        protocolNumber: newPlanProtocol.trim().slice(0, 80),
        notes: newPlanNotes.trim().slice(0, 2000),
        items: lineItems,
        totalItems: lineItems.length,
        totalUnits: lineItems.reduce((acc, l) => acc + l.plannedQty, 0),
        totalEstimatedCost: Number(
          lineItems.reduce((acc, l) => acc + l.estimatedTotal, 0).toFixed(2)
        ),
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: (userProfile?.name || auth.currentUser?.displayName || 'Administrador').slice(0, 120),
        createdByEmail: (userProfile?.email || auth.currentUser?.email || 'admin@local').slice(0, 150)
      };

      await addDoc(collection(db, 'purchase_plans'), payload);
      setShowSaveModal(false);
      showToast(`Plano ${code} salvo com sucesso!`, 'success');
      setSubTab('plans');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'purchase_plans');
      showToast('Erro ao salvar plano de compra. Verifique sua conexão e permissões.', 'error');
    } finally {
      setSavingPlan(false);
    }
  };

  // Update status of an existing PurchasePlan
  const handleUpdatePlanStatus = async (plan: PurchasePlan, nextStatus: PurchasePlanStatus) => {
    if (!isAdmin) return;
    try {
      const updatedItems =
        nextStatus === 'CONCLUIDO'
          ? plan.items.map(it => ({ ...it, receivedQty: it.plannedQty }))
          : plan.items;
      await updateDoc(doc(db, 'purchase_plans', plan.id), {
        status: nextStatus,
        items: updatedItems,
        updatedAt: new Date().toISOString()
      });
      showToast(`Status do plano ${plan.code} atualizado para "${STATUS_META[nextStatus].label}".`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `purchase_plans/${plan.id}`);
      showToast('Erro ao atualizar status do plano.', 'error');
    }
  };

  // Update partial received quantity of a line item in a saved PurchasePlan
  const handleUpdateLineReceivedQty = async (
    plan: PurchasePlan,
    lineIndex: number,
    newReceived: number
  ) => {
    if (!isAdmin) return;
    try {
      const clamped = Math.max(0, Math.min(plan.items[lineIndex].plannedQty, Math.round(newReceived)));
      const updatedItems = plan.items.map((it, idx) =>
        idx === lineIndex ? { ...it, receivedQty: clamped } : it
      );
      const allReceived = updatedItems.every(it => (it.receivedQty || 0) >= it.plannedQty);
      const anyReceived = updatedItems.some(it => (it.receivedQty || 0) > 0);
      const inferredStatus: PurchasePlanStatus = allReceived
        ? 'CONCLUIDO'
        : anyReceived
          ? 'PARCIAL'
          : plan.status;

      await updateDoc(doc(db, 'purchase_plans', plan.id), {
        items: updatedItems,
        status: inferredStatus,
        updatedAt: new Date().toISOString()
      });
      showToast('Quantidade recebida atualizada.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `purchase_plans/${plan.id}`);
      showToast('Erro ao atualizar quantidade recebida.', 'error');
    }
  };

  const handleConfirmDeletePlan = async () => {
    if (!planToDelete || !isAdmin) return;
    try {
      await deleteDoc(doc(db, 'purchase_plans', planToDelete.id));
      showToast(`Plano ${planToDelete.code} excluído.`, 'success');
      setPlanToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `purchase_plans/${planToDelete.id}`);
      showToast('Erro ao excluir plano de compra.', 'error');
    }
  };

  // Open Exclude Material modal
  const openExcludeModal = (item: { materialKey: string; name: string; category: string }) => {
    setItemToExclude(item);
    setExcludeReason('COMPRA_OCASIONAL');
    setExcludeReplacedBy('');
    setExcludeNote('');
  };

  // Save exclusion to Firestore (hides material from Purchase Planning & Risk Alerts only)
  const handleConfirmExcludeMaterial = async () => {
    if (!itemToExclude || !isAdmin) return;
    setSavingExclusion(true);
    try {
      const payload: Omit<PurchasePlanningExclusion, 'id'> = {
        materialKey: itemToExclude.materialKey.slice(0, 200),
        materialName: itemToExclude.name.slice(0, 200),
        category: (itemToExclude.category || 'Sem Categoria').slice(0, 120),
        location: planningLocation,
        reason: excludeReason,
        replacedBy:
          excludeReason === 'SUBSTITUIDO' ? excludeReplacedBy.trim().slice(0, 200) : '',
        note: excludeNote.trim().slice(0, 500),
        excludedAt: new Date().toISOString(),
        excludedBy: (userProfile?.name || auth.currentUser?.displayName || 'Administrador').slice(
          0,
          120
        ),
        excludedByEmail: (userProfile?.email || auth.currentUser?.email || 'admin@local').slice(
          0,
          150
        )
      };

      await addDoc(collection(db, 'purchase_planning_exclusions'), payload);

      // Remove from active selection if selected
      setSelectedKeys(prev => {
        if (!prev.has(itemToExclude.materialKey)) return prev;
        const next = new Set(prev);
        next.delete(itemToExclude.materialKey);
        return next;
      });

      showToast(
        `"${itemToExclude.name}" foi removido do Planejamento de Compras (estoque e histórico intactos).`,
        'success'
      );
      setItemToExclude(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'purchase_planning_exclusions');
      showToast('Erro ao ocultar material do planejamento.', 'error');
    } finally {
      setSavingExclusion(false);
    }
  };

  // Restore excluded material back into Purchase Planning
  const handleRestoreExcludedMaterial = async (exclusion: PurchasePlanningExclusion) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'purchase_planning_exclusions', exclusion.id));
      showToast(`"${exclusion.materialName}" reativado no Planejamento de Compras.`, 'success');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `purchase_planning_exclusions/${exclusion.id}`
      );
      showToast('Erro ao reativar material no planejamento.', 'error');
    }
  };

  // Filtered exclusions for Desconsiderados sub-tab
  const visibleExclusions = useMemo(() => {
    const q = normalizeStr(excludedSearch);
    return exclusions.filter(ex => {
      if (excludedReasonFilter !== 'ALL' && ex.reason !== excludedReasonFilter) return false;
      if (q) {
        const hit =
          normalizeStr(ex.materialName).includes(q) ||
          normalizeStr(ex.category).includes(q) ||
          normalizeStr(ex.replacedBy).includes(q) ||
          normalizeStr(ex.note).includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [exclusions, excludedSearch, excludedReasonFilter]);

  // Filtered saved plans
  const visibleSavedPlans = useMemo(() => {
    return savedPlans.filter(p => {
      if (planStatusFilter === 'ALL') return true;
      if (planStatusFilter === 'OPEN') return STATUS_META[p.status]?.countsInTransit;
      return p.status === planStatusFilter;
    });
  }, [savedPlans, planStatusFilter]);

  const openPlansCount = useMemo(
    () => savedPlans.filter(p => STATUS_META[p.status]?.countsInTransit).length,
    [savedPlans]
  );

  const totalRiskCount =
    analysis.urgentRiskItems.length +
    analysis.expiringRiskItems.length +
    analysis.repressedRiskItems.length;

  const renderUrgencyBadge = (urgency: UrgencyLevel) => {
    if (urgency === 'ZERADO') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
          Zerado
        </span>
      );
    }
    if (urgency === 'URGENTE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200 uppercase tracking-wide">
          <Clock size={10} />
          Pedir Urgente
        </span>
      );
    }
    if (urgency === 'PROGRAMAR') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
          Programar
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wide">
        Seguro
      </span>
    );
  };

  const renderTrendBadge = (trend: TrendDirection, pct: number) => {
    if (trend === 'SUBINDO') {
      return (
        <span
          className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-rose-600"
          title={`Consumo cresceu ${pct}% na metade recente do período`}
        >
          <ArrowUpRight size={11} /> +{pct}%
        </span>
      );
    }
    if (trend === 'CAINDO') {
      return (
        <span
          className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-emerald-600"
          title={`Consumo reduziu ${Math.abs(pct)}% na metade recente do período`}
        >
          <ArrowDownRight size={11} /> {pct}%
        </span>
      );
    }
    if (trend === 'ESTAVEL') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-400">
          <Minus size={10} /> Estável
        </span>
      );
    }
    return <span className="text-[10px] text-slate-400 font-medium">Sem saída</span>;
  };

  return (
    <div className="space-y-6">
      {/* Top Sub-Navigation & Global Actions */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-teal-500" />
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white shadow-md shadow-indigo-600/20 shrink-0">
              <ShoppingCart size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">
                  Central de Planejamento de Compras
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Até {analysis.targetPeriodLabel} ({analysis.horizonDays}d)
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Planejamento de reposição do Almoxarifado baseado no consumo real dos setores, com ajuste de quantidades e exportação em PDF e Excel.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('analysis')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                subTab === 'analysis'
                  ? 'bg-gradient-to-r from-blue-700 to-indigo-800 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              <SlidersHorizontal size={14} />
              Análise e Sugestão
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  subTab === 'analysis'
                    ? 'bg-white/20 text-white'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {analysis.totalDeficitItems}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('plans')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                subTab === 'plans'
                  ? 'bg-gradient-to-r from-blue-700 to-indigo-800 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              <FolderKanban size={14} />
              Pedidos e Planos
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  subTab === 'plans'
                    ? 'bg-white/20 text-white'
                    : openPlansCount > 0
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {savedPlans.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('risks')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                subTab === 'risks'
                  ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-md shadow-rose-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
              }`}
            >
              <ShieldAlert size={14} />
              Alertas de Risco
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  subTab === 'risks'
                    ? 'bg-white/20 text-white'
                    : totalRiskCount > 0
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {totalRiskCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('excluded')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                subTab === 'excluded'
                  ? 'bg-slate-800 text-white shadow-md shadow-slate-800/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
              title="Materiais ocultados do planejamento por serem compras ocasionais, substituídos ou descontinuados"
            >
              <EyeOff size={14} />
              Desconsiderados
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  subTab === 'excluded'
                    ? 'bg-white/20 text-white'
                    : exclusions.length > 0
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {exclusions.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: ANÁLISE E SUGESTÃO DE COMPRA                              */}
      {/* ===================================================================== */}
      {subTab === 'analysis' && (
        <div className="space-y-6">
          {/* Parameters Configuration Panel — Clean & Focused */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-indigo-600" />
                <h4 className="text-sm font-black text-slate-800">
                  Parâmetros do Cálculo — Almoxarifado
                </h4>
              </div>
              <span className="text-[11px] font-bold text-slate-500">
                Horizonte projetado: <strong className="text-indigo-700">{analysis.horizonDays} dias</strong> (~{analysis.horizonMonths} meses)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Cobrir Até (Mês)
                </label>
                <select
                  value={targetMonth}
                  onChange={e => setTargetMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Ano Alvo
                </label>
                <select
                  value={targetYear}
                  onChange={e => setTargetYear(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  {Array.from({ length: 4 }).map((_, i) => {
                    const y = new Date().getFullYear() + i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Base de Consumo Real
                </label>
                <select
                  value={historyWindowDays}
                  onChange={e => setHistoryWindowDays(Number(e.target.value) as 90 | 180 | 365)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  <option value={90}>Últimos 3 meses (90d)</option>
                  <option value={180}>Últimos 6 meses (180d)</option>
                  <option value={365}>Últimos 12 meses (365d)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Margem de Segurança
                </label>
                <select
                  value={safetyOption}
                  onChange={e => setSafetyOption(e.target.value as SafetyOption)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  {(Object.keys(SAFETY_LABELS) as SafetyOption[]).map(opt => (
                    <option key={opt} value={opt}>
                      {SAFETY_LABELS[opt]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 3 Clean Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Selecionados p/ Compra
              </p>
              <p className="text-2xl font-black text-indigo-700 mt-1">
                {selectedSummary.count}
                <span className="text-xs font-bold text-slate-400 ml-1">
                  / {analysis.allAnalyzed.length}
                </span>
              </p>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                {selectedSummary.totalUnits.toLocaleString('pt-BR')} unidades a adquirir
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-2xs">
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                Valor Estimado (Seleção)
              </p>
              <p className="text-xl font-black text-slate-900 mt-1 truncate" title={formatCurrency(selectedSummary.totalCost)}>
                {formatCurrency(selectedSummary.totalCost)}
              </p>
              <p
                className={`text-[11px] font-bold mt-1 ${
                  selectedSummary.missingPriceCount > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {selectedSummary.missingPriceCount > 0
                  ? `${selectedSummary.missingPriceCount} sem preço unit.`
                  : '100% precificados'}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Horizonte de Cobertura
              </p>
              <p className="text-xl font-black text-slate-900 mt-1">
                Até {analysis.targetPeriodLabel}
              </p>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                {analysis.horizonDays} dias (~{analysis.horizonMonths} meses) • Base {historyWindowDays}d
              </p>
            </div>
          </div>

          {/* Filters, Grouping & Export Toolbar */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2 relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar material, categoria, fornecedor..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
              >
                <option value="deficit">Apenas com Necessidade de Compra</option>
                <option value="no_price">Com Déficit e Sem Preço</option>
                <option value="all">Todos os Materiais ({analysis.allAnalyzed.length})</option>
              </select>

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
              >
                <option value="all">Todas Categorias</option>
                {analysis.categories.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={supplierFilter}
                onChange={e => setSupplierFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
              >
                <option value="all">Todos Fornecedores</option>
                {analysis.suppliers.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={originFilter}
                  onChange={e => setOriginFilter(e.target.value as any)}
                  className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
                  title="Filtrar por origem"
                >
                  <option value="all">Origens</option>
                  <option value="contract">Contrato</option>
                  <option value="extra">Extra</option>
                  <option value="donation">Doação</option>
                </select>
                <select
                  value={abcFilter}
                  onChange={e => setAbcFilter(e.target.value as any)}
                  className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
                  title="Filtrar por Curva ABC"
                >
                  <option value="all">ABC</option>
                  <option value="A">Classe A</option>
                  <option value="B">Classe B</option>
                  <option value="C">Classe C</option>
                </select>
              </div>
            </div>

            {/* Grouping, Sorting, Bulk Select & Action Buttons */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                  <Layers size={13} className="text-slate-500 ml-1.5" />
                  {(
                    [
                      { id: 'none', label: 'Lista' },
                      { id: 'supplier', label: 'Por Fornecedor' },
                      { id: 'category', label: 'Por Categoria' },
                      { id: 'origin', label: 'Contrato x Extra' }
                    ] as { id: GroupByMode; label: string }[]
                  ).map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGroupBy(g.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                        groupBy === g.id
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortMode)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-extrabold text-slate-700 cursor-pointer"
                >
                  <option value="urgency">Ordenar: Menor Cobertura</option>
                  <option value="cost_desc">Ordenar: Maior Valor Estimado</option>
                  <option value="qty_desc">Ordenar: Maior Qtd. a Comprar</option>
                  <option value="name_asc">Ordenar: A–Z</option>
                </select>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={selectAllVisibleDeficit}
                    className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-extrabold cursor-pointer transition-colors"
                  >
                    Selecionar Filtrados
                  </button>
                  {selectedKeys.size > 0 && (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer transition-colors"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportPlanToExcel()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <FileSpreadsheet size={15} />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportPlanToPDF()}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <FileText size={15} />
                  PDF Institucional
                </button>
                <button
                  type="button"
                  onClick={handleOpenSaveModal}
                  disabled={selectedSummary.count === 0}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 hover:from-blue-800 hover:to-indigo-950 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <Save size={15} />
                  Salvar Plano / Pedido ({selectedSummary.count})
                </button>
              </div>
            </div>
          </div>

          {/* Main Editable Purchase Table (Grouped or Flat) */}
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center space-y-2">
              <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
              <p className="text-sm font-black text-slate-800">
                Nenhum item encontrado para os filtros aplicados
              </p>
              <p className="text-xs text-slate-500">
                Experimente alterar o filtro de status para &quot;Todos os Materiais&quot; ou expandir o horizonte de cobertura.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedItems.map(group => {
                const groupUnits = group.items.reduce((acc, i) => acc + i.plannedQty, 0);
                const groupCost = group.items.reduce((acc, i) => acc + i.estimatedTotal, 0);
                return (
                  <div
                    key={group.groupName}
                    className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
                  >
                    {groupBy !== 'none' && (
                      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Building2 size={15} className="text-indigo-600" />
                          <span className="text-sm font-black text-slate-900">
                            {group.groupName}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800">
                            {group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-extrabold">
                          <span className="text-slate-600">
                            Total: <strong className="text-indigo-700">{groupUnits.toLocaleString('pt-BR')} un</strong>
                          </span>
                          <span className="text-slate-900">{formatCurrency(groupCost)}</span>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/90 border-b border-slate-200">
                            <th className="py-3 px-3 text-center w-10">
                              <span className="sr-only">Selecionar</span>
                            </th>
                            <th className="py-3 px-3 text-[10px] font-black text-slate-500 uppercase tracking-wider min-w-[230px]">
                              Material / Classificação
                            </th>
                            <th className="py-3 px-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">
                              Estoque Atual
                            </th>
                            <th className="py-3 px-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">
                              Consumo Real
                            </th>
                            <th className="py-3 px-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">
                              Cobertura
                            </th>
                            <th className="py-3 px-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center min-w-[145px]">
                              Qtd. a Comprar
                            </th>
                            <th className="py-3 px-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">
                              Valor Estimado
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.items.map(item => {
                            const isSelected = selectedKeys.has(item.materialKey);
                            const isNoteOpen = expandedNoteKey === item.materialKey;
                            const availableStock = Math.max(0, item.physicalStock - item.expiredStock);
                            return (
                              <React.Fragment key={item.materialKey}>
                                <tr
                                  className={`transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-50/30 hover:bg-indigo-50/60'
                                      : 'hover:bg-slate-50/80'
                                  }`}
                                >
                                  <td className="py-3 px-3 text-center align-top pt-4">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleItemSelection(item.materialKey)}
                                      className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </td>

                                  <td className="py-3 px-3 align-top">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-black text-slate-900 leading-snug">
                                          {item.name}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                                            {item.category}
                                          </span>
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                              item.abcClass === 'A'
                                                ? 'bg-indigo-100 text-indigo-800'
                                                : item.abcClass === 'B'
                                                  ? 'bg-blue-50 text-blue-700'
                                                  : 'bg-slate-100 text-slate-500'
                                            }`}
                                          >
                                            ABC: {item.abcClass}
                                          </span>
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                              item.origin === 'contract'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : item.origin === 'extra'
                                                  ? 'bg-amber-50 text-amber-800'
                                                  : 'bg-sky-50 text-sky-700'
                                            }`}
                                          >
                                            {ORIGIN_LABELS[item.origin]}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 font-semibold mt-1">
                                          Fornecedor: {item.supplier} • {item.unit_measure}
                                        </p>

                                        {/* Contextual Actions */}
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                          {item.missingPrice && item.plannedQty > 0 && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                                              Sem preço cadastrado
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedNoteKey(isNoteOpen ? null : item.materialKey)
                                            }
                                            className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                                          >
                                            {item.note ? 'Editar obs.' : '+ Obs.'}
                                          </button>
                                          <span className="text-slate-300">•</span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openExcludeModal({
                                                materialKey: item.materialKey,
                                                name: item.name,
                                                category: item.category
                                              })
                                            }
                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-rose-700 cursor-pointer transition-colors"
                                            title="Remover do planejamento (compra ocasional ou substituído)"
                                          >
                                            <EyeOff size={10} />
                                            Ocultar do planejamento
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="py-3 px-3 text-right align-top">
                                    <p className="text-xs font-black text-slate-900 tabular-nums">
                                      {availableStock.toLocaleString('pt-BR')} un
                                    </p>
                                    {item.expiredStock > 0 && (
                                      <p className="text-[10px] font-extrabold text-rose-600">
                                        -{item.expiredStock.toLocaleString('pt-BR')} vencidos
                                      </p>
                                    )}
                                  </td>

                                  <td className="py-3 px-3 text-right align-top">
                                    <p className="text-xs font-black text-slate-800 tabular-nums">
                                      {item.monthlyRate.toFixed(1)}/mês
                                    </p>
                                    <p className="text-[10px] font-semibold text-slate-400 tabular-nums">
                                      Demanda: {item.periodDemand.toLocaleString('pt-BR')} un
                                    </p>
                                    <div className="mt-0.5">
                                      {renderTrendBadge(item.trend, item.trendPct)}
                                    </div>
                                  </td>

                                  <td className="py-3 px-3 text-center align-top">
                                    <div className="flex flex-col items-center gap-1">
                                      {renderUrgencyBadge(item.urgency)}
                                      <span className="text-[11px] font-extrabold text-slate-700 tabular-nums">
                                        {item.coverageDays !== null
                                          ? `${item.coverageDays} dias`
                                          : 'Sem saída'}
                                      </span>
                                    </div>
                                  </td>

                                  <td className="py-3 px-3 text-center align-top">
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          value={item.plannedQty}
                                          onChange={e =>
                                            handleManualQtyChange(item.materialKey, e.target.value)
                                          }
                                          className={`w-24 px-2 py-1.5 text-center rounded-xl border text-xs font-black tabular-nums focus:ring-2 focus:ring-indigo-500/20 ${
                                            item.isManuallyEdited
                                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                                              : item.plannedQty > 0
                                                ? 'bg-white border-indigo-200 text-indigo-800'
                                                : 'bg-slate-50 border-slate-200 text-slate-500'
                                          }`}
                                        />
                                        {item.isManuallyEdited && (
                                          <button
                                            type="button"
                                            onClick={() => resetManualQty(item.materialKey)}
                                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                                            title={`Restaurar sugestão (${item.suggestedQty} un)`}
                                          >
                                            <RotateCcw size={12} />
                                          </button>
                                        )}
                                      </div>
                                      <span className="text-[10px] font-semibold text-slate-400">
                                        Sugerido: {item.suggestedQty.toLocaleString('pt-BR')} un
                                      </span>
                                    </div>
                                  </td>

                                  <td className="py-3 px-3 text-right align-top">
                                    <p className="text-xs font-black text-slate-900 tabular-nums">
                                      {item.unitPrice > 0
                                        ? formatCurrency(item.estimatedTotal)
                                        : '—'}
                                    </p>
                                    <p className="text-[10px] font-semibold text-slate-400 tabular-nums">
                                      {item.unitPrice > 0
                                        ? `Unit: ${formatCurrency(item.unitPrice)}`
                                        : 'Preço R$ 0,00'}
                                    </p>
                                  </td>
                                </tr>

                                {isNoteOpen && (
                                  <tr className="bg-indigo-50/40">
                                    <td colSpan={7} className="px-4 py-2.5">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-extrabold text-indigo-800 shrink-0">
                                          Justificativa / Obs. do item:
                                        </span>
                                        <input
                                          type="text"
                                          value={item.note}
                                          onChange={e =>
                                            setItemNotesMap(prev => ({
                                              ...prev,
                                              [item.materialKey]: e.target.value.slice(0, 280)
                                            }))
                                          }
                                          placeholder="Ex.: Priorizar entrega imediata, embalagem caixa c/ 100 un..."
                                          className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setExpandedNoteKey(null)}
                                          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold cursor-pointer"
                                        >
                                          OK
                                        </button>
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
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: PEDIDOS E PLANOS SALVOS (CONTROLE DE EM TRÂNSITO)          */}
      {/* ===================================================================== */}
      {subTab === 'plans' && (
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-slate-900">
                Acompanhamento de Planos e Pedidos de Compra
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Histórico de planos e pedidos salvos do Almoxarifado, com acompanhamento de status, recebimento e exportação.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: `Todos (${savedPlans.length})` },
                  { id: 'OPEN', label: `Em Aberto (${openPlansCount})` },
                  { id: 'RASCUNHO', label: 'Rascunhos' },
                  { id: 'CONCLUIDO', label: 'Concluídos' }
                ] as { id: 'ALL' | 'OPEN' | PurchasePlanStatus; label: string }[]
              ).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPlanStatusFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    planStatusFilter === f.id
                      ? 'bg-indigo-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {plansLoading ? (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center text-xs font-bold text-slate-500">
              Carregando planos de compra...
            </div>
          ) : visibleSavedPlans.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center space-y-3">
              <FolderKanban size={38} className="text-slate-300 mx-auto" />
              <p className="text-sm font-black text-slate-800">
                Nenhum plano de compra salvo nesta visualização
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Vá em <strong>Análise e Sugestão</strong>, revise as quantidades e clique em{' '}
                <strong>Salvar Plano / Pedido</strong> para registrar sua solicitação e acompanhar o andamento.
              </p>
              <button
                type="button"
                onClick={() => setSubTab('analysis')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-extrabold cursor-pointer"
              >
                <Plus size={14} /> Criar Novo Plano
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleSavedPlans.map(plan => {
                const meta = STATUS_META[plan.status] || STATUS_META.RASCUNHO;
                const isExpanded = expandedPlanId === plan.id;
                const totalReceived = (plan.items || []).reduce(
                  (acc, l) => acc + (Number(l.receivedQty) || 0),
                  0
                );
                const pendingUnits = Math.max(0, plan.totalUnits - totalReceived);
                const pctDone =
                  plan.totalUnits > 0 ? Math.min(100, Math.round((totalReceived / plan.totalUnits) * 100)) : 0;

                return (
                  <div
                    key={plan.id}
                    className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
                  >
                    <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white text-[11px] font-black tracking-wide">
                            {plan.code}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${meta.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold">
                            {MODALITY_LABELS[plan.modality] || plan.modality}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold">
                            {plan.location === 'all' ? 'Consolidado' : plan.location}
                          </span>
                        </div>
                        <h5 className="text-sm font-black text-slate-900">{plan.title}</h5>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Criado em {formatDateBR(plan.createdAt)} por <strong>{plan.createdBy}</strong> • Cobertura alvo:{' '}
                          <strong>{plan.targetPeriodLabel}</strong>
                          {plan.protocolNumber ? ` • Processo/Prot.: ${plan.protocolNumber}` : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-900">
                            {formatCurrency(plan.totalEstimatedCost)}
                          </p>
                          <p className="text-[11px] font-bold text-slate-500">
                            {plan.totalItems} itens • {plan.totalUnits.toLocaleString('pt-BR')} un
                            {meta.countsInTransit && pendingUnits > 0 && (
                              <span className="text-teal-700 ml-1">
                                ({pendingUnits.toLocaleString('pt-BR')} em trânsito)
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => exportPlanToPDF({ savedPlan: plan })}
                            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 transition-colors cursor-pointer"
                            title="Exportar PDF deste plano"
                          >
                            <FileText size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => exportPlanToExcel({ savedPlan: plan })}
                            className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 transition-colors cursor-pointer"
                            title="Exportar Excel deste plano"
                          >
                            <Download size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlanToDelete(plan)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 transition-colors cursor-pointer"
                            title="Excluir plano"
                          >
                            <Trash2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-extrabold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            Detalhes
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Workflow Status Action Strip */}
                    <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase">
                          Recebimento: {pctDone}%
                        </span>
                        <div className="flex-1 max-w-[200px] h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${pctDone}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {plan.status === 'RASCUNHO' && (
                          <button
                            type="button"
                            onClick={() => handleUpdatePlanStatus(plan, 'ENVIADO')}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold cursor-pointer"
                          >
                            Marcar como Enviado p/ Compras
                          </button>
                        )}
                        {(plan.status === 'RASCUNHO' || plan.status === 'ENVIADO') && (
                          <button
                            type="button"
                            onClick={() => handleUpdatePlanStatus(plan, 'EMPENHADO')}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold cursor-pointer"
                          >
                            Marcar Empenhado
                          </button>
                        )}
                        {plan.status !== 'CONCLUIDO' && plan.status !== 'CANCELADO' && (
                          <button
                            type="button"
                            onClick={() => handleUpdatePlanStatus(plan, 'CONCLUIDO')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold cursor-pointer"
                          >
                            Concluir (Recebido Total)
                          </button>
                        )}
                        {plan.status !== 'CANCELADO' && plan.status !== 'CONCLUIDO' && (
                          <button
                            type="button"
                            onClick={() => handleUpdatePlanStatus(plan, 'CANCELADO')}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Line Items with Partial Receipt Editing */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 p-5 space-y-3 bg-white">
                        {plan.notes && (
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                            <strong className="text-slate-900">Observações:</strong> {plan.notes}
                          </div>
                        )}
                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="py-2.5 px-3 text-[10px] font-black text-slate-500 uppercase">
                                  Material
                                </th>
                                <th className="py-2.5 px-3 text-[10px] font-black text-slate-500 uppercase">
                                  Fornecedor / Origem
                                </th>
                                <th className="py-2.5 px-3 text-[10px] font-black text-slate-500 uppercase text-right">
                                  Solicitado
                                </th>
                                <th className="py-2.5 px-3 text-[10px] font-black text-slate-500 uppercase text-center">
                                  Já Recebido
                                </th>
                                <th className="py-2.5 px-3 text-[10px] font-black text-slate-500 uppercase text-right">
                                  Em Trânsito
                                </th>
                                <th className="py-2.5 px-3 text-[10px] font-black text-slate-500 uppercase text-right">
                                  Valor Estimado
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(plan.items || []).map((line, idx) => {
                                const rem = Math.max(0, line.plannedQty - (line.receivedQty || 0));
                                return (
                                  <tr key={`${line.materialKey}-${idx}`} className="hover:bg-slate-50/70">
                                    <td className="py-2.5 px-3">
                                      <p className="text-xs font-extrabold text-slate-900">
                                        {line.name}
                                      </p>
                                      <p className="text-[10px] text-slate-500">
                                        {line.category} • ABC {line.abcClass}
                                        {line.note ? ` • ${line.note}` : ''}
                                      </p>
                                    </td>
                                    <td className="py-2.5 px-3 text-xs font-semibold text-slate-600">
                                      {line.supplier}
                                      <span className="block text-[10px] text-slate-400">
                                        {ORIGIN_LABELS[line.origin] || 'Contrato'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-xs font-black text-right tabular-nums text-slate-900">
                                      {line.plannedQty.toLocaleString('pt-BR')} {line.unit_measure}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={line.plannedQty}
                                        disabled={plan.status === 'CANCELADO'}
                                        defaultValue={line.receivedQty || 0}
                                        onBlur={e => {
                                          const val = Number(e.target.value) || 0;
                                          if (val !== (line.receivedQty || 0)) {
                                            handleUpdateLineReceivedQty(plan, idx, val);
                                          }
                                        }}
                                        className="w-20 px-2 py-1 text-center rounded-lg border border-slate-200 text-xs font-black text-emerald-700 bg-slate-50 focus:bg-white"
                                        title="Informe a quantidade já entregue para baixa parcial do Em Trânsito"
                                      />
                                    </td>
                                    <td className="py-2.5 px-3 text-xs font-black text-right tabular-nums text-teal-700">
                                      {meta.countsInTransit ? `${rem.toLocaleString('pt-BR')} un` : '0 un'}
                                    </td>
                                    <td className="py-2.5 px-3 text-xs font-black text-right tabular-nums text-slate-900">
                                      {formatCurrency(line.estimatedTotal)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 3: ALERTAS DE RISCO                                           */}
      {/* ===================================================================== */}
      {subTab === 'risks' && (
        <div className="space-y-6">
          {/* Risk 1: Ruptura & Comprar Urgente (Dentro do Lead Time) */}
          <div className="bg-white rounded-3xl border border-rose-200/80 shadow-sm overflow-hidden">
            <div className="p-5 bg-rose-50/70 border-b border-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-2xl bg-rose-600 text-white shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-rose-950">
                    1. Ruptura Crítica e Compras Urgentes ({analysis.urgentRiskItems.length} itens)
                  </h4>
                  <p className="text-xs text-rose-800/80 font-medium">
                    Materiais zerados ou cuja cobertura atual está igual ou abaixo de 30 dias.
                  </p>
                </div>
              </div>
              {analysis.urgentRiskItems.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    jumpToAnalysisWithItems(
                      analysis.urgentRiskItems.map(i => i.materialKey),
                      'deficit'
                    )
                  }
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer shrink-0"
                >
                  Selecionar e Ir para Compra
                </button>
              )}
            </div>

            {analysis.urgentRiskItems.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-emerald-700">
                Nenhum item em ruptura ou com cobertura abaixo de 30 dias.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                      <th className="py-2.5 px-4">Material</th>
                      <th className="py-2.5 px-4 text-center">Situação</th>
                      <th className="py-2.5 px-4 text-right">Est. Útil</th>
                      <th className="py-2.5 px-4 text-right">Cons./Mês</th>
                      <th className="py-2.5 px-4 text-center">Cobertura</th>
                      <th className="py-2.5 px-4 text-right">Qtd. Sugerida</th>
                      <th className="py-2.5 px-4 text-center w-24">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.urgentRiskItems.slice(0, 25).map(item => (
                      <tr key={item.materialKey} className="hover:bg-rose-50/30">
                        <td className="py-2.5 px-4">
                          <p className="text-xs font-black text-slate-900">{item.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {item.category} • {item.supplier}
                          </p>
                        </td>
                        <td className="py-2.5 px-4 text-center">{renderUrgencyBadge(item.urgency)}</td>
                        <td className="py-2.5 px-4 text-xs font-black text-right tabular-nums">
                          {item.usableStock.toLocaleString('pt-BR')} un
                        </td>
                        <td className="py-2.5 px-4 text-xs font-bold text-right tabular-nums text-slate-700">
                          {item.monthlyRate.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-4 text-xs font-black text-center text-rose-700">
                          {item.coverageDays !== null ? `${item.coverageDays} dias` : '0 dias'}
                        </td>
                        <td className="py-2.5 px-4 text-xs font-black text-right tabular-nums text-indigo-700">
                          {item.suggestedQty.toLocaleString('pt-BR')} un
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              openExcludeModal({
                                materialKey: item.materialKey,
                                name: item.name,
                                category: item.category
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 text-[10px] font-extrabold cursor-pointer transition-colors"
                            title="Desconsiderar do planejamento (ocasional ou substituído)"
                          >
                            <EyeOff size={11} /> Ocultar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Risk 2: Lotes que Vencem Antes do Consumo */}
          <div className="bg-white rounded-3xl border border-amber-200/80 shadow-sm overflow-hidden">
            <div className="p-5 bg-amber-50/70 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500 text-white shrink-0">
                  <Clock size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-950">
                    2. Lotes que Vencem Antes do Consumo ({analysis.expiringRiskItems.length} itens •{' '}
                    {formatCurrency(analysis.totalExpiringRiskValue)})
                  </h4>
                  <p className="text-xs text-amber-900/80 font-medium">
                    Unidades em estoque que, no ritmo atual de consumo, tendem a expirar até {analysis.targetPeriodLabel}. Avalie remanejamento ou doação preventiva.
                  </p>
                </div>
              </div>
              {analysis.expiringRiskItems.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    jumpToAnalysisWithItems(
                      analysis.expiringRiskItems.filter(i => i.plannedQty > 0).map(i => i.materialKey),
                      'expiring'
                    )
                  }
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold cursor-pointer shrink-0"
                >
                  Ver na Análise
                </button>
              )}
            </div>

            {analysis.expiringRiskItems.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-emerald-700">
                Nenhum lote com risco de vencer antes do consumo no horizonte selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                      <th className="py-2.5 px-4">Material</th>
                      <th className="py-2.5 px-4 text-center">Próximo Vencimento</th>
                      <th className="py-2.5 px-4 text-right">Est. Físico</th>
                      <th className="py-2.5 px-4 text-right">Est. Útil Real</th>
                      <th className="py-2.5 px-4 text-right">Qtd. em Risco</th>
                      <th className="py-2.5 px-4 text-right">Risco Financeiro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.expiringRiskItems.slice(0, 25).map(item => (
                      <tr key={item.materialKey} className="hover:bg-amber-50/30">
                        <td className="py-2.5 px-4">
                          <p className="text-xs font-black text-slate-900">{item.name}</p>
                          <p className="text-[10px] text-slate-500">{item.category}</p>
                        </td>
                        <td className="py-2.5 px-4 text-xs font-extrabold text-center text-amber-800">
                          {formatDateBR(item.earliestExpiringDate)}
                        </td>
                        <td className="py-2.5 px-4 text-xs font-bold text-right tabular-nums text-slate-600">
                          {item.physicalStock.toLocaleString('pt-BR')} un
                        </td>
                        <td className="py-2.5 px-4 text-xs font-black text-right tabular-nums text-emerald-700">
                          {item.usableStock.toLocaleString('pt-BR')} un
                        </td>
                        <td className="py-2.5 px-4 text-xs font-black text-right tabular-nums text-amber-700">
                          {item.expiringBeforeConsumption.toLocaleString('pt-BR')} un
                        </td>
                        <td className="py-2.5 px-4 text-xs font-black text-right tabular-nums text-rose-700">
                          {formatCurrency(item.expiringFinancialRisk)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Risk 3 & 4 side-by-side: Demanda Reprimida & Sem Preço Cadastrado */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-purple-200/80 shadow-sm overflow-hidden">
              <div className="p-5 bg-purple-50/70 border-b border-purple-100 flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-purple-950">
                    3. Demanda Reprimida ({analysis.repressedRiskItems.length} itens)
                  </h4>
                  <p className="text-xs text-purple-800/80 font-medium">
                    Requisições recusadas, pendentes ou atendidas parcialmente nos últimos {historyWindowDays} dias.
                  </p>
                </div>
                {analysis.repressedRiskItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      jumpToAnalysisWithItems(
                        analysis.repressedRiskItems.map(i => i.materialKey),
                        'repressed'
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-extrabold cursor-pointer shrink-0"
                  >
                    Abrir na Análise
                  </button>
                )}
              </div>
              {analysis.repressedRiskItems.length === 0 ? (
                <div className="p-6 text-center text-xs font-bold text-slate-500">
                  Nenhuma demanda reprimida identificada no período selecionado.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {analysis.repressedRiskItems.map(item => (
                    <div
                      key={item.materialKey}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-purple-50/30"
                    >
                      <div>
                        <p className="text-xs font-black text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {item.repressedRequestsCount}{' '}
                          {item.repressedRequestsCount === 1 ? 'requisição' : 'requisições'} • Est. útil:{' '}
                          {item.usableStock} un
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-900 text-xs font-black tabular-nums shrink-0">
                        -{item.repressedDemandUnits.toLocaleString('pt-BR')} un
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    4. Itens c/ Déficit Sem Preço Unitário ({analysis.missingPriceDeficitItems.length})
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    Estes itens precisam de compra, mas estão com valor unitário R$ 0,00 (subestimando o orçamento).
                  </p>
                </div>
                {analysis.missingPriceDeficitItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      jumpToAnalysisWithItems(
                        analysis.missingPriceDeficitItems.map(i => i.materialKey),
                        'no_price'
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-extrabold cursor-pointer shrink-0"
                  >
                    Filtrar Itens
                  </button>
                )}
              </div>
              {analysis.missingPriceDeficitItems.length === 0 ? (
                <div className="p-6 text-center text-xs font-bold text-emerald-700">
                  Todos os itens com necessidade de compra possuem preço unitário cadastrado!
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {analysis.missingPriceDeficitItems.map(item => (
                    <div
                      key={item.materialKey}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-xs font-black text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {item.category} • {item.supplier}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-black tabular-nums shrink-0">
                        {item.plannedQty.toLocaleString('pt-BR')} un
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 4: MATERIAIS DESCONSIDERADOS DO PLANEJAMENTO                  */}
      {/* ===================================================================== */}
      {subTab === 'excluded' && (
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Materiais Desconsiderados do Planejamento de Compras
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Itens marcados como <strong>compra ocasional</strong>, <strong>substituídos por outro material</strong> ou <strong>descontinuados</strong> não aparecem nos cálculos, alertas nem exportações de compra — mantendo estoque e histórico 100% intactos.
                </p>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-black shrink-0">
                {exclusions.length} {exclusions.length === 1 ? 'material oculto' : 'materiais ocultos'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t border-slate-100">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={excludedSearch}
                  onChange={e => setExcludedSearch(e.target.value)}
                  placeholder="Buscar por material, categoria, substituto ou observação..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'Todos' },
                    { id: 'COMPRA_OCASIONAL', label: 'Compra Ocasional' },
                    { id: 'SUBSTITUIDO', label: 'Substituídos' },
                    { id: 'DESCONTINUADO', label: 'Descontinuados' }
                  ] as { id: 'ALL' | PurchaseExclusionReason; label: string }[]
                ).map(btn => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setExcludedReasonFilter(btn.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                      excludedReasonFilter === btn.id
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visibleExclusions.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center space-y-2">
              <Eye size={36} className="text-slate-300 mx-auto" />
              <p className="text-sm font-black text-slate-800">
                {exclusions.length === 0
                  ? 'Nenhum material foi desconsiderado do planejamento'
                  : 'Nenhum material oculto encontrado com este filtro'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Na aba <strong>Análise e Sugestão</strong> ou em <strong>Alertas de Risco</strong>, clique em <strong>&quot;Ocultar do planejamento&quot;</strong> em qualquer item pontual ou substituído para retirá-lo dos cálculos.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                      <th className="py-3 px-4">Material</th>
                      <th className="py-3 px-4">Motivo / Substituição</th>
                      <th className="py-3 px-4 text-center">Escopo</th>
                      <th className="py-3 px-4">Registrado por</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleExclusions.map(ex => {
                      const rMeta = EXCLUSION_REASON_META[ex.reason] || EXCLUSION_REASON_META.OUTRO;
                      return (
                        <tr key={ex.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <p className="text-xs font-black text-slate-900">{ex.materialName}</p>
                            <p className="text-[10px] text-slate-500 font-semibold">
                              {ex.category || 'Sem Categoria'}
                            </p>
                          </td>
                          <td className="py-3 px-4 space-y-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-black ${rMeta.badge}`}
                            >
                              {rMeta.label}
                            </span>
                            {ex.replacedBy && (
                              <p className="text-[11px] font-bold text-indigo-700">
                                Substituído por: <strong>{ex.replacedBy}</strong>
                              </p>
                            )}
                            {ex.note && (
                              <p className="text-[11px] text-slate-500 font-medium">{ex.note}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                              {ex.location === 'all' ? 'Todos os Estoques' : ex.location}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-xs font-bold text-slate-700">{ex.excludedBy}</p>
                            <p className="text-[10px] text-slate-400">{formatDateBR(ex.excludedAt)}</p>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleRestoreExcludedMaterial(ex)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 hover:border-emerald-600 text-xs font-extrabold cursor-pointer transition-all"
                            >
                              <RotateCcw size={12} />
                              Reativar no Planejamento
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: SALVAR PLANO / PEDIDO DE COMPRA                                */}
      {/* ===================================================================== */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600 text-white">
                  <Save size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    Salvar Plano / Pedido de Compra
                  </h4>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    {selectedSummary.count} itens • {selectedSummary.totalUnits.toLocaleString('pt-BR')} un •{' '}
                    {formatCurrency(selectedSummary.totalCost)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1">
                  Título / Identificação do Plano *
                </label>
                <input
                  type="text"
                  value={newPlanTitle}
                  onChange={e => setNewPlanTitle(e.target.value)}
                  maxLength={160}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Ex.: Pedido Mensal Ata CPSMS — Almoxarifado"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1">
                    Modalidade / Tipo
                  </label>
                  <select
                    value={newPlanModality}
                    onChange={e => setNewPlanModality(e.target.value as PurchasePlanModality)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 cursor-pointer"
                  >
                    {(Object.keys(MODALITY_LABELS) as PurchasePlanModality[]).map(m => (
                      <option key={m} value={m}>
                        {MODALITY_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1">
                    Status Inicial
                  </label>
                  <select
                    value={newPlanStatus}
                    onChange={e => setNewPlanStatus(e.target.value as PurchasePlanStatus)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 cursor-pointer"
                  >
                    <option value="ENVIADO">Enviado p/ Compras</option>
                    <option value="EMPENHADO">Aprovado / Empenhado</option>
                    <option value="RASCUNHO">Rascunho</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1">
                  Nº Protocolo / Processo / Ata (Opcional)
                </label>
                <input
                  type="text"
                  value={newPlanProtocol}
                  onChange={e => setNewPlanProtocol(e.target.value)}
                  maxLength={80}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  placeholder="Ex.: Processo CPSMS nº 2026/048"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1">
                  Observações / Justificativa Geral (Opcional)
                </label>
                <textarea
                  rows={3}
                  value={newPlanNotes}
                  onChange={e => setNewPlanNotes(e.target.value)}
                  maxLength={2000}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800"
                  placeholder="Informações adicionais para o setor de compras ou diretoria..."
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSavePlan}
                disabled={savingPlan}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Check size={14} />
                {savingPlan ? 'Salvando...' : 'Confirmar e Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CONFIRMAR EXCLUSÃO DE PLANO                                    */}
      {/* ===================================================================== */}
      {planToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-rose-700">
                <Trash2 size={20} />
                <h4 className="text-sm font-black text-slate-900">Excluir Plano de Compra?</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tem certeza que deseja excluir o plano <strong>{planToDelete.code}</strong> ({planToDelete.title})? Esta ação remove apenas este planejamento salvo e não altera o estoque nem o histórico de movimentações.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPlanToDelete(null)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePlan}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer"
              >
                Excluir Plano
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: DESCONSIDERAR MATERIAL DO PLANEJAMENTO                         */}
      {/* ===================================================================== */}
      {itemToExclude && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-800 text-white">
                  <EyeOff size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    Ocultar Material do Planejamento
                  </h4>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    {itemToExclude.name} • {itemToExclude.category}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItemToExclude(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-100 text-[11px] font-semibold text-blue-900 leading-relaxed">
                Este material será ocultado apenas do <strong>Planejamento de Compras</strong> e dos{' '}
                <strong>Alertas de Risco</strong>. O cadastro no estoque, o saldo atual e todo o histórico de movimentações permanecem intactos, e você pode reativá-lo a qualquer momento na aba <strong>Desconsiderados</strong>.
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-2">
                  Motivo para não planejar nova compra
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(EXCLUSION_REASON_META) as PurchaseExclusionReason[]).map(rKey => (
                    <button
                      key={rKey}
                      type="button"
                      onClick={() => setExcludeReason(rKey)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-extrabold transition-all cursor-pointer ${
                        excludeReason === rKey
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-900 ring-2 ring-indigo-500/20'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {EXCLUSION_REASON_META[rKey].label}
                    </button>
                  ))}
                </div>
              </div>

              {excludeReason === 'SUBSTITUIDO' && (
                <div>
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1">
                    Substituído por qual material? (Opcional)
                  </label>
                  <input
                    type="text"
                    list="planning-replacement-materials"
                    value={excludeReplacedBy}
                    onChange={e => setExcludeReplacedBy(e.target.value)}
                    maxLength={200}
                    placeholder="Digite ou escolha o novo material substituto..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/30 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <datalist id="planning-replacement-materials">
                    {analysis.allAnalyzed
                      .filter(i => i.materialKey !== itemToExclude.materialKey)
                      .map(i => (
                        <option key={i.materialKey} value={i.name} />
                      ))}
                  </datalist>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1">
                  Observação adicional (Opcional)
                </label>
                <input
                  type="text"
                  value={excludeNote}
                  onChange={e => setExcludeNote(e.target.value)}
                  maxLength={500}
                  placeholder="Ex.: Comprado pontualmente para campanha ou padronização alterada em 2026..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToExclude(null)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExcludeMaterial}
                disabled={savingExclusion}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <EyeOff size={14} />
                {savingExclusion ? 'Salvando...' : 'Ocultar do Planejamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
