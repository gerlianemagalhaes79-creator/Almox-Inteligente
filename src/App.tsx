import * as React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Package, 
  ArrowUpRight, 
  ArrowDownLeft, 
  AlertTriangle, 
  Plus, 
  History, 
  LayoutDashboard,
  Calendar,
  Search,
  Settings,
  ChevronRight,
  Menu,
  X,
  Check,
  Edit2,
  BarChart3,
  TrendingUp,
  Upload,
  TrendingDown,
  DollarSign,
  Filter,
  Download,
  FileText,
  LogIn,
  LogOut,
  Trash2,
  Save,
  RotateCcw,
  CheckCircle,
  Clock,
  Bell,
  Users,
  Info,
  Printer,
  Copy,
  BookOpen,
  Activity,
  PieChart as PieChartIcon,
  Image as ImageIcon,
  Tag,
  ShoppingCart,
  Calculator,
  Sparkles,
  Scale
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  setDoc,
  getDoc,
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  runTransaction,
  where,
  Timestamp,
  getDocs,
  writeBatch,
  deleteDoc,
  deleteField,
  DocumentReference
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signInWithRedirect,
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  getAuth
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { db, auth } from './firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { Item, Transaction, UserProfile, MaterialRequest, RequestItem, Notification, BalanceRecord } from './types';
import { ApuraSUSProducaoReport } from './components/ApuraSUSProducaoReport';
import { ApuraSUSCustosReport } from './components/ApuraSUSCustosReport';
import { StockBalance } from './components/StockBalance';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ItemGroup {
  name: string;
  total_quantity: number;
  min_quantity: number;
  category: string | null;
  supplier: string | null;
  unit_measure?: string | null;
  batches: Item[];
  weeklyExitRate: number;
  durationWeeks: number | 'infinite';
}

const normalizeString = (str: string | null | undefined) => 
  (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const getSafeDocId = (name: string | null | undefined) => {
  const normalized = normalizeString(name);
  return normalized.replace(/[^a-z0-9]/gi, '_');
};

interface DurationMonthInfo {
  key: string;
  monthYear: string;
  shortMonthYear: string;
  sectionTitle: string;
  isCurrentMonth: boolean;
  sortOrder: number;
  monthName: string;
  year: number;
  isInfinite: boolean;
}

const getDurationMonthInfo = (durationWeeks: number | 'infinite' | undefined | null): DurationMonthInfo => {
  if (durationWeeks === 'infinite' || durationWeeks === undefined || durationWeeks === null || isNaN(Number(durationWeeks))) {
    return {
      key: '9999-99',
      monthYear: 'Indeterminado (‚àû)',
      shortMonthYear: '‚àû',
      sectionTitle: 'ESTOQUE SEM CONSUMO RECENTE / DURA√á√ÉO INDETERMINADA (‚àû)',
      isCurrentMonth: false,
      sortOrder: 999999,
      monthName: 'Indeterminado',
      year: 9999,
      isInfinite: true
    };
  }

  const now = new Date();
  const numWeeks = Number(durationWeeks);
  const days = Math.max(0, Math.round(numWeeks * 7));
  const targetDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth(); // 0-11

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Mar√ßo', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const shortMonthNames = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  const monthName = monthNames[targetMonth];
  const shortMonthName = shortMonthNames[targetMonth];
  const isCurrentMonth = (targetYear === currentYear && targetMonth === currentMonth);
  
  const key = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
  const monthYear = `${monthName}/${targetYear}`;
  const shortMonthYear = `${shortMonthName}/${targetYear}`;
  
  const sectionTitle = isCurrentMonth 
    ? `PREVIS√ÉO DE ESGOTAMENTO: ${monthName.toUpperCase()}/${targetYear} (M√äS ATUAL)`
    : `PREVIS√ÉO DE ESGOTAMENTO: ${monthName.toUpperCase()}/${targetYear}`;

  const sortOrder = targetYear * 100 + targetMonth;

  return {
    key,
    monthYear,
    shortMonthYear,
    sectionTitle,
    isCurrentMonth,
    sortOrder,
    monthName,
    year: targetYear,
    isInfinite: false
  };
};

interface PurchasePlanningItem {
  name: string;
  category: string;
  supplier: string;
  unit_measure: string;
  currentStock: number;
  weeklyRate: number;
  monthlyRate: number;
  durationWeeks: number | 'infinite';
  durationMonthInfo: DurationMonthInfo;
  periodDemand: number;
  safetyStock: number;
  totalRequired: number;
  quantityToBuy: number;
  unitPrice: number;
  totalEstimatedCost: number;
  willCoverTarget: boolean;
  status: 'COBRE_TOTAL' | 'DEFICIT_MODERADO' | 'DEFICIT_CRITICO' | 'ZERADO_SEM_ESTOQUE';
}

const SECTORS = [
  'Imagem', 'Ilha', 'P√© Diab√©tico', 'Dire√ß√£o', 'Setor Pessoal', 
  'CER', 'Setor de Terapias', 'SSVV', 'Recep√ß√£o', 
  'Higieniza√ß√£o', 'Manuten√ß√£o', 'Almoxarifado',
  'Telefonia', 'Marca√ß√£o', 'Entrega de Exames', 'Regula√ß√£o',
  'Farm√°cia', 'CME', 'Envase', 'SESMT', 'Ouvidoria', 'Copa', 'Escrit√≥rio da Qualidade', 'TI', 'SAME'
];

const SECTOR_COLORS: Record<string, string> = {
  'Imagem': '#3b82f6',
  'Ilha': '#10b981',
  'P√© Diab√©tico': '#f59e0b',
  'Dire√ß√£o': '#ef4444',
  'Setor Pessoal': '#8b5cf6',
  'CER': '#ec4899',
  'Setor de Terapias': '#06b6d4',
  'SSVV': '#f97316',
  'Recep√ß√£o': '#14b8a6',
  'Higieniza√ß√£o': '#6366f1',
  'Manuten√ß√£o': '#84cc16',
  'Almoxarifado': '#1c1917',
  'Telefonia': '#d946ef',
  'Marca√ß√£o': '#a855f7',
  'Entrega de Exames': '#f43f5e',
  'Regula√ß√£o': '#fb923c',
  'Farm√°cia': '#059669',
  'CME': '#7c3aed',
  'Envase': '#db2777',
  'SESMT': '#ea580c',
  'Ouvidoria': '#2563eb',
  'Copa': '#84cc16',
  'Escrit√≥rio da Qualidade': '#4b5563',
  'TI': '#1e293b',
  'SAME': '#7c2d12'
};

const ROOMS = ['Sala A', 'Sala B', 'Almoxarifado Principal', 'Farm√°cia'];

const CATEGORY_COLORS: Record<string, string> = {
  'M√©dico Hospitalar': '#ef4444',
  'Aliment√≠cio': '#f59e0b',
  'Expediente': '#3b82f6',
  'Higiene': '#10b981',
  'Radiol√≥gico': '#8b5cf6',
  'Saneante': '#06b6d4',
  'Copa & Cozinha': '#f97316',
  'Papelaria': '#0ea5e9',
  'EPI': '#ec4899',
  'Gr√°fica': '#fbbf24',
  'Inform√°tica': '#6366f1',
  'Limpeza': '#059669',
  'Anest√©sico': '#7c3aed',
  'Medicamentos': '#be123c',
  'Fisioter√°picos': '#14b8a6',
  'Manuten√ß√£o': '#57534e',
  'Outros': '#78716c',
};

const getCategoryColor = (cat: string) => {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  const hash = cat.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };

  console.warn(`[Firestore ${operationType}] Notice on ${path}:`, errMessage);

  // Throw only for mutations if explicitly needed, never for read/list listeners or quota limit errors
  const isQuotaError = errMessage.toLowerCase().includes('quota limit exceeded') || errMessage.toLowerCase().includes('resource_exhausted');
  if (!isQuotaError && (operationType === OperationType.WRITE || operationType === OperationType.CREATE || operationType === OperationType.UPDATE || operationType === OperationType.DELETE)) {
    throw new Error(errMessage);
  }
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    handleFirestoreError(error, OperationType.WRITE, 'client_crash');
  }

  render() {
    if (this.state.hasError) {
      const isQuotaError = String(this.state.error?.message || '').toLowerCase().includes('quota') || 
                           String(this.state.error?.message || '').toLowerCase().includes('resource_exhausted') ||
                           String(this.state.error?.message || '').toLowerCase().includes('resource-exhausted');

      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-lg w-full border border-slate-100">
            <div className={`w-16 h-16 ${isQuotaError ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
              <AlertTriangle size={32} />
            </div>
            
            {isQuotaError ? (
              <>
                <h2 className="text-2xl font-black text-center text-slate-900 mb-2">Cota Gratuita de Leituras Excedida</h2>
                <p className="text-slate-600 text-xs font-medium text-center mb-6 leading-relaxed">
                  A cota di√°ria do plano gratuito do Firebase (leituras de banco de dados) foi temporariamente atingida. 
                  O sistema continua armazenando suas altera√ß√µes e ativou a acelera√ß√£o por cache local no navegador.
                </p>
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-6">
                  <p className="text-xs font-bold text-amber-800 mb-1">üí° O que voc√™ pode fazer:</p>
                  <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                    <li>Recarregue a p√°gina para utilizar os dados em cache no seu navegador.</li>
                    <li>As cotas di√°rias gratuitas s√£o renovadas automaticamente pelo Google Firebase a cada novo ciclo di√°rio.</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-center text-slate-900 mb-4">Algo deu errado</h2>
                <p className="text-slate-500 text-center mb-6 text-sm">
                  Ocorreu um erro inesperado. Por favor, recarregue a p√°gina ou tente novamente.
                </p>
                <div className="bg-rose-50 p-4 rounded-xl mb-6 overflow-auto max-h-40 border border-rose-100">
                  <code className="text-xs text-rose-700">
                    {this.state.error?.message || "Erro desconhecido"}
                  </code>
                </div>
              </>
            )}

            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-gradient-to-r from-blue-700 to-indigo-900 text-white rounded-2xl font-black text-sm hover:from-blue-800 hover:to-indigo-950 transition-all shadow-lg shadow-blue-900/20"
            >
              Recarregar Aplica√ß√£o
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [allRequestItems, setAllRequestItems] = useState<RequestItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authSectors, setAuthSectors] = useState<string[]>([]);
  const [selectedSector, setSelectedSector] = useState(SECTORS[0]);
  const [donationUnitName, setDonationUnitName] = useState('');
  const [donationUnitAddress, setDonationUnitAddress] = useState('');
  const [donationUnitCNPJ, setDonationUnitCNPJ] = useState('');
  const [donationRevisionDate, setDonationRevisionDate] = useState('');
  const [letterheadImage, setLetterheadImage] = useState<string | null>(null);
  const [reportsTab, setReportsTab] = useState<'overview' | 'apurasus_producao' | 'apurasus_custos' | 'quantitativo' | 'letterhead'>('overview');
  const [quantitativoSource, setQuantitativoSource] = useState<'sample' | 'system'>('system');
  const [quantitativoPeriodPreset, setQuantitativoPeriodPreset] = useState<'1_semestre_2026' | '2_semestre_2026' | 'ano_2026' | 'custom'>('1_semestre_2026');
  const [quantitativoCustomStart, setQuantitativoCustomStart] = useState('2026-01-01');
  const [quantitativoCustomEnd, setQuantitativoCustomEnd] = useState('2026-06-30');
  const [quantitativoCategory, setQuantitativoCategory] = useState('Material M√©dico-Hospitalar');
  const [quantitativoTitle, setQuantitativoTitle] = useState('');
  const [quantitativoCriticalAnalysis, setQuantitativoCriticalAnalysis] = useState('');
  const [isEditingQuantitativoAnalysis, setIsEditingQuantitativoAnalysis] = useState(false);
  const quantitativoReportRef = useRef<HTMLDivElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [balances, setBalances] = useState<BalanceRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'balance' | 'history' | 'requests' | 'admin-devolutions' | 'reports' | 'my-requests' | 'new-request' | 'devolution' | 'users' | 'trash' | 'leader-stats'>('dashboard');
  const leaderStatistics = useMemo(() => {
    if (userProfile?.role !== 'L√çDER' && userProfile?.role !== 'SETOR') return { topRequested: [], topDelivered: [] };

    const requestedMap: Record<string, number> = {};
    const deliveredMap: Record<string, number> = {};

    allRequestItems.forEach(item => {
      const parentRequest = requests.find(r => r.id === item.request_id);
      if (!parentRequest || parentRequest.sector !== selectedSector) return;

      const normalizedName = item.product_name;
      requestedMap[normalizedName] = (requestedMap[normalizedName] || 0) + (item.quantity_requested || 0);

      if (parentRequest.status === 'ENTREGUE') {
        deliveredMap[normalizedName] = (deliveredMap[normalizedName] || 0) + (item.quantity_approved || 0);
      }
    });

    const topRequested = Object.entries(requestedMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    const topDelivered = Object.entries(deliveredMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    return { topRequested, topDelivered };
  }, [allRequestItems, requests, userProfile, selectedSector]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState<{show: boolean, type: 'entry' | 'exit', item?: Item}>({ show: false, type: 'entry' });
  const [transactionMinStock, setTransactionMinStock] = useState<number>(NaN);
  const [showDetailModal, setShowDetailModal] = useState<{show: boolean, type: 'low_stock' | 'expiry' | 'all_alerts', items: (Item | ItemGroup)[]}>({ show: false, type: 'low_stock', items: [] });
  const [showDeleteModal, setShowDeleteModal] = useState<{show: boolean, transactionId?: string}>({ show: false });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'logo' | 'tools' | 'info'>('logo');
  const [distribViewMode, setDistribViewMode] = useState<'types' | 'units'>('types');
  const [showMergeSuppliers, setShowMergeSuppliers] = useState(false);
  const [showMergeItems, setShowMergeItems] = useState(false);
  const [sourceSupplier, setSourceSupplier] = useState('');
  const [targetSupplier, setTargetSupplier] = useState('');
  const [sourceItemName, setSourceItemName] = useState('');
  const [targetItemName, setTargetItemName] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [showUserDeleteConfirm, setShowUserDeleteConfirm] = useState<{show: boolean, user?: UserProfile}>({ show: false });
  const [toast, setToast] = useState<{show: boolean, message: string, type: 'success' | 'error' | 'info'}>({ show: false, message: '', type: 'info' });
  const [showRequestDetailModal, setShowRequestDetailModal] = useState<{show: boolean, request?: MaterialRequest}>({ show: false });
  const [showDevolutionModal, setShowDevolutionModal] = useState<{show: boolean, request?: MaterialRequest}>({ show: false });
  const [devolutionBasket, setDevolutionBasket] = useState<Array<{ product_id: string, product_name: string, quantity: number, maxQty: number, selectedBatchId: string }>>([]);
  const [selectedDevProduct, setSelectedDevProduct] = useState('');
  const [devolutionReason, setDevolutionReason] = useState('N√£o teve uso');
  const [devolutionObservation, setDevolutionObservation] = useState('');
  const [isProcessingDevolution, setIsProcessingDevolution] = useState(false);
  const [devolutionSubTab, setDevolutionSubTab] = useState<'my_returns' | 'eligible_deliveries' | 'sector_stock'>('my_returns');
  const [adminAddItemSearch, setAdminAddItemSearch] = useState('');
  const [isAdminAddingItem, setIsAdminAddingItem] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showStockConfirm, setShowStockConfirm] = useState<{show: boolean, notificationId?: string, itemName?: string}>({show: false});
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [deletionReason, setDeletionReason] = useState('');
  const [showDeletedHistory, setShowDeletedHistory] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [inventorySort, setInventorySort] = useState<'name_asc' | 'name_desc' | 'duration_asc' | 'duration_desc'>('name_asc');
  const [inventoryLocation, setInventoryLocation] = useState<'Almoxarifado' | 'Farm√°cia'>('Almoxarifado');

  const isAdmin = userProfile?.role === 'ADMIN' || 
                  user?.email === 'gerlianemagalhaes79@gmail.com' || 
                  user?.email === 'poli.almoxarifado@gmail.com' || 
                  userProfile?.sector === 'Almoxarifado';

  useEffect(() => {
    if (userProfile?.sector === 'Farm√°cia' || selectedSector === 'Farm√°cia') {
      if (!isAdmin) {
        setInventoryLocation('Farm√°cia');
      }
    } else if (!isAdmin) {
      setInventoryLocation('Almoxarifado');
    }
  }, [selectedSector, userProfile?.sector, isAdmin]);

  useEffect(() => {
    if (userProfile && !isAdmin) {
      const allowedTabs = ['my-requests', 'new-request', 'devolution', 'leader-stats'];
      if (!allowedTabs.includes(activeTab)) {
        setActiveTab('my-requests');
      }
    }
  }, [isAdmin, userProfile, activeTab]);

  const weeklyExitRates = useMemo(() => {
    const twentyOneDaysAgo = new Date();
    twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);
    
    const rates: Record<string, number> = {};
    
    transactions.forEach(t => {
      if (t.type === 'exit' && !t.deletedAt && new Date(t.date) >= twentyOneDaysAgo) {
        rates[t.item_name] = (rates[t.item_name] || 0) + t.quantity;
      }
    });
    
    // Convert to weekly average (21 days is exactly 3 weeks)
    Object.keys(rates).forEach(name => {
      rates[name] = rates[name] / 3;
    });
    
    return rates;
  }, [transactions]);

  // Request states
  const [requestBasket, setRequestBasket] = useState<{product_id: string, product_name: string, quantity: number}[]>([]);
  const [requestObservation, setRequestObservation] = useState('');
  const [adminObservation, setAdminObservation] = useState('');
  const [isSyncingStock, setIsSyncingStock] = useState(false);

  // Auto-update Minimum Stock based on consumption velocity (8 weeks / 2 months coverage)
  useEffect(() => {
    if (!isAdmin || items.length === 0 || transactions.length === 0 || isSyncingStock) return;

    const syncStockVelocity = async () => {
      const updates: { id: string, newMin: number }[] = [];
      
      // We analyze items with history to ensure minimum stock covers 2 months (8 weeks)
      Object.keys(weeklyExitRates).forEach(itemName => {
        const weeklyRate = weeklyExitRates[itemName];
        if (weeklyRate > 0) {
          const recommendedMin = Math.ceil(weeklyRate * 8);
          
          // Find all batches of this item and check if their min_quantity needs update
          items.forEach(item => {
            if (item.name === itemName && !item.deletedAt) {
              // Only update if difference is more than 0 and actually different from stored
              if (recommendedMin !== item.min_quantity) {
                updates.push({ id: item.id, newMin: recommendedMin });
              }
            }
          });
        }
      });

      if (updates.length > 0) {
        setIsSyncingStock(true);
        try {
          console.log(`Auto-otimizando estoque m√≠nimo para ${updates.length} lotes...`);
          // Batch updates to Firestore (max 500 per batch)
          for (let i = 0; i < updates.length; i += 450) {
            const batch = writeBatch(db);
            const chunk = updates.slice(i, i + 450);
            chunk.forEach(u => {
              batch.update(doc(db, 'items', u.id), {
                min_quantity: u.newMin,
                updatedAt: serverTimestamp()
              });
            });
            await batch.commit();
          }
          console.log("Otimiza√ß√£o de estoque m√≠nimo conclu√≠da.");
        } catch (error) {
          console.error("Erro ao auto-atualizar estoques m√≠nimos:", error);
        } finally {
          setIsSyncingStock(false);
        }
      }
    };

    // Run sync after a short delay once data is loaded, and then every hour if the tab stays open
    const initialSync = setTimeout(syncStockVelocity, 10000);
    const intervalSync = setInterval(syncStockVelocity, 3600000); 

    return () => {
      clearTimeout(initialSync);
      clearInterval(intervalSync);
    };
  }, [isAdmin, items, transactions, weeklyExitRates, isSyncingStock]);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [editingRequest, setEditingRequest] = useState<MaterialRequest | null>(null);
  const [showRoomInventoryModal, setShowRoomInventoryModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState('Sala A');
  const [customRoomName, setCustomRoomName] = useState('Sala A');
  const [selectedRoomCategories, setSelectedRoomCategories] = useState<string[]>([]);
  
  const createNotification = async (userId: string, title: string, message: string, requestId?: string, type: 'STOCK_ZERO' | 'SYSTEM' | 'REQUEST' = 'SYSTEM', itemName?: string) => {
    try {
      const data: any = {
        userId,
        title,
        message,
        date: new Date().toISOString(),
        read: false,
        type,
      };
      
      if (requestId !== undefined) {
        data.requestId = requestId;
      }
      if (itemName !== undefined) {
        data.itemName = itemName;
      }

      await addDoc(collection(db, 'notifications'), data);
    } catch (error) {
      console.error("Error creating notification:", error);
    }
  };

  const checkStockAndNotify = async (itemName: string) => {
    try {
      if (!itemName) return;
      
      const normalizedName = normalizeString(itemName);
      const safeId = getSafeDocId(itemName);
      
      // Get all active batches for this product by scanning items and filtering in memory
      const itemsSnapshot = await getDocs(collection(db, 'items'));
      const batches = itemsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Item))
        .filter(i => !i.deletedAt && normalizeString(i.name) === normalizedName);

      const totalQuantity = batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

      if (totalQuantity === 0) {
        // Check if user already acknowledged this zero stock alert
        const dismissalDoc = await getDoc(doc(db, 'dismissed_stock_alerts', safeId));
        if (dismissalDoc.exists()) {
          return;
        }

        // Check if an unconfirmed notification for this item already exists
        const existingNotifQuery = query(
          collection(db, 'notifications'),
          where('userId', '==', 'ADMIN_GROUP'),
          where('read', '==', false)
        );
        const existingSnap = await getDocs(existingNotifQuery);
        
        // In-memory robust check to cover casing & spacing variations
        const alreadyNotified = existingSnap.docs.some(d => {
          const data = d.data();
          return data.type === 'STOCK_ZERO' && normalizeString(data.itemName) === normalizedName;
        });

        if (!alreadyNotified) {
          await createNotification(
            'ADMIN_GROUP',
            'Estoque Zerado',
            `O material "${itemName.toUpperCase()}" atingiu estoque zero.`,
            undefined,
            'STOCK_ZERO',
            itemName.toUpperCase()
          );
        }
      } else {
        // If stock goes back up, clear the dismissal entry to enable future zero alerts
        try {
          await deleteDoc(doc(db, 'dismissed_stock_alerts', safeId));
        } catch (e) {
          // Ignore
        }
      }
    } catch (error) {
      console.error("Error checking stock for notification:", error);
    }
  };
  
  // Form states
  const [bulkEntry, setBulkEntry] = useState({
    supplier: '',
    category: 'Expediente',
    origin: 'extra' as 'contract' | 'extra' | 'donation',
    room: 'Almoxarifado Principal',
    items: [{
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      initial_quantity: 1,
      min_quantity: NaN,
      batch_number: '',
      expiry_date: '',
      is_indeterminate_expiry: false,
      unit_price: 0,
      unit_measure: 'Unidade (UN)',
      medication_type: ''
    }]
  });
  const [categories, setCategories] = useState<string[]>(['M√©dico Hospitalar', 'Aliment√≠cio', 'Expediente', 'Higiene', 'Radiol√≥gico', 'Saneante', 'Copa & Cozinha', 'Papelaria', 'EPI', 'Gr√°fica', 'Inform√°tica', 'Limpeza', 'Anest√©sico', 'Medicamentos', 'Fisioter√°picos', 'Manuten√ß√£o']);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (showAddModal) {
      setBulkEntry({
        supplier: '',
        category: inventoryLocation === 'Farm√°cia' ? 'Medicamentos' : 'Expediente',
        origin: 'extra' as 'contract' | 'extra' | 'donation',
        room: inventoryLocation === 'Farm√°cia' ? 'Farm√°cia' : 'Almoxarifado Principal',
        items: [{
          id: Math.random().toString(36).substr(2, 9),
          name: '',
          initial_quantity: 1,
          min_quantity: NaN,
          batch_number: '',
          expiry_date: '',
          is_indeterminate_expiry: false,
          unit_price: 0,
          unit_measure: 'Unidade (UN)',
          medication_type: ''
        }]
      });
    }
  }, [showAddModal, inventoryLocation]);

  const addBulkItemRow = () => {
    setBulkEntry(prev => ({
      ...prev,
      items: [...prev.items, {
        id: Math.random().toString(36).substr(2, 9),
        name: '',
        initial_quantity: 1,
        min_quantity: NaN,
        batch_number: '',
        expiry_date: '',
        is_indeterminate_expiry: false,
        unit_price: 0,
        unit_measure: 'Unidade (UN)',
        medication_type: ''
      }]
    }));
  };

  const removeBulkItemRow = (id: string) => {
    if (bulkEntry.items.length > 1) {
      setBulkEntry(prev => ({
        ...prev,
        items: prev.items.filter(item => item.id !== id)
      }));
    }
  };

  const duplicateBulkItem = (id: string) => {
    const itemToDuplicate = bulkEntry.items.find(item => item.id === id);
    if (itemToDuplicate) {
      setBulkEntry(prev => ({
        ...prev,
        items: [...prev.items, {
          ...itemToDuplicate,
          id: Math.random().toString(36).substr(2, 9),
          batch_number: '',
          initial_quantity: 1,
          expiry_date: '',
          unit_measure: itemToDuplicate.unit_measure || 'Unidade (UN)',
          medication_type: itemToDuplicate.medication_type || ''
        }]
      }));
    }
  };

  const updateBulkItem = (id: string, field: string, value: any) => {
    setBulkEntry(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === id) {
          let processedValue = value;
          if (field === 'name' && typeof value === 'string') {
            processedValue = value.toUpperCase();
          }
          const updatedItem = { ...item, [field]: processedValue };
          
          // Auto-fill min_quantity if name is changed and we have a calculated rate (8 weeks / 2 months)
          if (field === 'name' && processedValue) {
            const weeklyRate = weeklyExitRates[processedValue] || 0;
            if (weeklyRate > 0) {
              updatedItem.min_quantity = Math.ceil(weeklyRate * 8);
            } else {
              // Try to find if the item exists but has no history yet, use its current min_quantity
              const existingItem = items.find(i => i.name === processedValue);
              if (existingItem) {
                updatedItem.min_quantity = existingItem.min_quantity;
              }
            }
          }
          
          return updatedItem;
        }
        return item;
      })
    }));
  };
  
  const [modalSector, setModalSector] = useState<string>('');
  const [transactionQty, setTransactionQty] = useState(1);
  const [exitReason, setExitReason] = useState<'consumo' | 'doacao' | 'vencido' | 'perda'>('consumo');
  const [expiryReason, setExpiryReason] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedItemName, setSelectedItemName] = useState<string>('');
  const [basket, setBasket] = useState<{item_id: string, quantity: number}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [requestSearchTerm, setRequestSearchTerm] = useState('');
  const [reportRange, setReportRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [printRange, setPrintRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [reportSectorFilter, setReportSectorFilter] = useState<string>('all');
  const [pcaRange, setPcaRange] = useState({
    start: format(subDays(new Date(), 365), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [pcaCategory, setPcaCategory] = useState('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'contract' | 'extra' | 'donation'>('all');

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingPrice, setEditingPrice] = useState<{ id: string, price: number } | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<{ id: string, quantity: number } | null>(null);
  const [editingMaterialName, setEditingMaterialName] = useState<{ oldName: string, newName: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ name: string, currentCategory: string, itemId?: string } | null>(null);
  const [customNewCategory, setCustomNewCategory] = useState('');
  const [showChangeCategoryModal, setShowChangeCategoryModal] = useState(false);
  const [categoryModalMaterial, setCategoryModalMaterial] = useState('');
  const [categoryModalNewCategory, setCategoryModalNewCategory] = useState('');
  const [customModalCategory, setCustomModalCategory] = useState('');
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
  const [showCriticalReportModal, setShowCriticalReportModal] = useState(false);
  const [criticalReportFilter, setCriticalReportFilter] = useState<'all' | 'low_stock' | 'expiry'>('all');
  
  // Purchase Planning States
  const [showPurchasePlanningModal, setShowPurchasePlanningModal] = useState(false);
  const [planningTargetMonth, setPlanningTargetMonth] = useState<number>(() => {
    // Default to April (index 3)
    return 3;
  });
  const [planningTargetYear, setPlanningTargetYear] = useState<number>(() => {
    const now = new Date();
    // If we are currently past April (month > 3), default to next year's April
    return now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  });
  const [planningSafetyOption, setPlanningSafetyOption] = useState<'standard_8w' | 'none' | 'margin_10' | 'margin_20'>('standard_8w');
  const [planningLocation, setPlanningLocation] = useState<'Almoxarifado' | 'Farm√°cia' | 'all'>('Almoxarifado');
  const [planningCategory, setPlanningCategory] = useState<string>('all');
  const [planningOnlyWithDeficit, setPlanningOnlyWithDeficit] = useState<boolean>(true);
  const [planningSearch, setPlanningSearch] = useState<string>('');
  const [planningSort, setPlanningSort] = useState<'deficit_desc' | 'cost_desc' | 'cost_asc' | 'name_asc' | 'duration_asc'>('deficit_desc');

  const uniqueSuppliers = useMemo(() => {
    const fromItems = items.map(i => i.supplier).filter(Boolean) as string[];
    const fromTrans = transactions.map(t => t.supplier).filter(Boolean) as string[];
    return Array.from(new Set([...fromItems, ...fromTrans])).sort();
  }, [items, transactions]);

  const uniqueItemNames = useMemo(() => {
    const names = new Set(items.filter(i => !i.deletedAt).map(i => i.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);

  useEffect(() => {
    if (showRequestDetailModal.show && showRequestDetailModal.request) {
      setAdminObservation(showRequestDetailModal.request.adminObservation || '');
    } else {
      setAdminObservation('');
    }
  }, [showRequestDetailModal.show, showRequestDetailModal.request]);

  const toggleExpand = (name: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedItems(newExpanded);
  };

  useEffect(() => {
    if (showTransactionModal.show) {
      if (showTransactionModal.type === 'exit' && showTransactionModal.item) {
        setBasket([{ item_id: showTransactionModal.item.id, quantity: 1 }]);
      }
    } else {
      setModalSearchTerm('');
      setSelectedItemName('');
      setSelectedItemId('');
      if (showTransactionModal.type === 'exit') {
        setBasket([]);
      }
    }
  }, [showTransactionModal.show, showTransactionModal.type, showTransactionModal.item]);

  useEffect(() => {
    if (activeTab !== 'new-request') {
      setRequestSearchTerm('');
    }
  }, [activeTab]);

  const handleSaveItemAdjustmentFromBalance = async (
    updatedItem: Partial<Item> & { id: string },
    auditData: {
      previousQty: number;
      newQty: number;
      difference: number;
      reason: string;
      notes?: string;
    }
  ) => {
    if (!isAdmin) {
      showToast('Apenas administradores podem realizar altera√ß√µes no Balan√ßo.', 'error');
      return;
    }

    try {
      const itemRef = doc(db, 'items', updatedItem.id);
      const itemSnap = await getDoc(itemRef);
      if (!itemSnap.exists()) {
        showToast('Item n√£o encontrado.', 'error');
        return;
      }
      const currentItem = itemSnap.data() as Item;
      const { id, ...dataToUpdate } = updatedItem;

      await updateDoc(itemRef, {
        ...dataToUpdate,
        updatedAt: serverTimestamp()
      });

      if (auditData.difference !== 0) {
        const isPositive = auditData.difference > 0;
        await addDoc(collection(db, 'transactions'), {
          item_id: id,
          item_name: dataToUpdate.name || currentItem.name,
          type: isPositive ? 'entry' : 'exit',
          origin: currentItem.origin || 'contract',
          quantity: Math.abs(auditData.difference),
          sector: 'Balan√ßo Geral / Auditoria',
          location: dataToUpdate.location || currentItem.location || 'Almoxarifado',
          room: dataToUpdate.room || currentItem.room || '',
          date: new Date().toISOString(),
          responsible: userProfile?.name || user?.displayName || user?.email || 'Administrador',
          responsibleEmail: user?.email || '',
          supplier: currentItem.supplier || 'N/A',
          batch_number: dataToUpdate.batch_number || currentItem.batch_number || 'S/N',
          expiry_date: dataToUpdate.expiry_date || currentItem.expiry_date || 'Indeterminada',
          observation: `[Balan√ßo Quadrimestral] ${auditData.reason}${auditData.notes ? ` - ${auditData.notes}` : ''} (Saldo anterior: ${auditData.previousQty}, Novo saldo: ${auditData.newQty})`
        });
      }

      if (dataToUpdate.name && dataToUpdate.name !== currentItem.name) {
        const otherBatches = items.filter(i => i.name === currentItem.name && i.id !== id && !i.deletedAt);
        if (otherBatches.length > 0) {
          const batch = writeBatch(db);
          otherBatches.forEach(b => {
            batch.update(doc(db, 'items', b.id), { name: dataToUpdate.name });
          });
          await batch.commit();
        }
      }

      if (dataToUpdate.name) {
        await checkStockAndNotify(dataToUpdate.name);
      }
    } catch (error: any) {
      console.error('Error saving item adjustment from balance:', error);
      throw error;
    }
  };

  const handleFinalizeBalanceFromComponent = async (balanceData: Omit<BalanceRecord, 'id'>) => {
    if (!isAdmin) {
      showToast('Apenas administradores podem registrar o Balan√ßo Oficial.', 'error');
      return;
    }

    try {
      await addDoc(collection(db, 'balances'), {
        ...balanceData,
        createdAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error finalizing balance:', error);
      throw error;
    }
  };

  const handleUpdatePrice = async () => {
    if (!editingPrice) return;
    try {
      const itemToUpdate = items.find(i => i.id === editingPrice.id);
      if (!itemToUpdate) return;

      // Update all items with the same name to keep prices consistent across batches
      const itemsWithSameName = items.filter(i => i.name.toLowerCase() === itemToUpdate.name.toLowerCase() && !i.deletedAt);
      
      const batch = writeBatch(db);
      itemsWithSameName.forEach(item => {
        batch.update(doc(db, 'items', item.id), {
          unit_price: editingPrice.price,
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      showToast(`Pre√ßo unit√°rio de "${itemToUpdate.name}" atualizado em todos os lotes!`, "success");
      setEditingPrice(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${editingPrice.id}`);
      showToast(`Erro ao atualizar pre√ßo: ${error.message}`, "error");
    }
  };

  const handleUpdateQuantity = async () => {
    if (!editingQuantity) return;
    try {
      await updateDoc(doc(db, 'items', editingQuantity.id), {
        quantity: editingQuantity.quantity
      });
      showToast("Quantidade atualizada com sucesso!", "success");
      const name = items.find(i => i.id === editingQuantity.id)?.name;
      setEditingQuantity(null);
      if (name) await checkStockAndNotify(name);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${editingQuantity.id}`);
      showToast(`Erro ao atualizar quantidade: ${error.message}`, "error");
    }
  };

  const handleUpdateMaterialName = async () => {
    if (!editingMaterialName || !editingMaterialName.newName.trim()) return;
    const oldName = editingMaterialName.oldName;
    const newName = editingMaterialName.newName.trim();

    if (oldName === newName) {
      setEditingMaterialName(null);
      return;
    }

    try {
      // Find all items and transactions with the old name
      const itemsToUpdate = items.filter(i => i.name === oldName);
      const transToUpdate = transactions.filter(t => t.item_name === oldName);
      
      const totalOps = itemsToUpdate.length + transToUpdate.length;
      
      if (totalOps === 0) {
        setEditingMaterialName(null);
        return;
      }

      // Process in batches of 400
      const allDocs = [
        ...itemsToUpdate.map(i => ({ ref: doc(db, 'items', i.id), data: { name: newName } })),
        ...transToUpdate.map(t => ({ ref: doc(db, 'transactions', t.id), data: { item_name: newName } }))
      ];

      for (let i = 0; i < allDocs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = allDocs.slice(i, i + 400);
        chunk.forEach(op => batch.update(op.ref, op.data));
        await batch.commit();
      }

      showToast("Nome do material atualizado com sucesso!", "success");
      setEditingMaterialName(null);
    } catch (error: any) {
      console.error("Error updating material name:", error);
      showToast(`Erro ao atualizar nome: ${error.message}`, "error");
    }
  };

  const handleUpdateCategory = async (targetCategory?: string) => {
    if (!editingCategory) return;
    
    let newCat = (targetCategory !== undefined ? targetCategory : editingCategory.currentCategory).trim();
    if (newCat === '__NEW__') {
      newCat = customNewCategory.trim();
    }
    
    if (!newCat) {
      showToast("Por favor, selecione ou informe uma categoria v√°lida.", "error");
      return;
    }

    try {
      if (editingCategory.itemId) {
        await updateDoc(doc(db, 'items', editingCategory.itemId), {
          category: newCat
        });
        showToast("Categoria do lote atualizada com sucesso!", "success");
      } else {
        const itemsToUpdate = items.filter(i => i.name === editingCategory.name);
        if (itemsToUpdate.length === 0) {
          setEditingCategory(null);
          return;
        }

        for (let i = 0; i < itemsToUpdate.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = itemsToUpdate.slice(i, i + 400);
          chunk.forEach(item => {
            batch.update(doc(db, 'items', item.id), { category: newCat });
          });
          await batch.commit();
        }
        showToast(`Categoria de "${editingCategory.name}" alterada para "${newCat}" com sucesso!`, "success");
      }

      if (!categories.includes(newCat)) {
        setCategories(prev => [...prev, newCat]);
      }

      setEditingCategory(null);
      setCustomNewCategory('');
    } catch (error: any) {
      console.error("Error updating category:", error);
      handleFirestoreError(error, OperationType.UPDATE, `items`);
      showToast(`Erro ao atualizar categoria: ${error.message}`, "error");
    }
  };

  const handleModalChangeCategory = async () => {
    if (!categoryModalMaterial) {
      showToast("Selecione o material que deseja alterar.", "error");
      return;
    }

    let newCat = categoryModalNewCategory.trim();
    if (newCat === '__NEW__') {
      newCat = customModalCategory.trim();
    }

    if (!newCat) {
      showToast("Informe a nova categoria.", "error");
      return;
    }

    setIsUpdatingCategory(true);
    try {
      const itemsToUpdate = items.filter(i => i.name === categoryModalMaterial);
      if (itemsToUpdate.length === 0) {
        showToast("Nenhum item encontrado com esse nome.", "error");
        setIsUpdatingCategory(false);
        return;
      }

      for (let i = 0; i < itemsToUpdate.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = itemsToUpdate.slice(i, i + 400);
        chunk.forEach(item => {
          batch.update(doc(db, 'items', item.id), { category: newCat });
        });
        await batch.commit();
      }

      if (!categories.includes(newCat)) {
        setCategories(prev => [...prev, newCat]);
      }

      showToast(`Categoria do material "${categoryModalMaterial}" alterada para "${newCat}" com sucesso!`, "success");
      setShowChangeCategoryModal(false);
      setCategoryModalMaterial('');
      setCategoryModalNewCategory('');
      setCustomModalCategory('');
    } catch (error: any) {
      console.error("Error changing category:", error);
      handleFirestoreError(error, OperationType.UPDATE, `items`);
      showToast(`Erro ao alterar categoria: ${error.message}`, "error");
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  const handleMergeSuppliers = async () => {
    if (!sourceSupplier || !targetSupplier || sourceSupplier === targetSupplier) {
      showToast("Selecione fornecedores diferentes para mesclar.", "error");
      return;
    }

    setIsMerging(true);
    try {
      // Find all items and transactions with the source supplier
      const itemsToUpdate = items.filter(i => i.supplier === sourceSupplier);
      const transToUpdate = transactions.filter(t => t.supplier === sourceSupplier);
      
      const totalOps = itemsToUpdate.length + transToUpdate.length;
      
      if (totalOps === 0) {
        showToast("Nenhum registro encontrado para o fornecedor de origem.", "info");
        setIsMerging(false);
        return;
      }

      // Process in batches of 400 (Firestore limit is 500)
      const allDocs = [
        ...itemsToUpdate.map(i => ({ ref: doc(db, 'items', i.id), data: { supplier: targetSupplier } })),
        ...transToUpdate.map(t => ({ ref: doc(db, 'transactions', t.id), data: { supplier: targetSupplier } }))
      ];

      for (let i = 0; i < allDocs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = allDocs.slice(i, i + 400);
        chunk.forEach(op => batch.update(op.ref, op.data));
        await batch.commit();
      }

      showToast(`${totalOps} registros atualizados com sucesso!`, "success");
      setShowMergeSuppliers(false);
      setSourceSupplier('');
      setTargetSupplier('');
    } catch (error: any) {
      console.error("Error merging suppliers:", error);
      showToast(`Erro ao mesclar fornecedores: ${error.message}`, "error");
    } finally {
      setIsMerging(false);
    }
  };

  const handleMergeItems = async () => {
    if (!sourceItemName || !targetItemName || sourceItemName === targetItemName) {
      showToast("Selecione itens diferentes para mesclar.", "error");
      return;
    }

    setIsMerging(true);
    try {
      // Find all items and transactions with the source item name
      const itemsToUpdate = items.filter(i => i.name === sourceItemName);
      const transToUpdate = transactions.filter(t => t.item_name === sourceItemName);
      
      const totalOps = itemsToUpdate.length + transToUpdate.length;
      
      if (totalOps === 0) {
        showToast("Nenhum registro encontrado para o item de origem.", "info");
        setIsMerging(false);
        return;
      }

      // Process in batches of 400 (Firestore limit is 500)
      const allDocs = [
        ...itemsToUpdate.map(i => ({ ref: doc(db, 'items', i.id), data: { name: targetItemName } })),
        ...transToUpdate.map(t => ({ ref: doc(db, 'transactions', t.id), data: { item_name: targetItemName } }))
      ];

      for (let i = 0; i < allDocs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = allDocs.slice(i, i + 400);
        chunk.forEach(op => batch.update(op.ref, op.data));
        await batch.commit();
      }

      showToast(`${totalOps} registros atualizados com sucesso!`, "success");
      setShowMergeItems(false);
      setSourceItemName('');
      setTargetItemName('');
    } catch (error: any) {
      console.error("Error merging items:", error);
      showToast(`Erro ao mesclar itens: ${error.message}`, "error");
    } finally {
      setIsMerging(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        setUser(user);
        if (user) {
          const userEmail = user.email?.toLowerCase().trim();
          if (!userEmail) {
            await signOut(auth);
            showToast("Erro: E-mail n√£o encontrado no login do Google.", "error");
            setLoading(false);
            return;
          }

          // Always use email as the document ID for consistency
          const userRef = doc(db, 'users', userEmail);
          let userSnap: any = null;
          try {
            userSnap = await getDoc(userRef);
          } catch (e: any) {
            console.warn("Could not fetch user profile from Firestore:", e?.message || e);
          }

          if (userSnap && !userSnap.exists() && (userEmail === 'gerlianemagalhaes79@gmail.com' || userEmail === 'poli.almoxarifado@gmail.com')) {
            try {
              await setDoc(userRef, {
                email: userEmail,
                name: user.displayName || (userEmail === 'gerlianemagalhaes79@gmail.com' ? 'Admin' : 'Poli Almoxarifado'),
                role: 'ADMIN',
                sector: 'Almoxarifado',
                uid: user.uid,
                lastLogin: new Date().toISOString()
              });
            } catch (e) {
              console.warn("Could not set master admin profile doc:", e);
            }
          } else if (userSnap && userSnap.exists()) {
            // Update existing profile with UID and last login
            try {
              await updateDoc(userRef, { 
                uid: user.uid,
                lastLogin: new Date().toISOString() 
              });
            } catch (e) {
              console.warn("Could not update last login timestamp:", e);
            }
          } else if (!userSnap && (userEmail === 'gerlianemagalhaes79@gmail.com' || userEmail === 'poli.almoxarifado@gmail.com')) {
            // Fallback for master admins when quota limit is exceeded
            setUserProfile({
              id: userEmail,
              name: user.displayName || (userEmail === 'gerlianemagalhaes79@gmail.com' ? 'Admin' : 'Poli Almoxarifado'),
              role: 'ADMIN',
              sector: 'Almoxarifado',
              email: userEmail
            });
            setActiveTab('dashboard');
          } else if (userSnap && !userSnap.exists()) {
            // Not pre-registered and not master admin
            await signOut(auth);
            showToast("Acesso negado: Seu e-mail n√£o est√° cadastrado no sistema. Entre em contato com o administrador.", "error");
            setLoading(false);
            return;
          }

          onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
              const profile = { id: doc.id, ...doc.data() } as UserProfile;
              setUserProfile(profile);
              
              if (profile.allowedSectors && profile.allowedSectors.length > 0) {
                setSelectedSector(prev => (prev && profile.allowedSectors?.includes(prev) ? prev : profile.allowedSectors![0]));
              } else if (profile.sector) {
                setSelectedSector(profile.sector);
              }

              if (profile.role === 'ADMIN' || userEmail === 'gerlianemagalhaes79@gmail.com' || profile.sector === 'Almoxarifado') {
                setActiveTab('dashboard');
              } else {
                setActiveTab('my-requests');
              }
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${userEmail}`);
          });
        } else {
          setUserProfile(null);
        }
      } catch (error: any) {
        const errStr = String(error?.message || error);
        if (errStr.toLowerCase().includes('quota limit exceeded') || errStr.toLowerCase().includes('resource_exhausted')) {
          console.warn("Auth state change notice (quota limit):", errStr);
        } else {
          console.error("Auth state change error:", error);
          showToast(`Erro na autentica√ß√£o: ${error.message}`, "error");
        }
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setTransactions([]);
      return;
    }

    const qItems = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item));
      setItems(itemsData);
      
      // Update categories list from existing items
      const existingCategories = Array.from(new Set(itemsData.map(i => i.category).filter(Boolean))) as string[];
      setCategories(prev => Array.from(new Set([...prev, ...existingCategories])));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'items');
    });

    const qTrans = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubscribeTrans = onSnapshot(qTrans, (snapshot) => {
      const fifteenDaysAgo = subDays(new Date(), 15);
      const transData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Transaction))
        .filter(t => !t.deletedAt || new Date(t.deletedAt) > fifteenDaysAgo);
      setTransactions(transData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    const qRequests = query(collection(db, 'requests'), orderBy('date', 'desc'));
    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaterialRequest));
      setRequests(requestsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
    });

    const qReqItems = query(collection(db, 'request_items'));
    const unsubscribeReqItems = onSnapshot(qReqItems, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestItem));
      setAllRequestItems(itemsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'request_items');
    });

    const qBalances = query(collection(db, 'balances'), orderBy('date', 'desc'));
    const unsubscribeBalances = onSnapshot(qBalances, (snapshot) => {
      const balancesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BalanceRecord));
      setBalances(balancesData);
    }, (error) => {
      console.warn("Balances listener error:", error);
    });

    return () => {
      unsubscribeItems();
      unsubscribeTrans();
      unsubscribeRequests();
      unsubscribeReqItems();
      unsubscribeBalances();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const notificationIds = [user.uid];
    if (isAdmin) {
      notificationIds.push('ADMIN_GROUP');
    }

    const qNotifications = query(
      collection(db, 'notifications'), 
      where('userId', 'in', notificationIds), 
      orderBy('date', 'desc')
    );
    
    const unsubscribeNotifications = onSnapshot(qNotifications, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
    }, (error) => {
      // If error is permission denied, it might be because we added ADMIN_GROUP wrongly or rules haven't propagated
      console.warn("Notification listener error:", error);
      // Fallback to single user listener if needed
      const fallbackQ = query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('date', 'desc'));
      const unsubFallback = onSnapshot(fallbackQ, (snapshot) => {
        setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
      });
      return () => unsubFallback();
    });

    return () => {
      unsubscribeNotifications();
    };
  }, [user, isAdmin]);

  // Retroactive check to sync materials that are currently with zero stock as notifications for administrators
  useEffect(() => {
    if (!isAdmin || items.length === 0) return;

    const runRetroactiveStockCheck = async () => {
      try {
        const activeItems = items.filter(i => !i.deletedAt);
        const groupedByName: { [key: string]: { name: string, totalQty: number } } = {};
        
        activeItems.forEach(item => {
          const normName = normalizeString(item.name);
          if (!groupedByName[normName]) {
            groupedByName[normName] = { name: item.name, totalQty: 0 };
          }
          groupedByName[normName].totalQty += (Number(item.quantity) || 0);
        });

        // Fetch currently dismissed alerts once to perform in-memory checks
        const dismissedSnap = await getDocs(collection(db, 'dismissed_stock_alerts'));
        const dismissedMap = new Set(dismissedSnap.docs.map(d => d.id));

        // 1. Clean up dismissal records for items that now have stock > 0
        const activeGrouped = Object.values(groupedByName);
        const withStock = activeGrouped.filter(g => g.totalQty > 0);
        for (const itemWithStock of withStock) {
          const safeId = getSafeDocId(itemWithStock.name);
          if (dismissedMap.has(safeId)) {
            try {
              await deleteDoc(doc(db, 'dismissed_stock_alerts', safeId));
              dismissedMap.delete(safeId);
            } catch (e) {
              // Ignore if doc doesn't exist or deletion fails
            }
          }
        }

        // 2. Identify and notify about zero stock items that haven't been dismissed or notified yet
        const zeroStockItems = activeGrouped.filter(g => g.totalQty === 0);
        const unreadStockZeroNotifications = notifications.filter(n => !n.read && n.type === 'STOCK_ZERO');

        for (const zeroItem of zeroStockItems) {
          const normZeroName = normalizeString(zeroItem.name);
          const safeId = getSafeDocId(zeroItem.name);
          const alreadyNotified = unreadStockZeroNotifications.some(n => normalizeString(n.itemName) === normZeroName);

          if (!alreadyNotified) {
            // Check if administrators have already confirmed science for this zero stock event
            if (dismissedMap.has(safeId)) {
              continue;
            }

            const existingNotifQuery = query(
              collection(db, 'notifications'),
              where('userId', '==', 'ADMIN_GROUP'),
              where('read', '==', false)
            );
            const existingSnap = await getDocs(existingNotifQuery);
            const alreadyInFirestore = existingSnap.docs.some(d => {
              const data = d.data();
              return data.type === 'STOCK_ZERO' && normalizeString(data.itemName) === normZeroName;
            });

            if (!alreadyInFirestore) {
              await createNotification(
                'ADMIN_GROUP',
                'Estoque Zerado',
                `O material "${zeroItem.name.toUpperCase()}" atingiu estoque zero.`,
                undefined,
                'STOCK_ZERO',
                zeroItem.name.toUpperCase()
              );
            }
          }
        }
      } catch (err) {
        console.warn("Notice in retroactive zero stock synchronization:", err);
      }
    };

    const timer = setTimeout(() => {
      runRetroactiveStockCheck();
    }, 2500);

    return () => clearTimeout(timer);
  }, [items, notifications, isAdmin]);

  useEffect(() => {
    if (!user || !userProfile) return;
    
    let unsubscribeUsers = () => {};
    if (user.email === 'gerlianemagalhaes79@gmail.com' || userProfile.role === 'ADMIN' || selectedSector === 'Almoxarifado') {
      // Ensure master admins are in the database so they appear in the list
      const masterAdmins = [
        { email: 'gerlianemagalhaes79@gmail.com', name: 'Admin' },
        { email: 'poli.almoxarifado@gmail.com', name: 'Poli Almoxarifado' }
      ];

      masterAdmins.forEach(async (admin) => {
        const adminRef = doc(db, 'users', admin.email);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            email: admin.email,
            name: admin.name,
            role: 'ADMIN',
            sector: 'Almoxarifado',
            lastLogin: null
          });
        }
      });

      const qUsers = query(collection(db, 'users'), orderBy('name', 'asc'));
      unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
        setUsersList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });
    }
    return () => unsubscribeUsers();
  }, [user, userProfile]);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setLoginLoading(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
        try {
          showToast("Redirecionando para login do Google...", "info");
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: any) {
          console.error("Redirect login error:", redirectErr);
          showToast("O popup foi bloqueado pelo seu navegador. Por favor, permita janelas pop-up ou abra o sistema em uma nova aba.", "error");
        }
      } else if (error.code === 'auth/unauthorized-domain') {
        showToast("Erro: Dom√≠nio n√£o autorizado no Firebase Auth.", "error");
      } else {
        showToast(`Erro ao entrar: ${error.message}`, "error");
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      alert("Preencha todos os campos.");
      return;
    }
    setLoginLoading(true);
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (error: any) {
      console.error("Login error:", error);
      alert(`Erro ao entrar: ${error.message}`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authName || authSectors.length === 0) {
      showToast("Preencha todos os campos e selecione ao menos um setor.", "error");
      return;
    }
    setLoginLoading(true);
    try {
      // Just create/update the document in Firestore using email as ID
      // This allows the user to log in via Google later
      const userDocId = authEmail.toLowerCase().trim();
      const role = userDocId === 'gerlianemagalhaes79@gmail.com' ? 'ADMIN' : 'SETOR';
      
      await setDoc(doc(db, 'users', userDocId), {
        email: userDocId,
        name: authName,
        role: role,
        sector: authSectors[0], // Main sector or legacy
        allowedSectors: authSectors,
        registeredAt: new Date().toISOString()
      }, { merge: true });
      
      showToast("Usu√°rio pr√©-cadastrado com sucesso! Agora ele pode entrar usando o Google.", "success");
      setAuthEmail('');
      setAuthName('');
      setAuthSectors([]);
      setIsRegistering(false);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
      showToast(`Erro ao cadastrar: ${error.message}`, "error");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleDeleteTransaction = async (id: string, reason: string) => {
    if (!id) return;
    try {
      await runTransaction(db, async (transaction) => {
        const transRef = doc(db, 'transactions', id);
        const transSnap = await transaction.get(transRef);
        
        if (!transSnap.exists()) {
          throw new Error("Movimenta√ß√£o n√£o encontrada.");
        }
        
        const transData = transSnap.data() as Transaction;

        if (transData.deletedAt) {
          throw new Error("Esta movimenta√ß√£o j√° foi exclu√≠da.");
        }

        if (transData.item_id) {
          const itemRef = doc(db, 'items', transData.item_id);
          const itemSnap = await transaction.get(itemRef);
          
          if (itemSnap.exists()) {
            const itemData = itemSnap.data() as Item;
            const qty = Number(transData.quantity) || 0;
            let currentQty = Number(itemData.quantity) || 0;
            
            let newQty;
            if (transData.type === 'entry') {
              newQty = currentQty - qty;
            } else {
              newQty = currentQty + qty;
            }
            
            transaction.update(itemRef, { 
              quantity: Math.max(0, newQty),
              updatedAt: serverTimestamp()
            });
          }
        }

        transaction.update(transRef, {
          deletedAt: new Date().toISOString(),
          deletionReason: reason || 'Sem justificativa',
          deletedByEmail: user?.email
        });
      });

      setShowDeleteModal({ show: false });
      const itemName = transactions.find(t => t.id === id)?.item_name;
      setDeletionReason('');
      if (itemName) await checkStockAndNotify(itemName);
    } catch (error: any) {
      console.error("Error deleting transaction:", error);
      alert(`Erro ao excluir movimenta√ß√£o: ${error.message}`);
    }
  };

  const handleRecoverTransaction = async (id: string) => {
    if (!id) return;
    try {
      await runTransaction(db, async (transaction) => {
        const transRef = doc(db, 'transactions', id);
        const transSnap = await transaction.get(transRef);
        
        if (!transSnap.exists()) {
          throw new Error("Movimenta√ß√£o n√£o encontrada.");
        }
        
        const transData = transSnap.data() as Transaction;

        if (!transData.deletedAt) {
          throw new Error("Esta movimenta√ß√£o n√£o est√° exclu√≠da.");
        }

        if (transData.item_id) {
          const itemRef = doc(db, 'items', transData.item_id);
          const itemSnap = await transaction.get(itemRef);
          
          if (itemSnap.exists()) {
            const itemData = itemSnap.data() as Item;
            const qty = Number(transData.quantity) || 0;
            let currentQty = Number(itemData.quantity) || 0;
            
            let newQty;
            if (transData.type === 'entry') {
              newQty = currentQty + qty;
            } else {
              newQty = currentQty - qty;
            }
            
            transaction.update(itemRef, { 
              quantity: Math.max(0, newQty),
              updatedAt: serverTimestamp()
            });
          }
        }

        transaction.update(transRef, {
          deletedAt: null,
          deletionReason: null,
          deletedByEmail: null
        });
      });
    } catch (error: any) {
      console.error("Error recovering transaction:", error);
      alert(`Erro ao recuperar movimenta√ß√£o: ${error.message}`);
    }
  };

  const handleRecoverAllTransactions = async () => {
    const deletedTrans = transactions.filter(t => !!t.deletedAt);
    if (deletedTrans.length === 0) return;
    
    if (!confirm(`Deseja restaurar todas as ${deletedTrans.length} movimenta√ß√µes exclu√≠das?`)) return;

    try {
      // We'll process them one by one to ensure stock is updated correctly via transactions
      for (const t of deletedTrans) {
        await handleRecoverTransaction(t.id);
      }
      alert("Todas as movimenta√ß√µes foram restauradas com sucesso!");
    } catch (error: any) {
      console.error("Error recovering all transactions:", error);
      alert(`Erro ao restaurar movimenta√ß√µes: ${error.message}`);
    }
  };

  const handleSubmitRequest = async () => {
    if (requestBasket.length === 0) {
      showToast("Adicione pelo menos um item √† solicita√ß√£o.", "error");
      return;
    }

    setIsSubmittingRequest(true);
    const loadingToast = showToast("Processando sua solicita√ß√£o...", "info");
    
    try {
      // 1. Fetch fresh inventory to validate stock correctly
      const itemsSnapshot = await getDocs(collection(db, 'items'));
      const freshItems = itemsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Item))
        .filter(i => !i.deletedAt);
      
      // Calculate total stock with normalized names
      const totalInventory: Record<string, number> = {};
      freshItems.forEach(item => {
        if (!item.name) return;
        const key = normalizeString(item.name);
        totalInventory[key] = (totalInventory[key] || 0) + (Number(item.quantity) || 0);
      });

      // Aggregate current request basket quantities by product
      const basketAggregation: Record<string, number> = {};
      requestBasket.forEach(item => {
        const key = normalizeString(item.product_name);
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        basketAggregation[key] = (basketAggregation[key] || 0) + qty;
      });

      // Validate stock
      for (const [productNameKey, requestedQty] of Object.entries(basketAggregation)) {
        const totalAvailable = totalInventory[productNameKey] || 0;
        
        if (requestedQty > totalAvailable) {
          const originalName = requestBasket.find(i => normalizeString(i.product_name) === productNameKey)?.product_name || "Produto";
          console.warn(`Stock check failed for ${productNameKey}: requested ${requestedQty}, available ${totalAvailable}`);
          showToast(
            `Estoque insuficiente para "${originalName}". Dispon√≠vel: ${totalAvailable}.`, 
            "error"
          );
          setIsSubmittingRequest(false);
          return;
        }
      }

      // 2. Prepare Request Data
      const requestId = editingRequest ? editingRequest.id : doc(collection(db, 'requests')).id;
      const batch = writeBatch(db);

      const requestData: any = {
        sector: selectedSector,
        date: editingRequest ? editingRequest.date : new Date().toISOString(),
        status: 'PENDENTE',
        observation: requestObservation || '',
        requesterEmail: user?.email || '',
        updatedAt: serverTimestamp(),
        isNewFlow: editingRequest ? (editingRequest.isNewFlow || false) : true
      };

      if (editingRequest) {
        batch.update(doc(db, 'requests', requestId), requestData);
        // Better to fetch directly here to be absolutely sure we have current items
        const oldItemsSnap = await getDocs(query(collection(db, 'request_items'), where('request_id', '==', requestId)));
        oldItemsSnap.docs.forEach(d => batch.delete(d.ref));
      } else {
        requestData.createdAt = serverTimestamp();
        requestData.requesterName = user?.displayName || user?.email || 'Usu√°rio';
        batch.set(doc(db, 'requests', requestId), requestData);
      }

      // 3. Add current basket items
      requestBasket.forEach(item => {
        const itemRef = doc(collection(db, 'request_items'));
        batch.set(itemRef, {
          request_id: requestId,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity_requested: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          quantity_approved: Math.max(1, Math.floor(Number(item.quantity) || 1))
        });
      });

      // 4. Commit everything
      await batch.commit();

      if (!editingRequest) {
        // Notifications only for NEW requests
        try {
          const adminQuery = query(collection(db, 'users'), where('role', '==', 'ADMIN'));
          const almoxQuery = query(collection(db, 'users'), where('sector', '==', 'Almoxarifado'));
          
          const [adminSnap, almoxSnap] = await Promise.all([getDocs(adminQuery), getDocs(almoxQuery)]);
          const notified = new Set<string>();
          
          const notify = (snap: any) => {
            snap.forEach((d: any) => {
              if (!notified.has(d.id)) {
                createNotification(d.id, 'Nova Solicita√ß√£o', `Setor ${selectedSector} enviou uma nova solicita√ß√£o.`, requestId);
                notified.add(d.id);
              }
            });
          };
          notify(adminSnap);
          notify(almoxSnap);
        } catch (notifErr) {
          console.warn("Falha ao enviar notifica√ß√µes:", notifErr);
        }
      }

      showToast(editingRequest ? "Altera√ß√µes salvas com sucesso!" : "Solicita√ß√£o enviada com sucesso!", "success");
      setRequestBasket([]);
      setRequestObservation('');
      setEditingRequest(null);
      setActiveTab('my-requests');
    } catch (error: any) {
      console.error("Erro cr√≠tico ao salvar:", error);
      showToast(`N√£o foi poss√≠vel salvar: ${error.message}. Verifique sua conex√£o e tente novamente.`, "error");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleEditRequest = (request: MaterialRequest) => {
    setSelectedSector(request.sector);
    const items = allRequestItems.filter(ri => ri.request_id === request.id);
    setRequestBasket(items.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity_requested
    })));
    setRequestObservation(request.observation || '');
    setEditingRequest(request);
    setActiveTab('new-request');
  };

  useEffect(() => {
    if (isAdmin) {
      cleanupOldDeletedData();
    }
  }, [isAdmin]);

  const cleanupOldDeletedData = async () => {
    const threeDaysAgo = subDays(new Date(), 3);
    
    try {
      // Cleanup items already loaded in state that are deleted > 3 days ago
      const deletedItems = items.filter(i => i.deletedAt && new Date(i.deletedAt) < threeDaysAgo);
      for (const item of deletedItems) {
        if (item.id) await deleteDoc(doc(db, 'items', item.id));
      }
      
      // Cleanup requests already loaded in state that are deleted > 3 days ago
      const deletedRequests = requests.filter(r => r.deletedAt && new Date(r.deletedAt) < threeDaysAgo);
      for (const req of deletedRequests) {
        if (req.id) await deleteDoc(doc(db, 'requests', req.id));
      }

      // Cleanup transactions already loaded in state that are deleted > 3 days ago
      const deletedTrans = transactions.filter(t => t.deletedAt && new Date(t.deletedAt) < threeDaysAgo);
      for (const t of deletedTrans) {
        if (t.id) await deleteDoc(doc(db, 'transactions', t.id));
      }
    } catch (error) {
      console.warn("Notice during cleanup:", error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm("Tem certeza que deseja enviar este item para a lixeira? Ele ser√° exclu√≠do definitivamente ap√≥s 3 dias.")) return;
    try {
      await updateDoc(doc(db, 'items', itemId), {
        deletedAt: new Date().toISOString(),
        deletedBy: user?.email
      });
      showToast("Item enviado para a lixeira.", "success");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${itemId}`);
      showToast(`Erro ao excluir item: ${error.message}`, "error");
    }
  };

  const handlePrintRequests = async () => {
    const filteredRequests = requests.filter(req => {
      if (req.deletedAt || (req.status !== 'PENDENTE' && req.status !== 'EM_SEPARACAO')) return false;
      const reqDate = req.date.split('T')[0];
      return reqDate >= printRange.start && reqDate <= printRange.end;
    });

    if (filteredRequests.length === 0) {
      showToast("Nenhuma solicita√ß√£o pendente ou em separa√ß√£o encontrada para este per√≠odo.", "info");
      return;
    }

    try {
      const batch = writeBatch(db);
      let updatedAny = false;
      filteredRequests.forEach(req => {
        if (req.status === 'PENDENTE') {
          batch.update(doc(db, 'requests', req.id), {
            status: 'EM_SEPARACAO',
            updatedAt: serverTimestamp()
          });
          updatedAny = true;
        }
      });
      if (updatedAny) {
        await batch.commit();
        showToast("Status das solicita√ß√µes atualizado para 'Em Separa√ß√£o'!", "success");
      }
    } catch (error) {
      console.error("Erro ao atualizar status para EM_SEPARACAO:", error);
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast("Por favor, permita popups para imprimir.", "error");
      return;
    }

    const startDateStr = new Date(printRange.start + 'T12:00:00').toLocaleDateString('pt-BR');
    const endDateStr = new Date(printRange.end + 'T12:00:00').toLocaleDateString('pt-BR');
    const periodStr = printRange.start === printRange.end ? startDateStr : `${startDateStr} a ${endDateStr}`;

    const content = `
      <html>
        <head>
          <title>Impress√£o de Solicita√ß√µes - ${periodStr}</title>
          <style>
            body { font-family: sans-serif; padding: 5px; color: #1C1917; font-size: 9px; line-height: 1.2; }
            .request-card { 
              border: 1px dashed #78716C; 
              border-radius: 6px; 
              padding: 8px; 
              margin-bottom: 12px; 
              page-break-inside: avoid;
            }
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
            .header-table td { padding: 3px 5px; border: 1px solid #E7E5E4; font-size: 8.5px; }
            h1 { text-align: left; margin: 0 0 5px 0; font-size: 11px; text-transform: uppercase; border-bottom: 1.5px solid #1C1917; padding-bottom: 2px; }
            .items-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
            .items-table th, .items-table td { border: 1px solid #1C1917; padding: 4px; text-align: left; font-size: 8.5px; vertical-align: middle; }
            .items-table th { background-color: #FAFAF9; }
            .blank-col { width: 70px; text-align: center; }
            .footer { margin-top: 8px; text-align: center; font-size: 7px; color: #78716C; border-top: 1px dashed #E7E5E4; padding-top: 3px; }
            .badge-multiple { display: inline-block; background-color: #F59E0B; color: #FFFFFF; font-size: 7px; font-weight: 800; padding: 1px 4px; border-radius: 3px; margin-top: 2px; letter-spacing: 0.5px; }
            .lot-warning-box { background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 3px; padding: 2px 4px; margin-bottom: 2px; font-weight: bold; color: #92400E; font-size: 7.5px; }
            .lot-item-line { font-size: 7.5px; color: #1C1917; line-height: 1.25; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          ${filteredRequests.map((req, idx) => {
            const reqItemsList = allRequestItems.filter(ri => ri.request_id === req.id);
            return `
              <div class="request-card">
                <h1>Solicita√ß√£o de Material</h1>
                <table class="header-table">
                  <tr>
                    <td><strong>N√∫mero:</strong> #${req.id.slice(-5).toUpperCase()}</td>
                    <td><strong>Data de Cria√ß√£o:</strong> ${new Date(req.date).toLocaleDateString('pt-BR')}</td>
                  </tr>
                  <tr>
                    <td><strong>Setor Solicitante:</strong> ${req.sector}</td>
                    <td><strong>Status:</strong> EM SEPARA√á√ÉO</td>
                  </tr>
                  <tr>
                    <td colspan="2"><strong>Solicitante:</strong> ${req.requesterEmail}</td>
                  </tr>
                  ${req.observation ? `<tr><td colspan="2"><strong>Observa√ß√µes:</strong> ${req.observation}</td></tr>` : ''}
                </table>

                <h3 style="margin: 6px 0 3px 0; font-size: 9px; border-bottom: 1.5px solid #1C1917; padding-bottom: 2px; text-transform: uppercase;">ITENS DA SOLICITA√á√ÉO (Para separa√ß√£o f√≠sica)</h3>
                <table class="items-table">
                  <thead>
                    <tr>
                      <th style="width: 32%;">Produto / Descri√ß√£o</th>
                      <th style="width: 10%; text-align: center;">Qtd Solicitada</th>
                      <th class="blank-col" style="width: 14%; text-align: center;">Qtd Separada</th>
                      <th style="width: 44%;">Lotes Dispon√≠veis em Estoque / Separa√ß√£o</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${reqItemsList.map(item => {
                      const normalizedReqName = normalizeString(item.product_name);
                      const productBatches = items.filter(i => !i.deletedAt && normalizeString(i.name) === normalizedReqName && (i.quantity || 0) > 0);
                      productBatches.sort((a, b) => {
                        if (a.expiry_date === 'Indeterminada' || !a.expiry_date) return 1;
                        if (b.expiry_date === 'Indeterminada' || !b.expiry_date) return -1;
                        return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
                      });
                      const hasMultipleBatches = productBatches.length > 1;
                      const hasSingleBatch = productBatches.length === 1;

                      let batchDisplay = '';
                      if (hasMultipleBatches) {
                        batchDisplay = `
                          <div class="lot-warning-box">‚ö†Ô∏è ATEN√á√ÉO: POSSUI ${productBatches.length} LOTES EM ESTOQUE</div>
                          <div class="lot-item-line">
                            ${productBatches.map((b, bIdx) => {
                              const expDate = b.expiry_date && b.expiry_date !== 'Indeterminada' ? new Date(b.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indet.';
                              const isFirst = bIdx === 0 ? ' <span style="color: #059669; font-weight: bold;">[Priorit√°rio/FEFO]</span>' : '';
                              return `<div>‚Ä¢ <strong>Lote ${b.batch_number || 'S/N'}:</strong> ${b.quantity} un (Val: ${expDate})${isFirst}</div>`;
                            }).join('')}
                          </div>
                        `;
                      } else if (hasSingleBatch) {
                        const b = productBatches[0];
                        const expDate = b.expiry_date && b.expiry_date !== 'Indeterminada' ? new Date(b.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indet.';
                        batchDisplay = `
                          <div style="font-size: 8px; color: #1C1917;">
                            <strong>Lote:</strong> ${b.batch_number || 'S/N'} ‚Ä¢ <strong>Saldo:</strong> ${b.quantity} un (Val: ${expDate})
                          </div>
                        `;
                      } else {
                        batchDisplay = `
                          <div style="font-size: 7.5px; color: #DC2626; font-weight: bold;">
                            ‚ö†Ô∏è Sem saldo ativo em estoque
                          </div>
                        `;
                      }

                      return `
                        <tr>
                          <td style="font-weight: bold; font-size: 8.5px;">
                            <div>${item.product_name}</div>
                            ${hasMultipleBatches ? `<div class="badge-multiple">‚ö†Ô∏è M√öLTIPLOS LOTES (${productBatches.length})</div>` : ''}
                          </td>
                          <td style="text-align: center; font-size: 8.5px; font-weight: bold;">${item.quantity_requested}</td>
                          <td class="blank-col" style="border-bottom: 1px solid #1C1917;"></td>
                          <td style="vertical-align: top; padding: 3px 5px;">${batchDisplay}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>

                <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
              </div>
            `;
          }).join('')}
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handleDeleteRequest = async (requestId: string) => {
    const reqToDel = requests.find(r => r.id === requestId);
    if (reqToDel?.status === 'ENTREGUE') {
      showToast("N√£o √© poss√≠vel excluir uma solicita√ß√£o que j√° foi entregue.", "error");
      return;
    }
    
    if (!window.confirm("Tem certeza que deseja enviar esta solicita√ß√£o para a lixeira? Ela ser√° exclu√≠da definitivamente ap√≥s 3 dias.")) return;
    try {
      await updateDoc(doc(db, 'requests', requestId), {
        deletedAt: new Date().toISOString(),
        deletedBy: user?.email
      });
      showToast("Solicita√ß√£o enviada para a lixeira.", "success");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
      showToast(`Erro ao excluir solicita√ß√£o: ${error.message}`, "error");
    }
  };

  const handleAddExtraItemToRequest = async (requestId: string, productName: string, productId: string) => {
    setIsAdminAddingItem(true);
    try {
      const newItem: Omit<RequestItem, 'id'> = {
        request_id: requestId,
        product_id: productId,
        product_name: productName,
        quantity_requested: 1,
        quantity_approved: 1
      };
      
      await addDoc(collection(db, 'request_items'), newItem);
      setAdminAddItemSearch('');
      showToast(`"${productName}" adicionado √† solicita√ß√£o.`, "success");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, 'request_items');
      showToast("Erro ao adicionar item.", "error");
    } finally {
      setIsAdminAddingItem(false);
    }
  };

  const handleUpdateObservation = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'requests', requestId), { 
        adminObservation: adminObservation 
      });
      showToast("Observa√ß√£o atualizada com sucesso!", "success");
    } catch (error: any) {
      console.error("Error updating observation:", error);
      showToast(`Erro ao atualizar observa√ß√£o: ${error.message}`, "error");
    }
  };

  const handlePrintSingleRequest = async (request: MaterialRequest) => {
    // 1. If the request is in PENDENTE state, transition it to EM_SEPARACAO
    if (request.isNewFlow && request.status === 'PENDENTE') {
      try {
        await updateDoc(doc(db, 'requests', request.id), {
          status: 'EM_SEPARACAO',
          updatedAt: serverTimestamp()
        });
        showToast("Status alterado para 'Em Separa√ß√£o'!", "success");
        // Update local modal state immediately
        if (showRequestDetailModal.show && showRequestDetailModal.request?.id === request.id) {
          setShowRequestDetailModal({
            ...showRequestDetailModal,
            request: { ...showRequestDetailModal.request, status: 'EM_SEPARACAO' }
          });
        }
      } catch (error) {
        console.error("Erro ao atualizar status para EM_SEPARACAO:", error);
      }
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast("Por favor, permita popups para imprimir.", "error");
      return;
    }

    const items = allRequestItems.filter(ri => ri.request_id === request.id);
    const dateStr = new Date(request.date).toLocaleDateString('pt-BR');

    const content = `
      <html>
        <head>
          <title>Solicita√ß√£o de Material - #${request.id.slice(-5).toUpperCase()}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #1C1917; }
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .header-table td { padding: 8px; border: 1px solid #E7E5E4; }
            h1 { text-align: center; margin-bottom: 20px; font-size: 22px; text-transform: uppercase; border-bottom: 3px double #1C1917; padding-bottom: 10px; }
            .items-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .items-table th, .items-table td { border: 1px solid #1C1917; padding: 10px; text-align: left; font-size: 13px; }
            .items-table th { background-color: #FAFAF9; }
            .blank-col { width: 120px; text-align: center; }
            .signature-section { margin-top: 60px; display: flex; justify-content: space-between; }
            .signature-box { width: 45%; text-align: center; border-top: 1px solid #1C1917; padding-top: 5px; font-size: 12px; }
            .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #78716C; border-top: 1px solid #E7E5E4; padding-top: 10px; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Solicita√ß√£o de Material</h1>
          <table class="header-table">
            <tr>
              <td><strong>N√∫mero:</strong> #${request.id.slice(-5).toUpperCase()}</td>
              <td><strong>Data:</strong> ${dateStr}</td>
            </tr>
            <tr>
              <td><strong>Setor Solicitante:</strong> ${request.sector}</td>
              <td><strong>Status:</strong> ${request.status === 'PENDENTE' ? 'PENDENTE' : 'EM SEPARA√á√ÉO'}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Solicitante:</strong> ${request.requesterEmail}</td>
            </tr>
            ${request.observation ? `<tr><td colspan="2"><strong>Observa√ß√µes do Solicitante:</strong> ${request.observation}</td></tr>` : ''}
          </table>

          <h3 style="margin-top: 30px; font-size: 16px; border-bottom: 1px solid #1C1917; padding-bottom: 5px;">ITENS DA SOLICITA√á√ÉO (Para separa√ß√£o f√≠sica)</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Produto / Descri√ß√£o</th>
                <th style="width: 100px; text-align: center;">Qtd Solicitada</th>
                <th class="blank-col">Qtd Separada (Anotar)</th>
                <th>Obs. / Lote do Material</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td style="font-weight: bold;">${item.product_name}</td>
                  <td style="text-align: center; font-size: 14px; font-weight: bold;">${item.quantity_requested}</td>
                  <td class="blank-col" style="border-bottom: 1px solid #1C1917;"></td>
                  <td style="border-bottom: 1px solid #1C1917;"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="signature-section">
            <div class="signature-box" style="margin-top: 40px;">
              <br/><br/>
              ________________________________________<br/>
              Setor Solicitante (Assinatura de Recebimento)
            </div>
            <div class="signature-box" style="margin-top: 40px;">
              <br/><br/>
              ________________________________________<br/>
              Respons√°vel pela Separa√ß√£o (Almoxarifado)
            </div>
          </div>

          <div class="footer">Gerado via Sistema de Almoxarifado em ${new Date().toLocaleString('pt-BR')}</div>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handleApproveAndDeliverNewRequest = async (requestId: string, currentRequestItems: RequestItem[]) => {
    try {
      showToast("Processando aprova√ß√£o e baixa no estoque...", "info");
      
      const requestRef = doc(db, 'requests', requestId);
      const requestSnap = await getDoc(requestRef);
      if (!requestSnap.exists()) throw new Error("Solicita√ß√£o n√£o encontrada.");
      const requestData = requestSnap.data() as MaterialRequest;

      if (requestData.status === 'ENTREGUE') {
        showToast("Esta solicita√ß√£o j√° foi entregue.", "info");
        return;
      }

      // Pre-fetch all necessary stock data with normalized name matching
      const itemsSnapshot = await getDocs(collection(db, 'items'));
      const allActiveItems = itemsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Item))
        .filter(i => !i.deletedAt);

      const itemsStockData: any[] = [];
      for (const reqItem of currentRequestItems) {
        if (reqItem.quantity_approved <= 0) continue;

        const normalizedReqName = normalizeString(reqItem.product_name);
        
        // Find all batches that represent this product (same normalized name)
        let batches = allActiveItems.filter(item => 
          normalizeString(item.name) === normalizedReqName && (item.quantity || 0) > 0
        );

        batches.sort((a, b) => {
          if (a.expiry_date === 'Indeterminada' || !a.expiry_date) return 1;
          if (b.expiry_date === 'Indeterminada' || !b.expiry_date) return -1;
          return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        });

        // Se o usu√°rio selecionou um lote espec√≠fico, priorizar esse lote na baixa
        if (reqItem.batch_id && reqItem.batch_id !== 'auto') {
          const chosenIndex = batches.findIndex(b => b.id === reqItem.batch_id);
          if (chosenIndex > -1) {
            const [chosen] = batches.splice(chosenIndex, 1);
            batches = [chosen, ...batches];
          }
        }

        let pharmItems: any[] = [];
        if (requestData.sector === 'Farm√°cia') {
          pharmItems = allActiveItems
            .filter(item => normalizeString(item.name) === normalizedReqName && item.location === 'Farm√°cia')
            .map(item => ({ id: item.id, batch_number: item.batch_number, ref: doc(db, 'items', item.id) }));
        }

        itemsStockData.push({ reqItem, batches, pharmItems });
      }

      await runTransaction(db, async (transaction) => {
        // Collect all batch and pharmacy refs to read them all first
        const batchRefs = itemsStockData.flatMap(d => d.batches.map(b => doc(db, 'items', b.id)));
        const pharmRefs = itemsStockData.flatMap(d => d.pharmItems.map(p => p.ref));
        
        // 1. Perform ALL reads first
        const [tRequestSnap, ...itemSnaps] = await Promise.all([
          transaction.get(requestRef),
          ...batchRefs.map(ref => transaction.get(ref)),
          ...pharmRefs.map(ref => transaction.get(ref))
        ]);

        const tRequestData = tRequestSnap.data() as MaterialRequest | undefined;
        if (!tRequestData || tRequestData.status === 'ENTREGUE') return;

        // Map snapshots for easy access by path
        const snapMap = new Map();
        itemSnaps.forEach(snap => snapMap.set(snap.ref.path, snap));

        // 2. Perform ALL writes
        // First update the main request document
        transaction.update(requestRef, { 
          status: 'ENTREGUE',
          adminObservation: adminObservation,
          deliveredAt: new Date().toISOString(),
          deliveredBy: user?.email,
          updatedAt: serverTimestamp()
        });

        // Also update all the request_items quantity_approved and batch_id in the database
        currentRequestItems.forEach(item => {
          const itemRef = doc(db, 'request_items', item.id);
          transaction.update(itemRef, { 
            quantity_approved: item.quantity_approved,
            batch_id: item.batch_id || ''
          });
        });

        for (const { reqItem, batches, pharmItems } of itemsStockData) {
          let remaining = reqItem.quantity_approved;
          
          for (const batch of batches) {
            if (remaining <= 0) break;

            const tBatchRef = doc(db, 'items', batch.id);
            const tBatchSnap = snapMap.get(tBatchRef.path);
            if (!tBatchSnap || !tBatchSnap.exists()) continue;
            
            const tBatchData = tBatchSnap.data() as Item;
            const currentQty = tBatchData.quantity || 0;
            if (currentQty <= 0) continue;

            const toTake = Math.min(currentQty, remaining);
            
            transaction.update(tBatchRef, {
              quantity: currentQty - toTake,
              updatedAt: serverTimestamp()
            });

            // Log Transaction
            const transRef = doc(collection(db, 'transactions'));
            transaction.set(transRef, {
              item_id: batch.id,
              item_name: reqItem.product_name,
              type: 'exit',
              origin: batch.origin || 'extra',
              quantity: toTake,
              sector: requestData.sector,
              location: batch.location || 'Almoxarifado',
              date: new Date().toISOString(),
              responsible: user?.displayName || user?.email,
              responsibleEmail: user?.email,
              exitReason: 'consumo',
              batch_number: batch.batch_number,
              expiry_date: batch.expiry_date
            });

            if (requestData.sector === 'Farm√°cia' && batch.location !== 'Farm√°cia') {
              const existingPharm = pharmItems.find((p: any) => p.batch_number === batch.batch_number);
              if (existingPharm) {
                const tPharmRef = existingPharm.ref;
                const tPharmSnap = snapMap.get(tPharmRef.path);
                const tPharmData = tPharmSnap?.data() as Item | undefined;
                transaction.update(tPharmRef, {
                  quantity: (tPharmData?.quantity || 0) + toTake,
                  updatedAt: serverTimestamp()
                });
              } else {
                const newItemRef = doc(collection(db, 'items'));
                transaction.set(newItemRef, {
                  name: reqItem.product_name,
                  description: batch.description || '',
                  category: batch.category || 'Outros',
                  supplier: batch.supplier || 'Transfer√™ncia',
                  batch_number: batch.batch_number || '',
                  expiry_date: batch.expiry_date || 'Indeterminada',
                  initial_quantity: toTake,
                  quantity: toTake,
                  min_quantity: batch.min_quantity || 0,
                  unit_price: batch.unit_price || 0,
                  location: 'Farm√°cia',
                  origin: batch.origin || 'extra',
                  date: new Date().toISOString(),
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                });
              }
            }
            remaining -= toTake;
          }

          if (remaining > 0) {
            throw new Error(`Estoque insuficiente para "${reqItem.product_name}".`);
          }
        }
      });

      // Cleanup and UI updates
      showToast("Solicita√ß√£o aprovada, entregue e estoque baixado automaticamente!", "success");
      setShowRequestDetailModal({ show: false });

      // Notifications
      const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', requestData.requesterEmail)));
      if (!uSnap.empty) {
        await createNotification(uSnap.docs[0].id, 'Solicita√ß√£o Entregue', `Sua solicita√ß√£o #${requestId.slice(-5).toUpperCase()} foi aprovada e entregue.`, requestId);
      }

      // Stock Zero Notifications
      for (const { reqItem } of itemsStockData) {
        await checkStockAndNotify(reqItem.product_name);
      }

      // Receipt
      const itemsForReceipt = currentRequestItems.filter(i => i.quantity_approved > 0).map(i => ({
        product_name: i.product_name,
        quantity: i.quantity_approved
      }));
      if (itemsForReceipt.length > 0) {
        handleExportDeliveryReceiptPDF({
          sector: requestData.sector,
          items: itemsForReceipt,
          requestId: requestId,
          date: new Date().toISOString()
        });
      }

    } catch (error: any) {
      console.error("Erro ao aprovar e entregar:", error);
      showToast(`Erro no processo: ${error.message}`, "error");
    }
  };

  const handleRequestDevolution = async () => {
    if (devolutionBasket.length === 0) {
      showToast("Por favor, adicione pelo menos um item √† devolu√ß√£o.", "info");
      return;
    }

    // Validate quantities
    for (const item of devolutionBasket) {
      if (item.quantity <= 0) {
        showToast(`Por favor, insira uma quantidade maior que zero para ${item.product_name}.`, "error");
        return;
      }
      if (item.quantity > item.maxQty) {
        showToast(`Quantidade inv√°lida para ${item.product_name}. M√°ximo permitido: ${item.maxQty}`, "error");
        return;
      }
    }

    try {
      setIsProcessingDevolution(true);
      showToast("Enviando solicita√ß√£o de devolu√ß√£o...", "info");

      const batch = writeBatch(db);
      const newReqRef = doc(collection(db, 'requests'));
      
      const requestData = {
        sector: selectedSector,
        date: new Date().toISOString(),
        status: 'DEVOLUCAO_PENDENTE',
        isReturn: true,
        originalRequestId: showDevolutionModal.request?.id || '',
        returnReason: devolutionReason,
        observation: devolutionObservation || '',
        requesterEmail: user?.email || '',
        requesterName: userProfile?.name || user?.displayName || user?.email || 'Usu√°rio',
        isNewFlow: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      batch.set(newReqRef, requestData);

      devolutionBasket.forEach((item) => {
        const itemRef = doc(collection(db, 'request_items'));
        const productBatches = items.filter(i => !i.deletedAt && i.name.trim().toLowerCase() === item.product_name.trim().toLowerCase());
        const validBatchId = (item.selectedBatchId && productBatches.some(b => b.id === item.selectedBatchId))
          ? item.selectedBatchId
          : (productBatches[0]?.id || '');

        batch.set(itemRef, {
          request_id: newReqRef.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity_requested: item.quantity,
          quantity_approved: item.quantity,
          batch_id: validBatchId
        });
      });

      // Notify administrators
      try {
        const adminSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'ADMIN')));
        adminSnap.forEach(adminDoc => {
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            userId: adminDoc.id,
            title: 'Solicita√ß√£o de Devolu√ß√£o',
            message: `Setor ${selectedSector} solicitou devolu√ß√£o de materiais.`,
            date: new Date().toISOString(),
            read: false,
            requestId: newReqRef.id,
            type: 'REQUEST'
          });
        });
      } catch (e) {
        console.warn("Aviso ao notificar administradores:", e);
      }

      await batch.commit();

      showToast("Solicita√ß√£o de devolu√ß√£o enviada para o almoxarifado!", "success");
      setShowDevolutionModal({ show: false });
      setDevolutionBasket([]);
      setDevolutionObservation('');
      
      if (showRequestDetailModal.show && showDevolutionModal.request && showRequestDetailModal.request?.id === showDevolutionModal.request.id) {
        setShowRequestDetailModal({ show: false });
      }

    } catch (error: any) {
      console.error("Erro ao solicitar devolu√ß√£o:", error);
      showToast(`Erro ao solicitar devolu√ß√£o: ${error.message}`, "error");
    } finally {
      setIsProcessingDevolution(false);
    }
  };

  const handleApproveDevolution = async (requestId: string, devItems: RequestItem[]) => {
    try {
      setIsProcessingDevolution(true);
      showToast("Aprovando devolu√ß√£o e retornando ao estoque...", "info");

      // Fetch active stock items
      const itemsSnapshot = await getDocs(collection(db, 'items'));
      const allActiveItems = itemsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Item))
        .filter(i => !i.deletedAt);

      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, 'requests', requestId);
        const requestSnap = await transaction.get(requestRef);
        if (!requestSnap.exists()) throw new Error("Solicita√ß√£o de devolu√ß√£o n√£o encontrada.");
        const requestData = requestSnap.data() as MaterialRequest;

        if (requestData.status === 'DEVOLUCAO_APROVADA') {
          throw new Error("Esta devolu√ß√£o j√° foi aprovada anteriormente.");
        }

        // Collect all doc IDs that we need to read in the transaction:
        // 1) Sector source items (Farm√°cia / Requesting sector)
        // 2) Almoxarifado target items
        const docIdsToRead = new Set<string>();

        for (const item of devItems) {
          const returnQty = item.quantity_approved || item.quantity_requested || 0;
          if (returnQty <= 0) continue;

          // Find source item in sector stock
          if (item.batch_id && allActiveItems.some(i => i.id === item.batch_id)) {
            docIdsToRead.add(item.batch_id);
          }
          const sectorItem = allActiveItems.find(i => 
            i.name.trim().toLowerCase() === item.product_name.trim().toLowerCase() && 
            i.location === requestData.sector
          );
          if (sectorItem) {
            docIdsToRead.add(sectorItem.id);
          }

          // Find target item in Almoxarifado stock
          const almoxItem = allActiveItems.find(i => 
            i.name.trim().toLowerCase() === item.product_name.trim().toLowerCase() && 
            (!i.location || i.location === 'Almoxarifado')
          );
          if (almoxItem) {
            docIdsToRead.add(almoxItem.id);
          }
        }

        // Read all docs inside transaction
        const snapMap = new Map<string, any>();
        for (const id of docIdsToRead) {
          const itemRef = doc(db, 'items', id);
          const snap = await transaction.get(itemRef);
          snapMap.set(id, snap);
        }

        // Now perform transaction writes
        for (const item of devItems) {
          const returnQty = item.quantity_approved || item.quantity_requested || 0;
          if (returnQty <= 0) continue;

          // 1. DECREASE stock in sector (e.g., Farm√°cia)
          let sourceItemDoc: { id: string, data: Item } | undefined;

          // Check if item.batch_id is a valid sector item
          if (item.batch_id && snapMap.has(item.batch_id)) {
            const snap = snapMap.get(item.batch_id);
            if (snap && snap.exists()) {
              const data = snap.data() as Item;
              if (data.location === requestData.sector) {
                sourceItemDoc = { id: item.batch_id, data };
              }
            }
          }

          // Fallback search for sector item by name & location
          if (!sourceItemDoc) {
            for (const [id, snap] of snapMap.entries()) {
              if (snap && snap.exists()) {
                const data = snap.data() as Item;
                if (data.location === requestData.sector && data.name.trim().toLowerCase() === item.product_name.trim().toLowerCase()) {
                  sourceItemDoc = { id, data };
                  break;
                }
              }
            }
          }

          if (sourceItemDoc) {
            const sourceRef = doc(db, 'items', sourceItemDoc.id);
            const currentQty = Number(sourceItemDoc.data.quantity) || 0;
            const newQty = Math.max(0, currentQty - returnQty);
            transaction.update(sourceRef, {
              quantity: newQty,
              updatedAt: serverTimestamp()
            });
            sourceItemDoc.data.quantity = newQty; // update in-memory
          }

          // 2. INCREASE stock in Almoxarifado
          let almoxItemDoc: { id: string, data: Item } | undefined;
          for (const [id, snap] of snapMap.entries()) {
            if (snap && snap.exists()) {
              const data = snap.data() as Item;
              if ((!data.location || data.location === 'Almoxarifado') && data.name.trim().toLowerCase() === item.product_name.trim().toLowerCase()) {
                almoxItemDoc = { id, data };
                break;
              }
            }
          }

          let almoxRef: DocumentReference;
          let batchNumber = sourceItemDoc?.data.batch_number || 'Devolu√ß√£o';
          let expiryDate = sourceItemDoc?.data.expiry_date || 'Indeterminada';
          let category = sourceItemDoc?.data.category || 'Medicamentos';
          let unitMeasure = sourceItemDoc?.data.unit_measure || 'Unidade (UN)';

          if (almoxItemDoc) {
            almoxRef = doc(db, 'items', almoxItemDoc.id);
            const currentAlmoxQty = Number(almoxItemDoc.data.quantity) || 0;
            const newAlmoxQty = currentAlmoxQty + returnQty;
            transaction.update(almoxRef, {
              quantity: newAlmoxQty,
              updatedAt: serverTimestamp()
            });
            almoxItemDoc.data.quantity = newAlmoxQty; // update in-memory
          } else {
            // Create new stock item in Almoxarifado if none exists
            const newStockRef = doc(collection(db, 'items'));
            almoxRef = newStockRef;
            transaction.set(newStockRef, {
              name: item.product_name,
              quantity: returnQty,
              min_quantity: 10,
              category: category,
              unit: 'unid',
              unit_measure: unitMeasure,
              location: 'Almoxarifado',
              origin: 'extra',
              batch_number: batchNumber,
              expiry_date: expiryDate,
              entry_date: new Date().toISOString(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }

          // 3. Log entry transaction for Almoxarifado
          const transRefEntry = doc(collection(db, 'transactions'));
          transaction.set(transRefEntry, {
            item_id: almoxRef.id,
            item_name: item.product_name,
            type: 'entry',
            origin: 'extra',
            quantity: returnQty,
            sector: requestData.sector,
            location: 'Almoxarifado',
            date: new Date().toISOString(),
            responsible: userProfile?.name || user?.displayName || user?.email || 'Administrador',
            responsibleEmail: user?.email,
            batch_number: batchNumber,
            expiry_date: expiryDate,
            isReturn: true,
            returnReason: requestData.returnReason || 'N√£o especificado',
            observation: requestData.observation || ''
          });

          // 4. Log exit transaction for Sector/Farm√°cia
          const transRefExit = doc(collection(db, 'transactions'));
          transaction.set(transRefExit, {
            item_id: sourceItemDoc ? sourceItemDoc.id : almoxRef.id,
            item_name: item.product_name,
            type: 'exit',
            origin: 'extra',
            quantity: returnQty,
            sector: requestData.sector,
            location: requestData.sector,
            date: new Date().toISOString(),
            responsible: userProfile?.name || user?.displayName || user?.email || 'Administrador',
            responsibleEmail: user?.email,
            exitReason: 'vencido',
            expiryReason: requestData.returnReason || 'Devolu√ß√£o ao Almoxarifado',
            batch_number: batchNumber,
            expiry_date: expiryDate,
            isReturn: true
          });
        }

        // Update main request status
        transaction.update(requestRef, {
          status: 'DEVOLUCAO_APROVADA',
          adminObservation: adminObservation || '',
          approvedAt: new Date().toISOString(),
          approvedBy: user?.email || 'Administrador',
          updatedAt: serverTimestamp()
        });
      });

      // Post-transaction updates: update quantity_returned on original request items
      const requestSnap = await getDoc(doc(db, 'requests', requestId));
      const requestData = requestSnap?.data() as MaterialRequest | undefined;
      if (requestData) {
        const batch = writeBatch(db);
        if (requestData.originalRequestId) {
          const origItemsSnap = await getDocs(query(collection(db, 'request_items'), where('request_id', '==', requestData.originalRequestId)));
          origItemsSnap.docs.forEach(d => {
            const origItem = d.data() as RequestItem;
            const matchedDevItem = devItems.find(di => di.product_name.trim().toLowerCase() === origItem.product_name.trim().toLowerCase());
            if (matchedDevItem) {
              const returnQty = matchedDevItem.quantity_approved || matchedDevItem.quantity_requested || 0;
              const currentReturned = origItem.quantity_returned || 0;
              batch.update(d.ref, {
                quantity_returned: currentReturned + returnQty
              });
            }
          });
        } else {
          // Direct flow: find and update ENTREGUE requests for this sector matching product_name
          const sectorReqsSnap = await getDocs(query(
            collection(db, 'requests'), 
            where('sector', '==', requestData.sector),
            where('status', '==', 'ENTREGUE')
          ));
          const sectorReqIds = sectorReqsSnap.docs.map(d => d.id);
          if (sectorReqIds.length > 0) {
            for (const matchedDevItem of devItems) {
              const returnQty = matchedDevItem.quantity_approved || matchedDevItem.quantity_requested || 0;
              if (returnQty <= 0) continue;

              const origItemsSnap = await getDocs(query(
                collection(db, 'request_items'),
                where('product_name', '==', matchedDevItem.product_name)
              ));

              let remainingToDistribute = returnQty;
              for (const d of origItemsSnap.docs) {
                const origItem = d.data() as RequestItem;
                if (sectorReqIds.includes(origItem.request_id)) {
                  const maxCanReturn = origItem.quantity_approved - (origItem.quantity_returned || 0);
                  if (maxCanReturn > 0 && remainingToDistribute > 0) {
                    const toReturn = Math.min(maxCanReturn, remainingToDistribute);
                    batch.update(d.ref, {
                      quantity_returned: (origItem.quantity_returned || 0) + toReturn
                    });
                    remainingToDistribute -= toReturn;
                  }
                }
              }
            }
          }
        }
        await batch.commit();
      }

      // Notify the requester
      if (requestData && requestData.requesterEmail) {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', requestData.requesterEmail)));
        if (!userSnap.empty) {
          await addDoc(collection(db, 'notifications'), {
            userId: userSnap.docs[0].id,
            title: 'Devolu√ß√£o Aprovada',
            message: `Sua solicita√ß√£o de devolu√ß√£o para o setor ${requestData.sector} foi aprovada. Os materiais retornaram ao estoque.`,
            date: new Date().toISOString(),
            read: false,
            requestId: requestId,
            type: 'REQUEST'
          });
        }
      }

      showToast("Devolu√ß√£o aprovada com sucesso! Materiais retornados ao estoque.", "success");
      setShowRequestDetailModal({ show: false });

    } catch (error: any) {
      console.error("Erro ao aprovar devolu√ß√£o:", error);
      showToast(`Erro ao aprovar devolu√ß√£o: ${error.message}`, "error");
    } finally {
      setIsProcessingDevolution(false);
    }
  };

  const handleRejectDevolution = async (requestId: string) => {
    try {
      setIsProcessingDevolution(true);
      showToast("Recusando devolu√ß√£o...", "info");

      await updateDoc(doc(db, 'requests', requestId), {
        status: 'DEVOLUCAO_RECUSADA',
        adminObservation: adminObservation || '',
        updatedAt: serverTimestamp()
      });

      // Notify requester
      const requestSnap = await getDoc(doc(db, 'requests', requestId));
      const requestData = requestSnap.data() as MaterialRequest | undefined;
      if (requestData && requestData.requesterEmail) {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', requestData.requesterEmail)));
        if (!userSnap.empty) {
          await addDoc(collection(db, 'notifications'), {
            userId: userSnap.docs[0].id,
            title: 'Devolu√ß√£o Recusada',
            message: `Sua solicita√ß√£o de devolu√ß√£o para o setor ${requestData.sector} foi recusada pelo almoxarifado.`,
            date: new Date().toISOString(),
            read: false,
            requestId: requestId,
            type: 'REQUEST'
          });
        }
      }

      showToast("Devolu√ß√£o recusada com sucesso.", "success");
      setShowRequestDetailModal({ show: false });
    } catch (error: any) {
      console.error("Erro ao recusar devolu√ß√£o:", error);
      showToast(`Erro ao recusar devolu√ß√£o: ${error.message}`, "error");
    } finally {
      setIsProcessingDevolution(false);
    }
  };

  const handleApproveRequest = async (requestId: string, items: RequestItem[]) => {
    try {
      const batch = writeBatch(db);
      const requestRef = doc(db, 'requests', requestId);
      batch.update(requestRef, { 
        status: 'APROVADO',
        adminObservation: adminObservation,
        updatedAt: serverTimestamp()
      });
      
      items.forEach(item => {
        const itemRef = doc(db, 'request_items', item.id);
        batch.update(itemRef, { 
          quantity_approved: item.quantity_approved,
          batch_id: item.batch_id || ''
        });
      });

      await batch.commit();
      
      const request = requests.find(r => r.id === requestId);
      if (request) {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', request.requesterEmail)));
        if (!userSnap.empty) {
          const msg = adminObservation 
            ? `Sua solicita√ß√£o #${requestId.slice(-5).toUpperCase()} foi aprovada. Obs: ${adminObservation}`
            : `Sua solicita√ß√£o #${requestId.slice(-5).toUpperCase()} foi aprovada.`;
          await createNotification(userSnap.docs[0].id, 'Solicita√ß√£o Aprovada', msg, requestId);
        }
      }

      showToast("Solicita√ß√£o aprovada!", "success");
      setShowRequestDetailModal({ show: false });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
      showToast(`Erro ao aprovar: ${error.message}`, "error");
    }
  };

  const handleDeliverRequest = async (requestId: string, requestItems: RequestItem[]) => {
    try {
      showToast("Processando entrega... Aguarde.", "info");
      
      const requestRef = doc(db, 'requests', requestId);
      const requestSnap = await getDoc(requestRef);
      if (!requestSnap.exists()) throw new Error("Solicita√ß√£o n√£o encontrada.");
      const requestData = requestSnap.data() as MaterialRequest;

      if (requestData.status === 'ENTREGUE') {
        showToast("Esta solicita√ß√£o j√° foi entregue.", "info");
        return;
      }

      // Pre-fetch all necessary stock data with normalized name matching
      const itemsSnapshot = await getDocs(collection(db, 'items'));
      const allActiveItems = itemsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Item))
        .filter(i => !i.deletedAt);

      const itemsStockData: any[] = [];
      for (const reqItem of requestItems) {
        if (reqItem.quantity_approved <= 0) continue;

        const normalizedReqName = normalizeString(reqItem.product_name);
        
        // Find all batches that represent this product (same normalized name)
        let batches = allActiveItems.filter(item => 
          normalizeString(item.name) === normalizedReqName && (item.quantity || 0) > 0
        );

        batches.sort((a, b) => {
          if (a.expiry_date === 'Indeterminada' || !a.expiry_date) return 1;
          if (b.expiry_date === 'Indeterminada' || !b.expiry_date) return -1;
          return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        });

        // Se o usu√°rio selecionou um lote espec√≠fico, priorizar esse lote na baixa
        if (reqItem.batch_id && reqItem.batch_id !== 'auto') {
          const chosenIndex = batches.findIndex(b => b.id === reqItem.batch_id);
          if (chosenIndex > -1) {
            const [chosen] = batches.splice(chosenIndex, 1);
            batches = [chosen, ...batches];
          }
        }

        let pharmItems: any[] = [];
        if (requestData.sector === 'Farm√°cia') {
          pharmItems = allActiveItems
            .filter(item => normalizeString(item.name) === normalizedReqName && item.location === 'Farm√°cia')
            .map(item => ({ id: item.id, batch_number: item.batch_number, ref: doc(db, 'items', item.id) }));
        }

        itemsStockData.push({ reqItem, batches, pharmItems });
      }

      await runTransaction(db, async (transaction) => {
        // Collect all batch and pharmacy refs to read them all first
        const batchRefs = itemsStockData.flatMap(d => d.batches.map(b => doc(db, 'items', b.id)));
        const pharmRefs = itemsStockData.flatMap(d => d.pharmItems.map(p => p.ref));
        
        // 1. Perform ALL reads first
        const [tRequestSnap, ...itemSnaps] = await Promise.all([
          transaction.get(requestRef),
          ...batchRefs.map(ref => transaction.get(ref)),
          ...pharmRefs.map(ref => transaction.get(ref))
        ]);

        const tRequestData = tRequestSnap.data() as MaterialRequest | undefined;
        if (!tRequestData || tRequestData.status === 'ENTREGUE') return;

        // Map snapshots for easy access by path
        const snapMap = new Map();
        itemSnaps.forEach(snap => snapMap.set(snap.ref.path, snap));

        // 2. Perform ALL writes
        transaction.update(requestRef, { 
          status: 'ENTREGUE',
          deliveredAt: new Date().toISOString(),
          deliveredBy: user?.email,
          updatedAt: serverTimestamp()
        });

        for (const { reqItem, batches, pharmItems } of itemsStockData) {
          let remaining = reqItem.quantity_approved;
          
          for (const batch of batches) {
            if (remaining <= 0) break;

            const tBatchRef = doc(db, 'items', batch.id);
            const tBatchSnap = snapMap.get(tBatchRef.path);
            if (!tBatchSnap || !tBatchSnap.exists()) continue;
            
            const tBatchData = tBatchSnap.data() as Item;
            const currentQty = tBatchData.quantity || 0;
            if (currentQty <= 0) continue;

            const toTake = Math.min(currentQty, remaining);
            
            transaction.update(tBatchRef, {
              quantity: currentQty - toTake,
              updatedAt: serverTimestamp()
            });

            // Log Transaction
            const transRef = doc(collection(db, 'transactions'));
            transaction.set(transRef, {
              item_id: batch.id,
              item_name: reqItem.product_name,
              type: 'exit',
              origin: batch.origin || 'extra',
              quantity: toTake,
              sector: requestData.sector,
              location: batch.location || 'Almoxarifado',
              date: new Date().toISOString(),
              responsible: user?.displayName || user?.email,
              responsibleEmail: user?.email,
              exitReason: 'consumo',
              batch_number: batch.batch_number,
              expiry_date: batch.expiry_date
            });

            if (requestData.sector === 'Farm√°cia' && batch.location !== 'Farm√°cia') {
              const existingPharm = pharmItems.find((p: any) => p.batch_number === batch.batch_number);
              if (existingPharm) {
                const tPharmRef = existingPharm.ref;
                const tPharmSnap = snapMap.get(tPharmRef.path);
                const tPharmData = tPharmSnap?.data() as Item | undefined;
                transaction.update(tPharmRef, {
                  quantity: (tPharmData?.quantity || 0) + toTake,
                  updatedAt: serverTimestamp()
                });
              } else {
                const newItemRef = doc(collection(db, 'items'));
                transaction.set(newItemRef, {
                  name: reqItem.product_name,
                  description: batch.description || '',
                  category: batch.category || 'Outros',
                  supplier: batch.supplier || 'Transfer√™ncia',
                  batch_number: batch.batch_number || '',
                  expiry_date: batch.expiry_date || 'Indeterminada',
                  initial_quantity: toTake,
                  quantity: toTake,
                  min_quantity: batch.min_quantity || 0,
                  unit_price: batch.unit_price || 0,
                  location: 'Farm√°cia',
                  origin: batch.origin || 'extra',
                  date: new Date().toISOString(),
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                });
              }
            }
            remaining -= toTake;
          }

          if (remaining > 0) {
            throw new Error(`Estoque insuficiente para "${reqItem.product_name}".`);
          }
        }
      });

      // Cleanup and UI updates
      showToast("Entrega confirmada e estoque baixado!", "success");
      setShowRequestDetailModal({ show: false });

      // Notifications
      const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', requestData.requesterEmail)));
      if (!uSnap.empty) {
        await createNotification(uSnap.docs[0].id, 'Entrega Realizada', `Sua solicita√ß√£o #${requestId.slice(-5).toUpperCase()} foi entregue.`, requestId);
      }

      // Stock Zero Notifications
      for (const { reqItem } of itemsStockData) {
        await checkStockAndNotify(reqItem.product_name);
      }

      // Receipt
      const itemsForReceipt = requestItems.filter(i => i.quantity_approved > 0).map(i => ({
        product_name: i.product_name,
        quantity: i.quantity_approved
      }));
      handleExportDeliveryReceiptPDF({
        sector: requestData.sector,
        items: itemsForReceipt,
        requestId: requestId,
        date: new Date().toISOString()
      });

    } catch (error: any) {
      console.error("Erro na entrega:", error);
      showToast(`Erro: ${error.message}`, "error");
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'requests', requestId), { 
        status: 'RECUSADO',
        adminObservation: adminObservation
      });
      
      const request = requests.find(r => r.id === requestId);
      if (request) {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', request.requesterEmail)));
        if (!userSnap.empty) {
          const msg = adminObservation 
            ? `Sua solicita√ß√£o #${requestId.slice(-5).toUpperCase()} foi recusada. Motivo: ${adminObservation}`
            : `Sua solicita√ß√£o #${requestId.slice(-5).toUpperCase()} foi recusada.`;
          await createNotification(userSnap.docs[0].id, 'Solicita√ß√£o Recusada', msg, requestId);
        }
      }
      
      showToast("Solicita√ß√£o recusada.", "success");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
      showToast(`Erro ao recusar: ${error.message}`, "error");
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      for (const itemData of bulkEntry.items) {
        const trimmedName = itemData.name.trim();
        if (!trimmedName) {
          showToast("O nome do produto n√£o pode estar vazio ou conter apenas espa√ßos.", "error");
          return;
        }

        const initial_qty = isNaN(itemData.initial_quantity) ? 0 : itemData.initial_quantity;
        
        // Dynamic min stock calculation (8 weeks / 2 months coverage)
        const weeklyRate = weeklyExitRates[trimmedName] || 0;
        const calculatedMin = weeklyRate > 0 ? Math.ceil(weeklyRate * 8) : 5;
        const min_qty = isNaN(itemData.min_quantity) ? calculatedMin : itemData.min_quantity;
        
        // Inherit price from existing batches if not provided
        const existingPrice = items.find(i => i.name.toLowerCase() === trimmedName.toLowerCase() && (Number(i.unit_price) || 0) > 0)?.unit_price || 0;
        const price = isNaN(itemData.unit_price) || itemData.unit_price === 0 ? existingPrice : itemData.unit_price;

        // Check if item already exists with the same name AND batch AND location
        const existingItem = items.find(i => 
          i.name.toLowerCase() === trimmedName.toLowerCase() && 
          (i.batch_number || '').toLowerCase() === (itemData.batch_number || '').toLowerCase() &&
          (i.location || 'Almoxarifado') === inventoryLocation
        );

        if (existingItem) {
          await runTransaction(db, async (transaction) => {
            const itemDoc = doc(db, 'items', existingItem.id);
            const itemSnap = await transaction.get(itemDoc);
            
            if (!itemSnap.exists()) {
              throw new Error("Item n√£o encontrado durante a atualiza√ß√£o.");
            }
            
            const currentItemData = itemSnap.data() as Item;
            const transCol = collection(db, 'transactions');
            
            const expiryValue = itemData.is_indeterminate_expiry ? 'Indeterminada' : itemData.expiry_date;

            transaction.update(itemDoc, {
              quantity: (Number(currentItemData.quantity) || 0) + initial_qty,
              min_quantity: min_qty,
              expiry_date: expiryValue || currentItemData.expiry_date,
              unit_price: price || currentItemData.unit_price,
              unit_measure: itemData.unit_measure || currentItemData.unit_measure || 'Unidade (UN)',
              supplier: bulkEntry.supplier || currentItemData.supplier,
              category: bulkEntry.category || currentItemData.category,
              medication_type: bulkEntry.category === 'Medicamentos' ? (itemData.medication_type || currentItemData.medication_type || '') : '',
              room: bulkEntry.room || currentItemData.room,
              updatedAt: serverTimestamp()
            });

            const newTransRef = doc(transCol);
            transaction.set(newTransRef, {
              item_id: existingItem.id,
              item_name: existingItem.name,
              type: 'entry',
              origin: bulkEntry.origin,
              quantity: initial_qty,
              location: inventoryLocation,
              room: bulkEntry.room,
              date: new Date().toISOString(),
              responsible: user?.displayName || 'Sistema',
              responsibleEmail: user?.email || '',
              supplier: bulkEntry.supplier || currentItemData.supplier,
              batch_number: itemData.batch_number,
              expiry_date: expiryValue,
              medication_type: bulkEntry.category === 'Medicamentos' ? (itemData.medication_type || '') : ''
            });
          });
        } else {
          const itemCol = collection(db, 'items');
          const transCol = collection(db, 'transactions');
          
          const expiryValue = itemData.is_indeterminate_expiry ? 'Indeterminada' : itemData.expiry_date;

          const itemRef = await addDoc(itemCol, {
            name: trimmedName,
            min_quantity: min_qty,
            expiry_date: expiryValue,
            origin: bulkEntry.origin,
            unit_price: price,
            unit_measure: itemData.unit_measure || 'Unidade (UN)',
            supplier: bulkEntry.supplier,
            category: bulkEntry.category,
            medication_type: bulkEntry.category === 'Medicamentos' ? (itemData.medication_type || '') : '',
            room: bulkEntry.room,
            batch_number: itemData.batch_number,
            quantity: initial_qty,
            location: inventoryLocation,
            createdAt: new Date().toISOString()
          });

          await addDoc(transCol, {
            item_id: itemRef.id,
            item_name: trimmedName,
            type: 'entry',
            origin: bulkEntry.origin,
            quantity: initial_qty,
            location: inventoryLocation,
            room: bulkEntry.room,
            date: new Date().toISOString(),
            responsible: user?.displayName || 'Sistema',
            responsibleEmail: user?.email || '',
            supplier: bulkEntry.supplier,
            batch_number: itemData.batch_number,
            expiry_date: expiryValue,
            medication_type: bulkEntry.category === 'Medicamentos' ? (itemData.medication_type || '') : ''
          });
        }
      }

      setShowAddModal(false);
      setBulkEntry({ 
        supplier: '',
        category: 'Expediente',
        origin: 'extra',
        room: 'Almoxarifado Principal',
        items: [{
          id: Math.random().toString(36).substr(2, 9),
          name: '',
          initial_quantity: 1,
          min_quantity: NaN,
          batch_number: '',
          expiry_date: '',
          is_indeterminate_expiry: false,
          unit_price: 0,
          unit_measure: 'Unidade (UN)',
          medication_type: ''
        }]
      });
    } catch (error: any) {
      console.error('Erro ao salvar itens:', error);
      alert(`Erro ao salvar itens: ${error.message}`);
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (showTransactionModal.type === 'exit') {
        if (basket.length === 0) return;
        
        await runTransaction(db, async (transaction) => {
          const processedItems = [];
          
          for (const b of basket) {
            const itemRef = doc(db, 'items', b.item_id);
            const itemSnap = await transaction.get(itemRef);
            
            if (!itemSnap.exists()) {
              throw new Error(`Item ${b.item_id} n√£o encontrado.`);
            }

            const currentItemData = itemSnap.data() as Item;
            const currentQty = Number(currentItemData.quantity) || 0;
            if (currentQty < b.quantity) {
              throw new Error(`Estoque insuficiente para o item ${currentItemData.name}. Dispon√≠vel: ${currentQty}`);
            }

            let pharmacyItemSnap = null;
            if (selectedSector === 'Farm√°cia' && exitReason === 'consumo') {
              const pharmacyItemsQuery = query(
                collection(db, 'items'),
                where('name', '==', currentItemData.name),
                where('batch_number', '==', currentItemData.batch_number || ''),
                where('location', '==', 'Farm√°cia')
              );
              const fullSnap = await getDocs(pharmacyItemsQuery);
              const activeDocs = fullSnap.docs.filter(d => !d.data().deletedAt);
              pharmacyItemSnap = {
                empty: activeDocs.length === 0,
                docs: activeDocs
              };
            }

            processedItems.push({
              itemRef,
              currentItemData,
              quantity: b.quantity,
              pharmacyItemSnap
            });
          }

          const transCol = collection(db, 'transactions');
          const itemsCol = collection(db, 'items');

          for (const pi of processedItems) {
            const { itemRef, currentItemData, quantity, pharmacyItemSnap } = pi;
            const currentQty = Number(currentItemData.quantity) || 0;

            transaction.update(itemRef, {
              quantity: currentQty - quantity,
              updatedAt: serverTimestamp()
            });

            const newTransRef = doc(transCol);
            const currentDonationNumber = exitReason === 'doacao' ? (() => {
              const currentYear = new Date().getFullYear();
              const yearlyDonations = transactions.filter(t => 
                t.exitReason === 'doacao' && 
                !t.deletedAt && 
                new Date(t.date).getFullYear() === currentYear
              );
              const uniqueDonations = new Set();
              yearlyDonations.forEach(t => {
                // Group by either donationNumber or a "session key" (rough timestamp + destinatario)
                if ((t as any).donationNumber) {
                  uniqueDonations.add((t as any).donationNumber);
                } else {
                  // Fallback for older transactions: group by date (minute precision) and sector
                  const dateKey = new Date(t.date).toISOString().slice(0, 16);
                  uniqueDonations.add(`${dateKey}-${t.sector}`);
                }
              });
              const nextCount = uniqueDonations.size + 1;
              return `${nextCount.toString().padStart(2, '0')}/${currentYear}`;
            })() : null;

            const sectorValue = (exitReason === 'vencido' || exitReason === 'perda')
              ? (exitReason === 'vencido' ? 'Descarte por Vencimento (Desperd√≠cio)' : 'Descarte por Perda/Avaria')
              : (modalSector || (inventoryLocation === 'Farm√°cia' ? 'Farm√°cia (Consumo Interno)' : 'Almoxarifado'));

            transaction.set(newTransRef, {
              item_id: currentItemData.id || itemRef.id,
              item_name: currentItemData.name,
              type: 'exit',
              origin: currentItemData.origin,
              quantity: quantity,
              sector: sectorValue,
              location: inventoryLocation,
              date: new Date().toISOString(),
              responsible: user?.displayName || 'Sistema',
              responsibleEmail: user?.email || '',
              exitReason: exitReason,
              expiryReason: (exitReason === 'vencido' || exitReason === 'perda') ? expiryReason : null,
              donationUnitName: exitReason === 'doacao' ? (donationUnitName || 'Policl√≠nica de Sobral') : null,
              donationUnitAddress: exitReason === 'doacao' ? donationUnitAddress : null,
              donationUnitCNPJ: exitReason === 'doacao' ? donationUnitCNPJ : null,
              donationRevisionDate: exitReason === 'doacao' ? donationRevisionDate : null,
              donationNumber: currentDonationNumber,
              batch_number: currentItemData.batch_number,
              expiry_date: currentItemData.expiry_date
            });

            if (pharmacyItemSnap) {
              let pharmacyItemId = '';
              if (!pharmacyItemSnap.empty) {
                const pharmacyItemDoc = pharmacyItemSnap.docs[0];
                pharmacyItemId = pharmacyItemDoc.id;
                transaction.update(pharmacyItemDoc.ref, {
                  quantity: (pharmacyItemDoc.data().quantity || 0) + quantity,
                  updatedAt: serverTimestamp()
                });
              } else {
                const newItemRef = doc(itemsCol);
                pharmacyItemId = newItemRef.id;
                transaction.set(newItemRef, {
                  name: currentItemData.name,
                  description: currentItemData.description || '',
                  quantity: quantity,
                  min_quantity: currentItemData.min_quantity || 5,
                  expiry_date: currentItemData.expiry_date,
                  origin: currentItemData.origin,
                  unit_price: currentItemData.unit_price,
                  supplier: currentItemData.supplier,
                  category: currentItemData.category,
                  batch_number: currentItemData.batch_number,
                  location: 'Farm√°cia',
                  createdAt: new Date().toISOString()
                });
              }

              const pharmTransRef = doc(transCol);
              transaction.set(pharmTransRef, {
                item_id: pharmacyItemId,
                item_name: currentItemData.name,
                type: 'entry',
                origin: currentItemData.origin,
                quantity: quantity,
                location: 'Farm√°cia',
                date: new Date().toISOString(),
                responsible: 'Sistema (Transfer√™ncia)',
                batch_number: currentItemData.batch_number,
                expiry_date: currentItemData.expiry_date,
                supplier: currentItemData.supplier
              });
            }
          }
        });
      } else {
        const item = showTransactionModal.item || items.find(i => i.id === selectedItemId);
        if (!item) {
          alert('Por favor, selecione um item.');
          return;
        }

        const weeklyRate = weeklyExitRates[item.name] || 0;
        const calculatedMin = weeklyRate > 0 ? Math.ceil(weeklyRate * 8) : item.min_quantity;
        const finalMinStock = isNaN(transactionMinStock) ? calculatedMin : transactionMinStock;
        
        await runTransaction(db, async (transaction) => {
          const itemDoc = doc(db, 'items', item.id);
          const itemSnap = await transaction.get(itemDoc);
          
          if (!itemSnap.exists()) {
            throw new Error("Item n√£o encontrado.");
          }

          const currentItemData = itemSnap.data() as Item;
          const transCol = collection(db, 'transactions');
          
          transaction.update(itemDoc, {
            quantity: (Number(currentItemData.quantity) || 0) + transactionQty,
            min_quantity: finalMinStock,
            updatedAt: serverTimestamp()
          });

          const newTransRef = doc(transCol);
          transaction.set(newTransRef, {
            item_id: item.id,
            item_name: currentItemData.name,
            type: 'entry',
            origin: currentItemData.origin,
            quantity: transactionQty,
            sector: null,
            location: inventoryLocation,
            date: new Date().toISOString(),
            responsible: user?.displayName || 'Sistema',
            responsibleEmail: user?.email || '',
            batch_number: currentItemData.batch_number,
            expiry_date: currentItemData.expiry_date,
            supplier: currentItemData.supplier
          });
        });
      }

      setShowTransactionModal({ show: false, type: 'entry' });
      
      // Post-transaction receipt/term generation
      if (showTransactionModal.type === 'exit' && basket.length > 0) {
        const itemsForReceipt = basket.map(b => {
          const it = items.find(i => i.id === b.item_id);
          return {
            product_name: it?.name || 'Produto N√£o Identificado',
            quantity: b.quantity,
            batch_number: it?.batch_number,
            expiry_date: it?.expiry_date,
            category: it?.category
          };
        });
        
        if (exitReason === 'doacao') {
          // Calculate donation number for this year
          const currentYear = new Date().getFullYear();
          const yearlyDonations = transactions.filter(t => 
            t.exitReason === 'doacao' && 
            !t.deletedAt && 
            new Date(t.date).getFullYear() === currentYear
          );
          const uniqueDonations = new Set();
          yearlyDonations.forEach(t => {
            if ((t as any).donationNumber) {
              uniqueDonations.add((t as any).donationNumber);
            } else {
              const dateKey = new Date(t.date).toISOString().slice(0, 16);
              uniqueDonations.add(`${dateKey}-${t.sector}`);
            }
          });
          const currentDonationNumber = `${(uniqueDonations.size + 1).toString().padStart(2, '0')}/${currentYear}`;

          handleExportDonationTermPDF({
            donatingUnitName: donationUnitName || 'Policl√≠nica de Sobral',
            receivingUnit: {
              name: modalSector || selectedSector || 'Unidade Receptora',
              address: donationUnitAddress,
              cnpj: donationUnitCNPJ
            },
            items: itemsForReceipt,
            revisionDate: donationRevisionDate,
            donationNumber: currentDonationNumber,
            date: new Date().toISOString()
          });
        } else if (exitReason === 'vencido' || exitReason === 'perda') {
          handleExportDisposalTermPDF({
            items: itemsForReceipt,
            reason: exitReason,
            justification: expiryReason,
            location: inventoryLocation,
            responsible: userProfile?.name || user?.displayName || 'Respons√°vel',
            date: new Date().toISOString()
          });
          showToast(exitReason === 'vencido' ? "Baixa por vencimento (desperd√≠cio) conclu√≠da com sucesso!" : "Baixa por perda/avaria conclu√≠da!", "success");
        } else if (selectedSector || modalSector) {
          handleExportDeliveryReceiptPDF({
            sector: modalSector || selectedSector,
            items: itemsForReceipt,
            date: new Date().toISOString()
          });
        }
      }

      setTransactionMinStock(NaN);
      setTransactionQty(1);
      setExitReason('consumo');
      setExpiryReason('');
      setSelectedSector(SECTORS[0]);
      setSelectedItemId('');
      setBasket([]);
      setDonationUnitName('');
      setDonationUnitAddress('');
      setDonationUnitCNPJ('');
      setDonationRevisionDate('');
      setLetterheadImage(null);

      // Stock Zero Notifications check
      if (showTransactionModal.type === 'exit') {
        const itemNames = basket.map(b => items.find(i => i.id === b.item_id)?.name).filter(Boolean) as string[];
        for (const name of itemNames) {
          await checkStockAndNotify(name);
        }
      }
    } catch (error: any) {
      console.error('Erro na transa√ß√£o:', error);
      alert(`Erro na movimenta√ß√£o: ${error.message}`);
    }
  };

  const handleExportExcel = () => {
    try {
      // Prepare data for Excel
      const exportData: any[] = [];
      reportData.consumptionReport.forEach(item => {
        // Main item row
        const row: any = {
          'Item': item.name,
          'Categoria': item.category,
          'Fornecedor': item.supplier,
          'Quantidade Total': item.totalQuantity,
          'Destino': 'TOTAL'
        };
        if (isAdmin) row['Valor Total (BRL)'] = item.totalValue;
        exportData.push(row);
        
        // Sector breakdown rows
        Object.entries(item.sectors).forEach(([sector, qty]) => {
          const subRow: any = {
            'Item': `   ‚Ü≥ ${item.name}`,
            'Categoria': item.category,
            'Fornecedor': item.supplier,
            'Quantidade Total': qty,
            'Destino': sector
          };
          if (isAdmin) subRow['Valor Total (BRL)'] = '';
          exportData.push(subRow);
        });
      });

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Relat√≥rio de Sa√≠das");

      // Generate filename
      const dateStr = format(new Date(), 'dd-MM-yyyy');
      const sectorStr = reportSectorFilter === 'all' ? 'Todos_Setores' : reportSectorFilter.replace(/\s+/g, '_');
      const fileName = `Relatorio_Estoque_${sectorStr}_${dateStr}.xlsx`;

      // Save file
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      alert('Ocorreu um erro ao gerar o arquivo Excel.');
    }
  };

  const handleExportInventory = () => {
    try {
      const exportData = groupedArray.map(group => {
        let status = group.total_quantity <= group.min_quantity ? 'BAIXO' : 'OK';
        if (group.durationWeeks !== 'infinite') {
          if (group.durationWeeks <= 4) status = 'MUITO CR√çTICO';
          else if (group.durationWeeks <= 8) status = 'CR√çTICO';
        }
        const monthInfo = getDurationMonthInfo(group.durationWeeks);
        
        return {
          'Item': group.name,
          'Categoria': group.category || '---',
          'Estoque Total': group.total_quantity,
          'Consumo Semanal': group.weeklyExitRate > 0 ? Number(group.weeklyExitRate.toFixed(1)) : 0,
          'Dura√ß√£o (Semanas)': group.durationWeeks === 'infinite' ? '‚àû' : Number(group.durationWeeks.toFixed(1)),
          'Previs√£o at√© M√™s': monthInfo.monthYear,
          'M√≠nimo (8 Semanas)': group.min_quantity,
          'Status': status
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Estoque Atual");
      const dateStr = format(new Date(), 'dd-MM-yyyy');
      XLSX.writeFile(wb, `Estoque_Atual_${dateStr}.xlsx`);
      showToast("Estoque exportado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar estoque:', error);
      showToast("Erro ao exportar estoque.", "error");
    }
  };

  const handleExportInventoryPDF = () => {
    try {
      const doc = new jsPDF();
      const isDurationSorted = inventorySort === 'duration_asc' || inventorySort === 'duration_desc';
      const title = 'Relat√≥rio de Estoque Atual';
      const subtitle = isDurationSorted
        ? `Ordena√ß√£o: Previs√£o de Dura√ß√£o (Menor para Maior) ‚Ä¢ Separado por M√™s ‚Ä¢ Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`
        : `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;

      const startY = drawPDFLetterhead(doc, title, subtitle);
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      // Group items by month if sorted by duration
      if (inventorySort === 'duration_asc' || inventorySort === 'duration_desc') {
        const monthGroupsMap = new Map<string, { info: DurationMonthInfo; items: ItemGroup[] }>();

        groupedArray.forEach(group => {
          const info = getDurationMonthInfo(group.durationWeeks);
          if (!monthGroupsMap.has(info.key)) {
            monthGroupsMap.set(info.key, { info, items: [] });
          }
          monthGroupsMap.get(info.key)!.items.push(group);
        });

        const monthGroupsList = Array.from(monthGroupsMap.values());
        let currentY = startY + 4;

        monthGroupsList.forEach((mGroup) => {
          // Check if we need page break before new section banner + header row
          if (currentY > pageHeight - 45) {
            doc.addPage();
            currentY = 20;
          }

          // Section Header Banner
          const isCurr = mGroup.info.isCurrentMonth;
          const isInf = mGroup.info.isInfinite;
          
          if (isCurr) {
            doc.setFillColor(225, 29, 72); // Rose-600 (Urgent/Current month)
          } else if (isInf) {
            doc.setFillColor(71, 85, 105); // Slate-600
          } else {
            doc.setFillColor(30, 58, 138); // Blue-900
          }

          doc.roundedRect(14, currentY, pageWidth - 28, 7.5, 1.5, 1.5, 'F');
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text(
            `${mGroup.info.sectionTitle}  ‚Ä¢  ${mGroup.items.length} ${mGroup.items.length === 1 ? 'item' : 'itens'}`,
            18,
            currentY + 5.2
          );

          currentY += 9.5;

          const tableData = mGroup.items.map(group => {
            let status = group.total_quantity <= group.min_quantity ? 'BAIXO' : 'OK';
            if (group.durationWeeks !== 'infinite') {
              if (group.durationWeeks <= 4) status = 'MUITO CR√çTICO';
              else if (group.durationWeeks <= 8) status = 'CR√çTICO';
            }
            const info = getDurationMonthInfo(group.durationWeeks);
            const durationStr = group.durationWeeks === 'infinite' ? '‚àû' : `${group.durationWeeks.toFixed(1)} sem`;
            const exitRateStr = group.weeklyExitRate > 0 ? `${group.weeklyExitRate.toFixed(1)}/sem` : '---';

            return [
              group.name,
              group.category || '---',
              group.total_quantity.toString(),
              exitRateStr,
              durationStr,
              info.shortMonthYear,
              group.min_quantity.toString(),
              status
            ];
          });

          autoTable(doc, {
            startY: currentY,
            head: [['Item / Insumo', 'Categoria', 'Estoque', 'Consumo/Sem', 'Dura√ß√£o', 'Dura at√©', 'M√≠nimo (8 sem)', 'Status']],
            body: tableData,
            theme: 'striped',
            headStyles: { 
              fillColor: isCurr ? [159, 18, 57] : isInf ? [51, 65, 85] : [28, 25, 23],
              halign: 'center',
              fontSize: 8,
              fontStyle: 'bold'
            },
            columnStyles: {
              0: { halign: 'left' },
              1: { halign: 'left' },
              2: { halign: 'center', fontStyle: 'bold' },
              3: { halign: 'center' },
              4: { halign: 'center', fontStyle: 'bold' },
              5: { halign: 'center' },
              6: { halign: 'center' },
              7: { halign: 'center' }
            },
            styles: { fontSize: 8, cellPadding: 2.5 },
            didParseCell: function(data) {
              if (data.section === 'body' && data.column.index === 7) {
                const text = data.cell.text[0];
                if (text === 'BAIXO' || text === 'MUITO CR√çTICO') {
                  data.cell.styles.textColor = [225, 29, 72];
                  data.cell.styles.fontStyle = 'bold';
                } else if (text === 'CR√çTICO') {
                  data.cell.styles.textColor = [234, 88, 12];
                  data.cell.styles.fontStyle = 'bold';
                }
              }
            }
          });

          currentY = (doc as any).lastAutoTable.finalY + 7;
        });

      } else {
        // Standard single table for alphabetical or other sorting
        const tableData = groupedArray.map(group => {
          let status = group.total_quantity <= group.min_quantity ? 'BAIXO' : 'OK';
          if (group.durationWeeks !== 'infinite') {
            if (group.durationWeeks <= 4) status = 'MUITO CR√çTICO';
            else if (group.durationWeeks <= 8) status = 'CR√çTICO';
          }
          const info = getDurationMonthInfo(group.durationWeeks);
          const durationStr = group.durationWeeks === 'infinite' ? '‚àû' : `${group.durationWeeks.toFixed(1)} sem`;
          const exitRateStr = group.weeklyExitRate > 0 ? `${group.weeklyExitRate.toFixed(1)}/sem` : '---';

          return [
            group.name,
            group.category || '---',
            group.total_quantity.toString(),
            exitRateStr,
            durationStr,
            info.shortMonthYear,
            group.min_quantity.toString(),
            status
          ];
        });

        autoTable(doc, {
          startY: startY + 4,
          head: [['Item / Insumo', 'Categoria', 'Estoque', 'Consumo/Sem', 'Dura√ß√£o', 'Dura at√©', 'M√≠nimo (8 sem)', 'Status']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [28, 25, 23], halign: 'center', fontSize: 8.5 },
          columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'left' },
            2: { halign: 'center', fontStyle: 'bold' },
            3: { halign: 'center' },
            4: { halign: 'center', fontStyle: 'bold' },
            5: { halign: 'center' },
            6: { halign: 'center' },
            7: { halign: 'center' }
          },
          styles: { fontSize: 8, cellPadding: 2.5 },
          didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 7) {
              const text = data.cell.text[0];
              if (text === 'BAIXO' || text === 'MUITO CR√çTICO') {
                data.cell.styles.textColor = [225, 29, 72];
                data.cell.styles.fontStyle = 'bold';
              } else if (text === 'CR√çTICO') {
                data.cell.styles.textColor = [234, 88, 12];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });
      }
      
      // Save PDF
      const dateStr = format(new Date(), 'dd-MM-yyyy');
      doc.save(`Estoque_Atual_${dateStr}.pdf`);
      showToast("PDF de estoque exportado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar PDF de estoque:', error);
      showToast("Erro ao exportar PDF de estoque.", "error");
    }
  };

  const handleExportCriticalReportPDF = (type: 'low_stock' | 'expiry' | 'all' = 'all') => {
    try {
      const doc = new jsPDF();
      const dateStr = format(new Date(), 'dd/MM/yyyy HH:mm');
      const locationLabel = inventoryLocation === 'Farm√°cia' ? 'Farm√°cia (Medicamentos)' : 'Almoxarifado Geral';
      
      let title = 'RELAT√ìRIO GERAL DE ITENS CR√çTICOS';
      let subtitle = `Unidade: ${locationLabel} ‚Ä¢ Data de Emiss√£o: ${dateStr}`;

      if (type === 'low_stock') {
        title = 'RELAT√ìRIO DE ITENS CR√çTICOS ‚Äî ESTOQUE BAIXO E RUPTURA';
      } else if (type === 'expiry') {
        title = 'RELAT√ìRIO DE ITENS CR√çTICOS ‚Äî CONTROLE DE VALIDADE';
      }

      let currentY = drawPDFLetterhead(doc, title, subtitle);

      // Collect all active items for current location
      const activeLocationItems = items.filter(
        i => !i.deletedAt && i.quantity > 0 && (i.location || 'Almoxarifado') === inventoryLocation
      );

      const locationGrouped: Record<string, ItemGroup> = {};
      activeLocationItems.forEach(item => {
        if (!locationGrouped[item.name]) {
          const weeklyRate = weeklyExitRates[item.name] || 0;
          locationGrouped[item.name] = {
            name: item.name,
            total_quantity: 0,
            min_quantity: weeklyRate > 0 ? Math.ceil(weeklyRate * 8) : item.min_quantity,
            category: item.category,
            supplier: item.supplier,
            unit_measure: item.unit_measure || null,
            batches: [],
            weeklyExitRate: weeklyRate,
            durationWeeks: 0
          };
        }
        locationGrouped[item.name].total_quantity += item.quantity;
        if (!locationGrouped[item.name].unit_measure && item.unit_measure) {
          locationGrouped[item.name].unit_measure = item.unit_measure;
        }
        locationGrouped[item.name].batches.push(item);
      });

      // Filter groups where total_quantity <= min_quantity
      const lowStockGroupsList = Object.values(locationGrouped).filter(
        g => g.total_quantity <= g.min_quantity
      );

      // Sort by deficit/ratio ascending (most critical first)
      lowStockGroupsList.sort((a, b) => {
        const ratioA = a.min_quantity > 0 ? a.total_quantity / a.min_quantity : 1;
        const ratioB = b.min_quantity > 0 ? b.total_quantity / b.min_quantity : 1;
        return ratioA - ratioB;
      });

      // Filter expiry batches (expired or near expiry)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiryBatches = activeLocationItems
        .filter(i => isExpired(i) || isNearExpiry(i))
        .sort((a, b) => {
          const dateA = a.expiry_date && a.expiry_date !== 'Indeterminada' ? new Date(a.expiry_date).getTime() : 0;
          const dateB = b.expiry_date && b.expiry_date !== 'Indeterminada' ? new Date(b.expiry_date).getTime() : 0;
          return dateA - dateB;
        });

      // CASE 1: REPORT EXCLUSIVELY FOR EXPIRY (VALIDADE)
      if (type === 'expiry') {
        if (expiryBatches.length === 0) {
          doc.setFontSize(11);
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          doc.text("Nenhum item vencido ou com validade pr√≥xima registrado.", 14, currentY + 12);
          
          doc.setFontSize(9.5);
          doc.setTextColor(100, 116, 139);
          doc.setFont("helvetica", "normal");
          doc.text(`Todos os lotes ativos no ${locationLabel} est√£o em conformidade de validade.`, 14, currentY + 20);

          const dateFileStr = format(new Date(), 'dd-MM-yyyy');
          doc.save(`Relatorio_Criticos_Validade_${inventoryLocation}_${dateFileStr}.pdf`);
          showToast("Relat√≥rio de validade gerado com sucesso!", "info");
          return;
        }

        const tableData = expiryBatches.map(item => {
          const itemExpired = isExpired(item);
          const expDate = item.expiry_date && item.expiry_date !== 'Indeterminada' ? new Date(item.expiry_date) : null;
          let daysDiff = 0;
          let prazoText = 'Indeterminado';
          if (expDate) {
            const diffTime = expDate.getTime() - today.getTime();
            daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (itemExpired) {
              prazoText = `Vencido h√° ${Math.abs(daysDiff)} dia(s)`;
            } else {
              prazoText = `Vence em ${daysDiff} dia(s)`;
            }
          }

          const unitText = item.unit_measure ? ` ${item.unit_measure}` : ' UN';
          const formattedDate = expDate ? format(expDate, 'dd/MM/yyyy') : '---';

          return [
            item.name,
            item.batch_number || 'S/ Lote',
            item.category || 'Geral',
            `${item.quantity}${unitText}`,
            formattedDate,
            prazoText,
            itemExpired ? 'VENCIDO' : 'PR√ìXIMO AO VENCIMENTO'
          ];
        });

        autoTable(doc, {
          startY: currentY + 4,
          head: [['Material / Medicamento', 'Lote', 'Categoria', 'Qtd Atual', 'Data Validade', 'Prazo / Situa√ß√£o', 'Status']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [190, 24, 93], halign: 'center', fontStyle: 'bold' }, // Rose-700
          columnStyles: {
            1: { halign: 'center' },
            3: { halign: 'center', fontStyle: 'bold' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' }
          },
          styles: { fontSize: 8.5, cellPadding: 3 },
          didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 6) {
              const text = data.cell.text[0];
              if (text === 'VENCIDO') {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [3, 105, 161];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });

        const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : currentY + 50;
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.setFont("helvetica", "bold");
        const expCount = expiryBatches.filter(i => isExpired(i)).length;
        const nearCount = expiryBatches.filter(i => isNearExpiry(i)).length;
        doc.text(`Total: ${expiryBatches.length} lote(s) com alerta de validade (${expCount} vencido(s) e ${nearCount} pr√≥ximo(s) ao vencimento)`, 14, finalY);

        const dateFileStr = format(new Date(), 'dd-MM-yyyy');
        doc.save(`Relatorio_Criticos_Validade_${inventoryLocation}_${dateFileStr}.pdf`);
        showToast("Relat√≥rio PDF de validade cr√≠tica gerado com sucesso!", "success");
        return;
      }

      // CASE 2: REPORT EXCLUSIVELY FOR LOW STOCK (ESTOQUE BAIXO)
      if (type === 'low_stock') {
        if (lowStockGroupsList.length === 0) {
          doc.setFontSize(11);
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          doc.text("Nenhum item com estoque baixo registrado no momento.", 14, currentY + 12);
          
          doc.setFontSize(9.5);
          doc.setTextColor(100, 116, 139);
          doc.setFont("helvetica", "normal");
          doc.text(`Todos os insumos cadastrados no ${locationLabel} est√£o acima do estoque m√≠nimo.`, 14, currentY + 20);

          const dateFileStr = format(new Date(), 'dd-MM-yyyy');
          doc.save(`Relatorio_Criticos_Estoque_Baixo_${inventoryLocation}_${dateFileStr}.pdf`);
          showToast("Relat√≥rio gerado: Nenhum item com estoque baixo encontrado.", "info");
          return;
        }

        const tableData = lowStockGroupsList.map(group => {
          const deficit = Math.max(0, group.min_quantity - group.total_quantity);
          let status = 'ESTOQUE BAIXO';
          if (group.total_quantity === 0) {
            status = 'ZERADO / RUPTURA';
          } else if (group.total_quantity <= (group.min_quantity * 0.5)) {
            status = 'MUITO CR√çTICO';
          }

          const unitText = group.unit_measure ? ` ${group.unit_measure}` : '';

          return [
            group.name,
            group.category || 'Geral',
            `${group.total_quantity}${unitText}`,
            `${group.min_quantity}${unitText}`,
            `${deficit}${unitText}`,
            status
          ];
        });

        autoTable(doc, {
          startY: currentY + 4,
          head: [['Material / Medicamento', 'Categoria', 'Estoque Atual', 'Estoque M√≠nimo', 'D√©ficit (Reposi√ß√£o)', 'Status Cr√≠tico']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [180, 83, 9], halign: 'center', fontStyle: 'bold' }, // Amber-700
          columnStyles: {
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'center', fontStyle: 'bold' },
            5: { halign: 'center' }
          },
          styles: { fontSize: 8.5, cellPadding: 3 },
          didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 5) {
              const text = data.cell.text[0];
              if (text.includes('ZERADO') || text === 'MUITO CR√çTICO') {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
              } else if (text === 'ESTOQUE BAIXO') {
                data.cell.styles.textColor = [217, 119, 6];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });

        const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : currentY + 50;
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.setFont("helvetica", "bold");
        doc.text(`Total de itens identificados com estoque baixo ou cr√≠tico: ${lowStockGroupsList.length}`, 14, finalY);

        const dateFileStr = format(new Date(), 'dd-MM-yyyy');
        doc.save(`Relatorio_Criticos_Estoque_Baixo_${inventoryLocation}_${dateFileStr}.pdf`);
        showToast("Relat√≥rio PDF de estoque baixo gerado com sucesso!", "success");
        return;
      }

      // CASE 3: COMBINED REPORT (VALIDADE + ESTOQUE BAIXO)
      if (lowStockGroupsList.length === 0 && expiryBatches.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129);
        doc.setFont("helvetica", "bold");
        doc.text("Nenhuma inconformidade cr√≠tica identificada no momento.", 14, currentY + 12);
        
        doc.setFontSize(9.5);
        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "normal");
        doc.text(`Todos os insumos e lotes do ${locationLabel} est√£o com n√≠veis e validades regulares.`, 14, currentY + 20);

        const dateFileStr = format(new Date(), 'dd-MM-yyyy');
        doc.save(`Relatorio_Criticos_Geral_${inventoryLocation}_${dateFileStr}.pdf`);
        showToast("Relat√≥rio gerado: Estoque 100% regular.", "info");
        return;
      }

      // Section 1: Validade
      if (expiryBatches.length > 0) {
        doc.setFontSize(10);
        doc.setTextColor(159, 18, 57);
        doc.setFont("helvetica", "bold");
        doc.text(`1. CONTROLE DE VALIDADE (${expiryBatches.length} lote(s) requerem aten√ß√£o)`, 14, currentY + 5);

        const expiryTableData = expiryBatches.map(item => {
          const itemExpired = isExpired(item);
          const expDate = item.expiry_date && item.expiry_date !== 'Indeterminada' ? new Date(item.expiry_date) : null;
          let daysDiff = 0;
          let prazoText = 'Indeterminado';
          if (expDate) {
            const diffTime = expDate.getTime() - today.getTime();
            daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            prazoText = itemExpired ? `Vencido h√° ${Math.abs(daysDiff)} d` : `Vence em ${daysDiff} d`;
          }
          const unitText = item.unit_measure ? ` ${item.unit_measure}` : ' UN';
          const formattedDate = expDate ? format(expDate, 'dd/MM/yyyy') : '---';

          return [
            item.name,
            item.batch_number || 'S/ Lote',
            item.category || 'Geral',
            `${item.quantity}${unitText}`,
            formattedDate,
            prazoText,
            itemExpired ? 'VENCIDO' : 'PR√ìX. VENCER'
          ];
        });

        autoTable(doc, {
          startY: currentY + 8,
          head: [['Material / Medicamento', 'Lote', 'Categoria', 'Qtd Atual', 'Validade', 'Prazo', 'Status']],
          body: expiryTableData,
          theme: 'striped',
          headStyles: { fillColor: [190, 24, 93], halign: 'center', fontStyle: 'bold' },
          columnStyles: {
            1: { halign: 'center' },
            3: { halign: 'center', fontStyle: 'bold' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' }
          },
          styles: { fontSize: 8, cellPadding: 2.5 },
          didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 6) {
              const text = data.cell.text[0];
              if (text === 'VENCIDO') {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [3, 105, 161];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });

        currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : currentY + 40;
      }

      // Section 2: Estoque Baixo
      if (lowStockGroupsList.length > 0) {
        if (currentY > 220) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(10);
        doc.setTextColor(146, 64, 14);
        doc.setFont("helvetica", "bold");
        doc.text(`2. ESTOQUE BAIXO E RUPTURA (${lowStockGroupsList.length} item(ns) para reposi√ß√£o)`, 14, currentY + 4);

        const lowStockTableData = lowStockGroupsList.map(group => {
          const deficit = Math.max(0, group.min_quantity - group.total_quantity);
          let status = 'ESTOQUE BAIXO';
          if (group.total_quantity === 0) {
            status = 'ZERADO / RUPTURA';
          } else if (group.total_quantity <= (group.min_quantity * 0.5)) {
            status = 'MUITO CR√çTICO';
          }
          const unitText = group.unit_measure ? ` ${group.unit_measure}` : '';

          return [
            group.name,
            group.category || 'Geral',
            `${group.total_quantity}${unitText}`,
            `${group.min_quantity}${unitText}`,
            `${deficit}${unitText}`,
            status
          ];
        });

        autoTable(doc, {
          startY: currentY + 7,
          head: [['Material / Medicamento', 'Categoria', 'Estoque Atual', 'Estoque M√≠nimo', 'D√©ficit (Reposi√ß√£o)', 'Status Cr√≠tico']],
          body: lowStockTableData,
          theme: 'striped',
          headStyles: { fillColor: [180, 83, 9], halign: 'center', fontStyle: 'bold' },
          columnStyles: {
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'center', fontStyle: 'bold' },
            5: { halign: 'center' }
          },
          styles: { fontSize: 8, cellPadding: 2.5 },
          didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 5) {
              const text = data.cell.text[0];
              if (text.includes('ZERADO') || text === 'MUITO CR√çTICO') {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
              } else if (text === 'ESTOQUE BAIXO') {
                data.cell.styles.textColor = [217, 119, 6];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });
      }

      const dateFileStr = format(new Date(), 'dd-MM-yyyy');
      doc.save(`Relatorio_Criticos_Geral_${inventoryLocation}_${dateFileStr}.pdf`);
      showToast("Relat√≥rio PDF completo de itens cr√≠ticos gerado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar PDF de itens cr√≠ticos:', error);
      showToast("Erro ao exportar PDF de itens cr√≠ticos.", "error");
    }
  };

  const handleExportLowStockPDF = () => {
    handleExportCriticalReportPDF('low_stock');
  };

  const handleExportPurchasePlanningPDF = () => {
    try {
      // @ts-ignore
      const doc = new jsPDF();
      const dateStr = format(new Date(), 'dd/MM/yyyy HH:mm');
      
      const title = 'PLANEJAMENTO DE COMPRAS ‚Äî ESTIMATIVA DE AQUISI√á√ÉO';
      let currentY = drawPDFLetterhead(doc, title);
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      // Executive Summary Metric Box in PDF
      doc.setFillColor(248, 250, 252); // slate-50
      doc.roundedRect(14, currentY, pageWidth - 28, 22, 2, 2, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(14, currentY, pageWidth - 28, 22, 2, 2, 'S');

      // Metric 1: Cobertura
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('PER√çODO DE COBERTURA', 18, currentY + 6.5);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`At√© ${purchasePlanningSummary.targetPeriodLabel}`, 18, currentY + 13.5);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`${purchasePlanningSummary.totalTargetWeeks} sem (~${purchasePlanningSummary.totalTargetMonths} meses)`, 18, currentY + 18.5);

      // Metric 2: Itens com D√©ficit
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('ITENS A COMPRAR', 66, currentY + 6.5);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(225, 29, 72); // rose-600
      doc.text(`${purchasePlanningSummary.totalItemsWithDeficit} de ${purchasePlanningSummary.totalAnalyzed} itens`, 66, currentY + 13.5);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Com necessidade de reposi√ß√£o', 66, currentY + 18.5);

      // Metric 3: Volume de Unidades
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('VOLUME F√çSICO TOTAL', 116, currentY + 6.5);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138); // blue-900
      doc.text(`${purchasePlanningSummary.totalUnitsToBuy.toLocaleString('pt-BR')} un`, 116, currentY + 13.5);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Quantidade total a adquirir', 116, currentY + 18.5);

      // Metric 4: Custo Financeiro Estimado
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('VALOR ESTIMADO GLOBAL', 160, currentY + 6.5);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129); // emerald-600
      doc.text(
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(purchasePlanningSummary.totalEstimatedFinancialCost),
        160,
        currentY + 13.5
      );
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Pre√ßos unit√°rios m√©dios', 160, currentY + 18.5);

      currentY += 26;

      // Table data
      const itemsToExport = planningOnlyWithDeficit 
        ? purchasePlanningSummary.allItems.filter(i => i.quantityToBuy > 0)
        : purchasePlanningSummary.allItems;

      if (itemsToExport.length === 0) {
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        doc.text('Nenhum item com necessidade de compra encontrado para os filtros selecionados.', 14, currentY + 10);
      } else {
        const tableData = itemsToExport.map((item, idx) => {
          const unit = item.unit_measure ? ` ${item.unit_measure}` : '';
          const weeklyStr = item.weeklyRate > 0 ? `${item.weeklyRate.toFixed(1)}` : '0.0';
          const duraStr = item.durationWeeks === 'infinite' ? '‚àû' : `${item.durationWeeks.toFixed(1)} sem`;
          const unitPriceStr = item.unitPrice > 0 ? item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';
          const totalCostStr = item.totalEstimatedCost > 0 ? item.totalEstimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';

          return [
            (idx + 1).toString(),
            item.name,
            item.category || 'Geral',
            `${item.currentStock}${unit}`,
            weeklyStr,
            duraStr,
            `${item.periodDemand}${unit}`,
            `${item.quantityToBuy}${unit}`,
            unitPriceStr,
            totalCostStr
          ];
        });

        autoTable(doc, {
          startY: currentY,
          head: [['N¬∫', 'Material / Insumo', 'Categoria', 'Estoque', 'Cons./Sem', 'Dura√ß√£o', 'Demanda', 'QTD A COMPRAR', 'Vlr. Unit. (R$)', 'Total Est. (R$)']],
          body: tableData,
          theme: 'striped',
          headStyles: {
            fillColor: [15, 23, 42], // Slate-900
            halign: 'center',
            fontSize: 7.5,
            fontStyle: 'bold'
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            1: { halign: 'left', cellWidth: 'auto' },
            2: { halign: 'left', cellWidth: 24 },
            3: { halign: 'center', cellWidth: 16 },
            4: { halign: 'center', cellWidth: 14 },
            5: { halign: 'center', cellWidth: 16 },
            6: { halign: 'center', cellWidth: 16 },
            7: { halign: 'center', cellWidth: 20, fontStyle: 'bold', textColor: [225, 29, 72] },
            8: { halign: 'right', cellWidth: 18 },
            9: { halign: 'right', cellWidth: 22, fontStyle: 'bold' }
          },
          styles: { fontSize: 7.5, cellPadding: 2 },
          didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 7) {
              data.cell.styles.textColor = [190, 18, 60];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        });

        // Add Signature / Dispatch Box
        let finalY = (doc as any).lastAutoTable.finalY + 14;
        if (finalY > pageHeight - 35) {
          doc.addPage();
          finalY = 25;
        }

        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('________________________________________________________', pageWidth / 2, finalY, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Respons√°vel pelo Planejamento de Compras / Almoxarifado', pageWidth / 2, finalY + 5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`Documento emitido automaticamente pelo Sistema de Gest√£o de Estoque ‚Ä¢ ${dateStr}`, pageWidth / 2, finalY + 9.5, { align: 'center' });
      }

      const dateFileStr = format(new Date(), 'dd-MM-yyyy');
      doc.save(`Planejamento_Compras_${purchasePlanningSummary.targetPeriodLabel.replace('/', '_')}_${dateFileStr}.pdf`);
      showToast("PDF de Planejamento de Compras gerado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao gerar PDF de compras:', error);
      showToast("Erro ao exportar PDF de Planejamento de Compras.", "error");
    }
  };

  const handleExportPurchasePlanningExcel = () => {
    try {
      const itemsToExport = planningOnlyWithDeficit
        ? purchasePlanningSummary.allItems.filter(i => i.quantityToBuy > 0)
        : purchasePlanningSummary.allItems;

      const excelData = itemsToExport.map((item, idx) => ({
        'N¬∫': idx + 1,
        'Item / Insumo': item.name,
        'Categoria': item.category || 'Geral',
        'Unidade': item.unit_measure || 'UN',
        'Estoque Atual (Saldo)': item.currentStock,
        'Consumo Semanal M√©dio': item.weeklyRate > 0 ? Number(item.weeklyRate.toFixed(2)) : 0,
        'Consumo Mensal M√©dio': item.monthlyRate > 0 ? Number(item.monthlyRate.toFixed(2)) : 0,
        'Dura√ß√£o do Estoque Atual (Semanas)': item.durationWeeks === 'infinite' ? '‚àû' : Number(item.durationWeeks.toFixed(1)),
        'Previs√£o de T√©rmino Atual': item.durationMonthInfo.monthYear,
        [`Demanda Prevista at√© ${purchasePlanningSummary.targetPeriodLabel}`]: item.periodDemand,
        'Estoque de Seguran√ßa': item.safetyStock,
        'Necessidade Total Per√≠odo': item.totalRequired,
        'QUANTIDADE A COMPRAR': item.quantityToBuy,
        'Pre√ßo Unit√°rio Estimado (R$)': item.unitPrice > 0 ? item.unitPrice : 0,
        'Custo Total Estimado (R$)': item.totalEstimatedCost > 0 ? item.totalEstimatedCost : 0,
        'Status': item.quantityToBuy > 0 ? 'COMPRA NECESS√ÅRIA' : 'ESTOQUE ATENDE AT√â O PER√çODO'
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Planejamento Compras");
      
      const dateFileStr = format(new Date(), 'dd-MM-yyyy');
      XLSX.writeFile(wb, `Planejamento_Compras_${purchasePlanningSummary.targetPeriodLabel.replace('/', '_')}_${dateFileStr}.xlsx`);
      showToast("Planilha de compras exportada com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar Excel de compras:', error);
      showToast("Erro ao exportar planilha Excel.", "error");
    }
  };

  const handleExportMaterialsCatalogPDF = () => {
    try {
      // @ts-ignore
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      
      const startY = drawPDFLetterhead(
        doc,
        'Cat√°logo de Materiais em Estoque',
        `Policl√≠nica de Sobral ‚Ä¢ Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`
      );
      
      // Filter unique items across all batches and locations
      const uniqueItems: Record<string, { name: string, category: string, supplier: string }> = {};
      
      items.filter(i => !i.deletedAt && i.quantity > 0).forEach(item => {
        if (!uniqueItems[item.name]) {
          uniqueItems[item.name] = {
            name: item.name,
            category: item.category || '---',
            supplier: item.supplier || '---'
          };
        }
      });
      
      const tableData = Object.values(uniqueItems)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(item => [
          item.name,
          item.category,
          item.supplier
        ]);
      
      // Generate table (NO Stock, NO Batch, NO Expiry)
      autoTable(doc, {
        startY: startY + 4,
        head: [['Material / Produto', 'Categoria', 'Fornecedor']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [28, 25, 23], halign: 'left' }, // #1C1917
        styles: { fontSize: 9, cellPadding: 3.5 },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 50 },
          2: { cellWidth: 50 }
        }
      });
      
      // Footer on every page
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(168, 162, 158);
        doc.text(
          `P√°gina ${i} de ${pageCount} - Cat√°logo gerado para consulta administrativa`,
          pageWidth / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }
      
      const dateStr = format(new Date(), 'dd-MM-yyyy');
      doc.save(`Catalogo_Materiais_${dateStr}.pdf`);
      showToast("Cat√°logo de materiais exportado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar cat√°logo:', error);
      showToast("Erro ao exportar cat√°logo de materiais.", "error");
    }
  };

  const handleExportRequestsPDF = () => {
    try {
      const doc = new jsPDF();
      
      const startY = drawPDFLetterhead(
        doc,
        'Relat√≥rio de Solicita√ß√µes de Materiais',
        `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`
      );
      
      // Determine which requests to export based on current tab
      let requestsToExport = [];
      if (activeTab === 'requests') {
        requestsToExport = requests.filter(req => !req.deletedAt && !req.isReturn);
      } else if (activeTab === 'admin-devolutions') {
        requestsToExport = requests.filter(req => !req.deletedAt && req.isReturn);
      } else if (activeTab === 'my-requests') {
        requestsToExport = requests.filter(r => r.sector === selectedSector && !r.deletedAt && !r.isReturn);
      } else if (activeTab === 'devolution') {
        requestsToExport = requests.filter(r => r.sector === selectedSector && !r.deletedAt && r.isReturn);
      } else {
        requestsToExport = requests.filter(req => !req.deletedAt);
      }
      
      // Sort by date descending
      requestsToExport.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Prepare data for table
      const tableData = requestsToExport.map(req => [
        `#${req.id.slice(-5).toUpperCase()}`,
        format(new Date(req.date), 'dd/MM/yyyy'),
        req.sector,
        req.status,
        allRequestItems.filter(ri => ri.request_id === req.id).length.toString()
      ]);
      
      // Generate table
      autoTable(doc, {
        startY: startY + 4,
        head: [['N¬∫', 'Data', 'Setor', 'Status', 'Itens']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [28, 25, 23], halign: 'center' }, // #1C1917
        columnStyles: {
          0: { halign: 'center' },
          1: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' }
        },
        styles: { fontSize: 9, cellPadding: 3 }
      });
      
      // Save PDF
      const fileName = `Solicitacoes_${format(new Date(), 'dd-MM-yyyy')}.pdf`;
      doc.save(fileName);
      showToast("PDF exportado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      showToast("Erro ao exportar PDF.", "error");
    }
  };

  useEffect(() => {
    if (showTransactionModal.show) {
      setTransactionQty(1);
      setDonationUnitName('');
      setDonationUnitAddress('');
      setDonationUnitCNPJ('');
      setDonationRevisionDate('');

      const isItemExpired = showTransactionModal.item ? isExpired(showTransactionModal.item) : false;
      
      if (showTransactionModal.type === 'exit' && isItemExpired && showTransactionModal.item) {
        setExitReason('vencido');
        setModalSector('Descarte/Vencimento (Desperd√≠cio)');
        const expDateStr = showTransactionModal.item.expiry_date && showTransactionModal.item.expiry_date !== 'Indeterminada'
          ? format(new Date(showTransactionModal.item.expiry_date), 'dd/MM/yyyy')
          : '';
        setExpiryReason(expDateStr 
          ? `Material com validade expirada em ${expDateStr}. Baixa por descarte/desperd√≠cio.` 
          : 'Material com validade expirada. Baixa por descarte/desperd√≠cio.');
        setBasket([{ item_id: showTransactionModal.item.id!, quantity: showTransactionModal.item.quantity || 1 }]);
      } else {
        setExitReason('consumo');
        setExpiryReason('');
        setBasket(showTransactionModal.item ? [{ item_id: showTransactionModal.item.id!, quantity: 1 }] : []);
        
        if (showTransactionModal.item) {
          setModalSector(showTransactionModal.item.location === 'Farm√°cia' ? 'Farm√°cia' : 'Almoxarifado');
        } else {
          setModalSector(userProfile?.sector || SECTORS[0]);
        }
      }
    }
  }, [showTransactionModal.show, showTransactionModal.item, showTransactionModal.type, userProfile?.sector]);

  const handleExportPCA = () => {
    if (selectedSector !== 'Almoxarifado') {
      showToast("Acesso restrito ao Almoxarifado.", "error");
      return;
    }
    try {
      const doc = new jsPDF();
      const start = startOfDay(parseISO(pcaRange.start));
      const end = endOfDay(parseISO(pcaRange.end));

      const consumptionTransactions = transactions.filter(t => {
        if (t.deletedAt) return false;
        if (t.type !== 'exit' || t.exitReason !== 'consumo') return false;
        const d = new Date(t.date);
        return d >= start && d <= end;
      });

      // Grouping by category
      const groupedData: Record<string, Record<string, { name: string, quantity: number, unit: string }>> = {};

      consumptionTransactions.forEach(t => {
        const item = items.find(i => i.id === t.item_id);
        const category = item?.category || 'Outros';
        
        if (pcaCategory !== 'all' && category !== pcaCategory) return;

        if (!groupedData[category]) {
          groupedData[category] = {};
        }

        const itemName = t.item_name;
        if (!groupedData[category][itemName]) {
          groupedData[category][itemName] = {
            name: itemName,
            quantity: 0,
            unit: item?.description || 'UN'
          };
        }
        groupedData[category][itemName].quantity += t.quantity;
      });

      // Logo/Header
      let currentY = 20;
      if (letterheadImage) {
        try {
          doc.addImage(letterheadImage, 'PNG', 14, currentY, 182, 25);
          currentY += 30;
        } catch (e) {
          currentY += 5;
        }
      }

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 25, 23);
      doc.text('Relat√≥rio PCA - Plano Anual de Contrata√ß√£o', 105, currentY, { align: 'center' });
      currentY += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text(`Per√≠odo de Consumo: ${format(start, 'dd/MM/yyyy')} at√© ${format(end, 'dd/MM/yyyy')}`, 105, currentY, { align: 'center' });
      currentY += 5;
      doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 105, currentY, { align: 'center' });
      currentY += 15;

      const categories = Object.keys(groupedData).sort();
      
      if (categories.length === 0) {
        doc.setFontSize(12);
        doc.text('Nenhum consumo registrado no per√≠odo selecionado.', 105, currentY + 20, { align: 'center' });
      } else {
        categories.forEach((category) => {
          const itemsInCategory = Object.values(groupedData[category]).sort((a, b) => a.name.localeCompare(b.name));
          
          const tableData = itemsInCategory.map(item => [
            item.name,
            `${item.quantity}`,
            item.unit
          ]);

          if (currentY > 230) {
            doc.addPage();
            currentY = 20;
          }

          // Category Header - Modern and Minimalist
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 64, 175); // Dark blue text
          doc.setFillColor(239, 246, 255); // Very light blue background
          doc.rect(14, currentY, 182, 10, 'F');
          
          // Thin border for header
          doc.setDrawColor(191, 219, 254);
          doc.rect(14, currentY, 182, 10, 'S');
          
          doc.text(category.toUpperCase(), 18, currentY + 7);
          currentY += 12;

          autoTable(doc, {
            startY: currentY,
            head: [['Material', 'Quantidade Total Consumida', 'Unidade']],
            body: tableData,
            theme: 'grid',
            headStyles: { 
              fillColor: [248, 250, 252], 
              textColor: [71, 85, 105], 
              fontSize: 9, 
              fontStyle: 'bold',
              lineWidth: 0.1,
              lineColor: [226, 232, 240]
            },
            bodyStyles: { 
              fontSize: 8, 
              textColor: [30, 41, 59],
              lineWidth: 0.1,
              lineColor: [241, 245, 249]
            },
            alternateRowStyles: {
              fillColor: [250, 250, 250]
            },
            margin: { left: 14, right: 14 },
            styles: {
              cellPadding: 3
            }
          });

          currentY = (doc as any).lastAutoTable.finalY + 15;
        });
      }

      doc.save(`Relatorio_PCA_${format(new Date(), 'dd_MM_yyyy')}.pdf`);
      showToast("Relat√≥rio PCA gerado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao gerar relat√≥rio PCA:', error);
      showToast("Erro ao gerar relat√≥rio PCA.", "error");
    }
  };

  const quantitativoReportData = useMemo(() => {
    if (quantitativoSource === 'sample') {
      return {
        months: ['Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
        monthColors: ['#1d4ed8', '#b91c1c', '#b45309', '#15803d', '#c2410c', '#0284c7'],
        sectors: [
          { name: 'ALMOXARIFADO', values: [10, 0, 0, 0, 0, 0], total: 10 },
          { name: 'CER', values: [11, 64, 19, 13, 27, 6], total: 140 },
          { name: 'CME', values: [4, 30, 0, 15, 4, 0], total: 53 },
          { name: 'ENVASE', values: [2, 0, 0, 5, 1, 1], total: 9 },
          { name: 'ESC. QUALIDADE', values: [80, 0, 0, 0, 0, 0], total: 80 },
          { name: 'HIGIENIZA√á√ÉO', values: [4, 0, 0, 1, 3, 0], total: 8 },
          { name: 'ILHA', values: [316, 178, 266, 310, 579, 200], total: 1849 },
          { name: 'IMAGEM', values: [351, 354, 131, 267, 505, 106], total: 1714 },
          { name: 'P√â DIAB√âTICO', values: [384, 476, 563, 548, 572, 552], total: 3095 },
          { name: 'RECEP√á√ÉO GERAL', values: [203, 0, 0, 0, 110, 17], total: 330 },
          { name: 'SINAIS VITAIS', values: [18, 8, 15, 8, 10, 9], total: 68 }
        ],
        title: quantitativoTitle,
        criticalAnalysis: quantitativoCriticalAnalysis
      };
    }

    let months: string[] = ['Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    let monthColors = ['#1d4ed8', '#b91c1c', '#b45309', '#15803d', '#c2410c', '#0284c7', '#7c3aed', '#db2777', '#059669'];
    
    let startDate: Date;
    let endDate: Date;

    if (quantitativoPeriodPreset === '1_semestre_2026') {
      startDate = new Date('2026-01-01T00:00:00');
      endDate = new Date('2026-06-30T23:59:59');
      months = ['Janeiro', 'Fevereiro', 'Mar√ßo', 'Abril', 'Maio', 'Junho'];
    } else if (quantitativoPeriodPreset === '2_semestre_2026') {
      startDate = new Date('2026-07-01T00:00:00');
      endDate = new Date('2026-12-31T23:59:59');
      months = ['Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    } else if (quantitativoPeriodPreset === 'ano_2026') {
      startDate = new Date('2026-01-01T00:00:00');
      endDate = new Date('2026-12-31T23:59:59');
      months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    } else {
      startDate = startOfDay(parseISO(quantitativoCustomStart));
      endDate = endOfDay(parseISO(quantitativoCustomEnd));
      months = ['Janeiro', 'Fevereiro', 'Mar√ßo', 'Abril', 'Maio', 'Junho'];
    }

    const sectorMap: Record<string, number[]> = {};

    SECTORS.forEach(sec => {
      sectorMap[sec.toUpperCase()] = new Array(months.length).fill(0);
    });

    const checkCategoryMatch = (itemCat: string | null | undefined, filterCat: string) => {
      if (!filterCat || filterCat === 'Todos' || filterCat.startsWith('Todos')) return true;
      if (!itemCat) return filterCat === 'Outros';

      const catLower = itemCat.toLowerCase().trim();
      const filterLower = filterCat.toLowerCase().trim();

      if (filterLower.includes('m√©dico') || filterLower.includes('medico') || filterLower.includes('hospitalar')) {
        return catLower.includes('m√©dico') || catLower.includes('medico') || catLower.includes('hospitalar');
      }
      if (filterLower.includes('medicamento')) {
        return catLower.includes('medicamento') || catLower.includes('f√°rmaco') || catLower.includes('farmaco');
      }
      if (filterLower.includes('aliment')) {
        return catLower.includes('aliment') || catLower.includes('copa') || catLower.includes('cozinha');
      }
      if (filterLower.includes('expediente')) {
        return catLower.includes('expediente') || catLower.includes('papelaria') || catLower.includes('escrit√≥rio') || catLower.includes('escritorio');
      }
      if (filterLower.includes('higiene') || filterLower.includes('limpeza')) {
        return catLower.includes('higiene') || catLower.includes('limpeza') || catLower.includes('saneante');
      }
      if (filterLower.includes('odont')) {
        return catLower.includes('odont');
      }
      if (filterLower.includes('epi')) {
        return catLower.includes('epi') || catLower.includes('seguran√ßa') || catLower.includes('seguranca');
      }
      if (filterLower.includes('inform√°t') || filterLower.includes('informat') || filterLower.includes('ti')) {
        return catLower.includes('inform√°t') || catLower.includes('informat') || catLower.includes('ti');
      }

      return catLower.includes(filterLower) || filterLower.includes(catLower);
    };

    transactions.forEach(t => {
      if (t.deletedAt) return;
      if (t.type !== 'exit') return;
      const tDate = new Date(t.date);
      if (tDate < startDate || tDate > endDate) return;

      const item = items.find(i => i.id === t.item_id);
      if (!checkCategoryMatch(item?.category, quantitativoCategory)) return;

      const secName = (t.sector || 'Outros').toUpperCase();
      if (!sectorMap[secName]) {
        sectorMap[secName] = new Array(months.length).fill(0);
      }

      let monthIdx = 0;
      if (months.length === 6) {
        monthIdx = tDate.getMonth() % 6;
      } else {
        monthIdx = tDate.getMonth();
      }
      if (monthIdx >= 0 && monthIdx < months.length) {
        sectorMap[secName][monthIdx] += t.quantity;
      }
    });

    requests.forEach(r => {
      if (r.status !== 'ENTREGUE') return;
      const rDate = new Date(r.deliveredAt || r.date);
      if (rDate < startDate || rDate > endDate) return;

      const secName = (r.sector || 'OUTROS').toUpperCase();
      if (!sectorMap[secName]) {
        sectorMap[secName] = new Array(months.length).fill(0);
      }

      let monthIdx = 0;
      if (months.length === 6) {
        monthIdx = rDate.getMonth() % 6;
      } else {
        monthIdx = rDate.getMonth();
      }

      const rItems = allRequestItems.filter(ri => {
        if (ri.request_id !== r.id) return false;
        if (quantitativoCategory === 'Todos') return true;
        const item = items.find(i => i.id === ri.product_id);
        return checkCategoryMatch(item?.category, quantitativoCategory);
      });

      const totalQty = rItems.reduce((acc, curr) => acc + (curr.quantity_approved || curr.quantity_requested || 0), 0);
      if (monthIdx >= 0 && monthIdx < months.length) {
        sectorMap[secName][monthIdx] += totalQty;
      }
    });

    const sectors = Object.keys(sectorMap)
      .map(name => {
        const values = sectorMap[name];
        const total = values.reduce((a, b) => a + b, 0);
        return { name, values, total };
      })
      .filter(s => quantitativoSource === 'system' ? true : s.total > 0)
      .sort((a, b) => b.total - a.total);

    const activeSectors = sectors.filter(s => s.total > 0);
    const finalSectors = activeSectors.length > 0 
      ? activeSectors 
      : (quantitativoSource === 'system' 
        ? SECTORS.slice(0, 6).map(sec => ({ name: sec.toUpperCase(), values: new Array(months.length).fill(0), total: 0 }))
        : [
          { name: 'P√â DIAB√âTICO', values: [384, 476, 563, 548, 572, 552], total: 3095 },
          { name: 'ILHA', values: [316, 178, 266, 310, 579, 200], total: 1849 },
          { name: 'IMAGEM', values: [351, 354, 131, 267, 505, 106], total: 1714 }
        ]);

    const activeSectorsForAnalysis = finalSectors.filter(s => s.total > 0);

    let periodText = 'no per√≠odo analisado';
    if (quantitativoPeriodPreset === '1_semestre_2026') periodText = 'no 1¬∫ semestre de 2026';
    else if (quantitativoPeriodPreset === '2_semestre_2026') periodText = 'no 2¬∫ semestre de 2026';
    else if (quantitativoPeriodPreset === 'ano_2026') periodText = 'no ano de 2026 (total)';

    const catLabel = quantitativoCategory === 'Todos' ? 'materiais e insumos em geral' : `materiais da categoria ${quantitativoCategory.toUpperCase()}`;

    let autoAnalysis = '';
    if (activeSectorsForAnalysis.length > 0) {
      const top1 = activeSectorsForAnalysis[0];
      const top2 = activeSectorsForAnalysis[1];
      const grandTotal = activeSectorsForAnalysis.reduce((acc, s) => acc + s.total, 0);

      const monthTotals = months.map((_, idx) => activeSectorsForAnalysis.reduce((sum, sec) => sum + (sec.values[idx] || 0), 0));
      const maxMonthIdx = monthTotals.indexOf(Math.max(...monthTotals));
      const maxMonthName = months[maxMonthIdx] || 'm√™s de pico';

      let sector2Text = '';
      if (top2 && top2.total > 0) {
        sector2Text = ` Em SEGUNDO LUGAR, destaca-se o setor de ${top2.name}, acumulando ${top2.total.toLocaleString('pt-BR')} unidades (${((top2.total / grandTotal) * 100).toFixed(1)}% do total).`;
      }

      autoAnalysis = `Verificou-se que, ${periodText}, o volume total de dispensa√ß√£o para ${catLabel} foi de ${grandTotal.toLocaleString('pt-BR')} unidades. O setor com MAIOR DEMANDA foi o de ${top1.name}, apresentando ${top1.total.toLocaleString('pt-BR')} unidades dispensadas (${((top1.total / grandTotal) * 100).toFixed(1)}% do consumo total).${sector2Text} Observou-se o maior pico de dispensa√ß√µes no m√™s de ${maxMonthName}. Os dados registrados pelo sistema indicam maior concentra√ß√£o assistencial nesses setores e auxiliam no planejamento das compras e estoques do almoxarifado.`;
    } else {
      autoAnalysis = `Verificou-se que, ${periodText}, n√£o foram registradas movimenta√ß√µes de sa√≠da ou solicita√ß√µes entregues para ${catLabel} no sistema. Os controles de estoque do almoxarifado permanecem monitorando o fluxo de demandas.`;
    }

    return {
      months,
      monthColors,
      sectors: finalSectors,
      title: quantitativoTitle || (quantitativoCategory === 'Todos' ? 'QUANTITATIVO GERAL DE MATERIAIS DISPENSADOS PARA OS SETORES DA POLICL√çNICA' : `QUANTITATIVO DE ${quantitativoCategory.toUpperCase()} DISPENSADOS PARA OS SETORES DA POLICL√çNICA`),
      criticalAnalysis: quantitativoCriticalAnalysis.trim() !== '' ? quantitativoCriticalAnalysis : autoAnalysis
    };
  }, [quantitativoSource, quantitativoPeriodPreset, quantitativoCustomStart, quantitativoCustomEnd, quantitativoCategory, quantitativoTitle, quantitativoCriticalAnalysis, transactions, requests, allRequestItems, items]);

  const handleExportQuantitativoPDF = async () => {
    if (!quantitativoReportRef.current) return;
    try {
      showToast("Gerando PDF oficial do relat√≥rio...", "info");
      const element = quantitativoReportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // Hide all UI buttons, tooltips, and edit controls in the cloned document
          const pdfHideElements = clonedDoc.querySelectorAll('[data-pdf-hide="true"], button');
          pdfHideElements.forEach((el) => {
            (el as HTMLElement).style.display = 'none';
          });

          // Accurate OKLCH to RGB converter for html2canvas compatibility
          const oklchToRgb = (oklchStr: string): string => {
            try {
              const match = oklchStr.match(/oklch\(\s*([\d.%]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)/i);
              if (!match) return '#ffffff';

              let L = parseFloat(match[1]);
              if (match[1].endsWith('%')) L /= 100;
              const C = parseFloat(match[2]);
              const H = parseFloat(match[3]);
              let A = match[4] ? parseFloat(match[4]) : 1;
              if (match[4] && match[4].endsWith('%')) A /= 100;

              const hRad = (H * Math.PI) / 180;
              const a = C * Math.cos(hRad);
              const b = C * Math.sin(hRad);

              const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
              const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
              const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

              const l = l_ ** 3;
              const m = m_ ** 3;
              const s = s_ ** 3;

              let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
              let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
              let blue = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

              const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * (Math.max(0, x) ** (1 / 2.4)) - 0.055);
              r = Math.min(255, Math.max(0, Math.round(gamma(r) * 255)));
              g = Math.min(255, Math.max(0, Math.round(gamma(g) * 255)));
              blue = Math.min(255, Math.max(0, Math.round(gamma(blue) * 255)));

              if (A < 1) {
                return `rgba(${r}, ${g}, ${blue}, ${A})`;
              }
              return `rgb(${r}, ${g}, ${blue})`;
            } catch {
              return '#ffffff';
            }
          };

          const fixStylesString = (str: string) => {
            return str
              .replace(/oklch\([^)]+\)/gi, (match) => oklchToRgb(match))
              .replace(/color-mix\([^)]+\)/gi, 'rgba(226, 232, 240, 0.8)');
          };

          // Convert oklch in <style> tags to valid rgb(...) colors so html2canvas doesn't fail or corrupt CSS variables
          const styleElements = clonedDoc.querySelectorAll('style');
          styleElements.forEach((style) => {
            if (style.textContent && (style.textContent.includes('oklch') || style.textContent.includes('color-mix'))) {
              style.textContent = fixStylesString(style.textContent);
            }
          });

          // Convert inline style attributes in cloned elements
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            const styleAttr = htmlEl.getAttribute('style');
            if (styleAttr && (styleAttr.includes('oklch') || styleAttr.includes('color-mix'))) {
              htmlEl.setAttribute('style', fixStylesString(styleAttr));
            }
          });
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 10;
      const imgWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, pdfHeight - margin * 2));
      pdf.save(`Quantitativo_Insumos_Setores_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
      showToast("PDF oficial gerado e baixado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      showToast("Erro ao gerar PDF. Tente usar a fun√ß√£o de impress√£o.", "error");
    }
  };

  const handleExportQuantitativoExcel = () => {
    const dataToExport = quantitativoReportData.sectors.map(s => {
      const row: Record<string, any> = { 'Setor': s.name };
      quantitativoReportData.months.forEach((m, idx) => {
        row[m] = s.values[idx] || 0;
      });
      row['Total Geral'] = s.total;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quantitativo por Setor");
    XLSX.writeFile(wb, `Quantitativo_Setores_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    showToast("Planilha Excel exportada com sucesso!", "success");
  };

  const handleExportRoomInventoryPDF = (roomFilter: string, displayRoomName: string, filteredCategories: string[]) => {
    try {
      // @ts-ignore - jsPDF types might not be perfectly aligned with imports
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      
      // Header
      doc.setDrawColor(37, 99, 235); // blue-600
      doc.setLineWidth(1.5);
      doc.line(14, 15, 24, 15);
      doc.line(19, 10, 19, 20);
      
      doc.setFontSize(16);
      doc.setTextColor(28, 25, 23);
      doc.setFont('helvetica', 'bold');
      doc.text('POLICL√çNICA', 28, 17);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text('CONTROLE DE ESTOQUE POR SALA', 28, 22);

      doc.setDrawColor(231, 229, 228);
      doc.setLineWidth(0.5);
      doc.line(14, 28, pageWidth - 14, 28);
      
      doc.setFontSize(14);
      doc.setTextColor(28, 25, 23);
      doc.setFont('helvetica', 'bold');
      doc.text(`Mapa de Estoque - ${displayRoomName}`, 14, 40);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text(`Local F√≠sico Origem: ${roomFilter}`, 14, 46);
      doc.text(`Emitido em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 52);

      // Filter items by room and categories
      const roomItems = items.filter(i => {
        // Ignorar exclu√≠dos ou sem estoque
        if (i.deletedAt || i.quantity <= 0) return false;
        
        // Normaliza√ß√£o para compara√ß√£o robusta
        const itemRoom = (i.room || 'Almoxarifado Principal').trim().toLowerCase();
        const targetRoom = roomFilter.trim().toLowerCase();
        
        const matchesRoom = itemRoom === targetRoom;
        
        // Se nenhuma categoria selecionada, mostra tudo da sala. Se selecionadas, filtra.
        const matchesCategory = filteredCategories.length === 0 || 
                               (i.category && filteredCategories.some(cat => 
                                 cat.trim().toLowerCase() === i.category?.trim().toLowerCase()
                               ));
        
        return matchesRoom && matchesCategory;
      }).sort((a, b) => a.name.localeCompare(b.name));

      if (roomItems.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text('NENHUM ITEM ENCONTRADO PARA OS FILTROS SELECIONADOS.', 14, 70);
      } else {
        const tableData = roomItems.map(item => {
          const daysToExpiry = item.expiry_date && item.expiry_date !== 'Indeterminada' 
            ? differenceInDays(new Date(item.expiry_date), new Date()) 
            : null;
            
          let expiryStatus = '-';
          if (daysToExpiry !== null) {
            if (daysToExpiry < 0) expiryStatus = 'VENCIDO';
            else if (daysToExpiry <= 30) expiryStatus = 'CR√çTICO';
            else expiryStatus = `${daysToExpiry} dias`;
          } else if (item.expiry_date === 'Indeterminada') {
            expiryStatus = 'Indeterminada';
          }

          return [
            item.name,
            item.batch_number || '-',
            item.category || '-',
            { content: item.quantity.toString(), styles: { fontStyle: 'bold' as any, halign: 'center' as any } },
            item.expiry_date || '-',
            { content: expiryStatus, styles: { halign: 'center' as any } }
          ];
        });

        autoTable(doc, {
          startY: 60,
          head: [['Produto', 'Lote', 'Categoria', 'Estoque', 'Validade', 'Status (Dias)']],
          body: tableData,
          theme: 'striped',
          headStyles: { 
            fillColor: [28, 25, 23],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center'
          },
          styles: { fontSize: 8, cellPadding: 2.5 },
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 25 },
            2: { cellWidth: 35 },
            3: { cellWidth: 20 },
            4: { cellWidth: 25 },
            5: { cellWidth: 30 }
          },
          margin: { horizontal: 14 }
        });
      }
      
      const safeRoomName = displayRoomName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-');
      doc.save(`mapa-sala-${safeRoomName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      showToast("Documento de porta gerado com sucesso!", "success");
    } catch (error) {
      console.error("PDF Error:", error);
      showToast("Erro ao gerar PDF", "error");
    }
  };

  const getImageDataURL = async (url: string): Promise<string> => {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      
      if (blob.size < 500) {
        throw new Error(`Imagem muito pequena: ${blob.size} bytes`);
      }

      // Converte para JPEG via Canvas para evitar erros de signature no jsPDF
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const timeout = setTimeout(() => {
          reject(new Error("Timeout carregando imagem"));
        }, 8000);

        img.onload = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error("Erro ao criar contexto de canvas"));
              return;
            }
            // Fundo branco para imagens transparentes
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            // For√ßamos o formato JPEG com qualidade alta
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            resolve(dataUrl);
            URL.revokeObjectURL(img.src);
          } catch (e) {
            reject(e);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          // Se o Canvas falhar, tenta FileReader direto como √∫ltimo recurso
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Erro ao processar imagem"));
          reader.readAsDataURL(blob);
          URL.revokeObjectURL(img.src);
        };

        img.src = URL.createObjectURL(blob);
      });
    } catch (err) {
      console.error(`[PDF] Erro em getImageDataURL (${url}):`, err);
      throw err;
    }
  };

  const handleExportDonationTermPDF = async (data: {
    donatingUnitName?: string | null;
    receivingUnit: { name: string; address?: string | null; cnpj?: string | null };
    items: { product_name: string; quantity: number; batch_number?: string | null; expiry_date?: string | null }[];
    revisionDate?: string | null;
    donationNumber?: string | null;
    date: string;
  }) => {
    try {
      showToast("Gerando Termo de Doa√ß√£o...", "info");

      let base64Image = letterheadImage || "";
      
      // Se n√£o houver imagem personalizada, tenta carregar a padr√£o
      if (!base64Image) {
        try {
          base64Image = await getImageDataURL("/official_letterhead.svg");
        } catch (err) {
          console.warn("Could not load logo image for Donation Term, using fallback text header:", err);
        }
      }
      
      // @ts-ignore
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 20;

      const drawLetterhead = (pdfDoc: any) => {
        if (base64Image) {
          try {
            console.log("[PDF] Desenhando imagem de papel timbrado no Termo de Doa√ß√£o");
            const format = base64Image.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(base64Image, format, 0, 0, pageWidth, pageHeight, undefined, 'FAST');
            return;
          } catch (e) {
            console.error("Error adding letterhead image to Donation Term:", e);
          }
        }
        
        console.log("[PDF] Usando cabe√ßalho padr√£o com 3 logos retangulares expandidos no Termo de Doa√ß√£o");
        const docLogo = appRectangularLogo || appLogo;
        const logoWidth = 50;
        const logoHeight = 16;
        const logoY = 10;
        
        // 1. LOGO ALMOXARIFADO (Left - Rectangular)
        if (docLogo) {
          try {
            const format = docLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(docLogo, format, margin, logoY, logoWidth, logoHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding docLogo to Donation Term:", e);
          }
        } else {
          pdfDoc.setFillColor(240, 253, 244);
          pdfDoc.roundedRect(margin, logoY, logoWidth, logoHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(22, 101, 52);
          pdfDoc.text('ALMOXARIFADO', margin + (logoWidth / 2), logoY + 10, { align: 'center' });
        }

        // 2. LOGO POLICL√çNICA (Center - Rectangular)
        const centerX = (pageWidth / 2) - (logoWidth / 2);
        if (policlinicaLogo) {
          try {
            const format = policlinicaLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(policlinicaLogo, format, centerX, logoY, logoWidth, logoHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding policlinicaLogo to Donation Term:", e);
          }
        } else {
          pdfDoc.setFillColor(240, 249, 255);
          pdfDoc.roundedRect(centerX, logoY, logoWidth, logoHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(3, 105, 161);
          pdfDoc.text('POLICL√çNICA DE SOBRAL', centerX + (logoWidth / 2), logoY + 10, { align: 'center' });
        }

        // 3. LOGO CONS√ìRCIO CPSMS (Right - Rectangular)
        const consorcioWidth = 56;
        const consorcioHeight = 18;
        const consorcioY = 9;
        const rightX = pageWidth - margin - consorcioWidth;
        if (consorcioLogo) {
          try {
            const format = consorcioLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(consorcioLogo, format, rightX, consorcioY, consorcioWidth, consorcioHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding consorcioLogo to Donation Term:", e);
          }
        } else {
          pdfDoc.setFillColor(255, 247, 237);
          pdfDoc.roundedRect(rightX, consorcioY, consorcioWidth, consorcioHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(194, 65, 12);
          pdfDoc.text('CONS√ìRCIO CPSMS', rightX + (consorcioWidth / 2), consorcioY + 11, { align: 'center' });
        }

        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.setLineWidth(0.5);
        pdfDoc.line(margin, 29, pageWidth - margin, 29);

        // Footer
        pdfDoc.setFontSize(7.5);
        pdfDoc.setTextColor(120, 113, 108);
        pdfDoc.setFont('helvetica', 'normal');
        const footer1 = 'Policl√≠nica de Sobral. Av. Monsenhor Alo√≠sio Pinto, 481, CEP 62050-255, Sobral-CE';
        const footer2 = 'Fone: (88) 3614-3156 | Fax: (88) 3614-3245 | cpsms.ce.gov.br';
        pdfDoc.text(footer1, pageWidth / 2, pageHeight - 12, { align: 'center' });
        pdfDoc.text(footer2, pageWidth / 2, pageHeight - 8, { align: 'center' });
      };

      const formatTitleCase = (str: string) => {
        if (!str) return '';
        const lower = str.toLowerCase();
        const minorWords = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para'];
        return lower.split(' ').map((word, index) => {
          if (index > 0 && minorWords.includes(word)) return word;
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
      };

      const donorName = formatTitleCase(data.donatingUnitName || 'Policl√≠nica de Sobral');
      const receivingName = formatTitleCase(data.receivingUnit.name);
      const receivingAddress = data.receivingUnit.address;
      const receivingCNPJ = data.receivingUnit.cnpj;

      drawLetterhead(doc);

      // --- TITLE & DATA DE EMISS√ÉO BELOW LOGOS ---
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text('TERMO DE DOA√á√ÉO DE MATERIAIS E INSUMOS', pageWidth / 2, 35, { align: 'center' });
      
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Data de Emiss√£o: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 40, { align: 'center' });

      // --- DOCUMENT METADATA RIGHT-ALIGNED ---
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text('C√≥digo: TERMO-ALMOX', pageWidth - margin, 46, { align: 'right' });
      doc.text(`Data de Implanta√ß√£o: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, 50, { align: 'right' });
      doc.text(`√öltima Revis√£o: ${data.revisionDate || '---'}`, pageWidth - margin, 54, { align: 'right' });
      
      if (data.donationNumber) {
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        doc.setFont('helvetica', 'bold');
        doc.text(`Termo n¬∫: ${data.donationNumber}`, pageWidth - margin, 59, { align: 'right' });
      }

      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.2);
      doc.line(margin, 63, pageWidth - margin, 63);

      // --- CONTENT ---
      doc.setFontSize(10);
      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'normal');
      
      const donationText = `A ${donorName}, inscrita sob o CNPJ n¬∫ 12.208.466/0001-66, por interm√©dio de seu Setor de Almoxarifado, formaliza por este instrumento a doa√ß√£o √† unidade ${receivingName}, situada em ${receivingAddress}, inscrita sob o CNPJ n¬∫ ${receivingCNPJ}, dos materiais e insumos abaixo discriminados. A presente cess√£o justifica-se pela otimiza√ß√£o de estoque em virtude da redu√ß√£o de demanda interna e proximidade do prazo de validade, assegurando a destina√ß√£o √∫til dos itens.`;
      
      const textWidth = pageWidth - (margin * 2);
      const textLines = doc.splitTextToSize(donationText, textWidth);
      doc.text(textLines, margin, 72, { 
        align: 'justify', 
        maxWidth: textWidth,
        lineHeightFactor: 1.5 
      });

      const tableStartY = 85 + (textLines.length * 7) + 5;

      autoTable(doc, {
        startY: tableStartY,
        margin: { left: margin, right: margin },
        head: [['Descri√ß√£o do Material', 'Qtd Doada', 'Confer√™ncia']],
        body: data.items.map(i => [i.product_name, i.quantity.toString(), ' ']),
        theme: 'grid',
        headStyles: { 
          fillColor: [243, 244, 246], 
          textColor: [31, 41, 55],
          fontStyle: 'bold',
          halign: 'left',
          fontSize: 9,
          lineWidth: 0.1,
          lineColor: [209, 213, 219]
        },
        styles: { 
          fontSize: 8, 
          cellPadding: 4,
          lineColor: [209, 213, 219],
          lineWidth: 0.1,
          textColor: [55, 65, 81]
        },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 40, halign: 'center' }
        },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            drawLetterhead(doc);
          }
        }
      });

      const tableFinalY = (doc as any).lastAutoTable.finalY;
      let signAreaY = tableFinalY + 15;

      if (signAreaY + 50 > pageHeight - 20) {
        doc.addPage();
        signAreaY = 40;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(31, 41, 55);
      const formattedDate = format(new Date(data.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      doc.text(`Sobral-CE, ${formattedDate}.`, pageWidth / 2, signAreaY, { align: 'center' });

      const signY = signAreaY + 25;
      doc.setDrawColor(156, 163, 175);
      doc.setLineWidth(0.5);
      const signLineW = 75;
      
      doc.line(margin, signY, margin + signLineW, signY);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(donorName, margin + (signLineW / 2), signY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text('Unidade Doadora', margin + (signLineW / 2), signY + 10, { align: 'center' });
      doc.text('(assinatura e carimbo)', margin + (signLineW / 2), signY + 14, { align: 'center' });
      
      doc.line(pageWidth - margin - signLineW, signY, pageWidth - margin, signY);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(receivingName, pageWidth - margin - (signLineW / 2), signY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text('Unidade Receptora', pageWidth - margin - (signLineW / 2), signY + 10, { align: 'center' });
      doc.text('(assinatura e carimbo)', pageWidth - margin - (signLineW / 2), signY + 14, { align: 'center' });

      doc.save(`Termo_Doacao_${data.receivingUnit.name.replace(/\s+/g, '_')}_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
      showToast("Termo de Doa√ß√£o gerado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar PDF de Doa√ß√£o:', error);
      alert('Ocorreu um erro ao gerar o Termo de Doa√ß√£o.');
    }
  };

  const drawPDFLetterhead = (doc: any, title?: string, subtitle?: string): number => {
    const pageWidth = doc.internal.pageSize.width;
    let startY = 14;

    if (letterheadImage) {
      try {
        const format = letterheadImage.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(letterheadImage, format, 14, 8, pageWidth - 28, 28, undefined, 'FAST');
        startY = 40;
      } catch (e) {
        console.warn("Could not render letterheadImage on PDF report:", e);
      }
    } else {
      // Perfectly aligned 3-logo horizontal header row (homogeneous rectangular logos)
      const docLogo = appRectangularLogo || appLogo;
      const logoWidth = 50;
      const logoHeight = 16;
      const logoY = 10;
      
      // 1. LEFT LOGO: Logo Almoxarifado / Sistema (Rectangular)
      if (docLogo) {
        try {
          const format = docLogo.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(docLogo, format, 14, logoY, logoWidth, logoHeight, undefined, 'FAST');
        } catch (e) {
          console.warn("Could not render logo on PDF report:", e);
        }
      } else {
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(14, logoY, logoWidth, logoHeight, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 101, 52);
        doc.text('ALMOXARIFADO', 14 + (logoWidth / 2), logoY + 10, { align: 'center' });
      }

      // 2. CENTER LOGO: Logo da Policl√≠nica (Rectangular)
      const centerX = (pageWidth / 2) - (logoWidth / 2);
      if (policlinicaLogo) {
        try {
          const format = policlinicaLogo.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(policlinicaLogo, format, centerX, logoY, logoWidth, logoHeight, undefined, 'FAST');
        } catch (e) {
          console.warn("Could not render policlinicaLogo on PDF:", e);
        }
      } else {
        doc.setFillColor(240, 249, 255);
        doc.roundedRect(centerX, logoY, logoWidth, logoHeight, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(3, 105, 161);
        doc.text('POLICL√çNICA DE SOBRAL', centerX + (logoWidth / 2), logoY + 10, { align: 'center' });
      }

      // 3. RIGHT LOGO: Logo do Cons√≥rcio CPSMS (Rectangular)
      const consorcioWidth = 56;
      const consorcioHeight = 18;
      const consorcioY = 9;
      const rightX = pageWidth - 14 - consorcioWidth;
      if (consorcioLogo) {
        try {
          const format = consorcioLogo.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(consorcioLogo, format, rightX, consorcioY, consorcioWidth, consorcioHeight, undefined, 'FAST');
        } catch (e) {
          console.warn("Could not render consorcioLogo on PDF:", e);
        }
      } else {
        doc.setFillColor(255, 247, 237);
        doc.roundedRect(rightX, consorcioY, consorcioWidth, consorcioHeight, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(194, 65, 12);
        doc.text('CONS√ìRCIO CPSMS', rightX + (consorcioWidth / 2), consorcioY + 11, { align: 'center' });
      }

      // Divider Line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(14, 29, pageWidth - 14, 29);

      startY = 35;
    }

    if (title) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 25, 23);
      doc.text(title, pageWidth / 2, startY, { align: 'center' });
      startY += 5;
    }

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Data de Emiss√£o: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, startY, { align: 'center' });
    startY += 7;

    if (subtitle) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text(subtitle, pageWidth / 2, startY, { align: 'center' });
      startY += 7;
    }

    return startY;
  };

  const [appLogo, setAppLogo] = useState<string | null>(null);
  const [appRectangularLogo, setAppRectangularLogo] = useState<string | null>(null);
  const [policlinicaLogo, setPoliclinicaLogo] = useState<string | null>(null);
  const [consorcioLogo, setConsorcioLogo] = useState<string | null>(null);

  // Load app logo & letterhead from localStorage & Firestore on mount
  useEffect(() => {
    const savedLogo = localStorage.getItem('app_logo_base64');
    if (savedLogo) setAppLogo(savedLogo);

    const savedRectLogo = localStorage.getItem('app_rectangular_logo_base64');
    if (savedRectLogo) setAppRectangularLogo(savedRectLogo);

    const savedPoliLogo = localStorage.getItem('policlinica_logo_base64');
    if (savedPoliLogo) setPoliclinicaLogo(savedPoliLogo);

    const savedConsLogo = localStorage.getItem('consorcio_logo_base64');
    if (savedConsLogo) setConsorcioLogo(savedConsLogo);

    const savedLetterhead = localStorage.getItem('letterhead_image_base64');
    if (savedLetterhead) setLetterheadImage(savedLetterhead);

    const unsubscribe = onSnapshot(doc(db, 'settings', 'general'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.appLogo) {
          setAppLogo(data.appLogo);
          localStorage.setItem('app_logo_base64', data.appLogo);
        } else {
          setAppLogo(null);
          localStorage.removeItem('app_logo_base64');
        }

        if (data.appRectangularLogo) {
          setAppRectangularLogo(data.appRectangularLogo);
          localStorage.setItem('app_rectangular_logo_base64', data.appRectangularLogo);
        } else {
          setAppRectangularLogo(null);
          localStorage.removeItem('app_rectangular_logo_base64');
        }

        if (data.policlinicaLogo) {
          setPoliclinicaLogo(data.policlinicaLogo);
          localStorage.setItem('policlinica_logo_base64', data.policlinicaLogo);
        } else {
          setPoliclinicaLogo(null);
          localStorage.removeItem('policlinica_logo_base64');
        }

        if (data.consorcioLogo) {
          setConsorcioLogo(data.consorcioLogo);
          localStorage.setItem('consorcio_logo_base64', data.consorcioLogo);
        } else {
          setConsorcioLogo(null);
          localStorage.removeItem('consorcio_logo_base64');
        }

        if (data.letterheadImage) {
          setLetterheadImage(data.letterheadImage);
          localStorage.setItem('letterhead_image_base64', data.letterheadImage);
        } else {
          setLetterheadImage(null);
          localStorage.removeItem('letterhead_image_base64');
        }
      }
    }, (err) => {
      console.warn("Could not listen to settings/general:", err);
    });

    return () => unsubscribe();
  }, []);

  const handleLetterheadUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      showToast("Imagem muito grande. M√°ximo 5MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setLetterheadImage(base64);
      localStorage.setItem('letterhead_image_base64', base64);
      try {
        await setDoc(doc(db, 'settings', 'general'), { letterheadImage: base64 }, { merge: true });
        showToast("Papel timbrado atualizado e salvo com sucesso!", "success");
      } catch (err) {
        console.error("Erro ao salvar papel timbrado no Firestore:", err);
        showToast("Papel timbrado atualizado!", "success");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLetterhead = async () => {
    setLetterheadImage(null);
    localStorage.removeItem('letterhead_image_base64');
    try {
      await setDoc(doc(db, 'settings', 'general'), { letterheadImage: deleteField() }, { merge: true });
      showToast("Papel timbrado removido com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao remover papel timbrado do Firestore:", err);
      showToast("Papel timbrado removido!", "success");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("Imagem muito grande. M√°ximo 2MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setAppLogo(base64);
        localStorage.setItem('app_logo_base64', base64);
        try {
          await setDoc(doc(db, 'settings', 'general'), { appLogo: base64 }, { merge: true });
          showToast("Logo quadrada do sistema atualizada com sucesso!", "success");
        } catch (err) {
          console.error("Erro ao salvar no Firestore:", err);
          showToast("Logo atualizada!", "success");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = async () => {
    setAppLogo(null);
    localStorage.removeItem('app_logo_base64');
    try {
      await setDoc(doc(db, 'settings', 'general'), { appLogo: deleteField() }, { merge: true });
      showToast("Logo quadrada removida com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao remover logo do Firestore:", err);
      showToast("Logo removida!", "success");
    }
  };

  const handleRectangularLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("Imagem muito grande. M√°ximo 2MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setAppRectangularLogo(base64);
        localStorage.setItem('app_rectangular_logo_base64', base64);
        try {
          await setDoc(doc(db, 'settings', 'general'), { appRectangularLogo: base64 }, { merge: true });
          showToast("Logo retangular atualizada com sucesso!", "success");
        } catch (err) {
          console.error("Erro ao salvar no Firestore:", err);
          showToast("Logo retangular atualizada!", "success");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveRectangularLogo = async () => {
    setAppRectangularLogo(null);
    localStorage.removeItem('app_rectangular_logo_base64');
    try {
      await setDoc(doc(db, 'settings', 'general'), { appRectangularLogo: deleteField() }, { merge: true });
      showToast("Logo retangular removida com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao remover logo retangular do Firestore:", err);
      showToast("Logo retangular removida!", "success");
    }
  };

  const handlePoliclinicaLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("Imagem muito grande. M√°ximo 2MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setPoliclinicaLogo(base64);
        localStorage.setItem('policlinica_logo_base64', base64);
        try {
          await setDoc(doc(db, 'settings', 'general'), { policlinicaLogo: base64 }, { merge: true });
          showToast("Logo da Policl√≠nica atualizada com sucesso!", "success");
        } catch (err) {
          console.error("Erro ao salvar no Firestore:", err);
          showToast("Logo da Policl√≠nica atualizada!", "success");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePoliclinicaLogo = async () => {
    setPoliclinicaLogo(null);
    localStorage.removeItem('policlinica_logo_base64');
    try {
      await setDoc(doc(db, 'settings', 'general'), { policlinicaLogo: deleteField() }, { merge: true });
      showToast("Logo da Policl√≠nica removida com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao remover logo da Policl√≠nica do Firestore:", err);
      showToast("Logo da Policl√≠nica removida!", "success");
    }
  };

  const handleConsorcioLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("Imagem muito grande. M√°ximo 2MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setConsorcioLogo(base64);
        localStorage.setItem('consorcio_logo_base64', base64);
        try {
          await setDoc(doc(db, 'settings', 'general'), { consorcioLogo: base64 }, { merge: true });
          showToast("Logo do Cons√≥rcio CPSMS atualizada com sucesso!", "success");
        } catch (err) {
          console.error("Erro ao salvar no Firestore:", err);
          showToast("Logo do Cons√≥rcio atualizada!", "success");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveConsorcioLogo = async () => {
    setConsorcioLogo(null);
    localStorage.removeItem('consorcio_logo_base64');
    try {
      await setDoc(doc(db, 'settings', 'general'), { consorcioLogo: deleteField() }, { merge: true });
      showToast("Logo do Cons√≥rcio removida com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao remover logo do Cons√≥rcio do Firestore:", err);
      showToast("Logo do Cons√≥rcio removida!", "success");
    }
  };

  const handleExportDeliveryReceiptPDF = async (data: {
    sector: string;
    items: { product_name: string; quantity: number }[];
    requestId?: string;
    date: string;
  }) => {
    try {
      showToast("Gerando Recibo...", "info");
      
      // @ts-ignore
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;

      const drawLetterhead = (pdfDoc: any) => {
        const docLogo = appRectangularLogo || appLogo;
        const logoWidth = 50;
        const logoHeight = 16;
        const logoY = 10;
        
        // 1. LOGO ALMOXARIFADO (Left - Rectangular)
        if (docLogo) {
          try {
            const format = docLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(docLogo, format, margin, logoY, logoWidth, logoHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding logo to Delivery Receipt:", e);
          }
        } else {
          pdfDoc.setFillColor(240, 253, 244);
          pdfDoc.roundedRect(margin, logoY, logoWidth, logoHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(22, 101, 52);
          pdfDoc.text('ALMOXARIFADO', margin + (logoWidth / 2), logoY + 10, { align: 'center' });
        }

        // 2. LOGO POLICL√çNICA (Center - Rectangular)
        const centerX = (pageWidth / 2) - (logoWidth / 2);
        if (policlinicaLogo) {
          try {
            const format = policlinicaLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(policlinicaLogo, format, centerX, logoY, logoWidth, logoHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding policlinicaLogo to Delivery Receipt:", e);
          }
        } else {
          pdfDoc.setFillColor(240, 249, 255);
          pdfDoc.roundedRect(centerX, logoY, logoWidth, logoHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(3, 105, 161);
          pdfDoc.text('POLICL√çNICA DE SOBRAL', centerX + (logoWidth / 2), logoY + 10, { align: 'center' });
        }

        // 3. LOGO CONS√ìRCIO CPSMS (Right - Rectangular)
        const consorcioWidth = 56;
        const consorcioHeight = 18;
        const consorcioY = 9;
        const rightX = pageWidth - margin - consorcioWidth;
        if (consorcioLogo) {
          try {
            const format = consorcioLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(consorcioLogo, format, rightX, consorcioY, consorcioWidth, consorcioHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding consorcioLogo to Delivery Receipt:", e);
          }
        } else {
          pdfDoc.setFillColor(255, 247, 237);
          pdfDoc.roundedRect(rightX, consorcioY, consorcioWidth, consorcioHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(194, 65, 12);
          pdfDoc.text('CONS√ìRCIO CPSMS', rightX + (consorcioWidth / 2), consorcioY + 11, { align: 'center' });
        }

        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.setLineWidth(0.5);
        pdfDoc.line(margin, 29, pageWidth - margin, 29);

        // Footer
        pdfDoc.setFontSize(7.5);
        pdfDoc.setTextColor(120, 113, 108);
        pdfDoc.setFont('helvetica', 'normal');
        const footer1 = 'Policl√≠nica de Sobral. Av. Monsenhor Alo√≠sio Pinto, 481, CEP 62050-255, Sobral-CE';
        const footer2 = 'Fone: (88) 3614-3156 | Fax: (88) 3614-3245 | cpsms.ce.gov.br';
        pdfDoc.text(footer1, pageWidth / 2, pageHeight - 12, { align: 'center' });
        pdfDoc.text(footer2, pageWidth / 2, pageHeight - 8, { align: 'center' });
      };

      drawLetterhead(doc);
      
      // Document Title & Emission Date directly below logos
      doc.setFontSize(13);
      doc.setTextColor(28, 25, 23);
      doc.setFont('helvetica', 'bold');
      doc.text('RECIBO DE ENTREGA DE MATERIAL', pageWidth / 2, 35, { align: 'center' });
      
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Data de Emiss√£o: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 40, { align: 'center' });

      // Stylized blue separator
      doc.setDrawColor(0, 139, 190);
      doc.setLineWidth(0.5);
      doc.line(14, 44, pageWidth - 14, 44);

      // Info Card
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 48, pageWidth - 28, 20, 2, 2, 'F');
      
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.text('SETOR DESTINO:', 19, 60);
      doc.text('REFER√äNCIA:', 19, 68);
      
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(data.sector.toUpperCase(), 52, 60);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(data.requestId ? `Solicita√ß√£o #${data.requestId.slice(-5).toUpperCase()}` : 'Baixa Direta no Sistema', 52, 68);
      
      doc.text('DATA DA SA√çDA:', pageWidth - 80, 68);
      doc.setFont('helvetica', 'bold');
      doc.text(format(new Date(data.date), 'dd/MM/yyyy'), pageWidth - 50, 68);

      // Materials Table
      const tableData = data.items.map(i => [
        i.product_name.toUpperCase(), 
        i.quantity.toString(), 
        '_________________'
      ]);
      
      autoTable(doc, {
        startY: 80,
        head: [['DESCRI√á√ÉO DO MATERIAL', 'QTD ENTREGUE', 'CONFER√äNCIA']],
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: [30, 41, 59], 
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 9
        },
        styles: { 
          fontSize: 8, 
          cellPadding: 4,
          lineColor: [200, 200, 200],
          lineWidth: 0.1
        },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 35, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 45, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252]
        },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            drawLetterhead(doc);
          }
        }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 35;
      
      // Signature Section
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.5);
      
      // Signature lines
      const signLineW = 70;
      doc.line(20, finalY, 20 + signLineW, finalY);
      doc.line(pageWidth - 20 - signLineW, finalY, pageWidth - 20, finalY);
      
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text('RESPONS√ÅVEL PELA ENTREGA', 20 + (signLineW/2), finalY + 5, { align: 'center' });
      doc.text('RESPONS√ÅVEL PELO SETOR (RECEBIMENTO)', pageWidth - 20 - (signLineW/2), finalY + 5, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const responsibleName = userProfile?.name || user?.displayName || 'Respons√°vel';
      doc.text(responsibleName, 20 + (signLineW/2), finalY + 10, { align: 'center' });
      doc.text(`Setor: ${data.sector}`, pageWidth - 20 - (signLineW/2), finalY + 10, { align: 'center' });

      // Disclaimer
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Confirmo o recebimento dos materiais acima relacionados para uso exclusivo no setor designado.', pageWidth/2, finalY + 25, { align: 'center' });

      // Footer (Institutional Address from model)
      doc.setFontSize(7);
      doc.setTextColor(120, 113, 108);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
      
      const footerLine1 = 'Policl√≠nica de Sobral. Av. Monsenhor Alo√≠sio Pinto, 481, Dom Expedito CEP 62050-255, Sobral Cear√°.';
      const footerLine2 = 'Fone: (88) 3614-3156 . Fax: (88) 3614-3245';
      doc.text(footerLine1, pageWidth / 2, pageHeight - 12, { align: 'center' });
      doc.text(footerLine2, pageWidth / 2, pageHeight - 8, { align: 'center' });

      const fileName = `RECIBO-${data.sector.toUpperCase().replace(/ /g, '-')}-${format(new Date(), 'ddMMyy-HHmm')}.pdf`;
      doc.save(fileName);
      showToast("Comprovante individual gerado com sucesso!", "success");
    } catch (error) {
      console.error("Receipt PDF Error:", error);
      showToast("Erro ao gerar PDF do comprovante", "error");
    }
  };

  const handleExportDisposalTermPDF = async (data: {
    items: { product_name: string; quantity: number; batch_number?: string | null; expiry_date?: string | null; category?: string | null }[];
    reason?: 'vencido' | 'perda' | string;
    justification?: string | null;
    location?: string;
    responsible?: string;
    date: string;
  }) => {
    try {
      showToast("Gerando Termo de Descarte...", "info");

      let base64Image = letterheadImage || "";
      if (!base64Image) {
        try {
          base64Image = await getImageDataURL("/official_letterhead.svg");
        } catch (err) {
          console.warn("Could not load logo image for Disposal Term, using fallback text header:", err);
        }
      }

      // @ts-ignore
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 20;

      const drawLetterhead = (pdfDoc: any) => {
        if (base64Image) {
          try {
            const format = base64Image.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(base64Image, format, 0, 0, pageWidth, pageHeight, undefined, 'FAST');
            return;
          } catch (e) {
            console.error("Error adding letterhead image to Disposal Term:", e);
          }
        }

        const docLogo = appRectangularLogo || appLogo;
        const logoWidth = 50;
        const logoHeight = 16;
        const logoY = 10;

        if (docLogo) {
          try {
            const format = docLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(docLogo, format, margin, logoY, logoWidth, logoHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding docLogo:", e);
          }
        } else {
          pdfDoc.setFillColor(240, 253, 244);
          pdfDoc.roundedRect(margin, logoY, logoWidth, logoHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(22, 101, 52);
          pdfDoc.text('ALMOXARIFADO', margin + (logoWidth / 2), logoY + 10, { align: 'center' });
        }

        const centerX = (pageWidth / 2) - (logoWidth / 2);
        if (policlinicaLogo) {
          try {
            const format = policlinicaLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(policlinicaLogo, format, centerX, logoY, logoWidth, logoHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding policlinicaLogo:", e);
          }
        } else {
          pdfDoc.setFillColor(240, 249, 255);
          pdfDoc.roundedRect(centerX, logoY, logoWidth, logoHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(3, 105, 161);
          pdfDoc.text('POLICL√çNICA DE SOBRAL', centerX + (logoWidth / 2), logoY + 10, { align: 'center' });
        }

        const consorcioWidth = 56;
        const consorcioHeight = 18;
        const consorcioY = 9;
        const rightX = pageWidth - margin - consorcioWidth;
        if (consorcioLogo) {
          try {
            const format = consorcioLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(consorcioLogo, format, rightX, consorcioY, consorcioWidth, consorcioHeight, undefined, 'FAST');
          } catch (e) {
            console.error("Error adding consorcioLogo:", e);
          }
        } else {
          pdfDoc.setFillColor(255, 247, 237);
          pdfDoc.roundedRect(rightX, consorcioY, consorcioWidth, consorcioHeight, 2, 2, 'F');
          pdfDoc.setFontSize(8);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setTextColor(194, 65, 12);
          pdfDoc.text('CONS√ìRCIO CPSMS', rightX + (consorcioWidth / 2), consorcioY + 11, { align: 'center' });
        }

        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.setLineWidth(0.5);
        pdfDoc.line(margin, 29, pageWidth - margin, 29);

        // Footer
        pdfDoc.setFontSize(7.5);
        pdfDoc.setTextColor(120, 113, 108);
        pdfDoc.setFont('helvetica', 'normal');
        const footer1 = 'Policl√≠nica de Sobral. Av. Monsenhor Alo√≠sio Pinto, 481, CEP 62050-255, Sobral-CE';
        const footer2 = 'Fone: (88) 3614-3156 | Fax: (88) 3614-3245 | cpsms.ce.gov.br';
        pdfDoc.text(footer1, pageWidth / 2, pageHeight - 12, { align: 'center' });
        pdfDoc.text(footer2, pageWidth / 2, pageHeight - 8, { align: 'center' });
      };

      drawLetterhead(doc);

      const isVencido = data.reason === 'vencido' || !data.reason;
      const title = isVencido 
        ? 'TERMO DE BAIXA E DESCARTE POR VENCIMENTO (DESPERD√çCIO)' 
        : 'TERMO DE BAIXA POR PERDA / AVARIA';

      doc.setFontSize(12);
      doc.setTextColor(159, 18, 57); // rose-800
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, 38, { align: 'center' });

      // Info box
      doc.setFillColor(254, 242, 242); // rose-50
      doc.roundedRect(margin, 43, pageWidth - (margin * 2), 26, 3, 3, 'F');
      doc.setDrawColor(254, 205, 211); // rose-200
      doc.setLineWidth(0.5);
      doc.roundedRect(margin, 43, pageWidth - (margin * 2), 26, 3, 3, 'S');

      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(`DATA / HORA DA BAIXA:`, margin + 5, 50);
      doc.setFont('helvetica', 'normal');
      doc.text(`${format(new Date(data.date), 'dd/MM/yyyy HH:mm')}`, margin + 48, 50);

      doc.setFont('helvetica', 'bold');
      doc.text(`LOCAL DE ORIGEM:`, margin + 105, 50);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.location || 'Almoxarifado'}`, margin + 138, 50);

      doc.setFont('helvetica', 'bold');
      doc.text(`RESPONS√ÅVEL:`, margin + 5, 57);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.responsible || 'Respons√°vel pelo Estoque'}`, margin + 33, 57);

      doc.setFont('helvetica', 'bold');
      doc.text(`TIPO DE BAIXA:`, margin + 105, 57);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(190, 18, 60);
      doc.text(`${isVencido ? 'DESCARTE / VENCIMENTO (DESPERD√çCIO)' : 'PERDA / AVARIA'}`, margin + 133, 57);

      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(`DESTINA√á√ÉO:`, margin + 5, 64);
      doc.setFont('helvetica', 'normal');
      doc.text(`Inutiliza√ß√£o e Descarte Conforme Normas Sanit√°rias (N√ÉO computado como consumo de setor)`, margin + 30, 64);

      // Items Table
      const tableData = data.items.map((item, idx) => {
        const expStr = item.expiry_date && item.expiry_date !== 'Indeterminada' ? format(new Date(item.expiry_date), 'dd/MM/yyyy') : 'N/A';
        return [
          String(idx + 1).padStart(2, '0'),
          item.product_name,
          item.batch_number || 'S/N',
          expStr,
          item.category || 'Geral',
          `${item.quantity} un.`
        ];
      });

      // @ts-ignore
      doc.autoTable({
        startY: 73,
        head: [['#', 'MATERIAL / DESCRI√á√ÉO', 'LOTE', 'VALIDADE', 'CATEGORIA', 'QTD DESCARTADA']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [190, 18, 60], // rose-700
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 8,
          cellPadding: 3.5,
          lineColor: [226, 232, 240],
          lineWidth: 0.1
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 'auto', fontStyle: 'bold' },
          2: { cellWidth: 26, halign: 'center' },
          3: { cellWidth: 24, halign: 'center' },
          4: { cellWidth: 32, halign: 'center' },
          5: { cellWidth: 28, halign: 'center', fontStyle: 'bold' }
        },
        alternateRowStyles: {
          fillColor: [254, 242, 242, 0.3]
        },
        didDrawPage: (pageData: any) => {
          if (pageData.pageNumber > 1) {
            drawLetterhead(doc);
          }
        }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 8;

      // Justification Box if provided
      if (data.justification) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('JUSTIFICATIVA / OBSERVA√á√ïES:', margin, finalY);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        const splitText = doc.splitTextToSize(data.justification, pageWidth - (margin * 2));
        doc.text(splitText, margin, finalY + 4);
      }

      // Legal Compliance Text
      const textY = finalY + (data.justification ? 16 : 4);
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'italic');
      const declaration = "Declaramos que os itens acima discriminados foram dados como baixa definitiva no sistema de gest√£o de estoque em raz√£o de vencimento ou perda, sendo devidamente segregados para incinera√ß√£o ou descarte t√©cnico especializado, n√£o configurando consumo assistencial de nenhum setor da unidade.";
      const splitDecl = doc.splitTextToSize(declaration, pageWidth - (margin * 2));
      doc.text(splitDecl, margin, textY);

      // Signatures
      const signY = textY + 26;
      const signLineWidth = 65;
      
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.5);
      doc.line(margin, signY, margin + signLineWidth, signY);
      doc.line(pageWidth - margin - signLineWidth, signY, pageWidth - margin, signY);

      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text('RESPONS√ÅVEL PELO ESTOQUE / BAIXA', margin + (signLineWidth / 2), signY + 4, { align: 'center' });
      doc.text('GESTOR T√âCNICO / FARMAC√äUTICO', pageWidth - margin - (signLineWidth / 2), signY + 4, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(data.responsible || 'Respons√°vel', margin + (signLineWidth / 2), signY + 8, { align: 'center' });
      doc.text('Policl√≠nica de Sobral', pageWidth - margin - (signLineWidth / 2), signY + 8, { align: 'center' });

      const fileName = `TERMO-DESCARTE-${format(new Date(data.date), 'ddMMyy-HHmm')}.pdf`;
      doc.save(fileName);
      showToast("Termo de Descarte gerado com sucesso!", "success");
    } catch (error) {
      console.error("Disposal Term PDF Error:", error);
      showToast("Erro ao gerar Termo de Descarte", "error");
    }
  };


  const handleExportConsumptionPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      
      // Minimalist Header (No heavy boxes)
      // Simulated Logo / Icon (Simple and clean)
      doc.setDrawColor(225, 29, 72); // rose-600 color for medical accent
      doc.setLineWidth(1.5);
      doc.line(14, 15, 24, 15); // Horizontal line of a plus
      doc.line(19, 10, 19, 20); // Vertical line of a plus
      
      doc.setFontSize(16);
      doc.setTextColor(28, 25, 23); // dark stone
      doc.setFont('helvetica', 'bold');
      doc.text('POLICL√çNICA', 28, 17);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text('GEST√ÉO DE ALMOXARIFADO E FARM√ÅCIA', 28, 22);

      doc.setDrawColor(231, 229, 228); // light border
      doc.setLineWidth(0.5);
      doc.line(14, 28, pageWidth - 14, 28);
      
      // Title and Date
      doc.setFontSize(14);
      doc.setTextColor(28, 25, 23);
      doc.setFont('helvetica', 'bold');
      doc.text('Relat√≥rio de Consumo por Setor', 14, 40);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text(`Per√≠odo: ${format(parseISO(reportRange.start), 'dd/MM/yyyy')} a ${format(parseISO(reportRange.end), 'dd/MM/yyyy')}`, 14, 46);
      doc.text(`Emitido em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 51);
      
      // Summary Box (Minimalist) - Only for Admin
      if (isAdmin) {
        const totalValue = reportData.consumptionReport.reduce((sum, i) => sum + i.totalValue, 0);
        doc.setFillColor(250, 250, 249); // stone-50
        doc.roundedRect(pageWidth - 85, 35, 71, 18, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setTextColor(120, 113, 108);
        doc.text('VALOR TOTAL CONSUMIDO', pageWidth - 80, 42);
        doc.setFontSize(11);
        doc.setTextColor(28, 25, 23);
        doc.setFont('helvetica', 'bold');
        doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue), pageWidth - 80, 49);
      }

      // Table Data
      const tableData: any[] = [];
      reportData.consumptionBySector.forEach(sectorGroup => {
        // Sector Header
        const rowHeader: any[] = [
          { 
            content: sectorGroup.sector, 
            colSpan: isAdmin ? 4 : 3, 
            styles: { 
              fillColor: [250, 250, 249],
              textColor: [28, 25, 23], 
              fontStyle: 'bold',
              cellPadding: 4,
              fontSize: 10
            } 
          }
        ];

        if (isAdmin) {
          rowHeader.push({ 
            content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sectorGroup.totalValue), 
            styles: { 
              fillColor: [250, 250, 249],
              halign: 'right', 
              fontStyle: 'bold' 
            } 
          });
        }
        
        tableData.push(rowHeader);
        
        // Items
        Object.values(sectorGroup.items).sort((a, b) => b.quantity - a.quantity).forEach(item => {
          const row: any[] = [
            { content: item.name, styles: { cellPadding: { left: 8 } } },
            item.category,
            { content: item.quantity.toString(), styles: { halign: 'center' } }
          ];

          if (isAdmin) {
            row.push({ content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value), styles: { halign: 'right' } });
          }

          tableData.push(row);
        });
      });
      
      const headers = ['Item / Produto', 'Categoria', 'Qtd'];
      if (isAdmin) headers.push('Total (R$)');

      autoTable(doc, {
        startY: 60,
        head: [headers],
        body: tableData,
        theme: 'plain', 
        headStyles: { 
          textColor: [120, 113, 108], 
          fontSize: 8, 
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 4
        },
        styles: { 
          fontSize: 9, 
          cellPadding: 3,
          textColor: [68, 64, 60],
          lineWidth: 0 // Remove default borders
        },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 40 },
          2: { cellWidth: 20, halign: 'center' as any },
          3: { cellWidth: 35, halign: 'right' as any }
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            data.cell.styles.lineWidth = { bottom: 0.1 };
            data.cell.styles.lineColor = [231, 229, 228];
          }
          if (data.section === 'head') {
            data.cell.styles.lineWidth = { bottom: 0.5 };
            data.cell.styles.lineColor = [28, 25, 23];
          }
        },
        didDrawPage: (data) => {
          doc.setFontSize(7);
          doc.setTextColor(168, 162, 158);
          doc.text(`Documento emitido pelo Sistema de Gest√£o Hospitalar - P√°gina ${doc.getNumberOfPages()}`, 14, doc.internal.pageSize.height - 10);
        }
      });
      
      const fileName = `Relatorio_Consumo_Policlinica_${format(new Date(), 'dd-MM-yyyy')}.pdf`;
      doc.save(fileName);
      showToast("Relat√≥rio profissional exportado!", "success");
    } catch (error) {
      console.error('Error exporting PDF:', error);
      showToast("Erro ao gerar PDF profissional.", "error");
    }
  };

  const reportData = useMemo(() => {
    const start = startOfDay(parseISO(reportRange.start));
    const end = endOfDay(parseISO(reportRange.end));
    const isAdmin = userProfile?.role === 'ADMIN' || 
                    user?.email === 'gerlianemagalhaes79@gmail.com' || 
                    user?.email === 'poli.almoxarifado@gmail.com' || 
                    userProfile?.sector === 'Almoxarifado';
    const effectiveSectorFilter = isAdmin ? reportSectorFilter : (selectedSector || 'none');

    const filteredTrans = transactions.filter(t => {
      if (t.deletedAt) return false;
      const d = new Date(t.date);
      const inRange = d >= start && d <= end;
    const matchesSector = effectiveSectorFilter === 'all' || 
                          t.sector === effectiveSectorFilter || 
                          (effectiveSectorFilter === 'Farm√°cia' && t.sector === 'Farm√°cia (Consumo Interno)');
      return inRange && matchesSector;
    });

    const regularEntriesTrans = filteredTrans.filter(t => t.type === 'entry' && !t.isReturn);
    const returnTrans = filteredTrans.filter(t => t.type === 'entry' && t.isReturn === true);
    const exitTrans = filteredTrans.filter(t => t.type === 'exit');

    const entries = regularEntriesTrans.reduce((sum, t) => sum + t.quantity, 0);
    const exits = exitTrans.reduce((sum, t) => sum + t.quantity, 0) - returnTrans.reduce((sum, t) => sum + t.quantity, 0);
    
    const entriesValue = regularEntriesTrans.reduce((sum, t) => {
      const item = items.find(i => i.id === t.item_id);
      return sum + (t.quantity * (Number(item?.unit_price) || 0));
    }, 0);
    
    const exitsValue = exitTrans.reduce((sum, t) => {
      const item = items.find(i => i.id === t.item_id);
      return sum + (t.quantity * (Number(item?.unit_price) || 0));
    }, 0) - returnTrans.reduce((sum, t) => {
      const item = items.find(i => i.id === t.item_id);
      return sum + (t.quantity * (Number(item?.unit_price) || 0));
    }, 0);

    // Extra vs Contract stats
    const originStats = {
      extra: { entries: 0, exits: 0, current: 0 },
      contract: { entries: 0, exits: 0, current: 0 },
      donation: { entries: 0, exits: 0, current: 0 }
    };

    filteredTrans.forEach(t => {
      const origin = t.origin || 'contract';
      if (t.type === 'entry') {
        if (t.isReturn) {
          originStats[origin].exits -= t.quantity;
        } else {
          originStats[origin].entries += t.quantity;
        }
      } else {
        originStats[origin].exits += t.quantity;
      }
    });

    const filteredItems = items.filter(item => {
      if (item.deletedAt) return false;
      
      // If not admin, only see items from their own location
      if (!isAdmin) {
        const userLocation = userProfile?.sector === 'Farm√°cia' ? 'Farm√°cia' : 'Almoxarifado';
        return (item.location || 'Almoxarifado') === userLocation;
      }
      
      // If admin, respect the sector filter if it maps to a location
      if (reportSectorFilter === 'Farm√°cia') {
        return item.location === 'Farm√°cia';
      } else if (reportSectorFilter === 'Almoxarifado') {
        return (item.location || 'Almoxarifado') === 'Almoxarifado';
      }
      
      // If 'all' or other sector, show everything for admin
      return true;
    });

    filteredItems.forEach(item => {
      const origin = item.origin || 'contract';
      originStats[origin].current += (Number(item.quantity) || 0);
    });

    // Group by date for line chart
    const dailyData: Record<string, { date: string, entries: number, exits: number, sortKey: string }> = {};
    filteredTrans.forEach(t => {
      const dateObj = new Date(t.date);
      const dateKey = format(dateObj, 'dd/MM');
      const sortKey = format(dateObj, 'yyyy-MM-dd');
      if (!dailyData[sortKey]) dailyData[sortKey] = { date: dateKey, entries: 0, exits: 0, sortKey };
      if (t.type === 'entry') {
        if (t.isReturn) {
          dailyData[sortKey].exits -= t.quantity;
        } else {
          dailyData[sortKey].entries += t.quantity;
        }
      } else {
        dailyData[sortKey].exits += t.quantity;
      }
    });

    // Group by category for pie chart (quantity)
    const categoryData: Record<string, number> = {};
    // Group by category for value chart
    const categoryValueData: Record<string, number> = {};
    
    const filteredItemsForValue = items.filter(item => {
      if (item.deletedAt) return false;
      
      // If not admin, only see items from their own location
      if (!isAdmin) {
        const userLocation = userProfile?.sector === 'Farm√°cia' ? 'Farm√°cia' : 'Almoxarifado';
        return (item.location || 'Almoxarifado') === userLocation;
      }
      
      // If admin, respect the sector filter if it maps to a location
      if (reportSectorFilter === 'Farm√°cia') {
        return item.location === 'Farm√°cia';
      } else if (reportSectorFilter === 'Almoxarifado') {
        return (item.location || 'Almoxarifado') === 'Almoxarifado';
      }
      
      return true;
    });

    filteredItemsForValue.forEach(item => {
      const cat = item.category || 'Outros';
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      categoryData[cat] = (categoryData[cat] || 0) + qty;
      categoryValueData[cat] = (categoryValueData[cat] || 0) + (qty * price);
    });

    // Group by sector for bar chart (stacked by category) - only departmental consumption
    const sectorData: Record<string, any> = {};
    const categoriesInSector: Set<string> = new Set();

    filteredTrans.filter(t => t.type === 'exit' && t.sector && (t.exitReason === 'consumo' || !t.exitReason)).forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const category = item?.category || 'Outros';
      categoriesInSector.add(category);
      
      const sectorKey = (t.sector === 'Farm√°cia (Consumo Interno)') ? 'Farm√°cia' : t.sector!;
      
      if (!sectorData[sectorKey]) {
        sectorData[sectorKey] = { name: sectorKey };
      }
      sectorData[sectorKey][category] = (sectorData[sectorKey][category] || 0) + t.quantity;
    });

    filteredTrans.filter(t => t.type === 'entry' && t.isReturn && t.sector).forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const category = item?.category || 'Outros';
      categoriesInSector.add(category);
      
      const sectorKey = (t.sector === 'Farm√°cia (Consumo Interno)') ? 'Farm√°cia' : t.sector!;
      
      if (!sectorData[sectorKey]) {
        sectorData[sectorKey] = { name: sectorKey };
      }
      sectorData[sectorKey][category] = (sectorData[sectorKey][category] || 0) - t.quantity;
    });

    // Consumption report with sector breakdown (only actual department consumption)
    const consumptionReport: Record<string, { 
      name: string, 
      totalQuantity: number, 
      totalValue: number, 
      category: string, 
      supplier: string,
      sectors: Record<string, number>
    }> = {};

    // Consumption report grouped by sector
    const consumptionBySector: Record<string, {
      sector: string,
      totalValue: number,
      items: Record<string, {
        name: string,
        quantity: number,
        value: number,
        category: string
      }>
    }> = {};

    // Process exits (only regular consumption)
    filteredTrans.filter(t => t.type === 'exit' && (t.exitReason === 'consumo' || !t.exitReason)).forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const price = Number(item?.unit_price) || 0;
      const value = t.quantity * price;
      let sector = t.sector || 'N√£o Informado';
      if (sector === 'Farm√°cia (Consumo Interno)') sector = 'Farm√°cia';
      
      if (!consumptionReport[t.item_name]) {
        consumptionReport[t.item_name] = { 
          name: t.item_name, 
          totalQuantity: 0, 
          totalValue: 0, 
          category: item?.category || 'Outros',
          supplier: item?.supplier || 'N/A',
          sectors: {}
        };
      }
      consumptionReport[t.item_name].totalQuantity += t.quantity;
      consumptionReport[t.item_name].totalValue += value;
      consumptionReport[t.item_name].sectors[sector] = (consumptionReport[t.item_name].sectors[sector] || 0) + t.quantity;

      // Group by Sector
      if (!consumptionBySector[sector]) {
        consumptionBySector[sector] = {
          sector,
          totalValue: 0,
          items: {}
        };
      }
      
      if (!consumptionBySector[sector].items[t.item_name]) {
        consumptionBySector[sector].items[t.item_name] = {
          name: t.item_name,
          quantity: 0,
          value: 0,
          category: item?.category || 'Outros'
        };
      }
      
      consumptionBySector[sector].totalValue += value;
      consumptionBySector[sector].items[t.item_name].quantity += t.quantity;
      consumptionBySector[sector].items[t.item_name].value += value;
    });

    // Subtract returns
    filteredTrans.filter(t => t.type === 'entry' && t.isReturn).forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const price = Number(item?.unit_price) || 0;
      const value = t.quantity * price;
      let sector = t.sector || 'N√£o Informado';
      if (sector === 'Farm√°cia (Consumo Interno)') sector = 'Farm√°cia';
      
      if (!consumptionReport[t.item_name]) {
        consumptionReport[t.item_name] = { 
          name: t.item_name, 
          totalQuantity: 0, 
          totalValue: 0, 
          category: item?.category || 'Outros',
          supplier: item?.supplier || 'N/A',
          sectors: {}
        };
      }
      consumptionReport[t.item_name].totalQuantity -= t.quantity;
      consumptionReport[t.item_name].totalValue -= value;
      consumptionReport[t.item_name].sectors[sector] = (consumptionReport[t.item_name].sectors[sector] || 0) - t.quantity;

      // Group by Sector
      if (!consumptionBySector[sector]) {
        consumptionBySector[sector] = {
          sector,
          totalValue: 0,
          items: {}
        };
      }
      
      if (!consumptionBySector[sector].items[t.item_name]) {
        consumptionBySector[sector].items[t.item_name] = {
          name: t.item_name,
          quantity: 0,
          value: 0,
          category: item?.category || 'Outros'
        };
      }
      
      consumptionBySector[sector].totalValue -= value;
      consumptionBySector[sector].items[t.item_name].quantity -= t.quantity;
      consumptionBySector[sector].items[t.item_name].value -= value;
    });

    // Group by supplier for value chart
    const supplierData: Record<string, number> = {};
    filteredItemsForValue.forEach(item => {
      const sup = item.supplier || 'Sem Fornecedor';
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      supplierData[sup] = (supplierData[sup] || 0) + (qty * price);
    });

    const totalValue = filteredItemsForValue.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)), 0);

    // Most requested items
    const mostRequested: Record<string, number> = {};
    allRequestItems.forEach(ri => {
      const request = requests.find(r => r.id === ri.request_id);
      if (!request) return;
      
      // If not admin, only count items from their own sector
      if (!isAdmin && request.sector !== selectedSector) return;
      
      // If admin and sector filter is active, filter by that sector
      if (isAdmin && reportSectorFilter !== 'all' && request.sector !== reportSectorFilter) return;

      mostRequested[ri.product_name] = (mostRequested[ri.product_name] || 0) + ri.quantity_requested;
    });
    const topRequested = Object.entries(mostRequested)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Exits by reason
    const exitsByReason: Record<string, number> = {
      'consumo': 0,
      'doacao': 0,
      'vencido': 0,
      'perda': 0
    };
    filteredTrans.filter(t => t.type === 'exit').forEach(t => {
      const reason = t.exitReason || 'consumo';
      if (exitsByReason[reason] !== undefined) {
        exitsByReason[reason] += t.quantity;
      }
    });

    // Returns by Sector calculation
    const returnsBySectorMap: Record<string, { name: string; quantity: number; value: number }> = {};
    const returnsByReasonMap: Record<string, number> = {};

    filteredTrans.filter(t => t.type === 'entry' && t.isReturn).forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const price = Number(item?.unit_price) || 0;
      const val = t.quantity * price;
      let sec = t.sector || 'N√£o Informado';
      if (sec === 'Farm√°cia (Consumo Interno)') sec = 'Farm√°cia';

      if (!returnsBySectorMap[sec]) {
        returnsBySectorMap[sec] = { name: sec, quantity: 0, value: 0 };
      }
      returnsBySectorMap[sec].quantity += t.quantity;
      returnsBySectorMap[sec].value += val;

      const reason = t.returnReason || 'N√£o especificado';
      returnsByReasonMap[reason] = (returnsByReasonMap[reason] || 0) + t.quantity;
    });

    const returnsBySector = Object.values(returnsBySectorMap).sort((a, b) => b.quantity - a.quantity);
    const returnsByReason = Object.entries(returnsByReasonMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const totalReturnsCount = filteredTrans.filter(t => t.type === 'entry' && t.isReturn).reduce((sum, t) => sum + t.quantity, 0);
    const totalReturnsValue = filteredTrans.filter(t => t.type === 'entry' && t.isReturn).reduce((sum, t) => {
      const item = items.find(i => i.id === t.item_id);
      return sum + (t.quantity * (Number(item?.unit_price) || 0));
    }, 0);

    return {
      entries,
      exits,
      entriesValue,
      exitsValue,
      daily: Object.values(dailyData).sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
      categories: Object.entries(categoryData)
        .map(([name, value]) => ({ name, value }))
        .filter(c => c.value > 0)
        .sort((a, b) => b.value - a.value),
      consumptionCategories: Object.entries(
        (() => {
          const acc: Record<string, number> = {};
          filteredTrans.forEach(t => {
            const item = items.find(i => i.id === t.item_id);
            const cat = item?.category || 'Outros';
            if (t.type === 'exit') {
              acc[cat] = (acc[cat] || 0) + t.quantity;
            } else if (t.type === 'entry' && t.isReturn) {
              acc[cat] = (acc[cat] || 0) - t.quantity;
            }
          });
          return acc;
        })()
      ).map(([name, value]) => ({ name, value })),
      categoryValues: Object.entries(categoryValueData)
        .map(([name, value]) => ({ name, value }))
        .filter(c => c.value > 0)
        .sort((a, b) => b.value - a.value),
      sectors: Object.values(sectorData),
      categoriesInSector: Array.from(categoriesInSector),
      suppliers: Object.entries(supplierData)
        .map(([name, value]) => ({ name, value }))
        .filter(s => s.value > 0)
        .sort((a, b) => b.value - a.value),
      consumptionReport: Object.values(consumptionReport).sort((a, b) => b.totalValue - a.totalValue),
      consumptionBySector: Object.values(consumptionBySector).sort((a, b) => b.totalValue - a.totalValue),
      totalValue,
      originStats,
      topRequested,
      topConsumed: Object.values(consumptionReport)
        .map(i => ({ name: i.name, value: i.totalQuantity }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      exitsByReason,
      returnsBySector,
      returnsByReason,
      totalReturnsCount,
      totalReturnsValue
    };
  }, [transactions, items, reportRange, reportSectorFilter, allRequestItems, requests, userProfile, isAdmin, selectedSector]);

  const categoryDistribution = useMemo(() => {
    const map: Record<string, { productNames: Set<string>; totalQty: number; value: number }> = {};
    items
      .filter(i => !i.deletedAt && i.quantity > 0 && (i.location || 'Almoxarifado') === inventoryLocation)
      .forEach(i => {
        const cat = i.category || 'Geral';
        if (!map[cat]) map[cat] = { productNames: new Set<string>(), totalQty: 0, value: 0 };
        map[cat].productNames.add(i.name.trim());
        map[cat].totalQty += (Number(i.quantity) || 0);
        map[cat].value += ((Number(i.quantity) || 0) * (Number(i.unit_price) || 0));
      });

    const entries = Object.entries(map).map(([category, data]) => ({
      category,
      count: data.productNames.size,
      totalQty: data.totalQty,
      value: data.value,
    }));

    const maxCount = Math.max(...entries.map(m => m.count), 1);
    const maxQty = Math.max(...entries.map(m => m.totalQty), 1);

    return entries
      .map(data => ({
        ...data,
        typePercentage: Math.min(100, Math.round((data.count / maxCount) * 100)),
        unitPercentage: Math.min(100, Math.round((data.totalQty / maxQty) * 100))
      }))
      .sort((a, b) => distribViewMode === 'types' ? b.count - a.count : b.totalQty - a.totalQty)
      .slice(0, 12);
  }, [items, inventoryLocation, distribViewMode]);

  // Purchase Planning Engine (Must be declared before any conditional returns)
  const purchasePlanningSummary = useMemo(() => {
    const now = new Date();
    
    // Target Date calculation (last day of the chosen target month in target year)
    const targetDate = new Date(planningTargetYear, planningTargetMonth + 1, 0, 23, 59, 59);
    const diffTime = targetDate.getTime() - now.getTime();
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const totalTargetWeeks = Math.max(0.5, Number((diffDays / 7).toFixed(1)));
    const totalTargetMonths = Math.max(0.1, Number((totalTargetWeeks / 4.33).toFixed(1)));

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Mar√ßo', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const targetMonthName = monthNames[planningTargetMonth] || 'Abril';
    const targetPeriodLabel = `${targetMonthName}/${planningTargetYear}`;

    // Filter items based on planning location and deletedAt
    const filteredActiveItems = items.filter(i => {
      if (i.deletedAt) return false;
      if (planningLocation === 'all') return true;
      return (i.location || 'Almoxarifado') === planningLocation;
    });

    // Group items by name
    const groupedByName: Record<string, {
      name: string;
      category: string;
      supplier: string;
      unit_measure: string;
      total_quantity: number;
      batches: Item[];
    }> = {};

    filteredActiveItems.forEach(i => {
      if (!groupedByName[i.name]) {
        groupedByName[i.name] = {
          name: i.name,
          category: i.category || 'Geral',
          supplier: i.supplier || 'Diversos',
          unit_measure: i.unit_measure || 'UN',
          total_quantity: 0,
          batches: []
        };
      }
      groupedByName[i.name].total_quantity += (Number(i.quantity) || 0);
      groupedByName[i.name].batches.push(i);
      if (i.unit_measure) groupedByName[i.name].unit_measure = i.unit_measure;
      if (i.category) groupedByName[i.name].category = i.category;
    });

    const calculatedItems: PurchasePlanningItem[] = Object.values(groupedByName).map(group => {
      const currentStock = group.total_quantity;
      const weeklyRate = weeklyExitRates[group.name] || 0;
      const monthlyRate = weeklyRate * 4.33;
      
      const durationWeeks = weeklyRate > 0 ? (currentStock / weeklyRate) : 'infinite';
      const durationMonthInfo = getDurationMonthInfo(durationWeeks);

      const periodDemand = Math.ceil(weeklyRate * totalTargetWeeks);
      
      let safetyStock = 0;
      if (planningSafetyOption === 'standard_8w') {
        safetyStock = Math.ceil(weeklyRate * 8);
      } else if (planningSafetyOption === 'margin_10') {
        safetyStock = Math.ceil(periodDemand * 0.10);
      } else if (planningSafetyOption === 'margin_20') {
        safetyStock = Math.ceil(periodDemand * 0.20);
      } else {
        safetyStock = 0;
      }

      const totalRequired = periodDemand + safetyStock;
      const quantityToBuy = Math.max(0, totalRequired - currentStock);

      // Determine unit price from most recent batch with price > 0, or average
      let unitPrice = 0;
      const batchesWithPrice = group.batches.filter(b => (Number(b.unit_price) || 0) > 0);
      if (batchesWithPrice.length > 0) {
        unitPrice = Number(batchesWithPrice[batchesWithPrice.length - 1].unit_price) || 0;
      }

      const totalEstimatedCost = quantityToBuy * unitPrice;
      const willCoverTarget = durationWeeks === 'infinite' || durationWeeks >= totalTargetWeeks;

      let status: PurchasePlanningItem['status'] = 'COBRE_TOTAL';
      if (currentStock === 0 && weeklyRate > 0) {
        status = 'ZERADO_SEM_ESTOQUE';
      } else if (quantityToBuy > 0 && durationWeeks !== 'infinite' && durationWeeks <= 4) {
        status = 'DEFICIT_CRITICO';
      } else if (quantityToBuy > 0) {
        status = 'DEFICIT_MODERADO';
      } else {
        status = 'COBRE_TOTAL';
      }

      return {
        name: group.name,
        category: group.category,
        supplier: group.supplier,
        unit_measure: group.unit_measure,
        currentStock,
        weeklyRate,
        monthlyRate,
        durationWeeks,
        durationMonthInfo,
        periodDemand,
        safetyStock,
        totalRequired,
        quantityToBuy,
        unitPrice,
        totalEstimatedCost,
        willCoverTarget,
        status
      };
    });

    // Filter by category and search first
    const filteredByCategoryAndSearch = calculatedItems.filter(item => {
      if (planningCategory !== 'all' && item.category !== planningCategory) return false;
      if (planningSearch.trim()) {
        const search = normalizeString(planningSearch);
        const matchName = normalizeString(item.name).includes(search);
        const matchCat = normalizeString(item.category).includes(search);
        if (!matchName && !matchCat) return false;
      }
      return true;
    });

    // Filter by deficit-only for the active display
    const filtered = filteredByCategoryAndSearch.filter(item => {
      if (planningOnlyWithDeficit && item.quantityToBuy <= 0) return false;
      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (planningSort === 'deficit_desc') {
        return b.quantityToBuy - a.quantityToBuy;
      } else if (planningSort === 'cost_desc') {
        return b.totalEstimatedCost - a.totalEstimatedCost;
      } else if (planningSort === 'cost_asc') {
        return a.totalEstimatedCost - b.totalEstimatedCost;
      } else if (planningSort === 'name_asc') {
        return a.name.localeCompare(b.name);
      } else if (planningSort === 'duration_asc') {
        const durA = a.durationWeeks === 'infinite' ? 999999 : a.durationWeeks;
        const durB = b.durationWeeks === 'infinite' ? 999999 : b.durationWeeks;
        return durA - durB;
      }
      return 0;
    });

    // Metrics calculated based on the chosen category/filters
    const totalItemsWithDeficit = filteredByCategoryAndSearch.filter(i => i.quantityToBuy > 0).length;
    const totalUnitsToBuy = filteredByCategoryAndSearch.reduce((acc, i) => acc + i.quantityToBuy, 0);
    const totalEstimatedFinancialCost = filteredByCategoryAndSearch.reduce((acc, i) => acc + i.totalEstimatedCost, 0);
    const totalAnalyzed = filteredByCategoryAndSearch.length;

    return {
      targetDate,
      totalTargetWeeks,
      totalTargetMonths,
      targetMonthName,
      targetPeriodLabel,
      items: filtered,
      allItems: filteredByCategoryAndSearch,
      totalAnalyzed,
      totalItemsWithDeficit,
      totalUnitsToBuy,
      totalEstimatedFinancialCost
    };
  }, [
    items,
    weeklyExitRates,
    planningTargetMonth,
    planningTargetYear,
    planningSafetyOption,
    planningLocation,
    planningCategory,
    planningOnlyWithDeficit,
    planningSearch,
    planningSort
  ]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1C1917]"></div>
      </div>
    );
  }

  if (!user) {
    const loginLogo = appRectangularLogo || appLogo;
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[40px] shadow-2xl max-w-md w-full border border-slate-200"
        >
          <div className="text-center mb-8">
            {loginLogo ? (
              <div className="w-full max-w-[260px] h-24 rounded-2xl overflow-hidden bg-white border border-blue-200/80 p-2.5 shadow-md mx-auto mb-6 flex items-center justify-center ring-4 ring-blue-500/10">
                <img src={loginLogo} alt="Logo Policl√≠nica" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl overflow-hidden border-4 border-white ring-4 ring-blue-500/10 text-white">
                <Package className="w-12 h-12" />
              </div>
            )}
            <div className="mb-4 text-center">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase leading-tight">
                Policl√≠nica
              </h1>
              <h2 className="text-sm font-black text-blue-700 uppercase tracking-wider mt-0.5">
                de Sobral
              </h2>
            </div>
            <div className="h-0.5 w-12 bg-blue-100 mx-auto mb-4 rounded-full" />
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest bg-blue-50 border border-blue-100/80 px-3 py-1 rounded-full w-fit mx-auto">
              Almoxarifado Inteligente
            </p>
          </div>

          <div className="space-y-6">
            <button 
              onClick={handleGoogleLogin}
              disabled={loginLoading}
              className="w-full bg-white border border-slate-200 text-slate-800 py-4 rounded-2xl font-extrabold flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-blue-300 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 group"
            >
              {loginLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700"></div>
              ) : (
                <>
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 group-hover:scale-110 transition-transform" alt="Google" />
                  <span>Entrar com Google</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-slate-400 text-center font-extrabold uppercase tracking-widest mt-4">
              Apenas e-mails autorizados pelo administrador
            </p>
          </div>

          <div className="mt-8 text-center pt-4 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Acesso restrito a funcion√°rios autorizados</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const isExpired = (item: Item) => {
    if (item.quantity <= 0) return false;
    const dateStr = item.expiry_date;
    if (!dateStr || dateStr === 'Indeterminada') return false;
    const expiry = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry < today;
  };

  const isNearExpiry = (item: Item) => {
    if (item.quantity <= 0) return false;
    const dateStr = item.expiry_date;
    if (!dateStr || dateStr === 'Indeterminada') return false;
    const expiry = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(today.getMonth() + 2);
    return expiry >= today && expiry <= twoMonthsFromNow;
  };

  const filteredItems = items.filter(i => {
    const normalizedSearch = normalizeString(searchTerm);
    const itemLocation = i.location || 'Almoxarifado';
    return !i.deletedAt && 
    i.quantity > 0 && 
    itemLocation === inventoryLocation &&
    ((normalizeString(i.name).includes(normalizedSearch) || 
    normalizeString(i.supplier).includes(normalizedSearch) ||
    normalizeString(i.category).includes(normalizedSearch) ||
    normalizeString(i.batch_number).includes(normalizedSearch)) &&
    (originFilter === 'all' || i.origin === originFilter) &&
    (categoryFilter === 'all' || i.category === categoryFilter));
  });

  const groupedItems = items.filter(i => !i.deletedAt && i.quantity > 0 && (i.location || 'Almoxarifado') === inventoryLocation).reduce((acc, item) => {
    if (!acc[item.name]) {
      const weeklyExitRate = weeklyExitRates[item.name] || 0;
      
      acc[item.name] = {
        name: item.name,
        total_quantity: 0,
        min_quantity: weeklyExitRate > 0 ? Math.ceil(weeklyExitRate * 8) : item.min_quantity,
        category: item.category,
        supplier: item.supplier,
        unit_measure: item.unit_measure || null,
        batches: [],
        weeklyExitRate: weeklyExitRate,
        durationWeeks: 0
      };
    }
    acc[item.name].total_quantity += item.quantity;
    if (!acc[item.name].unit_measure && item.unit_measure) {
      acc[item.name].unit_measure = item.unit_measure;
    }
    acc[item.name].batches.push(item);
    
    // Update duration
    if (acc[item.name].weeklyExitRate > 0) {
      acc[item.name].durationWeeks = acc[item.name].total_quantity / acc[item.name].weeklyExitRate;
    } else {
      acc[item.name].durationWeeks = 'infinite';
    }
    
    return acc;
  }, {} as Record<string, ItemGroup>);

  const lowStockItems = Object.values(groupedItems).filter(group => 
    group.total_quantity <= group.min_quantity
  );

  const expiredItems = items.filter(i => !i.deletedAt && (i.location || 'Almoxarifado') === inventoryLocation && isExpired(i));
  const nearExpiryItems = items.filter(i => !i.deletedAt && (i.location || 'Almoxarifado') === inventoryLocation && isNearExpiry(i));
  const totalAlertsCount = lowStockItems.length + expiredItems.length + nearExpiryItems.length;
  const totalVolume = items
    .filter(i => !i.deletedAt && (i.location || 'Almoxarifado') === inventoryLocation)
    .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const totalInventoryValue = items
    .filter(i => !i.deletedAt && (i.location || 'Almoxarifado') === inventoryLocation)
    .reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)), 0);

  const recentTransactions = transactions
    .filter(t => (t.location || 'Almoxarifado') === inventoryLocation)
    .slice(0, 5);

  const pendingRequestsCount = requests.filter(r => 
    !r.deletedAt && 
    (r.status === 'PENDENTE' || r.status === 'EM_SEPARACAO' || r.status === 'DEVOLUCAO_PENDENTE') &&
    (isAdmin ? true : r.sector === selectedSector)
  ).length;

  const groupedArray: ItemGroup[] = (Object.values(groupedItems) as ItemGroup[])
    .filter(group => {
      // Apply search and filters to the grouped items for the inventory list
      const normalizedSearch = normalizeString(searchTerm);
      const matchesSearch = normalizeString(group.name).includes(normalizedSearch) ||
                           normalizeString(group.supplier).includes(normalizedSearch) ||
                           normalizeString(group.category).includes(normalizedSearch);
      
      const matchesOrigin = originFilter === 'all' || group.batches.some(b => b.origin === originFilter);
      const matchesCategory = categoryFilter === 'all' || group.category === categoryFilter;
      
      return matchesSearch && matchesOrigin && matchesCategory;
    })
    .sort((a, b) => {
      if (inventorySort === 'name_asc') {
        return a.name.localeCompare(b.name);
      } else if (inventorySort === 'name_desc') {
        return b.name.localeCompare(a.name);
      } else if (inventorySort === 'duration_asc') {
        const durA = a.durationWeeks === 'infinite' ? Number.MAX_SAFE_INTEGER : a.durationWeeks;
        const durB = b.durationWeeks === 'infinite' ? Number.MAX_SAFE_INTEGER : b.durationWeeks;
        return durA - durB;
      } else {
        const durA = a.durationWeeks === 'infinite' ? Number.MAX_SAFE_INTEGER : a.durationWeeks;
        const durB = b.durationWeeks === 'infinite' ? Number.MAX_SAFE_INTEGER : b.durationWeeks;
        return durB - durA;
      }
    });

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1C1917] font-sans">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-20 text-white shadow-md">
        <div className="flex items-center gap-2.5">
          {appLogo ? (
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-white p-0.5 border border-slate-700 shadow-sm flex items-center justify-center shrink-0">
              <img src={appLogo} alt="Logo Policl√≠nica" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-2 rounded-xl text-white shadow-sm shrink-0">
              <Package className="w-5 h-5" />
            </div>
          )}
          <div className="flex items-baseline gap-1.5">
            <h1 className="font-black text-lg tracking-tight text-white">Policl√≠nica</h1>
            <span className="text-[10px] font-black text-blue-300 tracking-wider uppercase">Almoxarifado</span>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-300"
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed lg:left-0 top-0 h-full w-64 bg-white border-r border-blue-100/80 p-5 flex flex-col gap-6 z-40 shadow-sm transition-transform duration-300 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between lg:justify-start gap-3 px-1 pt-1">
          <div className="flex items-center gap-3">
            {appLogo ? (
              <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white border border-blue-200/80 p-1 shadow-md shadow-blue-500/10 flex items-center justify-center shrink-0 ring-2 ring-blue-500/10">
                <img src={appLogo} alt="Logo Policl√≠nica" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 p-2.5 rounded-2xl shadow-md shadow-blue-500/20 text-white ring-2 ring-blue-500/20 shrink-0">
                <Package className="w-6 h-6" />
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="font-black text-xl tracking-tight text-slate-900 leading-none">Policl√≠nica</h1>
              <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md uppercase tracking-widest leading-none block w-fit mt-1">
                Almoxarifado
              </span>
            </div>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-1.5 overflow-y-auto pr-0.5">
          {userProfile && (
            <>
              {(isAdmin || userProfile.role === 'ADMIN') ? (
                <>
                  <button 
                    onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'dashboard' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <LayoutDashboard size={18} className={activeTab === 'dashboard' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Dashboard</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('inventory'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'inventory' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Package size={18} className={activeTab === 'inventory' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Estoque</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('balance'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'balance' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Scale size={18} className={activeTab === 'balance' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Balan√ßo</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'history' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <History size={18} className={activeTab === 'history' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Hist√≥rico</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('requests'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'requests' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText size={18} className={activeTab === 'requests' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Solicita√ß√µes</span>
                    </div>
                    {pendingRequestsCount > 0 && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        activeTab === 'requests' ? 'bg-amber-400 text-slate-950' : 'bg-sky-100 text-sky-800'
                      }`}>
                        {pendingRequestsCount}
                      </span>
                    )}
                  </button>

                  <button 
                    onClick={() => { setActiveTab('admin-devolutions'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'admin-devolutions' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <RotateCcw size={18} className={activeTab === 'admin-devolutions' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Devolu√ß√µes</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('trash'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'trash' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Trash2 size={18} className={activeTab === 'trash' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Lixeira</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('reports'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'reports' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BarChart3 size={18} className={activeTab === 'reports' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Relat√≥rios</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'users' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Users size={18} className={activeTab === 'users' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Usu√°rios</span>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => { setActiveTab('new-request'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'new-request' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Plus size={18} className={activeTab === 'new-request' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Nova Solicita√ß√£o</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('devolution'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'devolution' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <RotateCcw size={18} className={activeTab === 'devolution' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Devolu√ß√£o de Materiais</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('my-requests'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'my-requests' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText size={18} className={activeTab === 'my-requests' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Minhas Solicita√ß√µes</span>
                    </div>
                  </button>

                  {(userProfile?.role === 'L√çDER' || userProfile?.role === 'SETOR') && (
                    <button 
                      onClick={() => { setActiveTab('leader-stats'); setIsMobileMenuOpen(false); }}
                      className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                        activeTab === 'leader-stats' 
                          ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                          : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <BarChart3 size={18} className={activeTab === 'leader-stats' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                        <span>Estat√≠sticas</span>
                      </div>
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </nav>

        <div className="mt-auto pt-4 border-t border-blue-100/80 space-y-2">
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-blue-200 transition-all">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Usu√°rio Conectado</p>
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ''} className="w-9 h-9 rounded-xl border-2 border-blue-500/30 object-cover shadow-sm shrink-0" alt="" />
              <div className="overflow-hidden flex-1 min-w-0">
                <p className="text-xs font-extrabold text-slate-900 truncate">{user.displayName}</p>
                {userProfile?.allowedSectors && userProfile.allowedSectors.length > 1 ? (
                  <select 
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                    className="text-[10px] text-slate-900 font-extrabold uppercase bg-white border border-slate-200 rounded-lg px-2 py-1 mt-1 cursor-pointer hover:border-blue-300 transition-all w-full focus:ring-1 focus:ring-blue-500"
                  >
                    {userProfile.allowedSectors.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[10px] text-slate-500 font-bold truncate uppercase mt-0.5">{selectedSector || 'Sem Setor'}</p>
                )}
                <button 
                  onClick={handleLogout} 
                  className="text-[10px] text-rose-600 font-bold hover:text-rose-700 hover:bg-rose-50 px-2 py-0.5 rounded-md transition-all flex items-center gap-1 mt-1.5"
                >
                  <LogOut size={11} /> Sair do sistema
                </button>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 text-xs font-bold w-full transition-all"
          >
            <Settings size={18} className="text-slate-400" /> Configura√ß√µes
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-10 max-w-7xl mx-auto mt-16 lg:mt-0">
        <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6 lg:mb-10">
          <div>
            <h2 className="text-xl lg:text-3xl font-bold tracking-tight mb-1">
              {activeTab === 'dashboard' && 'Vis√£o Geral'}
              {activeTab === 'inventory' && 'Gerenciamento de Estoque'}
              {activeTab === 'balance' && 'Balan√ßo e Auditoria de Estoque'}
              {activeTab === 'history' && 'Hist√≥rico de Movimenta√ß√µes'}
              {activeTab === 'requests' && 'Solicita√ß√µes de Materiais'}
              {activeTab === 'admin-devolutions' && 'Devolu√ß√µes de Materiais'}
              {activeTab === 'trash' && 'Lixeira (Exclus√£o em 3 dias)'}
              {activeTab === 'my-requests' && `Minhas Solicita√ß√µes - ${selectedSector || ''}`}
              {activeTab === 'new-request' && `Nova Solicita√ß√£o - ${selectedSector || ''}`}
              {activeTab === 'devolution' && `Devolu√ß√£o de Materiais - ${selectedSector || ''}`}
              {editingRequest && ' - Editando Solicita√ß√£o'}
              {activeTab === 'reports' && 'Relat√≥rios e An√°lises'}
              {activeTab === 'leader-stats' && 'Estat√≠sticas do Almoxarifado'}
            </h2>
              {activeTab === 'dashboard' && (
                <div className="flex items-center gap-4 mt-2">
                  <p className="text-[#78716C]">
                    {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  {isAdmin && (
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#E7E5E4]">
                      <Package size={14} className="text-[#A8A29E]" />
                      <select 
                        className="text-xs font-bold focus:outline-none bg-transparent"
                        value={inventoryLocation}
                        onChange={e => setInventoryLocation(e.target.value as 'Almoxarifado' | 'Farm√°cia')}
                      >
                        <option value="Almoxarifado">Almoxarifado</option>
                        <option value="Farm√°cia">Farm√°cia</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'history' && (
                <p className="text-[#78716C]">
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
              {activeTab === 'reports' && (
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-2xl border border-slate-200/90 shadow-sm hover:border-blue-300 transition-all">
                    <Calendar size={15} className="text-blue-600" />
                    <input 
                      type="date" 
                      className="text-xs font-extrabold text-slate-700 focus:outline-none cursor-pointer"
                      value={reportRange.start}
                      onChange={e => setReportRange({...reportRange, start: e.target.value})}
                    />
                    <span className="text-slate-400 text-xs font-bold">at√©</span>
                    <input 
                      type="date" 
                      className="text-xs font-extrabold text-slate-700 focus:outline-none cursor-pointer"
                      value={reportRange.end}
                      onChange={e => setReportRange({...reportRange, end: e.target.value})}
                    />
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-2xl border border-slate-200/90 shadow-sm hover:border-blue-300 transition-all">
                      <Filter size={15} className="text-blue-600" />
                      <select 
                        className="text-xs font-extrabold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                        value={reportSectorFilter}
                        onChange={e => setReportSectorFilter(e.target.value)}
                      >
                        <option value="all">Todos os Setores</option>
                        {SECTORS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={handleExportExcel}
                      className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-2 rounded-2xl text-xs font-extrabold hover:from-emerald-700 hover:to-teal-800 transition-all shadow-md shadow-emerald-600/20"
                    >
                      <Download size={15} /> Exportar Excel
                    </button>
                  )}
                  {!isAdmin && (
                    <button 
                      onClick={handleExportMaterialsCatalogPDF}
                      className="flex items-center gap-2 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white px-4 py-2 rounded-2xl text-xs font-extrabold hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-blue-600/20"
                    >
                      <FileText size={15} /> Cat√°logo de Itens
                    </button>
                  )}
                </div>
              )}
              {(activeTab === 'requests' || activeTab === 'my-requests' || activeTab === 'admin-devolutions' || activeTab === 'devolution') && (
                <div className="flex items-center gap-4 mt-2">
                  <button 
                    onClick={handleExportRequestsPDF}
                    className="flex items-center gap-2 bg-rose-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-rose-700 transition-all shadow-sm"
                  >
                    <Download size={14} /> Exportar PDF
                  </button>
                </div>
              )}
            </div>
          
          <div className="flex gap-4 items-center">
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-[#57534E] hover:bg-white hover:shadow-sm rounded-xl transition-all"
                title="Notifica√ß√µes"
              >
                <Bell size={24} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#F5F5F4]">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowNotifications(false)} 
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-3xl shadow-2xl border border-[#E7E5E4] z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-[#E7E5E4] flex justify-between items-center bg-[#FAFAF9]">
                        <h3 className="font-black text-sm">Notifica√ß√µes</h3>
                        <button 
                          onClick={async () => {
                            const unreadSystem = notifications.filter(n => !n.read && n.userId !== 'ADMIN_GROUP');
                            for (const n of unreadSystem) {
                              await updateDoc(doc(db, 'notifications', n.id), { read: true });
                            }
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wider"
                        >
                          Limpar Lidas
                        </button>
                      </div>
                      <div className="max-h-[400px] overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-10 text-center">
                            <Bell size={40} className="mx-auto text-[#E7E5E4] mb-3" />
                            <p className="text-xs text-[#A8A29E] font-medium">Nenhuma notifica√ß√£o</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-[#E7E5E4]">
                            {notifications.filter(n => !n.read).map(n => (
                              <div key={n.id} className={`p-4 hover:bg-[#FAFAF9] transition-colors ${n.type === 'STOCK_ZERO' ? 'bg-rose-50/30' : ''}`}>
                                <div className="flex gap-3">
                                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                    n.type === 'STOCK_ZERO' ? 'bg-rose-100 text-rose-600' : 
                                    n.type === 'REQUEST' ? 'bg-blue-100 text-blue-600' : 'bg-[#F5F5F4] text-[#78716C]'
                                  }`}>
                                    {n.type === 'STOCK_ZERO' ? <AlertTriangle size={14} /> : <Info size={14} />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-[#1C1917] mb-0.5">{n.title}</p>
                                    <p className="text-[11px] text-[#57534E] leading-relaxed mb-2">{n.message}</p>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[9px] text-[#A8A29E] font-medium">
                                        {new Date(n.date).toLocaleDateString('pt-BR')} {new Date(n.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      {n.type === 'STOCK_ZERO' ? (
                                        <button 
                                          onClick={() => setShowStockConfirm({ show: true, notificationId: n.id, itemName: n.itemName })}
                                          className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-1 rounded-lg hover:bg-rose-200 transition-all border border-rose-200"
                                        >
                                          Confirmar Ci√™ncia
                                        </button>
                                      ) : (
                                        <button 
                                          onClick={() => updateDoc(doc(db, 'notifications', n.id), { read: true })}
                                          className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-all"
                                        >
                                          Marcar como lida
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {notifications.filter(n => n.read).length > 0 && notifications.filter(n => !n.read).length === 0 && (
                               <div className="p-10 text-center">
                                 <CheckCircle size={40} className="mx-auto text-emerald-100 mb-3" />
                                 <p className="text-xs text-[#A8A29E] font-medium">Tudo em dia!</p>
                               </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input 
                type="text" 
                placeholder="Buscar insumos e lotes..."
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 text-slate-800 shadow-sm transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {activeTab === 'inventory' && isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-2xl border border-slate-200/90 shadow-sm hover:border-blue-300 transition-all">
                  <Filter size={15} className="text-blue-600" />
                  <select 
                    className="text-xs font-extrabold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">Todos os Tipos</option>
                    {Array.from(new Set([...Object.keys(CATEGORY_COLORS), ...categories, ...items.map(i => i.category).filter(Boolean)])).sort().map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-2xl border border-slate-200/90 shadow-sm hover:border-blue-300 transition-all">
                  <TrendingUp size={15} className="text-blue-600" />
                  <select 
                    className="text-xs font-extrabold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                    value={inventorySort}
                    onChange={e => setInventorySort(e.target.value as any)}
                  >
                    <option value="name_asc">A-Z (Nome)</option>
                    <option value="name_desc">Z-A (Nome)</option>
                    <option value="duration_asc">Dura√ß√£o (Menor-Maior)</option>
                    <option value="duration_desc">Dura√ß√£o (Maior-Menor)</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-2xl border border-slate-200/90 shadow-sm hover:border-blue-300 transition-all">
                  <Filter size={15} className="text-blue-600" />
                  <select 
                    className="text-xs font-extrabold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                    value={originFilter}
                    onChange={e => setOriginFilter(e.target.value as any)}
                  >
                    <option value="all">Todas Origens</option>
                    <option value="contract">Contrato</option>
                    <option value="extra">Extra</option>
                    <option value="donation">Doa√ß√£o</option>
                  </select>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button 
                      onClick={handleExportInventory}
                      className="p-2 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50/50 transition-all shadow-sm"
                      title="Baixar Planilha Excel"
                    >
                      <Download size={18} />
                    </button>
                    <button 
                      onClick={handleExportInventoryPDF}
                      className="p-2 bg-white border border-slate-200 rounded-2xl text-rose-600 hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-all shadow-sm"
                      title="Baixar Relat√≥rio PDF de Todo Estoque"
                    >
                      <Printer size={18} />
                    </button>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'dashboard' && (isAdmin || selectedSector === 'Farm√°cia') && (
              <>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white px-4.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-2 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-blue-600/20"
                >
                  <Plus size={18} /> Nova Entrada
                </button>
                <button 
                  onClick={() => setShowTransactionModal({ show: true, type: 'exit' })}
                  className="bg-gradient-to-r from-rose-600 to-rose-700 text-white px-4.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-2 hover:from-rose-700 hover:to-rose-800 transition-all shadow-md shadow-rose-600/20"
                >
                  <ArrowUpRight size={18} /> Nova Sa√≠da
                </button>
              </>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && isAdmin && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-8"
            >
              {/* 4 Primary KPI Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Card 1: Volume Total */}
                <div className="bg-white rounded-xl border border-blue-100/80 shadow-xs hover:shadow-sm hover:border-blue-200 transition-all duration-200 overflow-hidden group relative">
                  <div className="h-1 w-full bg-gradient-to-r from-blue-600 to-cyan-500" />
                  <div className="p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Volume em Estoque</span>
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-1.5 rounded-lg shadow-xs group-hover:scale-105 transition-transform">
                        <Package size={15} />
                      </div>
                    </div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">{totalVolume.toLocaleString('pt-BR')}</h3>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                        {groupedArray.length} tipos de insumos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Patrim√¥nio */}
                {(isAdmin || selectedSector === 'Farm√°cia') && (
                  <div className="bg-white rounded-xl border border-indigo-100/80 shadow-xs hover:shadow-sm hover:border-indigo-200 transition-all duration-200 overflow-hidden group relative">
                    <div className="h-1 w-full bg-gradient-to-r from-indigo-600 to-blue-600" />
                    <div className="p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Patrim√¥nio Investido</span>
                        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-1.5 rounded-lg shadow-xs group-hover:scale-105 transition-transform">
                          <DollarSign size={15} />
                        </div>
                      </div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight select-all">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInventoryValue)}
                      </h3>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wider flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                          Valor financeiro ativo
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Card 3: Pend√™ncias / Solicita√ß√µes */}
                <div 
                  onClick={() => setActiveTab('requests')}
                  className="bg-white rounded-xl border border-sky-100/80 shadow-xs hover:shadow-sm hover:border-sky-300 transition-all duration-200 overflow-hidden group cursor-pointer relative"
                >
                  <div className="h-1 w-full bg-gradient-to-r from-sky-500 to-blue-600" />
                  <div className="p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Solicita√ß√µes Pendentes</span>
                      <div className="bg-gradient-to-br from-sky-500 to-blue-600 text-white p-1.5 rounded-lg shadow-xs group-hover:scale-105 transition-transform">
                        <Clock size={15} />
                      </div>
                    </div>
                    <h3 className={`text-xl font-black tracking-tight ${pendingRequestsCount > 0 ? 'text-sky-700' : 'text-slate-900'}`}>
                      {pendingRequestsCount}
                    </h3>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${pendingRequestsCount > 0 ? 'bg-sky-50 text-sky-800 border border-sky-200' : 'bg-slate-50 text-slate-600 border border-slate-100'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pendingRequestsCount > 0 ? 'bg-sky-500' : 'bg-slate-400'}`} />
                        {pendingRequestsCount > 0 ? 'Aguardando atendimento' : 'Nenhuma pend√™ncia'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 4: N√≠vel Cr√≠tico / Alertas */}
                <div 
                  onClick={() => totalAlertsCount > 0 && setShowDetailModal({ 
                    show: true, 
                    type: 'all_alerts', 
                    items: [...expiredItems, ...lowStockItems, ...nearExpiryItems] as any 
                  })}
                  className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden group cursor-pointer relative ${
                    totalAlertsCount > 0
                      ? 'border-amber-200/80 shadow-xs hover:border-amber-300 hover:shadow-sm'
                      : 'border-blue-100/80 shadow-xs hover:border-blue-200'
                  }`}
                >
                  <div className={`h-1 w-full ${expiredItems.length > 0 ? 'bg-gradient-to-r from-rose-600 to-amber-500' : lowStockItems.length > 0 ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-gradient-to-r from-emerald-500 to-blue-500'}`} />
                  <div className="p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Aten√ß√£o Necess√°ria</span>
                      <div className={`p-1.5 rounded-lg shadow-xs group-hover:scale-105 transition-transform text-white ${
                        expiredItems.length > 0 ? 'bg-gradient-to-br from-rose-600 to-amber-600' : lowStockItems.length > 0 ? 'bg-gradient-to-br from-amber-500 to-rose-500' : 'bg-gradient-to-br from-emerald-500 to-blue-600'
                      }`}>
                        <AlertTriangle size={15} />
                      </div>
                    </div>
                    <h3 className={`text-xl font-black tracking-tight ${expiredItems.length > 0 ? 'text-rose-600' : lowStockItems.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                      {totalAlertsCount}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {totalAlertsCount === 0 ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Tudo em dia
                        </span>
                      ) : (
                        <>
                          {expiredItems.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-rose-600" />
                              {expiredItems.length} vencido{expiredItems.length > 1 ? 's' : ''}
                            </span>
                          )}
                          {lowStockItems.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-amber-500" />
                              {lowStockItems.length} baixo estoque
                            </span>
                          )}
                          {nearExpiryItems.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-sky-500" />
                              {nearExpiryItems.length} pr√≥x. vencer
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Category Volume Distribution Bar Chart Section */}
              {categoryDistribution.length > 0 && (
                <div className="bg-white rounded-3xl border border-blue-100 p-6 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-50 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100">
                        <BarChart3 size={20} />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider">
                          Distribui√ß√£o de Estoque por Categoria
                        </h4>
                        <p className="text-xs text-slate-500">
                          {distribViewMode === 'types' 
                            ? 'Variedade e diversidade por tipo de produto cadastrado (prioridade)' 
                            : 'Volume acumulado por quantidade total de unidades em estoque'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setDistribViewMode('types')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                          distribViewMode === 'types'
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Por Tipos de Produto
                      </button>
                      <button
                        type="button"
                        onClick={() => setDistribViewMode('units')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                          distribViewMode === 'units'
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Por Unidades
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                    {categoryDistribution.map((cat) => {
                      const displayPercentage = distribViewMode === 'types' ? cat.typePercentage : cat.unitPercentage;
                      return (
                        <div 
                          key={cat.category} 
                          onClick={() => {
                            setCategoryFilter(cat.category);
                            setActiveTab('inventory');
                          }}
                          className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 hover:border-blue-300 hover:bg-blue-50/50 transition-all cursor-pointer group"
                          title={`Clique para ver os produtos da categoria ${cat.category} no estoque`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-800 truncate max-w-[170px] group-hover:text-blue-700 transition-colors">{cat.category}</span>
                            <span className="text-xs font-black text-blue-700 bg-blue-100/70 group-hover:bg-blue-600 group-hover:text-white transition-all px-2.5 py-0.5 rounded-md">
                              {distribViewMode === 'types' ? `${cat.count} ${cat.count === 1 ? 'tipo' : 'tipos'}` : `${cat.totalQty.toLocaleString('pt-BR')} un`}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 h-2.5 rounded-full transition-all duration-500"
                              style={{ width: `${displayPercentage}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center mt-2.5 text-[10px] text-slate-600 font-medium">
                            <span className="font-extrabold text-slate-700">
                              {distribViewMode === 'types' 
                                ? `${cat.totalQty.toLocaleString('pt-BR')} un em estoque` 
                                : `${cat.count} tipos de produtos`}
                            </span>
                            <span>{cat.value > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cat.value) : ''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bento Grid Split Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Central de Alertas Cr√≠ticos (5/12 cols) */}
                <div className="lg:col-span-5 bg-white rounded-3xl border border-blue-100 shadow-sm overflow-hidden space-y-0">
                  <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-400/30">
                        <AlertTriangle size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-white">
                          Central de Alertas Cr√≠ticos
                        </h4>
                        <p className="text-[10px] text-blue-200 font-medium">
                          Itens vencidos, com estoque baixo ou pr√≥ximos ao vencimento
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowCriticalReportModal(true)}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 rounded-xl text-[11px] font-extrabold transition-all flex items-center gap-1 shadow-xs"
                        title="Escolher e Imprimir Relat√≥rio PDF (Validade / Estoque Baixo / Geral)"
                      >
                        <Printer size={13} /> Relat√≥rio PDF
                      </button>
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-400/30">
                        {totalAlertsCount}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-3 max-h-[480px] overflow-y-auto">
                    {totalAlertsCount === 0 && (
                      <div className="py-14 text-center">
                        <CheckCircle size={40} className="mx-auto text-emerald-500 mb-3" />
                        <p className="text-sm text-slate-800 font-bold mb-1">Estoque 100% em Conformidade</p>
                        <p className="text-xs text-slate-500 max-w-xs mx-auto">
                          Nenhum insumo apresentou n√≠vel cr√≠tico de reposi√ß√£o, vencimento ultrapassado ou data de expira√ß√£o pr√≥xima.
                        </p>
                      </div>
                    )}

                    {/* Expired Items - High Urgency Red */}
                    {expiredItems.map(item => (
                      <div key={`expired-${item.id}`} className="flex items-center justify-between p-3.5 bg-rose-50/90 rounded-2xl border border-rose-200 hover:bg-rose-100/80 transition-all duration-200">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-rose-100 text-rose-700 border-rose-300 font-black">
                            <Calendar size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="font-extrabold text-xs text-slate-900 truncate leading-tight">{item.name}</p>
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-rose-200 text-rose-800 border border-rose-300">Vencido</span>
                            </div>
                            <p className="text-[10px] font-bold mt-0.5 text-rose-700">
                              Expirou em: {new Date(item.expiry_date!).toLocaleDateString('pt-BR')} ({item.quantity} un em estoque)
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowTransactionModal({ show: true, type: 'exit', item })}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-all shadow-sm shrink-0 ml-2"
                        >
                          Retirar por Desperd√≠cio
                        </button>
                      </div>
                    ))}

                    {/* Low Stock Items */}
                    {lowStockItems.map(group => (
                      <div key={`low-${group.name}`} className="flex items-center justify-between p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/60 hover:bg-amber-50 transition-all duration-200">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 bg-amber-100 text-amber-900 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border border-amber-200">
                            {group.total_quantity}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="font-extrabold text-xs text-slate-900 truncate leading-tight">{group.name}</p>
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-200 text-amber-900">Estoque Baixo</span>
                            </div>
                            <p className="text-[10px] text-amber-800 font-semibold mt-0.5">
                              Abaixo do m√≠nimo recomendado ({group.min_quantity} un)
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowTransactionModal({ show: true, type: 'entry', item: group.batches[0] })}
                          className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:from-amber-700 hover:to-amber-800 transition-all shadow-sm shrink-0 ml-2"
                        >
                          Repor
                        </button>
                      </div>
                    ))}

                    {/* Near Expiry Items */}
                    {nearExpiryItems.map(item => (
                      <div key={`exp-${item.id}`} className="flex items-center justify-between p-3.5 bg-sky-50/60 rounded-2xl border border-sky-200/80 hover:bg-sky-50 transition-all duration-200">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-sky-100 text-sky-800 border-sky-200">
                            <Calendar size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="font-extrabold text-xs text-slate-900 truncate leading-tight">{item.name}</p>
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-sky-200 text-sky-900">Pr√≥x. Vencer</span>
                            </div>
                            <p className="text-[10px] font-bold mt-0.5 text-sky-800">
                              Vence em: {new Date(item.expiry_date!).toLocaleDateString('pt-BR')} ({item.quantity} un)
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowTransactionModal({ show: true, type: 'exit', item })}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 transition-all shadow-sm shrink-0 ml-2"
                        >
                          Retirar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: Movimenta√ß√µes Recentes (7/12 cols) */}
                <div className="lg:col-span-7 bg-white rounded-3xl border border-blue-100 shadow-sm overflow-hidden space-y-0">
                  <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/30">
                        <History size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-white">
                          Movimenta√ß√µes Recentes do Estoque
                        </h4>
                        <p className="text-[10px] text-blue-200 font-medium">
                          Hist√≥rico de sa√≠das e entradas registradas no almoxarifado
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-1 rounded-full">
                      √öltimos 5 registros
                    </span>
                  </div>

                  <div className="p-5 space-y-3 max-h-[480px] overflow-y-auto">
                    {recentTransactions.length === 0 && (
                      <div className="py-14 text-center">
                        <History size={40} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-sm text-slate-800 font-bold">Sem registros no momento</p>
                        <p className="text-xs text-slate-500">Nenhuma movimenta√ß√£o realizada nesta localiza√ß√£o.</p>
                      </div>
                    )}

                    {recentTransactions.map(t => (
                      <div key={t.id} className="group flex gap-3.5 p-3 hover:bg-blue-50/40 rounded-2xl transition-all duration-200 border border-slate-100 hover:border-blue-200">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${t.type === 'entry' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                          {t.type === 'entry' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-extrabold text-xs text-slate-900 truncate leading-tight" title={t.item_name}>
                              {t.item_name}
                            </p>
                            <span className={`text-xs font-black shrink-0 px-2 py-0.5 rounded-md ${t.type === 'entry' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                              {t.type === 'entry' ? '+' : '-'}{t.quantity} un
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                            {t.type === 'entry' ? 'Entrada / Adi√ß√£o em estoque' : `Sa√≠da e entrega p/ setor: ${t.sector || '---'}`}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 pt-1.5 border-t border-dashed border-slate-200/80">
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Clock size={11} />
                              {new Date(t.date).toLocaleDateString('pt-BR')} √†s {new Date(t.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {t.responsible && (
                              <span className="text-[9px] text-blue-800 font-bold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                                {t.responsible.split('@')[0]}
                              </span>
                            )}
                            {t.supplier && (
                              <span className="text-[9px] text-amber-800 font-bold bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                                Forn: {t.supplier}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && !t.deletedAt && (
                          <button 
                            onClick={() => {
                              setDeletionReason('');
                              setShowDeleteModal({ show: true, transactionId: t.id });
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all self-center opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                            title="Excluir Movimenta√ß√£o"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'inventory' && isAdmin && (
            <motion.div 
              key="inventory"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-3xl border border-blue-100/80 shadow-sm">
                {isAdmin ? (
                  <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80">
                    <button 
                      onClick={() => setInventoryLocation('Almoxarifado')}
                      className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-2 ${
                        inventoryLocation === 'Almoxarifado' 
                          ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white shadow-md shadow-blue-600/20' 
                          : 'text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      <Package size={15} /> Almoxarifado Geral
                    </button>
                    <button 
                      onClick={() => setInventoryLocation('Farm√°cia')}
                      className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-2 ${
                        inventoryLocation === 'Farm√°cia' 
                          ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white shadow-md shadow-blue-600/20' 
                          : 'text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      <Users size={15} /> Estoque Farm√°cia
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2 bg-blue-50/80 rounded-2xl border border-blue-100">
                    <div className="p-2 bg-gradient-to-br from-blue-700 to-indigo-900 text-white rounded-xl shadow-sm">
                      {inventoryLocation === 'Farm√°cia' ? <Users size={16} /> : <Package size={16} />}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">
                        Estoque: <span className="text-blue-700">{inventoryLocation === 'Farm√°cia' ? 'Medicamentos (Farm√°cia)' : 'Almoxarifado Geral'}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">Acesso exclusivo aos medicamentos da Farm√°cia</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab('balance')}
                    className="px-4 py-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-indigo-900 text-white font-extrabold text-xs rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                    title="Realizar Balan√ßo e Altera√ß√£o de Especifica√ß√µes de Estoque"
                  >
                    <Scale size={16} className="text-blue-300" />
                    <span>Balan√ßo de Estoque</span>
                  </button>
                  {inventoryLocation === 'Farm√°cia' && (
                    <button 
                      onClick={() => setActiveTab('new-request')}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                      title="Solicitar novos medicamentos ao Almoxarifado Geral"
                    >
                      <Plus size={16} /> Solicitar ao Almoxarifado
                    </button>
                  )}
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                    Visualiza√ß√£o: <span className="text-blue-700 font-black">{inventoryLocation}</span>
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-blue-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white">
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">Item / Insumo</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">Categoria {isAdmin && '/ Fornecedor'}</th>
                    {isAdmin && <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">Origem</th>}
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">{isAdmin ? 'Pre√ßo Un.' : '---'}</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider text-center">Quantidade</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">M√≠nimo</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider text-center">Dura√ß√£o</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">Status Cr√≠tico</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider text-right">A√ß√µes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50/80">
                  {groupedArray.map((group, index) => {
                    const currentMonthInfo = getDurationMonthInfo(group.durationWeeks);
                    const prevMonthInfo = index > 0 ? getDurationMonthInfo(groupedArray[index - 1].durationWeeks) : null;
                    const isNewMonthSection = (inventorySort === 'duration_asc' || inventorySort === 'duration_desc') && (index === 0 || currentMonthInfo.key !== prevMonthInfo?.key);

                    return (
                    <React.Fragment key={group.name}>
                      {isNewMonthSection && (
                        <tr className="bg-slate-100/95 border-y-2 border-slate-300">
                          <td colSpan={isAdmin ? 9 : 8} className="px-6 py-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className={`p-1.5 rounded-lg ${
                                  currentMonthInfo.isCurrentMonth ? 'bg-rose-100 text-rose-700' :
                                  currentMonthInfo.isInfinite ? 'bg-slate-200 text-slate-700' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  <Calendar size={14} />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-black uppercase tracking-wide ${
                                    currentMonthInfo.isCurrentMonth ? 'text-rose-700' :
                                    currentMonthInfo.isInfinite ? 'text-slate-700' :
                                    'text-slate-900'
                                  }`}>
                                    {currentMonthInfo.sectionTitle}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-500">
                                    ({groupedArray.filter(g => getDurationMonthInfo(g.durationWeeks).key === currentMonthInfo.key).length} {groupedArray.filter(g => getDurationMonthInfo(g.durationWeeks).key === currentMonthInfo.key).length === 1 ? 'item' : 'itens'})
                                  </span>
                                </div>
                              </div>
                              {currentMonthInfo.isCurrentMonth && (
                                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                                  Esgota este M√™s
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr 
                        className="bg-white hover:bg-blue-50/40 transition-all cursor-pointer group/row"
                        onClick={() => toggleExpand(group.name)}
                      >
                        <td className="px-6 py-4.5">
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-lg bg-slate-100 text-slate-500 group-hover/row:bg-blue-100 group-hover/row:text-blue-700 transition-all ${expandedItems.has(group.name) ? 'rotate-90 bg-blue-100 text-blue-700' : ''}`}>
                              <ChevronRight size={16} />
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 group/name flex-wrap">
                                <p className="font-extrabold text-sm text-slate-900 group-hover/row:text-blue-700 transition-colors">{group.name}</p>
                                {group.unit_measure && (
                                  <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 uppercase tracking-wider">
                                    {group.unit_measure}
                                  </span>
                                )}
                                {Array.from(new Set(group.batches.map(b => b.medication_type).filter(Boolean))).map(type => (
                                  <span key={type} className="text-[9px] font-black px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100/80 uppercase tracking-wider">
                                    {type}
                                  </span>
                                ))}
                              </div>
                              {group.batches[0]?.description && (
                                <p className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">{group.batches[0].description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4.5">
                          <div className="flex flex-col">
                            <p className="text-xs font-bold text-slate-800">{group.category || '---'}</p>
                            {isAdmin && <p className="text-[10px] font-medium text-slate-400 mt-0.5">{group.supplier || '---'}</p>}
                          </div>
                        </td>
                        <td className="px-6 py-4.5">
                          {isAdmin ? (
                            (() => {
                              const origins = new Set(group.batches.map(b => b.origin));
                              if (origins.size === 1) {
                                const origin = Array.from(origins)[0];
                                return (
                                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md border ${
                                    origin === 'contract' ? 'bg-blue-50 text-blue-700 border-blue-200/80' : 
                                    origin === 'donation' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' : 
                                    'bg-indigo-50 text-indigo-700 border-indigo-200/80'
                                  }`}>
                                    {origin === 'contract' ? 'Contrato' : origin === 'donation' ? 'Doa√ß√£o' : 'Extra'}
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                                  {group.batches.length} Lotes
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-slate-300">---</span>
                          )}
                        </td>
                        <td className="px-6 py-4.5 font-semibold text-slate-600 text-xs">---</td>
                        <td className="px-6 py-4.5">
                          <div className="flex flex-col items-center justify-center bg-slate-50/90 rounded-2xl py-1.5 px-3 border border-slate-200/80 min-w-[80px]">
                            <span className={`text-base font-black ${group.total_quantity <= (group.min_quantity || 0) ? 'text-amber-600' : 'text-slate-900'}`}>
                              {group.total_quantity}
                            </span>
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Estoque Total</span>
                          </div>
                        </td>
                        <td className="px-6 py-4.5 text-xs font-semibold text-slate-600">
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1 font-bold text-slate-800">
                              {group.min_quantity !== undefined && !isNaN(group.min_quantity) ? group.min_quantity : '---'}
                              <TrendingUp size={12} className="text-blue-600" />
                            </span>
                            {group.weeklyExitRate > 0 && <span className="text-[10px] text-slate-400">({group.weeklyExitRate.toFixed(1)}/sem)</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4.5">
                          <div className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl border ${
                            group.durationWeeks === 'infinite' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                            group.durationWeeks <= 4 ? 'bg-rose-50 border-rose-200 text-rose-700' :
                            group.durationWeeks <= 8 ? 'bg-amber-50 border-amber-200 text-amber-700' :
                            'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}>
                            <span className="text-xs font-black">
                              {group.durationWeeks === 'infinite' ? '‚àû' : `${group.durationWeeks.toFixed(1)} sem`}
                            </span>
                            {group.durationWeeks !== 'infinite' && (
                              <span className={`text-[9px] font-extrabold mt-0.5 tracking-tight ${
                                currentMonthInfo.isCurrentMonth ? 'text-rose-700 font-black' : 'text-slate-600'
                              }`}>
                                At√© {currentMonthInfo.shortMonthYear}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4.5 text-xs">
                          {group.durationWeeks !== 'infinite' ? (
                            <span className={`font-black uppercase tracking-tight text-[10px] px-2 py-0.5 rounded-md border ${
                              group.durationWeeks <= 4 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              group.durationWeeks <= 8 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {group.durationWeeks <= 4 ? 'Muito Cr√≠tico' :
                               group.durationWeeks <= 8 ? 'Aten√ß√£o' :
                               'Normal'}
                            </span>
                          ) : (
                            <span className="text-slate-300">---</span>
                          )}
                        </td>
                        <td className="px-6 py-4.5 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <button className="text-xs font-extrabold text-blue-700 group-hover/row:text-blue-900 uppercase tracking-wider flex items-center gap-1">
                              {expandedItems.has(group.name) ? 'Recolher' : 'Ver Lotes'}
                            </button>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {group.batches.length} remessas
                            </span>
                          </div>
                        </td>
                      </tr>
                      
                      {expandedItems.has(group.name) && group.batches.map(item => (
                        <tr key={item.id} className="bg-slate-50/70 hover:bg-blue-50/50 transition-all border-l-4 border-blue-600">
                          <td className="px-12 py-3.5">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-mono font-bold text-slate-800">Lote: {item.batch_number || '---'}</p>
                              {item.unit_measure && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-900 border border-amber-200 uppercase tracking-wide">
                                  {item.unit_measure}
                                </span>
                              )}
                              {item.medication_type && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 border border-slate-300/60 uppercase tracking-wide">
                                  {item.medication_type}
                                </span>
                              )}
                            </div>
                            {item.description && <p className="text-[10px] text-slate-400 italic mt-0.5">{item.description}</p>}
                          </td>
                          <td className="px-6 py-3.5">
                            {isAdmin ? (
                              <p className="text-xs text-slate-600 font-medium">{item.supplier || '---'}</p>
                            ) : (
                              <p className="text-xs text-slate-400">---</p>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            {isAdmin ? (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.origin === 'contract' ? 'bg-blue-100 text-blue-800' : item.origin === 'donation' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                {item.origin === 'contract' ? 'Contrato' : item.origin === 'donation' ? 'Doa√ß√£o' : 'Extra'}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300">---</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-slate-700 font-medium">
                            {isAdmin ? (
                              <span className="font-bold text-slate-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)}</span>
                            ) : (
                              '---'
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <span className={`text-sm font-black ${item.quantity <= (item.min_quantity || 0) ? 'text-amber-600' : 'text-slate-900'}`}>
                              {item.quantity} un
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-slate-300">---</td>
                          <td className="px-6 py-3.5 text-center">
                            {item.expiry_date ? (
                              <span className={`text-xs font-bold ${item.expiry_date === 'Indeterminada' ? 'text-blue-700' : isNearExpiry(item) ? 'text-rose-600 font-black' : 'text-slate-700'}`}>
                                {item.expiry_date === 'Indeterminada' ? 'Indeterminada' : new Date(item.expiry_date).toLocaleDateString('pt-BR')}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs italic">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-slate-300">---</td>
                          <td className="px-6 py-3.5 text-right space-x-1.5">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setShowTransactionModal({ show: true, type: 'entry', item }); }}
                              className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all border border-emerald-200/60"
                              title="Adicionar Entrada"
                            >
                              <Plus size={15} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setShowTransactionModal({ show: true, type: 'exit', item }); }}
                              className="p-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all border border-blue-200/60"
                              title="Registrar Sa√≠da"
                            >
                              <ArrowUpRight size={15} />
                            </button>
                            {isAdmin && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-all border border-rose-200/60"
                                title="Excluir Lote"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-900 text-white border-t-2 border-slate-800">
                  <tr>
                    <td colSpan={4} className="px-6 py-4 font-black text-slate-300 text-right uppercase tracking-wider text-xs">Volume Total em Estoque</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl py-2 px-3 shadow-md border border-blue-500/30">
                        <span className="text-xl font-black">{totalVolume.toLocaleString('pt-BR')}</span>
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-90">Unidades</span>
                      </div>
                    </td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
              </div>
              {filteredItems.length === 0 && (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-blue-100">
                    <Package size={32} />
                  </div>
                  <p className="text-slate-900 font-extrabold text-base">Nenhum item encontrado no estoque</p>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1">Tente ajustar os termos de busca ou selecionar outra categoria nos filtros acima.</p>
                </div>
              )}
              </div>
            </motion.div>
          )}

          {activeTab === 'balance' && isAdmin && (
            <motion.div 
              key="balance"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <StockBalance
                items={items}
                transactions={transactions}
                balances={balances}
                isAdmin={isAdmin}
                currentUserEmail={user?.email || ''}
                currentUserName={userProfile?.name || user?.displayName || user?.email || ''}
                categories={categories}
                onSaveItemAdjustment={handleSaveItemAdjustmentFromBalance}
                onFinalizeBalance={handleFinalizeBalanceFromComponent}
                showToast={showToast}
                appLogo={appLogo}
              />
            </motion.div>
          )}

          {activeTab === 'history' && isAdmin && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-[#E7E5E4] shadow-sm">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-bold text-[#1C1917]">Hist√≥rico de Movimenta√ß√µes</h3>
                  {isAdmin && (
                    <div className="flex items-center gap-2 bg-[#F5F5F4] p-1 rounded-2xl border border-[#E7E5E4]">
                      <button 
                        onClick={() => setInventoryLocation('Almoxarifado')}
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-bold transition-all ${inventoryLocation === 'Almoxarifado' ? 'bg-[#1C1917] text-white shadow-sm' : 'text-[#78716C] hover:bg-[#E7E5E4]'}`}
                      >
                        Almoxarifado
                      </button>
                      <button 
                        onClick={() => setInventoryLocation('Farm√°cia')}
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-bold transition-all ${inventoryLocation === 'Farm√°cia' ? 'bg-[#1C1917] text-white shadow-sm' : 'text-[#78716C] hover:bg-[#E7E5E4]'}`}
                      >
                        Farm√°cia
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {showDeletedHistory && transactions.filter(t => !!t.deletedAt).length > 0 && (
                    <button 
                      onClick={handleRecoverAllTransactions}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm"
                    >
                      <RotateCcw size={14} /> Restaurar Tudo
                    </button>
                  )}
                  <button 
                    onClick={() => setShowDeletedHistory(!showDeletedHistory)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${showDeletedHistory ? 'bg-rose-100 text-rose-700' : 'bg-[#F5F5F4] text-[#78716C] hover:bg-[#E7E5E4]'}`}
                  >
                    {showDeletedHistory ? <History size={14} /> : <Trash2 size={14} />}
                    {showDeletedHistory ? 'Ver Hist√≥rico Ativo' : 'Ver Exclu√≠dos (Testes)'}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Data</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Movimenta√ß√£o</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Lote</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Validade</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-center">Origem</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Setor</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Respons√°vel</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Qtd</th>
                    {isAdmin && <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right whitespace-nowrap">Val. Unit</th>}
                    {isAdmin && <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right whitespace-nowrap">Total</th>}
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">A√ß√µes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E5E4]">
                    {transactions
                      .filter(t => (showDeletedHistory ? !!t.deletedAt : !t.deletedAt) && (t.location || 'Almoxarifado') === inventoryLocation)
                      .map(t => (
                      <tr key={t.id} className={`hover:bg-[#FAFAF9] transition-all ${t.deletedAt ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                        <td className="px-6 py-5 text-sm text-[#57534E] whitespace-nowrap">
                          {new Date(t.date).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${t.type === 'entry' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {t.type === 'entry' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                            {t.type === 'entry' ? 'Entrada' : 'Sa√≠da'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="font-bold whitespace-nowrap">{t.item_name}</div>
                          {t.exitReason && (
                            <div className={`text-[10px] font-bold mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${
                              t.exitReason === 'vencido' 
                                ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                                : t.exitReason === 'perda' 
                                ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                : t.exitReason === 'doacao' 
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              <span>
                                {t.exitReason === 'vencido' ? 'Descarte / Vencimento (Desperd√≠cio)' : 
                                 t.exitReason === 'perda' ? 'Perda / Avaria' : 
                                 t.exitReason === 'doacao' ? 'Doa√ß√£o' : 'Consumo do Setor'}
                              </span>
                              {t.expiryReason && <span className="text-slate-600 font-normal lowercase ml-1">({t.expiryReason})</span>}
                            </div>
                          )}
                          {t.deletionReason && (
                            <div className="text-[10px] text-rose-500 font-bold mt-1">Exclus√£o: {t.deletionReason}</div>
                          )}
                          {t.deletedByEmail && (
                            <div className="text-[10px] text-rose-400 mt-0.5 italic whitespace-nowrap">Por: {t.deletedByEmail}</div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-xs font-mono text-[#78716C] whitespace-nowrap">
                          {t.batch_number || '---'}
                        </td>
                        <td className="px-6 py-5 text-xs text-[#78716C] whitespace-nowrap">
                          {t.expiry_date ? new Date(t.expiry_date).toLocaleDateString('pt-BR') : '---'}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${t.origin === 'contract' ? 'bg-blue-50 text-blue-600' : t.origin === 'donation' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>
                            {t.origin === 'contract' ? 'Contrato' : t.origin === 'donation' ? 'Doa√ß√£o' : 'Extra'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-sm font-medium text-[#78716C]">
                          {t.sector || '---'}
                        </td>
                        <td className="px-6 py-5 text-sm text-[#78716C]">
                          <div className="font-medium">{t.responsible || '---'}</div>
                          <div className="text-[10px] opacity-70">{t.responsibleEmail}</div>
                        </td>
                        <td className="px-6 py-5 text-right font-bold text-lg">
                          {t.quantity}
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-5 text-right text-xs font-medium text-[#78716C]">
                            {(() => {
                              const item = items.find(i => i.id === t.item_id);
                              const price = Number(item?.unit_price) || 0;
                              return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
                            })()}
                          </td>
                        )}
                        {isAdmin && (
                          <td className="px-6 py-5 text-right text-sm font-black text-[#1C1917]">
                            {(() => {
                              const item = items.find(i => i.id === t.item_id);
                              const price = Number(item?.unit_price) || 0;
                              return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.quantity * price);
                            })()}
                          </td>
                        )}
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {t.type === 'exit' && !t.deletedAt && (
                              <button 
                                onClick={() => {
                                  if (t.exitReason === 'doacao') {
                                    handleExportDonationTermPDF({
                                      donatingUnitName: t.donationUnitName,
                                      receivingUnit: {
                                        name: t.sector || 'Unidade Receptora',
                                        address: t.donationUnitAddress || '',
                                        cnpj: t.donationUnitCNPJ || ''
                                      },
                                      items: [{ product_name: t.item_name, quantity: t.quantity, batch_number: t.batch_number, expiry_date: t.expiry_date }],
                                      revisionDate: t.donationRevisionDate || '',
                                      donationNumber: t.donationNumber,
                                      date: t.date
                                    });
                                  } else if (t.exitReason === 'vencido' || t.exitReason === 'perda') {
                                    handleExportDisposalTermPDF({
                                      items: [{
                                        product_name: t.item_name,
                                        quantity: t.quantity,
                                        batch_number: t.batch_number,
                                        expiry_date: t.expiry_date,
                                        category: items.find(i => i.id === t.item_id)?.category
                                      }],
                                      reason: t.exitReason,
                                      justification: t.expiryReason,
                                      location: t.location,
                                      responsible: t.responsible || 'Respons√°vel',
                                      date: t.date
                                    });
                                  } else {
                                    handleExportDeliveryReceiptPDF({
                                      sector: t.sector || 'Sem Setor',
                                      items: [{ product_name: t.item_name, quantity: t.quantity }],
                                      date: t.date
                                    });
                                  }
                                }}
                                className={`p-2 rounded-lg transition-all ${
                                  t.exitReason === 'vencido' || t.exitReason === 'perda'
                                    ? 'text-rose-600 hover:bg-rose-50'
                                    : t.exitReason === 'doacao'
                                    ? 'text-indigo-600 hover:bg-indigo-50'
                                    : 'text-blue-600 hover:bg-blue-50'
                                }`}
                                title={
                                  t.exitReason === 'doacao' ? 'Reimprimir Termo de Doa√ß√£o' : 
                                  (t.exitReason === 'vencido' || t.exitReason === 'perda') ? 'Reimprimir Termo de Descarte' : 
                                  'Reimprimir Recibo de Entrega'
                                }
                              >
                                {t.exitReason === 'doacao' ? <FileText size={18} /> : 
                                 (t.exitReason === 'vencido' || t.exitReason === 'perda') ? <Trash2 size={18} /> : 
                                 <Printer size={18} />}
                              </button>
                            )}
                            {t.deletedAt ? (
                              <button 
                                onClick={() => handleRecoverTransaction(t.id)}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title="Recuperar Movimenta√ß√£o"
                              >
                                <RotateCcw size={18} />
                              </button>
                            ) : (
                              <button 
                                onClick={() => {
                                  setDeletionReason('');
                                  setShowDeleteModal({ show: true, transactionId: t.id });
                                }}
                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                title="Apagar Movimenta√ß√£o"
                              >
                                <Trash2 size={20} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {((showDeletedHistory && transactions.filter(t => !!t.deletedAt && (t.location || 'Almoxarifado') === inventoryLocation).length === 0) || 
                  (!showDeletedHistory && transactions.filter(t => !t.deletedAt && (t.location || 'Almoxarifado') === inventoryLocation).length === 0)) && (
                  <div className="p-20 text-center">
                    <History className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                    <p className="text-[#78716C]">Nenhuma movimenta√ß√£o encontrada para {inventoryLocation}.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {activeTab === 'reports' && isAdmin && (
            <motion.div 
              key="reports"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8"
            >
              {/* Executive Reports Banner - Minimalist & Clean Light Theme */}
              <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/80 shadow-xs text-slate-900">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200/80">
                        <BarChart3 size={13} className="text-blue-600" />
                        Intelig√™ncia Anal√≠tica de Estoque
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/80">
                        {reportSectorFilter === 'all' ? 'Todos os Setores' : reportSectorFilter}
                      </span>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Relat√≥rios & Gest√£o de Consumo
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                      Proje√ß√µes or√ßament√°rias, hist√≥rico de sa√≠das, curva de movimenta√ß√£o f√≠sica e relat√≥rios fiscais do almoxarifado.
                    </p>
                  </div>

                  {/* Minimalist Summary Badges */}
                  <div className="flex items-center gap-3 sm:gap-4 bg-slate-50 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 shrink-0">
                    <div className="px-3 py-1 text-center">
                      <p className="text-[10px] uppercase font-extrabold text-emerald-600 tracking-wider">Entradas</p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{reportData.entries}</p>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div className="px-3 py-1 text-center">
                      <p className="text-[10px] uppercase font-extrabold text-rose-600 tracking-wider">Sa√≠das</p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{reportData.exits}</p>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div className="px-3 py-1 text-center">
                      <p className="text-[10px] uppercase font-extrabold text-amber-600 tracking-wider">Devolu√ß√µes</p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{reportData.totalReturnsCount}</p>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div className="px-3 py-1 text-center">
                      <p className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Per√≠odo</p>
                      <p className="text-xs font-bold text-slate-700 mt-1">
                        {new Date(reportRange.start + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - {new Date(reportRange.end + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {reportsTab === 'overview' && (
                <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
                {/* Purchase Planning Card - Left Column Spanning 2 Rows */}
                <div className="lg:row-span-2 bg-white p-6 rounded-3xl border border-indigo-100/90 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group flex flex-col justify-between bg-gradient-to-b from-white via-white to-indigo-50/20">
                  <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-800 absolute top-0 left-0" />
                  <div className="flex items-start gap-4 pt-2">
                    <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 text-white p-3 rounded-2xl shadow-md shadow-indigo-600/20 group-hover:scale-105 transition-transform shrink-0">
                      <ShoppingCart size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                          Novo Recurso
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          Estimativa Precisa
                        </span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">Planejamento de Compras</h3>
                      <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">
                        Calcula a quantidade necess√°ria de cada item para durar at√© o m√™s de interesse (ex: Abril).
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-4 pt-3.5 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">M√™s Alvo</label>
                        <select 
                          value={planningTargetMonth}
                          onChange={(e) => setPlanningTargetMonth(Number(e.target.value))}
                          className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs text-slate-800 cursor-pointer"
                        >
                          {['Janeiro', 'Fevereiro', 'Mar√ßo', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
                            <option key={idx} value={idx}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Ano</label>
                        <select 
                          value={planningTargetYear}
                          onChange={(e) => setPlanningTargetYear(Number(e.target.value))}
                          className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs text-slate-800 cursor-pointer"
                        >
                          {Array.from({ length: 4 }).map((_, i) => {
                            const y = new Date().getFullYear() + i;
                            return <option key={y} value={y}>{y}</option>;
                          })}
                        </select>
                      </div>
                    </div>

                    <div className="bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 block">Demanda Estimada</span>
                        <span className="font-black text-slate-800 text-sm">
                          {purchasePlanningSummary.totalItemsWithDeficit} itens <span className="text-slate-400 text-xs font-semibold">({purchasePlanningSummary.totalUnitsToBuy.toLocaleString('pt-BR')} un)</span>
                        </span>
                      </div>
                      <span className="text-[10px] font-bold bg-white px-2 py-1 rounded-lg border border-indigo-200 text-indigo-700 shadow-2xs">
                        ~{purchasePlanningSummary.totalTargetWeeks} sem
                      </span>
                    </div>

                    <button 
                      onClick={() => setShowPurchasePlanningModal(true)}
                      className="w-full bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 text-white px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap cursor-pointer"
                    >
                      <ShoppingCart size={15} /> Abrir Painel de Compras
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={handleExportPurchasePlanningPDF}
                        className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title="Baixar Relat√≥rio PDF de Compras"
                      >
                        <Printer size={12} className="text-rose-600" /> Exportar PDF
                      </button>
                      <button 
                        onClick={handleExportPurchasePlanningExcel}
                        className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title="Baixar Planilha Excel de Compras"
                      >
                        <Download size={12} className="text-emerald-600" /> Planilha Excel
                      </button>
                    </div>
                  </div>
                </div>

                {/* Top Row - Col 2: Print Requests Section */}
                {isAdmin ? (
                  <div className="bg-white p-6 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group flex flex-col justify-between h-full">
                    <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-indigo-600 absolute top-0 left-0" />
                    <div className="flex items-start gap-4 pt-2">
                      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-3 rounded-2xl shadow-md shadow-blue-600/20 group-hover:scale-105 transition-transform shrink-0">
                        <Printer size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 leading-tight">Impress√£o de Solicita√ß√µes</h3>
                        <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">Imprima as solicita√ß√µes pendentes e em separa√ß√£o por per√≠odo</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 mt-5 pt-4 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-2 w-full">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">In√≠cio</label>
                          <input 
                            type="date" 
                            value={printRange.start}
                            onChange={(e) => setPrintRange({...printRange, start: e.target.value})}
                            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-xs text-slate-800 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Fim</label>
                          <input 
                            type="date" 
                            value={printRange.end}
                            onChange={(e) => setPrintRange({...printRange, end: e.target.value})}
                            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-xs text-slate-800 cursor-pointer"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={handlePrintRequests}
                        className="w-full bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-blue-600/20 whitespace-nowrap cursor-pointer"
                      >
                        <Printer size={15} /> Imprimir Relat√≥rio
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group flex flex-col justify-between h-full">
                    <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-cyan-500 absolute top-0 left-0" />
                    <div className="flex items-start gap-4 pt-2">
                      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-3.5 rounded-2xl shadow-md shadow-blue-600/20 group-hover:scale-105 transition-transform shrink-0">
                        <BookOpen size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">Cat√°logo de Itens</h3>
                        <p className="text-slate-500 text-xs font-medium mt-1">Baixe o cat√°logo contendo os nomes dos materiais e categorias cadastradas.</p>
                      </div>
                    </div>
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <button 
                        onClick={handleExportMaterialsCatalogPDF}
                        className="w-full bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-blue-600/20 whitespace-nowrap cursor-pointer"
                      >
                        <Printer size={15} /> Ver Cat√°logo
                      </button>
                    </div>
                  </div>
                )}

                {/* Top Row - Col 3: PCA Report Section */}
                <div className="bg-white p-6 rounded-3xl border border-emerald-100/80 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group flex flex-col justify-between h-full">
                  <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 to-teal-600 absolute top-0 left-0" />
                  <div className="flex items-start gap-4 pt-2">
                    <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-3 rounded-2xl shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform shrink-0">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">Relat√≥rio PCA</h3>
                      <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">Plano Anual de Contrata√ß√£o - Consumo por tipo no per√≠odo</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 mt-5 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">In√≠cio</label>
                        <input 
                          type="date" 
                          value={pcaRange.start}
                          onChange={(e) => setPcaRange({...pcaRange, start: e.target.value})}
                          className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 font-bold text-xs text-slate-800 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Fim</label>
                        <input 
                          type="date" 
                          value={pcaRange.end}
                          onChange={(e) => setPcaRange({...pcaRange, end: e.target.value})}
                          className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 font-bold text-xs text-slate-800 cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <select 
                          value={pcaCategory}
                          onChange={(e) => setPcaCategory(e.target.value)}
                          className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 font-bold text-xs text-slate-800 cursor-pointer"
                        >
                          <option value="all">Todas Categorias</option>
                          {Object.keys(CATEGORY_COLORS).sort().map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <button 
                        onClick={handleExportPCA}
                        className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-3.5 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 hover:from-emerald-700 hover:to-teal-800 transition-all shadow-md shadow-emerald-600/20 whitespace-nowrap cursor-pointer shrink-0"
                      >
                        <Download size={14} /> Gerar PCA
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Row - Col 2: Critical Materials Report Section (Directly under Impressao de Solicitacoes) */}
                <div className="bg-white p-6 rounded-3xl border border-amber-100/90 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group flex flex-col justify-between h-full">
                  <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 absolute top-0 left-0" />
                  <div className="flex items-start gap-4 pt-2">
                    <div className="bg-gradient-to-br from-amber-500 to-rose-600 text-white p-3 rounded-2xl shadow-md shadow-amber-600/20 group-hover:scale-105 transition-transform shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">Relat√≥rio de Materiais Cr√≠ticos</h3>
                      <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">Exporta√ß√£o em PDF: Validade vencida/pr√≥xima e Estoque baixo</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button 
                        onClick={() => handleExportCriticalReportPDF('expiry')}
                        className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                        title="Gerar PDF exclusivo de itens vencidos e pr√≥ximos ao vencimento"
                      >
                        <Clock size={13} className="text-rose-600 shrink-0" />
                        <span className="truncate">Validade ({expiredItems.length + nearExpiryItems.length})</span>
                      </button>
                      <button 
                        onClick={() => handleExportCriticalReportPDF('low_stock')}
                        className="w-full bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                        title="Gerar PDF exclusivo de estoque baixo e ruptura"
                      >
                        <TrendingDown size={13} className="text-amber-600 shrink-0" />
                        <span className="truncate">Estoque Baixo ({lowStockItems.length})</span>
                      </button>
                    </div>
                    <button 
                      onClick={() => handleExportCriticalReportPDF('all')}
                      className="w-full bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 hover:from-slate-800 hover:to-slate-950 text-white px-4 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                      title="Gerar PDF completo e consolidado"
                    >
                      <Printer size={14} />
                      <span>Relat√≥rio Completo ({totalAlertsCount})</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Row - Col 3: ApuraSUS Section (Directly under Relatorio PCA) */}
                <div className="bg-white p-6 rounded-3xl border border-blue-100/90 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group flex flex-col justify-between h-full">
                  <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 absolute top-0 left-0" />
                  <div className="flex items-start gap-4 pt-2">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-3 rounded-2xl shadow-md shadow-blue-600/20 group-hover:scale-105 transition-transform shrink-0">
                      <BarChart3 size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                          M√≥dulo ApuraSUS
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          Gest√£o de Custos SUS
                        </span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">Relat√≥rios Oficiais ApuraSUS</h3>
                      <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">Produ√ß√£o f√≠sica mensal e rateio de custos financeiros por setor e categoria</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button 
                        onClick={() => setReportsTab('apurasus_producao')}
                        className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                        title="Acessar Produ√ß√£o F√≠sica Mensal do Almoxarifado"
                      >
                        <Package size={13} className="text-blue-600 shrink-0" />
                        <span className="truncate">Produ√ß√£o Mensal</span>
                      </button>
                      <button 
                        onClick={() => setReportsTab('apurasus_custos')}
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                        title="Acessar Demonstrativo de Custos por Tipo e Setores"
                      >
                        <DollarSign size={13} className="text-indigo-600 shrink-0" />
                        <span className="truncate">Custos por Setor</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {isAdmin ? (
                  <>
                    {/* Card 1: Entradas */}
                    <div className="bg-white rounded-2xl border border-emerald-100/80 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-300 overflow-hidden group relative">
                      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-teal-600" />
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Entradas no Per√≠odo</span>
                          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-3 rounded-2xl shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                            <TrendingUp size={20} />
                          </div>
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{reportData.entries.toLocaleString('pt-BR')}</h3>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor Financeiro</span>
                          <span className="text-xs font-black text-emerald-600">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.entriesValue)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Sa√≠das */}
                    <div className="bg-white rounded-2xl border border-rose-100/80 shadow-sm hover:shadow-md hover:border-rose-200 transition-all duration-300 overflow-hidden group relative">
                      <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 to-pink-600" />
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Sa√≠das / Consumo</span>
                          <div className="bg-gradient-to-br from-rose-600 to-pink-700 text-white p-3 rounded-2xl shadow-md shadow-rose-500/20 group-hover:scale-105 transition-transform">
                            <TrendingDown size={20} />
                          </div>
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{reportData.exits.toLocaleString('pt-BR')}</h3>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor Baixado</span>
                          <span className="text-xs font-black text-rose-600">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.exitsValue)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Valor em Estoque */}
                    <div className="bg-white rounded-2xl border border-indigo-100/80 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-300 overflow-hidden group relative">
                      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-blue-600" />
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Patrim√¥nio em Saldo</span>
                          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-3 rounded-2xl shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                            <DollarSign size={20} />
                          </div>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.totalValue)}
                        </h3>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                            Valor total ativo
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Itens Ativos */}
                    <div className="bg-white rounded-2xl border border-blue-100/80 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-300 overflow-hidden group relative">
                      <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-cyan-500" />
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Insumos Cadastrados</span>
                          <div className="bg-gradient-to-br from-blue-600 to-cyan-700 text-white p-3 rounded-2xl shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                            <Package size={20} />
                          </div>
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{items.length}</h3>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                            Itens no cat√°logo
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-white p-6 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-all lg:col-span-2 overflow-hidden relative group">
                      <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 to-pink-600 absolute top-0 left-0" />
                      <p className="text-slate-500 text-xs font-black uppercase tracking-wider mb-3">Consumo do Setor no Per√≠odo</p>
                      <div className="flex items-center gap-5">
                        <div className="bg-rose-50 p-4 rounded-2xl text-rose-600 border border-rose-100 group-hover:scale-105 transition-transform">
                          <ArrowDownLeft size={32} />
                        </div>
                        <div>
                          <h3 className="text-4xl font-black text-rose-600">{reportData.exits.toLocaleString('pt-BR')}</h3>
                          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mt-0.5">Unidades Recebidas</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm hover:shadow-md transition-all lg:col-span-2 overflow-hidden relative group">
                      <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 to-indigo-600 absolute top-0 left-0" />
                      <p className="text-slate-500 text-xs font-black uppercase tracking-wider mb-3">Solicita√ß√µes no Per√≠odo</p>
                      <div className="flex items-center gap-5">
                        <div className="bg-blue-50 p-4 rounded-2xl text-blue-600 border border-blue-100 group-hover:scale-105 transition-transform">
                          <FileText size={32} />
                        </div>
                        <div>
                          <h3 className="text-4xl font-black text-blue-600">
                            {requests.filter(r => {
                              const d = new Date(r.date);
                              return r.sector === selectedSector && !r.deletedAt && d >= startOfDay(parseISO(reportRange.start)) && d <= endOfDay(parseISO(reportRange.end));
                            }).length}
                          </h3>
                          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mt-0.5">Pedidos Realizados</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Visual Overview Section Header */}
              <div className="flex items-center justify-between px-1 pt-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100">
                    <BarChart3 size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Panorama Visual de Consumo & Movimenta√ß√£o</h3>
                    <p className="text-xs text-slate-500 font-medium">Gr√°ficos interativos para acompanhamento gerencial das opera√ß√µes</p>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Movement Chart */}
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <Activity size={18} className="text-blue-600" /> Movimenta√ß√£o {isAdmin ? 'Geral' : 'do Setor'}
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">Fluxo Di√°rio</span>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportData.daily}>
                        <defs>
                          <linearGradient id="colorEntries" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorExits" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                        />
                        {isAdmin && <Area type="monotone" dataKey="entries" name="Entradas" stroke="#10b981" fillOpacity={1} fill="url(#colorEntries)" strokeWidth={3} />}
                        <Area type="monotone" dataKey="exits" name={isAdmin ? "Sa√≠das" : "Consumo"} stroke="#f43f5e" fillOpacity={1} fill="url(#colorExits)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <PieChartIcon size={18} className="text-amber-500" /> Distribui√ß√£o de Consumo por Categoria
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">Propor√ß√£o</span>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={reportData.consumptionCategories}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={95}
                          paddingAngle={4}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {reportData.consumptionCategories.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name)} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Consumed Items - Only for Admin */}
                {isAdmin && (
                  <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all lg:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <ArrowDownLeft size={18} className="text-rose-600" /> Ranking: Itens Mais Consumidos
                      </h4>
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">Top Demandas</span>
                    </div>
                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.topConsumed} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1e293b', fontWeight: 'bold'}} width={130} />
                          <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                          />
                          <Bar dataKey="value" name="Qtd Consumida" fill="#f43f5e" radius={[0, 8, 8, 0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Only for Admin Charts */}
                {isAdmin && (
                  <>
                    {/* Stock Value by Category */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                          <DollarSign size={18} className="text-emerald-600" /> Valor em Estoque por Categoria
                        </h4>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">Financeiro</span>
                      </div>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={reportData.categoryValues} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1e293b', fontWeight: 'bold'}} width={130} />
                            <Tooltip 
                              cursor={{fill: '#f8fafc'}}
                              formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                              contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                            />
                            <Bar dataKey="value" name="Valor Total">
                              {reportData.categoryValues.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name)} />
                              ))}
                            </Bar>
                            <Legend />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Exits by Reason */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                          <TrendingDown size={18} className="text-rose-600" /> Sa√≠das por Motivo
                        </h4>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">Destina√ß√£o</span>
                      </div>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Consumo', value: reportData.exitsByReason.consumo },
                                { name: 'Doa√ß√£o', value: reportData.exitsByReason.doacao },
                                { name: 'Vencimento', value: reportData.exitsByReason.vencido },
                                { name: 'Perda/Avaria', value: reportData.exitsByReason.perda || 0 }
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={95}
                              paddingAngle={4}
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              <Cell fill="#2563eb" />
                              <Cell fill="#f59e0b" />
                              <Cell fill="#ef4444" />
                              <Cell fill="#64748b" />
                            </Pie>
                            <Tooltip 
                              contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                            />
                            <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                )}

                {/* Exits by Sector - Only for Admin */}
                {isAdmin && (
                  <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <ArrowUpRight size={18} className="text-rose-600" /> Sa√≠das por Setor (Quantidade por Tipo)
                      </h4>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">Setorial</span>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.sectors} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1e293b', fontWeight: 'bold'}} width={110} />
                          <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                          />
                          {reportData.categoriesInSector.map((cat: string) => (
                            <Bar 
                              key={cat} 
                              dataKey={cat} 
                              name={cat} 
                              stackId="a" 
                              fill={getCategoryColor(cat)} 
                              radius={[0, 0, 0, 0]} 
                              barSize={18} 
                            />
                          ))}
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Returns by Sector - Devolu√ß√µes por Setor */}
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-amber-100/80 shadow-sm hover:shadow-md transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                    <div>
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <RotateCcw size={18} className="text-amber-600" /> Devolu√ß√µes por Setor
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">Materiais devolvidos ao almoxarifado pelos setores</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                        {reportData.totalReturnsCount} {reportData.totalReturnsCount === 1 ? 'Item Devolvido' : 'Itens Devolvidos'}
                      </span>
                      {isAdmin && reportData.totalReturnsValue > 0 && (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.totalReturnsValue)}
                        </span>
                      )}
                    </div>
                  </div>

                  {reportData.returnsBySector.length > 0 ? (
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.returnsBySector} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1e293b', fontWeight: 'bold'}} width={110} />
                          <Tooltip 
                            cursor={{fill: '#fffbeb'}}
                            formatter={(value: number, name: string) => [
                              name === 'Qtd Devolvida' ? `${value} un.` : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value),
                              'Quantidade'
                            ]}
                            contentStyle={{ borderRadius: '16px', border: '1px solid #fde68a', boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.1)', fontWeight: 'bold' }}
                          />
                          <Bar dataKey="quantity" name="Qtd Devolvida" fill="#d97706" radius={[0, 8, 8, 0]} barSize={18} />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[220px] flex flex-col items-center justify-center text-center p-6 bg-amber-50/30 rounded-2xl border border-dashed border-amber-200/60">
                      <div className="w-10 h-10 rounded-2xl bg-amber-100/80 text-amber-700 flex items-center justify-center mb-2 shadow-xs">
                        <RotateCcw size={20} />
                      </div>
                      <p className="text-sm font-black text-slate-800">Nenhuma devolu√ß√£o registrada no per√≠odo</p>
                      <p className="text-xs text-slate-500 max-w-sm mt-1 font-medium">Os materiais que forem devolvidos pelos setores ao almoxarifado no per√≠odo selecionado aparecer√£o consolidados neste gr√°fico.</p>
                    </div>
                  )}
                </div>

                {/* Value by Supplier */}
                {isAdmin && (
                  <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <DollarSign size={18} className="text-amber-500" /> Valor por Fornecedor
                      </h4>
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">Fornecedores</span>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.suppliers} layout="vertical" margin={{ left: 10, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 10, fill: '#1e293b', fontWeight: 'bold'}} 
                            width={140}
                          />
                          <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                            contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                          />
                          <Bar dataKey="value" name="Valor Total" fill="#f59e0b" radius={[0, 8, 8, 0]} barSize={18} />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Top Requested Items - Only for Admin */}
                {isAdmin && (
                  <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all lg:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <Plus size={18} className="text-blue-600" /> Itens Mais Solicitados (Top 10)
                      </h4>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">Pedidos</span>
                    </div>
                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.topRequested}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1e293b', fontWeight: 'bold'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                          <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                          />
                          <Bar dataKey="value" name="Qtd Solicitada" fill="#2563eb" radius={[8, 8, 0, 0]} barSize={36} />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Extra vs Contract Comparison */}
                {isAdmin && (
                  <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all lg:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <BarChart3 size={18} className="text-indigo-600" /> Comparativo: Contrato vs Extra vs Doa√ß√£o
                      </h4>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">Origem</span>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[
                            { 
                              name: 'Entradas', 
                              contrato: reportData.originStats.contract.entries, 
                              extra: reportData.originStats.extra.entries,
                              doacao: reportData.originStats.donation.entries
                            },
                            { 
                              name: 'Sa√≠das', 
                              contrato: reportData.originStats.contract.exits, 
                              extra: reportData.originStats.extra.exits,
                              doacao: reportData.originStats.donation.exits
                            },
                            { 
                              name: 'Estoque Atual', 
                              contrato: reportData.originStats.contract.current, 
                              extra: reportData.originStats.extra.current,
                              doacao: reportData.originStats.donation.current
                            }
                          ]}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#1e293b', fontWeight: 'bold'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                          <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)', fontWeight: 'bold' }}
                          />
                          <Legend />
                          <Bar dataKey="contrato" name="Contrato" fill="#1e293b" radius={[6, 6, 0, 0]} barSize={26} />
                          <Bar dataKey="extra" name="Extra" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={26} />
                          <Bar dataKey="doacao" name="Doa√ß√£o" fill="#10b981" radius={[6, 6, 0, 0]} barSize={26} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* Detailed Sector Breakdown - Visible for Admin and Sector Leaders */}
              {(isAdmin || userProfile?.role === 'SETOR' || userProfile?.role === 'L√çDER') && (
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm lg:col-span-2">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-100">
                    <div>
                      <h4 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-1">
                        <History size={20} className="text-blue-600" /> 
                        Relat√≥rio Detalhado de Consumo por Item
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        {isAdmin ? (reportSectorFilter === 'all' ? 'Todos os Setores' : `Setor: ${reportSectorFilter}`) : `Setor: ${selectedSector}`} ‚Ä¢ {format(parseISO(reportRange.start), 'dd/MM/yyyy')} a {format(parseISO(reportRange.end), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {isAdmin && (
                        <div className="text-right mr-2 hidden sm:block">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total de Sa√≠das</p>
                          <p className="text-xl font-black text-rose-600">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.consumptionReport.reduce((sum, i) => sum + i.totalValue, 0))}
                          </p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {isAdmin && (
                          <button 
                            onClick={() => {
                              setSelectedRoomCategories([...categories]);
                              setShowRoomInventoryModal(true);
                            }}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10 active:scale-95"
                          >
                            <Printer size={15} /> Mapa de Sala (Porta)
                          </button>
                        )}
                        <button 
                          onClick={handleExportConsumptionPDF}
                          className="flex items-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-blue-900/10 active:scale-95"
                        >
                          <Download size={15} /> Exportar PDF Consumo
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left border-collapse min-w-[650px]">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200/80">
                          <th className="py-3.5 px-5 font-black text-xs text-slate-500 uppercase tracking-wider">Setor / Item</th>
                          <th className="py-3.5 px-4 font-black text-xs text-slate-500 uppercase tracking-wider">Categoria</th>
                          <th className="py-3.5 px-4 font-black text-xs text-slate-500 uppercase tracking-wider text-center">Quantidade</th>
                          {isAdmin && <th className="py-3.5 px-5 font-black text-xs text-slate-500 uppercase tracking-wider text-right">Valor Total</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.consumptionBySector.map((sectorGroup, idx) => (
                          <React.Fragment key={idx}>
                            <tr className="bg-blue-50/40 border-y border-blue-100/60">
                              <td className="py-2.5 px-5 font-black text-[11px] uppercase tracking-wider text-blue-900 flex items-center gap-2" colSpan={isAdmin ? 3 : 3}>
                                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                {sectorGroup.sector}
                              </td>
                              {isAdmin && (
                                <td className="py-2.5 px-5 text-right font-black text-blue-950 text-xs">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sectorGroup.totalValue)}
                                </td>
                              )}
                            </tr>
                            {Object.values(sectorGroup.items).sort((a, b) => b.quantity - a.quantity).map((item, iIdx) => (
                              <tr key={`${idx}-${iIdx}`} className="hover:bg-blue-50/20 transition-all border-b border-slate-100/80 last:border-b-0">
                                <td className="py-3.5 px-8 text-sm font-semibold text-slate-800">
                                  {item.name}
                                </td>
                                <td className="py-3.5 px-4">
                                  <span 
                                    className="text-[10px] font-black px-2.5 py-1 rounded-md text-white whitespace-nowrap shadow-xs"
                                    style={{ backgroundColor: getCategoryColor(item.category) }}
                                  >
                                    {item.category}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className="text-slate-900 font-extrabold text-sm bg-slate-100 px-3 py-1 rounded-lg border border-slate-200/60">
                                    {item.quantity}
                                  </span>
                                </td>
                                {isAdmin && (
                                  <td className="py-3.5 px-5 text-right font-bold text-slate-600 text-sm">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                        {reportData.consumptionBySector.length === 0 && (
                          <tr>
                            <td colSpan={isAdmin ? 4 : 3} className="py-12 text-center text-slate-400 font-medium italic">
                              Nenhuma sa√≠da registrada para este per√≠odo ou setor selecionado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </div>
              )}

              {reportsTab === 'apurasus_producao' && (
                <ApuraSUSProducaoReport
                  transactions={transactions}
                  items={items}
                  SECTORS={SECTORS}
                  SECTOR_COLORS={SECTOR_COLORS}
                  CATEGORY_COLORS={CATEGORY_COLORS}
                  getCategoryColor={getCategoryColor}
                  letterheadImage={letterheadImage}
                  inventoryLocation={inventoryLocation}
                  showToast={showToast}
                  isAdmin={isAdmin}
                  selectedSector={selectedSector}
                />
              )}

              {reportsTab === 'apurasus_custos' && (
                <ApuraSUSCustosReport
                  transactions={transactions}
                  items={items}
                  SECTORS={SECTORS}
                  SECTOR_COLORS={SECTOR_COLORS}
                  CATEGORY_COLORS={CATEGORY_COLORS}
                  getCategoryColor={getCategoryColor}
                  letterheadImage={letterheadImage}
                  inventoryLocation={inventoryLocation}
                  showToast={showToast}
                  isAdmin={isAdmin}
                  selectedSector={selectedSector}
                />
              )}

              {reportsTab === 'quantitativo' && (
                <div className="space-y-6">
                  {/* Action & Filter Controls Bar */}
                  <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                            Relat√≥rio Oficial Dispensa√ß√£o
                          </span>
                          <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {quantitativoSource === 'sample' ? 'Exemplo Oficial Sobral' : 'Dados do Sistema'}
                          </span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                          Quantitativo de Materiais por Setor
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                          Gere o documento oficial com gr√°fico e an√°lise cr√≠tica para apresenta√ß√£o gerencial e fiscal referente √† categoria selecionada.
                        </p>
                      </div>

                      {/* Export Buttons */}
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                          onClick={() => handleExportQuantitativoExcel()}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 font-extrabold text-xs flex items-center gap-2 hover:bg-slate-200 transition-all border border-slate-200/80"
                        >
                          <Download size={15} /> Excel (.xlsx)
                        </button>
                        <button
                          onClick={() => setIsEditingQuantitativoAnalysis(!isEditingQuantitativoAnalysis)}
                          className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xs"
                        >
                          <Edit2 size={15} /> {isEditingQuantitativoAnalysis ? 'Concluir Edi√ß√£o' : 'Editar An√°lise Cr√≠tica'}
                        </button>
                        <button
                          onClick={handleExportQuantitativoPDF}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-black text-xs flex items-center gap-2 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-blue-600/20"
                        >
                          <Printer size={15} /> Exportar PDF Oficial
                        </button>
                      </div>
                    </div>

                    {/* Filter Parameters */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Origem dos Dados
                        </label>
                        <select
                          value={quantitativoSource}
                          onChange={(e) => setQuantitativoSource(e.target.value as 'sample' | 'system')}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="system">Dados Reais do Sistema (Padr√£o)</option>
                          <option value="sample">Exemplo Demonstrativo</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Per√≠odo de Refer√™ncia
                        </label>
                        <select
                          value={quantitativoPeriodPreset}
                          onChange={(e) => setQuantitativoPeriodPreset(e.target.value as any)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="1_semestre_2026">1¬∫ Semestre de 2026 (Jan - Jun)</option>
                          <option value="2_semestre_2026">2¬∫ Semestre de 2026 (Jul - Dez)</option>
                          <option value="ano_2026">Ano Completo de 2026 (Total)</option>
                          <option value="custom">Per√≠odo Personalizado</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Categoria de Materiais
                        </label>
                        <select
                          value={quantitativoCategory}
                          onChange={(e) => {
                            setQuantitativoCategory(e.target.value);
                            setQuantitativoTitle('');
                          }}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="Material M√©dico-Hospitalar">Material M√©dico-Hospitalar</option>
                          <option value="Medicamentos">Medicamentos</option>
                          <option value="Aliment√≠cio">Aliment√≠cio</option>
                          <option value="Expediente">Expediente / Papelaria</option>
                          <option value="Higiene e Limpeza">Higiene e Limpeza</option>
                          <option value="Odontol√≥gico">Odontol√≥gico</option>
                          <option value="Radiol√≥gico">Radiol√≥gico</option>
                          <option value="EPI e Seguran√ßa">EPI e Seguran√ßa</option>
                          <option value="Inform√°tica">Inform√°tica / TI</option>
                          <option value="Copa & Cozinha">Copa & Cozinha</option>
                          <option value="Manuten√ß√£o">Manuten√ß√£o</option>
                          <option value="Todos">Todos os Materiais (Total Geral)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          T√≠tulo do Documento
                        </label>
                        <input
                          type="text"
                          value={quantitativoTitle}
                          onChange={(e) => setQuantitativoTitle(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>

                      <div className="sm:col-span-2 lg:col-span-4">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                            Texto da An√°lise Cr√≠tica (Gerada pelo Gr√°fico / Edit√°vel)
                          </label>
                          <button
                            type="button"
                            onClick={() => setQuantitativoCriticalAnalysis('')}
                            className="text-[10px] font-bold text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <RotateCcw size={10} /> Recalcular Autom√°tico pelo Gr√°fico
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={quantitativoCriticalAnalysis !== '' ? quantitativoCriticalAnalysis : quantitativoReportData.criticalAnalysis}
                          onChange={(e) => setQuantitativoCriticalAnalysis(e.target.value)}
                          placeholder="Digite ou edite o texto da An√°lise Cr√≠tica do relat√≥rio..."
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Printable Document A4 Canvas Container (Landscape Orientation) */}
                  <div className="bg-slate-200/80 p-4 sm:p-8 rounded-3xl border border-slate-300 flex justify-center shadow-inner overflow-x-auto">
                    <div
                      ref={quantitativoReportRef}
                      className="bg-white w-full max-w-[1120px] p-8 sm:p-12 shadow-2xl rounded-xl border border-slate-300 text-slate-900 space-y-6 relative font-sans shrink-0"
                      style={{ minWidth: '920px' }}
                    >
                      {/* Document Header - Timbrado Image Only */}
                      <div className="pb-4 border-b-2 border-slate-200 flex justify-center items-center min-h-[70px]">
                        <img 
                          src={letterheadImage || "/official_letterhead.svg"} 
                          alt="Papel Timbrado Oficial" 
                          className="w-full max-h-24 object-contain" 
                          onError={(e) => {
                            const logoToUse = appRectangularLogo || appLogo;
                            if (logoToUse) {
                              (e.target as HTMLElement).setAttribute('src', logoToUse);
                            } else {
                              (e.target as HTMLElement).style.display = 'none';
                            }
                          }}
                        />
                      </div>

                      {/* Document Title */}
                      <div className="text-center py-2">
                        <h1 className="text-sm sm:text-base font-black text-slate-950 uppercase tracking-tight leading-snug max-w-4xl mx-auto">
                          {quantitativoReportData.title}
                        </h1>
                      </div>

                      {/* Stacked Bar Chart Matrix */}
                      <div className="space-y-2 py-2">
                        {/* Row Headers & Bars */}
                        {quantitativoReportData.sectors.map((sec, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <div className="w-36 sm:w-44 text-right shrink-0">
                              <span className="text-[11px] font-extrabold text-slate-800 uppercase tracking-tight truncate block">
                                {sec.name}
                              </span>
                            </div>

                            {/* Stacked Bar Track */}
                            <div className="flex-1 h-6 bg-slate-100 border border-slate-300 rounded-sm overflow-hidden flex relative shadow-2xs">
                              {sec.values.map((val, mIdx) => {
                                if (val === 0 || sec.total === 0) return null;
                                const pct = (val / sec.total) * 100;
                                return (
                                  <div
                                    key={mIdx}
                                    className="h-full flex items-center justify-center text-[10px] font-black text-white px-1 overflow-hidden transition-all"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: quantitativoReportData.monthColors[mIdx % quantitativoReportData.monthColors.length]
                                    }}
                                    title={`${quantitativoReportData.months[mIdx]}: ${val}`}
                                  >
                                    {pct >= 4 ? val : ''}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Total Geral Badge */}
                            <div className="w-16 text-right shrink-0">
                              <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-extrabold text-xs shadow-2xs inline-block text-center w-full">
                                {sec.total}
                              </span>
                            </div>
                          </div>
                        ))}

                        {/* Scale Axis % */}
                        <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 pt-2 px-36 sm:px-44">
                          <span>0%</span>
                          <span>25%</span>
                          <span>50%</span>
                          <span>75%</span>
                          <span>100%</span>
                        </div>

                        {/* Month Legend Bar */}
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-3 border-t border-slate-200">
                          {quantitativoReportData.months.map((m, mIdx) => (
                            <div key={mIdx} className="flex items-center gap-1.5">
                              <span
                                className="w-3.5 h-3.5 rounded-xs inline-block shadow-2xs"
                                style={{ backgroundColor: quantitativoReportData.monthColors[mIdx % quantitativoReportData.monthColors.length] }}
                              />
                              <span className="text-[11px] font-extrabold text-slate-700">{m}</span>
                            </div>
                          ))}
                          <div className="flex items-center gap-1.5 ml-2">
                            <span className="w-3.5 h-3.5 rounded-xs bg-slate-900 inline-block shadow-2xs" />
                            <span className="text-[11px] font-extrabold text-slate-900">Total geral</span>
                          </div>
                        </div>
                      </div>

                      {/* An√°lise Cr√≠tica Section */}
                      <div className="pt-3 border-t-2 border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2" style={{ color: '#0f172a' }}>
                            <BarChart3 size={15} style={{ color: '#334155' }} />
                            An√°lise Cr√≠tica:
                          </h3>
                          <button
                            data-pdf-hide="true"
                            type="button"
                            onClick={() => setIsEditingQuantitativoAnalysis(!isEditingQuantitativoAnalysis)}
                            className="text-[10px] font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 transition-all print:hidden"
                          >
                            <Edit2 size={12} />
                            {isEditingQuantitativoAnalysis ? 'Salvar Edi√ß√£o' : 'Editar An√°lise'}
                          </button>
                        </div>

                        {isEditingQuantitativoAnalysis ? (
                          <div className="space-y-2">
                            <textarea
                              rows={6}
                              value={quantitativoCriticalAnalysis !== '' ? quantitativoCriticalAnalysis : quantitativoReportData.criticalAnalysis}
                              onChange={(e) => setQuantitativoCriticalAnalysis(e.target.value)}
                              placeholder="Digite ou edite o texto da An√°lise Cr√≠tica..."
                              className="w-full p-3 border border-slate-300 rounded-xl text-xs font-medium leading-relaxed focus:ring-2 focus:ring-slate-400/20"
                              style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1' }}
                            />
                            <div data-pdf-hide="true" className="text-[10px] text-slate-500 font-bold flex flex-wrap justify-between items-center gap-2 print:hidden">
                              <span>* O texto acima ser√° impresso no relat√≥rio oficial em PDF.</span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setQuantitativoCriticalAnalysis('')}
                                  className="text-slate-700 hover:underline flex items-center gap-1 font-bold"
                                >
                                  <RotateCcw size={10} /> Recalcular pelo Gr√°fico
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingQuantitativoAnalysis(false)}
                                  className="text-slate-900 underline font-black hover:text-slate-950"
                                >
                                  Concluir Edi√ß√£o
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => setIsEditingQuantitativoAnalysis(true)}
                            title="Clique para editar o texto da An√°lise Cr√≠tica"
                            className="group cursor-pointer relative"
                          >
                            <p 
                              className="text-xs font-medium leading-relaxed text-justify p-4 rounded-xl border border-slate-200 group-hover:border-slate-400 transition-colors"
                              style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderColor: '#e2e8f0' }}
                            >
                              {quantitativoReportData.criticalAnalysis}
                            </p>
                            <span data-pdf-hide="true" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1 print:hidden">
                              <Edit2 size={10} /> Clique para editar
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Official Document Footer */}
                      <div className="pt-4 border-t border-slate-200 text-center text-[10px] font-bold space-y-0.5" style={{ color: '#64748b' }}>
                        <p>
                          Policl√≠nica de Sobral. Av. Monsenhor Alo√≠sio Pinto, 481, Dom Expedito CEP 62050-255, Sobral Cear√°.
                        </p>
                        <p>Fone: (88) 3614-3156 . Fax: (88) 3614-3245</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {reportsTab === 'letterhead' && (
                <div className="space-y-6">
                  <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Personaliza√ß√£o Institucional
                          </span>
                          {letterheadImage ? (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Timbrado Ativo
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500" /> Sem Timbrado Anexado
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                          Anexo de Papel Timbrado dos Relat√≥rios
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-2xl">
                          Anexe a imagem oficial do papel timbrado do √≥rg√£o ou institui√ß√£o (contendo cabe√ßalho, logomarcas e rodap√©). A imagem anexada ser√° inserida automaticamente no topo de <strong>todos os relat√≥rios exportados em PDF</strong> (Estoque, Cat√°logo, Solicita√ß√µes, PCA, Termos de Doa√ß√£o e Recibos).
                        </p>
                      </div>

                      {letterheadImage && (
                        <button
                          onClick={() => handleExportInventoryPDF()}
                          className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center gap-2 hover:bg-slate-800 transition-all shadow-sm shrink-0"
                        >
                          <Download size={15} /> Testar Exporta√ß√£o PDF
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      {/* Upload Zone */}
                      <div className="lg:col-span-5 space-y-4">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                          Selecione ou Arraste o Arquivo de Imagem
                        </label>
                        
                        <div className="relative group cursor-pointer">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleLetterheadUpload(file);
                            }}
                          />
                          <div className={`p-8 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-3 ${
                            letterheadImage 
                              ? 'border-blue-300 bg-blue-50/40 hover:bg-blue-50/80' 
                              : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-slate-100/80'
                          }`}>
                            <div className={`p-4 rounded-2xl shadow-sm ${letterheadImage ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                              <Upload size={28} />
                            </div>
                            <div>
                              <p className="font-extrabold text-sm text-slate-900">
                                {letterheadImage ? 'Clique para Substituir a Imagem' : 'Clique ou arraste o Papel Timbrado'}
                              </p>
                              <p className="text-xs text-slate-500 font-medium mt-1">
                                Formatos recomendados: PNG, JPG ou WEBP (Max: 5MB)
                              </p>
                            </div>
                            <span className="mt-2 px-4 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-xs group-hover:border-blue-400">
                              {letterheadImage ? 'Escolher Novo Arquivo' : 'Selecionar do Computador'}
                            </span>
                          </div>
                        </div>

                        {letterheadImage && (
                          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                                <CheckCircle size={18} />
                              </div>
                              <div>
                                <p className="text-xs font-extrabold text-slate-900">Papel Timbrado Armazenado</p>
                                <p className="text-[10px] text-slate-500 font-medium">Sincronizado e pronto para emiss√£o</p>
                              </div>
                            </div>
                            <button
                              onClick={handleRemoveLetterhead}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-extrabold transition-colors flex items-center gap-1.5"
                              title="Remover papel timbrado"
                            >
                              <Trash2 size={14} /> Remover
                            </button>
                          </div>
                        )}

                        <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-2">
                          <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                            <ImageIcon size={16} className="text-blue-600" /> Dicas para melhor resultado
                          </p>
                          <ul className="text-xs text-blue-800/80 space-y-1 list-disc list-inside font-medium leading-relaxed">
                            <li>Utilize imagens em alta resolu√ß√£o com fundo branco ou transparente.</li>
                            <li>O timbrado √© posicionado no cabe√ßalho superior de cada p√°gina gerada.</li>
                            <li>Sua altera√ß√£o √© salva imediatamente para todos os administradores.</li>
                          </ul>
                        </div>
                      </div>

                      {/* Live A4 Preview Simulation */}
                      <div className="lg:col-span-7 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                            Pr√©-visualiza√ß√£o da Folha A4 com Timbrado
                          </label>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2.5 py-0.5 rounded-md">
                            Propor√ß√£o A4
                          </span>
                        </div>

                        <div className="bg-slate-200/70 p-4 sm:p-6 rounded-3xl border border-slate-300/80 flex justify-center shadow-inner">
                          {/* A4 Sheet Container */}
                          <div className="bg-white w-full max-w-[480px] aspect-[1/1.414] rounded-lg shadow-xl border border-slate-300 p-4 sm:p-6 flex flex-col justify-between relative overflow-hidden">
                            {/* Top Letterhead Area */}
                            <div className="w-full h-16 sm:h-20 bg-slate-50 border border-dashed border-slate-200 rounded-md flex items-center justify-center overflow-hidden relative">
                              {letterheadImage ? (
                                <img 
                                  src={letterheadImage} 
                                  alt="Papel Timbrado" 
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <div className="text-center p-2">
                                  <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                                    Cabe√ßalho do Timbrado Oficial
                                  </p>
                                  <p className="text-[10px] text-slate-300">Nenhuma imagem anexada ainda</p>
                                </div>
                              )}
                            </div>

                            {/* Simulated Report Body Content */}
                            <div className="my-4 space-y-3 flex-1 opacity-70">
                              <div className="h-4 bg-slate-800 rounded-md w-3/4" />
                              <div className="h-2 bg-slate-200 rounded w-1/2" />
                              
                              <div className="space-y-1.5 pt-3">
                                <div className="h-6 bg-slate-100 rounded-md border border-slate-200 w-full flex items-center px-2">
                                  <div className="h-2 bg-slate-300 rounded w-1/4" />
                                </div>
                                <div className="h-5 bg-slate-50 rounded-md border border-slate-100 w-full flex items-center px-2">
                                  <div className="h-2 bg-slate-200 rounded w-1/3" />
                                </div>
                                <div className="h-5 bg-slate-50 rounded-md border border-slate-100 w-full flex items-center px-2">
                                  <div className="h-2 bg-slate-200 rounded w-1/2" />
                                </div>
                                <div className="h-5 bg-slate-50 rounded-md border border-slate-100 w-full flex items-center px-2">
                                  <div className="h-2 bg-slate-200 rounded w-2/3" />
                                </div>
                              </div>
                            </div>

                            {/* Footer Indicator */}
                            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[8px] text-slate-400">
                              <span>Relat√≥rio Oficial do Sistema</span>
                              <span>P√°gina 1 de 1</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'users' && isAdmin && (
            <motion.div 
              key="users"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black">Gerenciamento de Usu√°rios</h3>
                <button 
                  onClick={() => setIsRegistering(true)}
                  className="bg-[#1C1917] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-[#292524] transition-all shadow-lg"
                >
                  <Plus size={20} /> Novo Usu√°rio
                </button>
              </div>

              {isRegistering && (
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm max-w-2xl">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-lg font-bold">Cadastrar Novo Usu√°rio</h4>
                    <button onClick={() => setIsRegistering(false)} className="text-[#A8A29E] hover:text-[#1C1917]">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1.5 ml-1">Nome Completo</label>
                        <input 
                          type="text" 
                          required
                          className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                          placeholder="Nome do funcion√°rio"
                          value={authName}
                          onChange={e => setAuthName(e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-2 ml-1">Setores Autorizados</label>
                        <div className="flex flex-wrap gap-2 p-2 bg-[#F5F5F4] rounded-2xl border border-[#E7E5E4]/50">
                          {SECTORS.map(sector => {
                            const isSelected = authSectors.includes(sector);
                            return (
                              <button
                                key={sector}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setAuthSectors(authSectors.filter(s => s !== sector));
                                  } else {
                                    setAuthSectors([...authSectors, sector]);
                                  }
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                  isSelected 
                                    ? 'bg-[#1C1917] text-white shadow-md' 
                                    : 'bg-white text-[#78716C] border border-[#E7E5E4] hover:bg-[#E7E5E4]'
                                }`}
                              >
                                {sector}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1.5 ml-1">E-mail</label>
                        <input 
                          type="email" 
                          required
                          className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                          placeholder="email@empresa.com"
                          value={authEmail}
                          onChange={e => setAuthEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={loginLoading}
                      className="w-full bg-[#1C1917] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#292524] transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 mt-4"
                    >
                      {loginLoading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <><Save size={20} /> Salvar Usu√°rio</>
                      )}
                    </button>
                  </form>
                </div>
              )}

              <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Nome</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">E-mail</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Setor</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Papel</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">A√ß√µes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E5E4]">
                    {usersList.map(u => (
                      <tr key={u.id} className="hover:bg-[#FAFAF9] transition-all">
                        <td className="px-6 py-4 font-bold text-sm">{u.name}</td>
                        <td className="px-6 py-4 text-sm text-[#78716C]">{u.email}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {u.allowedSectors && u.allowedSectors.length > 0 ? (
                              u.allowedSectors.map(s => (
                                <span 
                                  key={s}
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" 
                                  style={{ 
                                    backgroundColor: `${SECTOR_COLORS[s || ''] || '#000000'}15`, 
                                    color: SECTOR_COLORS[s || ''] || '#000000' 
                                  }}
                                >
                                  {s}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: `${SECTOR_COLORS[u.sector || ''] || '#000000'}20`, color: SECTOR_COLORS[u.sector || ''] || '#000000' }}>
                                {u.sector}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {u.email !== 'gerlianemagalhaes79@gmail.com' && (
                            <button 
                              onClick={() => setShowUserDeleteConfirm({ show: true, user: u })}
                              className="text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'trash' && isAdmin && (
            <motion.div 
              key="trash"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {/* Deleted Items */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <Package className="text-[#78716C]" size={20} />
                  <h3 className="font-bold text-[#1C1917]">Itens Exclu√≠dos</h3>
                </div>
                <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Item</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Exclu√≠do em</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Exclu√≠do por</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">A√ß√µes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E5E4]">
                      {items.filter(i => i.deletedAt).map(item => (
                        <tr key={item.id} className="hover:bg-[#FAFAF9] transition-all">
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm">{item.name}</p>
                            <p className="text-xs text-[#A8A29E]">Lote: {item.batch_number}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-[#57534E]">
                            {item.deletedAt && new Date(item.deletedAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#78716C]">
                            {item.deletedBy || '---'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={async () => {
                                if (window.confirm('Deseja restaurar este item?')) {
                                  await updateDoc(doc(db, 'items', item.id), { 
                                    deletedAt: deleteField(),
                                    deletedBy: deleteField()
                                  });
                                  setToast({ show: true, message: 'Item restaurado!', type: 'success' });
                                }
                              }}
                              className="text-emerald-600 font-bold text-xs hover:underline"
                            >
                              Restaurar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {items.filter(i => i.deletedAt).length === 0 && (
                    <div className="p-12 text-center">
                      <p className="text-[#A8A29E] text-sm">Nenhum item na lixeira.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Deleted Requests */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <FileText className="text-[#78716C]" size={20} />
                  <h3 className="font-bold text-[#1C1917]">Solicita√ß√µes Exclu√≠das</h3>
                </div>
                <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Solicita√ß√£o</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Exclu√≠do em</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Exclu√≠do por</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">A√ß√µes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E5E4]">
                      {requests.filter(r => r.deletedAt).map(req => (
                        <tr key={req.id} className="hover:bg-[#FAFAF9] transition-all">
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm">#{req.id.slice(-5).toUpperCase()}</p>
                            <p className="text-xúÏ}…r‹Hñ‡}æ¬≈ ÓV1∏I-lä2&Ie´[ìîrjL&ì¿ÄìD&à\äI≥6ÎCüÊ4sö[N⁄¨ÃÍT÷ó>ˇ§ødﬁs«‚¯Ü`ê¢îDZä¿◊Áo_ŒRí—≥¨˜˛wõè7˚Ov>Ãl\$ÙÁ˘î≤8π\_m¸7¢Ω÷2ﬂ¯{ÊìAË•ÈkoHüŒåŒz…Ëº∑¬˚LáEﬂ´èVóW∞oC[Ñ∞Å˘4§ı73Ú˜O"zJ∂Ωåv•_fÁ≥¯e<B∫ü%At‘Ìå≤ﬁ∑{ùŸÀ[ò £«èñnµô ∑Á‰ó_Hß◊ÎunnÄIptúYµ~0Œ≤8"∆áâ£≠0¸ÙÙ¬Kœ£ÈŒíß‰¬Ú!¡!ÈûëüŒ‚Ë0HÜ›Œ6MÈèIhöy„ƒK~ iÌôwıÔWéüufgZ'ƒ;ıÇååG>¿√v<Ë˙¯ˇ¡È¿Rè°›¥3Gp’vé\ÿ&…Ø§÷Úèœ˙›Ÿπ6o{^{€·ÂÀŸpx*•Ÿ€ÿK≥ÓIè„”5í%c:GÜ4MΩ#∫F:˚‚JñÀÏ{`-≤Û>íéxæ„‘•	>ŸÔ∂ e`Iá4ÒBø˜pqë∆Q÷;àCüCÏYJé„ö¨ç#ü&a—c„fÿ&dØ 2ÛX‡á`r¨ø&∫_g5(ﬁ9à˝s’kìwRıO~p¢˙·¢ ˘˘√ Ãh“Mà&"ÜitîìßOüíEƒ§]ı∏†	©Ùñ˙|w4ÇÜµe}‘ÿÍí¬sf„5çé«√⁄Å'ëG¬‡åâ7Ø%?⁄©+X˘l~≥v˜b·˜dõ/yõxQÍ≤ éRÚ˚Özªı•IGﬁÄˆ ﬂ*÷§˛ÏaHœHê—aöØ#9ÚFΩ>ú›W.È˙?)ê„s≈¢ÙÜ§¡üË”ã˛‚%YP6qº,A>lÔ∑¥µÙdÈ–≠WÒI0ÑQ·n¸M…ŒŸ _˝’˜“ıÖ„e≈‰‘[QüÛ¡QÔÙÊLí¥ﬂ[>…Aú¿ŸŒˇ¿ vÌ¨Ó¨| lÊù@™ä‡0Ñœ«ÅÔ”HΩ:µÆ wŒzﬁ8ã5@∫ŒŒï¯ﬁiÔpÜ|ABzò„ƒaËçRJÜA‘;ÌΩ_]\ùÈ(¸zvL=-zXœí⁄¢ºˇ›ÛM¯Ô…á¢∑Éœ∞±&⁄]™)mìL
PÀML-Kº¡O¿+ıNœµé	ﬂnˇ‘≈Ñoªwâc⁄‰«¿4=∆«∑¥–∞Œpæ8vÄcËøwNÚˆÕø»,U`˚±}&b˚°7Í≤'Ò5™Á#J»OÙ¸)o8•KqtúK Àû∞ÛûÜFˆR«û⁄x“ëk!)∆
ÿÙcŸD%m:SHAº]‰íïÏ¿aHŒ;‰ÈÏ¿'`¢:9,QcÁíÙÚΩòˇyÏEYêù_íq§'`˘PnW~‚TKPµﬂ>Éı%â(C	=^_Fè1ÚÊ˘˘ªæ§r{≤ÜL1ÓÖçﬂå∞·FÇÓî¿!ﬂ[ï8‰[√ómæˆ4)|ª¿µ=°oΩNàJ}.cên˙¿ñ6WtΩj∫éAêƒœ≠‘·<àÄû{·”ãÉHÑlç,Œë≥5“_l9/
ÜÄÀ§ßóÿ”äáÈYê)⁄Ì©VHVÂ°6÷˜∂éˆÇÉZj1≤ÜSnÇI˝ˇ˛ì, ˚‡Ÿ„ËyüÇ8|Îùf^66K7–ÎãåF∑‹i;HGÉ¬œıEü¶äã˛å4ÁA√F¿ÓÈÕ∆IƒE°¸Yù TäA\]<5!h"»* ˝.Ê|
,/ÌˆVëuá;ª;€ùµ⁄p‹ƒ!Ÿ‘*	o◊•cßûf¢e*5& _≠j◊∞°•í"ÑG3$ÕŒCFø‡±_∂‚0N÷»ßo.ˆw∂ﬁæŸ˚∏ıÊÂõΩ˝˜ï]Ï√eÒ”µOYs0Â¶6#à≥˚¨ÎyÒâCƒ™æÚEa≈´ h°µ§m$ﬂòÂ%∂0ﬂr¶gwÁıˆŒÎ∑;L á„ÁÄÏ≠.r@ÂﬂêØœÈ!ø—_\!ΩU?;Ø>ÓÔÏnÓmnmæ)˙çìQHÀŒÚØBo˘ù	∫€‹›{Û√ÊvŸ’A8Æ:b_Ñnÿ˜IÊÙ˙ÌﬁŒwÔ µ+‰†¢Q. ª*nM–€ﬁŒ÷ª}aJIúVSb_Ñ~ÿ˜	:Ÿﬁ˘·ÕÀw∞G] „— £Í1ﬂ≥M€r>ö rV˝Êª©_ÿGÌ:JºÛ≤!ˆEÿ!ˆ24s˘…	œôéŸŒ+¬o\˝€’øæA’öY¬v~õµI™ÃK‚∫ıb€’∑-mØÿvıÉs€wçò(YåÜ	 Qã	L÷g˛^†	≠d f‰ÊsŒc‡≥%Œm˛π‚ÌnQZö˝85Æ’‘πW]ß“f¯„8ÕÇ√Ûç|Ö˝p ∫SÆ5Mi∂üÊ+æM3/_≈æ÷Å˘™Ø·riT„UónsÛ#_.∑√í≠‡íıKŒ‚,$M‡8Ú˛ì˛j•¡ë_Kì˜¨.Œ:<¶&HqSÊÙ

<êÈ¥V?&tÁ∂õç˝<ˆ"Xv&!Âõ⁄Õèàmœà¨ôÎîgFπa‚7d∫/neã]¬+2‡‘gòe0Hlœ€ˆVm‚•«˝‹pæÙXc8ó^q⁄cãçD£G,~÷#Ω≤W≠Í’*zµjﬁâ•jÌnS∑€_t–ÌÆ?B˙ﬂr”~A9
5ﬁ (Qæ°+˙U*ãK«=µW
ç1∑˚ÈtƒöùmlÕ‘¡"íûOO‚pÃ-G◊“7öªW∑V7@¸a)ºπ©jkn:\•|$‹3ÇS˙Á¯ËÓá”xúÿﬁ(âO
ïÛéE˝SûâÇtÏÖpÆHﬁ(%h‚À‚$ä±#‹È$Çîx1ZHc@#Ís¢s∫Jı{}˙WØOXƒË—tØ≈óÔﬂ-˛Ωˇ^âØƒˇ¬ï¯˜Z€/[k´Ÿøi+Vß≠L˝
®Jƒÿ‘°ÚsÚ·@8SJúÈ∞ı	£∂{‘K„àÖ®ΩfÇp:¢É‡0ÄXd	XªW4É<DòD«ΩûY∫ÓıÃ“%ÍôA»ﬁdí˚ı›GeçÛΩRπ~›+ïÔêR˘ˆt {1êy∫58Ω•rÖF*ı≤/(ÌÓ†ryxﬁìç€ÈíÖ∑Ôµ»˜∆_†BÙﬁ◊WŸˇ›–ÚpvÆsaË*22 :≤œo1e= Ú^a®Ì‡kQ~n◊ΩóÍΩóÍΩæÛ´—wﬁ{©ﬁ{©~NÂ·Ω∆P∫Ó5Ü“5mœT=3„¢9tPçπ*5Í≈?»Â¢ÉfQ≠[dä§[,¯A∑Xr5◊–-V⁄Eπó)õ˝u˚ä¬öb”≠¥çÆ‡¿ûºÊéM®˛Ã*·∫R¯Fˆ≠Ωöÿ}„÷-m}M™dã&‡ÎÚL˛!\˝ÖxA‰{$BΩÒ!˝âTÓ wFçR˘s§+ìËë≈◊øEÚ„vä‰£ò@¸ıπioâÑGk’◊>c°+`≥æçG$G∞‘W§)4®≠°—Mæ_Ó£∆ƒ™Ωv øßNo∏åg‡°Ó(5…e‡%¿Â#â—“+†ﬂ&¿}——ªÊ!*U/eûƒ˝‘c¿unTynı=∑q≥ñ…+ÙìﬁØ–tÆŸ¨U˜lﬁ«ê˙¡xhP.7°;Ãv√sî˘p∂™@8Ø}ÍÌ@b óâ◊?˙®á@¥§ÛY<*!ù)tªcsÄ|z6kTÌbﬂL∑ãoÃ≥4qvÄ]!ËI82©vks:Öuˇ7€+ƒ£¸+◊$Ø¬p∏*ßúö¡4óu` ›l%»»íû¿€»ª‚(˜ñ⁄äÕí«f>ÅBå¬‹Z=xa8¬vÖ±)¨kÕ4∏«Ω•˘Uız≤ﬂá{¿%ç®–óû*’/Å¡1Àéï‰§~	¥(È”7fxø¯·Ÿ¸œŸ9yF‘≥œƒˆ>6K~Oã¬».ˇÓS´¨i«|}Â¢¥∫f^ÿ»ÖZŸÃV`Í™π0Ä™xÿ \∏≈ZO`Nëå¬A(ííïàzf„]ƒpqjQÍòàè˛G]8ÇuÀ◊¶úyé‰F¿’']⁄ØˆÈê¯H¸H:>ƒBñÙŸ◊4ÚÉ:îHô⁄πbó@*5˘ ÿ•ByﬂÜa⁄:¶Éü∂Çd {‘Õ-wÜg¬ƒ´ÙhL?/«ƒÉÍ@£ÑÊ˙XßÍÔY'’í›≥N_ÎT¬{÷I|gj¨SexΩgûú[˛"ôß
≈~ÒÃìıÊd⁄¿àû~°(Ö∑uÅ®„s◊û;Î·ﬂû™aQÏùıN{}‡f
çÑ⁄¡i3†FÛÌÕN)çd
¨eDUÏ[ø∆ø©èp^0Zπ∏¡\+62ñaˇ50[µ€jxV≥ÑıÆÙ©ßÕ∆ÆöÅKÔñ“lGÍ≤∂7‰;áÚ'Åﬂ¸âf›˜úû~sê“‰ƒ√#”ÌtÃØlÁ∞+9vk_“í:ªáDiÇsJ®Æ√…[^4†! ¨%€t{≠∑àπÊÂ÷Û◊†◊K:°w@CÈÏÜqAUÆ$j÷pCÑ£◊œ≥3îg Œ‰˙ÎJ3å ç3c&~æw3∫GNºp»±ÊSãÄùK›;~ê¢…Œ◊˝ﬁd?'äeô’°¥ÛU¯EX»Ç≈WvÆ.á§Q|ñ˝›Ùac„†}ÖÃõ[É’	mΩêﬂˆxeüz…@r4˜RÃ
D	F†´P2»BüÙòqZƒÛÇ7jƒnn3ƒ‚Â µxçÄÊ–cÿö<ùŸéêlÇ¯)1>ORŒœœõòo®ÜXÜ`îpÄ]!%Iv÷¡8]ã«ﬂ¢8¢˘-tùÓı≈/%Ûº∞$U®pv`»Onéﬂ˘6æ•…–$∏ a;ˆ¢#x≠Kø™Ωz]:‘˘àfÛ¨ÉÅvõı'ØÊò&z„)Èõ=êeN=è®‰Âƒ´√(^⁄#≤ J\èR!o˜€ÅVŒÊ¡ß?°≤ú«@z+ë˝úsûBA¥\à◊Ÿ®$È∫“ƒ 6 TŒs|áä†tçÏ—Le=es‰k§¯:Ä’=äìÛÍN‡ü/7»Srqi.àNñÃ«ÚA ee&≤AgÁ„d«Ûám≈{∞2–É⁄úﬁL˚Ú¡•ÙèÊUú·+¡Ôà+ÃüÌ}3ŒÄµÍï	ÊüXñƒVAk8Ï$_S†ÏO…õÉÅ‡( Ì÷Êd.5Tl”‚äGq2d≈Úˆ[ÉŸ˘ Ñc†è›˙C$1;kÈ6çì¨€ıÊ»]èı0≤ñ≠x8Ú⁄=‡›⁄ZbÅ6Ä0ñVmá–R,õ§∞É
œπ`u∑T˘,=]ñ⁄(?À&ıÆ*/ÇWKJZÆj=éj]òUS¸≤‘Ü∫4/~æÇÂ˙£∫ªÑ:« xÎ<òFºYªO#g`xÎvBga≥∫¯a•g®éäé»”¬ÌôÀîp¸"ø{¿p›A0?Jb<»X¡<ô¬Ès)Ü ^tÂV˘L!Ê ƒmry(8∏É`é}ﬂ)±˚»π$xo÷i2óÑÜ¿öO8ã˜0i&X≤≠?¢j>Ù¿ü#‚¨÷Ñ)âÅ°õ§a‘œ(99£™†lΩU⁄ÜJ¢#	X†≤9ôKx2;k∞¯ ®fr∆¢)B∂ñﬂEŒz
˘{Œ†)*¡$·Ñ!MÍp≠X)j·e	≥A¡K∏ç¬	Oªö≤˚ç >7r¥é”BÄ|Ë‰!›åmj©q€d‘j5”xﬂÂl◊ ZÈtÓR˚∫öf;¥Jq*„ÁBkSΩØP§-ÎµSW©‰AÙh≥ﬂ¬"åFmJcñHÖ~-ure£xÖÌ-¶Ò:bq]BT.
wza„ÚÄ'1k˛6≥∞U√Égí¢1:õı<xÉËÈÃí„Ánä,*ÛZﬁ1hD‹Yó<ÆØ jÓ§êîæà≤∫ñÂæäóia}>EOu «À<Ê›Y©P¯Q‰;€ „,z‚(?”⁄Áb•j˘4óø’"™¨B‘ëËdÖÎ6≈»æ÷—AnÖd'w–óí’EΩ™ı‹H∆”,uﬂå·gÕ:vÏ√K®g1ê$;ú∫E¥‚9*Y%-˜fxÑ—?±8œ`8äf(z¶Dã=Êñ‘€π÷8F&π‹ÈqL∏¶ƒ0<Jq|0,#K’k^X∑Äê§¸q—§XZ…+1ïè∫A≈ÚüÃÄ"‡Xm¸≤∆
b@O≈÷r˝5b∞Úﬁ`ú§1JPæüRﬂÓá«„∫ì”X¸UáfˇË$Ä]àÅ&¢µ}c}ﬂ;°Ö√È"b>ï∑¿æûx	ŸD‰üB`Œ¨π∫∞8jó÷ºY/ò™ƒ∆N0’À_äÃ™¬∆íj]µ˜Ë!`ü|ÎE¿€?2á+ÖÀ∂íAeŒóÉ:ˆ◊ÿÁ$>≈œFvAö9D%ûèNUΩ,Óîƒ√* q¿X/N°≥;´ûc'’…QF∞ÏG:\vöπ· /èKKNJ
˚Ï’Fä≈EØÕ?¡ﬁ\√˚\ó±°!^ÀÆÊU®≤LÀÁ7ÙãO’zˆı⁄ !M£à4¨à^ñ_^ Ïßî3∏Ãê˝á^0ô—/R,º‚SÚ™®Ç¢·qøï+∏⁄ì KJÒ∆çÎ-ëTvÙ¥ŒˇﬂQ ‘A†≠‚‚«»¢ƒ	AÉ]i*°*ßÊ(ÿñø≥Åµ`ºpüyIpà~Ù>Ú	∆*á≤<∑qròËOò˘Rπ4-*»hU˜N⁄tòÓvâZméXòz$ü4º¥ÀÂΩfUjõÁ”ÓÚd⁄Öì>Ncß7ùæÚ¨(’[Õî(ÃÚ◊|S©ÛˆQä;≤3Ÿ¨‰î)L7º∏I‰fn˚⁄LÖúﬂ:|T ee∑è˘·U0Au‹Ûê·GFá∞Yp≈ßâ7¬DáòûdHXÿ7F‚¯Ä$«òEò4Á÷§€MˆIâÍXP´-ÿûDDLäÛ£f{‘‹4í‚ Õô¸ÛÓ≤¥¥Iáıﬁ‹4åKŒ¿•ïu™UJ«§L‹HÿÑgﬁÈàGÑoƒe–´0Üz«Ê,]E	]?ﬁà≈Ú'Ì®ÃÃeÎ(°?≤Uô¥£2MW’Q£'É⁄í∫†è‘©˙∫íG≤·MÉíPÎÒ,3L¸ÿ,qÜIƒ!®F≠(]8?ó2pL‡Ÿ¥≥/K≈jô¬ÓT'⁄§‚1«.òï:ñ»ä:ÎÉÈuÙ·poa‘!a"ñÔY‚-¨ãÅﬂ&B‰<	ö°Sº°9ÒK¥säy	i˘WwP€bz¥/	Ãvã
ÜSÄ∞jπ ƒDbp\rlZ3«™#x	!ƒ_êmÊAº” 2…∞}!±˜`F¥…u› Ïè_XÌ—¡8ùX0%q}”Ü)]N∞: ù‚Hò¯≈}z4DÚ…˙∆aË§Ø¯êÄuƒÙW"»≥-Tä=&!†.ë\{Ê)øT« ïlUj&gùÅ$áÔèÚH™èúUN;J[çòóúGÉ„8Ÿ'f'ôxï•Ê´âk≠&+π_aQ»£•hx¢féEj˘®´≤*Â%ﬂ1]≥k§SSP	âK÷OıˆÂßÊr™ ˜U{i%Ï˛á"™A…≠ÕÁíÍ«4ˆÍ.oø4ŒØ vx•iTWÚπn]ŸtÍæ)Ä†apÑÙ£œ√¿zß—Çj∏_x∞Ù,Ä!vBztı◊§Ëk„M[=6>»`YëÍ°ıG°≥bfµO›á*Ç'Yï\íx∏Ø/)µNï£à?®{®÷Dˇ“ÏÍoI0`cu{}ﬁC÷ﬁ’™l 	`Ä·—1⁄@º»˜êwâ—"Å B∞§¿∆âYUÛ·àuªòôdÃM%ñî´Næ¬ÕÜâÕs≤LÑ´9[SR´ÍZ ÈË›ÊÖÂœ,>yJ&KâØ˜óuàïY∑Ê°ëJ˛üTÒ¨´»XxŒ¬G£fÚmJd∏Ì´uÑ^:x⁄FÊ8#Ÿ∑ Åˆm¯lµoØò<”,Nfssü8§:R5PcË[ó`m÷“uD#cÅ'º4niìB[´å´€M'üukY&˚Ñ\}“uéÓ*úó“a¿}ﬂÊ_ˇÚI€¬O76-SEße˜äN≈v⁄
:ÒÎˆÎ¯ÿ˙ΩŸj>∂ﬁo§¶ø:¢¯/¬Æ–byM’}¯e≠Ò√Ø©W6∑≠†™æ˘õk∑™™rﬁæ’Èﬁf’pá !¨%2S'S‘8/4G%>_Dß°÷#‰Uú'ÒZs.°vÆKdEïÊ4	ÂSfR tc∏ôYÊ˚∆Y2∑¯al„™PòZL”}[GsMZÏæåWrgˇ,u‹\E‡ããoSWé˘ò˘q/gK7ßiB«î¿ÉÅp\ππùC'
d!`m C∑Ó®6D8m‘L}‰óˆ`iáÄFÀ≤∫,ÍÆQ%∏-JW+V-í‰E^ù.µ˙¢óñ¯QÉ}ŒπıÜw‘™leâ{—ß@S«∞LXé÷ dªgãlËñ˙Õú’Q-47W]ﬁ‡rïzEÔÖÀö4!÷òº™ ∫T¿¶Æi°‹Îƒúe¬ÅÕlºÀL)B–Vîa€ﬁ ÄÓgîﬁs3\aò–£ –=¸&9Ãz|Se√®˘ªök 9z›tù
+ùÉm‡∑¨Ç‰!√¿ˆÖHoPò¶í9®Ù#Ñéì
òé∆^‚≥Ï„»p‰Óÿ]ñ'≈¯Ät‡ˆ„tñC(€aXbW ºµ§%CW	∆	ÜI›G‡#O	ú¥«ºûŸI˚`7`ô~§@Àø¸B∫µ[ÏX<˜í·’ØÉ¿ÎºQR¬Ø≥≥∆ﬁÂÑSö«Ù©Ñ0«Js•ú”	π*GßLOXªªp∆º#:5ä¬ùà™0∞¬ÉM´Ém‘÷Î:‘ìÔ«ΩF<rXÄ≈?©£8M±x`ÍÖ{5Ç9ßº∫+ÒrC£A?è· èã@N@^f!{◊‡qt¿óCè˛D	—¶˚ßg£Äg“˛ôΩk–ÈÛ#Í%ÏÖsˆÓÎÚkÒ˙-ÿJy÷—(pÒ)'Én∫˝k™ÒÌäÃbÒ≠Úì§”[Xm(ÚdªªåÍ=k√k‚>:£¥t¨4ï®*cäÎH:Jìçã≠∆¨tTô¢´k2É
jnÓ≤IE∆∂‹}[,F·®,dØî)o@SXQ.…‰”T^À‰Sü…≠j1øy~ŒüMk˝jàè¯˙±œKãucgÅ4 W≥MFÌ}Í¢±dSŸiíΩf9:™ºè˚,d¸ŒOs+dtv´-XèƒÍó*«ö;∏‡^»´#Ì&W;yz K?ı’ñ,fr˘,y≈ã_ä5oµ‚é+ª3$¿Á›A3Ckâ÷:≤Ô´BZ¿ãÁÚˆöéË‘pπ@k dN9˙GAˆqHΩtúPñ/n¯ùñ‘Ë¿À«y*gä¥¡,Ê/„Ãyè™ià=Éµ’Ô∆ÀÖ2∞y8ˇà&|&Õ÷Ôañ§ŒÄd¿√ Ú|O£	“Œº8˙ÕŸ_|™¶ˇç@®:í{ßÊ	´”A;nÂÉP¥Ÿaö´hóoÃt`wTPÜ¨ª¯7àÈIs1gÆ≈ky¬ÍÇ„syµ u&^óWáﬁŸ˜ΩX®væ≈#ˆ¢ö™›â¿%´*¶_Äú·l\"˝µmK	¢ >Ω*ÙÑπUﬂLzd>·0G6aviÅ›Ì[üúY*wË	ÃV:	∫vprñ∏%ôªô\NNù‡ ﬁnÜ\Û¨µh€£LÎêæÆﬁÃ
ár≥JÆ¢ﬁT‘ü—ƒß˛EóÜıFå0*G¸ﬂ≤-¶t⁄§≤Ã0)3«‹åÌçèÿ-zF≠ÏA¿:>Ç≥ò+f”¸/…ı∑¥4∫|¡æﬂ¢gŸŒÎ∑{;ﬂΩ€È‹;Çõûº}GØÃÁ˚kÙŒ—‘◊„ÒÕΩã
¶õ÷\Õ¸F¥( Ëö»Å÷⁄≥1†N›≠ëO[I¿jo+:≥≥π”⁄åª„§È^ƒÍ˘Á‹	âÂjÆç˘ø¸B]*Ph}Ë/9"7X$B Ωzﬂ.≠;¬¡ãßG[Y˜™´ë‡‰’⁄"ÊÄ_’jÆ£3òÛ{ÖD°t•«î,Ç>;Ü¡7˝Í€t¥Vè≠¸ô-˚g⁄“˙ÂrLÒrS≠™]ªÂJ_.\®·ˆ‰éÊÕe°äÀâ[´·ew u®HÒ95S50ïT¡ÙIË+q™∫V5’D^I0U‘%6w=ƒï'û„‡∆tO4m¯7Âÿ˚É<πL]°V„¨Ø\…©2Pé9›êé®
LƒÙ˘.∂∫J∞6Z∑&*’`πn/ä¡ñØ5‘Ç0jÆÖ …;˜~Ò√≥y˛C«ÅYkÚ·ÈÆÉÅÑXuBKÅ9º–?L8a-ÎÃ±ï8éOﬂ∆^öugﬁ∆XMæÙL¬˙^!ìØ~≈º≠ﬁêdòé%y…E_t@úüô#3Atœ¥ Oáe≤/ÅJ.,…ÑZ‹)Íkß•SmLQ√:£ÀŸÏÆxUiï∫ÿt®K§⁄‘Œ^/Ñ†‘5ös2◊óH‡¶±πè*‡Q£y
°fÂT¢	ˆã¸@8Ë H=ÇkV™°´A8æ˙+*ª3≈vÕÃ2G‘ 4Ââ˛€WÈÖ\ﬂôªã~∆˘m°ÉÍëM^R`7°)¨1-ûÉwÅ>óúhû1ÃS!S ‚∫Mﬂg?»–⁄ê¢É3`ÕÇΩ«T<1A¯Î'ÒÓåÑ	VŸö‡y‘{(Å≤∂ÉP`!E√Yú2'E®£]°∆B˛¬í¯R˝qïj?œoVUR(0Ò˚Ê÷2¬§‹•åÊ5†ﬂ?Y<9˛PØ-bTyøïöä∫*QZ√·AÔq®3Ì©å Àä|wB’ƒ~>•ú˙j›ø*}_QÙV÷˜o°%N%^˝gò£P‡vò	‡Ñ˛Iqÿ‘•@trì:¸Ø ÏÓ!@Ω™ÆO≠†Ç¢h¶‰m$◊A∆IZßïäu*Ú(ˆWö∫e9•ô&VSFïpπéπ˝	3n±\ØÆsGfÏR•EnB"á≠x8Ñµ}––O	R>åΩpJ$XU“koº_Ó„Q—U3™Â∞^¬tÓbJÎ®ë“˙°Çˆ’áØ¡=ThÙ{nEØƒR ∂≠Í’Û§’ı—b¶-te™…áú	⁄≤ï?Ü@∑`aaÄj§Ò—tõ‘ÄC~Ò≤~8MQ?©†’Îx»∫ñsP∑:ï
Ve+ójULüÆK^Ï`˛Ñ®Î|æX5^ï£9ñ¯∂x≥{Å’ãos§hhç»≈¡jF%ΩWpS‡NÛ€`ƒÇ-çêÓw≥<S7%=3öˇÒöûÊ≠üø`GCÔ‰´Í 0áµˆÆµ¶p`O5ªˇ|Ä_µs|‚,õûœèMT≠;N«$∫6OŒk˘e◊zx!OÙÁ´}∆$èÿUßÆ5ﬂ[©WQÌS[∞˘,	Ü›Yª“ñ´8>4ÌÇºrÇ˝m&âw>èeU∞at¥`EÕÒÁ9¢ÓÍ√¨Ω¥∫	´±köˆÌ
≈Œ;([r~¨~–sæÃ¸∂	íåÍñ:ã¢®Ôáy≤Ötÿ⁄∆åÍ	±\∂πd®M€a,æ¯ÎÜπ"√tZÓ:kPuóü¥Ω:2“2ôLp1(73≤¿W{üıxƒ¯kfÖ7.ãi„ÁˆÔ˙∆‘∑)sÕ˙ﬂ˝œÅLu'µ™F‚†∆e1µvjµ∞ŸîÊÓ¿üö⁄ËN≥éoí‡àMå¢	/›i	é˘Q†IM÷ÒfÍà†2:W#"çféG¯@g∏äuêÕl∞b ^õ±HÌuÿÊƒõŸ`ïı≤òÏ‡◊V¯qƒL03€±óÁ÷øÆ«P¶J∞
›7vøπÖ‚¢Pá®Ícµ÷Ã©OÿÒJCÈìı8˝¡öŸ¿…yπ<°VnEŸ£	£€qyâ≈=ﬂGÿ≈u›ãO≠≈îõÆ9ñ*7•ëKè…≈–@ç˚bÖ„≈áÌ%·5†,"zÓ:øÈπÎÒõqñƒŒîpl©hlÖØReÃm5jh ∞l¥=~E-%nD‘?@“€å÷≥cÍ˘Zjï%ç=È°æ,+kPR™ñªl
	u™*DΩSh‡1kaËØÂ7˙L?≥QhØpÉ÷≤c˝|%∑ÈΩ¢∞Ÿ<π.‡&z⁄[~XŒvâOÆ–ƒ±GÊ	ö8¬[uüè˙]ƒ√M»Œ`ﬁ<ÊâVú˘«˙“@‰6dT±®ÚœJ#{Å–øœ¸yíõDn`¯UBU˚‡ã¡WâWçC/ÚiΩ∫˙ktCwâ>Vœ˝lXYúŸ(¢d?ﬂ*<F~ä^˝{LﬁE7qákaÍ~K4Db¡@%÷≥Éÿ?◊5*‡⁄†ÙAdÓWs$ –=õ5 HÅ¥Inè ¸GFÓıÃØ-gﬂJHÃBªUÖåó—àS]‹úÉ3≥õr™ÀMGçó“∫3‚úΩÌ]•∂ÃaQ≤èÊ¨+†#x`;â^≤k∞O<zƒIGÑW.õU)p,œ◊ƒ≥Ò#
.∑[dì∂’ô#-4⁄Fç5^(£|?∞ vd‰òÜpRë]N»ê±lÔ2K≠ô©.x’˘œaV¶?™ûx©∑ö}∑Øè‰©§pÓ7Òæˇÿ·P©Ü£¨9g∑≠™ì<VcQãrv*AEJŒ÷§kÓÆÁÔ;√#Ä®Œp¿˛º{ÅˇÚ;!˛˚wù52‡pLNu≥T√£ÿÅõóøªÊOºZ{¨WHÀ¸îØôvÂêù€&\|\˘%dpƒ∂‹úr≈óoœ”»Oˇ{êw;§„`Îë/qJÄsJ:Ó”0õ>,=·F∑È Ü≈ıto◊uV∑Ÿ‚í©˘Rïá	cpÈãQ¯ïbE(q&Ü–∞WUÒ†9.xRÀj&;’ñ¬ÌT∏∆À¸°≈ÈtÒõ-.{r{ß∏ˆÿóÉ¶∑„‘;¢√vX˝l9¶	K˙»Qˆjıqiq^º_|·x‹èSz£x;∏«„∂óø<é˝√„Ç⁄∏°ﬁ≠U´Pπ¢Ñ˙ÁEÊÓGÙ≥ sááå]≠/dZ≈1^”UL2¸íìt·‡¡/Gπ˝6•cò#BÔ§≤,#WíÊG§	<∂ŒNÆbs≠˘∂¥ÀŸ™Öd2ÛÛÛ.Ó fvﬂÏΩ›‹{±IñWVf6ƒo7πıÊ’ÓﬁãW/∂ﬂÃlTü'nnÛ’Óõóõ3¸ÔƒÕÏøy˘ÓÍﬂÆ˛U~º~cdwoÛMÚ◊ÿéWõ€õ∏¯w‚fæ{Û¡Ø±ã/Ø˛Áﬁ∂á¸ìkSv◊˛îáö∞1:È2›–¢#R¸íÜV0xﬂ)lW›wØgë¡ﬂı1p››≠∑Ï˚ñúy§ªıGˆÌy‚•ÉòtüÔ±Øõ√Q¬ØpZŸ˜oÉ4Úé‡∆∑˚ﬂ±;—	c¿¿›ù◊?∞;ﬂy!øvø{…æÓ≈!|Ÿ{ô˜ù@«ºÈW≠–›WÏÀ˜„ ˚gﬁËÀÄ˝î7@”°¬+[‚”¥´Œ’⁄qI≤åhﬁñ…••5“aftk"ºvä\◊º∞˝ è»D…Œ£ ¡ﬁDÊÖﬂMz–Jq!q≥\Çï/	A¶úfø0)óém{uÕúÖ2∆A™≤ „7gÃ[#&¬¡í"|õ∞¡Í‰ch[Òy¬∆ƒ1≥!|ô∞9Ò ≥ |õ∞A	sÕlH_'lR∆}r(~ü∞Q}…ØæLÿ\â~g6 è√Gﬁ{¸”Ñïòf£¸8aS›¿::≈Á	+…z®Â']v$Z∞‰¯g¬&~ûŸ‡ŒZ]?8¬∫r 8…çmªxbúåâNfÒ6∂Îöız'Åòw†KÊ†;BTÓZ¬ú¯’‰L—÷)•”U¡eÊ≤ê-UÍƒ…∂ì€õª2=°Ω∆¥îÿ-VÔk)êÆ´¯ô™Øá\^.¿∂y0»ß3K≠º3æœ¨≤ãE¿î¶9ÙˆUÖ4º„´ñädvCY√˙duQ4ÀT)fD4G◊ò—ÎyíáèE:¶YÃ¨ái‹ïøNÀ’£ﬁn„p∂Ω√Ha4#/IÈã(´«;^«=‰:'aÒŒü+≤ìN:,^Û(•Ã¥|A—FÌ€Â`—U6úIAñIˆ‚/”y±Õ/‹π3È†|B˜9tc˝Í|Ê§8SÇ.±Õ©˙–M5+∂§“zèÜ“Œn`j≈˛‚¬Ÿ˘??H1ÿ√/\_”èAU+(£yâ;® %nmΩ=cU9ßµ< „vå∞PWez∞–Ë‘`Uå•¶‘	ZÊ”8Èç‚¿—q∆Ï
¿”¡OÒôã°[õer\E‹`rîxÁåö÷rHπ4éπ>h∑‡Ú‘]à€ùè…¡∫ÓPﬁJ„–TwD–¯3ÕlHe¡\3£kcm≈á,6ˇ	Is3üTÌµ§Ÿç≥L3:÷r~±ùúµ8∑hE9_ØòH&»èí`@e≤∫?-_µË∆>>cÔ.0ê±ÌtLÓ›÷1ØÊíÁèG!∫[4v»Ö’“ﬁÒÚ@∞+,cΩ‡^≈ÓIe≠ÿùUY!fç∂≠Õ:»BËxõè?·Y8c¶∞∏lÏªèŒ›Ú5‰/8˙_5¢ôÚTØd…≠t£3d¥w⁄¨AGBá∞eBwËP√´êVÉMµÎ¡G	!{lVR‡Êì∑˛6Ò“„~∞pÀ¢^ìÏÍ#ÛÙÓÄé..~B.‹1Â¢E/Û0Vçæ"\M’≈Ö"µUˇ«JÃ%xvvñ›‚y˜u˛“R™^G¢»`∆æ(wRµ20√|.∂i*ì,*ß
‘Á1›œüÁ3LÁíñIß2u≤mRæ,ÅSóÀQ\™¥zf√X¶h’$®zàŸäT∆KÀY+“∫⁄êíj/∂ºh@C/Qlà6˚ÉmπRñ≥Uµ\ıYøÔÊ≠Kh¶^a˙O˙´˝∆J|@◊˘ßä[Ì;§rFhZv[≈ı}Ô§®aﬁg©«…sês∞‚`R€cÆ±Ω‰ÈOú˜@Å‘÷0aÆxOùe[zµ %œRVÓ≈ÒEtÇNÃ…˘¥ìgø∏¯·kJü=Ù•Jôò"∏ ú=Â‰ÿÕ¡™4ÿ“Èp/ç∑æõ0ÂL≥∂fŒ(œ…û∞_y#ÀE6ÜÓnúd^›SNï`ª@j§ŸÑæ}ÍSLã|õêÒª9«?Já≥1VÁ¨‘ödKäR≥7îúåCî·™*§Ÿ˜BO´?©œ£ñµ∫oH;{±˜ÊÕ´}^w	vÃ¿¿xÅLh@«e*Ä$/_ÅÄ¬˙÷r®™äœÀ˙≤#,≥7´’(»7©–)/¢Ñx}4%±*˘ç¸∑N^„L ”ÚŒöR¸Â∑:∫*f⁄˙ï5±ˇ∆Ã5gŸgÅ˘ÁAø&§LÂú:C=/o∞Ú∏^⁄†™J¬2(SÁÎS4™OMõlö˘äUI4≠˙õe"ÂìŸ&‡d5|ùQ‘fO±h8]5íÚqÖW,ÆZÔ^jhEcÆ£1(:Kºxd´≈ïS,©A∂m·ÜçN‘]ª≈õπÜ«Ñ ò&Y=tñ‹ıÉ—≠Ÿ…ìZﬂ∑f…ÚJB\ày ÿ◊Œ<ÌoZüj≠ŒB[£∂!≠¨¨,.o¡—ÀSÃÍçì¬∞üZ"m'r∂Âé~3¬•S¯6Ø≤s6¶TZ≥›ÌÁòc‘0p∞C¸åK5G‘á@Ì∂mQΩ•<üY$.Í‘%‚B™êÑ‚Ô(íÍm@Î,TˆzoÌV{y˜-Æç7(´‰Õ„Õ˚zQÅ`F/NZ*J!∆  ≠î~’ª«¬ô≠¶ù+Í?CÒ£ ecÆñQ<∂FËYêÒéºA8‡É¿èmM~À¸„ıê„§ªMS‡c˝´øÇh6Î‘>Ó5„…4}Ì‚”dÅlûx¿˛6_k∂Ô«ﬁ¿S¨IÏ{XhéıPd=Vµ›|£“‘\∫õ:˘ge…'aõïeü&ÜU=e—u{¨‹™Æ¶KC“PAq˘∞s’1˝Hx™8Sy?e˝¡ ¶õö…oÈ(éÚà√¢¿‡öa± ö¥óò«âe”çU7≠ÕI_H¢›NòD’2≈µ¿/≠>Z]^Ÿ˘ê'à/‘/px∆^£˜ä5TŸÍªlI)ovÍpL%Øó∑
#OŒ5·å_¯Œrï ã7]kÌLä⁄<
d<‰~#.˘.£^^RŸò3Y¥}ï=E?¯n	Ω™N0È¢SÓi˙≤≤ô◊õùÀY“#ç5o£u“z◊sÙò˛D*ã?hM∆N'ØÊô.?© ¨.çÜ‚í±(7ØJÑn<™võÃS‹Í1çÕi¬ÕU¢)+
®˜˚Ïº˚ Àéîœ∫¿˚e“O DK&á%	π,ı…1˛#äòúéUÆ]}%¯-ÃWW;+*Ù⁄Y‚Xiyò[Zœqrƒ–~Oˆñ¢'N∫1õﬂü-™*G#ÚŒµ¡±p–EA ¢YtÑU˘’”ﬁrü;2CÒX '<1ƒx≠
·-˘ÓQm:D|-Ë]≤ı∫ß[:†µC˘8îø˘3˘áâŒ§ñÈ™U\õÈ9A1S}0∞O^—î¶ •=&˚tËE^j*9i√/.ÿEÚﬁÚ¬¡8Å*6Ñﬂ?i˜ñºÄÖ„Ò*àˆ3ÿÉYC%MB∫ˆ‹é<o
ÁÌà^∂4»9¡√ ÚˇÆ¿g2§ÃÙ‚h$¿vlÜ>™SJ
œ˜∞ﬁ…”¸À
Ôp#}_≤âé6ß9Ih6N"±¡≤K«H¿ÄaW¯È˜‰Ò¨*<o2MŸy«êPÚr∂´ÀÆÉCQlº¡R¨ßz≈À›ñA¬†í’yÉöc«ÑwX[(Åñ!‹¶¡EI˙ ∆>àπÒ8Q2&É´_ÒÙ∆¨∆ËÍ◊,∞ )}2dH•˚&Õq
f√OÉˆ—SŸZ[ñ≠~O-iª˚EOﬂ⁄}g¡	,çó´¢Z±ıàtÿ(’meËßÀ.ò0Ä˘N©÷Îv}åá±9Îí tcA±8ÈÓÔlΩ}≥∑ˇ~—d^4dC™yZ,7™_π{Z‘ïî≈å&q∂ê*,∫8Z‰îMÎhabW∂¯@'$>3‡‰∫`‹0¬òç1∑◊Áñ|wV
M˙
,Ö§¥l”t‡%]®å"÷vX,c—Ì›É∑“ t◊Ó>–/ﬁ∏!¨¥1kÿBn˚“¡åœˇŒô∏Ê_ºÏÆôÄâ‰lc0M‰eWø&c?KÉ)ÏÜn’∫Zú¬ùXÏŒ+8Uù}
∞è"I¨…•e‰á‘÷hoQ{V|«6f⁄=©Xú∞ÉÕZq∞óKπáhë’6≈è≥Pêè¡!¥€)≥êkbIW≥∂Qs4`∆Ù˝dBKå·›P›+W‡Eìa˘y·4`©ÁfI˝÷∑kmªÒ2V:7ÁÁ›=:†#8‚ÈbÕ;≥Í0ÃgÖa^ôœ+,˝–S>kv√;…√äøh®"krk0jçÏX6ò¥÷–ò>†Ô¿ˆÒr¢%®ª%ˇò~∏÷i¥ ±;dÓº]Ë.8O«ƒ"∆ﬁÙ˝Ñ¶iÀÙ5‘ú7“Ú≠Y2l8¯3 Ô÷Î›˙·vë’˜¬ˇ‡ˇ≈ﬁÑYdÓ"Ù‚é\t±Ö€É€;«xÏz#hm0ˆÃèI˜Õà9 Ñ§G˛iwÁªÖ›◊ﬂ91!NŸgÃ‰H5Ω<™°÷dØùÏ>¶æ¥K'ﬂKè´@¶J¥¿>ó≤kí:z‹;b	É7
Aå)2~<4≈∆≤ÂË)#d'œ˜•äæ)‘ÜÌ›Å “ñÀrøzGÖ›M@BJº1Ãe›“À≤ÄOá‘—Æ	«\äåµ åxÑt∆˛∞7@ÚÒt&¿â.¸ﬁ·agéﬂßë√;ŒÎRÁà‹2çÛç‡˜ÙŸ¸˚≈.˜–
éo∏ñ(‰}& 
püÃ∑Ú^ﬂc7\À-Ú◊Á„èç|h®]ÂG†	/eòÏÊm[33‚•$ÕêÑ9éË≤’¿Òœf∫ÌeﬁªΩó|˘\ﬁ∑kECzpbq«Ÿ%Á˛≠dSlkÃL€cå0 wV˙≤Òœã
‘œüCß,„É@'VÓ¶û9ä01úBF19y‘√©Â≥$»∑`ÿˆ`£®˙ﬁá#/wR∆01W9Uh¥Æÿ{√î#W;UŸ·6MOÎ3ºt†!êÜ›ÑûÙ¥i(ßœ˛ƒ?“Aêe^`=8V,`ŸJ ‹9Ü±,*¨Æ˛Oò¡	qÓ$HØ˛ﬂyM€ŒŸÈØ,,Æ ?Ÿ¯≈È÷
©ç≠7¸›∂¶A÷Àmb∑°m3¸»‹§&3∏[ÑƒÑ£Z\∑å”ÿS@{LFóË0÷ñï7ÊÂ¿≥î¸YÏ†—t.x k/ŸnM—l ıäéÃ◊#@5Y‹\í\˝
Áë-¬âƒ√òH:ﬁySùeœuØ}¡^.g∑çN|*˙âæpüsì®œM¢N±_ıJv^2º˙u`Õ+Ó‰E^†Ü ä±≤ù˛Gá ≥‹ÒégVdÎ—*–åøReZ‰_7ä7•éÎ“ZÈ/&BÇZñO_]Bú|?G‡_¿Åz…GàñØb‰ŸkÜó¶Ôæ˙‰L;‚tf„üXÄ´M}‚°€oD[`hD≤Ê UÏ÷AÙòKdWLÉVf≤jhH7oÃΩÙÒ:&Q\Ñ£°¶QΩìaÈ˙ÀÄàƒc‚1:Çœ:F‘‹íF∂Öé`Qcm[Ò.<ñ⁄ ^…”…ÛÍ|‡ïâ6™´ ≤!Ω’“WdÚì¡rirz7ã/˝	ñq˜`é`MÖ3£ñHä—Üà∞(íèÅ>:$í–„|∂d<ÆÂêlE⁄_hµ˙6UÏ6ÕºƒÖ5‡|fÉ≈)?cA+ÃˇfHÑ|úÈòe‡à-ú^≥EÿEÆÇûŸ¬ßüi‚ß…/E~äÚ¡"ﬁÖ≈’ÿÜ„dÉúÇ’√M÷F÷¬ì_‘#z˙-;$ Ôò•åüΩo˘‚{¿™u~JƒPT˝s§lÔø[∂d}À™ïH√crˇãj£BïdùT§gbÈÓñlˆVõ∆I∫Ã/7]›Ùãò∏äÑç™8{Oû<±mKNÊ',!◊ÆÆ∫•¸suï„∂T€¡¯Oå‰Û£Í$úˆñ÷#√ôf÷nH‹ñ¿UïÖÕ‡e”[˛´LıÔ˛·Ÿj/]L:øëÌç^µ79WõgÏ~∆ñ=∞4ûú…µºÍ<WÆolñKA≠‡0‘	ø≈e5°¸—ΩíâÀä_«ÈF“ój·fWx{ëFõ}Kv}˙Fì•y‡§a¥« oª§ºRº0‘µ¨cÂ¯º∏OΩdp,æÎ§q8t“√Sîƒ£ﬁ“BüpƒZú≥ÚÃ¥2ï::â`H˜s§p÷'ÎêΩY9†Ä¶?èå%œì`MR_~¢˛lî¥#F'®JnGrè≥0àhÉ¬_€¨Ñó¨¢∆›Km¢˘Íö»;¶Rj’˘?Wˇ1©.˝l=Iãt0F©óïﬁ‚dˇôûo«ßQ´ŸÚî◊?—sÆΩ€A¢€A}ÌÉ⁄j„Ωúï≈]ΩË¸(°òTwõz„0su¯YX <y$…é¨í°”kπÉfüDß¡8A&Ùmû◊;óf›˛Ó≤ˆx1w'x~ñµ:è*RhÉèÕm2∑·ƒ£S⁄WW˝ï{˘îÙŸÆ◊a÷……«ÆƒØ.É:’Ã'“ÎWóñj,í$8:∆øH=xö\L˘Q≤™(±J∆ÃrÎ \ﬂ’Á¢[®)7ò+*KæüùL/e¸˝]VÒ*[ $∂qÍƒ√@˝Ëç˜È1ı·7ö§áùÀOÆnsL°¡ë√“KtüπÊuãg´ ıGj`Ó"¨#/Ë≤Riúd›Æ7GíıÿdÁÅÒÚB∫Q‡Ì‰u„ú⁄~üv·,-:=Ôö«≤∫lAﬂÚ%ÂΩt|ßmHºZãÿ≈Ö∏8ßDiÙ _/µÛåée$]ÈøXÍ®ÿC⁄∞ì"^à·üØ~E+¸yÀŸ±0«îŸ!Ê;Xô;I‚ƒïéã√µ˚Æ€  Úï˙aé\ê|q÷äïô#≤`ô√Õµ(]‘˘#'Fx2à_8û_&K „]Ì€#ˇ†¬¸≈É–A∂&i∂lµø‹ŒÜão=^ˆ–(Èi≥iß^!}C¿‰VséæΩi'O¶G±d‰iíã^ØÁ`Q‡‚Û_>l⁄˘ﬁ—»wäw»[TóU≈Ò*€¢ò†[N¶	¿∫4øä‡∫äÚ:B˘ı¯¶]r·⁄tú‚,Í}q´ˆG¨ÕÌVtXË∞∂~ü¯>ñ’ﬂ`BA@A‹ûg‰{F:í«ÛçêÖ~Ãá—fÌT3b¢“ÿ8“√ ÚÚîµ;k, Å˘.÷[òùœ‚óåc¿üsû•3 zﬂÓuújóã’rwúoqà\Î≥˛Ì,émÑ6o°≥k¯≠€Ñ©ã∂Ç“dÊ¯©k¯˙¢Ü—Æ[t´Õ€ë_◊uæëUJìÊ±ÁWÀlˆ¸ö–¥à\'ëïDvvŸÿ¿£:sÉ.|Ø+Àò'i¡Ê:qgÆÛ∞£ ;;	€¨P‡ƒvNÃØN∆([¯[´ö⁄‰Bã;Ì‰6À/^8¡:œöÇWIØÂ‘-0§¨§`'H39Œ>à∂bÒ <óë{›_x›π$]6´‡,ûëO=ñ‚mú	ŸáO»Ù8D–á2≈e›swf‰‚#A6∏7ÎáY≤ê9›nt\˚™-∏åÖÎ[÷
lYû^çÍÛRvı,ÿ›¶·X#¨†›Îk≠¨ût©Øãßå≠ú∏ﬁQV˝≤JÚ}Jô˛_µO~êz!+^j©]udù¶m[4ØÊ≈ß∆r*Í	 ++k6äAÆÂät;ø—Ä‘dıŸ¯≈≥ä¢nπß≈ÕG(´i^◊Wo3ˆW˙1T!ªxÁ1Ù‰‹ë¶nõÿçáò^ûøı®MG∫nbOA‰G±‹U~œÿWπã°yOï2Ru¶&-€óœi+éÉdh,›ß^.#  ≠Z.C◊∫y‚‘Y ÒÜﬂÈ÷Ó_ŒÊÑÙì„†¿"â˙Î≤ÿ∏õç	¢‰ S[Nm$B€y¡÷-´Íˆ∂($ä6ZÒ^˚J¢€¿ÆdÙFäàæ∏¯·k*#:ÙeDØY)tE U,õ:âøú
°ø¬j’Óú¬qêêWR¸htÍ-çµïµYåj~§‡ ˆ°∫µ ÇT)éàùê.=[Éπ¶»€ì‚¡’_»(ˆÛ»÷¡xÑüz°á!S« ú_˝-…KFMƒÈ|m&5}π¸´≥s€¥‚ŸØÂ†Q7Èº´LÙ7ÍU8E.ÙJ¶F®˛K/∫˙wèWÜı)ﬂ√ÊkEp<¢ÿÆ˜RÑ¬KoÿΩtÓguŸToôa÷{‹{¨.x.†TYa>òÜÕΩ©°…ﬂh$-%r\^óØÜ¿;uÎdG(òÛ¬0Gdÿiπd"hì,b˚ï´;DOi≥>ÇzßP|õf^ﬁWˇVìÌ˜OVON?êh-«òâSq$Ω2_¡z9Í¢‡èW€W!ìô\MX’ÊnÅÆX√5K!T∏{¢…ü—Ä¢JúÅπ~L±ˆî^§·°™@‹ãàD∆Ì´Íå„µFÙùquüéœ;⁄MÆ˛v„îx±P¢\˝∞÷õÁ?^”MSÃoÔëˇ˙óˇM∂PVÛB$aõhRÖ±…±ª \#¬RcÄÅX9K[â˙%⁄éËG∞)gÓñ	‹%¿E˘Wâ0KCÄÕyY≥@Å¬W@©Ÿõ<¨SÔQÂ§†cŒ¡`¶∑Âp"≤s6äìl+T(aè‚∑›ÌÁ]±	Mÿ°HyÕ…Ap‚QÔá†k;Á‰f9˜ê%Z'lï Ã¶ïƒ‹”Ç%;J<?ÄÌÔeq/!áI<t<'Å'“∏ÆdûÆnè=ñiØ™2úE]‘aCsßìÉTöJñlŒÄ’Ú]bHe8JÇ!àH{åÅB„iBñÙΩcDXv‘7U√äÄí∏5f@âÊù≠‰ÍØX!OÖëî ˝›Ñßè£;îçª≠J∑òˇlõËÊSe/©Ã1Èùu¨u9çíø€áõ5Ú˛ÉíÒÆÂDÏ◊´Œ.	˘QMÔªÈÊÀ81.©_O˘cl
i∑âŸ QïégF8X<_óK"wHø√§π‡!ã3/,+ovÄ¢±•o".˛¶ÒY4ÚåW-\πŸM¥˝âÌbé*Ò°Ÿy}≠Oﬁ—0àæwÌK¨⁄Ï…\Y4âeÊ`R:Íûc>’`>Ò‹√ﬂ\¿Ç3ãf≠Î¿ˇá¶sNï»„E ¸¬òS˙É¢U¥?˜ÂÊ¥ÉbMUnfç÷jhBÉçAz#/Òø=B‡(ÕUôl˛Ωø∏®(≤ä/kÙí)c0NG¬£⁄Á∑0#©‘›RAÑ¯◊'ãB ñ¶.Éæï¨Öøñ´RÀoz∑6£‚öG˘ﬂœŒYZb´iE±¬EeﬁrÛ’úã¥	E∆=1µûzà¥?Ïºﬁz±˝F˜ú∏EõÇ.ÛqπÏ(o*©VùfB˝c¬g¶◊Ón”ÌWÒ¨ÚÕÊzåDÕ≤~Jñ=˝È\Xu¸Ê≤Ëª{WˇÎèÛ◊~gœeÈÛÜs¢_û‹¬;Æ4E2M‚ç«Íun¬π!œ–∫6ã˘π|bq1´^~“§©≠[ò’˙éBl/ı´™Ñïﬂ\]W◊†”8m∏Ie¨ö/ÀêÑπ∑N{\9c®¨µ{ÒÈ„_èÒhÍ”	√_ñVXúâ[ÜÇüÅ.Ùßﬁbµ2]å‘K‹P«Fy)oâ=+!i©·µcï€Äµ†Aå.“"îÒmQb]Fœ»˙ñ“»˜
ñºø»XÚ5bK˘bŒ÷ZOÌ&üˇ”ƒ5ami~’áﬂå¨P¿CÆê:`iV%=∞–„h _f6.\‚-tÚO–§Ÿ~-jÄÛÈï;7ö¥˙¬_Ë◊ÏJmvB∑πZÎs’¶tp[`∆&$¨€#c˛€ò÷èû%ˇ∏2Ç£ı´¿ı÷b<&t∏F*wΩ´*8Ó=0{ÓëÓÖË!8k˜Ó«µÕâJXbíπÊ‰Hú*jÈÁù®√L6
∆ò	I0V±“}ÖÖ
á1‹Ñ ◊òíüŒ´à ‡®•28™“óriÓYZ[gmºÁq—ı„§˘R
Á?ƒp‘˙9]L>Íï$…M”¬’É˘"ßç√qj…$Óù÷Ã<Œ±ß◊V∞Ë›ΩπÑ…Õπ/Ú‹ìFY<_¡˜ã‚∞æõ/(ÍRãITú/ü√ö8:˝T≤È≤: +⁄: ml˙‰UèeSÆô¨a·7ß≠+{¨;®CØ+∂´ès“ÄbcÕÍ∑	-û˘êq˜iñnMŸ∂N”MÈ—◊Â¶ïê˜~πœ8%Ÿ∂Y´B‰H–‹Ú˘dÒ‰¯√≤tVÊÕ*¶T∞o2C¸—8Aß£ˇ tÎ«d?H°Øç)Oi?Õ—˝"Ú∆ﬂ—mèïL≈ÑíCö$Ï&‡)œíÀRÙ£?PÍl£kÁd"ùÜ.C—fOâkk∏≈‘i¸Ê„¶⁄[±“Fï∑—=B∫w±{Ú⁄;	éX¡Ú÷;H…Ô.ÌPô◊ƒcA∆‚‘/JÚØ@5ˆOs¯ÇbÀÚÌÇa£—Ú(VEø™\ﬁÅê†…ÓLˆí V¡l∆≥R„K£ÙÑO´Fü#≠ìmßƒD\Ú«\Ä(Èó÷N/@”Cà=Q˘m7)ûÏX«‡=Ãπœ83˝è±à3T<r´ucJên‚°WG∆ÍMË-c`Í`î≈qò™£®Ô$)`âè\√üLNìî{ ¿˙ªî&©-ù™ÁQ`°Ωt¸V3c„ç†£ :¸Ú–ÙóÑé`º.òh?>H®ˇ»w›Ì¿ÎÆlò±©@ºP#z”ı•TZ’üŒˇ≥-Zmêd9{®‘Í≤o:ﬂ6‰!WÙc!5µ†°y‘±îÆÓ¯’v+®O}8¨¨ˆ§œw'Ûõòt+§úÒDäï£XµLÔäf]îåoH=üyÑ”–C—I>7ÇKõv∆[ûÔœKIú2¶òççƒáå>H±∫…:¸GGª1 £ıS$¥¸ÊRﬂ‚	,Jtı∑d¿îw˜_Ì´ü˙a9äˆﬂU +.<QQs˛}ûÏÑ `≠?«L<L]
«Ÿˇ  ˇˇÏ}Ks«ñﬁ_IBÚEc4–xì†õ (·ö$  “å¡ ›E†§ÍÆæU›xÜc"º∞7;¬;/£Òb‚NÑVw„ò-˛…˝˛>'UôYôYY˝ !â=s©FuUV>Nû<œÔ$†ÇApû—ˆGÜ	˛ê†"——Ÿœ»¡ŒÀEVùë’d„ı:—©ûëP,Ç—XÊ(9"Ó+¨¸∏√_Jæaedy˝ƒíºÀ4Ô)…Í^éÉ¶AW":§ø≤m¶JOïÆ˙ÈXRπ¬@ßÆ}„	)dØ„¶Ä≠[3i‹ûéR7.QyíL:T[í≤:ÒE\è_åbD-™≤≥§w^˙> FàÊ«seÄv∑É”ÓüÉ¯ˇ rJ∞ÏÛ*óÑe>ü‰”ô˚§Cnô*Ëïaú Õìˆ∫Î%.¸C·?FÜryóüœ›∫˜®D∞Qø¶÷uƒÌtú»!öˇ⁄Ø^ë5 534&~ìÙí≥∞&£åÜùa–?C÷`ﬁ`¶°ToÅ™J)ÿΩVìvâ¥„^r§—Z≤˛‚µ-â~ç‚ ]pÙÃÜ∏ìé-∞∂ñÛH1◊‚7Ÿ@É‚Q[ÆÿÍTöΩ	iDtÿï>¨LKœñæe•eK”7ßxJ©1K2éôj…∫·f—oØﬂ_Ωì¸4öEˇÍU÷yÄ•Ì±πVÊÅcÂÍs[ÌWØ˜ˇÆ}∏˜≤Ω≥?Ö≤∫Œ›≤ wã,Aê∆6£≈ÈÌ≤Sﬁ+"a∆˚d@G·‡jùˆ§L|Úî›k
Y?Í;ÿµ∑˝ÍÓøΩŸ€nìù]r¥ˇ‚∞˝j÷t∏∆ÈPóSI„êvqRR<i5[oë© ó§ò)i$I˛Sô*ßLìË¬Kp†5)RyN¶«bÍjS#Ûí¿ò7>&]Úôˆ'ÕÌ˝7GwˇÛp{o_(13™9Ó¶X§◊ùËÇ*∂Ø¢~XCƒ·46TÂ≤UÆ∞∫Ñ.Ãƒ  ªΩ(√™÷4ÜÇúÇ<yIu√:rñ\jI»+n·˝|£åˇZ,§ö±ıƒ±ûŒ-q∏ªΩ˜byŒÓõ„√›Ø)˚y›>ﬁ=‹kør,‰˘F≠¯†
Q}£"6à’ÜŸJÄÜ±In2"†êXhÀ¬"ôÔvó_ø^æÜ˘ÊõÕ^œÕ9^ÖÈ*Ä*ã6¸5(Ëÿˇı¬ﬁ·©ü·ì¯:53`à(é€»F≈ªÅ*_ÿHµ¨uo˙v#ñ‘Â∆Xì4lØW˝nqı€Ω}™JD™Ü5K†∂≈Í⁄œ¯´j8à[ÁÙ_]«âEõm‘ßÂY(xCµé∫Ï˚‘RÎÀÔö´ççˇÓK§eå∫π~éFß∞‹√QÑhºQ"⁄~B:ö3D‘à∞ú8^QLÖeÀÖëÏ.eÔ>”J¢lr¨Oï±‹ô¡r2√H2ö‰Îl¡f÷®XKPC#Ÿ5§¿…Õfera∑V–æÏ“Z£qƒl∞ed7È±Jà‚*xA€Øx.¢uF)zKÉÑ%$“ú&ˇ¿‰õ˜zLJôÅbŒ*˚“Öâ	Õﬁ%œ‹ÂfB‘óek^b‘k¨ú+Ñ´Z\ZÁ1Á2ó]+“äñä¯â‹2ªQ~>é*ËÅÒ^ÉˇNG∑l=¨ßN“˜ÌñÜû^R‰†â∫'ßzHåc	Œ;Ù› NÇÆ∫€à§Fπ°jÄÁRµ∆P[¡Øû≥IÿYÂ—4,Ω)_åázHÀnd§œ∑ñÇ≥Bø¢PZ™k-zL¢û«€1czP⁄cîG°MÎπá˝ãH%`c±x’|∞óõ0Ü≠Q+˛¡õØ…æ&…à}ˇ5∆Öˇ|’$´Ø_,xº”cÓf¶’Åî≈B>Dq8GÇN' €â–ª∫¸7
≥·f	Yä	öh¿(»A8Nòx◊)[(ª„–î	nê¯¨KÃ@ó»-nì´eB¯µ®JœÔâB°⁄!g¶Nl+fÀœ ƒge¬Kô–≠‰Û*´Ê⁄DaŒóä‚™óN!q®˙jEMk˛ÏîäÒ‹≥T(¯º>RñÍì™Úd¸Nîäú∏ï5˘¨Z¯©eâ„≥za˙y:ÍÖ"*ÃVπngƒ]ÜU^&Gﬂ¡ø<í4‡«®OBÑs‚]%à0SV<Då»gÕcöá\;bL’£&y‹Kud˜*:ç∫&?F»˚M55∑¿{„ÄßÂEŒ“èi!ÜH∂ô©"z‘€ge‰≥2‚•å√-Á5æ¶WcUtÈ≤óRR‹?éV2N|ËÏTw¿)„±òzëı©åêºpüRC)Ê‚w¢ûHµãK•ç?+(ï
Jä]EÌ¯(üïî1ïçìÕVMYÁj ∑£†ãµÆ`¬√˛H Æû∫FB’>´#3PGDä‚∏∫àùÓª⁄—√˛bKX+ Q∂‘k€.¬≥"[+êOf©nÃV«¯¨X|V,j)ö6AπW%D&∑¨Gàk^JøyL‚®∫ÆêÛ@dÅY]»S∏≈*|JEALƒÔDM‡Ñ,-ƒg¡KA¯ìÿ0]DÃ‡)¸3R^“làÑ¥6[§°k
K‰˜ß*Ã^?ÿhíÉ` „q‘;MÉÆÑk—†∞=“^ü∫éê'/}V¶≠$HÂöÎ´	U§–…Kx]Ç4q/uÜÌ C˜DÄx"4Çä)?‹˝LIÜ?@K: °%å+b√ª˚WöØAπ`B>–ëv)Ï¬Ã‘âX-r?Cµ"—o\π»…˜≥ñ15-Cß“B€‡ÏÜÎ¸/M„(ÆzÈ˘Ì„hÂû~2ÌCÎ
◊B4€^7(!0yZñµXË^∑˙$ù¢∆¬ó‚ë≤∫üHkâÚ#Hù¬ﬂâìÔ
ee>+1n%¶ Ì–Ô0—f¶…®π†√}ø"≈≈—∂¨”8n+©;é{öê„ÓBIjÑ8˙¥q
xè˝%œH^»ˇŒû7OVﬁ⁄AÏÒÉÖ¶ﬁ^u¥£ÿﬁ`?∫⁄∏µ<¬œD:ù˜∆Àe8”2–$CÜe%Á\ò∫%ûı∞6å§>•≠&SÔ˛QLl6Ë<0vu’ œ<î;,®3ß† ìŸ	XÍÖ@ò5´Aˆı≥ó4ñ07Jë’òê€IöF?†^Ñ˚! Ü¨öqFF˝Ë(=®Í|»ÎxÑÈ0I: ,,›Ozà‰}@L¨°ÃÆ@Ò—à÷ÖÓé†x–G˙†W±ö(&’…∆Ëa;Cß\{√È^YÔ‚uÃÂàó<…\ÉΩÍWÃqµ§¨5…åôÉÒ©fÅ…ñä˚Z¡UUß ≠<JpQ1ò˝=¿¨ÂYﬂa2Ñ3tªs©÷—}MI-ïjÕÑ6∞UójwoàãõÃÇ@‰ê§)”àG7%2ëz[üR†õ®‚ÈÑ™ﬂ…“ØêV∂aú%È5}‡5:ø#xpﬁVÿ‹Ù‘õR¸]˝ ¨X“£èy?CK•SaLyÌËZ“DßL÷ºÂ)Ru—◊˙D}ú©-‘_>¡ç®‘Põ™ß-!R‡˜ZR°∞‰¯xÃB°á·=7∏íaí¬æß=cU≥†fAS_5U¯≤á^Ë‹ıãı†Ø¬‚ ∞M}5||Ç»›ˇIj"≥a$˝ƒ¨·>·(¢‹§WÄú€j5Wõ+Ä≈˜`¢é±tn.vtÑ=¬ã˙ç3u6Çú€∫aµ›y=∫)MÕ`ËÇÒÆ∞^x‡ÔÁv
¿?∑"ní"6;Ÿ	≥∞ëƒM6w·—Uó+-fÈ=AˆÊYüaˆË…ø;ÎQ‹]ƒ˙íi)∆Œ{jóJSïÇi÷J{¸€™ï'®≥V⁄Ï†yñ:;˘¢µ›z“zÙvnÀ§óòäú’,(¶)íu+äù|Òr˛o˝≠´¢ÿ«´Ê_ïƒ]ëƒß	,Ï∫ÅVôV|*k`|<··¶Qz˜3…NGJj !äE)]¡,$º®§$Çú£-Ê/i‘1Ñ¨⁄´’¶Õ0fã3“rp“n?nØ>Ÿ}Î®ÍÄg ÚΩèÇÇÒÏ‹O#¥∑7éBy~Ó~È&VìÊ”,å√é—Êl–xAœ5¢ê9ßÇ~“◊îÇŒ(€ƒ"¿∞;§?Úº‹Z)I8=ì»~ ï<ª…íQ⁄…7¶Ië)¨”°ÿœ 3ç‹Mõ4lj„ñh°=÷ç98ÅqŒ".ß<4Ï•i8LöÕÊ”evª©•õQΩ$9oiˆÇA#√Æö\‚Õ?Ü◊œnﬁ≥Ò/}yì›æøÕ'Âv˛ÁzÈÇaò ˙–u˜ßp+á(œï:àB3≠ÑàY€hßirπì\ˆiàí ïoóî⁄≠ñ÷7ÊîjÛ~2«=ﬂ’ ‰Å⁄óê∆§¥mFgøçÕˆbΩ}¨<3´˝1∂3Î¯=ÿŒ†¿¨ìº@®…ƒÔ∞∆M$Bù´∞¬z9Ú]¥Òhcm}˜m…ÓDâMíævÌnÏ‚cNÅÀL€AøÇHiòaõ]«gnò˚Rù”lt£,8ç√Ó≥õ(√ªawaÌˆÍ…G/©{/i7°â®zÉ…N⁄‰Å⁄õﬂD≈g1Fåé‚Z ¨<Ê´ü±k…eÿ•1P™Îƒœyﬂ™óRßm—MO=‹+ŸãbYŸ Û‰hrê&ù0À–…ú»¢uyÑ5d∆ﬁπÌÛ∞Û„vîv‚PÌ-(ùˆ@œb˙»òu∫b‚VÊΩd8ù«4 î, ‘„ÛY˚ˇMjˇ∫∑iZ Ê%¸ΩkˇRä5“x6 ŸmZ€¿C(Ö3äæ)d¢IéÖ5 œ∞(}B£Fx†	%cÄ®ãŸK.hULìÆHÜøJ{í¥l)†*≈ûP^Jp§ÿ´:VÒÃ¨îä<B«O≠›ajEæ’4 ◊ıüî4˙Á˚œg≥¡o»l 6˜oﬁ`Poo+œÃjo„“/BK’–|ìŒzós˚¡}€Â≥≤&∏≈±ﬂ°%ÅNH}+Ç 8I√ñ/i7∂k◊9¨2$‘«4$L:ÃöÜIÜ˝lK¯Õ⁄·vüç
˜ÿ®‡ï¬`NEØ k≠®…`èVŸ,òÜñ¸[¨å-¥∆`5qMúç&À	}ç]w7¶ãœmâåáÄt‰¡Fı5øA¯Ni&Gh/r…ﬂ⁄≈zvS¯ÏL>zÜZ˚èI%ô‹˛S&˘Èi.Mxj.≤4-hë,ì=J-Aq)ÁÛ ¶.õ#•Jót==“Æ“tLÅÊöç9‰ùÂ€±â	ªL¥!™ cé∑ÜºÀmY¢ ŸKëØ~ç	∞Ff˘f®ag£f_HYÌa⁄_—&¿â?öb∂¨!ˇÆ(|C;ÊòÊﬂ9_SUDA››"Ek5—E ±¢ÂÔ^¸≤<üéÁè¬^qBÃõÁXˆ(Ì[3≥U]Z_Í·rÿ4UK+0~˙;i‹„πµ¡ü∏Êd9”8nß¢ˇ~"æ˘&πäu˙=1JiW˚YÅ¨<a⁄ˆ Y‚·ÇM’Õ›¡Îg¬m`S¡7iO·_[Ùﬂ∫∂ü“ÿﬁΩ{≥˚∑ÔﬁÕm}î∆§∂î®ÑÁ_ΩÕd]eñÒ¬;cKzë4!I˘)ûEˇ.m`V∏§Î˝’"„öè±£%›¿{K££  û[õ81Z ˆƒú5ÄûÜÁ∞√ÙŸ‹Ó’&ŸÔ¬ í¯Ó/gQ'Y$ØÿÔ¡{√"õ$WŒ`3ßöˆ¶!˘≠r[‚ßÇ{–7+„?MèÉÒ;ûòYË÷£aÚ4¸j‘M¶	ˆ)ßÜô2R¶lÇ≠£)Ÿl±LÆ¥∆Æ÷3«äd∞˚`ñ•$¨ÃTï}ˆªA7¿¨æmI¸z`‘	 øTÇ£¨b≈∞XeW]fŸ¶VÜf|¶eh>§ö‘z;•I®i≤-òsãm©Ø≥4›≤,‘£ æ¯dv[©í’Ë◊b¥]˛≤ùÈvÄte‰0ƒ:r«#°íxò9∑ €d_˛4{d|ãÔÜ≈‚ª·eÒ]'Yos2√ÔÍ-ø·U4¨—z•°∏ç‡<kìïÈxec±QA#l	ñ+aE°›∫åT¡VÚõ0¿6uÄ’˙XßÜ±ûN`ù6ûﬁ%€4ïwŒ“†¡ìK√dÈ4%“§∑ÙN°'(∏¿≈7“¬ÚÛdz≥ı˙ e»âü¿Ç]d>Á“Û0:;ZÚnÛjhíy; Ä‹˝€ŸàH1-„∑+U6u£Ì_Qªçád·l2‰8Md;ÿyiÏÒGµïó9am[y±#¸mÂ2»iûÍˇÒË»,ˆ©nõëW®kUÃ"áR6–@—imíÔÉ8Í2 <?-1u√¬ò¨ïãe2Ç1Èuóú˙$^c(1JØMh$õ®AÍI•Ïhï°–Ô§¥†~M(•◊Àx!&tW«—*7≤ÿuj≤ÛÍˆËê±j‘‚£>h~àjπK—≈ó∂å0›Á¿Çπ¬Ä4π≤aDöt≥£ß€‘Ü·å~≥Út;W˜vΩ⁄q∆A¯ñgEEñf¶ìƒIö9 8≈!A`‰{‘jq∂Émó¿) Ë#Ø
!&˜@”øBGëËÂ5Ù#∫µ√ÓûãAæ"˝0HwÈ¶ó∏%q2ô›˙>úÜœ˘
D‹“Å˜¨„zï D¬é_Ñ˝ç‡.\œ4÷«`åxFÈ›_Æ"¸Â·
hÊAF´à≠f4é¥Ω`Ó
~¢`ÂÙPé@É—¯Ò4 LŸ„l–f†ΩxÜ„E∞ÄÚéR±¡ïÕÄ‰O'≠ ﬁÄ¥®^§IˇE≠©Ö»Já‡Í¶¿y!/ÇË*πÔ'!®Ô†øùß2AùüÜBjWéCqQ=Ÿ’ﬂÿÅ»ıiNƒ„4Ï#õ¡¯ÒﬂÏ¡»&x¢ìQŸ∏˜Îxd£ÀœGˆg˘Äd◊+NHÿÚG∏„’ìêù&øÇ≥pè{?Ö,⁄*—SÌO£†?d GpJ9oê@zwøÙ·D\D;œiDÎp‹˝˘C‘âÜ€≥ÏÓg‘UiVT
Ã1cÖ>Ó—!Xè_√)∏∂âq±YB%ÕÑ|M-ﬁÛìNòÈüÅíWN´\a®ga¨[Ò;›^öÑ/£8<Ü∑˛fA÷¥∆)(K€ˆ~ùÉñPÂÚIXíqù˛yA™õ!¬5∂„0f€–CWD÷=9wíŒàÇ$äÑaZÜHè7ƒè¡?Y»†¡6I´âk;LìÌ±Ö•.$´MMeY&á£¡pî˜Ë¸ì¯∆˝9 óJñ÷óI2Ùp»¿“?$4—å∞ÏsQr`ôÀ˛óècˇæZ⁄¿›Ã9z—?Õ(æ*6)˚3œÖßM>4˝¢ KÛ2Ïúó‚úvp˘BMßÎ¡(Ö∑S:àÉ~3úåﬁUqõ∏kˇjŒ‡óô}¨O¸≤j÷∏èUw(÷ˆπ ÒfÖáÙ°√Á*G†	ˇ´ÕÁÍŸ∫…Á*˚X+
Y!°).⁄Gp·Êrı‚¸≠V«Lü/©eø´ß«vÕC‹56ß*eè'wxÁ˝E‰aY‘ˇ)yi™Z‹v\ÆW~ë≈õ◊ÄÜkWGr5znµ õd#◊:⁄)`tÉçnIá. í˙~ﬁâ$>/±‚ñ<∑ÖÃ%¸!`ß7§rLäv^8«qF47©˝ßQƒ5Ÿõ/ÿ"≠57tyçπ5ÎKlbπq—´†ﬁ,Ø…uî]»⁄ix!¸845XDõêVßXNQPP»kLΩ©èƒùQåŸbí]"º
ÜJ“XH∞ë[»L2E¢°ŸhêR0Xa« )˝œgÔÓ_2÷ê<‚_ß&Ó√xÙÌ^»îq˝Ãuº"ã2]Uºç™£µvuk±A]D·,	NcU7E £ab02~êî≠}4AÅx¿‚!¸¬=µòï÷çfÀ[7≈UL#‘ºRªWù–ò⁄e_+9{ﬁîk~WG≈ÁÅ–äÊèC˜\24ºÀïµ5£MMy’Aﬂ(î˙;c∞ã∆%{[&MÓ,√î•˚^<√o⁄úÒ.„ƒ\ñï≥ìáYˇ(º‘xyú$Òi‡!—18±ºâ]Æ+Îu7ã?WI|&˝˘êW°S®⁄*„‡(Ë#˝·π≈ jòΩ¶s≈◊xhµ„~xüÜ)ö´Z?Áã'l8y≥˘†”·N•‚aóîmº°Õ]œ€®⁄0E⁄∆ZŒÛÿ6©J8ªí—mUI=Ú9P–b?î kñ„\5ÚL5∏9ôˇ#HûQöÃ/í˘ó!l{Ò«Î Ω˚g˙≠}öF1ª—ıœ˘óò}iü% –‡∑£®¸î5±?é¯◊7¿QƒÂù'ˆ˝-Õ%kÙI‘ΩZL(É[Û2¸æu”õ1zê¥#ˇCh`#˜fC∂˚	›è≥€Ç8˛Òv >˘yñ>7Ì4Æõ®G7ns›níurª¿ˆ∆;ÿéÚq,ç˙ö<U„íÏ¿êMòŸó0at∆»W$r&G+õÎ:ﬂZ◊∞±Æãç5õºd‹YG¡ápxMÄ›úE˝˚ª∑∞ªÓ(D¡¢˜œ39Íÿt0Øk›ù&?´m2Ù˝ÎﬂÛV”íÜ≥!®AA⁄}˜¯rnÎ Ë"öÍ&˘Í1Lh/ËÀ1vÆ”Ek¥G©¯]ƒ∫ØZ+ˇF%ó˙Ì¨b;´¥Éháò˘›Ù€ÓF⁄è8:S Ü∆-å¡'‰U“a‚ˆΩ›√ÿC
k¡Ωc≥ÿøbÍÓ]Ò‹Á}[ö{ï§€q/π
“Ë¥ÇXQ≈_ÃΩ]cwº“ﬁ›œù(ò€ øí∆k…ÇWgÔ#Ï¢⁄ü?êºŸin∑<≠ì+ª˜vøŸS1ß∞—¸∞5 ≠N˙˛ÔsáQB>N∫»z≤b3'@»˛È∞nMê"≥∆v˚x˜Î˝√ˇn{ˇ’˛·—B:7l,‘DAhê…¡B∆8Õ@nÓú√Ê=¬‹{ªπˆÅ˙hÀLL@ìÀ°0¯⁄Ú'.ÛÁÛKüsuwuC¶˙V∑3∑Ö&ïî|+Ö∫rﬂ_Z„‰È$ô⁄E+!ÃwÁP„À:m.†≠Ö˝â[Îr+¨‹‚\cı
aå¥á£Zß7Çn±Fq+ÄhNÔ˛å0§—^˙{G'+òÇ·R…–¸Ì(:˚˜{‰l¬?ê„‰Ï,.ßI⁄ÇTàãçïÂáes≥WD3\¶¡¿#*¥f@Ä•il™ú>ôß\ˆí˙¶œÈøäkZ*Ô4∑e˜ÚÍŒnïhµÉi[az˜K“e∂≤MágŸ›¥)Û;g[ÖÀΩïè*>≥#¸HL≈Ïæh.ü£Q¥ƒkŒmaLQ“}Ö\ÅË¨7cP$3»˝m˛ò›¢∂K˛˙ˇD˛ìœ3‘å1Ωÿ4eñ…4ü∂èêÑ?y∫Ñ¥óWrŸ·…”†¶‹˜]èòÚLÂ	H	Wö&ë¸m4<ﬂa’-‹è¥˚A|˝SÿΩeµm~EtQÑ+Mó2æO‚Q/$¨d|~§OÉ:§ÄO¡lp@ﬂı£avúº·ﬂ‘¶QûjÃÜK/Án1Ç≈ô_-Hq”%&?1ZR‘4HAé±®G‚I?b@◊¬^7ô˚ÊeíˆÇ°XÎErC≤·5∆xŒ3¯”Œ5\_·Íã√WÛËœ¯¿ûsíwª/£~–«PömFÕên2Ú°-? 2V
”ûÃ}ÃãL£‰±"Î∑
¶÷iº.?A˚&,≥F„∂§µ¯+öoPê—îÑ®ôò5â≈bJ—¸òÆ'“±U¡(tE˙\m≈AºÙòR¶&∂ò=¶¢®m’BOLF√8Íá¨TêüÍxπ¥˛ÿxdJı0 Xù{è
+’uñò/`,*Í Ê⁄ire!	˙3b
¢ÿÔ«◊≤Qõ:¥
2·ØÚ€\>ø^ 5·‰†“…öj#∞Í˛ûKÃy¯V{¢#â¸C®]*êÜê…ŒÜˇñ¨,ÿYô—åSCK=FG“N√¿@Œå<R˛z	Ò@ãøØÿﬂ®[2’•¨ì&1VïcòlL>íA<.w≈àM®˜Ìú“jLø+UÇÆzû6ÒÿS6h=íÅ‘íí Y+ëÕQ®L⁄Ëù·—h PÜkf¿2Wî≥öf»¬Æ—êhµÜÕmΩ	˚Á£Ì6´CI√îô˝©r:}`KÙK|’U0Œ2˛ºÿe/?˚@è!Zœ2…≤ÙOJg#‹28ß,í∫ìú≤HÍãáCC…ÅBiHuuy≤Pk3ÑÂ”!›xe'ù&<ÍJéÉAf·Ã√Û0Ë*Yu√®Û„5ïV»OK≠%ak˘…Üñ^$VÊ§’≤[†⁄-–©=“F’√‘Ì√QŒrƒ@Fì/ö-K5ÜÁ5õ…•&Q∂Q3,Nﬁ OP G4B`*Mñ–©ır{◊ÍZÅ¶9ÂG·YsÌΩë8U†∆htM9$d*¥πó'y∆Ò“ïnSô€˙ˆxá¥…ˆ˛ÎÉ√ˆ·$#K$‰˜q⁄$®HSúä)4®È'ù¶π≠#äeo~1Ós|xñôõù&›k˘›¿OÅ«,]˛•»<)£5ÌLæ†ës¯’9'bÁF∞º¯HøøÎÖA6J±∂ﬁ{~÷ØﬂæGÄfKΩëºŒL∆W—2À^S´	Ÿ"+∂Á-ó+
ôPÆÀ√cÒu¨â,@©˝+ÀèÎ
0qíÎ˘CÄPvé™}ÍZÿΩ„!É`jBN˜π-iƒél}k„÷t'Ñ‘ µ÷T‹§h&QüjóÃ=|â–£Z¡‡¬wSŸ,µº` -û˙g¥ëm\ M¢˘‡OË,	TÚ∑¥ÇŒ◊≠?>ù7!¢®£HZû],T‹ﬁ⁄⁄≠;dé IGîsy<t84˙gæj(.¥á‚û
:&◊5®R˜0Lá‚—qcmï“yËÓ∂∂7Ô%qè≥2^°àıI(`ÛäﬂÅ"–´*ÇœW≠Iπ˝[¨eQ˛ãô¨ZØπF1&æÊ§K¢“™◊Ñ;å∫ŒQ±π∏§ù:ÑGê„„ÅÚ•˛àb/,†—Z∏]!å.+Õ¸Ó$ÂZ∏#°>≤
ß?/Y]ú®ˇ¬yk5©'„‚Õ«ÑÇcQkÒ≥oÄ±ˆ¢>çx¯Î˝ﬂ6ÙòºÀ|≈^Ó@j«Íû◊m√·ÍR=}F÷ç¡|Ô„¸ﬁŒlLˆÅCá‰ÇZJıê=÷¡45¸ƒzíìº,2Z≥NËÜ„veH‘æ◊ˇê4{¯ÕñM3Œà<dã—T<Ô¡PòŸÑ0sÜˆë'á–˛∞ÓTü6^C‰È(”;¥Õ#‹®·WlàÌèÁyÍ5BÊà<ˇ4BXÂié—hlÙXFjèö“(øÂ≠uÆÒT£È@.÷•Ÿ
Z#Œu√ÒŒ¡5’∑ké¥ ∂æ^"k!<çS£¢«ZΩˇrﬂL;⁄Iyñ fP…÷üK
‚∫kŒ”Qa¶n¨LEfòx'†ïâ§Q«TƒAi≠bØSK”d"1Î
Jƒ”ÛúL7Ú@ÌA’‚¿ÛKKKì·å›b√ßﬂ{ËœiÛ ⁄©OµÂÆ|¨a¶Õ)ú^SŒa¯©Ù˜ªáÌù˝wGªØﬂÌÔ˚›Æ•L®÷u»Á4≈r‚Û˜¨π@ñú5´3MÁŒÓÀΩÌΩ„w€á{«{€˚m.ßà›->yH¿HCZy>åYŒÁÎ˝J®mBiúw>üÙØÚt“À~≥IÒ/…`ôàPÔO1õ€˚/wﬂÔ∑_}¥âtä2Ê@øm#
mWÜ»/G∂q¸ju3±¬Õp¥!ÙJôº˝‘á_Ú˜kQ4ñ¿ÜÍ	´‡µ
?‰∞ÕV7dmRdH-‹Ãd1Î≤OèA˙cfFñnnë‚≤ÚncÊ(-Ìg§s˜3¬%eAè§w˜g`ó<g?∆Ëï,∏˚S”J0î‰Ó_„!≠û≥⁄bµqh … M~¨´!¡XòAv("a”L¡üZoj–_Á∑†∂’2 Ô⁄ä Ø‰∑2bŒ¥kÓ/9@’Ú«MõI)÷√à`ØÅÈﬂÈu	¯iõA‚§a¬≠ƒ(X0>ù?l@
6PäπÎ∫•´N∞û≥eÖ∂buUJ≠]â’Tã’˝0Â“…ìçãÀ∑≠∆c©‡3[ïä≥û¨≠‚±ò◊£UÍ≥‚ÌàºRBVÈ‘ãUÍÏVYc5UR´ƒË™°∆Ë…≠Ì÷ì÷#ÿ*±“ˆ∆d)TPdÿ	dæ«ñ DD¿P¨”£ H„ ëÕ)`ﬁ5JE˝Éì/=~‘z∏˝ñ·ÂÀÖJ#P£Bòàö§¿Ï±4≥∏ìÁ¶3ûé˘§C·YY4í0ﬂÏ∏º„˝a•∫Ò¢ﬁº£Êh]åE&≤ìôVæ(˙òX¬ÖX*•2>XbµEmkì>n{ø)'√ºãy3≈&≤ß›◊ƒ~.á”4£÷x9≠k;»è[ÆŒV”∫£°UÆ:Y≈Õ·˛˛Î#Cï‚Y¡úõÖ}hD∂bÙ=jâÓ8J-aIávœ"ÎÁ–∞∏ﬁéSQıà#Fv¢Zk	Æ&ŸHBˇU˝∫4Ëà|È}1t™`“’qÍWœ…º¨;ÛúRéﬂ-È⁄èä4∞^wﬁ›ÊfﬁÊ…ªèv7vÅi)UéÊ∑.Vä7û|±æææ≤∂˝vﬁæÔmÎ‡PuÌô08E_Œ∑¸‹u^TÈ©NÚµ#˙‚«lËÆ™bdîåàYÙ›g.Y|Võ‰Ms“eíÙãª±€≈⁄ã0Æ%¶¯•‘`5
œÒO~“xU›‘∏CÖ"LPìm¯ø'oKuÃä›´n)10%g#[ì3ÊÃS£$Ó^m≤C‹`qëdãd∑¶gwˇÇiüò~hhßF:ùîÖŸt≈åJe_SÍTå¯q[ëêµ&I§dîy‹ˆ ¶ô≠Iïb€•ì¥ ë∆	]'ˇÛ≠√8ÈÁöov‚§¶∏KLÀH+ÇòÛÒc?û^–RJ(Z◊Xáî5Íãùá;k;≠∑s[ˇ—}FNq&üÙ4ÏŒ|Œw¬¨7È¥€Û˘l?å#Ág=	Ü~Õπìn
“8m,¥⁄%ˇ≥îe∑¯/ÚZY√p©öP©6TIïÖN=À¡#ß?Q”!"∞èW÷4º»ùŒå{¢ı;Òx|æ Nßâ$VT™SÑDH√˚µçïÙ3ic[^ÚÅ‚W6:ÿ”y :MÒ6ó^	cÿÀ„˜ôΩπWãy'ﬁVu¬Ò´3•¬ê¶Æ••Á‹W;J§$uQÜ…û$‚»⁄E1…ï5ÿF£>NÃ‹V±£+Œ!~¶¶ÒÃ//±NR~±àûΩ÷\ÓèÊ«zR†TU◊&˙a∞på=.;∆ÚÁYH∂µ¥óØ%∆Ãp’6ëø	s–$ˆ+Ì¨∆(¢ÛÂEIùıaÌ)·π3ﬂ∑
*Y=Ω˚ôú± ì≠§DX‰^†Üﬁ®7¿2Yò7õWHM“hO≥aöÙœ∂ÆäÙ .€2∫ 2º˚e8ä·]!ú} ÅüÕ¢—9]√õÛh≥b°π!:çz‰Ó3s%Ó»Î∏mK÷Óåê?Ã5]Ò≥O“B¶="q2QS≈b·l`å"›°Ó#{€ñä±ıÂö	–zX`U˜îí@Æ;Ò{>ñôüõ…©>N5sªÆπBÏjπ´BËÇØ¬8éÑÌ (5.Ucu	∂˛≥j>∏Â¬d Ñc9wyó,u.Û≤‡Ukj,vaZËnîaåà]zìëN|(Âdı≠L+gí≈•à‚ûú2r´Øπ¶ZQ¨37Êäën
≥ÍÜtç‘˝dà≠$ó «T:©ŸÈËÁ““
‰Ÿ\îò ö*n ∫ﬁ/ıí)r†tkŒ û.óB¯/,2 ∂öw¬a≈îÿöx√,?ßÏRÕR√”©'ÏÁŸØ8`ê
˛Æõ¸˛váøÊ´¥ûíªﬂ^◊’∑õBöQv»ûcq-YœQv»Nxëƒ#z∂”¨<˘∑£$∆xSvÚœﬂömr^>˚\†ú€˙¢≤ß›fÔKÕaÚ≤™m`UçÖ[≤ƒêi£äf∫pœBû~ÇOË)(≈,j‘+∞^ÓS„ÜÓﬂMBècê·TΩ˛ÜErz¸ù’”ùToÙ?DR/„iY"%≠≤øTD5ÁNH–l˘ì∫™‡Ùèvè˜…—˛+wnø9ﬁ5áàî_üYQ8E·f $$©â:ùJîÑÙâ‰ïj≈UØ‰ˇ”›¸Êø1Ã+Z8îÏöã¥ì,Á…Ì«Ì’'ª.Ø_LsÕÒìL[ Ç∂PãÄÎñ∫!Ì0:Ï´H@
?ÿ}≥≥‰7O]ıñƒñS=Ÿãv_ø;⁄=h∂∑€˚‚eÉQ:à•∞{˛˜4^◊>8‹ˇû&∞W‚˚ß2™7«áª_óOü5˙}/;‹›˛ÓHì!°fØŸŸ˝~ˇ’w∞LÔºà„ë%Îdu™]·ÎŸÆúËGS}-üÚ∂c ≠/ƒ˚œ“‡∫∏ü˛ÖKT∫€OP…Ã]l˜5aÓ˛À›ﬁGÒÀ§äNNÏ2}	)~0Õ»ñ^~YÒ√Ù^¶,∏¸≤‚áÒ_f¨dè7\RÆyÂï^ì°{ÜAñÙMôB˙YÁﬁ:·2€ÓN+gìú«˘YTyøN0ûC”?|%’î!ΩŸKºí'“S“)¢ˇ˝ñ59Õ¬ÙÇ¡È¸Íój¶'Îö˚l.∏Ò∏¨o™ø'πŒ	*≥!ã∑âhió¬K3WcÒ–h?˙∫Ω®ø_ãHnﬁ£NTRƒﬁú¨Æ„¬Ê∆bÉ†9ñËbXpÈh-P-'Ì<iœo^ÒºA‡{R>yçÁÆoZÃô9ñ°Œ±-uñítÌ8Lá«iÙœròfìÀ./1c6N⁄°,|}Å∂Üçé‘ÅèæSS±_\∂‡ÀÂäÄ…ﬁnÉåwyÁãsÈ0Ïå≤¿»¢⁄∏}£åÇPßF®ÅZŸ$ˆNÀo©d]:_ôˇ2ÎW'ù–ûı6È˜4π‰…òÂv"_ú´:Â/ì÷6åºƒ1'-idÒdä î4¬7§ëòàwQóNÇ{∫û7£Æ∂ÇÜQ—Vˆ8ïAötGù·;ƒ/›$QS˛{—·Lf0<¯Ñ¯˛.¿√a¡0W,èﬁ⁄kå1>HõW·—B‘êJ¡÷2${˙v¬8∫”k˛ÙıŸÁã–6+9ΩÕ>ÅtTõ:—ÿÔÁÌÓu+ﬂuÌ≠†Ÿ∫≤Å.õé∞€‚JzX¬≠km…É˜ın:›ÿJΩ§Èz'Â∫FUJπí—ß9Üäı¢î˘J.P∫≠·3øyPCèlD=†ê0Fp§	∞Ø9ßwÜ%Ó¨¶,’nLõ∆W>oÜ¯˜Ç—¬ÏôÏ≈8:tÄ2Ó2+üåg?@ûÌ∆Ô>≤√°xªËÀâã‹qï¨Å N√†{ÕVXÚ3ÏeŒ©Sq9µ=∆PLÃ7&˙kç‰Ï~I[Uã¸åy;ËdÂ˘§“™ 0ƒπ2å√!ÂE∞ﬁ9“6À?SO+G∞$G/wEkäñ"‡∞R√.n™û©ÔÈ)üü˘Ï∫nÔWﬂzﬂ,"AËÙÓ±·ú‚w§NXpuˆOVﬁ¢A¨	q∂πEL-uŸò><¶a],„Ò.Q∫¨‚äˆ≈ÌuúŸ∞1óópëw >`∂ixêÓ~∆∏Ω Ùuƒ˙ÍQTº.⁄."x¨9∑HÊ"–}Ê*I«:|€–≤p»åxrº†cîáj}°Ú≥#5Êﬂ†n0/B`Ä…ºﬂ≥í§ﬁòw>„ÈVÆh°x≥˙¯0ÖãB|©í=Ï"CeÚôI@(ÏPS
«GïpêªB<E˛é%⁄.Õ`‡KAk˚m*óMa◊ñê»C†˛a∏›π¨&≥†A»kQ…®Å⁄Ñâí-¿G!2EµùöÎÜjÎÜ∆òÅ1„l,Ö>K’Û&Ù-ª ?«6A`F*Ü®’∂Dê∆˛Ä∆˚∆£Ñ5÷ﬁ≥≥T¥Ø¨"€Kìòû˜› ’ô%zHh∂äö…w≈
k)aÊº	[T˙Q_¿ Òä~ÚZôg…ë¸eôÕ|ÑC	@∂3¥¬sçKf!≥•îk‹÷ûÛ…6ñsx«›s†Û«Fò'§óoÉînZstS∫%@…F‰"$#t#Üà…Y
¯XÖ˙*R£ÕI—æ)—ÊB†"GIÇ÷è&òlåCl≠ ≠ñ)œµUãoW≈ÀôcN™u@´á€®˛ô∏>M¥)¸pv…S e„òéägısÍ± Élmn´Õ»*»O],”–â∞êñÖ±÷´ \ÁfíñûPÀØ”Ä≠ÂU¢»*x°˙zÅÍ‰ê8‹…åïEÑµÃ˛É&. `*{b*iæN ¶ÿíÿè√~çóZ´)¥N(˛Æ•÷oâÑh4≠w%ﬂ|Î»÷=ãÄôılCêôrª€E]√UŸ¡öïß˝† \uCMrAπóπq˜YuH v09Òë"√ãhEˇb≈Jkn§^DÖ”«ô6…OËä°‚CÜwh¢ú2«/î‰˝yƒ¯y‘ÌÇ, √…W7(øqƒìõ@q”® –ñ§∏M’èØ°ãÉlEFË<&è°!Ç‹0„á¯S‰fW–¢¬æﬂnëg‰∆jK öàÅ4êjZ@@Ô› ¥¬(∆l¥±úD‘òÙ∂*≥ÿÚÜø	µ¯H£è‘⁄`˚£aödÛl6"4∏8¶¡ïŸ{k7ßàcÛGç~˚ß?Ñæk≥Ü6‹πX,È6¿πÌ£º3ÁÅÓÙ:ÍÖ"W[ø©º√úoÕítÿhã‰î“f@_–åiî=ö∑Amú≤∑∫€°1˛∞„7\”Ö4!&À€¯î[M rµ%Äö∆˛mHµèÛ„)Ïc)*YM∆+Ë`ˆ°>Â£AKqæv.‡gÆN9Èü¬(Ó∆°f'6k’]?–®™µÏb-$ô„ÑãÜÍ⁄"):(æ;î8ˆ)“Á∏,o∫≈wª4¢q!AMr€pŸ~Ñâ°@e+ÉEËÂèã§Ë√P #9K5⁄3ùÒ„J·ŒÔq IVç"aH¢k™Æ≥y.R[Õ%R“ôÑ
PÒBü2ùÒ(é~X;&¶xì˙qÏ¶ıÜÖ|môÅyõû
æáíg¶≤§·®)ˇ6©ıÙ 4¶‡,TâZAÇ{‘3‰¶MjÏbE<`éÊ≤Â≤7`¿s(ïmû&Àô∆:Õ¢Ìmkòj(!¥ù&C˚Û»•…_ßa|sF®≠~^	^$ÓÕm!£≠S)⁄ªiµHJj˘vÿmrRâ∫Ã0J/Â§`Æ¢ΩÀµ‹ÈíeJC=
bQËa!n=]µùeµ˙:•“…|ù"∏F0ΩﬁMc&êì:…Öw˜Ó„OùË›¥ıG˜fRΩä‹L5HÇ∂±6ÓXvk‰™G⁄§@•œJ:+ŸË2‡ß`W+Läk©/Lã°3QÓ;µ)T]”X@Ö◊ÚNÎ8‘ËÍï]…AÕ(hÜWÉ(Ω~áæfÇï´“‘~˚@πkAË!-áéèNØ¶OçM/9⁄Ê∑‰Y‹jÁög·8ÍÖ†n,˜úZÓ±ãe∂_ú¥D#x’kFG÷Q8 µË»Æ#√6¬çl‘[$3˝ÅZ˙UôÓ]!lpÁAˆz£AõE£Ω<n”∫~¨≠ΩüEØH[ÆﬂeÛAm'8X∫ôE\ã#Ä√Ú'˚.FIâ*æÙEQW—<P˛ú5çÙ‚n˘âP≠ZUÍrˆòh
Ú]Ykâ’∫π)1À
¥5Òπ1ÉGÒ)$Ø|i÷Zh^çÜ‰~TO#‰ØˇÎˇﬂˇ˝Ô‰∆Hı∑ı*C{√ Èﬂ˝r„*¥˘öÓ
G•™ÎÆrUüRe„W!«H;ey£≤R§ø∏Æõâõ⁄"î¥;~ΩØÒÂQ7ÂªÁ◊≥–˙åk∂¬§æºë¥ßœ»ä#ÀFNÇ˜-ƒ^¥>≠˙‰J£‰©çBp≈§˚xöA5˜≤AZ≤ÇÓZZd±g
ÉñÄ'§Ê[\}#{˝,/ËÎ;Œ
ñ‡gˇ™ÿŒw‘)ü˝ˆ®©|‹PÖÁÆXÖÍB€±hﬁõ∑ üÆ~ò≠æOKÍ:AÇãL„≥9ßµπ¯po¥ôIWÔk¸î¸”Uàª‚√ÑIËJ¢AöÖ{˝°Ó∆ÆW?ËW‹ÜÆ·˘©*¶¬˜Á‰Ü4õÕ4Z$•©ÿ§˝º%™]<,>N|_i$6~π¥∫BD˜’"∑WØQŒèR°ÁR8Ç›‡¨#,gˆñÃv=õr%ØÍ0j%	˛à9•ÿ¸aâ∆≤ﬂîf\zìÔ∞G◊À{È˘„t:∞èì˜´oo;ŸH	≤»≤Îß$’~¨”ib9Æ˙p˙'R›ás8%ø£Ã¨˘Sœ∫◊Û6ä+√ÉÁ9Ô[Gaè+Yà†ú°‹[^Ú⁄^ 5ç≥ºµÛ	ç≥Ù9Øq∞4c«ì…á™ú÷”0Ë›¿10EÒR÷Oµwº¯å}
´Á∞z¸˙º”<z≈Ñçs‚züπ˙©[ò#ñé]4b4ie\¨£´‹&°ùºﬁá-1ŸÊºü%
Úó=[XG4åıÏÊó˘˘Y„‘5ûª†ı•#û˝˘x≤ì◊˜Ï≠äß(>cõ¬ƒÁi2†.lœœ— ø≠ø˛Ú?HæıÓ~FùÑ4ˆa∞=t}ˆ;+>∫L^Óæ‹_x∫ÃZÌ±7G–Ì\∏ˇN«··’‡hòsP}0MÍÖe'A-2f¯˝≥Ÿü|EÊè[´õ++ˇÛãdæ€]~˝z˘>ÛÆ@3˝≥…˚ÿú˜ÁnïñËÚG–µOüR„4?Ëæ´Õ>ËV‹$$céL§AãGÀoÊo…_ˇ·ü(e¡=l±nIÉ∫ôÈCB¬ª%£~ùô™Kô'ó˛1A‡öª¿^/≠⁄GöÜ>NGﬁ÷kmîçGkÎª~r∆ç‚XyNﬁ≥uˇRπn£ÅÜvõ∂U≠øv≠a/ZwnKi≥›.º«ø®É¸ Ë¶ò¡∆8†1YMõm/Eiñ
…Gµñ$ëö‘TüínÈÚ|;
bQJ9icÓU≈ÚL0≠∂˙ò%…ÿRàFFò óh∏÷∏ËçÕ≤Z—Xs†ŸJ:ûaïåÑnIíî»Í"i”¬ïô±ƒQ]kÔΩH„3e;´YPêE.ÜkÔ±ÏWj∞»kßÈGf–_5ÒHlÎ‹I]ÿ√* ∞∞è}«±l·rE>my∞´ÂÜjF˜&º|'óN+AÂÍÿ"Àô	™›Ôr¿'xYù¯ÚÈá79O;T‡ôi†”®ÁY4e’n¸w:í∑±–‡vîvb-òw'H…ã ∫¢ıìπ„À¡◊›’n	kB⁄˘Uíã´ÇèôV,’y∆[˜6≈§J’z„/Ø-‡—o9Í X÷Uá‹Ù¿ñ´0µ?ÓyU‡∂Lvd…©4i“	≥,Íü≠◊<Ï÷ï√Œpíè?Sõ¨Á»øû“Å(Wéñﬂ«ZCŒój-‚GfM≥ å"í¬ c∆˙ôÄ.ƒ	â≈W&:!ÌÑdôú
wâ.ÎÛ¸Â•l äÖwæ¥‚ˇFÓ∑,¸øt¶*J´W.¨ºâˇl;¸ùOâ££zw—w8Z≥“gUëÏz« ~å2»Ø¬aF8òÊ5ÖpÇıúÇ
U}Øê¢ÎùEEÕî©bÔpa˚ûäNÜDŒkµt‘¥§l?ŒQ∞özŸ¸Ü∂∫B•ÎÌ§ˇ!J{∞çv9,^»§Ì‘)kO@»DÊAmÙØg%†®âÄDΩ0∂r ì¬GO
¡«°åªëØÌ¡øºhÖRQ*®‰£WîÌc™∆<&úàUU¡‰®gndvUeß≥¿;4§Üyi
´<Mk”tW˘8≤s}ôØ∞¿Ù∏ÎlfVÚÔ¶§kÂ©ÇπQuQÉƒÃÀ≠÷(¶ ÇÊü¨¨,?4Tu¢‰ÂT◊q∞t¿y∏>UVe,ù¢‚ÍCGôUFGî\ı)≥*ÅqiilJÄæñØ»P9JaV|L«˝ò∏´ºÎ™°+πÌÌÖYQ»€éÅ¿…∆tyŒ¬+Ã≈<mò©∂Jû&§°4:;«:‰à«ıê§pN:9)jt>áº	¶ÒdÒåtÒÒä˝[⁄Hgó-&bú÷o¬ Wπ4°^’X÷0zFRjNUj1’32‰ÚÁ—*À≠Çì_eÕ;svK	Åuu’X)’R”–†°ÜØI«Ï£PpáH/s[o@±íı*…!_˝kÒÊd"úä∞·UF0<Aﬂ·%	lÿ€,G¯kH=bE∑8¢ıë(^J„˙¸ è}o@noÄ€uB≤çı¬G√J≤ìÉ†ŸWˇ—
e∑e¯F:Qè§âík∞H.:FŸ È¶Cè∑-=±$;O£˛èpvÙÜòÁCäàn‚Oä&,Àãï´KK™m'ΩÑ|ı)<	>7# ÁﬁπËÙ‚à,‰¯pñ}ù˚-\Ä"Ñx?D‰LÄM”HÇ‡"à#z” å·œ∏óÄˆ}@»&“‹˝—Ej´†œÅõÒ ˇ.4x[^t·jä€†∞f1Üé•N¿Ä…ÉÑÖ≠"ˆn»4≥¶AzôÑË_&ièºå¬∏õm
‡?H`≤sZµ¥™Ã-“ÎnÍEö◊}KëªA5[ZÓ¶∆s,Ê;H≥±2†%ÿX$Ãm˝ç-êÿéÕ…8ñIc‡qZ]‰›6∑ÔÅÃË´í3Î|≠Ùù”À±ùVúÀ‚x]µÜâ∫0luxL≥8Ç£ †∆R*ò˙p ∫b”¥fh»e‡_Í<
\˘§wπâ—/’h.áéÌÇ¯˝˘Ù p±Fìªiöêæ∆Á∂åók4À∞Á∂ÿÌ⁄‚ÛÃê¢˜É√®ºtô†rüáÂlo;Ô∞ÊÔIX∏>åePns˘àö»‹sªWõêqñú¶àúMè…∫8∫,DŸƒ˚õbV\æ´bW>‚óÌHowª≠‰‰àÓ≤QJ6πlÄØÀÀ§’$/CÊ£‚'Èå“ñ(æ…Ö<#ÊÂÈ˙(ç‡f7–º=Q∞®å„Z≥ékR∫°Q‹O:jÂWî öÒ¢]¢Ü·óA⁄ª˚πÛ.ViC˙ua¡¯V_V˚πÉs∑*Ê.Øõ&™ùa^ÿúÂ˜Ü‚ûâ¬’A=JU-u¨–˜‘^*ÒAZLn…X∑Í‚´1
¥≥Ü“%ñO√:ÅÓs<‡u0(£+ïƒUµ^í∏j»áea£“O¢bUÒSë √⁄!taÌœíoâ€ j!\õ´Êyê5Ô”Ç'÷ªlV√ZìÀhºe]≠nŸaj)÷q±8'Za*ﬁ±„!ú\´uåÍYc÷Œ2Àä«›˝8Ó.HJ+ôe≠åeq6{ìk èØÃdc~°W”9ÖA”5IØ< ˝JŸy·8,vØÜäS]åÜ!¿,5LAÑîW‘ı(∆êìM20nªAy‰•¡‰eÕËªÕºQsE38÷‡ Eü–¸¥‚”°˘†¸	∆Ÿ≈åËß™röFŸ.{¶A≥ÀùYob5»SNìÆ—‡îÙtìKÌY0,ú£ô°ˇ^ó9y5wóñ√∆∫a@/”§GG˚|$∫$A%œ9∫÷ﬂÚ‹p&ûÌY±ï—ùºß´±ÙÂ}s¶ﬁ€∂·~QfÖﬂÈ∫èÕ‘{—,EŸ"'"ùÇ]4g‰º5æ_ökˆ∞ t”Õ“*8∫*≠+ÊVÊ˙∆7@‘õ∂}æj]˚™—ìL[:8a!ËC“Ah>÷|ü∂ûoå lœôOôÙg‹O0íPü±üà“Ç≥GÚÊ˚ã5ÔJƒÈ¸?Ü£ÕƒÛç¨$Ô≈>g>:áW•‹ä5%“
GmMj·åí0æ˙Mtv£Ñº˙}Éªâ?Xf…Z›iK|TŸk†BìîJtoÅê7¢⁄!¶°À;Úπ¸úk´í˚ˇqé^UÿK@ø∂J‹ àÌ8Lá«iÙœä∞@ÿzéÚ‡Ã˝WÑ„2)° ‰Õçdœ’¨àÖ¨NA}ÖR$EëÍ_B,4ìàs
ÌÑzÎ"b‘[ò€O±u/ÿlQ¿6Ê·W †ËÚπ¿5ú3hp‡‰„| |¸8Ï≥jngÙ`µ{9 »Ö0¶“y∫4ΩÑ;V–«íÖ#¥y%)»J¨‹¸~ö©o&!q–•^Qt‹–=°í∫˚y).ªpËí€ë›Eõ÷È≤V,∞q<≥˘ë}L+èr4\∂µ≈áÒ(k≥™Œ{º~-0ÒÆV“∂ô%ΩêÂ˝ü*ß•0˛:V∞ô&Ùk•âïªú ÆûYÚt≤hR|—Í≠1æ}≠48dM⁄Ö•XìúM´ò ˝û&ó¯›Y⁄ÉπuÛ87,¨É∫ìÀªzïiÓˇπ≠y1|Jr∑)7òkVrŸ‘9∞˘ùÀ&ÊV≈‰ûsifëòs§ØÄôô´ﬂP`›‰È‚M
4Ù0yE·}y∆˚‚p~Ay˘∑√.iGAÏ;:uÖrD_¸"ü+>9Ó>•Ä„_·?Jçï£TÁÊ{≈W™^2VÁ	H"ÏÔpïY/?ÀDwy£˘=_É◊I¿ÔyQ~ºßKÂ‚ã·{<Ô¨bVº¢\˝§ŸlÍ«…¢X∂∑^X∆ZÈ\Ù≥W<∑∂ ªºﬁk°Qyµ..aÖç/'`§!î|7O[xÔ1X*ê™@Ä48 ™+°ó∞®º‚z◊*NÚBØ*À^‰Ã ´äòGâÕÆ√üùQö%ÈR?bﬂìK–-nDOà™ÕÄR…GÀ%Y)w$/ﬂY]TEÂÅw\ûBòù?ﬁ˝L⁄y‡˙Û¢Ôæ{Ã5æÂOua+vW≈±„†n;äè£UÎOˆú≠£a–Ôi∑§Óp+©≈8`PÚeØ4hÙHÎ([n8ÍB©aÃZøVV´÷fU√-`˙ëM©Ñ∂QVŒÛ‡C‘ŒôZ´e‹-îp¯J#A-ãWÆ∏eûrª8NÌÆ—T`-Ú(
q(¬Œ8`ßª}Cò)éJœ˚ï–≈è!√^z∏^‘ÉW9bü»ˇP,ˆqS‘ÿ†π≠••úà∞F{NET∑ñèÂ••j±›È‡Eä«ÁA=Uw†^ÇÛ˚T≤¯j∑†„ÿ’è¬ÂÂfÆ2‹†	ˇ…Q‡ÿ_ï8NjØA(Ÿ…ÎSÄÓr#yΩ∆2⁄07{f[ï^‚ßè‘P%®◊°ÃD	"óD¶‘∞ÌCß?V…Ü;aëîÿÈUÆw`˜¯™*˚‘±≤‘YŒiõø Øpñ¸ZL÷æÙ◊Uka™˛eÍn3ƒ—∞1œ}kÛ'+o´Z-¥≤V’≠BØÆp¬üíÓ%ZêÉJ»Ωò—ÏåJ`ü
’lÍJô˘ÿõwkbéB◊>êÜ]Íu∞ ©u≤Ñ∫—ã5S7“R¨ó” EÁ7yj®%≈5Éz‚≠^—0I≤ü\¶¡`å√X´zùPR*[9∏E¡"î[~0^÷®à«U.°0ˇ*æì|(Ç/
j&ßL™ o∞À‚”º‰zπ“¸$y≥[@/¢k±©b<+è€ËÑ¨Ë§É√,∏ﬂîD®j™ØkM √+VﬂZû∞e+eiÈ˙≠}PäK≠p•iõa∑$!Ÿ#›kV!.‘≠
±€3·\B34çﬁ9Ωä®=!”ˆJáiÈŒEuØú¬€4ƒˇ"°’%swTπòûö»∑.ì9ö÷ıÛáA∂◊¨Mhaàx∆0Ötú"ÑûúJi«Ï<Q+“Ë^îqÀZ™wIı·Ô4–uﬁçï5«⁄Tè∞ÁÚ_ãœÎªüØöÑıü	î’6∏ÍÅô9àvœ¨÷KaﬁYÿãÙŸ[«%£"πgmI[MQø∫"é¥<˝#WŸ–§tpÒ1f0˛5†µGì<˛÷ù7r,ÛmŸÔ>V)ì∆¿_„ÂmÒ*ü°¬Wã™rÍO•,>≥a\K“ì”÷2⁄√™}ù>nokÂø SÇ˛∑√˝ﬂT÷]@»Ô∆∫∑%ÿ©øÛãÅµ{ ≥”Ò÷®‡FHÌ˘Å˛ORKâfRÃ•Eù"Wî¡â‚[ßhÚBØU'Am˝eq)Ïwπ¬˜ÂﬂóV02ÑÖ‹Phõ*té∫=cqäÚIÃ|1-{pO·ÅyX]‚w6±cá7L·àPà<ÈÌ‹œQ i¥’R}dâ¥Í{’küßÑR¢t)®`u|·sóKè…9¸Ø“∆"-π∂UhNF`ıº)Y}÷ ¯Xöt{ä6 n$- :±Oxi*~]Wñ≤˙©YaîVmUo†œguDes-RØ¯£˙rú\ÚåÌ¶®ﬂê:ª®Ï1Wq“ñ_m≤ôÛË—Ωÿ¯ ÷m≠“Ω[Q≤T-¶v∂D7Ã9<†+èØØ¨π˘{;#t™VôÒW˜˝¥ÿ‚∂_Úª>7æö π·eç⁄EuˆPÌ§ÔüíIíõÔÄËiõ’ì–<YM≤ì|%π+V≈UMë∞¸Ú45`mCç#Ò,ˇ¿>∞©bxÌaÿ√&d)FÁÅ˚±Jûj ˙¨ ±jB¨ Ôq˝\≥vî±%õnYxSè7-ñ—l^ÀÕµ∂X2·í^‘ªbò“∞≤'Eπ·SøfB,‰-∫rrh∂π≠7aˇ|‘cπ4ôàÎ&•¨ô¶5†˝È`´àÇ¶Ú∞‹~B[ƒ<k`ìΩ@…’	‡")√ªŸ^c[4ãs∆p©‰ñdµE8fh5ƒö;ºmç©“πö]çti√/û*©¬tDMyË4˚⁄"¶ps£êT=ˇ\úŒR'Î*ØÓv–ÔÑq©¥ï,∏rJEç—lØvQUı ó”q≈c=Z≈z¨ñ◊c’4¸◊B*7≈øÂÔßá~0˘5£(™	†^éŸﬁ∞ûŒËÎ…>EE waSı4Ìê“†Í°gÀ<Nê¡•aÎ4@´ßm6ﬂiòÖ∞qãoÜ¯újõ‘∏ÜAÚÉ∂∆'Ù[√´hË’¶úú¡¿Oò“ú˛q¯a∏‘Z^%Lo•lÒä^¯	}ì+o—ﬂ¯ê’¨P“»\l`≤®TÁ<z8K)lQÃf¯RŸ®Éõcû'Xò´cÃ=√Uo&L”$ç‰YÆ∆ì/Z€≠'≠GoÂ;ï˚‘|	ïo¨c
±Œ∏u∑¡Ç-ò“ÿMm∏Â§ﬁ‹I˙öû•iﬁB˘Ü|∫\⁄“v˙.qªc»CæˇÈ¶¢gºﬂ÷¬MÖÌ∞fx+Ê≠VÖkOOéÂu#¶˝…C kT˚áö†c›ﬂ /`Î•ùYV¨§ç.pÎ•˛?   ˇˇÏ]Õn⁄@æ˜)sï‹J¥%DE	ï8ıê∂á"îlmπ-∂Ñ©ëxÆï˙ºXff¸∑ª6í&*ëeÃéçÁÁõıŒ7˚Ã‹õ
–-‡)pÿCÄî&=z˚çÛÅúeÁRÉFˆ“ÌXºÍú@`Çı=Ù.§t3d˛ 	C˘Æê¸BßÕ$ÙÑ”µ,ÁúáS6~¯ú˛⁄¨gÚFW	ÃuÂÃ≠ﬁiØsr1∆qN5'˛	2å;ºcïØÄM|á\B»K Ÿ [•
A$JJ‚…{ÉïÜ3r=
?Ù¨
ò•ˆÈO§7kê»Í6¢JörÍp  Ã–:^Ë√4±YBÂ‰	∂V#£÷á.¸Ωó∫Q◊4µΩAwÄ_´ô¨–a!Í∑Õ"4˘°X∫å}«6€ÑK¯Õäb^’?ü--ÛWl¡"‚ñÑÒ.ø‡˚õÁ„†È±ÁòEjY≥~ëY€ïF∆≠`ÛtŸ6 ¶¢)πû„ä¯Í\9>ıoSÌÉ≥]⁄*2È7ƒ=ÃiÇTAãc®†yÚièE∫acÕnN˙∑Køù≠éee¶;®ˇU4ıd◊ú∆&†ùˆ–!ì °6®¬?‡ıò»œ¸5Ñ˚|Óˇàìdtìø-4‰·
·ˇÄÂ9§ﬂ7n—MòPwEŒÉ-2d¬~m~«~ƒvC8≈ñ,ï´æ‰Ë∆W“ÚÑÈàø‡‹ódØˆ∏UC√ﬂOeÂ*ƒ#GÉx!âòÓ¿–M@(Ÿ÷çc≠¢Œ„#†¸≈>EÛ%˘9DËS–ï87œ3¥T5⁄Òè ÆzÁŒ†Zù4#<=yîΩ∫R⁄≤€êV‘N@+`p◊0»F∞=–„pÊ±Z•”(M√‡ö8GØ∫"o$È•WÛ SäÓ´-{¢íw>Ô;j9'Æ‡^}K7m’ø&8DümUÛö !´MUöÅVÈ7ïsÿëö\‰Ó%s,aïü=àµ:ß=„◊QÁuwºªu«\π•òπA>XÏ$I¿XE› ´√·ﬁ≠^‹  ˇˇ ∑5Ωu