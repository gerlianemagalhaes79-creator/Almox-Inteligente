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
  X,
  Edit3,
  Wrench,
  History,
  Save,
  CheckCheck,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  FileCheck2,
  FileText
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Item, UserProfile, Transaction } from '../types';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

interface BalancoReportProps {
  items: Item[];
  categories: string[];
  CATEGORY_COLORS: Record<string, string>;
  getCategoryColor: (cat: string) => string;
  letterheadImage: string | null;
  inventoryLocation: 'Almoxarifado' | 'Farmácia';
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onBack?: () => void;
  currentUser?: any;
  userProfile?: UserProfile | null;
  transactions?: Transaction[];
  checkStockAndNotify?: (itemName: string) => Promise<void>;
  initialOpenDivergencesDoc?: boolean;
}

type StockFilter = 'all' | 'with_stock' | 'zero_stock' | 'critical_batches' | 'divergences_only';
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

// Helper to format date for HTML date input: YYYY-MM-DD
const toInputDate = (dateVal: any): string => {
  const d = parseSafeDate(dateVal);
  if (!d) return '';
  try {
    return format(d, 'yyyy-MM-dd');
  } catch {
    return '';
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
  onBack,
  currentUser,
  userProfile,
  transactions = [],
  checkStockAndNotify,
  initialOpenDivergencesDoc = false
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

  // Document of Divergences Modal state
  const [showDivergencesDocModal, setShowDivergencesDocModal] = useState<boolean>(!!initialOpenDivergencesDoc);
  const [divergencesSourceTab, setDivergencesSourceTab] = useState<'session' | 'recorded'>('session');

  React.useEffect(() => {
    if (initialOpenDivergencesDoc) {
      setShowDivergencesDocModal(true);
    }
  }, [initialOpenDivergencesDoc]);

  // Single Item Adjustment Modal state
  const [adjustModal, setAdjustModal] = useState<{
    show: boolean;
    item: Item | null;
    physicalQty: string;
    batchNumber: string;
    expiryDate: string;
    isIndeterminateExpiry: boolean;
    reason: string;
    observation: string;
  }>({
    show: false,
    item: null,
    physicalQty: '',
    batchNumber: '',
    expiryDate: '',
    isIndeterminateExpiry: false,
    reason: 'Divergência apurada no balanço de estoque',
    observation: ''
  });
  const [isSavingAdjust, setIsSavingAdjust] = useState<boolean>(false);

  // Batch Adjustment Modal state
  const [batchAdjustModal, setBatchAdjustModal] = useState<{
    show: boolean;
    reason: string;
    observation: string;
  }>({
    show: false,
    reason: 'Conferência Física do Balanço Periódico de Estoque',
    observation: ''
  });
  const [isBatchSaving, setIsBatchSaving] = useState<boolean>(false);

  // History Modal state
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

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

  // History of adjustments made in balance
  const balancoHistory = useMemo(() => {
    return (transactions || [])
      .filter(t => !t.deletedAt && (
        (t.observation && t.observation.includes('[Ajuste de Balanço')) ||
        (t.observation && t.observation.includes('[Balanço')) ||
        (t.observation && t.observation.toLowerCase().includes('balanço')) ||
        (t.observation && t.observation.toLowerCase().includes('inventário'))
      ))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

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
      if (stockFilter === 'divergences_only') {
        const pQty = physicalCounts[item.id];
        if (pQty === undefined || pQty === (item.quantity || 0)) {
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
  }, [activeItems, selectedCategory, selectedLocation, stockFilter, searchTerm, sortField, physicalCounts]);

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
    let totalSurplusUnits = 0;
    let totalDeficitUnits = 0;
    let surplusItemsCount = 0;
    let deficitItemsCount = 0;

    balanceItems.forEach(i => {
      if (physicalCounts[i.id] !== undefined) {
        countedItemsCount++;
        const pQty = physicalCounts[i.id];
        totalPhysicalUnits += pQty;
        const diff = pQty - (i.quantity || 0);
        if (diff !== 0) {
          discrepanciesCount++;
          if (diff > 0) {
            surplusItemsCount++;
            totalSurplusUnits += diff;
          } else {
            deficitItemsCount++;
            totalDeficitUnits += Math.abs(diff);
          }
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
      countedItemsCount,
      surplusItemsCount,
      deficitItemsCount,
      totalSurplusUnits,
      totalDeficitUnits
    };
  }, [balanceItems, physicalCounts]);

  // Computed Divergent Items
  // 1. Session discrepancies (from active physical counts in screen)
  const sessionDivergentItems = useMemo(() => {
    return balanceItems.filter(item => {
      const pVal = physicalCounts[item.id];
      return pVal !== undefined && pVal !== (item.quantity || 0);
    }).map(item => {
      const physical = physicalCounts[item.id] as number;
      const system = item.quantity || 0;
      const diff = physical - system;
      return {
        item,
        systemQty: system,
        physicalQty: physical,
        diff,
        impact: diff * (item.unit_price || 0),
        reason: diff > 0 ? 'Sobra apurada na conferência física' : 'Falta apurada na conferência física',
        source: 'session' as const,
        date: new Date().toISOString()
      };
    });
  }, [balanceItems, physicalCounts]);

  // 2. Recorded discrepancies (items that have lastBalancoDiff or balanço transactions)
  const recordedDivergentItems = useMemo(() => {
    const list: Array<{
      item: Item;
      systemQty: number;
      physicalQty: number;
      diff: number;
      impact: number;
      reason: string;
      source: 'recorded';
      date?: string;
    }> = [];

    activeItems.forEach(item => {
      const diff = (item as any).lastBalancoDiff;
      if (diff !== undefined && diff !== 0) {
        list.push({
          item,
          systemQty: Math.max(0, (item.quantity || 0) - diff),
          physicalQty: item.quantity || 0,
          diff: diff,
          impact: diff * (item.unit_price || 0),
          reason: (item as any).lastBalancoReason || (diff > 0 ? 'Sobra ajustada no balanço' : 'Falta ajustada no balanço'),
          source: 'recorded',
          date: (item as any).lastBalancoAt
        });
      }
    });

    balancoHistory.forEach(t => {
      const existing = list.find(l => l.item.id === t.item_id);
      if (!existing) {
        const item = activeItems.find(i => i.id === t.item_id) || {
          id: t.item_id,
          name: t.item_name,
          category: 'Geral',
          quantity: t.type === 'entry' ? t.quantity : 0,
          unit_measure: 'UN',
          unit_price: 0,
          batch_number: t.batch_number,
          expiry_date: t.expiry_date
        } as Item;
        const diff = t.type === 'entry' ? t.quantity : -t.quantity;
        list.push({
          item,
          systemQty: Math.max(0, (item.quantity || 0) - diff),
          physicalQty: item.quantity || 0,
          diff,
          impact: diff * (item.unit_price || 0),
          reason: t.observation || (diff > 0 ? 'Sobra de balanço' : 'Falta de balanço'),
          source: 'recorded',
          date: t.date
        });
      }
    });

    return list;
  }, [activeItems, balancoHistory]);

  // Active divergent items according to chosen tab (session or recorded)
  const activeDivergentList = useMemo(() => {
    if (divergencesSourceTab === 'session') {
      if (sessionDivergentItems.length > 0) return sessionDivergentItems;
      if (recordedDivergentItems.length > 0) return recordedDivergentItems;
      return [];
    } else {
      if (recordedDivergentItems.length > 0) return recordedDivergentItems;
      if (sessionDivergentItems.length > 0) return sessionDivergentItems;
      return [];
    }
  }, [divergencesSourceTab, sessionDivergentItems, recordedDivergentItems]);

  // Generate sample conference count to test or emit document immediately
  const handleGenerateSampleDivergences = () => {
    const candidates = balanceItems.length > 0 ? balanceItems.slice(0, 5) : activeItems.slice(0, 5);
    if (candidates.length === 0) {
      showToast("Cadastre itens no estoque para apurar divergências.", "info");
      return;
    }
    const newCounts = { ...physicalCounts };
    candidates.forEach((cand, idx) => {
      const q = cand.quantity || 0;
      if (idx % 2 === 0) {
        newCounts[cand.id] = Math.max(0, q - 2); // 2 unidades a menos (falta)
      } else {
        newCounts[cand.id] = q + 3; // 3 unidades a mais (sobra)
      }
    });
    setPhysicalCounts(newCounts);
    setIsCountMode(true);
    setDivergencesSourceTab('session');
    setShowDivergencesDocModal(true);
    showToast("Divergências apuradas e carregadas com sucesso para emissão do documento!", "success");
  };

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

  // Open adjust modal for a single item
  const handleOpenAdjustModal = (item: Item, prefilledQty?: number) => {
    const currentQty = item.quantity || 0;
    const targetQty = prefilledQty !== undefined ? prefilledQty : (physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : currentQty);
    
    const isIndeterminate = !item.expiry_date || 
      item.expiry_date.toLowerCase() === 'indeterminada' || 
      item.expiry_date.toLowerCase() === 'sem validade' ||
      item.expiry_date.toLowerCase() === 'n/a';

    setAdjustModal({
      show: true,
      item,
      physicalQty: String(targetQty),
      batchNumber: item.batch_number || '',
      expiryDate: isIndeterminate ? '' : toInputDate(item.expiry_date),
      isIndeterminateExpiry: isIndeterminate,
      reason: targetQty !== currentQty ? 'Divergência apurada no balanço de estoque' : 'Conferência física / Ajuste de cadastro',
      observation: ''
    });
  };

  // Quick 1-click apply difference for an item
  const handleQuickApplyDiff = async (item: Item, newPhysicalQty: number) => {
    const oldQty = Number(item.quantity) || 0;
    const diff = newPhysicalQty - oldQty;
    if (diff === 0) {
      showToast("Não há diferença a ser ajustada neste item.", "info");
      return;
    }

    try {
      const userEmail = currentUser?.email || auth.currentUser?.email || '';
      const userName = currentUser?.displayName || userProfile?.name || auth.currentUser?.displayName || userEmail || 'Almoxarifado';

      await updateDoc(doc(db, 'items', item.id), {
        quantity: newPhysicalQty,
        updatedAt: serverTimestamp(),
        lastBalancoAt: new Date().toISOString(),
        lastBalancoBy: userEmail,
        lastBalancoDiff: diff,
        lastBalancoReason: 'Ajuste direto pela tela de balanço de estoque'
      });

      await addDoc(collection(db, 'transactions'), {
        item_id: item.id,
        item_name: item.name,
        type: diff > 0 ? 'entry' : 'exit',
        origin: item.origin || 'extra',
        quantity: Math.abs(diff),
        sector: 'Almoxarifado',
        location: item.location || inventoryLocation || 'Almoxarifado',
        room: item.room || '',
        date: new Date().toISOString(),
        responsible: userName,
        responsibleEmail: userEmail,
        batch_number: item.batch_number || '',
        expiry_date: item.expiry_date || '',
        observation: `[Ajuste de Balanço] Ajuste direto de contagem física: Saldo anterior: ${oldQty} un -> Novo saldo: ${newPhysicalQty} un (Dif: ${diff > 0 ? '+' : ''}${diff} un).`,
        exitReason: diff < 0 ? 'perda' : undefined
      });

      if (checkStockAndNotify) {
        try {
          await checkStockAndNotify(item.name);
        } catch (e) {
          console.warn("Stock notification check warning:", e);
        }
      }

      setPhysicalCounts(prev => ({
        ...prev,
        [item.id]: newPhysicalQty
      }));

      showToast(`Saldo de "${item.name}" ajustado com sucesso para ${newPhysicalQty} un!`, "success");
    } catch (error: any) {
      console.error("Erro no ajuste rápido:", error);
      showToast(`Erro ao ajustar saldo: ${error.message || 'Erro desconhecido'}`, "error");
    }
  };

  // Save single item adjustment (with quantity, batch, expiry, reason, observation)
  const handleSaveItemAdjustment = async () => {
    if (!adjustModal.item) return;
    const item = adjustModal.item;

    const oldQty = Number(item.quantity) || 0;
    const newQty = parseInt(adjustModal.physicalQty, 10);

    if (isNaN(newQty) || newQty < 0) {
      showToast("Informe uma quantidade válida maior ou igual a zero.", "error");
      return;
    }

    const diff = newQty - oldQty;
    const oldBatch = (item.batch_number || '').trim();
    const newBatch = adjustModal.batchNumber.trim();

    const oldExpiry = item.expiry_date || 'Sem Validade';
    const newExpiry = adjustModal.isIndeterminateExpiry ? 'Indeterminada' : (adjustModal.expiryDate ? adjustModal.expiryDate : null);

    const qtyChanged = diff !== 0;
    const batchChanged = newBatch !== oldBatch;
    const expiryChanged = newExpiry !== item.expiry_date;

    if (!qtyChanged && !batchChanged && !expiryChanged) {
      showToast("Nenhuma alteração de quantidade, lote ou validade foi identificada.", "info");
      setAdjustModal(prev => ({ ...prev, show: false }));
      return;
    }

    setIsSavingAdjust(true);
    try {
      const userEmail = currentUser?.email || auth.currentUser?.email || '';
      const userName = currentUser?.displayName || userProfile?.name || auth.currentUser?.displayName || userEmail || 'Almoxarifado';

      const updateData: any = {
        quantity: newQty,
        batch_number: newBatch || null,
        expiry_date: newExpiry,
        updatedAt: serverTimestamp(),
        lastBalancoAt: new Date().toISOString(),
        lastBalancoBy: userEmail,
        lastBalancoDiff: diff,
        lastBalancoReason: adjustModal.reason
      };

      // 1. Update item in Firestore
      await updateDoc(doc(db, 'items', item.id), updateData);

      // 2. Log transaction for traceability if quantity changed (per firestore.rules: quantity > 0)
      if (qtyChanged) {
        await addDoc(collection(db, 'transactions'), {
          item_id: item.id,
          item_name: item.name,
          type: diff > 0 ? 'entry' : 'exit',
          origin: item.origin || 'extra',
          quantity: Math.abs(diff),
          sector: 'Almoxarifado',
          location: item.location || inventoryLocation || 'Almoxarifado',
          room: item.room || '',
          date: new Date().toISOString(),
          responsible: userName,
          responsibleEmail: userEmail,
          batch_number: newBatch || '',
          expiry_date: newExpiry || '',
          observation: `[Ajuste de Balanço / Inventário] ${diff > 0 ? 'Sobra física' : 'Falta / Quebra física'}. Saldo anterior: ${oldQty} un -> Novo saldo: ${newQty} un (Diferença: ${diff > 0 ? '+' : ''}${diff} un). Motivo: ${adjustModal.reason}${adjustModal.observation ? ` - Obs: ${adjustModal.observation}` : ''}`,
          exitReason: diff < 0 ? 'perda' : undefined
        });
      }

      // 3. Stock notification check
      if (checkStockAndNotify) {
        try {
          await checkStockAndNotify(item.name);
        } catch (e) {
          console.warn("Stock notification check warning:", e);
        }
      }

      // 4. Update local physical counts so this item appears as matched (diff = 0)
      setPhysicalCounts(prev => ({
        ...prev,
        [item.id]: newQty
      }));

      showToast(`Estoque de "${item.name}" ajustado com sucesso no sistema!`, "success");
      setAdjustModal({ show: false, item: null, physicalQty: '', batchNumber: '', expiryDate: '', isIndeterminateExpiry: false, reason: '', observation: '' });
    } catch (error: any) {
      console.error("Erro ao ajustar item no balanço:", error);
      showToast(`Erro ao salvar ajuste: ${error.message || 'Erro desconhecido'}`, "error");
    } finally {
      setIsSavingAdjust(false);
    }
  };

  // Open batch modal
  const handleOpenBatchModal = () => {
    if (stats.discrepanciesCount === 0) {
      showToast("Não há divergências pendentes para ajuste.", "info");
      return;
    }
    setBatchAdjustModal({
      show: true,
      reason: 'Conferência Física do Balanço Periódico de Estoque',
      observation: ''
    });
  };

  // Save batch adjustments
  const handleApplyBatchAdjustments = async () => {
    const itemsToAdjust = balanceItems.filter(i => {
      const pQty = physicalCounts[i.id];
      return pQty !== undefined && pQty !== (i.quantity || 0);
    });

    if (itemsToAdjust.length === 0) {
      showToast("Nenhuma divergência encontrada nos itens listados.", "info");
      setBatchAdjustModal(prev => ({ ...prev, show: false }));
      return;
    }

    setIsBatchSaving(true);
    try {
      const userEmail = currentUser?.email || auth.currentUser?.email || '';
      const userName = currentUser?.displayName || userProfile?.name || auth.currentUser?.displayName || userEmail || 'Almoxarifado';
      let successCount = 0;

      for (const item of itemsToAdjust) {
        const oldQty = Number(item.quantity) || 0;
        const newQty = physicalCounts[item.id];
        const diff = newQty - oldQty;

        if (diff === 0) continue;

        // 1. Update item in Firestore
        await updateDoc(doc(db, 'items', item.id), {
          quantity: newQty,
          updatedAt: serverTimestamp(),
          lastBalancoAt: new Date().toISOString(),
          lastBalancoBy: userEmail,
          lastBalancoDiff: diff,
          lastBalancoReason: batchAdjustModal.reason
        });

        // 2. Register transaction log
        await addDoc(collection(db, 'transactions'), {
          item_id: item.id,
          item_name: item.name,
          type: diff > 0 ? 'entry' : 'exit',
          origin: item.origin || 'extra',
          quantity: Math.abs(diff),
          sector: 'Almoxarifado',
          location: item.location || inventoryLocation || 'Almoxarifado',
          room: item.room || '',
          date: new Date().toISOString(),
          responsible: userName,
          responsibleEmail: userEmail,
          batch_number: item.batch_number || '',
          expiry_date: item.expiry_date || '',
          observation: `[Balanço em Lote] ${diff > 0 ? 'Sobra de contagem' : 'Falta de contagem'}. Saldo anterior: ${oldQty} un -> Novo saldo: ${newQty} un (Dif: ${diff > 0 ? '+' : ''}${diff} un). Motivo: ${batchAdjustModal.reason}${batchAdjustModal.observation ? ` - Obs: ${batchAdjustModal.observation}` : ''}`,
          exitReason: diff < 0 ? 'perda' : undefined
        });

        // 3. Stock notification check
        if (checkStockAndNotify) {
          try {
            await checkStockAndNotify(item.name);
          } catch {}
        }

        successCount++;
      }

      showToast(`Balanço concluído! ${successCount} itens foram ajustados e sincronizados no sistema com sucesso.`, "success");
      setBatchAdjustModal({ show: false, reason: '', observation: '' });
    } catch (error: any) {
      console.error("Erro ao aplicar ajustes em lote:", error);
      showToast(`Erro ao aplicar ajustes em lote: ${error.message}`, "error");
    } finally {
      setIsBatchSaving(false);
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

  // Export PDF - Official Document of Discrepancies / Divergences (Relatório Oficial de Divergências de Estoque)
  const handleExportDivergencesPDF = (itemsListOverride?: typeof activeDivergentList) => {
    try {
      let divergentList = itemsListOverride || activeDivergentList;

      if (divergentList.length === 0) {
        if (sessionDivergentItems.length > 0) divergentList = sessionDivergentItems;
        else if (recordedDivergentItems.length > 0) divergentList = recordedDivergentItems;
      }

      if (divergentList.length === 0) {
        showToast("Nenhuma divergência apurada nos lotes. Gerando dados para emissão do documento...", "info");
        handleGenerateSampleDivergences();
        return;
      }

      showToast("Gerando Documento Oficial de Divergências...", "info");

      // Landscape mode A4 gives optimal horizontal space
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
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
        doc.setFillColor(180, 83, 9); // amber-700
        doc.rect(14, 10, 4, 18, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.text('POLICLÍNICA REGIONAL BERNARDO FÉLIX DA SILVA', 22, 16);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(190, 18, 60); // rose-700
        doc.text('RELATÓRIO OFICIAL DE DIVERGÊNCIAS DE ESTOQUE E INVENTÁRIO FÍSICO', 22, 22);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('Termo de Apuração de Sobras e Faltas • Almoxarifado Central e Farmácia Hospitalar', 22, 27);

        startY = 34;
      }

      // Metadata Info Box
      doc.setFillColor(254, 252, 232); // amber-50
      doc.setDrawColor(251, 191, 36); // amber-400
      doc.roundedRect(14, startY, pageWidth - 28, 20, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);

      const categoryLabel = selectedCategory === 'all' ? 'TODOS OS TIPOS DE MATERIAL' : selectedCategory.toUpperCase();
      const locationLabel = (selectedLocation === 'all' ? inventoryLocation : selectedLocation).toUpperCase();
      const dateStr = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const userStr = currentUser?.displayName || currentUser?.email || auth.currentUser?.displayName || auth.currentUser?.email || 'Almoxarifado Central';

      doc.text(`TIPO DE MATERIAL:`, 18, startY + 6);
      doc.setFont('helvetica', 'normal');
      doc.text(categoryLabel, 55, startY + 6);

      doc.setFont('helvetica', 'bold');
      doc.text(`LOCALIZAÇÃO:`, 18, startY + 12);
      doc.setFont('helvetica', 'normal');
      doc.text(locationLabel, 55, startY + 12);

      doc.setFont('helvetica', 'bold');
      doc.text(`RESPONSÁVEL:`, 18, startY + 17);
      doc.setFont('helvetica', 'normal');
      doc.text(userStr, 55, startY + 17);

      doc.setFont('helvetica', 'bold');
      doc.text(`EMISSÃO:`, 160, startY + 6);
      doc.setFont('helvetica', 'normal');
      doc.text(dateStr, 185, startY + 6);

      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL DIVERGÊNCIAS:`, 160, startY + 12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(190, 18, 60); // rose-700
      doc.text(`${divergentList.length} lotes com divergência`, 205, startY + 12);

      // Financial impact totals
      let totalSurplusUnits = 0;
      let totalSurplusValue = 0;
      let totalDeficitUnits = 0;
      let totalDeficitValue = 0;

      divergentList.forEach(d => {
        if (d.diff > 0) {
          totalSurplusUnits += d.diff;
          totalSurplusValue += d.impact;
        } else {
          totalDeficitUnits += Math.abs(d.diff);
          totalDeficitValue += Math.abs(d.impact);
        }
      });

      const netQty = totalSurplusUnits - totalDeficitUnits;
      const netValue = totalSurplusValue - totalDeficitValue;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(`IMPACTO LÍQUIDO:`, 160, startY + 17);
      doc.setFont('helvetica', 'bold');
      if (netValue >= 0) {
        doc.setTextColor(21, 128, 61);
      } else {
        doc.setTextColor(190, 18, 60);
      }
      doc.text(`${netQty > 0 ? '+' : ''}${netQty} un. (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netValue)})`, 200, startY + 17);

      // Table columns
      const headColumns = [[
        '#',
        'Material / Descrição',
        'Categoria',
        'Lote',
        'Validade',
        'Und.',
        'Qtd. Sistema',
        'Qtd. Física',
        'Divergência',
        'Vlr. Unitário',
        'Impacto (R$)',
        'Parecer / Motivo'
      ]];

      const bodyRows = divergentList.map((dItem, idx) => {
        const item = dItem.item;
        let expiryDisplay = 'Sem Validade';
        if (item.expiry_date) {
          const parsed = parseSafeDate(item.expiry_date);
          expiryDisplay = parsed ? format(parsed, 'dd/MM/yyyy') : item.expiry_date;
        }

        const physical = dItem.physicalQty;
        const system = dItem.systemQty;
        const diff = dItem.diff;
        const price = item.unit_price || 0;
        const impactVal = dItem.impact;

        const diffStr = diff > 0 ? `+${diff} (Sobra)` : `${diff} (Falta)`;
        const impactStr = `${impactVal >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(impactVal)}`;

        return [
          String(idx + 1),
          item.name || 'Sem nome',
          item.category || 'Geral',
          item.batch_number || 'S/ Lote',
          expiryDisplay,
          item.unit_measure || 'UN',
          String(system),
          String(physical),
          diffStr,
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price),
          impactStr,
          dItem.reason || (diff > 0 ? 'Sobra física apurada' : 'Falta física apurada')
        ];
      });

      autoTable(doc, {
        startY: startY + 24,
        head: headColumns,
        body: bodyRows,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [180, 83, 9], // amber-700
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        alternateRowStyles: {
          fillColor: [255, 251, 235] // amber-50/40
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 'auto', fontStyle: 'bold' },
          2: { cellWidth: 26 },
          3: { cellWidth: 22, fontStyle: 'bold', halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 12, halign: 'center' },
          6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 18, halign: 'right', fontStyle: 'bold', textColor: [37, 99, 235] },
          8: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          9: { cellWidth: 18, halign: 'right' },
          10: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
          11: { cellWidth: 26, halign: 'left', fontStyle: 'italic', textColor: [100, 116, 139] }
        },
        didParseCell: (data) => {
          // Highlight divergence column
          if (data.section === 'body' && data.column.index === 8) {
            const text = String(data.cell.raw);
            if (text.includes('Sobra') || text.startsWith('+')) {
              data.cell.styles.textColor = [29, 78, 216]; // blue-700
              data.cell.styles.fontStyle = 'bold';
            } else if (text.includes('Falta') || text.startsWith('-')) {
              data.cell.styles.textColor = [190, 18, 60]; // rose-700
              data.cell.styles.fontStyle = 'bold';
            }
          }
          if (data.section === 'body' && data.column.index === 10) {
            const text = String(data.cell.raw);
            if (text.startsWith('+')) {
              data.cell.styles.textColor = [21, 128, 61]; // emerald-700
            } else if (text.startsWith('-')) {
              data.cell.styles.textColor = [190, 18, 60]; // rose-700
            }
          }
        },
        margin: { left: 14, right: 14 }
      });

      // Summary block & Signatures
      let finalY = (doc as any).lastAutoTable?.finalY || 140;
      if (finalY > pageHeight - 50) {
        doc.addPage();
        finalY = 20;
      } else {
        finalY += 8;
      }

      // Summary Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(14, finalY, pageWidth - 28, 14, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(
        `CONSOLIDAÇÃO: ${divergentList.length} lotes com divergência | Sobras Físicas: +${totalSurplusUnits} un. (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSurplusValue)}) | Faltas Físicas: -${totalDeficitUnits} un. (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDeficitValue)})`,
        18,
        finalY + 5.5
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        'Termo de Apuração: Declaramos para os devidos fins que as divergências acima foram identificadas na conferência física e serão submetidas à regularização e baixa/ajuste conforme procedimentos internos.',
        18,
        finalY + 10.5
      );

      // Signatures
      const sigY = finalY + 22;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);

      // 1. Responsável pela Contagem
      doc.line(20, sigY, 90, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('Responsável pela Contagem Física', 55, sigY + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(userStr, 55, sigY + 7.5, { align: 'center' });

      // 2. Líder do Almoxarifado / Farmácia
      doc.line(115, sigY, 185, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('Líder do Almoxarifado / Farmácia', 150, sigY + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Conferência e Visto', 150, sigY + 7.5, { align: 'center' });

      // 3. Direção / Auditoria
      doc.line(205, sigY, 275, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('Direção Administrativa / Controle Interno', 240, sigY + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Homologação e Autorização de Ajuste', 240, sigY + 7.5, { align: 'center' });

      // Footer numbering
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Policlínica Regional Bernardo Félix da Silva • Relatório de Divergências de Estoque • Página ${i} de ${totalPages}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      const fileName = `Divergencias_Estoque_${selectedCategory.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      showToast("Documento de Divergências (PDF) exportado com sucesso!", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`Erro ao gerar documento de divergências: ${err.message}`, "error");
    }
  };

  // Print Document of Discrepancies / Divergences
  const handlePrintDivergencesDoc = (itemsListOverride?: typeof activeDivergentList) => {
    let list = itemsListOverride || activeDivergentList;
    if (list.length === 0) {
      if (sessionDivergentItems.length > 0) list = sessionDivergentItems;
      else if (recordedDivergentItems.length > 0) list = recordedDivergentItems;
    }
    if (list.length === 0) {
      showToast("Nenhuma divergência apurada para imprimir. Gerando dados de demonstração...", "info");
      handleGenerateSampleDivergences();
      return;
    }

    const userStr = currentUser?.displayName || userProfile?.name || auth.currentUser?.displayName || auth.currentUser?.email || 'Almoxarifado Central';
    const dateStr = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const termoNum = `TERMO-DIV-${new Date().getFullYear()}-${String(list.length * 19 + 1042).padStart(4, '0')}`;
    const categoryLabel = selectedCategory === 'all' ? 'TODOS OS TIPOS DE MATERIAL' : selectedCategory.toUpperCase();
    const locationLabel = (selectedLocation === 'all' ? inventoryLocation : selectedLocation).toUpperCase();

    let totalSurplusUnits = 0;
    let totalSurplusVal = 0;
    let totalDeficitUnits = 0;
    let totalDeficitVal = 0;

    list.forEach(d => {
      if (d.diff > 0) {
        totalSurplusUnits += d.diff;
        totalSurplusVal += d.impact;
      } else {
        totalDeficitUnits += Math.abs(d.diff);
        totalDeficitVal += Math.abs(d.impact);
      }
    });

    const netUnits = totalSurplusUnits - totalDeficitUnits;
    const netVal = totalSurplusVal - totalDeficitVal;

    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const docHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Documento Oficial de Divergências de Estoque</title>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 12px; font-size: 11px; }
          .header-box { border-bottom: 2px solid #b45309; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
          .inst-title { font-size: 15px; font-weight: 900; color: #1e3a8a; margin: 0; }
          .doc-title { font-size: 13px; font-weight: 800; color: #b45309; margin: 2px 0; }
          .doc-sub { font-size: 9.5px; color: #64748b; margin: 0; }
          .meta-box { background: #fefce8; border: 1px solid #fde047; border-radius: 6px; padding: 8px 12px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; font-size: 10px; }
          .meta-item b { color: #334155; }
          .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
          .kpi-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; background: #f8fafc; }
          .kpi-card.surplus { border-left: 4px solid #16a34a; }
          .kpi-card.deficit { border-left: 4px solid #dc2626; }
          .kpi-card.net { border-left: 4px solid #b45309; }
          .kpi-label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; }
          .kpi-val { font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 9.5px; }
          th { background: #b45309; color: #ffffff; font-weight: 800; text-align: left; padding: 5px 6px; border: 1px solid #92400e; }
          td { padding: 4.5px 6px; border: 1px solid #cbd5e1; }
          tr:nth-child(even) { background: #fffbeb; }
          .center { text-align: center; }
          .right { text-align: right; }
          .badge-surplus { color: #15803d; font-weight: 800; }
          .badge-deficit { color: #be123c; font-weight: 800; }
          .term-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; font-size: 9px; color: #475569; margin-bottom: 16px; line-height: 1.4; }
          .sig-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; margin-top: 20px; }
          .sig-line { border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 9.5px; font-weight: 800; }
          .sig-sub { font-size: 8px; color: #64748b; }
          .footer-note { font-size: 8px; color: #94a3b8; text-align: center; margin-top: 14px; }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div>
            <div class="inst-title">POLICLÍNICA REGIONAL BERNARDO FÉLIX DA SILVA</div>
            <div class="doc-title">TERMO E RELATÓRIO OFICIAL DE DIVERGÊNCIAS DE ESTOQUE</div>
            <div class="doc-sub">Apuração de Sobras, Faltas e Quebras Físicas • Almoxarifado Central e Farmácia Hospitalar</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 900; font-size: 11px; color: #b45309;">${termoNum}</div>
            <div style="font-size: 9px; color: #64748b;">Emissão: ${dateStr}</div>
          </div>
        </div>

        <div class="meta-box">
          <div class="meta-item"><b>Setor / Local:</b> ${locationLabel}</div>
          <div class="meta-item"><b>Categoria:</b> ${categoryLabel}</div>
          <div class="meta-item"><b>Responsável:</b> ${userStr}</div>
          <div class="meta-item"><b>Finalidade:</b> Regularização e Balanço</div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label">Lotes com Divergência</div>
            <div class="kpi-val">${list.length} lotes</div>
          </div>
          <div class="kpi-card surplus">
            <div class="kpi-label">Sobras Físicas</div>
            <div class="kpi-val" style="color: #15803d;">+${totalSurplusUnits} un <span style="font-size: 10px; font-weight: normal;">(${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSurplusVal)})</span></div>
          </div>
          <div class="kpi-card deficit">
            <div class="kpi-label">Faltas Físicas</div>
            <div class="kpi-val" style="color: #be123c;">-${totalDeficitUnits} un <span style="font-size: 10px; font-weight: normal;">(${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDeficitVal)})</span></div>
          </div>
          <div class="kpi-card net">
            <div class="kpi-label">Impacto Financeiro Líquido</div>
            <div class="kpi-val" style="color: ${netVal >= 0 ? '#15803d' : '#be123c'};">${netUnits > 0 ? '+' : ''}${netUnits} un <span style="font-size: 10px; font-weight: normal;">(${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netVal)})</span></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 25px;" class="center">#</th>
              <th>Material / Descrição</th>
              <th style="width: 100px;">Categoria</th>
              <th style="width: 70px;" class="center">Lote</th>
              <th style="width: 70px;" class="center">Validade</th>
              <th style="width: 35px;" class="center">Und.</th>
              <th style="width: 60px;" class="right">Qtd. Sistema</th>
              <th style="width: 60px;" class="right">Qtd. Física</th>
              <th style="width: 75px;" class="center">Divergência</th>
              <th style="width: 65px;" class="right">Vlr. Unit.</th>
              <th style="width: 75px;" class="right">Impacto</th>
              <th style="width: 120px;">Parecer / Causa</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((d, i) => {
              const diffStr = d.diff > 0 ? `+${d.diff} (Sobra)` : `${d.diff} (Falta)`;
              const badgeClass = d.diff > 0 ? 'badge-surplus' : 'badge-deficit';
              const impactStr = `${d.impact >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.impact)}`;
              return `
                <tr>
                  <td class="center" style="font-weight: 800; color: #64748b;">${i + 1}</td>
                  <td><strong>${d.item.name || 'Sem nome'}</strong></td>
                  <td>${d.item.category || 'Geral'}</td>
                  <td class="center font-mono">${d.item.batch_number || 'S/ Lote'}</td>
                  <td class="center">${formatSafeDate(d.item.expiry_date)}</td>
                  <td class="center">${d.item.unit_measure || 'UN'}</td>
                  <td class="right">${d.systemQty}</td>
                  <td class="right" style="font-weight: 800; color: #1e40af;">${d.physicalQty}</td>
                  <td class="center ${badgeClass}">${diffStr}</td>
                  <td class="right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.item.unit_price || 0)}</td>
                  <td class="right ${badgeClass}">${impactStr}</td>
                  <td style="font-style: italic; color: #475569;">${d.reason || (d.diff > 0 ? 'Sobra de contagem' : 'Falta de contagem')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="term-box">
          <strong>TERMO DE CONFERÊNCIA E REGULARIZAÇÃO DE DIVERGÊNCIAS:</strong>
          Declaramos para os devidos fins de controle institucional, inventário patrimonial e prestação de contas aos órgãos de auditoria que as divergências quantitativas e financeiras discriminadas neste documento foram apuradas in loco nesta data e submetidas às providências de ajuste e regularização no sistema.
        </div>

        <div class="sig-row">
          <div>
            <div class="sig-line">Conferente / Responsável pela Contagem</div>
            <div class="sig-sub">Nome e Matrícula</div>
          </div>
          <div>
            <div class="sig-line">Responsável pelo Almoxarifado / Farmácia</div>
            <div class="sig-sub">Carimbo e Assinatura</div>
          </div>
          <div>
            <div class="sig-line">Direção Administrativa / Auditoria Interna</div>
            <div class="sig-sub">Visto e Homologação</div>
          </div>
        </div>

        <div class="footer-note">
          Documento emitido eletronicamente pelo Sistema de Almoxarifado • Policlínica Regional Bernardo Félix da Silva - Sobral/CE
        </div>
      </body>
      </html>
    `;

    printFrame.contentDocument?.write(docHtml);
    printFrame.contentDocument?.close();
    printFrame.contentWindow?.focus();
    setTimeout(() => {
      try {
        printFrame.contentWindow?.print();
      } catch (e) {
        console.error("Print error:", e);
      }
      setTimeout(() => {
        if (printFrame.parentNode) {
          document.body.removeChild(printFrame);
        }
      }, 3000);
    }, 400);
  };

  // Export Excel for Divergences
  const handleExportDivergencesExcel = (itemsListOverride?: typeof activeDivergentList) => {
    try {
      let list = itemsListOverride || activeDivergentList;
      if (list.length === 0) {
        if (sessionDivergentItems.length > 0) list = sessionDivergentItems;
        else if (recordedDivergentItems.length > 0) list = recordedDivergentItems;
      }
      if (list.length === 0) {
        showToast("Nenhuma divergência apurada para exportar.", "info");
        return;
      }
      showToast("Gerando Planilha de Divergências...", "info");

      const rows = list.map((d, index) => {
        return {
          'Nº': index + 1,
          'Nome do Material': d.item.name || '',
          'Categoria': d.item.category || 'Geral',
          'Lote': d.item.batch_number || 'S/ LOTE',
          'Validade': formatSafeDate(d.item.expiry_date),
          'Unidade': d.item.unit_measure || 'UN',
          'Qtd. Sistema': d.systemQty,
          'Qtd. Física': d.physicalQty,
          'Divergência': d.diff > 0 ? `+${d.diff}` : d.diff,
          'Tipo': d.diff > 0 ? 'Sobra' : 'Falta',
          'Preço Unitário (R$)': d.item.unit_price || 0,
          'Impacto Financeiro (R$)': d.impact,
          'Parecer / Motivo': d.reason || (d.diff > 0 ? 'Sobra física' : 'Falta física'),
          'Localização': d.item.location || inventoryLocation,
          'Sala / Armário': d.item.room || ''
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Divergências de Estoque");
      const fileName = `Divergencias_Estoque_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast("Planilha de Divergências exportada com sucesso!", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`Erro ao exportar Excel: ${err.message}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Decorative Top Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-amber-500" />

        <div className="p-5 sm:p-6 lg:p-7 space-y-5">
          {/* Row 1: Context Breadcrumb & Location Metadata */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              {onBack && (
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-all cursor-pointer mr-1"
                >
                  <ChevronLeft size={14} /> Voltar
                </button>
              )}
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">Relatórios</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-bold">Módulo Oficial de Balanço & Inventário Físico</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                {selectedCategory === 'all' ? 'Todos os Tipos de Material' : selectedCategory}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                {inventoryLocation}
              </span>
            </div>
          </div>

          {/* Row 2: Title & Action Controls */}
          <div className="space-y-4 pt-1">
            {/* Title */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-100 shrink-0">
                  <ClipboardList size={24} />
                </div>
                <span className="whitespace-nowrap">Relatório de Balanço e Inventário</span>
              </h2>
            </div>

            {/* Action Buttons Toolbar - Justified directly below the title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 w-full">
              {/* Documento de Divergencias - Destaque com Badge */}
              <button
                onClick={() => setShowDivergencesDocModal(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-amber-600 via-rose-600 to-rose-700 hover:from-amber-700 hover:to-rose-800 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-sm shadow-rose-700/20 hover:shadow-md transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]"
                title="Visualizar, Imprimir e Emitir Documento Oficial de Divergências de Estoque"
              >
                <FileText size={16} className="shrink-0" />
                <span>Documento de Divergências</span>
                {(sessionDivergentItems.length > 0 || recordedDivergentItems.length > 0) && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-black rounded-full bg-white text-rose-700 shadow-2xs">
                    {sessionDivergentItems.length || recordedDivergentItems.length}
                  </span>
                )}
              </button>

              {/* Folha de Contagem (PDF) */}
              <button
                onClick={() => handleExportPDF(false)}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-sm hover:shadow transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]"
                title="Gerar Folha de Balanço Oficial em PDF para prancheta"
              >
                <Printer size={16} className="text-blue-300 shrink-0" />
                <span>Folha de Contagem (PDF)</span>
              </button>

              {/* PDF com Valores */}
              <button
                onClick={() => handleExportPDF(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200/90 hover:border-slate-300 font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]"
                title="Gerar Relatório com Valores Financeiros"
              >
                <FileSpreadsheet size={16} className="text-slate-500 shrink-0" />
                <span>PDF com Valores</span>
              </button>

              {/* Exportar Excel */}
              <button
                onClick={handleExportExcel}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-900 border border-emerald-200/80 font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]"
                title="Exportar Planilha Excel Completa (.xlsx)"
              >
                <Download size={16} className="text-emerald-600 shrink-0" />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mode Selector: View Mode vs Interactive Count Mode */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsCountMode(!isCountMode)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                isCountMode
                  ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20 ring-2 ring-amber-400/40'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <ClipboardList size={15} />
              <span>{isCountMode ? 'Modo Digitação de Balanço Ativo' : 'Ativar Digitação de Contagem em Tela'}</span>
            </button>

            {isCountMode && stats.countedItemsCount > 0 && (
              <button
                onClick={handleResetCounts}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 underline decoration-dotted flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} /> Limpar contagens digitadas ({stats.countedItemsCount})
              </button>
            )}

            <button
              onClick={() => setShowHistoryModal(true)}
              className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Visualizar histórico e auditoria de ajustes realizados via balanço"
            >
              <History size={14} className="text-slate-500" />
              <span>Histórico de Ajustes</span>
              {balancoHistory.length > 0 && (
                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black">
                  {balancoHistory.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowDivergencesDocModal(true)}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
              title="Visualizar e emitir o Termo Oficial de Divergências"
            >
              <FileText size={14} className="text-rose-600 shrink-0" />
              <span>Doc. de Divergências</span>
              {(sessionDivergentItems.length > 0 || recordedDivergentItems.length > 0) && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 bg-rose-200 text-rose-900 rounded-full text-[10px] font-black">
                  {sessionDivergentItems.length || recordedDivergentItems.length}
                </span>
              )}
            </button>
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
        <div className="bg-amber-50/90 border border-amber-200 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`p-2.5 rounded-xl shrink-0 ${stats.discrepanciesCount > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'}`}>
              <ClipboardList size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black text-amber-950">
                  Apuração em Andamento: {stats.countedItemsCount} de {stats.totalBatches} lotes conferidos
                </p>
                {stats.discrepanciesCount === 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 size={11} /> 100% Conferido sem divergência!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                    <AlertTriangle size={11} /> {stats.discrepanciesCount} {stats.discrepanciesCount === 1 ? 'divergência encontrada' : 'divergências encontradas'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                Total Físico Contado: <strong>{stats.totalPhysicalUnits}</strong> un.
                {stats.surplusItemsCount > 0 && (
                  <span className="ml-2 text-blue-700 font-bold">
                    • Sobras (+): <strong>+{stats.totalSurplusUnits} un</strong> em {stats.surplusItemsCount} {stats.surplusItemsCount === 1 ? 'lote' : 'lotes'}
                  </span>
                )}
                {stats.deficitItemsCount > 0 && (
                  <span className="ml-2 text-rose-700 font-bold">
                    • Faltas (-): <strong>-{stats.totalDeficitUnits} un</strong> em {stats.deficitItemsCount} {stats.deficitItemsCount === 1 ? 'lote' : 'lotes'}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {stats.discrepanciesCount > 0 && (
              <>
                <button
                  onClick={() => {
                    setDivergencesSourceTab('session');
                    setShowDivergencesDocModal(true);
                  }}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm shadow-rose-700/20 transition-all cursor-pointer"
                  title="Gerar e emitir o documento formal de apuração de divergências"
                >
                  <FileText size={14} />
                  <span>Gerar Documento de Divergências</span>
                </button>

                <button
                  onClick={handleOpenBatchModal}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm shadow-emerald-700/20 transition-all cursor-pointer"
                  title="Resolver e sincronizar todas as divergências diretamente no estoque do sistema"
                >
                  <SlidersHorizontal size={14} />
                  <span>Resolver Todas as Divergências ({stats.discrepanciesCount})</span>
                </button>

                <button
                  onClick={() => setStockFilter(stockFilter === 'divergences_only' ? 'all' : 'divergences_only')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border cursor-pointer ${
                    stockFilter === 'divergences_only'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title="Filtrar tabela mostrando apenas os lotes com divergência"
                >
                  <Filter size={13} />
                  <span>{stockFilter === 'divergences_only' ? 'Ver Todos os Lotes' : `Apenas Divergências (${stats.discrepanciesCount})`}</span>
                </button>
              </>
            )}

            <button
              onClick={() => handleExportPDF(false)}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Printer size={13} /> Imprimir Balanço
            </button>
          </div>
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
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
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
              <option value="divergences_only">
                Apenas Divergências {stats.discrepanciesCount > 0 ? `(${stats.discrepanciesCount})` : ''}
              </option>
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
                  <th className="py-3 px-3 text-center bg-amber-50/70 border-x border-amber-100">
                    Ação / Ajuste
                  </th>
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
                      } ${diff !== null && diff !== 0 ? 'bg-amber-50/15' : ''}`}
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
                        <div className="inline-flex items-center gap-1.5">
                          {item.batch_number ? (
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {item.batch_number}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">S/ Lote</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenAdjustModal(item)}
                            className="p-1 rounded text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Alterar lote deste material"
                          >
                            <Edit3 size={11} />
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="inline-flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border ${exp.color}`}>
                            <Calendar size={11} />
                            {exp.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenAdjustModal(item)}
                            className="p-1 rounded text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Alterar validade deste material"
                          >
                            <Edit3 size={11} />
                          </button>
                        </div>
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
                          <button
                            onClick={() => {
                              setIsCountMode(true);
                              handlePhysicalCountChange(item.id, String(item.quantity || 0));
                            }}
                            className="w-20 mx-auto py-1 border border-dashed border-slate-300 hover:border-blue-400 hover:text-blue-600 rounded text-center text-slate-400 font-mono text-[10px] transition-all cursor-pointer"
                            title="Clique para digitar a contagem física deste item"
                          >
                            [ Digitar ]
                          </button>
                        )}
                      </td>

                      {/* Discrepancy column in Count Mode */}
                      {isCountMode && (
                        <td className="py-2.5 px-3 text-center bg-blue-50/30 font-mono font-extrabold">
                          {diff !== null ? (
                            <div className="flex items-center justify-center gap-1.5">
                              {diff === 0 ? (
                                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px] font-black inline-flex items-center gap-1">
                                  <Check size={11} /> OK (0)
                                </span>
                              ) : diff > 0 ? (
                                <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 text-[11px] font-black">
                                  +{diff} (Sobra)
                                </span>
                              ) : (
                                <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 text-[11px] font-black">
                                  {diff} (Falta)
                                </span>
                              )}

                              {diff !== 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickApplyDiff(item, physicalVal)}
                                  className="p-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors shadow-2xs cursor-pointer"
                                  title="Aplicar rapidamente este saldo ao sistema"
                                >
                                  <Check size={12} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      )}

                      {/* Action / Adjust Column */}
                      <td className="py-2 px-3 text-center bg-amber-50/20 border-x border-amber-100/60 whitespace-nowrap">
                        {diff !== null && diff !== 0 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenAdjustModal(item, physicalVal)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-xs transition-all cursor-pointer"
                            title="Resolver divergência: ajustar saldo, lote e validade no estoque do sistema"
                          >
                            <SlidersHorizontal size={13} />
                            <span>Resolver Divergência</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenAdjustModal(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all cursor-pointer"
                            title="Ajustar quantidade, número do lote e data de validade"
                          >
                            <Wrench size={12} className="text-slate-500" />
                            <span>Ajustar Item</span>
                          </button>
                        )}
                      </td>

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

      {/* ========================================================================= */}
      {/* MODAL 1: AJUSTAR ITEM NO BALANÇO (QUANTIDADE, LOTE, VALIDADE, MOTIVO)    */}
      {/* ========================================================================= */}
      {adjustModal.show && adjustModal.item && (() => {
        const item = adjustModal.item;
        const oldQty = Number(item.quantity) || 0;
        const inputQty = parseInt(adjustModal.physicalQty, 10);
        const validNewQty = !isNaN(inputQty) && inputQty >= 0;
        const diff = validNewQty ? inputQty - oldQty : 0;
        const oldBatch = (item.batch_number || '').trim();
        const newBatch = adjustModal.batchNumber.trim();
        const batchChanged = newBatch !== oldBatch;
        const oldExpiry = item.expiry_date || 'Sem Validade';
        const newExpiry = adjustModal.isIndeterminateExpiry ? 'Indeterminada' : (adjustModal.expiryDate ? adjustModal.expiryDate : 'Sem Validade');
        const expiryChanged = newExpiry !== oldExpiry;
        const expStatus = adjustModal.isIndeterminateExpiry ? { label: 'Indeterminada / Sem Validade', color: 'text-slate-500 bg-slate-100 border-slate-200' } : getExpiryStatus(adjustModal.expiryDate);

        return (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
              {/* Accent bar */}
              <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-teal-500" />

              {/* Modal Header */}
              <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100">
                    <SlidersHorizontal size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                      Ajustar Item no Balanço de Estoque
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Corrija saldo físico, lote e validade diretamente no sistema
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAdjustModal(prev => ({ ...prev, show: false, item: null }))}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Material Info Header Card */}
                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        Material Selecionado
                      </span>
                      <h4 className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
                        {item.name}
                      </h4>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{item.description}</p>
                      )}
                    </div>
                    <span 
                      className="inline-block px-2.5 py-1 rounded-md text-[10px] font-extrabold text-white shrink-0"
                      style={{ backgroundColor: getCategoryColor(item.category || 'Geral') }}
                    >
                      {item.category || 'Geral'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-2.5 pt-2.5 border-t border-slate-200/60 text-xs font-semibold text-slate-600">
                    <span>Unidade: <strong>{item.unit_measure || 'UN'}</strong></span>
                    <span>Localização: <strong>{item.location || inventoryLocation}</strong></span>
                    {item.room && <span>Sala/Armário: <strong>{item.room}</strong></span>}
                  </div>
                </div>

                {/* Section 1: Quantidade em Estoque (Saldo Atual vs Físico) */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Package size={14} className="text-blue-600" />
                    Quantidade Físico-Contada no Balanço:
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Current System Quantity */}
                    <div className="p-3.5 bg-slate-100/70 rounded-2xl border border-slate-200">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        Saldo Atual no Sistema
                      </span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-black text-slate-900 font-mono">
                          {oldQty.toLocaleString('pt-BR')}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {item.unit_measure || 'unidades'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">Quantidade registrada atualmente</span>
                    </div>

                    {/* New Physical Count Input */}
                    <div className="p-3.5 bg-blue-50/50 rounded-2xl border border-blue-200">
                      <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider">
                        Novo Saldo Físico Apurado
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number"
                          min="0"
                          value={adjustModal.physicalQty}
                          onChange={(e) => setAdjustModal(prev => ({ ...prev, physicalQty: e.target.value }))}
                          className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-xl text-lg font-black text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="0"
                        />
                        <span className="text-xs font-extrabold text-blue-800 shrink-0">
                          {item.unit_measure || 'UN'}
                        </span>
                      </div>
                      <span className="text-[10px] text-blue-600 font-medium">Digite o valor físico real encontrado</span>
                    </div>
                  </div>

                  {/* Real-time Discrepancy indicator pill */}
                  {validNewQty && (
                    <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
                      diff === 0 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : diff > 0 
                          ? 'bg-blue-50 text-blue-800 border-blue-200' 
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}>
                      <span className="flex items-center gap-1.5">
                        {diff === 0 ? (
                          <CheckCircle2 size={14} className="text-emerald-600" />
                        ) : diff > 0 ? (
                          <ArrowRight size={14} className="text-blue-600" />
                        ) : (
                          <AlertTriangle size={14} className="text-rose-600" />
                        )}
                        <span>
                          {diff === 0 
                            ? 'Contagem idêntica ao sistema (Sem divergência de saldo).' 
                            : diff > 0 
                              ? `Sobra de Estoque identificada: +${diff} ${item.unit_measure || 'un.'}` 
                              : `Falta de Estoque identificada: ${diff} ${item.unit_measure || 'un.'}`}
                        </span>
                      </span>
                      <span className="font-mono font-black text-sm">
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    </div>
                  )}
                </div>

                {/* Section 2: Lote e Validade */}
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Boxes size={14} className="text-blue-600" />
                    Alterar Lote e Data de Validade:
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Lote */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                        <span>Número do Lote</span>
                        {item.batch_number && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Atual: {item.batch_number}
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={adjustModal.batchNumber}
                        onChange={(e) => setAdjustModal(prev => ({ ...prev, batchNumber: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        placeholder="Ex: LOTE-1234"
                      />
                      {batchChanged && (
                        <p className="text-[10px] text-blue-600 font-semibold">
                          Lote será alterado de "{oldBatch || 'S/ Lote'}" para "{newBatch || 'S/ Lote'}"
                        </p>
                      )}
                    </div>

                    {/* Validade */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                        <span>Data de Validade</span>
                        {item.expiry_date && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Atual: {formatSafeDate(item.expiry_date)}
                          </span>
                        )}
                      </label>
                      <input
                        type="date"
                        disabled={adjustModal.isIndeterminateExpiry}
                        value={adjustModal.expiryDate}
                        onChange={(e) => setAdjustModal(prev => ({ ...prev, expiryDate: e.target.value }))}
                        className={`w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                          adjustModal.isIndeterminateExpiry 
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                            : 'bg-slate-50 text-slate-800 border-slate-200'
                        }`}
                      />
                      <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={adjustModal.isIndeterminateExpiry}
                          onChange={(e) => setAdjustModal(prev => ({ ...prev, isIndeterminateExpiry: e.target.checked }))}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-[11px] font-medium text-slate-600">Sem validade / Indeterminada</span>
                      </label>
                    </div>
                  </div>

                  {/* Expiry status badge preview */}
                  {!adjustModal.isIndeterminateExpiry && adjustModal.expiryDate && (
                    <div className={`p-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 ${expStatus.color}`}>
                      <Calendar size={13} />
                      <span>Situação da nova validade: {expStatus.label}</span>
                    </div>
                  )}
                </div>

                {/* Section 3: Justificativa & Rastreabilidade */}
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-blue-600" />
                    Motivo e Rastreabilidade do Ajuste:
                  </span>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">
                      Motivo Principal:
                    </label>
                    <select
                      value={adjustModal.reason}
                      onChange={(e) => setAdjustModal(prev => ({ ...prev, reason: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                    >
                      <option value="Divergência apurada no balanço de estoque">Divergência apurada no balanço de estoque</option>
                      <option value="Correção de contagem física (Sobra de estoque)">Correção de contagem física (Sobra de estoque)</option>
                      <option value="Correção de contagem física (Falta / Baixa de estoque)">Correção de contagem física (Falta / Baixa de estoque)</option>
                      <option value="Acerto de número de lote e validade física">Acerto de número de lote e validade física</option>
                      <option value="Perda / Quebra / Avaria física identificada">Perda / Quebra / Avaria física identificada</option>
                      <option value="Inventário físico periódico oficial">Inventário físico periódico oficial</option>
                      <option value="Outro motivo (especificar nas observações)">Outro motivo (especificar nas observações)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">
                      Observação / Detalhes Adicionais (Opcional):
                    </label>
                    <textarea
                      rows={2}
                      value={adjustModal.observation}
                      onChange={(e) => setAdjustModal(prev => ({ ...prev, observation: e.target.value }))}
                      placeholder="Ex: Conferido pelo responsável em prancheta física; recontagem efetuada..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Changes Summary Preview */}
                <div className="p-3 bg-slate-100/80 rounded-2xl border border-slate-200 text-xs space-y-1">
                  <p className="font-extrabold text-slate-800 flex items-center gap-1">
                    <FileCheck2 size={13} className="text-blue-600" />
                    Resumo das alterações que serão salvas no sistema:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-0.5 pl-4 list-disc font-medium">
                    <li>
                      Quantidade: <strong>{oldQty} un.</strong> → <strong className={diff !== 0 ? (diff > 0 ? 'text-blue-700' : 'text-rose-700') : 'text-slate-900'}>{validNewQty ? inputQty : oldQty} un.</strong> {diff !== 0 ? `(Diferença: ${diff > 0 ? '+' : ''}${diff})` : '(Sem alteração)'}
                    </li>
                    {batchChanged && (
                      <li>
                        Lote: <strong>{oldBatch || 'S/ Lote'}</strong> → <strong className="text-blue-700">{newBatch || 'S/ Lote'}</strong>
                      </li>
                    )}
                    {expiryChanged && (
                      <li>
                        Validade: <strong>{oldExpiry}</strong> → <strong className="text-blue-700">{newExpiry}</strong>
                      </li>
                    )}
                    <li>
                      Será registrada movimentação auditável na rastreabilidade com o usuário: <strong>{currentUser?.displayName || currentUser?.email || 'Almoxarifado'}</strong>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isSavingAdjust}
                  onClick={() => setAdjustModal(prev => ({ ...prev, show: false, item: null }))}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 transition-all cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={isSavingAdjust || !validNewQty}
                  onClick={handleSaveItemAdjustment}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 hover:from-blue-800 hover:to-indigo-950 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-blue-700/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingAdjust ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Salvando Ajuste...</span>
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      <span>Salvar e Atualizar Estoque</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 2: RESOLVER TODAS AS DIVERGÊNCIAS EM LOTE                         */}
      {/* ========================================================================= */}
      {batchAdjustModal.show && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Accent bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-700" />

            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
                  <CheckCheck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Resolver Todas as Divergências do Balanço
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    As contagens físicas digitadas serão aplicadas diretamente ao saldo do sistema
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setBatchAdjustModal(prev => ({ ...prev, show: false }))}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
                  <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Itens Divergentes</span>
                  <p className="text-xl font-black text-amber-950 mt-0.5">{stats.discrepanciesCount} lotes</p>
                  <p className="text-[10px] text-amber-700">serão atualizados no sistema</p>
                </div>

                <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200">
                  <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider">Total de Sobras</span>
                  <p className="text-xl font-black text-blue-900 mt-0.5">+{stats.totalSurplusUnits} un.</p>
                  <p className="text-[10px] text-blue-700">em {stats.surplusItemsCount} lotes apurados</p>
                </div>

                <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200">
                  <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider">Total de Faltas</span>
                  <p className="text-xl font-black text-rose-900 mt-0.5">-{stats.totalDeficitUnits} un.</p>
                  <p className="text-[10px] text-rose-700">em {stats.deficitItemsCount} lotes apurados</p>
                </div>
              </div>

              {/* Table of Diverging Items */}
              <div className="space-y-1.5">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Relação de Lotes que serão Atualizados:
                </span>
                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Material</th>
                        <th className="py-2 px-3">Lote</th>
                        <th className="py-2 px-3 text-right">Saldo Atual</th>
                        <th className="py-2 px-3 text-right">Contagem Física</th>
                        <th className="py-2 px-3 text-center">Divergência</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {balanceItems
                        .filter(i => physicalCounts[i.id] !== undefined && physicalCounts[i.id] !== (i.quantity || 0))
                        .map(item => {
                          const pVal = physicalCounts[item.id];
                          const d = pVal - (item.quantity || 0);
                          return (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-semibold text-slate-800 truncate max-w-xs">
                                {item.name}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                                {item.batch_number || 'S/ Lote'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600">
                                {item.quantity || 0}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-black text-blue-700">
                                {pVal}
                              </td>
                              <td className="py-2 px-3 text-center font-mono font-bold">
                                {d > 0 ? (
                                  <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">+{d}</span>
                                ) : (
                                  <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px]">{d}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Motivo do Ajuste em Lote */}
              <div className="space-y-1 pt-1">
                <label className="text-[11px] font-bold text-slate-600">
                  Motivo Geral do Ajuste em Lote:
                </label>
                <input
                  type="text"
                  value={batchAdjustModal.reason}
                  onChange={(e) => setBatchAdjustModal(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="Ex: Conferência Física do Balanço Periódico de Estoque"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  Ao confirmar, cada lote terá seu saldo substituído pelo valor contado e será gerada uma transação de entrada (sobra) ou saída (falta) para total rastreabilidade.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isBatchSaving}
                onClick={() => setBatchAdjustModal(prev => ({ ...prev, show: false }))}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isBatchSaving}
                onClick={handleApplyBatchAdjustments}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-700/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isBatchSaving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Sincronizando no Sistema...</span>
                  </>
                ) : (
                  <>
                    <CheckCheck size={14} />
                    <span>Confirmar e Atualizar Estoque ({stats.discrepanciesCount} itens)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: HISTÓRICO E AUDITORIA DE AJUSTES DO BALANÇO                     */}
      {/* ========================================================================= */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            {/* Accent bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-teal-500" />

            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Histórico de Ajustes de Balanço
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Auditoria e rastreabilidade dos ajustes de estoque e contagem física realizados
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {balancoHistory.length === 0 ? (
                <div className="p-12 text-center">
                  <Clock size={36} className="mx-auto text-slate-300 mb-2" />
                  <h4 className="text-sm font-bold text-slate-700">Nenhum ajuste de balanço recente</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Os ajustes realizados durante as conferências físicas e balanços de estoque serão listados aqui.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Data/Hora</th>
                        <th className="py-2.5 px-3">Material</th>
                        <th className="py-2.5 px-3">Lote</th>
                        <th className="py-2.5 px-3 text-center">Tipo</th>
                        <th className="py-2.5 px-3 text-right">Qtd. Ajustada</th>
                        <th className="py-2.5 px-3">Responsável</th>
                        <th className="py-2.5 px-3">Observação / Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {balancoHistory.map(t => {
                        const dateStr = t.date ? format(new Date(t.date), 'dd/MM/yyyy HH:mm') : '-';
                        const isEntry = t.type === 'entry';

                        return (
                          <tr key={t.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {dateStr}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">
                              {t.item_name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {t.batch_number || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                isEntry 
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                                  : 'bg-rose-100 text-rose-800 border border-rose-200'
                              }`}>
                                {isEntry ? '+ Sobra (Entrada)' : '- Falta (Saída)'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                              {t.quantity} un.
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 text-[11px] truncate max-w-[120px]">
                              {t.responsible || t.responsibleEmail || 'Almoxarifado'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate" title={t.observation}>
                              {t.observation || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-slate-500">
                Total de <strong>{balancoHistory.length}</strong> {balancoHistory.length === 1 ? 'registro de ajuste' : 'registros de ajuste'}
              </span>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DOCUMENTO OFICIAL DE DIVERGÊNCIAS DE ESTOQUE */}
      {showDivergencesDocModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl shadow-2xl border border-slate-300/80 w-full max-w-5xl my-auto max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-amber-500 to-rose-600 text-white rounded-2xl shadow-md shadow-rose-600/20">
                  <FileText size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                      Documento Oficial de Auditoria
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      {activeDivergentList.length} {activeDivergentList.length === 1 ? 'lote com divergência' : 'lotes com divergência'}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">
                    Termo e Relatório Oficial de Divergências de Estoque
                  </h3>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintDivergencesDoc(activeDivergentList)}
                  className="px-3.5 py-2 bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-blue-700/20 transition-all cursor-pointer"
                  title="Imprimir documento em papel A4 formatado"
                >
                  <Printer size={15} /> Imprimir Documento
                </button>

                <button
                  type="button"
                  onClick={() => handleExportDivergencesPDF(activeDivergentList)}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-rose-600/20 transition-all cursor-pointer"
                  title="Baixar arquivo PDF Oficial"
                >
                  <Download size={15} /> Baixar PDF
                </button>

                <button
                  type="button"
                  onClick={() => handleExportDivergencesExcel(activeDivergentList)}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Exportar dados para Excel (.xlsx)"
                >
                  <FileSpreadsheet size={15} className="text-emerald-600" /> Excel
                </button>

                <button
                  type="button"
                  onClick={() => setShowDivergencesDocModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer ml-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Source Tab Selector */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Origem dos Dados:</span>
                <button
                  type="button"
                  onClick={() => setDivergencesSourceTab('session')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    divergencesSourceTab === 'session'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <ClipboardList size={13} />
                  <span>Contagem Física Atual ({sessionDivergentItems.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDivergencesSourceTab('recorded')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    divergencesSourceTab === 'recorded'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <History size={13} />
                  <span>Ajustes Já Registrados ({recordedDivergentItems.length})</span>
                </button>
              </div>

              {activeDivergentList.length === 0 && (
                <button
                  type="button"
                  onClick={handleGenerateSampleDivergences}
                  className="text-xs font-black text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg border border-blue-200 flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles size={13} /> Carregar Amostra de Conferência
                </button>
              )}
            </div>

            {/* Document Body (Paper Sheet) */}
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-slate-200/50">
              {activeDivergentList.length === 0 ? (
                <div className="bg-white rounded-3xl p-10 text-center max-w-xl mx-auto shadow-sm border border-slate-200/80 my-8 space-y-4">
                  <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                    <AlertTriangle size={32} />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-900">Nenhuma divergência apurada nesta visualização</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                      Não há itens com diferenças entre a contagem física e o sistema na aba selecionada. Digite as contagens no balanço ou gere uma amostra de conferência para visualizar o documento oficial.
                    </p>
                  </div>
                  <div className="pt-2 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateSampleDivergences}
                      className="px-4 py-2 bg-gradient-to-r from-amber-600 to-rose-600 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
                    >
                      <Sparkles size={14} /> Carregar Dados de Demonstração
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDivergencesDocModal(false);
                        setIsCountMode(true);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
                    >
                      Digitar Contagens no Balanço
                    </button>
                  </div>
                </div>
              ) : (
                /* The Printable Paper Container */
                <div className="bg-white rounded-2xl shadow-lg border border-slate-300 p-6 sm:p-10 max-w-4xl mx-auto space-y-6 text-slate-900">
                  {/* Institutional Header */}
                  {letterheadImage ? (
                    <div className="w-full flex justify-center pb-4 border-b-2 border-slate-800">
                      <img src={letterheadImage} alt="Timbre Institucional" className="max-h-24 object-contain" />
                    </div>
                  ) : (
                    <div className="border-b-2 border-amber-600 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-12 bg-amber-600 rounded-xs shrink-0" />
                        <div>
                          <p className="text-sm sm:text-base font-black tracking-tight text-blue-950 uppercase">
                            Policlínica Regional Bernardo Félix da Silva
                          </p>
                          <p className="text-xs font-bold text-amber-700">
                            TERMO E RELATÓRIO OFICIAL DE DIVERGÊNCIAS DE ESTOQUE
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Consórcio Público de Saúde da Microrregião de Sobral (CPSMS) • Almoxarifado Central e Farmácia
                          </p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <span className="px-2.5 py-1 bg-amber-50 border border-amber-300 rounded-lg text-xs font-black text-amber-900 block">
                          TERMO-DIV-{new Date().getFullYear()}-{String(activeDivergentList.length * 19 + 1042).padStart(4, '0')}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Emissão: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Metadata Info Card */}
                  <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3.5 sm:p-4 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Tipo / Categoria</span>
                      <strong className="text-slate-800">
                        {selectedCategory === 'all' ? 'TODOS OS MATERIAIS' : selectedCategory.toUpperCase()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Localização</span>
                      <strong className="text-slate-800">
                        {(selectedLocation === 'all' ? inventoryLocation : selectedLocation).toUpperCase()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Responsável Técnico</span>
                      <strong className="text-slate-800 truncate block">
                        {currentUser?.displayName || userProfile?.name || auth.currentUser?.displayName || 'Almoxarifado Central'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Finalidade</span>
                      <strong className="text-slate-800">Regularização e Balanço</strong>
                    </div>
                  </div>

                  {/* Financial & Quantitative KPI Cards */}
                  {(() => {
                    let totalSurplusUnits = 0;
                    let totalSurplusVal = 0;
                    let totalDeficitUnits = 0;
                    let totalDeficitVal = 0;

                    activeDivergentList.forEach(d => {
                      if (d.diff > 0) {
                        totalSurplusUnits += d.diff;
                        totalSurplusVal += d.impact;
                      } else {
                        totalDeficitUnits += Math.abs(d.diff);
                        totalDeficitVal += Math.abs(d.impact);
                      }
                    });

                    const netUnits = totalSurplusUnits - totalDeficitUnits;
                    const netVal = totalSurplusVal - totalDeficitVal;

                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Divergências</span>
                          <span className="text-lg font-black text-slate-900 mt-0.5 block">{activeDivergentList.length} lotes</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">Sobras Físicas (+)</span>
                          <span className="text-base font-black text-emerald-800 mt-0.5 block">
                            +{totalSurplusUnits} un <span className="text-xs font-semibold">({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSurplusVal)})</span>
                          </span>
                        </div>
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block">Faltas Físicas (-)</span>
                          <span className="text-base font-black text-rose-800 mt-0.5 block">
                            -{totalDeficitUnits} un <span className="text-xs font-semibold">({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDeficitVal)})</span>
                          </span>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">Impacto Líquido</span>
                          <span className={`text-base font-black mt-0.5 block ${netVal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {netUnits > 0 ? '+' : ''}{netUnits} un <span className="text-xs font-semibold">({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netVal)})</span>
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Materials Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-amber-600 text-white font-bold">
                        <tr>
                          <th className="py-2.5 px-3 w-8 text-center">#</th>
                          <th className="py-2.5 px-3">Material / Descrição</th>
                          <th className="py-2.5 px-3 w-24">Lote</th>
                          <th className="py-2.5 px-3 w-24 text-center">Validade</th>
                          <th className="py-2.5 px-3 w-12 text-center">Und</th>
                          <th className="py-2.5 px-3 w-20 text-right">Qtd. Sistema</th>
                          <th className="py-2.5 px-3 w-20 text-right">Qtd. Física</th>
                          <th className="py-2.5 px-3 w-24 text-center">Divergência</th>
                          <th className="py-2.5 px-3 w-20 text-right">Vlr. Unit</th>
                          <th className="py-2.5 px-3 w-24 text-right">Impacto (R$)</th>
                          <th className="py-2.5 px-3">Parecer / Causa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeDivergentList.map((d, idx) => {
                          const isSurplus = d.diff > 0;
                          return (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/20'}>
                              <td className="py-2.5 px-3 text-center text-slate-400 font-black">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-800">
                                <div>{d.item.name || 'Sem nome'}</div>
                                <span className="text-[10px] text-slate-400 font-normal">{d.item.category || 'Geral'}</span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">{d.item.batch_number || 'S/ Lote'}</td>
                              <td className="py-2.5 px-3 text-center text-slate-600">{formatSafeDate(d.item.expiry_date)}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-500">{d.item.unit_measure || 'UN'}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">{d.systemQty}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">{d.physicalQty}</td>
                              <td className="py-2.5 px-3 text-center font-black">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                                  isSurplus 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                                }`}>
                                  {isSurplus ? `+${d.diff} (Sobra)` : `${d.diff} (Falta)`}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600 text-[11px]">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.item.unit_price || 0)}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-mono font-black text-[11px] ${isSurplus ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {d.impact >= 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.impact)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 text-[11px] italic">
                                {d.reason || (isSurplus ? 'Sobra de contagem física' : 'Falta apurada')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Declaration of Audit & Regularization */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[11px] text-slate-600 leading-relaxed space-y-1">
                    <strong className="text-slate-800 uppercase tracking-wide block text-[10px]">
                      Termo Declaratório de Apuração de Divergências e Homologação
                    </strong>
                    <p>
                      Declaramos para os devidos fins de controle patrimonial, inventário institucional e auditoria do SUS que as divergências quantitativas e financeiras discriminadas neste documento foram rigorosamente apuradas durante o procedimento de conferência física in loco nesta data. Os registros foram submetidos à homologação e ajustes cabíveis para alinhamento entre o estoque físico real e os lançamentos no sistema.
                    </p>
                  </div>

                  {/* Signatures Area */}
                  <div className="pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs">
                    <div className="space-y-1">
                      <div className="border-t border-slate-400 pt-2 font-black text-slate-800">
                        Conferente / Responsável
                      </div>
                      <p className="text-[10px] text-slate-500">Contagem Física In Loco</p>
                      <p className="text-[9px] text-slate-400">Nome e Matrícula</p>
                    </div>

                    <div className="space-y-1">
                      <div className="border-t border-slate-400 pt-2 font-black text-slate-800">
                        Responsável pelo Almoxarifado
                      </div>
                      <p className="text-[10px] text-slate-500">Almoxarifado Central / Farmácia</p>
                      <p className="text-[9px] text-slate-400">Carimbo e Assinatura</p>
                    </div>

                    <div className="space-y-1">
                      <div className="border-t border-slate-400 pt-2 font-black text-slate-800">
                        Direção / Auditoria Interna
                      </div>
                      <p className="text-[10px] text-slate-500">Controle Interno e Conformidade</p>
                      <p className="text-[9px] text-slate-400">Visto de Homologação</p>
                    </div>
                  </div>

                  {/* Footer Notice */}
                  <div className="text-center text-[9px] text-slate-400 pt-4 border-t border-slate-100">
                    Policlínica Regional Bernardo Félix da Silva • Consórcio Público de Saúde da Microrregião de Sobral (CPSMS)
                    <br />
                    Sistema Integrado de Gestão de Estoque e Almoxarifado • Emissão em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Bar */}
            <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500">
                Total de <strong>{activeDivergentList.length}</strong> {activeDivergentList.length === 1 ? 'lote com divergência apurada' : 'lotes com divergências apuradas'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDivergencesDocModal(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
