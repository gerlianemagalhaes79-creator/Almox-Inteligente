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
  Sparkles
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
import { Item, Transaction, UserProfile, MaterialRequest, RequestItem, Notification } from './types';
import { ApuraSUSProducaoReport } from './components/ApuraSUSProducaoReport';
import { ApuraSUSCustosReport } from './components/ApuraSUSCustosReport';
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
      monthYear: 'Indeterminado (∞)',
      shortMonthYear: '∞',
      sectionTitle: 'ESTOQUE SEM CONSUMO RECENTE / DURAÇÃO INDETERMINADA (∞)',
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
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
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
    ? `PREVISÃO DE ESGOTAMENTO: ${monthName.toUpperCase()}/${targetYear} (MÊS ATUAL)`
    : `PREVISÃO DE ESGOTAMENTO: ${monthName.toUpperCase()}/${targetYear}`;

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
  'Imagem', 'Ilha', 'Pé Diabético', 'Direção', 'Setor Pessoal', 
  'CER', 'Setor de Terapias', 'SSVV', 'Recepção', 
  'Higienização', 'Manutenção', 'Almoxarifado',
  'Telefonia', 'Marcação', 'Entrega de Exames', 'Regulação',
  'Farmácia', 'CME', 'Envase', 'SESMT', 'Ouvidoria', 'Copa', 'Escritório da Qualidade', 'TI', 'SAME'
];

const SECTOR_COLORS: Record<string, string> = {
  'Imagem': '#3b82f6',
  'Ilha': '#10b981',
  'Pé Diabético': '#f59e0b',
  'Direção': '#ef4444',
  'Setor Pessoal': '#8b5cf6',
  'CER': '#ec4899',
  'Setor de Terapias': '#06b6d4',
  'SSVV': '#f97316',
  'Recepção': '#14b8a6',
  'Higienização': '#6366f1',
  'Manutenção': '#84cc16',
  'Almoxarifado': '#1c1917',
  'Telefonia': '#d946ef',
  'Marcação': '#a855f7',
  'Entrega de Exames': '#f43f5e',
  'Regulação': '#fb923c',
  'Farmácia': '#059669',
  'CME': '#7c3aed',
  'Envase': '#db2777',
  'SESMT': '#ea580c',
  'Ouvidoria': '#2563eb',
  'Copa': '#84cc16',
  'Escritório da Qualidade': '#4b5563',
  'TI': '#1e293b',
  'SAME': '#7c2d12'
};

const ROOMS = ['Sala A', 'Sala B', 'Almoxarifado Principal', 'Farmácia'];

const CATEGORY_COLORS: Record<string, string> = {
  'Médico Hospitalar': '#ef4444',
  'Alimentício': '#f59e0b',
  'Expediente': '#3b82f6',
  'Higiene': '#10b981',
  'Radiológico': '#8b5cf6',
  'Saneante': '#06b6d4',
  'Copa & Cozinha': '#f97316',
  'Papelaria': '#0ea5e9',
  'EPI': '#ec4899',
  'Gráfica': '#fbbf24',
  'Informática': '#6366f1',
  'Limpeza': '#059669',
  'Anestésico': '#7c3aed',
  'Medicamentos': '#be123c',
  'Fisioterápicos': '#14b8a6',
  'Manutenção': '#57534e',
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
                  A cota diária do plano gratuito do Firebase (leituras de banco de dados) foi temporariamente atingida. 
                  O sistema continua armazenando suas alterações e ativou a aceleração por cache local no navegador.
                </p>
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-6">
                  <p className="text-xs font-bold text-amber-800 mb-1">💡 O que você pode fazer:</p>
                  <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                    <li>Recarregue a página para utilizar os dados em cache no seu navegador.</li>
                    <li>As cotas diárias gratuitas são renovadas automaticamente pelo Google Firebase a cada novo ciclo diário.</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-center text-slate-900 mb-4">Algo deu errado</h2>
                <p className="text-slate-500 text-center mb-6 text-sm">
                  Ocorreu um erro inesperado. Por favor, recarregue a página ou tente novamente.
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
              Recarregar Aplicação
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
  const [quantitativoCategory, setQuantitativoCategory] = useState('Material Médico-Hospitalar');
  const [quantitativoTitle, setQuantitativoTitle] = useState('');
  const [quantitativoCriticalAnalysis, setQuantitativoCriticalAnalysis] = useState('');
  const [isEditingQuantitativoAnalysis, setIsEditingQuantitativoAnalysis] = useState(false);
  const quantitativoReportRef = useRef<HTMLDivElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'requests' | 'admin-devolutions' | 'reports' | 'my-requests' | 'new-request' | 'devolution' | 'users' | 'trash' | 'leader-stats'>('dashboard');
  const leaderStatistics = useMemo(() => {
    if (userProfile?.role !== 'LÍDER' && userProfile?.role !== 'SETOR') return { topRequested: [], topDelivered: [] };

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
  const [devolutionReason, setDevolutionReason] = useState('Não teve uso');
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
  const [inventoryLocation, setInventoryLocation] = useState<'Almoxarifado' | 'Farmácia'>('Almoxarifado');

  const isAdmin = userProfile?.role === 'ADMIN' || 
                  user?.email === 'gerlianemagalhaes79@gmail.com' || 
                  user?.email === 'poli.almoxarifado@gmail.com' || 
                  userProfile?.sector === 'Almoxarifado';

  useEffect(() => {
    if (userProfile?.sector === 'Farmácia' || selectedSector === 'Farmácia') {
      if (!isAdmin) {
        setInventoryLocation('Farmácia');
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
          console.log(`Auto-otimizando estoque mínimo para ${updates.length} lotes...`);
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
          console.log("Otimização de estoque mínimo concluída.");
        } catch (error) {
          console.error("Erro ao auto-atualizar estoques mínimos:", error);
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
  const [categories, setCategories] = useState<string[]>(['Médico Hospitalar', 'Alimentício', 'Expediente', 'Higiene', 'Radiológico', 'Saneante', 'Copa & Cozinha', 'Papelaria', 'EPI', 'Gráfica', 'Informática', 'Limpeza', 'Anestésico', 'Medicamentos', 'Fisioterápicos', 'Manutenção']);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (showAddModal) {
      setBulkEntry({
        supplier: '',
        category: inventoryLocation === 'Farmácia' ? 'Medicamentos' : 'Expediente',
        origin: 'extra' as 'contract' | 'extra' | 'donation',
        room: inventoryLocation === 'Farmácia' ? 'Farmácia' : 'Almoxarifado Principal',
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
  const [planningLocation, setPlanningLocation] = useState<'Almoxarifado' | 'Farmácia' | 'all'>('Almoxarifado');
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
      showToast(`Preço unitário de "${itemToUpdate.name}" atualizado em todos os lotes!`, "success");
      setEditingPrice(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${editingPrice.id}`);
      showToast(`Erro ao atualizar preço: ${error.message}`, "error");
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
      showToast("Por favor, selecione ou informe uma categoria válida.", "error");
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
            showToast("Erro: E-mail não encontrado no login do Google.", "error");
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
            showToast("Acesso negado: Seu e-mail não está cadastrado no sistema. Entre em contato com o administrador.", "error");
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
          showToast(`Erro na autenticação: ${error.message}`, "error");
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

    return () => {
      unsubscribeItems();
      unsubscribeTrans();
      unsubscribeRequests();
      unsubscribeReqItems();
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
        showToast("Erro: Domínio não autorizado no Firebase Auth.", "error");
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
      
      showToast("Usuário pré-cadastrado com sucesso! Agora ele pode entrar usando o Google.", "success");
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
          throw new Error("Movimentação não encontrada.");
        }
        
        const transData = transSnap.data() as Transaction;

        if (transData.deletedAt) {
          throw new Error("Esta movimentação já foi excluída.");
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
      alert(`Erro ao excluir movimentação: ${error.message}`);
    }
  };

  const handleRecoverTransaction = async (id: string) => {
    if (!id) return;
    try {
      await runTransaction(db, async (transaction) => {
        const transRef = doc(db, 'transactions', id);
        const transSnap = await transaction.get(transRef);
        
        if (!transSnap.exists()) {
          throw new Error("Movimentação não encontrada.");
        }
        
        const transData = transSnap.data() as Transaction;

        if (!transData.deletedAt) {
          throw new Error("Esta movimentação não está excluída.");
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
      alert(`Erro ao recuperar movimentação: ${error.message}`);
    }
  };

  const handleRecoverAllTransactions = async () => {
    const deletedTrans = transactions.filter(t => !!t.deletedAt);
    if (deletedTrans.length === 0) return;
    
    if (!confirm(`Deseja restaurar todas as ${deletedTrans.length} movimentações excluídas?`)) return;

    try {
      // We'll process them one by one to ensure stock is updated correctly via transactions
      for (const t of deletedTrans) {
        await handleRecoverTransaction(t.id);
      }
      alert("Todas as movimentações foram restauradas com sucesso!");
    } catch (error: any) {
      console.error("Error recovering all transactions:", error);
      alert(`Erro ao restaurar movimentações: ${error.message}`);
    }
  };

  const handleSubmitRequest = async () => {
    if (requestBasket.length === 0) {
      showToast("Adicione pelo menos um item à solicitação.", "error");
      return;
    }

    setIsSubmittingRequest(true);
    const loadingToast = showToast("Processando sua solicitação...", "info");
    
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
            `Estoque insuficiente para "${originalName}". Disponível: ${totalAvailable}.`, 
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
        requestData.requesterName = user?.displayName || user?.email || 'Usuário';
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
                createNotification(d.id, 'Nova Solicitação', `Setor ${selectedSector} enviou uma nova solicitação.`, requestId);
                notified.add(d.id);
              }
            });
          };
          notify(adminSnap);
          notify(almoxSnap);
        } catch (notifErr) {
          console.warn("Falha ao enviar notificações:", notifErr);
        }
      }

      showToast(editingRequest ? "Alterações salvas com sucesso!" : "Solicitação enviada com sucesso!", "success");
      setRequestBasket([]);
      setRequestObservation('');
      setEditingRequest(null);
      setActiveTab('my-requests');
    } catch (error: any) {
      console.error("Erro crítico ao salvar:", error);
      showToast(`Não foi possível salvar: ${error.message}. Verifique sua conexão e tente novamente.`, "error");
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
    if (!window.confirm("Tem certeza que deseja enviar este item para a lixeira? Ele será excluído definitivamente após 3 dias.")) return;
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
      showToast("Nenhuma solicitação pendente ou em separação encontrada para este período.", "info");
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
        showToast("Status das solicitações atualizado para 'Em Separação'!", "success");
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
          <title>Impressão de Solicitações - ${periodStr}</title>
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
            .items-table th, .items-table td { border: 1px solid #1C1917; padding: 4px; text-align: left; font-size: 8.5px; }
            .items-table th { background-color: #FAFAF9; }
            .blank-col { width: 70px; text-align: center; }
            .footer { margin-top: 8px; text-align: center; font-size: 7px; color: #78716C; border-top: 1px dashed #E7E5E4; padding-top: 3px; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          ${filteredRequests.map((req, idx) => {
            const items = allRequestItems.filter(ri => ri.request_id === req.id);
            return `
              <div class="request-card">
                <h1>Solicitação de Material</h1>
                <table class="header-table">
                  <tr>
                    <td><strong>Número:</strong> #${req.id.slice(-5).toUpperCase()}</td>
                    <td><strong>Data de Criação:</strong> ${new Date(req.date).toLocaleDateString('pt-BR')}</td>
                  </tr>
                  <tr>
                    <td><strong>Setor Solicitante:</strong> ${req.sector}</td>
                    <td><strong>Status:</strong> EM SEPARAÇÃO</td>
                  </tr>
                  <tr>
                    <td colspan="2"><strong>Solicitante:</strong> ${req.requesterEmail}</td>
                  </tr>
                  ${req.observation ? `<tr><td colspan="2"><strong>Observações:</strong> ${req.observation}</td></tr>` : ''}
                </table>

                <h3 style="margin: 6px 0 3px 0; font-size: 9px; border-bottom: 1px solid #1C1917; padding-bottom: 2px; text-transform: uppercase;">ITENS DA SOLICITAÇÃO (Para separação física)</h3>
                <table class="items-table">
                  <thead>
                    <tr>
                      <th>Produto / Descrição</th>
                      <th style="width: 70px; text-align: center;">Qtd Solicitada</th>
                      <th class="blank-col">Qtd Separada</th>
                      <th>Obs. / Lote do Material</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map(item => `
                      <tr>
                        <td style="font-weight: bold; font-size: 8.5px;">${item.product_name}</td>
                        <td style="text-align: center; font-size: 8.5px; font-weight: bold;">${item.quantity_requested}</td>
                        <td class="blank-col" style="border-bottom: 1px solid #1C1917;"></td>
                        <td style="border-bottom: 1px solid #1C1917;"></td>
                      </tr>
                    `).join('')}
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
      showToast("Não é possível excluir uma solicitação que já foi entregue.", "error");
      return;
    }
    
    if (!window.confirm("Tem certeza que deseja enviar esta solicitação para a lixeira? Ela será excluída definitivamente após 3 dias.")) return;
    try {
      await updateDoc(doc(db, 'requests', requestId), {
        deletedAt: new Date().toISOString(),
        deletedBy: user?.email
      });
      showToast("Solicitação enviada para a lixeira.", "success");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
      showToast(`Erro ao excluir solicitação: ${error.message}`, "error");
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
      showToast(`"${productName}" adicionado à solicitação.`, "success");
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
      showToast("Observação atualizada com sucesso!", "success");
    } catch (error: any) {
      console.error("Error updating observation:", error);
      showToast(`Erro ao atualizar observação: ${error.message}`, "error");
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
        showToast("Status alterado para 'Em Separação'!", "success");
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
          <title>Solicitação de Material - #${request.id.slice(-5).toUpperCase()}</title>
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
          <h1>Solicitação de Material</h1>
          <table class="header-table">
            <tr>
              <td><strong>Número:</strong> #${request.id.slice(-5).toUpperCase()}</td>
              <td><strong>Data:</strong> ${dateStr}</td>
            </tr>
            <tr>
              <td><strong>Setor Solicitante:</strong> ${request.sector}</td>
              <td><strong>Status:</strong> ${request.status === 'PENDENTE' ? 'PENDENTE' : 'EM SEPARAÇÃO'}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Solicitante:</strong> ${request.requesterEmail}</td>
            </tr>
            ${request.observation ? `<tr><td colspan="2"><strong>Observações do Solicitante:</strong> ${request.observation}</td></tr>` : ''}
          </table>

          <h3 style="margin-top: 30px; font-size: 16px; border-bottom: 1px solid #1C1917; padding-bottom: 5px;">ITENS DA SOLICITAÇÃO (Para separação física)</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Produto / Descrição</th>
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
              Responsável pela Separação (Almoxarifado)
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
      showToast("Processando aprovação e baixa no estoque...", "info");
      
      const requestRef = doc(db, 'requests', requestId);
      const requestSnap = await getDoc(requestRef);
      if (!requestSnap.exists()) throw new Error("Solicitação não encontrada.");
      const requestData = requestSnap.data() as MaterialRequest;

      if (requestData.status === 'ENTREGUE') {
        showToast("Esta solicitação já foi entregue.", "info");
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

        let pharmItems: any[] = [];
        if (requestData.sector === 'Farmácia') {
          pharmItems = allActiveItems
            .filter(item => normalizeString(item.name) === normalizedReqName && item.location === 'Farmácia')
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

        // Also update all the request_items quantity_approved in the database
        currentRequestItems.forEach(item => {
          const itemRef = doc(db, 'request_items', item.id);
          transaction.update(itemRef, { quantity_approved: item.quantity_approved });
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

            if (requestData.sector === 'Farmácia' && batch.location !== 'Farmácia') {
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
                  supplier: batch.supplier || 'Transferência',
                  batch_number: batch.batch_number || '',
                  expiry_date: batch.expiry_date || 'Indeterminada',
                  initial_quantity: toTake,
                  quantity: toTake,
                  min_quantity: batch.min_quantity || 0,
                  unit_price: batch.unit_price || 0,
                  location: 'Farmácia',
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
      showToast("Solicitação aprovada, entregue e estoque baixado automaticamente!", "success");
      setShowRequestDetailModal({ show: false });

      // Notifications
      const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', requestData.requesterEmail)));
      if (!uSnap.empty) {
        await createNotification(uSnap.docs[0].id, 'Solicitação Entregue', `Sua solicitação #${requestId.slice(-5).toUpperCase()} foi aprovada e entregue.`, requestId);
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
      showToast("Por favor, adicione pelo menos um item à devolução.", "info");
      return;
    }

    // Validate quantities
    for (const item of devolutionBasket) {
      if (item.quantity <= 0) {
        showToast(`Por favor, insira uma quantidade maior que zero para ${item.product_name}.`, "error");
        return;
      }
      if (item.quantity > item.maxQty) {
        showToast(`Quantidade inválida para ${item.product_name}. Máximo permitido: ${item.maxQty}`, "error");
        return;
      }
    }

    try {
      setIsProcessingDevolution(true);
      showToast("Enviando solicitação de devolução...", "info");

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
        requesterName: userProfile?.name || user?.displayName || user?.email || 'Usuário',
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
            title: 'Solicitação de Devolução',
            message: `Setor ${selectedSector} solicitou devolução de materiais.`,
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

      showToast("Solicitação de devolução enviada para o almoxarifado!", "success");
      setShowDevolutionModal({ show: false });
      setDevolutionBasket([]);
      setDevolutionObservation('');
      
      if (showRequestDetailModal.show && showDevolutionModal.request && showRequestDetailModal.request?.id === showDevolutionModal.request.id) {
        setShowRequestDetailModal({ show: false });
      }

    } catch (error: any) {
      console.error("Erro ao solicitar devolução:", error);
      showToast(`Erro ao solicitar devolução: ${error.message}`, "error");
    } finally {
      setIsProcessingDevolution(false);
    }
  };

  const handleApproveDevolution = async (requestId: string, devItems: RequestItem[]) => {
    try {
      setIsProcessingDevolution(true);
      showToast("Aprovando devolução e retornando ao estoque...", "info");

      // Fetch active stock items
      const itemsSnapshot = await getDocs(collection(db, 'items'));
      const allActiveItems = itemsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Item))
        .filter(i => !i.deletedAt);

      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, 'requests', requestId);
        const requestSnap = await transaction.get(requestRef);
        if (!requestSnap.exists()) throw new Error("Solicitação de devolução não encontrada.");
        const requestData = requestSnap.data() as MaterialRequest;

        if (requestData.status === 'DEVOLUCAO_APROVADA') {
          throw new Error("Esta devolução já foi aprovada anteriormente.");
        }

        // Collect all doc IDs that we need to read in the transaction:
        // 1) Sector source items (Farmácia / Requesting sector)
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

          // 1. DECREASE stock in sector (e.g., Farmácia)
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
          let batchNumber = sourceItemDoc?.data.batch_number || 'Devolução';
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
            returnReason: requestData.returnReason || 'Não especificado',
            observation: requestData.observation || ''
          });

          // 4. Log exit transaction for Sector/Farmácia
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
            expiryReason: requestData.returnReason || 'Devolução ao Almoxarifado',
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
            title: 'Devolução Aprovada',
            message: `Sua solicitação de devolução para o setor ${requestData.sector} foi aprovada. Os materiais retornaram ao estoque.`,
            date: new Date().toISOString(),
            read: false,
            requestId: requestId,
            type: 'REQUEST'
          });
        }
      }

      showToast("Devolução aprovada com sucesso! Materiais retornados ao estoque.", "success");
      setShowRequestDetailModal({ show: false });

    } catch (error: any) {
      console.error("Erro ao aprovar devolução:", error);
      showToast(`Erro ao aprovar devolução: ${error.message}`, "error");
    } finally {
      setIsProcessingDevolution(false);
    }
  };

  const handleRejectDevolution = async (requestId: string) => {
    try {
      setIsProcessingDevolution(true);
      showToast("Recusando devolução...", "info");

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
            title: 'Devolução Recusada',
            message: `Sua solicitação de devolução para o setor ${requestData.sector} foi recusada pelo almoxarifado.`,
            date: new Date().toISOString(),
            read: false,
            requestId: requestId,
            type: 'REQUEST'
          });
        }
      }

      showToast("Devolução recusada com sucesso.", "success");
      setShowRequestDetailModal({ show: false });
    } catch (error: any) {
      console.error("Erro ao recusar devolução:", error);
      showToast(`Erro ao recusar devolução: ${error.message}`, "error");
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
        batch.update(itemRef, { quantity_approved: item.quantity_approved });
      });

      await batch.commit();
      
      const request = requests.find(r => r.id === requestId);
      if (request) {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', request.requesterEmail)));
        if (!userSnap.empty) {
          const msg = adminObservation 
            ? `Sua solicitação #${requestId.slice(-5).toUpperCase()} foi aprovada. Obs: ${adminObservation}`
            : `Sua solicitação #${requestId.slice(-5).toUpperCase()} foi aprovada.`;
          await createNotification(userSnap.docs[0].id, 'Solicitação Aprovada', msg, requestId);
        }
      }

      showToast("Solicitação aprovada!", "success");
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
      if (!requestSnap.exists()) throw new Error("Solicitação não encontrada.");
      const requestData = requestSnap.data() as MaterialRequest;

      if (requestData.status === 'ENTREGUE') {
        showToast("Esta solicitação já foi entregue.", "info");
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

        let pharmItems: any[] = [];
        if (requestData.sector === 'Farmácia') {
          pharmItems = allActiveItems
            .filter(item => normalizeString(item.name) === normalizedReqName && item.location === 'Farmácia')
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

            if (requestData.sector === 'Farmácia' && batch.location !== 'Farmácia') {
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
                  supplier: batch.supplier || 'Transferência',
                  batch_number: batch.batch_number || '',
                  expiry_date: batch.expiry_date || 'Indeterminada',
                  initial_quantity: toTake,
                  quantity: toTake,
                  min_quantity: batch.min_quantity || 0,
                  unit_price: batch.unit_price || 0,
                  location: 'Farmácia',
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
        await createNotification(uSnap.docs[0].id, 'Entrega Realizada', `Sua solicitação #${requestId.slice(-5).toUpperCase()} foi entregue.`, requestId);
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
            ? `Sua solicitação #${requestId.slice(-5).toUpperCase()} foi recusada. Motivo: ${adminObservation}`
            : `Sua solicitação #${requestId.slice(-5).toUpperCase()} foi recusada.`;
          await createNotification(userSnap.docs[0].id, 'Solicitação Recusada', msg, requestId);
        }
      }
      
      showToast("Solicitação recusada.", "success");
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
          showToast("O nome do produto não pode estar vazio ou conter apenas espaços.", "error");
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
              throw new Error("Item não encontrado durante a atualização.");
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
              throw new Error(`Item ${b.item_id} não encontrado.`);
            }

            const currentItemData = itemSnap.data() as Item;
            const currentQty = Number(currentItemData.quantity) || 0;
            if (currentQty < b.quantity) {
              throw new Error(`Estoque insuficiente para o item ${currentItemData.name}. Disponível: ${currentQty}`);
            }

            let pharmacyItemSnap = null;
            if (selectedSector === 'Farmácia' && exitReason === 'consumo') {
              const pharmacyItemsQuery = query(
                collection(db, 'items'),
                where('name', '==', currentItemData.name),
                where('batch_number', '==', currentItemData.batch_number || ''),
                where('location', '==', 'Farmácia')
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
              ? (exitReason === 'vencido' ? 'Descarte por Vencimento (Desperdício)' : 'Descarte por Perda/Avaria')
              : (modalSector || (inventoryLocation === 'Farmácia' ? 'Farmácia (Consumo Interno)' : 'Almoxarifado'));

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
              donationUnitName: exitReason === 'doacao' ? (donationUnitName || 'Policlínica de Sobral') : null,
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
                  location: 'Farmácia',
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
                location: 'Farmácia',
                date: new Date().toISOString(),
                responsible: 'Sistema (Transferência)',
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
            throw new Error("Item não encontrado.");
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
            product_name: it?.name || 'Produto Não Identificado',
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
            donatingUnitName: donationUnitName || 'Policlínica de Sobral',
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
            responsible: userProfile?.name || user?.displayName || 'Responsável',
            date: new Date().toISOString()
          });
          showToast(exitReason === 'vencido' ? "Baixa por vencimento (desperdício) concluída com sucesso!" : "Baixa por perda/avaria concluída!", "success");
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
      console.error('Erro na transação:', error);
      alert(`Erro na movimentação: ${error.message}`);
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
            'Item': `   ↳ ${item.name}`,
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
      XLSX.utils.book_append_sheet(wb, ws, "Relatório de Saídas");

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
          if (group.durationWeeks <= 4) status = 'MUITO CRÍTICO';
          else if (group.durationWeeks <= 8) status = 'CRÍTICO';
        }
        const monthInfo = getDurationMonthInfo(group.durationWeeks);
        
        return {
          'Item': group.name,
          'Categoria': group.category || '---',
          'Estoque Total': group.total_quantity,
          'Consumo Semanal': group.weeklyExitRate > 0 ? Number(group.weeklyExitRate.toFixed(1)) : 0,
          'Duração (Semanas)': group.durationWeeks === 'infinite' ? '∞' : Number(group.durationWeeks.toFixed(1)),
          'Previsão até Mês': monthInfo.monthYear,
          'Mínimo (8 Semanas)': group.min_quantity,
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
      const title = 'Relatório de Estoque Atual';
      const subtitle = isDurationSorted
        ? `Ordenação: Previsão de Duração (Menor para Maior) • Separado por Mês • Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`
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
            `${mGroup.info.sectionTitle}  •  ${mGroup.items.length} ${mGroup.items.length === 1 ? 'item' : 'itens'}`,
            18,
            currentY + 5.2
          );

          currentY += 9.5;

          const tableData = mGroup.items.map(group => {
            let status = group.total_quantity <= group.min_quantity ? 'BAIXO' : 'OK';
            if (group.durationWeeks !== 'infinite') {
              if (group.durationWeeks <= 4) status = 'MUITO CRÍTICO';
              else if (group.durationWeeks <= 8) status = 'CRÍTICO';
            }
            const info = getDurationMonthInfo(group.durationWeeks);
            const durationStr = group.durationWeeks === 'infinite' ? '∞' : `${group.durationWeeks.toFixed(1)} sem`;
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
            head: [['Item / Insumo', 'Categoria', 'Estoque', 'Consumo/Sem', 'Duração', 'Dura até', 'Mínimo (8 sem)', 'Status']],
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
                if (text === 'BAIXO' || text === 'MUITO CRÍTICO') {
                  data.cell.styles.textColor = [225, 29, 72];
                  data.cell.styles.fontStyle = 'bold';
                } else if (text === 'CRÍTICO') {
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
            if (group.durationWeeks <= 4) status = 'MUITO CRÍTICO';
            else if (group.durationWeeks <= 8) status = 'CRÍTICO';
          }
          const info = getDurationMonthInfo(group.durationWeeks);
          const durationStr = group.durationWeeks === 'infinite' ? '∞' : `${group.durationWeeks.toFixed(1)} sem`;
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
          head: [['Item / Insumo', 'Categoria', 'Estoque', 'Consumo/Sem', 'Duração', 'Dura até', 'Mínimo (8 sem)', 'Status']],
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
              if (text === 'BAIXO' || text === 'MUITO CRÍTICO') {
                data.cell.styles.textColor = [225, 29, 72];
                data.cell.styles.fontStyle = 'bold';
              } else if (text === 'CRÍTICO') {
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
      const locationLabel = inventoryLocation === 'Farmácia' ? 'Farmácia (Medicamentos)' : 'Almoxarifado Geral';
      
      let title = 'RELATÓRIO GERAL DE ITENS CRÍTICOS';
      let subtitle = `Unidade: ${locationLabel} • Data de Emissão: ${dateStr}`;

      if (type === 'low_stock') {
        title = 'RELATÓRIO DE ITENS CRÍTICOS — ESTOQUE BAIXO E RUPTURA';
      } else if (type === 'expiry') {
        title = 'RELATÓRIO DE ITENS CRÍTICOS — CONTROLE DE VALIDADE';
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
          doc.text("Nenhum item vencido ou com validade próxima registrado.", 14, currentY + 12);
          
          doc.setFontSize(9.5);
          doc.setTextColor(100, 116, 139);
          doc.setFont("helvetica", "normal");
          doc.text(`Todos os lotes ativos no ${locationLabel} estão em conformidade de validade.`, 14, currentY + 20);

          const dateFileStr = format(new Date(), 'dd-MM-yyyy');
          doc.save(`Relatorio_Criticos_Validade_${inventoryLocation}_${dateFileStr}.pdf`);
          showToast("Relatório de validade gerado com sucesso!", "info");
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
              prazoText = `Vencido há ${Math.abs(daysDiff)} dia(s)`;
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
            itemExpired ? 'VENCIDO' : 'PRÓXIMO AO VENCIMENTO'
          ];
        });

        autoTable(doc, {
          startY: currentY + 4,
          head: [['Material / Medicamento', 'Lote', 'Categoria', 'Qtd Atual', 'Data Validade', 'Prazo / Situação', 'Status']],
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
        doc.text(`Total: ${expiryBatches.length} lote(s) com alerta de validade (${expCount} vencido(s) e ${nearCount} próximo(s) ao vencimento)`, 14, finalY);

        const dateFileStr = format(new Date(), 'dd-MM-yyyy');
        doc.save(`Relatorio_Criticos_Validade_${inventoryLocation}_${dateFileStr}.pdf`);
        showToast("Relatório PDF de validade crítica gerado com sucesso!", "success");
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
          doc.text(`Todos os insumos cadastrados no ${locationLabel} estão acima do estoque mínimo.`, 14, currentY + 20);

          const dateFileStr = format(new Date(), 'dd-MM-yyyy');
          doc.save(`Relatorio_Criticos_Estoque_Baixo_${inventoryLocation}_${dateFileStr}.pdf`);
          showToast("Relatório gerado: Nenhum item com estoque baixo encontrado.", "info");
          return;
        }

        const tableData = lowStockGroupsList.map(group => {
          const deficit = Math.max(0, group.min_quantity - group.total_quantity);
          let status = 'ESTOQUE BAIXO';
          if (group.total_quantity === 0) {
            status = 'ZERADO / RUPTURA';
          } else if (group.total_quantity <= (group.min_quantity * 0.5)) {
            status = 'MUITO CRÍTICO';
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
          head: [['Material / Medicamento', 'Categoria', 'Estoque Atual', 'Estoque Mínimo', 'Déficit (Reposição)', 'Status Crítico']],
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
              if (text.includes('ZERADO') || text === 'MUITO CRÍTICO') {
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
        doc.text(`Total de itens identificados com estoque baixo ou crítico: ${lowStockGroupsList.length}`, 14, finalY);

        const dateFileStr = format(new Date(), 'dd-MM-yyyy');
        doc.save(`Relatorio_Criticos_Estoque_Baixo_${inventoryLocation}_${dateFileStr}.pdf`);
        showToast("Relatório PDF de estoque baixo gerado com sucesso!", "success");
        return;
      }

      // CASE 3: COMBINED REPORT (VALIDADE + ESTOQUE BAIXO)
      if (lowStockGroupsList.length === 0 && expiryBatches.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129);
        doc.setFont("helvetica", "bold");
        doc.text("Nenhuma inconformidade crítica identificada no momento.", 14, currentY + 12);
        
        doc.setFontSize(9.5);
        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "normal");
        doc.text(`Todos os insumos e lotes do ${locationLabel} estão com níveis e validades regulares.`, 14, currentY + 20);

        const dateFileStr = format(new Date(), 'dd-MM-yyyy');
        doc.save(`Relatorio_Criticos_Geral_${inventoryLocation}_${dateFileStr}.pdf`);
        showToast("Relatório gerado: Estoque 100% regular.", "info");
        return;
      }

      // Section 1: Validade
      if (expiryBatches.length > 0) {
        doc.setFontSize(10);
        doc.setTextColor(159, 18, 57);
        doc.setFont("helvetica", "bold");
        doc.text(`1. CONTROLE DE VALIDADE (${expiryBatches.length} lote(s) requerem atenção)`, 14, currentY + 5);

        const expiryTableData = expiryBatches.map(item => {
          const itemExpired = isExpired(item);
          const expDate = item.expiry_date && item.expiry_date !== 'Indeterminada' ? new Date(item.expiry_date) : null;
          let daysDiff = 0;
          let prazoText = 'Indeterminado';
          if (expDate) {
            const diffTime = expDate.getTime() - today.getTime();
            daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            prazoText = itemExpired ? `Vencido há ${Math.abs(daysDiff)} d` : `Vence em ${daysDiff} d`;
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
            itemExpired ? 'VENCIDO' : 'PRÓX. VENCER'
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
        doc.text(`2. ESTOQUE BAIXO E RUPTURA (${lowStockGroupsList.length} item(ns) para reposição)`, 14, currentY + 4);

        const lowStockTableData = lowStockGroupsList.map(group => {
          const deficit = Math.max(0, group.min_quantity - group.total_quantity);
          let status = 'ESTOQUE BAIXO';
          if (group.total_quantity === 0) {
            status = 'ZERADO / RUPTURA';
          } else if (group.total_quantity <= (group.min_quantity * 0.5)) {
            status = 'MUITO CRÍTICO';
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
          head: [['Material / Medicamento', 'Categoria', 'Estoque Atual', 'Estoque Mínimo', 'Déficit (Reposição)', 'Status Crítico']],
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
              if (text.includes('ZERADO') || text === 'MUITO CRÍTICO') {
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
      showToast("Relatório PDF completo de itens críticos gerado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar PDF de itens críticos:', error);
      showToast("Erro ao exportar PDF de itens críticos.", "error");
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
      const locationLabel = planningLocation === 'all' 
        ? 'Almoxarifado & Farmácia' 
        : planningLocation === 'Farmácia' ? 'Farmácia (Medicamentos)' : 'Almoxarifado Geral';
      
      const title = 'PLANEJAMENTO DE COMPRAS — ESTIMATIVA DE AQUISIÇÃO';
      const categoryLabel = planningCategory === 'all' ? 'Todas as Categorias' : `Categoria: ${planningCategory}`;
      const subtitle = `Previsão de Cobertura até ${purchasePlanningSummary.targetPeriodLabel} (${purchasePlanningSummary.totalTargetWeeks} semanas) • ${locationLabel} • ${categoryLabel} • Emissão: ${dateStr}`;

      let currentY = drawPDFLetterhead(doc, title, subtitle);
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
      doc.text('PERÍODO DE COBERTURA', 18, currentY + 6.5);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`Até ${purchasePlanningSummary.targetPeriodLabel}`, 18, currentY + 13.5);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`${purchasePlanningSummary.totalTargetWeeks} sem (~${purchasePlanningSummary.totalTargetMonths} meses)`, 18, currentY + 18.5);

      // Metric 2: Itens com Déficit
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
      doc.text('Com necessidade de reposição', 66, currentY + 18.5);

      // Metric 3: Volume de Unidades
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('VOLUME FÍSICO TOTAL', 116, currentY + 6.5);
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
      doc.text('Preços unitários médios', 160, currentY + 18.5);

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
          const duraStr = item.durationWeeks === 'infinite' ? '∞' : `${item.durationWeeks.toFixed(1)} sem`;
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
          head: [['Nº', 'Material / Insumo', 'Categoria', 'Estoque', 'Cons./Sem', 'Duração', 'Demanda', 'QTD A COMPRAR', 'Vlr. Unit. (R$)', 'Total Est. (R$)']],
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
        doc.text('Responsável pelo Planejamento de Compras / Almoxarifado', pageWidth / 2, finalY + 5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`Documento emitido automaticamente pelo Sistema de Gestão de Estoque • ${dateStr}`, pageWidth / 2, finalY + 9.5, { align: 'center' });
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
        'Nº': idx + 1,
        'Item / Insumo': item.name,
        'Categoria': item.category || 'Geral',
        'Unidade': item.unit_measure || 'UN',
        'Estoque Atual (Saldo)': item.currentStock,
        'Consumo Semanal Médio': item.weeklyRate > 0 ? Number(item.weeklyRate.toFixed(2)) : 0,
        'Consumo Mensal Médio': item.monthlyRate > 0 ? Number(item.monthlyRate.toFixed(2)) : 0,
        'Duração do Estoque Atual (Semanas)': item.durationWeeks === 'infinite' ? '∞' : Number(item.durationWeeks.toFixed(1)),
        'Previsão de Término Atual': item.durationMonthInfo.monthYear,
        [`Demanda Prevista até ${purchasePlanningSummary.targetPeriodLabel}`]: item.periodDemand,
        'Estoque de Segurança': item.safetyStock,
        'Necessidade Total Período': item.totalRequired,
        'QUANTIDADE A COMPRAR': item.quantityToBuy,
        'Preço Unitário Estimado (R$)': item.unitPrice > 0 ? item.unitPrice : 0,
        'Custo Total Estimado (R$)': item.totalEstimatedCost > 0 ? item.totalEstimatedCost : 0,
        'Status': item.quantityToBuy > 0 ? 'COMPRA NECESSÁRIA' : 'ESTOQUE ATENDE ATÉ O PERÍODO'
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
        'Catálogo de Materiais em Estoque',
        `Policlínica de Sobral • Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`
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
          `Página ${i} de ${pageCount} - Catálogo gerado para consulta administrativa`,
          pageWidth / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }
      
      const dateStr = format(new Date(), 'dd-MM-yyyy');
      doc.save(`Catalogo_Materiais_${dateStr}.pdf`);
      showToast("Catálogo de materiais exportado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar catálogo:', error);
      showToast("Erro ao exportar catálogo de materiais.", "error");
    }
  };

  const handleExportRequestsPDF = () => {
    try {
      const doc = new jsPDF();
      
      const startY = drawPDFLetterhead(
        doc,
        'Relatório de Solicitações de Materiais',
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
        head: [['Nº', 'Data', 'Setor', 'Status', 'Itens']],
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
        setModalSector('Descarte/Vencimento (Desperdício)');
        const expDateStr = showTransactionModal.item.expiry_date && showTransactionModal.item.expiry_date !== 'Indeterminada'
          ? format(new Date(showTransactionModal.item.expiry_date), 'dd/MM/yyyy')
          : '';
        setExpiryReason(expDateStr 
          ? `Material com validade expirada em ${expDateStr}. Baixa por descarte/desperdício.` 
          : 'Material com validade expirada. Baixa por descarte/desperdício.');
        setBasket([{ item_id: showTransactionModal.item.id!, quantity: showTransactionModal.item.quantity || 1 }]);
      } else {
        setExitReason('consumo');
        setExpiryReason('');
        setBasket(showTransactionModal.item ? [{ item_id: showTransactionModal.item.id!, quantity: 1 }] : []);
        
        if (showTransactionModal.item) {
          setModalSector(showTransactionModal.item.location === 'Farmácia' ? 'Farmácia' : 'Almoxarifado');
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
      doc.text('Relatório PCA - Plano Anual de Contratação', 105, currentY, { align: 'center' });
      currentY += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text(`Período de Consumo: ${format(start, 'dd/MM/yyyy')} até ${format(end, 'dd/MM/yyyy')}`, 105, currentY, { align: 'center' });
      currentY += 5;
      doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 105, currentY, { align: 'center' });
      currentY += 15;

      const categories = Object.keys(groupedData).sort();
      
      if (categories.length === 0) {
        doc.setFontSize(12);
        doc.text('Nenhum consumo registrado no período selecionado.', 105, currentY + 20, { align: 'center' });
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
      showToast("Relatório PCA gerado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao gerar relatório PCA:', error);
      showToast("Erro ao gerar relatório PCA.", "error");
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
          { name: 'HIGIENIZAÇÃO', values: [4, 0, 0, 1, 3, 0], total: 8 },
          { name: 'ILHA', values: [316, 178, 266, 310, 579, 200], total: 1849 },
          { name: 'IMAGEM', values: [351, 354, 131, 267, 505, 106], total: 1714 },
          { name: 'PÉ DIABÉTICO', values: [384, 476, 563, 548, 572, 552], total: 3095 },
          { name: 'RECEPÇÃO GERAL', values: [203, 0, 0, 0, 110, 17], total: 330 },
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
      months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho'];
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
      months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho'];
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

      if (filterLower.includes('médico') || filterLower.includes('medico') || filterLower.includes('hospitalar')) {
        return catLower.includes('médico') || catLower.includes('medico') || catLower.includes('hospitalar');
      }
      if (filterLower.includes('medicamento')) {
        return catLower.includes('medicamento') || catLower.includes('fármaco') || catLower.includes('farmaco');
      }
      if (filterLower.includes('aliment')) {
        return catLower.includes('aliment') || catLower.includes('copa') || catLower.includes('cozinha');
      }
      if (filterLower.includes('expediente')) {
        return catLower.includes('expediente') || catLower.includes('papelaria') || catLower.includes('escritório') || catLower.includes('escritorio');
      }
      if (filterLower.includes('higiene') || filterLower.includes('limpeza')) {
        return catLower.includes('higiene') || catLower.includes('limpeza') || catLower.includes('saneante');
      }
      if (filterLower.includes('odont')) {
        return catLower.includes('odont');
      }
      if (filterLower.includes('epi')) {
        return catLower.includes('epi') || catLower.includes('segurança') || catLower.includes('seguranca');
      }
      if (filterLower.includes('informát') || filterLower.includes('informat') || filterLower.includes('ti')) {
        return catLower.includes('informát') || catLower.includes('informat') || catLower.includes('ti');
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
          { name: 'PÉ DIABÉTICO', values: [384, 476, 563, 548, 572, 552], total: 3095 },
          { name: 'ILHA', values: [316, 178, 266, 310, 579, 200], total: 1849 },
          { name: 'IMAGEM', values: [351, 354, 131, 267, 505, 106], total: 1714 }
        ]);

    const activeSectorsForAnalysis = finalSectors.filter(s => s.total > 0);

    let periodText = 'no período analisado';
    if (quantitativoPeriodPreset === '1_semestre_2026') periodText = 'no 1º semestre de 2026';
    else if (quantitativoPeriodPreset === '2_semestre_2026') periodText = 'no 2º semestre de 2026';
    else if (quantitativoPeriodPreset === 'ano_2026') periodText = 'no ano de 2026 (total)';

    const catLabel = quantitativoCategory === 'Todos' ? 'materiais e insumos em geral' : `materiais da categoria ${quantitativoCategory.toUpperCase()}`;

    let autoAnalysis = '';
    if (activeSectorsForAnalysis.length > 0) {
      const top1 = activeSectorsForAnalysis[0];
      const top2 = activeSectorsForAnalysis[1];
      const grandTotal = activeSectorsForAnalysis.reduce((acc, s) => acc + s.total, 0);

      const monthTotals = months.map((_, idx) => activeSectorsForAnalysis.reduce((sum, sec) => sum + (sec.values[idx] || 0), 0));
      const maxMonthIdx = monthTotals.indexOf(Math.max(...monthTotals));
      const maxMonthName = months[maxMonthIdx] || 'mês de pico';

      let sector2Text = '';
      if (top2 && top2.total > 0) {
        sector2Text = ` Em SEGUNDO LUGAR, destaca-se o setor de ${top2.name}, acumulando ${top2.total.toLocaleString('pt-BR')} unidades (${((top2.total / grandTotal) * 100).toFixed(1)}% do total).`;
      }

      autoAnalysis = `Verificou-se que, ${periodText}, o volume total de dispensação para ${catLabel} foi de ${grandTotal.toLocaleString('pt-BR')} unidades. O setor com MAIOR DEMANDA foi o de ${top1.name}, apresentando ${top1.total.toLocaleString('pt-BR')} unidades dispensadas (${((top1.total / grandTotal) * 100).toFixed(1)}% do consumo total).${sector2Text} Observou-se o maior pico de dispensações no mês de ${maxMonthName}. Os dados registrados pelo sistema indicam maior concentração assistencial nesses setores e auxiliam no planejamento das compras e estoques do almoxarifado.`;
    } else {
      autoAnalysis = `Verificou-se que, ${periodText}, não foram registradas movimentações de saída ou solicitações entregues para ${catLabel} no sistema. Os controles de estoque do almoxarifado permanecem monitorando o fluxo de demandas.`;
    }

    return {
      months,
      monthColors,
      sectors: finalSectors,
      title: quantitativoTitle || (quantitativoCategory === 'Todos' ? 'QUANTITATIVO GERAL DE MATERIAIS DISPENSADOS PARA OS SETORES DA POLICLÍNICA' : `QUANTITATIVO DE ${quantitativoCategory.toUpperCase()} DISPENSADOS PARA OS SETORES DA POLICLÍNICA`),
      criticalAnalysis: quantitativoCriticalAnalysis.trim() !== '' ? quantitativoCriticalAnalysis : autoAnalysis
    };
  }, [quantitativoSource, quantitativoPeriodPreset, quantitativoCustomStart, quantitativoCustomEnd, quantitativoCategory, quantitativoTitle, quantitativoCriticalAnalysis, transactions, requests, allRequestItems, items]);

  const handleExportQuantitativoPDF = async () => {
    if (!quantitativoReportRef.current) return;
    try {
      showToast("Gerando PDF oficial do relatório...", "info");
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
      showToast("Erro ao gerar PDF. Tente usar a função de impressão.", "error");
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
      doc.text('POLICLÍNICA', 28, 17);
      
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
      doc.text(`Local Físico Origem: ${roomFilter}`, 14, 46);
      doc.text(`Emitido em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 52);

      // Filter items by room and categories
      const roomItems = items.filter(i => {
        // Ignorar excluídos ou sem estoque
        if (i.deletedAt || i.quantity <= 0) return false;
        
        // Normalização para comparação robusta
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
            else if (daysToExpiry <= 30) expiryStatus = 'CRÍTICO';
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
            
            // Forçamos o formato JPEG com qualidade alta
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            resolve(dataUrl);
            URL.revokeObjectURL(img.src);
          } catch (e) {
            reject(e);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          // Se o Canvas falhar, tenta FileReader direto como último recurso
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
      showToast("Gerando Termo de Doação...", "info");

      let base64Image = letterheadImage || "";
      
      // Se não houver imagem personalizada, tenta carregar a padrão
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
            console.log("[PDF] Desenhando imagem de papel timbrado no Termo de Doação");
            const format = base64Image.includes('image/png') ? 'PNG' : 'JPEG';
            pdfDoc.addImage(base64Image, format, 0, 0, pageWidth, pageHeight, undefined, 'FAST');
            return;
          } catch (e) {
            console.error("Error adding letterhead image to Donation Term:", e);
          }
        }
        
        console.log("[PDF] Usando cabeçalho padrão com 3 logos retangulares expandidos no Termo de Doação");
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

        // 2. LOGO POLICLÍNICA (Center - Rectangular)
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
          pdfDoc.text('POLICLÍNICA DE SOBRAL', centerX + (logoWidth / 2), logoY + 10, { align: 'center' });
        }

        // 3. LOGO CONSÓRCIO CPSMS (Right - Rectangular)
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
          pdfDoc.text('CONSÓRCIO CPSMS', rightX + (consorcioWidth / 2), consorcioY + 11, { align: 'center' });
        }

        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.setLineWidth(0.5);
        pdfDoc.line(margin, 29, pageWidth - margin, 29);

        // Footer
        pdfDoc.setFontSize(7.5);
        pdfDoc.setTextColor(120, 113, 108);
        pdfDoc.setFont('helvetica', 'normal');
        const footer1 = 'Policlínica de Sobral. Av. Monsenhor Aloísio Pinto, 481, CEP 62050-255, Sobral-CE';
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

      const donorName = formatTitleCase(data.donatingUnitName || 'Policlínica de Sobral');
      const receivingName = formatTitleCase(data.receivingUnit.name);
      const receivingAddress = data.receivingUnit.address;
      const receivingCNPJ = data.receivingUnit.cnpj;

      drawLetterhead(doc);

      // --- TITLE & DATA DE EMISSÃO BELOW LOGOS ---
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text('TERMO DE DOAÇÃO DE MATERIAIS E INSUMOS', pageWidth / 2, 35, { align: 'center' });
      
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 40, { align: 'center' });

      // --- DOCUMENT METADATA RIGHT-ALIGNED ---
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text('Código: TERMO-ALMOX', pageWidth - margin, 46, { align: 'right' });
      doc.text(`Data de Implantação: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, 50, { align: 'right' });
      doc.text(`Última Revisão: ${data.revisionDate || '---'}`, pageWidth - margin, 54, { align: 'right' });
      
      if (data.donationNumber) {
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        doc.setFont('helvetica', 'bold');
        doc.text(`Termo nº: ${data.donationNumber}`, pageWidth - margin, 59, { align: 'right' });
      }

      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.2);
      doc.line(margin, 63, pageWidth - margin, 63);

      // --- CONTENT ---
      doc.setFontSize(10);
      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'normal');
      
      const donationText = `A ${donorName}, inscrita sob o CNPJ nº 12.208.466/0001-66, por intermédio de seu Setor de Almoxarifado, formaliza por este instrumento a doação à unidade ${receivingName}, situada em ${receivingAddress}, inscrita sob o CNPJ nº ${receivingCNPJ}, dos materiais e insumos abaixo discriminados. A presente cessão justifica-se pela otimização de estoque em virtude da redução de demanda interna e proximidade do prazo de validade, assegurando a destinação útil dos itens.`;
      
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
        head: [['Descrição do Material', 'Qtd Doada', 'Conferência']],
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
      showToast("Termo de Doação gerado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar PDF de Doação:', error);
      alert('Ocorreu um erro ao gerar o Termo de Doação.');
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

      // 2. CENTER LOGO: Logo da Policlínica (Rectangular)
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
        doc.text('POLICLÍNICA DE SOBRAL', centerX + (logoWidth / 2), logoY + 10, { align: 'center' });
      }

      // 3. RIGHT LOGO: Logo do Consórcio CPSMS (Rectangular)
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
        doc.text('CONSÓRCIO CPSMS', rightX + (consorcioWidth / 2), consorcioY + 11, { align: 'center' });
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
    doc.text(`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, startY, { align: 'center' });
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
      showToast("Imagem muito grande. Máximo 5MB.", "error");
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
        showToast("Imagem muito grande. Máximo 2MB.", "error");
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
        showToast("Imagem muito grande. Máximo 2MB.", "error");
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
        showToast("Imagem muito grande. Máximo 2MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setPoliclinicaLogo(base64);
        localStorage.setItem('policlinica_logo_base64', base64);
        try {
          await setDoc(doc(db, 'settings', 'general'), { policlinicaLogo: base64 }, { merge: true });
          showToast("Logo da Policlínica atualizada com sucesso!", "success");
        } catch (err) {
          console.error("Erro ao salvar no Firestore:", err);
          showToast("Logo da Policlínica atualizada!", "success");
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
      showToast("Logo da Policlínica removida com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao remover logo da Policlínica do Firestore:", err);
      showToast("Logo da Policlínica removida!", "success");
    }
  };

  const handleConsorcioLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("Imagem muito grande. Máximo 2MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setConsorcioLogo(base64);
        localStorage.setItem('consorcio_logo_base64', base64);
        try {
          await setDoc(doc(db, 'settings', 'general'), { consorcioLogo: base64 }, { merge: true });
          showToast("Logo do Consórcio CPSMS atualizada com sucesso!", "success");
        } catch (err) {
          console.error("Erro ao salvar no Firestore:", err);
          showToast("Logo do Consórcio atualizada!", "success");
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
      showToast("Logo do Consórcio removida com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao remover logo do Consórcio do Firestore:", err);
      showToast("Logo do Consórcio removida!", "success");
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

        // 2. LOGO POLICLÍNICA (Center - Rectangular)
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
          pdfDoc.text('POLICLÍNICA DE SOBRAL', centerX + (logoWidth / 2), logoY + 10, { align: 'center' });
        }

        // 3. LOGO CONSÓRCIO CPSMS (Right - Rectangular)
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
          pdfDoc.text('CONSÓRCIO CPSMS', rightX + (consorcioWidth / 2), consorcioY + 11, { align: 'center' });
        }

        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.setLineWidth(0.5);
        pdfDoc.line(margin, 29, pageWidth - margin, 29);

        // Footer
        pdfDoc.setFontSize(7.5);
        pdfDoc.setTextColor(120, 113, 108);
        pdfDoc.setFont('helvetica', 'normal');
        const footer1 = 'Policlínica de Sobral. Av. Monsenhor Aloísio Pinto, 481, CEP 62050-255, Sobral-CE';
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
      doc.text(`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 40, { align: 'center' });

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
      doc.text('REFERÊNCIA:', 19, 68);
      
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(data.sector.toUpperCase(), 52, 60);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(data.requestId ? `Solicitação #${data.requestId.slice(-5).toUpperCase()}` : 'Baixa Direta no Sistema', 52, 68);
      
      doc.text('DATA DA SAÍDA:', pageWidth - 80, 68);
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
        head: [['DESCRIÇÃO DO MATERIAL', 'QTD ENTREGUE', 'CONFERÊNCIA']],
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
      doc.text('RESPONSÁVEL PELA ENTREGA', 20 + (signLineW/2), finalY + 5, { align: 'center' });
      doc.text('RESPONSÁVEL PELO SETOR (RECEBIMENTO)', pageWidth - 20 - (signLineW/2), finalY + 5, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const responsibleName = userProfile?.name || user?.displayName || 'Responsável';
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
      
      const footerLine1 = 'Policlínica de Sobral. Av. Monsenhor Aloísio Pinto, 481, Dom Expedito CEP 62050-255, Sobral Ceará.';
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
          pdfDoc.text('POLICLÍNICA DE SOBRAL', centerX + (logoWidth / 2), logoY + 10, { align: 'center' });
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
          pdfDoc.text('CONSÓRCIO CPSMS', rightX + (consorcioWidth / 2), consorcioY + 11, { align: 'center' });
        }

        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.setLineWidth(0.5);
        pdfDoc.line(margin, 29, pageWidth - margin, 29);

        // Footer
        pdfDoc.setFontSize(7.5);
        pdfDoc.setTextColor(120, 113, 108);
        pdfDoc.setFont('helvetica', 'normal');
        const footer1 = 'Policlínica de Sobral. Av. Monsenhor Aloísio Pinto, 481, CEP 62050-255, Sobral-CE';
        const footer2 = 'Fone: (88) 3614-3156 | Fax: (88) 3614-3245 | cpsms.ce.gov.br';
        pdfDoc.text(footer1, pageWidth / 2, pageHeight - 12, { align: 'center' });
        pdfDoc.text(footer2, pageWidth / 2, pageHeight - 8, { align: 'center' });
      };

      drawLetterhead(doc);

      const isVencido = data.reason === 'vencido' || !data.reason;
      const title = isVencido 
        ? 'TERMO DE BAIXA E DESCARTE POR VENCIMENTO (DESPERDÍCIO)' 
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
      doc.text(`RESPONSÁVEL:`, margin + 5, 57);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.responsible || 'Responsável pelo Estoque'}`, margin + 33, 57);

      doc.setFont('helvetica', 'bold');
      doc.text(`TIPO DE BAIXA:`, margin + 105, 57);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(190, 18, 60);
      doc.text(`${isVencido ? 'DESCARTE / VENCIMENTO (DESPERDÍCIO)' : 'PERDA / AVARIA'}`, margin + 133, 57);

      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(`DESTINAÇÃO:`, margin + 5, 64);
      doc.setFont('helvetica', 'normal');
      doc.text(`Inutilização e Descarte Conforme Normas Sanitárias (NÃO computado como consumo de setor)`, margin + 30, 64);

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
        head: [['#', 'MATERIAL / DESCRIÇÃO', 'LOTE', 'VALIDADE', 'CATEGORIA', 'QTD DESCARTADA']],
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
        doc.text('JUSTIFICATIVA / OBSERVAÇÕES:', margin, finalY);
        
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
      const declaration = "Declaramos que os itens acima discriminados foram dados como baixa definitiva no sistema de gestão de estoque em razão de vencimento ou perda, sendo devidamente segregados para incineração ou descarte técnico especializado, não configurando consumo assistencial de nenhum setor da unidade.";
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
      doc.text('RESPONSÁVEL PELO ESTOQUE / BAIXA', margin + (signLineWidth / 2), signY + 4, { align: 'center' });
      doc.text('GESTOR TÉCNICO / FARMACÊUTICO', pageWidth - margin - (signLineWidth / 2), signY + 4, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(data.responsible || 'Responsável', margin + (signLineWidth / 2), signY + 8, { align: 'center' });
      doc.text('Policlínica de Sobral', pageWidth - margin - (signLineWidth / 2), signY + 8, { align: 'center' });

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
      doc.text('POLICLÍNICA', 28, 17);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text('GESTÃO DE ALMOXARIFADO E FARMÁCIA', 28, 22);

      doc.setDrawColor(231, 229, 228); // light border
      doc.setLineWidth(0.5);
      doc.line(14, 28, pageWidth - 14, 28);
      
      // Title and Date
      doc.setFontSize(14);
      doc.setTextColor(28, 25, 23);
      doc.setFont('helvetica', 'bold');
      doc.text('Relatório de Consumo por Setor', 14, 40);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text(`Período: ${format(parseISO(reportRange.start), 'dd/MM/yyyy')} a ${format(parseISO(reportRange.end), 'dd/MM/yyyy')}`, 14, 46);
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
          doc.text(`Documento emitido pelo Sistema de Gestão Hospitalar - Página ${doc.getNumberOfPages()}`, 14, doc.internal.pageSize.height - 10);
        }
      });
      
      const fileName = `Relatorio_Consumo_Policlinica_${format(new Date(), 'dd-MM-yyyy')}.pdf`;
      doc.save(fileName);
      showToast("Relatório profissional exportado!", "success");
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
                          (effectiveSectorFilter === 'Farmácia' && t.sector === 'Farmácia (Consumo Interno)');
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
        const userLocation = userProfile?.sector === 'Farmácia' ? 'Farmácia' : 'Almoxarifado';
        return (item.location || 'Almoxarifado') === userLocation;
      }
      
      // If admin, respect the sector filter if it maps to a location
      if (reportSectorFilter === 'Farmácia') {
        return item.location === 'Farmácia';
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
        const userLocation = userProfile?.sector === 'Farmácia' ? 'Farmácia' : 'Almoxarifado';
        return (item.location || 'Almoxarifado') === userLocation;
      }
      
      // If admin, respect the sector filter if it maps to a location
      if (reportSectorFilter === 'Farmácia') {
        return item.location === 'Farmácia';
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
      
      const sectorKey = (t.sector === 'Farmácia (Consumo Interno)') ? 'Farmácia' : t.sector!;
      
      if (!sectorData[sectorKey]) {
        sectorData[sectorKey] = { name: sectorKey };
      }
      sectorData[sectorKey][category] = (sectorData[sectorKey][category] || 0) + t.quantity;
    });

    filteredTrans.filter(t => t.type === 'entry' && t.isReturn && t.sector).forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const category = item?.category || 'Outros';
      categoriesInSector.add(category);
      
      const sectorKey = (t.sector === 'Farmácia (Consumo Interno)') ? 'Farmácia' : t.sector!;
      
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
      let sector = t.sector || 'Não Informado';
      if (sector === 'Farmácia (Consumo Interno)') sector = 'Farmácia';
      
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
      let sector = t.sector || 'Não Informado';
      if (sector === 'Farmácia (Consumo Interno)') sector = 'Farmácia';
      
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
      let sec = t.sector || 'Não Informado';
      if (sec === 'Farmácia (Consumo Interno)') sec = 'Farmácia';

      if (!returnsBySectorMap[sec]) {
        returnsBySectorMap[sec] = { name: sec, quantity: 0, value: 0 };
      }
      returnsBySectorMap[sec].quantity += t.quantity;
      returnsBySectorMap[sec].value += val;

      const reason = t.returnReason || 'Não especificado';
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
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
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
                <img src={loginLogo} alt="Logo Policlínica" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl overflow-hidden border-4 border-white ring-4 ring-blue-500/10 text-white">
                <Package className="w-12 h-12" />
              </div>
            )}
            <div className="mb-4 text-center">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase leading-tight">
                Policlínica
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
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Acesso restrito a funcionários autorizados</p>
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
              <img src={appLogo} alt="Logo Policlínica" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-2 rounded-xl text-white shadow-sm shrink-0">
              <Package className="w-5 h-5" />
            </div>
          )}
          <div className="flex items-baseline gap-1.5">
            <h1 className="font-black text-lg tracking-tight text-white">Policlínica</h1>
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
                <img src={appLogo} alt="Logo Policlínica" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 p-2.5 rounded-2xl shadow-md shadow-blue-500/20 text-white ring-2 ring-blue-500/20 shrink-0">
                <Package className="w-6 h-6" />
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="font-black text-xl tracking-tight text-slate-900 leading-none">Policlínica</h1>
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
                    onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-200 text-xs ${
                      activeTab === 'history' 
                        ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white font-extrabold shadow-md shadow-blue-600/20' 
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <History size={18} className={activeTab === 'history' ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 transition-colors'} />
                      <span>Histórico</span>
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
                      <span>Solicitações</span>
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
                      <span>Devoluções</span>
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
                      <span>Relatórios</span>
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
                      <span>Usuários</span>
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
                      <span>Nova Solicitação</span>
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
                      <span>Devolução de Materiais</span>
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
                      <span>Minhas Solicitações</span>
                    </div>
                  </button>

                  {(userProfile?.role === 'LÍDER' || userProfile?.role === 'SETOR') && (
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
                        <span>Estatísticas</span>
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
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Usuário Conectado</p>
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
            <Settings size={18} className="text-slate-400" /> Configurações
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-10 max-w-7xl mx-auto mt-16 lg:mt-0">
        <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6 lg:mb-10">
          <div>
            <h2 className="text-xl lg:text-3xl font-bold tracking-tight mb-1">
              {activeTab === 'dashboard' && 'Visão Geral'}
              {activeTab === 'inventory' && 'Gerenciamento de Estoque'}
              {activeTab === 'history' && 'Histórico de Movimentações'}
              {activeTab === 'requests' && 'Solicitações de Materiais'}
              {activeTab === 'admin-devolutions' && 'Devoluções de Materiais'}
              {activeTab === 'trash' && 'Lixeira (Exclusão em 3 dias)'}
              {activeTab === 'my-requests' && `Minhas Solicitações - ${selectedSector || ''}`}
              {activeTab === 'new-request' && `Nova Solicitação - ${selectedSector || ''}`}
              {activeTab === 'devolution' && `Devolução de Materiais - ${selectedSector || ''}`}
              {editingRequest && ' - Editando Solicitação'}
              {activeTab === 'reports' && 'Relatórios e Análises'}
              {activeTab === 'leader-stats' && 'Estatísticas do Almoxarifado'}
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
                        onChange={e => setInventoryLocation(e.target.value as 'Almoxarifado' | 'Farmácia')}
                      >
                        <option value="Almoxarifado">Almoxarifado</option>
                        <option value="Farmácia">Farmácia</option>
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
                    <span className="text-slate-400 text-xs font-bold">até</span>
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
                      <FileText size={15} /> Catálogo de Itens
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
                title="Notificações"
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
                        <h3 className="font-black text-sm">Notificações</h3>
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
                            <p className="text-xs text-[#A8A29E] font-medium">Nenhuma notificação</p>
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
                                          Confirmar Ciência
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
                    <option value="duration_asc">Duração (Menor-Maior)</option>
                    <option value="duration_desc">Duração (Maior-Menor)</option>
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
                    <option value="donation">Doação</option>
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
                      title="Baixar Relatório PDF de Todo Estoque"
                    >
                      <Printer size={18} />
                    </button>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'dashboard' && (isAdmin || selectedSector === 'Farmácia') && (
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
                  <ArrowUpRight size={18} /> Nova Saída
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

                {/* Card 2: Patrimônio */}
                {(isAdmin || selectedSector === 'Farmácia') && (
                  <div className="bg-white rounded-xl border border-indigo-100/80 shadow-xs hover:shadow-sm hover:border-indigo-200 transition-all duration-200 overflow-hidden group relative">
                    <div className="h-1 w-full bg-gradient-to-r from-indigo-600 to-blue-600" />
                    <div className="p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Patrimônio Investido</span>
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

                {/* Card 3: Pendências / Solicitações */}
                <div 
                  onClick={() => setActiveTab('requests')}
                  className="bg-white rounded-xl border border-sky-100/80 shadow-xs hover:shadow-sm hover:border-sky-300 transition-all duration-200 overflow-hidden group cursor-pointer relative"
                >
                  <div className="h-1 w-full bg-gradient-to-r from-sky-500 to-blue-600" />
                  <div className="p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Solicitações Pendentes</span>
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
                        {pendingRequestsCount > 0 ? 'Aguardando atendimento' : 'Nenhuma pendência'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 4: Nível Crítico / Alertas */}
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
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Atenção Necessária</span>
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
                              {nearExpiryItems.length} próx. vencer
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
                          Distribuição de Estoque por Categoria
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
                {/* Left Column: Central de Alertas Críticos (5/12 cols) */}
                <div className="lg:col-span-5 bg-white rounded-3xl border border-blue-100 shadow-sm overflow-hidden space-y-0">
                  <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-400/30">
                        <AlertTriangle size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-white">
                          Central de Alertas Críticos
                        </h4>
                        <p className="text-[10px] text-blue-200 font-medium">
                          Itens vencidos, com estoque baixo ou próximos ao vencimento
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowCriticalReportModal(true)}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 rounded-xl text-[11px] font-extrabold transition-all flex items-center gap-1 shadow-xs"
                        title="Escolher e Imprimir Relatório PDF (Validade / Estoque Baixo / Geral)"
                      >
                        <Printer size={13} /> Relatório PDF
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
                          Nenhum insumo apresentou nível crítico de reposição, vencimento ultrapassado ou data de expiração próxima.
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
                          Retirar por Desperdício
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
                              Abaixo do mínimo recomendado ({group.min_quantity} un)
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
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-sky-200 text-sky-900">Próx. Vencer</span>
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

                {/* Right Column: Movimentações Recentes (7/12 cols) */}
                <div className="lg:col-span-7 bg-white rounded-3xl border border-blue-100 shadow-sm overflow-hidden space-y-0">
                  <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/30">
                        <History size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-white">
                          Movimentações Recentes do Estoque
                        </h4>
                        <p className="text-[10px] text-blue-200 font-medium">
                          Histórico de saídas e entradas registradas no almoxarifado
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-1 rounded-full">
                      Últimos 5 registros
                    </span>
                  </div>

                  <div className="p-5 space-y-3 max-h-[480px] overflow-y-auto">
                    {recentTransactions.length === 0 && (
                      <div className="py-14 text-center">
                        <History size={40} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-sm text-slate-800 font-bold">Sem registros no momento</p>
                        <p className="text-xs text-slate-500">Nenhuma movimentação realizada nesta localização.</p>
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
                            {t.type === 'entry' ? 'Entrada / Adição em estoque' : `Saída e entrega p/ setor: ${t.sector || '---'}`}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 pt-1.5 border-t border-dashed border-slate-200/80">
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Clock size={11} />
                              {new Date(t.date).toLocaleDateString('pt-BR')} às {new Date(t.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                            title="Excluir Movimentação"
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
                      onClick={() => setInventoryLocation('Farmácia')}
                      className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-2 ${
                        inventoryLocation === 'Farmácia' 
                          ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white shadow-md shadow-blue-600/20' 
                          : 'text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      <Users size={15} /> Estoque Farmácia
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2 bg-blue-50/80 rounded-2xl border border-blue-100">
                    <div className="p-2 bg-gradient-to-br from-blue-700 to-indigo-900 text-white rounded-xl shadow-sm">
                      {inventoryLocation === 'Farmácia' ? <Users size={16} /> : <Package size={16} />}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">
                        Estoque: <span className="text-blue-700">{inventoryLocation === 'Farmácia' ? 'Medicamentos (Farmácia)' : 'Almoxarifado Geral'}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">Acesso exclusivo aos medicamentos da Farmácia</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {inventoryLocation === 'Farmácia' && (
                    <button 
                      onClick={() => setActiveTab('new-request')}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                      title="Solicitar novos medicamentos ao Almoxarifado Geral"
                    >
                      <Plus size={16} /> Solicitar ao Almoxarifado
                    </button>
                  )}
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                    Visualização: <span className="text-blue-700 font-black">{inventoryLocation}</span>
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
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">{isAdmin ? 'Preço Un.' : '---'}</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider text-center">Quantidade</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">Mínimo</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider text-center">Duração</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider">Status Crítico</th>
                    <th className="px-6 py-4 font-black text-xs text-blue-200/90 uppercase tracking-wider text-right">Ações</th>
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
                                  Esgota este Mês
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
                            {isAdmin && editingMaterialName?.oldName === group.name ? (
                              <div className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="text" 
                                    value={editingMaterialName.newName}
                                    onChange={(e) => setEditingMaterialName({ ...editingMaterialName, newName: e.target.value })}
                                    className="px-3 py-1 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-sm text-slate-900"
                                    autoFocus
                                  />
                                  <button 
                                    onClick={handleUpdateMaterialName}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl"
                                    title="Salvar"
                                  >
                                    <Check size={18} />
                                  </button>
                                  <button 
                                    onClick={() => setEditingMaterialName(null)}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl"
                                    title="Cancelar"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                                {group.category === 'Medicamentos' && (
                                  <div className="flex flex-col gap-1 bg-white p-2 rounded-xl border border-slate-200">
                                    <div className="flex flex-wrap gap-1 items-center">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider mr-1">Unidades:</span>
                                      {['mg', 'mcg', 'UI', 'g', 'ml', '%'].map(unit => (
                                        <button
                                          key={unit}
                                          type="button"
                                          onClick={() => {
                                            let currentName = editingMaterialName.newName.trim();
                                            if (currentName) {
                                              if (!currentName.endsWith(' ')) {
                                                currentName += ' ';
                                              }
                                              currentName += unit;
                                              setEditingMaterialName({ ...editingMaterialName, newName: currentName });
                                            }
                                          }}
                                          className="px-1.5 py-0.5 bg-slate-100 hover:bg-blue-700 hover:text-white text-slate-700 rounded text-[9px] font-bold transition-all uppercase"
                                        >
                                          +{unit}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="flex flex-wrap gap-1 items-center">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider mr-1">Dosagem:</span>
                                      {['500 mg', '1000 mg', '1000 UI', '5000 UI', '10.000 UI', '50.000 UI'].map(dose => (
                                        <button
                                          key={dose}
                                          type="button"
                                          onClick={() => {
                                            let currentName = editingMaterialName.newName.trim();
                                            if (currentName) {
                                              if (!currentName.endsWith(' ')) {
                                                currentName += ' ';
                                              }
                                              currentName += dose;
                                              setEditingMaterialName({ ...editingMaterialName, newName: currentName });
                                            }
                                          }}
                                          className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 rounded text-[9px] font-bold transition-all uppercase"
                                        >
                                          +{dose}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
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
                                  {isAdmin && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setEditingMaterialName({ oldName: group.name, newName: group.name }); }}
                                      className="opacity-0 group-hover/name:opacity-100 p-1 text-slate-400 hover:text-blue-700 transition-all"
                                      title="Editar Nome do Material"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                  )}
                                </div>
                                {group.batches[0]?.description && (
                                  <p className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">{group.batches[0].description}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4.5" onClick={(e) => e.stopPropagation()}>
                          {isAdmin && editingCategory?.name === group.name && !editingCategory?.itemId ? (
                            <div className="flex flex-col gap-1.5 bg-indigo-50/90 p-2.5 border border-indigo-200 rounded-2xl shadow-md min-w-[210px]">
                              <label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider">Nova Categoria:</label>
                              <select 
                                value={editingCategory.currentCategory === '__NEW__' ? '__NEW__' : editingCategory.currentCategory}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '__NEW__') {
                                    setEditingCategory({ ...editingCategory, currentCategory: '__NEW__' });
                                  } else {
                                    setEditingCategory({ ...editingCategory, currentCategory: val });
                                  }
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-extrabold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                              >
                                {categories.map(cat => (
                                  <option key={`cat-select-${cat}`} value={cat}>{cat}</option>
                                ))}
                                <option value="__NEW__">+ Cadastrar Nova Categoria...</option>
                              </select>

                              {editingCategory.currentCategory === '__NEW__' && (
                                <input 
                                  type="text"
                                  placeholder="Digite a nova categoria"
                                  value={customNewCategory}
                                  onChange={(e) => setCustomNewCategory(e.target.value)}
                                  className="w-full px-2.5 py-1 bg-white border border-indigo-300 rounded-xl text-xs font-extrabold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                                  autoFocus
                                />
                              )}

                              <div className="flex items-center gap-1.5 mt-1">
                                <button 
                                  onClick={() => handleUpdateCategory()}
                                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1 shadow-xs"
                                  title="Salvar Categoria"
                                >
                                  <Check size={14} /> Salvar
                                </button>
                                <button 
                                  onClick={() => { setEditingCategory(null); setCustomNewCategory(''); }}
                                  className="py-1.5 px-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition-all"
                                  title="Cancelar"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group/cat">
                              <div>
                                <p className="text-xs font-bold text-slate-800">{group.category || '---'}</p>
                                {isAdmin && <p className="text-[10px] font-medium text-slate-400 mt-0.5">{group.supplier || '---'}</p>}
                              </div>
                              {isAdmin && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCategory({ name: group.name, currentCategory: group.category || categories[0] || 'Expediente' });
                                    setCustomNewCategory('');
                                  }}
                                  className="opacity-0 group-hover/cat:opacity-100 p-1 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all"
                                  title="Alterar Categoria deste Material"
                                >
                                  <Edit2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
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
                                    {origin === 'contract' ? 'Contrato' : origin === 'donation' ? 'Doação' : 'Extra'}
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
                              {group.durationWeeks === 'infinite' ? '∞' : `${group.durationWeeks.toFixed(1)} sem`}
                            </span>
                            {group.durationWeeks !== 'infinite' && (
                              <span className={`text-[9px] font-extrabold mt-0.5 tracking-tight ${
                                currentMonthInfo.isCurrentMonth ? 'text-rose-700 font-black' : 'text-slate-600'
                              }`}>
                                Até {currentMonthInfo.shortMonthYear}
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
                              {group.durationWeeks <= 4 ? 'Muito Crítico' :
                               group.durationWeeks <= 8 ? 'Atenção' :
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
                                {item.origin === 'contract' ? 'Contrato' : item.origin === 'donation' ? 'Doação' : 'Extra'}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300">---</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-slate-700 font-medium">
                            {isAdmin ? (
                              editingPrice?.id === item.id ? (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={editingPrice.price}
                                    onChange={(e) => setEditingPrice({ ...editingPrice, price: parseFloat(e.target.value) || 0 })}
                                    className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-xs"
                                    autoFocus
                                  />
                                  <button 
                                    onClick={handleUpdatePrice}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md"
                                    title="Salvar"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button 
                                    onClick={() => setEditingPrice(null)}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded-md"
                                    title="Cancelar"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group/price">
                                  <span className="font-bold text-slate-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setEditingPrice({ id: item.id, price: item.unit_price }); }}
                                    className="opacity-0 group-hover/price:opacity-100 p-1 text-slate-400 hover:text-blue-700 transition-all"
                                    title="Editar Preço"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                              )
                            ) : (
                              '---'
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            {isAdmin ? (
                              editingQuantity?.id === item.id ? (
                                <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="number" 
                                    min="0"
                                    value={editingQuantity.quantity}
                                    onChange={(e) => setEditingQuantity({ ...editingQuantity, quantity: parseInt(e.target.value) || 0 })}
                                    className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-xs"
                                    autoFocus
                                  />
                                  <button 
                                    onClick={handleUpdateQuantity}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md"
                                    title="Salvar"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button 
                                    onClick={() => setEditingQuantity(null)}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded-md"
                                    title="Cancelar"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center group/qty">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-sm font-black ${item.quantity <= (item.min_quantity || 0) ? 'text-amber-600' : 'text-slate-900'}`}>
                                      {item.quantity} un
                                    </span>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setEditingQuantity({ id: item.id, quantity: item.quantity }); }}
                                      className="opacity-0 group-hover/qty:opacity-100 p-1 text-slate-400 hover:text-blue-700 transition-all"
                                      title="Editar Quantidade"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              )
                            ) : (
                              <span className={`text-sm font-black ${item.quantity <= (item.min_quantity || 0) ? 'text-amber-600' : 'text-slate-900'}`}>
                                {item.quantity} un
                              </span>
                            )}
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
                              title="Registrar Saída"
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
                  <h3 className="text-lg font-bold text-[#1C1917]">Histórico de Movimentações</h3>
                  {isAdmin && (
                    <div className="flex items-center gap-2 bg-[#F5F5F4] p-1 rounded-2xl border border-[#E7E5E4]">
                      <button 
                        onClick={() => setInventoryLocation('Almoxarifado')}
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-bold transition-all ${inventoryLocation === 'Almoxarifado' ? 'bg-[#1C1917] text-white shadow-sm' : 'text-[#78716C] hover:bg-[#E7E5E4]'}`}
                      >
                        Almoxarifado
                      </button>
                      <button 
                        onClick={() => setInventoryLocation('Farmácia')}
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-bold transition-all ${inventoryLocation === 'Farmácia' ? 'bg-[#1C1917] text-white shadow-sm' : 'text-[#78716C] hover:bg-[#E7E5E4]'}`}
                      >
                        Farmácia
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
                    {showDeletedHistory ? 'Ver Histórico Ativo' : 'Ver Excluídos (Testes)'}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Data</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Movimentação</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Lote</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Validade</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-center">Origem</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Setor</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Responsável</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Qtd</th>
                    {isAdmin && <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right whitespace-nowrap">Val. Unit</th>}
                    {isAdmin && <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right whitespace-nowrap">Total</th>}
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
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
                            {t.type === 'entry' ? 'Entrada' : 'Saída'}
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
                                {t.exitReason === 'vencido' ? 'Descarte / Vencimento (Desperdício)' : 
                                 t.exitReason === 'perda' ? 'Perda / Avaria' : 
                                 t.exitReason === 'doacao' ? 'Doação' : 'Consumo do Setor'}
                              </span>
                              {t.expiryReason && <span className="text-slate-600 font-normal lowercase ml-1">({t.expiryReason})</span>}
                            </div>
                          )}
                          {t.deletionReason && (
                            <div className="text-[10px] text-rose-500 font-bold mt-1">Exclusão: {t.deletionReason}</div>
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
                            {t.origin === 'contract' ? 'Contrato' : t.origin === 'donation' ? 'Doação' : 'Extra'}
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
                                      responsible: t.responsible || 'Responsável',
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
                                  t.exitReason === 'doacao' ? 'Reimprimir Termo de Doação' : 
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
                                title="Recuperar Movimentação"
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
                                title="Apagar Movimentação"
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
                    <p className="text-[#78716C]">Nenhuma movimentação encontrada para {inventoryLocation}.</p>
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
                        Inteligência Analítica de Estoque
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/80">
                        {reportSectorFilter === 'all' ? 'Todos os Setores' : reportSectorFilter}
                      </span>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Relatórios & Gestão de Consumo
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                      Projeções orçamentárias, histórico de saídas, curva de movimentação física e relatórios fiscais do almoxarifado.
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
                      <p className="text-[10px] uppercase font-extrabold text-rose-600 tracking-wider">Saídas</p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{reportData.exits}</p>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div className="px-3 py-1 text-center">
                      <p className="text-[10px] uppercase font-extrabold text-amber-600 tracking-wider">Devoluções</p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{reportData.totalReturnsCount}</p>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div className="px-3 py-1 text-center">
                      <p className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Período</p>
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
                        Calcula a quantidade necessária de cada item para durar até o mês de interesse (ex: Abril).
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-4 pt-3.5 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Mês Alvo</label>
                        <select 
                          value={planningTargetMonth}
                          onChange={(e) => setPlanningTargetMonth(Number(e.target.value))}
                          className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs text-slate-800 cursor-pointer"
                        >
                          {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
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
                        title="Baixar Relatório PDF de Compras"
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
                        <h3 className="text-base font-black text-slate-900 leading-tight">Impressão de Solicitações</h3>
                        <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">Imprima as solicitações pendentes e em separação por período</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 mt-5 pt-4 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-2 w-full">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Início</label>
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
                        <Printer size={15} /> Imprimir Relatório
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
                        <h3 className="text-base font-black text-slate-900">Catálogo de Itens</h3>
                        <p className="text-slate-500 text-xs font-medium mt-1">Baixe o catálogo contendo os nomes dos materiais e categorias cadastradas.</p>
                      </div>
                    </div>
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <button 
                        onClick={handleExportMaterialsCatalogPDF}
                        className="w-full bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-md shadow-blue-600/20 whitespace-nowrap cursor-pointer"
                      >
                        <Printer size={15} /> Ver Catálogo
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
                      <h3 className="text-base font-black text-slate-900 leading-tight">Relatório PCA</h3>
                      <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">Plano Anual de Contratação - Consumo por tipo no período</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 mt-5 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Início</label>
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
                      <h3 className="text-base font-black text-slate-900 leading-tight">Relatório de Materiais Críticos</h3>
                      <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">Exportação em PDF: Validade vencida/próxima e Estoque baixo</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button 
                        onClick={() => handleExportCriticalReportPDF('expiry')}
                        className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                        title="Gerar PDF exclusivo de itens vencidos e próximos ao vencimento"
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
                      <span>Relatório Completo ({totalAlertsCount})</span>
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
                          Módulo ApuraSUS
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          Gestão de Custos SUS
                        </span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">Relatórios Oficiais ApuraSUS</h3>
                      <p className="text-slate-500 text-xs font-medium mt-1 leading-snug">Produção física mensal e rateio de custos financeiros por setor e categoria</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button 
                        onClick={() => setReportsTab('apurasus_producao')}
                        className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                        title="Acessar Produção Física Mensal do Almoxarifado"
                      >
                        <Package size={13} className="text-blue-600 shrink-0" />
                        <span className="truncate">Produção Mensal</span>
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
                          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Entradas no Período</span>
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

                    {/* Card 2: Saídas */}
                    <div className="bg-white rounded-2xl border border-rose-100/80 shadow-sm hover:shadow-md hover:border-rose-200 transition-all duration-300 overflow-hidden group relative">
                      <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 to-pink-600" />
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Saídas / Consumo</span>
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
                          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Patrimônio em Saldo</span>
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
                            Itens no catálogo
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-white p-6 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-all lg:col-span-2 overflow-hidden relative group">
                      <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 to-pink-600 absolute top-0 left-0" />
                      <p className="text-slate-500 text-xs font-black uppercase tracking-wider mb-3">Consumo do Setor no Período</p>
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
                      <p className="text-slate-500 text-xs font-black uppercase tracking-wider mb-3">Solicitações no Período</p>
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
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Panorama Visual de Consumo & Movimentação</h3>
                    <p className="text-xs text-slate-500 font-medium">Gráficos interativos para acompanhamento gerencial das operações</p>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Movement Chart */}
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <Activity size={18} className="text-blue-600" /> Movimentação {isAdmin ? 'Geral' : 'do Setor'}
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">Fluxo Diário</span>
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
                        <Area type="monotone" dataKey="exits" name={isAdmin ? "Saídas" : "Consumo"} stroke="#f43f5e" fillOpacity={1} fill="url(#colorExits)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <PieChartIcon size={18} className="text-amber-500" /> Distribuição de Consumo por Categoria
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">Proporção</span>
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
                          <TrendingDown size={18} className="text-rose-600" /> Saídas por Motivo
                        </h4>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">Destinação</span>
                      </div>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Consumo', value: reportData.exitsByReason.consumo },
                                { name: 'Doação', value: reportData.exitsByReason.doacao },
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
                        <ArrowUpRight size={18} className="text-rose-600" /> Saídas por Setor (Quantidade por Tipo)
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

                {/* Returns by Sector - Devoluções por Setor */}
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-amber-100/80 shadow-sm hover:shadow-md transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                    <div>
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <RotateCcw size={18} className="text-amber-600" /> Devoluções por Setor
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
                      <p className="text-sm font-black text-slate-800">Nenhuma devolução registrada no período</p>
                      <p className="text-xs text-slate-500 max-w-sm mt-1 font-medium">Os materiais que forem devolvidos pelos setores ao almoxarifado no período selecionado aparecerão consolidados neste gráfico.</p>
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
                        <BarChart3 size={18} className="text-indigo-600" /> Comparativo: Contrato vs Extra vs Doação
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
                              name: 'Saídas', 
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
                          <Bar dataKey="doacao" name="Doação" fill="#10b981" radius={[6, 6, 0, 0]} barSize={26} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* Detailed Sector Breakdown - Visible for Admin and Sector Leaders */}
              {(isAdmin || userProfile?.role === 'SETOR' || userProfile?.role === 'LÍDER') && (
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-100/80 shadow-sm lg:col-span-2">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-100">
                    <div>
                      <h4 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-1">
                        <History size={20} className="text-blue-600" /> 
                        Relatório Detalhado de Consumo por Item
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        {isAdmin ? (reportSectorFilter === 'all' ? 'Todos os Setores' : `Setor: ${reportSectorFilter}`) : `Setor: ${selectedSector}`} • {format(parseISO(reportRange.start), 'dd/MM/yyyy')} a {format(parseISO(reportRange.end), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {isAdmin && (
                        <div className="text-right mr-2 hidden sm:block">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total de Saídas</p>
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
                              Nenhuma saída registrada para este período ou setor selecionado.
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
                            Relatório Oficial Dispensação
                          </span>
                          <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {quantitativoSource === 'sample' ? 'Exemplo Oficial Sobral' : 'Dados do Sistema'}
                          </span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                          Quantitativo de Materiais por Setor
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                          Gere o documento oficial com gráfico e análise crítica para apresentação gerencial e fiscal referente à categoria selecionada.
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
                          <Edit2 size={15} /> {isEditingQuantitativoAnalysis ? 'Concluir Edição' : 'Editar Análise Crítica'}
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
                          <option value="system">Dados Reais do Sistema (Padrão)</option>
                          <option value="sample">Exemplo Demonstrativo</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Período de Referência
                        </label>
                        <select
                          value={quantitativoPeriodPreset}
                          onChange={(e) => setQuantitativoPeriodPreset(e.target.value as any)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="1_semestre_2026">1º Semestre de 2026 (Jan - Jun)</option>
                          <option value="2_semestre_2026">2º Semestre de 2026 (Jul - Dez)</option>
                          <option value="ano_2026">Ano Completo de 2026 (Total)</option>
                          <option value="custom">Período Personalizado</option>
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
                          <option value="Material Médico-Hospitalar">Material Médico-Hospitalar</option>
                          <option value="Medicamentos">Medicamentos</option>
                          <option value="Alimentício">Alimentício</option>
                          <option value="Expediente">Expediente / Papelaria</option>
                          <option value="Higiene e Limpeza">Higiene e Limpeza</option>
                          <option value="Odontológico">Odontológico</option>
                          <option value="Radiológico">Radiológico</option>
                          <option value="EPI e Segurança">EPI e Segurança</option>
                          <option value="Informática">Informática / TI</option>
                          <option value="Copa & Cozinha">Copa & Cozinha</option>
                          <option value="Manutenção">Manutenção</option>
                          <option value="Todos">Todos os Materiais (Total Geral)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Título do Documento
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
                            Texto da Análise Crítica (Gerada pelo Gráfico / Editável)
                          </label>
                          <button
                            type="button"
                            onClick={() => setQuantitativoCriticalAnalysis('')}
                            className="text-[10px] font-bold text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <RotateCcw size={10} /> Recalcular Automático pelo Gráfico
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={quantitativoCriticalAnalysis !== '' ? quantitativoCriticalAnalysis : quantitativoReportData.criticalAnalysis}
                          onChange={(e) => setQuantitativoCriticalAnalysis(e.target.value)}
                          placeholder="Digite ou edite o texto da Análise Crítica do relatório..."
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

                      {/* Análise Crítica Section */}
                      <div className="pt-3 border-t-2 border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2" style={{ color: '#0f172a' }}>
                            <BarChart3 size={15} style={{ color: '#334155' }} />
                            Análise Crítica:
                          </h3>
                          <button
                            data-pdf-hide="true"
                            type="button"
                            onClick={() => setIsEditingQuantitativoAnalysis(!isEditingQuantitativoAnalysis)}
                            className="text-[10px] font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 transition-all print:hidden"
                          >
                            <Edit2 size={12} />
                            {isEditingQuantitativoAnalysis ? 'Salvar Edição' : 'Editar Análise'}
                          </button>
                        </div>

                        {isEditingQuantitativoAnalysis ? (
                          <div className="space-y-2">
                            <textarea
                              rows={6}
                              value={quantitativoCriticalAnalysis !== '' ? quantitativoCriticalAnalysis : quantitativoReportData.criticalAnalysis}
                              onChange={(e) => setQuantitativoCriticalAnalysis(e.target.value)}
                              placeholder="Digite ou edite o texto da Análise Crítica..."
                              className="w-full p-3 border border-slate-300 rounded-xl text-xs font-medium leading-relaxed focus:ring-2 focus:ring-slate-400/20"
                              style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1' }}
                            />
                            <div data-pdf-hide="true" className="text-[10px] text-slate-500 font-bold flex flex-wrap justify-between items-center gap-2 print:hidden">
                              <span>* O texto acima será impresso no relatório oficial em PDF.</span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setQuantitativoCriticalAnalysis('')}
                                  className="text-slate-700 hover:underline flex items-center gap-1 font-bold"
                                >
                                  <RotateCcw size={10} /> Recalcular pelo Gráfico
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingQuantitativoAnalysis(false)}
                                  className="text-slate-900 underline font-black hover:text-slate-950"
                                >
                                  Concluir Edição
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => setIsEditingQuantitativoAnalysis(true)}
                            title="Clique para editar o texto da Análise Crítica"
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
                          Policlínica de Sobral. Av. Monsenhor Aloísio Pinto, 481, Dom Expedito CEP 62050-255, Sobral Ceará.
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
                            Personalização Institucional
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
                          Anexo de Papel Timbrado dos Relatórios
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-2xl">
                          Anexe a imagem oficial do papel timbrado do órgão ou instituição (contendo cabeçalho, logomarcas e rodapé). A imagem anexada será inserida automaticamente no topo de <strong>todos os relatórios exportados em PDF</strong> (Estoque, Catálogo, Solicitações, PCA, Termos de Doação e Recibos).
                        </p>
                      </div>

                      {letterheadImage && (
                        <button
                          onClick={() => handleExportInventoryPDF()}
                          className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center gap-2 hover:bg-slate-800 transition-all shadow-sm shrink-0"
                        >
                          <Download size={15} /> Testar Exportação PDF
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
                                <p className="text-[10px] text-slate-500 font-medium">Sincronizado e pronto para emissão</p>
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
                            <li>Utilize imagens em alta resolução com fundo branco ou transparente.</li>
                            <li>O timbrado é posicionado no cabeçalho superior de cada página gerada.</li>
                            <li>Sua alteração é salva imediatamente para todos os administradores.</li>
                          </ul>
                        </div>
                      </div>

                      {/* Live A4 Preview Simulation */}
                      <div className="lg:col-span-7 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                            Pré-visualização da Folha A4 com Timbrado
                          </label>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2.5 py-0.5 rounded-md">
                            Proporção A4
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
                                    Cabeçalho do Timbrado Oficial
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
                              <span>Relatório Oficial do Sistema</span>
                              <span>Página 1 de 1</span>
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
                <h3 className="text-2xl font-black">Gerenciamento de Usuários</h3>
                <button 
                  onClick={() => setIsRegistering(true)}
                  className="bg-[#1C1917] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-[#292524] transition-all shadow-lg"
                >
                  <Plus size={20} /> Novo Usuário
                </button>
              </div>

              {isRegistering && (
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm max-w-2xl">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-lg font-bold">Cadastrar Novo Usuário</h4>
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
                          placeholder="Nome do funcionário"
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
                        <><Save size={20} /> Salvar Usuário</>
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
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
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
                  <h3 className="font-bold text-[#1C1917]">Itens Excluídos</h3>
                </div>
                <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Item</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Excluído em</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Excluído por</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
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
                  <h3 className="font-bold text-[#1C1917]">Solicitações Excluídas</h3>
                </div>
                <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Solicitação</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Excluído em</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Excluído por</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E5E4]">
                      {requests.filter(r => r.deletedAt).map(req => (
                        <tr key={req.id} className="hover:bg-[#FAFAF9] transition-all">
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm">#{req.id.slice(-5).toUpperCase()}</p>
                            <p className="text-xs text-[#A8A29E]">{req.sector}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-[#57534E]">
                            {req.deletedAt && new Date(req.deletedAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#78716C]">
                            {req.deletedBy || '---'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={async () => {
                                if (window.confirm('Deseja restaurar esta solicitação?')) {
                                  await updateDoc(doc(db, 'requests', req.id), { 
                                    deletedAt: deleteField(),
                                    deletedBy: deleteField()
                                  });
                                  setToast({ show: true, message: 'Solicitação restaurada!', type: 'success' });
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
                  {requests.filter(r => r.deletedAt).length === 0 && (
                    <div className="p-12 text-center">
                      <p className="text-[#A8A29E] text-sm">Nenhuma solicitação na lixeira.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Deleted Transactions */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <History className="text-[#78716C]" size={20} />
                  <h3 className="font-bold text-[#1C1917]">Movimentações Excluídas</h3>
                </div>
                <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Movimentação</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Excluído em</th>
                        <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E5E4]">
                      {transactions.filter(t => t.deletedAt).map(trans => (
                        <tr key={trans.id} className="hover:bg-[#FAFAF9] transition-all">
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm">{trans.item_name}</p>
                            <p className="text-xs text-[#A8A29E]">{trans.type === 'entry' ? 'Entrada' : 'Saída'} - {trans.quantity} un.</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-[#57534E]">
                            {trans.deletedAt && new Date(trans.deletedAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={async () => {
                                if (window.confirm('Deseja restaurar esta movimentação?')) {
                                  await updateDoc(doc(db, 'transactions', trans.id), { 
                                    deletedAt: deleteField()
                                  });
                                  setToast({ show: true, message: 'Movimentação restaurada!', type: 'success' });
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
                  {transactions.filter(t => t.deletedAt).length === 0 && (
                    <div className="p-12 text-center">
                      <p className="text-[#A8A29E] text-sm">Nenhuma movimentação na lixeira.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'requests' && isAdmin && (
            <motion.div 
              key="requests"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Nº / Data</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Setor</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Itens</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E5E4]">
                    {requests.filter(req => !req.deletedAt && !req.isReturn).map(req => (
                      <tr key={req.id} className="hover:bg-[#FAFAF9] transition-all">
                        <td className="px-6 py-4">
                          <p className="font-bold text-sm">#{req.id.slice(-5).toUpperCase()}</p>
                          <p className="text-xs text-[#A8A29E]">{new Date(req.date).toLocaleDateString('pt-BR')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: `${SECTOR_COLORS[req.sector]}20`, color: SECTOR_COLORS[req.sector] }}>
                            {req.sector}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest border ${
                            req.status === 'PENDENTE' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                            req.status === 'EM_SEPARACAO' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                            req.status === 'APROVADO' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                            req.status === 'ENTREGUE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                            req.status === 'RECUSADO' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                            req.status === 'DEVOLUCAO_PENDENTE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            req.status === 'DEVOLUCAO_APROVADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            req.status === 'DEVOLUCAO_RECUSADA' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>
                            {req.status === 'EM_SEPARACAO' ? 'EM SEPARAÇÃO' : 
                             req.status === 'DEVOLUCAO_PENDENTE' ? 'DEVOLUÇÃO PENDENTE' :
                             req.status === 'DEVOLUCAO_APROVADA' ? 'DEVOLUÇÃO APROVADA' :
                             req.status === 'DEVOLUCAO_RECUSADA' ? 'DEVOLUÇÃO RECUSADA' :
                             req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-[#57534E]">
                            {allRequestItems.filter(ri => ri.request_id === req.id).length} itens solicitados
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button 
                              onClick={() => setShowRequestDetailModal({ show: true, request: req })}
                              className="bg-[#1C1917] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#292524] transition-all"
                            >
                              Ver Detalhes
                            </button>
                            {isAdmin && req.status !== 'ENTREGUE' && (
                              <button 
                                onClick={() => handleDeleteRequest(req.id)}
                                className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                                title="Excluir"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {requests.filter(req => !req.deletedAt && !req.isReturn).length === 0 && (
                  <div className="p-20 text-center">
                    <FileText className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                    <p className="text-[#78716C]">Nenhuma solicitação encontrada.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'admin-devolutions' && isAdmin && (
            <motion.div 
              key="admin-devolutions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#E7E5E4]">
                  <h3 className="text-lg font-black">Solicitações de Devolução pendentes de aprovação</h3>
                  <p className="text-xs text-[#78716C]">Visualize e aprove o retorno de materiais ao estoque.</p>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-b border-[#E7E5E4]">
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Nº / Data</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Setor</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Motivo</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Itens</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E5E4]">
                    {requests.filter(req => !req.deletedAt && req.isReturn).map(req => (
                      <tr key={req.id} className="hover:bg-[#FAFAF9] transition-all">
                        <td className="px-6 py-4">
                          <p className="font-bold text-sm">#{req.id.slice(-5).toUpperCase()}</p>
                          <p className="text-xs text-[#A8A29E]">{new Date(req.date).toLocaleDateString('pt-BR')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: `${SECTOR_COLORS[req.sector]}20`, color: SECTOR_COLORS[req.sector] }}>
                            {req.sector}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest border ${
                            req.status === 'DEVOLUCAO_PENDENTE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            req.status === 'DEVOLUCAO_APROVADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            req.status === 'DEVOLUCAO_RECUSADA' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>
                            {req.status === 'DEVOLUCAO_PENDENTE' ? 'PENDENTE' :
                             req.status === 'DEVOLUCAO_APROVADA' ? 'APROVADA' :
                             req.status === 'DEVOLUCAO_RECUSADA' ? 'RECUSADA' :
                             req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg">
                            {req.returnReason || 'Não especificado'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-[#57534E]">
                            {allRequestItems.filter(ri => ri.request_id === req.id).length} itens a devolver
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button 
                              onClick={() => setShowRequestDetailModal({ show: true, request: req })}
                              className="bg-[#1C1917] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#292524] transition-all"
                            >
                              Ver Detalhes e Aprovar
                            </button>
                            {isAdmin && (
                              <button 
                                onClick={() => handleDeleteRequest(req.id)}
                                className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                                title="Excluir"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {requests.filter(req => !req.deletedAt && req.isReturn).length === 0 && (
                  <div className="p-20 text-center">
                    <RotateCcw className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                    <p className="text-[#78716C] font-bold">Nenhuma devolução encontrada.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'my-requests' && (
            <motion.div 
              key="my-requests"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Nº / Data</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Itens</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E5E4]">
                    {requests.filter(r => r.sector === selectedSector && !r.deletedAt).map(req => (
                      <tr key={req.id} className="hover:bg-[#FAFAF9] transition-all">
                        <td className="px-6 py-4">
                          <p className="font-bold text-sm">#{req.id.slice(-5).toUpperCase()}</p>
                          <p className="text-xs text-[#A8A29E]">{new Date(req.date).toLocaleDateString('pt-BR')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest border ${
                            req.status === 'PENDENTE' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                            req.status === 'EM_SEPARACAO' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                            req.status === 'APROVADO' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                            req.status === 'ENTREGUE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                            req.status === 'RECUSADO' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                            req.status === 'DEVOLUCAO_PENDENTE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            req.status === 'DEVOLUCAO_APROVADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            req.status === 'DEVOLUCAO_RECUSADA' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>
                            {req.status === 'EM_SEPARACAO' ? 'EM SEPARAÇÃO' : 
                             req.status === 'DEVOLUCAO_PENDENTE' ? 'DEVOLUÇÃO PENDENTE' :
                             req.status === 'DEVOLUCAO_APROVADA' ? 'DEVOLUÇÃO APROVADA' :
                             req.status === 'DEVOLUCAO_RECUSADA' ? 'DEVOLUÇÃO RECUSADA' :
                             req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-[#57534E]">
                            {allRequestItems.filter(ri => ri.request_id === req.id).length} itens
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button 
                              onClick={() => setShowRequestDetailModal({ show: true, request: req })}
                              className="bg-[#1C1917] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#292524] transition-all"
                            >
                              Ver Detalhes
                            </button>
                            {req.status === 'PENDENTE' && (
                              <>
                                <button 
                                  onClick={() => handleEditRequest(req)}
                                  className="p-2 text-blue-400 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all"
                                  title="Editar Solicitação"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteRequest(req.id)}
                                  className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                                  title="Excluir Solicitação"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {requests.filter(r => r.sector === selectedSector).length === 0 && (
                  <div className="p-20 text-center">
                    <FileText className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                    <p className="text-[#78716C]">Você ainda não fez nenhuma solicitação.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'leader-stats' && (
            <motion.div 
              key="leader-stats"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Top Requested */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-amber-100 p-2 rounded-xl">
                      <TrendingUp className="text-amber-600" size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black">Top 10 Mais Solicitados</h3>
                      <p className="text-xs text-[#78716C] font-medium uppercase tracking-wider">Baseado na quantidade solicitada</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {leaderStatistics.topRequested.map((item, index) => (
                      <div key={item.name} className="flex items-center gap-4 group">
                        <div className="w-8 h-8 flex items-center justify-center bg-[#F5F5F4] rounded-lg text-xs font-black text-[#78716C]">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#1C1917] line-clamp-1">{item.name}</p>
                          <div className="w-full h-1.5 bg-[#F5F5F4] rounded-full mt-1.5 overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${leaderStatistics.topRequested[0]?.qty ? (item.qty / leaderStatistics.topRequested[0].qty) * 100 : 0}%` }}
                              className="h-full bg-amber-500 rounded-full"
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-[#1C1917]">{item.qty}</p>
                          <p className="text-[10px] font-bold text-[#A8A29E] uppercase">Unidades</p>
                        </div>
                      </div>
                    ))}
                    {leaderStatistics.topRequested.length === 0 && (
                      <p className="text-center py-8 text-[#A8A29E] text-sm">Sem dados suficientes.</p>
                    )}
                  </div>
                </div>

                {/* Top Delivered */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-emerald-100 p-2 rounded-xl">
                      <CheckCircle className="text-emerald-600" size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black">Top 10 Mais Entregues</h3>
                      <p className="text-xs text-[#78716C] font-medium uppercase tracking-wider">Baseado na quantidade aprovada e entregue</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {leaderStatistics.topDelivered.map((item, index) => (
                      <div key={item.name} className="flex items-center gap-4 group">
                        <div className="w-8 h-8 flex items-center justify-center bg-[#F5F5F4] rounded-lg text-xs font-black text-[#78716C]">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#1C1917] line-clamp-1">{item.name}</p>
                          <div className="w-full h-1.5 bg-[#F5F5F4] rounded-full mt-1.5 overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${leaderStatistics.topDelivered[0]?.qty ? (item.qty / leaderStatistics.topDelivered[0].qty) * 100 : 0}%` }}
                              className="h-full bg-emerald-500 rounded-full"
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-[#1C1917]">{item.qty}</p>
                          <p className="text-[10px] font-bold text-[#A8A29E] uppercase">Unidades</p>
                        </div>
                      </div>
                    ))}
                    {leaderStatistics.topDelivered.length === 0 && (
                      <p className="text-center py-8 text-[#A8A29E] text-sm">Sem dados suficientes.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'new-request' && (
            <motion.div 
              key="new-request"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-black">
                    {editingRequest ? 'Editar Solicitação' : 'Nova Solicitação'}
                  </h3>
                  {editingRequest && (
                    <button 
                      onClick={() => {
                        setEditingRequest(null);
                        setRequestBasket([]);
                        setRequestObservation('');
                        setActiveTab('my-requests');
                      }}
                      className="text-xs font-bold text-rose-600 hover:underline"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-[#A8A29E] uppercase tracking-widest mb-2">Setor Solicitante</label>
                    <input 
                      type="text" 
                      value={selectedSector || ''} 
                      disabled 
                      className="w-full px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-2xl font-bold text-[#78716C]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A8A29E] uppercase tracking-widest mb-2">Adicionar Item</label>
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8A29E]" size={18} />
                        <input 
                          type="text" 
                          placeholder="Digite o nome do material..."
                          className="w-full pl-12 pr-4 py-4 bg-white border border-[#E7E5E4] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1C1917]/10 font-bold transition-all"
                          value={requestSearchTerm}
                          onChange={(e) => setRequestSearchTerm(e.target.value)}
                        />
                      </div>

                      {requestSearchTerm.length >= 2 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#E7E5E4] rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto overflow-x-hidden"
                        >
                          {(() => {
                            const allActiveGroups: Record<string, {name: string, category: string, id: string}> = {};
                            items.filter(i => !i.deletedAt && i.quantity > 0).forEach(i => {
                              if (!allActiveGroups[i.name]) {
                                allActiveGroups[i.name] = { name: i.name, category: i.category || 'Outros', id: i.id };
                              }
                            });

                            const filtered = Object.values(allActiveGroups)
                            .filter(group => normalizeString(group.name).includes(normalizeString(requestSearchTerm)))
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .slice(0, 15);

                            if (filtered.length === 0) {
                              return (
                                <div className="p-8 text-center text-[#78716C]">
                                  <p className="text-sm font-medium">Nenhum material encontrado.</p>
                                </div>
                              );
                            }

                            return filtered.map(group => (
                              <button
                                key={group.name}
                                type="button"
                                onClick={() => {
                                  const existing = requestBasket.find(bi => bi.product_name === group.name);
                                  if (existing) {
                                    setRequestBasket(requestBasket.map(bi => bi.product_name === group.name ? { ...bi, quantity: bi.quantity + 1 } : bi));
                                  } else {
                                    setRequestBasket([...requestBasket, { product_id: group.id, product_name: group.name, quantity: 1 }]);
                                  }
                                  setRequestSearchTerm('');
                                }}
                                className="w-full px-6 py-4 text-left hover:bg-[#F5F5F4] transition-all flex items-center justify-between border-b border-[#F5F5F4] last:border-none"
                              >
                                <div>
                                  <p className="font-bold text-[#1C1917]">{group.name}</p>
                                  <p className="text-[10px] text-[#A8A29E] uppercase font-black tracking-widest">{group.category}</p>
                                </div>
                                <div className="flex items-center gap-2 text-emerald-600">
                                  <Plus size={16} />
                                  <span className="text-xs font-bold">Adicionar</span>
                                </div>
                              </button>
                            ));
                          })()}
                        </motion.div>
                      )}
                    </div>
                  </div>

                  {requestBasket.length > 0 && (
                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-[#A8A29E] uppercase tracking-widest">Itens na Cesta</label>
                      {requestBasket.map(item => (
                        <div key={item.product_id} className="flex items-center justify-between p-4 bg-[#FAFAF9] rounded-2xl border border-[#E7E5E4]">
                          <p className="font-bold text-sm">{item.product_name}</p>
                          <div className="flex items-center gap-4">
                            <input 
                              type="number" 
                              min="1"
                              value={item.quantity}
                              onChange={(e) => setRequestBasket(requestBasket.map(bi => bi.product_id === item.product_id ? { ...bi, quantity: parseInt(e.target.value) || 1 } : bi))}
                              className="w-20 px-3 py-1 bg-white border border-[#E7E5E4] rounded-lg text-center font-bold text-sm"
                            />
                            <button 
                              onClick={() => setRequestBasket(requestBasket.filter(bi => bi.product_id !== item.product_id))}
                              className="text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-[#A8A29E] uppercase tracking-widest mb-2">Observação (Opcional)</label>
                    <textarea 
                      value={requestObservation}
                      onChange={(e) => setRequestObservation(e.target.value)}
                      placeholder="Alguma observação importante?"
                      className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1C1917]/10 font-medium min-h-[100px]"
                    />
                  </div>

                  <button 
                    onClick={handleSubmitRequest}
                    disabled={isSubmittingRequest || requestBasket.length === 0}
                    className="w-full py-4 bg-[#1C1917] text-white rounded-2xl font-bold hover:bg-[#292524] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmittingRequest ? 'Enviando...' : <><Save size={20} /> {editingRequest ? 'Salvar Alterações' : 'Enviar Solicitação'}</>}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'devolution' && (
            <motion.div 
              key="devolution"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto space-y-6"
            >
              {/* Refined Banner Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-6 sm:p-8 rounded-3xl border border-amber-200/80 shadow-xs relative overflow-hidden">
                <div className="space-y-1.5 z-10">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-amber-600 text-white shadow-md shadow-amber-500/20">
                      <RotateCcw size={20} />
                    </span>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                      Devolução de Materiais
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-xl">
                    Gerencie o retorno de materiais do setor <strong className="text-amber-700">{selectedSector}</strong> ao almoxarifado de forma simples e organizada.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setDevolutionBasket([]);
                    setSelectedDevProduct('');
                    setDevolutionReason('Não teve uso');
                    setDevolutionObservation('');
                    setShowDevolutionModal({ show: true });
                  }}
                  className="z-10 bg-gradient-to-r from-amber-600 to-amber-700 text-white px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider hover:from-amber-700 hover:to-amber-800 transition-all shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 whitespace-nowrap self-start md:self-auto hover:-translate-y-0.5 active:translate-y-0"
                >
                  <RotateCcw size={16} />
                  Solicitar Devolução
                </button>
              </div>

              {/* Statistics KPI Row */}
              {(() => {
                const devRequests = requests.filter(r => r.sector === selectedSector && r.isReturn && !r.deletedAt);
                const pendingCount = devRequests.filter(r => r.status === 'DEVOLUCAO_PENDENTE').length;
                const approvedCount = devRequests.filter(r => r.status === 'DEVOLUCAO_APROVADA').length;
                const rejectedCount = devRequests.filter(r => r.status === 'DEVOLUCAO_RECUSADA').length;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-white border border-slate-100/80 rounded-2xl p-4 shadow-xs flex items-center gap-3 hover:shadow-md transition-all">
                      <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                        <RotateCcw size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Enviadas</p>
                        <p className="text-xl font-black text-slate-900">{devRequests.length}</p>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-100/80 rounded-2xl p-4 shadow-xs flex items-center gap-3 hover:shadow-md transition-all">
                      <div className="p-3 bg-yellow-50 text-yellow-600 rounded-xl">
                        <Clock size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pendentes</p>
                        <p className="text-xl font-black text-yellow-600">{pendingCount}</p>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-100/80 rounded-2xl p-4 shadow-xs flex items-center gap-3 hover:shadow-md transition-all">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <CheckCircle size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Aprovadas</p>
                        <p className="text-xl font-black text-emerald-600">{approvedCount}</p>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-100/80 rounded-2xl p-4 shadow-xs flex items-center gap-3 hover:shadow-md transition-all">
                      <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                        <X size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Recusadas</p>
                        <p className="text-xl font-black text-rose-600">{rejectedCount}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Modern Segmented Controller */}
              <div className="bg-slate-100/80 p-1.5 rounded-2xl inline-flex flex-wrap gap-1 w-full sm:w-auto border border-slate-200/60">
                <button
                  onClick={() => setDevolutionSubTab('my_returns')}
                  className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    devolutionSubTab === 'my_returns'
                      ? 'bg-white text-amber-700 shadow-sm border border-amber-100/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Minhas Devoluções
                </button>
                <button
                  onClick={() => setDevolutionSubTab('sector_stock')}
                  className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    devolutionSubTab === 'sector_stock'
                      ? 'bg-white text-amber-700 shadow-sm border border-amber-100/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Estoque do Setor ({selectedSector})
                </button>
                <button
                  onClick={() => setDevolutionSubTab('eligible_deliveries')}
                  className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    devolutionSubTab === 'eligible_deliveries'
                      ? 'bg-white text-amber-700 shadow-sm border border-amber-100/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Entregas Elegíveis para Devolução
                </button>
              </div>

              {/* Subtab Content */}
              {devolutionSubTab === 'my_returns' && (
                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="p-6 border-b border-slate-100">
                    <h3 className="text-base font-black text-slate-900">Histórico de Solicitações de Devolução</h3>
                    <p className="text-xs text-slate-500 font-medium">Acompanhe o andamento e o parecer das solicitações de devolução do seu setor.</p>
                  </div>

                  <div className="p-4 sm:p-6 space-y-3">
                    {requests
                      .filter(r => r.sector === selectedSector && r.isReturn && !r.deletedAt)
                      .map(req => {
                        const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
                        return (
                          <div 
                            key={req.id} 
                            className="bg-slate-50/60 border border-slate-200/60 hover:border-amber-200 rounded-2xl p-4 sm:p-5 transition-all hover:bg-amber-50/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-2 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-xs text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                                  #{req.id.slice(-5).toUpperCase()}
                                </span>
                                <span className="text-xs text-slate-500 font-semibold">
                                  • {new Date(req.date).toLocaleDateString('pt-BR')}
                                </span>
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider border ${
                                  req.status === 'DEVOLUCAO_PENDENTE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  req.status === 'DEVOLUCAO_APROVADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  req.status === 'DEVOLUCAO_RECUSADA' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                  'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  {req.status === 'DEVOLUCAO_PENDENTE' ? 'PENDENTE' :
                                   req.status === 'DEVOLUCAO_APROVADA' ? 'APROVADO' :
                                   req.status === 'DEVOLUCAO_RECUSADA' ? 'RECUSADO' :
                                   req.status}
                                </span>
                                {req.returnReason && (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-md">
                                    Motivo: {req.returnReason}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {reqItems.map(item => (
                                  <span key={item.id} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 shadow-2xs">
                                    {item.product_name} <strong className="text-amber-700">({item.quantity_requested})</strong>
                                  </span>
                                ))}
                              </div>

                              {req.observation && (
                                <p className="text-xs text-slate-500 italic bg-white/60 p-2 rounded-xl border border-slate-100">
                                  "{req.observation}"
                                </p>
                              )}
                            </div>

                            <button 
                              onClick={() => setShowRequestDetailModal({ show: true, request: req })}
                              className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-xs self-end sm:self-center whitespace-nowrap"
                            >
                              Ver Detalhes
                            </button>
                          </div>
                        );
                      })}

                    {requests.filter(r => r.sector === selectedSector && r.isReturn && !r.deletedAt).length === 0 && (
                      <div className="p-12 text-center text-slate-500 space-y-2">
                        <RotateCcw className="mx-auto text-slate-300" size={40} />
                        <p className="font-bold text-sm text-slate-700">Nenhuma solicitação de devolução enviada.</p>
                        <p className="text-xs text-slate-500">Utilize o botão acima "Solicitar Devolução" para registrar o retorno de algum material ao almoxarifado.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {devolutionSubTab === 'sector_stock' && (
                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="p-6 border-b border-slate-100">
                    <h3 className="text-base font-black text-slate-900">Itens em Estoque no Setor ({selectedSector})</h3>
                    <p className="text-xs text-slate-500 font-medium">Selecione qualquer material guardado neste setor (inclusive vencidos) para devolver ao almoxarifado.</p>
                  </div>

                  <div className="p-4 sm:p-6 space-y-3">
                    {(() => {
                      const currentSectorStock = items.filter(i => 
                        !i.deletedAt && 
                        (i.location === selectedSector || (selectedSector === 'Farmácia' && i.location === 'Farmácia')) && 
                        i.quantity > 0
                      );

                      if (currentSectorStock.length === 0) {
                        return (
                          <div className="p-12 text-center text-slate-500 space-y-2">
                            <Package className="mx-auto text-slate-300" size={40} />
                            <p className="font-bold text-sm text-slate-700">Nenhum item em estoque no setor.</p>
                            <p className="text-xs text-slate-500">Quando a farmácia/setor possuir saldo em estoque, os itens aparecerão aqui para devolução imediata.</p>
                          </div>
                        );
                      }

                      return currentSectorStock.map(item => {
                        const expired = isExpired(item);
                        const nearExpiry = isNearExpiry(item);

                        return (
                          <div 
                            key={item.id} 
                            className={`border rounded-2xl p-4 sm:p-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                              expired 
                                ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300' 
                                : nearExpiry 
                                ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300' 
                                : 'bg-slate-50/60 border-slate-200/60 hover:border-amber-200'
                            }`}
                          >
                            <div className="space-y-1.5 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-sm text-slate-900">{item.name}</span>
                                {item.category && (
                                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                    {item.category}
                                  </span>
                                )}
                                {expired ? (
                                  <span className="text-[10px] font-black text-rose-700 bg-rose-100 border border-rose-300 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                    <AlertTriangle size={12} /> Vencido
                                  </span>
                                ) : nearExpiry ? (
                                  <span className="text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                    <AlertTriangle size={12} /> Validade Próxima
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Em dia
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-slate-500 font-medium">
                                Quantidade no Estoque: <span className="font-bold text-slate-900">{item.quantity} {item.unit_measure || 'unid'}</span>
                                {item.batch_number && (
                                  <> • Lote: <span className="font-bold text-slate-700">{item.batch_number}</span></>
                                )}
                                {item.expiry_date && item.expiry_date !== 'Indeterminada' && (
                                  <> • Validade: <span className={`font-bold ${expired ? 'text-rose-600' : 'text-slate-700'}`}>{new Date(item.expiry_date).toLocaleDateString('pt-BR')}</span></>
                                )}
                              </p>
                            </div>

                            <button 
                              onClick={() => {
                                setDevolutionBasket([{
                                  product_id: item.id,
                                  product_name: item.name,
                                  quantity: item.quantity,
                                  maxQty: item.quantity,
                                  selectedBatchId: item.id
                                }]);
                                setDevolutionReason(expired ? 'Vencido' : 'Não teve uso');
                                setDevolutionObservation(expired ? `Material vencido em ${new Date(item.expiry_date).toLocaleDateString('pt-BR')}` : '');
                                setShowDevolutionModal({ show: true });
                              }}
                              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all shadow-xs self-end sm:self-center whitespace-nowrap flex items-center gap-1.5 ${
                                expired 
                                  ? 'bg-rose-600 hover:bg-rose-700 text-white' 
                                  : 'bg-amber-600 hover:bg-amber-700 text-white'
                              }`}
                            >
                              <RotateCcw size={14} /> Devolver ao Almoxarifado
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {devolutionSubTab === 'eligible_deliveries' && (
                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="p-6 border-b border-slate-100">
                    <h3 className="text-base font-black text-slate-900">Entregas Realizadas ao Setor</h3>
                    <p className="text-xs text-slate-500 font-medium">Selecione uma das entregas recebidas abaixo para selecionar itens e devolver.</p>
                  </div>

                  <div className="p-4 sm:p-6 space-y-3">
                    {requests
                      .filter(r => r.sector === selectedSector && r.status === 'ENTREGUE' && !r.deletedAt)
                      .map(req => {
                        const reqItems = allRequestItems.filter(ri => ri.request_id === req.id);
                        return (
                          <div 
                            key={req.id} 
                            className="bg-slate-50/60 border border-slate-200/60 hover:border-amber-200 rounded-2xl p-4 sm:p-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-xs text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                                  Entrega #{req.id.slice(-5).toUpperCase()}
                                </span>
                                <span className="text-xs text-slate-500 font-semibold">
                                  • {req.deliveredAt 
                                    ? `Entregue em: ${new Date(req.deliveredAt).toLocaleDateString('pt-BR')}` 
                                    : `Criada em: ${new Date(req.date).toLocaleDateString('pt-BR')}`}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {reqItems.map(item => {
                                  const alreadyReturned = item.quantity_returned || 0;
                                  const remaining = item.quantity_approved - alreadyReturned;
                                  return (
                                    <span 
                                      key={item.id} 
                                      className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                                        remaining <= 0 
                                          ? 'bg-slate-100 text-slate-400 line-through border-slate-200' 
                                          : 'bg-white text-slate-800 border-amber-200/80 shadow-2xs'
                                      }`}
                                    >
                                      {item.product_name} ({remaining}/{item.quantity_approved} disp.)
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                            <button 
                              onClick={() => {
                                const basketItems = reqItems.map(ri => {
                                  const alreadyReturned = ri.quantity_returned || 0;
                                  const remaining = ri.quantity_approved - alreadyReturned;
                                  const productBatches = items.filter(item => !item.deletedAt && item.name === ri.product_name);
                                  return {
                                    product_id: ri.product_id,
                                    product_name: ri.product_name,
                                    quantity: remaining,
                                    maxQty: remaining,
                                    selectedBatchId: ri.batch_id || productBatches[0]?.id || ''
                                  };
                                }).filter(item => item.quantity > 0);

                                if (basketItems.length === 0) {
                                  showToast("Todos os itens desta entrega já foram totalmente devolvidos.", "info");
                                  return;
                                }

                                setDevolutionBasket(basketItems);
                                setDevolutionReason('Não teve uso');
                                setDevolutionObservation('');
                                setShowDevolutionModal({ show: true, request: req });
                              }}
                              className="bg-amber-600 text-white px-4 py-2.5 rounded-xl text-xs font-black hover:bg-amber-700 transition-all shadow-sm whitespace-nowrap self-end sm:self-center"
                            >
                              Devolver Materiais
                            </button>
                          </div>
                        );
                      })}

                    {requests.filter(r => r.sector === selectedSector && r.status === 'ENTREGUE' && !r.deletedAt).length === 0 && (
                      <div className="p-12 text-center text-slate-500 space-y-2">
                        <RotateCcw className="mx-auto text-slate-300" size={40} />
                        <p className="font-bold text-sm text-slate-700">Nenhuma entrega elegível encontrada.</p>
                        <p className="text-xs text-slate-500">Seu setor precisa ter entregas concluídas ("ENTREGUE") no sistema para devolvê-las ao estoque.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-5xl rounded-[40px] p-10 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-3xl font-black text-[#1C1917]">Entrada de Materiais</h3>
                <p className="text-[#78716C] font-medium">Cadastre múltiplos itens de uma vez</p>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-[#F5F5F4] rounded-full transition-colors"
              >
                <X size={24} className="text-[#A8A29E]" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="space-y-8">
              {/* Common Fields Section */}
              <div className="bg-[#FAFAF9] p-8 rounded-[32px] border border-[#E7E5E4] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1">
                  <label className="block text-xs font-black text-[#78716C] uppercase tracking-widest mb-2">Fornecedor</label>
                  <input 
                    required
                    list="supplier-suggestions"
                    type="text" 
                    placeholder="Nome do fornecedor"
                    className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                    value={bulkEntry.supplier}
                    onChange={e => setBulkEntry({...bulkEntry, supplier: e.target.value.toUpperCase()})}
                  />
                </div>
                
                <div className="lg:col-span-1">
                  <label className="block text-xs font-black text-[#78716C] uppercase tracking-widest mb-2">Tipo de Item (Categoria)</label>
                  <div className="flex gap-2">
                    {showNewCategoryInput ? (
                      <div className="flex-1 flex gap-2">
                        <input 
                          type="text"
                          className="flex-1 px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                          placeholder="Nova..."
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          autoFocus
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            if (newCategoryName.trim()) {
                              setCategories(prev => Array.from(new Set([...prev, newCategoryName.trim()])));
                              setBulkEntry({...bulkEntry, category: newCategoryName.trim()});
                              setNewCategoryName('');
                              setShowNewCategoryInput(false);
                            }
                          }}
                          className="bg-[#1C1917] text-white p-3 rounded-xl"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <select 
                          className="flex-1 px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                          value={bulkEntry.category}
                          onChange={e => setBulkEntry({...bulkEntry, category: e.target.value})}
                        >
                          {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => setShowNewCategoryInput(true)}
                          className="bg-white text-[#1C1917] p-3 rounded-xl border border-[#E7E5E4] hover:bg-[#F5F5F4]"
                        >
                          <Plus size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-1">
                  <label className="block text-xs font-black text-[#78716C] uppercase tracking-widest mb-2">Origem</label>
                  <select 
                    className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                    value={bulkEntry.origin}
                    onChange={e => setBulkEntry({...bulkEntry, origin: e.target.value as any})}
                  >
                    <option value="contract">Contrato</option>
                    <option value="extra">Produto Extra</option>
                    <option value="donation">Doação</option>
                  </select>
                </div>
              </div>

              {/* Items List Section */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-[#1C1917] uppercase tracking-widest">Lista de Itens</h4>
                  <button 
                    type="button"
                    onClick={addBulkItemRow}
                    className="text-xs font-bold bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl border border-emerald-100 flex items-center gap-2 hover:bg-emerald-100 transition-all"
                  >
                    <Plus size={14} /> Adicionar Outro Item
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-left">
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest min-w-[180px] md:min-w-[240px]">Nome do Item</th>
                        {bulkEntry.category === 'Medicamentos' && (
                          <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-36 min-w-[110px]">Tipo de Material</th>
                        )}
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-36 min-w-[120px]">Unidade / Emb.</th>
                        <th className="px-4 py-2 text-[10px] font-black text-emerald-800 uppercase tracking-widest min-w-[110px] bg-emerald-100/70 rounded-t-xl text-center">Qtd. Entrada</th>
                        <th className="px-4 py-2 text-[10px] font-black text-amber-800 uppercase tracking-widest min-w-[100px] bg-amber-100/70 rounded-t-xl text-center">Estoque Mín</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-24">Lote</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-40">Validade</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-28">Preço Un.</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkEntry.items.map((item, index) => (
                        <tr key={item.id} className="group">
                          <td className="px-2 min-w-[180px] md:min-w-[240px]">
                            <input 
                              required
                              list="item-suggestions"
                              type="text"
                              placeholder="Nome do produto"
                              className="w-full px-3 py-2 bg-[#F5F5F4] border-none rounded-lg focus:ring-2 focus:ring-[#1C1917]/10 text-xs text-stone-900 font-bold"
                              value={item.name}
                              onChange={e => updateBulkItem(item.id, 'name', e.target.value)}
                            />
                            {/* Quick unit helpers for medications */}
                            {bulkEntry.category === 'Medicamentos' && (
                              <div className="mt-1.5 flex flex-col gap-1 bg-[#FAFAF9] p-2 rounded-lg border border-[#E7E5E4] max-w-[280px]">
                                <div className="flex flex-wrap gap-1 items-center">
                                  <span className="text-[8px] font-black text-[#78716C] uppercase tracking-wider mr-1">Unidades:</span>
                                  {['mg', 'mcg', 'UI', 'g', 'ml', '%'].map(unit => (
                                    <button
                                      key={unit}
                                      type="button"
                                      onClick={() => {
                                        let currentName = item.name.trim();
                                        if (currentName) {
                                          if (!currentName.endsWith(' ')) {
                                            currentName += ' ';
                                          }
                                          currentName += unit;
                                          updateBulkItem(item.id, 'name', currentName);
                                        }
                                      }}
                                      className="px-1.5 py-0.5 bg-stone-200 hover:bg-[#1C1917] hover:text-white text-stone-700 rounded text-[9px] font-bold transition-all uppercase"
                                    >
                                      +{unit}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-1 items-center">
                                  <span className="text-[8px] font-black text-[#78716C] uppercase tracking-wider mr-1">Dosagem:</span>
                                  {['500 mg', '1000 mg', '1000 UI', '5000 UI', '10.000 UI', '50.000 UI'].map(dose => (
                                    <button
                                      key={dose}
                                      type="button"
                                      onClick={() => {
                                        let currentName = item.name.trim();
                                        if (currentName) {
                                          if (!currentName.endsWith(' ')) {
                                            currentName += ' ';
                                          }
                                          currentName += dose;
                                          updateBulkItem(item.id, 'name', currentName);
                                        }
                                      }}
                                      className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 rounded text-[9px] font-bold transition-all uppercase"
                                    >
                                      +{dose}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                          {bulkEntry.category === 'Medicamentos' && (
                            <td className="px-2 min-w-[110px]">
                              <select 
                                required
                                className="w-full px-3 py-2 bg-[#F5F5F4] border-none rounded-lg focus:ring-2 focus:ring-[#1C1917]/10 text-[11px] text-stone-900 font-bold"
                                value={item.medication_type || ''}
                                onChange={e => updateBulkItem(item.id, 'medication_type', e.target.value)}
                              >
                                <option value="">Selecione...</option>
                                <option value="PORTARIA 344">PORTARIA 344</option>
                                <option value="COMPRIMIDO">COMPRIMIDO</option>
                                <option value="AMPOLA">AMPOLA</option>
                                <option value="SOLUÇÃO">SOLUÇÃO</option>
                                <option value="SOLUÇÃO SPRAY">SOLUÇÃO SPRAY</option>
                                <option value="POMADA">POMADA</option>
                                <option value="GOTA">GOTA</option>
                                <option value="COLÍRIO">COLÍRIO</option>
                              </select>
                            </td>
                          )}
                          <td className="px-2 min-w-[140px]">
                            <select 
                              required
                              className="w-full px-3 py-2 bg-[#F5F5F4] border-none rounded-lg focus:ring-2 focus:ring-[#1C1917]/10 text-xs text-stone-900 font-bold"
                              value={
                                ['Unidade (UN)', 'Pacote (PCT)', 'Caixa (CX)', 'Frasco (FR)', 'Ampola (AMP)', 'Bisnaga (BSG)', 'Envelope (ENV)', 'Galão (GL)', 'Rolo (RL)', 'Par (PR)', 'Metro (M)', 'Quilo (KG)', 'Litro (L)', 'Resma'].includes(item.unit_measure || '')
                                  ? (item.unit_measure || 'Unidade (UN)')
                                  : 'Outro'
                              }
                              onChange={e => {
                                const val = e.target.value;
                                if (val === 'Outro') {
                                  updateBulkItem(item.id, 'unit_measure', '');
                                } else {
                                  updateBulkItem(item.id, 'unit_measure', val);
                                }
                              }}
                            >
                              <option value="Unidade (UN)">Unidade (UN)</option>
                              <option value="Pacote (PCT)">Pacote (PCT)</option>
                              <option value="Caixa (CX)">Caixa (CX)</option>
                              <option value="Frasco (FR)">Frasco (FR)</option>
                              <option value="Ampola (AMP)">Ampola (AMP)</option>
                              <option value="Bisnaga (BSG)">Bisnaga (BSG)</option>
                              <option value="Envelope (ENV)">Envelope (ENV)</option>
                              <option value="Galão (GL)">Galão (GL)</option>
                              <option value="Rolo (RL)">Rolo (RL)</option>
                              <option value="Par (PR)">Par (PR)</option>
                              <option value="Metro (M)">Metro (M)</option>
                              <option value="Quilo (KG)">Quilo (KG)</option>
                              <option value="Litro (L)">Litro (L)</option>
                              <option value="Resma">Resma</option>
                              <option value="Outro">Outro (digitar...)</option>
                            </select>
                            {!['Unidade (UN)', 'Pacote (PCT)', 'Caixa (CX)', 'Frasco (FR)', 'Ampola (AMP)', 'Bisnaga (BSG)', 'Envelope (ENV)', 'Galão (GL)', 'Rolo (RL)', 'Par (PR)', 'Metro (M)', 'Quilo (KG)', 'Litro (L)', 'Resma'].includes(item.unit_measure || '') && (
                              <input 
                                type="text"
                                placeholder="Especifique a embalagem..."
                                className="w-full mt-1 px-2.5 py-1 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 font-bold focus:ring-2 focus:ring-[#1C1917]/10"
                                value={item.unit_measure || ''}
                                onChange={e => updateBulkItem(item.id, 'unit_measure', e.target.value)}
                              />
                            )}
                          </td>
                          <td className="px-2 min-w-[110px]">
                            <input 
                              required
                              type="number"
                              min="1"
                              placeholder="Qtd"
                              className="w-full px-3 py-2 bg-emerald-50 border-2 border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm text-emerald-950 font-black shadow-sm text-center"
                              value={isNaN(item.initial_quantity) ? '' : item.initial_quantity}
                              onChange={e => updateBulkItem(item.id, 'initial_quantity', e.target.value === '' ? NaN : parseInt(e.target.value))}
                            />
                          </td>
                          <td className="px-2 min-w-[100px]">
                            <input 
                              required
                              type="number"
                              min="0"
                              placeholder="Mín"
                              className="w-full px-3 py-2 bg-amber-50 border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-sm text-amber-950 font-extrabold text-center"
                              value={isNaN(item.min_quantity) ? '' : item.min_quantity}
                              onChange={e => updateBulkItem(item.id, 'min_quantity', e.target.value === '' ? NaN : parseInt(e.target.value))}
                            />
                          </td>
                          <td className="px-2 w-24">
                            <input 
                              type="text"
                              placeholder="Lote"
                              className="w-full px-3 py-2 bg-[#F5F5F4] border-none rounded-lg focus:ring-2 focus:ring-[#1C1917]/10 text-xs text-stone-900 font-bold"
                              value={item.batch_number}
                              onChange={e => updateBulkItem(item.id, 'batch_number', e.target.value)}
                            />
                          </td>
                          <td className="px-2 w-40">
                            <div className="flex flex-col gap-1">
                              <input 
                                type="date"
                                disabled={item.is_indeterminate_expiry}
                                className="w-full px-3 py-1.5 bg-[#F5F5F4] border-none rounded-lg focus:ring-2 focus:ring-[#1C1917]/10 text-[11px] text-stone-900 font-bold disabled:opacity-30"
                                value={item.expiry_date}
                                onChange={e => updateBulkItem(item.id, 'expiry_date', e.target.value)}
                              />
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input 
                                  type="checkbox"
                                  className="w-3 h-3 rounded border-gray-300 text-[#1C1917]"
                                  checked={item.is_indeterminate_expiry}
                                  onChange={e => updateBulkItem(item.id, 'is_indeterminate_expiry', e.target.checked)}
                                />
                                <span className="text-[9px] font-bold text-[#78716C] uppercase">Indeterminada</span>
                              </label>
                            </div>
                          </td>
                          <td className="px-2 w-28">
                            <input 
                              type="number"
                              step="0.01"
                              placeholder="0,00"
                              className="w-full px-3 py-2 bg-[#F5F5F4] border-none rounded-lg focus:ring-2 focus:ring-[#1C1917]/10 text-xs text-stone-900 font-bold"
                              value={isNaN(item.unit_price) ? '' : item.unit_price}
                              onChange={e => updateBulkItem(item.id, 'unit_price', e.target.value === '' ? NaN : parseFloat(e.target.value))}
                            />
                          </td>
                          <td className="px-2 w-20">
                            <div className="flex items-center gap-1">
                              <button 
                                type="button"
                                onClick={() => duplicateBulkItem(item.id)}
                                className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Duplicar para outro lote"
                              >
                                <Copy size={18} />
                              </button>
                              {bulkEntry.items.length > 1 && (
                                <button 
                                  type="button"
                                  onClick={() => removeBulkItemRow(item.id)}
                                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Remover"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <datalist id="item-suggestions">
                  {Array.from(new Set(items.map(i => i.name))).map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <datalist id="supplier-suggestions">
                  {uniqueSuppliers.map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div className="flex gap-4 pt-6 border-t border-[#E7E5E4]">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-[#78716C] hover:bg-[#F5F5F4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-[2] px-6 py-4 bg-[#1C1917] text-white rounded-2xl font-bold hover:bg-[#292524] transition-all shadow-lg shadow-[#1C1917]/20 flex items-center justify-center gap-3"
                >
                  <Save size={20} /> Finalizar Entrada de {bulkEntry.items.length} Itens
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showRoomInventoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Printer className="text-blue-600" size={24} /> Mapa de Estoque (Porta)
              </h3>
              <button onClick={() => setShowRoomInventoryModal(false)} className="text-[#A8A29E] hover:text-[#1C1917]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-black text-[#78716C] uppercase tracking-widest mb-2 ml-1">Selecione a Sala</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROOMS.map(room => (
                    <button
                      key={room}
                      onClick={() => setSelectedRoom(room)}
                      className={`px-4 py-3 rounded-xl text-xs font-bold border transition-all ${selectedRoom === room ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-[#F5F5F4] text-[#78716C] border-[#E7E5E4] hover:bg-[#E7E5E4]'}`}
                    >
                      {room}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-[#78716C] uppercase tracking-widest mb-2 ml-1">Filtrar Categorias</label>
                <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-[#F5F5F4] rounded-xl border border-[#E7E5E4]">
                  {categories.map(cat => (
                    <label key={cat} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-all">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedRoomCategories.includes(cat)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedRoomCategories([...selectedRoomCategories, cat]);
                          } else {
                            setSelectedRoomCategories(selectedRoomCategories.filter(c => c !== cat));
                          }
                        }}
                      />
                      <span className="text-xs font-bold text-[#44403C]">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowRoomInventoryModal(false)}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-[#78716C] hover:bg-[#F5F5F4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    handleExportRoomInventoryPDF(selectedRoom, customRoomName, selectedRoomCategories);
                    setShowRoomInventoryModal(false);
                  }}
                  className="flex-[2] px-6 py-4 bg-[#1C1917] text-white rounded-2xl font-bold hover:bg-[#292524] transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-3"
                >
                  <Printer size={20} /> Gerar Documento
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showTransactionModal.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-2xl font-bold mb-6">
              {showTransactionModal.type === 'entry' 
                ? 'Registrar Entrada' 
                : exitReason === 'vencido' 
                ? 'Registrar Baixa por Vencimento (Desperdício)' 
                : exitReason === 'perda'
                ? 'Registrar Baixa por Perda / Avaria'
                : exitReason === 'doacao'
                ? 'Registrar Saída por Doação'
                : 'Registrar Saída de Estoque'}
            </h3>
            
            <form onSubmit={handleTransaction} className="space-y-6">
              {showTransactionModal.type === 'entry' ? (
                <>
                  {showTransactionModal.item ? (
                    <div className="mb-6">
                      <p className="text-[#78716C] font-medium">{showTransactionModal.item.name}</p>
                      <p className="text-xs font-bold text-emerald-600 mt-1">
                        Disponível em estoque: {showTransactionModal.item.quantity} unidades
                      </p>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <label className="block text-sm font-bold text-[#57534E] mb-2">Selecionar Item</label>
                      <select 
                        required
                        className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                        value={selectedItemId}
                        onChange={e => setSelectedItemId(e.target.value)}
                      >
                        <option value="">Selecione um item...</option>
                        {items.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name} (Lote: {item.batch_number || 'N/A'}) - {item.quantity} un.
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-extrabold text-[#57534E] mb-2 text-center uppercase tracking-wider">Quantidade a Adicionar</label>
                    <div className="flex items-center justify-center gap-4 py-2">
                      <button 
                        type="button"
                        onClick={() => setTransactionQty(Math.max(1, transactionQty - 1))}
                        className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-300 flex items-center justify-center text-2xl font-black text-slate-800 shadow-sm transition-all"
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        min="1"
                        value={transactionQty}
                        onChange={e => setTransactionQty(Math.max(1, parseInt(e.target.value) || 0))}
                        className="text-3xl font-black w-32 py-2 px-3 text-center bg-emerald-50 text-emerald-950 border-2 border-emerald-500 rounded-2xl shadow-inner focus:ring-2 focus:ring-emerald-500/30"
                      />
                      <button 
                        type="button"
                        onClick={() => setTransactionQty(transactionQty + 1)}
                        className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-300 flex items-center justify-center text-2xl font-black text-slate-800 shadow-sm transition-all"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-[#57534E] mb-2">Estoque Mínimo (2 Meses / 8 Semanas)</label>
                    <input 
                      type="number"
                      placeholder="Calculando..."
                      className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                      value={isNaN(transactionMinStock) ? (
                        (() => {
                          const item = showTransactionModal.item || items.find(i => i.id === selectedItemId);
                          if (item) {
                            const weeklyRate = weeklyExitRates[item.name] || 0;
                            return weeklyRate > 0 ? Math.ceil(weeklyRate * 8) : item.min_quantity;
                          }
                          return '';
                        })()
                      ) : transactionMinStock}
                      onChange={e => setTransactionMinStock(parseInt(e.target.value))}
                    />
                    <p className="text-[10px] text-[#A8A29E] mt-1 font-medium italic">
                      Deixe em branco para usar o cálculo automático de 2 meses (8 semanas) do sistema.
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-[#57534E] mb-2">Motivo da Saída</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExitReason('consumo');
                          setSelectedSector(SECTORS[0]);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${exitReason === 'consumo' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-white text-[#78716C] border-[#E7E5E4] hover:bg-[#F5F5F4]'}`}
                      >
                        Consumo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExitReason('doacao');
                          setModalSector('');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${exitReason === 'doacao' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-white text-[#78716C] border-[#E7E5E4] hover:bg-[#F5F5F4]'}`}
                      >
                        Doação
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExitReason('vencido');
                          setModalSector('Descarte/Vencimento');
                          setExpiryReason('');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${exitReason === 'vencido' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-white text-[#78716C] border-[#E7E5E4] hover:bg-[#F5F5F4]'}`}
                      >
                        Vencido
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExitReason('perda');
                          setModalSector('Perda/Avaria');
                          setExpiryReason('');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${exitReason === 'perda' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-white text-[#78716C] border-[#E7E5E4] hover:bg-[#F5F5F4]'}`}
                      >
                        Perda/Avaria
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-[#57534E] mb-2">
                      {exitReason === 'doacao' ? 'Destinatário da Doação' : 
                       (exitReason === 'vencido' || exitReason === 'perda') ? 'Classificação' : 'Setor de Destino'}
                    </label>
                    {exitReason === 'doacao' ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">Unidade Doadora</label>
                          <input 
                            required
                            type="text"
                            placeholder="Policlínica de Sobral"
                            className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                            value={donationUnitName || 'Policlínica de Sobral'}
                            onChange={e => setDonationUnitName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">Unidade Receptora (Nome)</label>
                          <input 
                            required
                            type="text"
                            placeholder="Nome da unidade receptora..."
                            className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                            value={modalSector}
                            onChange={e => setModalSector(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">Endereço Receptora</label>
                            <input 
                              required
                              type="text"
                              placeholder="Endereço..."
                              className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-xs"
                              value={donationUnitAddress}
                              onChange={e => setDonationUnitAddress(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">CNPJ Receptora</label>
                            <input 
                              required
                              type="text"
                              placeholder="00.000.000/0000-00"
                              className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-xs"
                              value={donationUnitCNPJ}
                              onChange={e => setDonationUnitCNPJ(e.target.value)}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">Papel Timbrado (Opcional - JPEG/PNG)</label>
                          <div className="flex items-center gap-3">
                            <label className="flex-1 cursor-pointer group">
                              <div className="flex items-center gap-2 px-4 py-3 bg-[#F5F5F4] border-2 border-dashed border-[#E7E5E4] rounded-xl hover:border-[#1C1917]/20 transition-all">
                                <Upload size={16} className="text-[#A8A29E] group-hover:text-[#1C1917]" />
                                <span className="text-xs font-bold text-[#78716C] group-hover:text-[#1C1917]">
                                  {letterheadImage ? 'Alterar Imagem' : 'Selecionar Timbrado'}
                                </span>
                              </div>
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setLetterheadImage(reader.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                            {letterheadImage && (
                              <button 
                                type="button"
                                onClick={() => setLetterheadImage(null)}
                                className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                                title="Remover imagem"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                          {letterheadImage && (
                            <div className="mt-2 relative w-full h-12 bg-white rounded-lg border border-[#E7E5E4] overflow-hidden">
                              <img 
                                src={letterheadImage} 
                                alt="Preview" 
                                className="w-full h-full object-contain"
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">Data da Última Revisão</label>
                          <input 
                            required
                            type="text"
                            placeholder="Ex: 24/04/2026"
                            className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                            value={donationRevisionDate}
                            onChange={e => setDonationRevisionDate(e.target.value)}
                          />
                        </div>
                      </div>
                    ) : (exitReason === 'vencido' || exitReason === 'perda') ? (
                      <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                        <p className="text-xs font-bold text-rose-700 uppercase tracking-widest mb-1">Descarte por {exitReason === 'vencido' ? 'Vencimento' : 'Perda/Avaria'}</p>
                        <p className="text-sm text-rose-600">Esta movimentação será registrada como {modalSector}.</p>
                      </div>
                    ) : (
                      <select 
                        required
                        className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                        value={modalSector}
                        onChange={e => setModalSector(e.target.value)}
                      >
                        <option value="">Selecione o setor de destino...</option>
                        <option value="Farmácia (Consumo Interno)">Farmácia (Consumo Interno)</option>
                        {SECTORS.map(sector => (
                          <option key={sector} value={sector}>{sector}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {(exitReason === 'vencido' || exitReason === 'perda') && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      <label className="block text-sm font-bold text-[#57534E]">Justificativa do {exitReason === 'vencido' ? 'Vencimento' : 'Descarte'}</label>
                      <textarea 
                        required
                        placeholder={exitReason === 'vencido' ? "Explique por que o item venceu no estoque..." : "Explique o motivo da perda ou avaria..."}
                        className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm min-h-[100px] resize-none"
                        value={expiryReason}
                        onChange={e => setExpiryReason(e.target.value)}
                      />
                    </motion.div>
                  )}

                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-[#57534E]">Itens para Saída</label>
                    {basket.map((b, index) => {
                      const item = items.find(i => i.id === b.item_id);
                      return (
                        <div key={index} className="flex items-center gap-4 bg-[#F5F5F4] p-4 rounded-2xl">
                          <div className="flex-1">
                            <p className="font-bold text-sm">{item?.name || 'Item não encontrado'}</p>
                            <p className="text-[10px] text-[#78716C]">Lote: {item?.batch_number || 'N/A'} | Estoque: {item?.quantity || 0}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              type="button"
                              onClick={() => {
                                const newBasket = [...basket];
                                newBasket[index].quantity = Math.max(1, newBasket[index].quantity - 1);
                                setBasket(newBasket);
                              }}
                              className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold hover:bg-gray-100"
                            >
                              -
                            </button>
                            <input 
                              type="number"
                              min="1"
                              max={item?.quantity || 999}
                              value={b.quantity}
                              onChange={e => {
                                const val = Math.max(1, Math.min(item?.quantity || 999, parseInt(e.target.value) || 0));
                                const newBasket = [...basket];
                                newBasket[index].quantity = val;
                                setBasket(newBasket);
                              }}
                              className="font-bold w-16 text-center bg-transparent border-none focus:ring-0 text-sm"
                            />
                            <button 
                              type="button"
                              onClick={() => {
                                const newBasket = [...basket];
                                newBasket[index].quantity = Math.min(item?.quantity || 999, newBasket[index].quantity + 1);
                                setBasket(newBasket);
                              }}
                              className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold hover:bg-gray-100"
                            >
                              +
                            </button>
                            <button 
                              type="button"
                              onClick={() => setBasket(basket.filter((_, i) => i !== index))}
                              className="text-rose-500 hover:text-rose-700 ml-2"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="space-y-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">1. Escolha o Item</label>
                          <div className="relative">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A29E]" size={16} />
                              <input 
                                autoFocus
                                type="text" 
                                placeholder="Pesquisar item..."
                                className="w-full pl-10 pr-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                                value={modalSearchTerm}
                                onChange={(e) => {
                                  setModalSearchTerm(e.target.value);
                                  if (selectedItemName) setSelectedItemName('');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !modalSearchTerm && basket.length > 0) {
                                    e.preventDefault();
                                    // Submit the form
                                    const form = e.currentTarget.closest('form');
                                    if (form) form.requestSubmit();
                                  }
                                }}
                              />
                            </div>

                            {modalSearchTerm.length >= 2 && !selectedItemName && (
                              <motion.div 
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E7E5E4] rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto"
                              >
                                {(items.filter(i => i.quantity > 0) as Item[])
                                  .filter(item => {
                                    const combined = `${item.name} ${item.batch_number || ''}`;
                                    return normalizeString(combined).includes(normalizeString(modalSearchTerm));
                                  })
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .slice(0, 10)
                                  .map(item => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => {
                                        if (basket.some(b => b.item_id === item.id)) {
                                          showToast('Este lote já está na lista de saída.', 'error');
                                          return;
                                        }
                                        setBasket([...basket, { item_id: item.id, quantity: 1 }]);
                                        setModalSearchTerm('');
                                        setSelectedItemName('');
                                      }}
                                      className="w-full px-4 py-3 text-left hover:bg-[#F5F5F4] transition-all border-b border-[#F5F5F4] last:border-none flex justify-between items-center"
                                    >
                                      <div>
                                        <p className="font-bold text-sm text-[#1C1917]">{item.name}</p>
                                        <p className="text-[10px] text-[#78716C] font-mono">Lote: {item.batch_number || '---'}</p>
                                      </div>
                                      <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">
                                          {item.quantity} un.
                                        </span>
                                        {item.expiry_date && (
                                          <span className={`text-[8px] font-bold ${isNearExpiry(item) ? 'text-rose-600' : 'text-[#A8A29E]'}`}>
                                            {item.expiry_date === 'Indeterminada' ? 'Indeterminada' : new Date(item.expiry_date).toLocaleDateString('pt-BR')}
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  ))
                                }
                              </motion.div>
                            )}
                          </div>
                        </div>

                        {selectedItemName && (
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">2. Escolha o Lote</label>
                            <select 
                              className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#1C1917]/10"
                              value={selectedItemId}
                              onChange={e => {
                                const id = e.target.value;
                                if (!id) return;
                                if (basket.some(b => b.item_id === id)) {
                                  alert('Este lote já está na lista de saída.');
                                  return;
                                }
                                setBasket([...basket, { item_id: id, quantity: 1 }]);
                                setSelectedItemId('');
                                setSelectedItemName('');
                                setModalSearchTerm('');
                              }}
                            >
                              <option value="">Selecione o lote...</option>
                              {items
                                .filter(i => i.name === selectedItemName && i.quantity > 0 && !basket.some(b => b.item_id === i.id))
                                .map(item => (
                                  <option key={item.id} value={item.id}>
                                    Lote: {item.batch_number || 'S/N'} ({item.quantity} un.) {item.expiry_date ? `- Venc: ${new Date(item.expiry_date).toLocaleDateString('pt-BR')}` : ''}
                                  </option>
                                ))
                              }
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowTransactionModal({ show: false, type: 'entry' });
                    setLetterheadImage(null);
                  }}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-[#78716C] hover:bg-[#F5F5F4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={showTransactionModal.type === 'exit' && basket.length === 0}
                  className={`flex-1 px-4 py-3 text-white rounded-xl font-bold transition-all disabled:opacity-50 ${
                    showTransactionModal.type === 'entry' 
                      ? 'bg-emerald-600 hover:bg-emerald-700' 
                      : exitReason === 'vencido'
                      ? 'bg-rose-700 hover:bg-rose-800'
                      : exitReason === 'perda'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : exitReason === 'doacao'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {showTransactionModal.type === 'entry' 
                    ? 'Confirmar Entrada' 
                    : exitReason === 'vencido'
                    ? `Confirmar Descarte (Vencido) ${basket.length > 0 ? `(${basket.length})` : ''}`
                    : exitReason === 'perda'
                    ? `Confirmar Baixa (Perda) ${basket.length > 0 ? `(${basket.length})` : ''}`
                    : exitReason === 'doacao'
                    ? `Confirmar Doação ${basket.length > 0 ? `(${basket.length})` : ''}`
                    : `Confirmar Saída ${basket.length > 0 ? `(${basket.length})` : ''}`}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showDeleteModal.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
          >
            <h3 className="text-2xl font-bold mb-4 text-rose-600 flex items-center gap-2">
              <Trash2 size={24} /> Excluir Movimentação
            </h3>
            <p className="text-[#78716C] mb-6">
              Esta ação marcará a movimentação como excluída (ex: teste). Você poderá recuperá-la no histórico de excluídos.
            </p>
            
            <div className="space-y-4">
              <label className="block text-sm font-bold text-[#57534E]">Justificativa / Motivo</label>
              <input 
                type="text"
                className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-rose-500/20"
                placeholder="Ex: Lançamento de teste"
                value={deletionReason}
                onChange={e => setDeletionReason(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowDeleteModal({ show: false })}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-[#78716C] hover:bg-[#F5F5F4] transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => handleDeleteTransaction(showDeleteModal.transactionId!, deletionReason)}
                className="flex-1 px-4 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all"
              >
                Confirmar Exclusão
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showDetailModal.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-[95vw] lg:w-full lg:max-w-2xl rounded-3xl p-4 sm:p-8 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {showDetailModal.type === 'low_stock' 
                    ? 'Itens com Estoque Baixo' 
                    : showDetailModal.type === 'expiry'
                    ? 'Itens Próximos ao Vencimento'
                    : 'Atenção Necessária — Central de Alertas'}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Listagem de insumos que requerem providência imediata
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (showDetailModal.type === 'low_stock') {
                      handleExportCriticalReportPDF('low_stock');
                    } else if (showDetailModal.type === 'expiry') {
                      handleExportCriticalReportPDF('expiry');
                    } else {
                      setShowCriticalReportModal(true);
                    }
                  }}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-600 via-rose-600 to-rose-700 hover:from-amber-700 hover:to-rose-800 text-white font-extrabold text-xs rounded-2xl shadow-md transition-all flex items-center gap-2"
                  title={showDetailModal.type === 'expiry' ? 'Imprimir Relatório de Validade' : showDetailModal.type === 'low_stock' ? 'Imprimir Relatório de Estoque Baixo' : 'Escolher e Imprimir Relatório de Críticos'}
                >
                  <Printer size={16} /> Imprimir Relatório {showDetailModal.type === 'expiry' ? '(Validade)' : showDetailModal.type === 'low_stock' ? '(Estoque)' : ''}
                </button>
                <button 
                  onClick={() => setShowDetailModal({ show: false, type: 'low_stock', items: [] })}
                  className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-500"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {showDetailModal.items.map((item, idx) => {
                const isGroup = 'total_quantity' in item;
                const quantity = isGroup ? (item as ItemGroup).total_quantity : (item as Item).quantity;
                const minQuantity = isGroup ? (item as ItemGroup).min_quantity : (item as Item).min_quantity;
                const name = item.name;
                const id = isGroup ? `group-${idx}` : (item as Item).id;

                const itemIsExpired = !isGroup && isExpired(item as Item);
                const itemIsNearExpiry = !isGroup && isNearExpiry(item as Item);

                let cardBg = 'bg-amber-50 border-amber-200';
                let tagLabel = 'Estoque Baixo';
                let tagColor = 'bg-amber-100 text-amber-900 font-bold';
                let actionType: 'entry' | 'exit' = 'entry';
                let actionLabel = 'Repor';
                let buttonStyle = 'bg-amber-600 hover:bg-amber-700';

                if (itemIsExpired) {
                  cardBg = 'bg-rose-50 border-rose-200';
                  tagLabel = 'VENCIDO';
                  tagColor = 'bg-rose-200 text-rose-800 font-black';
                  actionType = 'exit';
                  actionLabel = 'Retirar (Desperdício)';
                  buttonStyle = 'bg-rose-600 hover:bg-rose-700';
                } else if (itemIsNearExpiry) {
                  cardBg = 'bg-sky-50 border-sky-200';
                  tagLabel = 'PRÓX. VENCER';
                  tagColor = 'bg-sky-200 text-sky-900 font-black';
                  actionType = 'exit';
                  actionLabel = 'Retirar';
                  buttonStyle = 'bg-sky-700 hover:bg-sky-800';
                }

                return (
                  <div 
                    key={`modal-${id}`} 
                    className={`flex items-center justify-between p-4 sm:p-5 rounded-2xl border ${cardBg}`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-extrabold text-sm shrink-0 border ${itemIsExpired ? 'bg-rose-100 text-rose-800 border-rose-200' : itemIsNearExpiry ? 'bg-sky-100 text-sky-900 border-sky-200' : 'bg-amber-100 text-amber-900 border-amber-200'}`}>
                        {!isGroup && (itemIsExpired || itemIsNearExpiry) ? <Calendar size={20} /> : quantity}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-extrabold text-sm sm:text-base text-slate-900 truncate">{name}</p>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase ${tagColor}`}>
                            {tagLabel}
                          </span>
                        </div>
                        <p className="text-xs font-semibold mt-0.5 text-slate-700">
                          {!isGroup && itemIsExpired ? (
                            <span className="text-rose-700 font-bold">Expirou em: {new Date((item as Item).expiry_date!).toLocaleDateString('pt-BR')} ({quantity} un)</span>
                          ) : !isGroup && itemIsNearExpiry ? (
                            <span className="text-sky-800 font-bold">Vence em: {new Date((item as Item).expiry_date!).toLocaleDateString('pt-BR')} ({quantity} un)</span>
                          ) : (
                            <span>Estoque total: {quantity} un (Mínimo: {minQuantity} un)</span>
                          )}
                        </p>
                        {!isGroup && <p className="text-[11px] text-slate-500 mt-1">Lote: {(item as Item).batch_number || 'N/A'} | Fornecedor: {(item as Item).supplier || 'N/A'}</p>}
                        {isGroup && <p className="text-[11px] text-slate-500 mt-1">{(item as ItemGroup).batches.length} lotes ativos</p>}
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setShowDetailModal({ show: false, type: 'low_stock', items: [] });
                        const targetItem = isGroup ? (item as ItemGroup).batches[0] : (item as Item);
                        setShowTransactionModal({ show: true, type: actionType, item: targetItem });
                      }}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white transition-all shadow-sm shrink-0 ml-3 ${buttonStyle}`}
                    >
                      {actionLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-lg rounded-[32px] p-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Configurações do Sistema</h3>
                <p className="text-xs font-bold text-slate-500 mt-0.5">Gerenciamento de logo e ferramentas administrativas</p>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-500 hover:text-slate-800"
              >
                <X size={24} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 p-1.5 bg-slate-100/80 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => setSettingsTab('logo')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                  settingsTab === 'logo'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ImageIcon size={16} />
                <span>Logo do Sistema</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setSettingsTab('tools')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                    settingsTab === 'tools'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users size={16} />
                  <span>Ferramentas Admin</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSettingsTab('info')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                  settingsTab === 'info'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Info size={16} />
                <span>Sobre</span>
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto pr-1">
              {settingsTab === 'logo' && (
                <div className="space-y-6">
                  <div className="p-4 bg-blue-50/80 rounded-2xl border border-blue-100 text-blue-900">
                    <h4 className="text-xs font-black uppercase tracking-wider text-blue-800 mb-1 flex items-center gap-2">
                      <ImageIcon size={16} className="text-blue-600" />
                      Gerenciamento Completo de Logotipos
                    </h4>
                    <p className="text-xs leading-relaxed text-blue-700 font-medium">
                      Cadastre os logotipos oficiais da <strong>Policlínica</strong>, do <strong>Consórcio CPSMS</strong>, do <strong>Governo/SUS</strong> e do <strong>Sistema</strong>. Eles serão inseridos automaticamente em todos os documentos PDF, relatórios e recibos.
                    </p>
                  </div>

                  {/* Live Document Header Preview */}
                  <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3 shadow-md">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Pré-Visualização do Cabeçalho dos Documentos
                      </span>
                      <span className="text-[9px] font-semibold text-slate-400">Modelo PDF A4</span>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-700 text-slate-900 space-y-3 shadow-inner">
                      {/* Top Row: ALL 3 Logos as Homogeneous Rectangles */}
                      <div className="flex items-center justify-between gap-3">
                        {/* 1. Logo Almoxarifado (Left - Rectangular) */}
                        <div className="flex-1 h-12 bg-emerald-50/50 border border-emerald-100 rounded-xl p-1.5 flex items-center justify-center overflow-hidden">
                          {appRectangularLogo ? (
                            <img src={appRectangularLogo} alt="Logo Almoxarifado" className="max-h-full max-w-full object-contain" />
                          ) : appLogo ? (
                            <img src={appLogo} alt="Logo Sistema" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <div className="text-[9px] font-black text-emerald-800 uppercase tracking-tight text-center">ALMOXARIFADO</div>
                          )}
                        </div>

                        {/* 2. Logo Policlínica (Center - Rectangular) */}
                        <div className="flex-1 h-12 bg-sky-50/50 border border-sky-100 rounded-xl p-1.5 flex items-center justify-center overflow-hidden">
                          {policlinicaLogo ? (
                            <img src={policlinicaLogo} alt="Logo Policlínica" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <div className="text-[9px] font-black text-sky-800 uppercase tracking-tight text-center">POLICLÍNICA DE SOBRAL</div>
                          )}
                        </div>

                        {/* 3. Logo Consórcio CPSMS (Right - Rectangular) */}
                        <div className="flex-[1.15] h-14 bg-orange-50/50 border border-orange-100 rounded-xl p-1 flex items-center justify-center overflow-hidden">
                          {consorcioLogo ? (
                            <img src={consorcioLogo} alt="Logo Consórcio" className="max-h-full max-w-full object-contain scale-105" />
                          ) : (
                            <div className="text-[9px] font-black text-orange-800 uppercase tracking-tight text-center">CONSÓRCIO CPSMS</div>
                          )}
                        </div>
                      </div>

                      {/* Divider Line */}
                      <div className="border-t border-slate-200" />

                      {/* Title & Emission Date below logos */}
                      <div className="text-center space-y-0.5">
                        <h5 className="font-black text-xs text-slate-900 uppercase tracking-tight">
                          RECIBO DE ENTREGA DE MATERIAL
                        </h5>
                        <p className="text-[9px] font-semibold text-slate-500">
                          Data de Emissão: {format(new Date(), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Grid de 4 Logotipos */}
                  <div className="grid grid-cols-1 gap-5">
                    {/* 1. Logo da Policlínica */}
                    <div className="p-5 bg-white rounded-2xl border border-sky-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block"></span>
                            Logo Oficial da Policlínica
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Substitui a marca da Policlínica no canto superior do cabeçalho dos documentos.
                          </p>
                        </div>
                        {policlinicaLogo && (
                          <button 
                            onClick={handleRemovePoliclinicaLogo}
                            className="text-xs font-extrabold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                          >
                            <Trash2 size={13} /> Remover
                          </button>
                        )}
                      </div>

                      <label className="block w-full cursor-pointer group">
                        <div className={`overflow-hidden rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 p-4 ${policlinicaLogo ? 'border-sky-300 bg-sky-50/20 hover:bg-sky-50/40' : 'border-slate-300 hover:border-sky-500 hover:bg-slate-50'}`}>
                          {policlinicaLogo ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={policlinicaLogo} alt="Logo Policlínica" className="max-h-16 object-contain" />
                              <span className="text-xs font-bold text-sky-700 bg-sky-100/80 px-3 py-1 rounded-full flex items-center gap-1.5">
                                <Upload size={13} /> Alterar Logo da Policlínica
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-sky-50 text-sky-600 rounded-full group-hover:scale-110 transition-transform">
                                <Upload size={18} />
                              </div>
                              <div>
                                <p className="text-xs font-black text-slate-800">Clique para enviar a logo da Policlínica</p>
                                <p className="text-[10px] font-bold text-slate-400">PNG, JPG ou SVG (Máx. 2MB)</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handlePoliclinicaLogoUpload} />
                      </label>
                    </div>

                    {/* 2. Logo do Consórcio CPSMS */}
                    <div className="p-5 bg-white rounded-2xl border border-orange-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span>
                            Logo Oficial do Consórcio CPSMS
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Substitui a marca do Consórcio no canto superior do cabeçalho dos documentos.
                          </p>
                        </div>
                        {consorcioLogo && (
                          <button 
                            onClick={handleRemoveConsorcioLogo}
                            className="text-xs font-extrabold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                          >
                            <Trash2 size={13} /> Remover
                          </button>
                        )}
                      </div>

                      <label className="block w-full cursor-pointer group">
                        <div className={`overflow-hidden rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 p-4 ${consorcioLogo ? 'border-orange-300 bg-orange-50/20 hover:bg-orange-50/40' : 'border-slate-300 hover:border-orange-500 hover:bg-slate-50'}`}>
                          {consorcioLogo ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={consorcioLogo} alt="Logo Consórcio" className="max-h-16 object-contain" />
                              <span className="text-xs font-bold text-orange-700 bg-orange-100/80 px-3 py-1 rounded-full flex items-center gap-1.5">
                                <Upload size={13} /> Alterar Logo do Consórcio
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-orange-50 text-orange-600 rounded-full group-hover:scale-110 transition-transform">
                                <Upload size={18} />
                              </div>
                              <div>
                                <p className="text-xs font-black text-slate-800">Clique para enviar a logo do Consórcio CPSMS</p>
                                <p className="text-[10px] font-bold text-slate-400">PNG, JPG ou SVG (Máx. 2MB)</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleConsorcioLogoUpload} />
                      </label>
                    </div>

                    {/* 3. Logo Estado / SUS / Governo (Login e Canto Esquerdo) */}
                    <div className="p-5 bg-white rounded-2xl border border-emerald-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
                            Logo Estado / SUS / Governo (Login e Canto Esquerdo)
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Exibida no canto superior esquerdo dos relatórios e na tela de login.
                          </p>
                        </div>
                        {appRectangularLogo && (
                          <button 
                            onClick={handleRemoveRectangularLogo}
                            className="text-xs font-extrabold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                          >
                            <Trash2 size={13} /> Remover
                          </button>
                        )}
                      </div>

                      <label className="block w-full cursor-pointer group">
                        <div className={`overflow-hidden rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 p-4 ${appRectangularLogo ? 'border-emerald-300 bg-emerald-50/20 hover:bg-emerald-50/40' : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50'}`}>
                          {appRectangularLogo ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={appRectangularLogo} alt="Logo Estado/SUS" className="max-h-16 object-contain" />
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-3 py-1 rounded-full flex items-center gap-1.5">
                                <Upload size={13} /> Alterar Logo Estado/SUS
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-full group-hover:scale-110 transition-transform">
                                <Upload size={18} />
                              </div>
                              <div>
                                <p className="text-xs font-black text-slate-800">Clique para enviar a logo retangular (Estado/SUS)</p>
                                <p className="text-[10px] font-bold text-slate-400">PNG, JPG ou SVG (Máx. 2MB)</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleRectangularLogoUpload} />
                      </label>
                    </div>

                    {/* 4. Logo Quadrada (Menu do Sistema) */}
                    <div className="p-5 bg-white rounded-2xl border border-blue-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                            Logo Quadrada (Menu do Sistema)
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Exibida no menu lateral e topo da navegação do almoxarifado.
                          </p>
                        </div>
                        {appLogo && (
                          <button 
                            onClick={handleRemoveLogo}
                            className="text-xs font-extrabold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                          >
                            <Trash2 size={13} /> Remover
                          </button>
                        )}
                      </div>

                      <label className="block w-full cursor-pointer group">
                        <div className={`overflow-hidden rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 p-4 ${appLogo ? 'border-blue-300 bg-blue-50/20 hover:bg-blue-50/40' : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'}`}>
                          {appLogo ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={appLogo} alt="Logo Quadrada Menu" className="max-h-16 object-contain" />
                              <span className="text-xs font-bold text-blue-700 bg-blue-100/80 px-3 py-1 rounded-full flex items-center gap-1.5">
                                <Upload size={13} /> Alterar Logo Quadrada
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full group-hover:scale-110 transition-transform">
                                <Upload size={18} />
                              </div>
                              <div>
                                <p className="text-xs font-black text-slate-800">Clique para enviar a logo quadrada do sistema</p>
                                <p className="text-[10px] font-bold text-slate-400">Formato 1:1 (PNG, JPG ou SVG - Máx. 2MB)</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                    </div>

                    {/* 5. Papel Timbrado Completo (Imagem A4) */}
                    <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
                            Papel Timbrado Completo (Imagem de Fundo A4)
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Caso sua instituição já possua um papel timbrado em imagem única para o fundo do PDF.
                          </p>
                        </div>
                        {letterheadImage && (
                          <button 
                            onClick={handleRemoveLetterhead}
                            className="text-xs font-extrabold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                          >
                            <Trash2 size={13} /> Remover Timbrado
                          </button>
                        )}
                      </div>

                      <label className="block w-full cursor-pointer group">
                        <div className={`overflow-hidden rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 p-4 ${letterheadImage ? 'border-indigo-300 bg-indigo-50/20 hover:bg-indigo-50/40' : 'border-slate-300 hover:border-indigo-500 hover:bg-slate-50'}`}>
                          {letterheadImage ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={letterheadImage} alt="Papel Timbrado A4" className="max-h-20 object-contain rounded-md border border-slate-200 shadow-xs" />
                              <span className="text-xs font-bold text-indigo-700 bg-indigo-100/80 px-3 py-1 rounded-full flex items-center gap-1.5">
                                <Upload size={13} /> Alterar imagem de Papel Timbrado
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-full group-hover:scale-110 transition-transform">
                                <Upload size={18} />
                              </div>
                              <div>
                                <p className="text-xs font-black text-slate-800">Clique para enviar imagem de papel timbrado completa</p>
                                <p className="text-[10px] font-bold text-slate-400">PNG ou JPG (Máx. 5MB)</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleLetterheadUpload(file);
                          }} 
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'tools' && isAdmin && (
                <div className="p-6 bg-blue-50/80 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-3 mb-3 text-blue-700">
                    <Users size={22} />
                    <h4 className="font-extrabold text-base">Ferramentas de Dados do Admin</h4>
                  </div>
                  <p className="text-xs text-blue-800 mb-5 leading-relaxed font-medium">
                    Corrija inconsistências unificando fornecedores cadastrados com nomes diferentes ou mesclando itens duplicados no estoque.
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => {
                        setShowSettingsModal(false);
                        setShowMergeSuppliers(true);
                      }}
                      className="w-full py-3.5 bg-blue-700 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider hover:bg-blue-800 transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-700/20"
                    >
                      <RotateCcw size={16} /> Mesclar Fornecedores
                    </button>
                    <button 
                      onClick={() => {
                        setShowSettingsModal(false);
                        setShowMergeItems(true);
                      }}
                      className="w-full py-3.5 bg-emerald-700 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider hover:bg-emerald-800 transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20"
                    >
                      <Package size={16} /> Mesclar Itens Duplicados
                    </button>
                    <button 
                      onClick={() => {
                        setShowSettingsModal(false);
                        setCategoryModalMaterial('');
                        setCategoryModalNewCategory('');
                        setCustomModalCategory('');
                        setShowChangeCategoryModal(true);
                      }}
                      className="w-full py-3.5 bg-indigo-700 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider hover:bg-indigo-800 transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-700/20"
                    >
                      <Tag size={16} /> Alterar Categoria de Material
                    </button>
                  </div>
                </div>
              )}

              {settingsTab === 'info' && (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                  <h4 className="font-extrabold text-slate-900 mb-3 text-sm">Informações do Sistema</h4>
                  <div className="space-y-2.5 text-xs text-slate-600 font-medium">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                      <span>Versão</span>
                      <span className="font-mono font-bold text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded">1.2.0</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                      <span>Total de Itens em Estoque</span>
                      <span className="font-extrabold text-slate-900">{items.length}</span>
                    </div>
                    <div className="pt-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Suporte e Desenvolvimento</p>
                      <p className="font-extrabold text-slate-900">gerlianemagalhaes79@gmail.com</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
      {showMergeSuppliers && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#1C1917]">Mesclar Fornecedores</h3>
              <button 
                onClick={() => setShowMergeSuppliers(false)}
                className="p-2 hover:bg-[#F5F5F4] rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 mb-4">
                <p className="text-xs text-blue-700 font-medium">
                  Esta ação irá substituir o nome do fornecedor em todos os itens e transações do histórico.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1.5 ml-1">Fornecedor de Origem (Será substituído)</label>
                <select 
                  className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                  value={sourceSupplier}
                  onChange={e => setSourceSupplier(e.target.value)}
                >
                  <option value="">Selecione o nome incorreto...</option>
                  {uniqueSuppliers.map(s => (
                    <option key={`source-${s}`} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <div className="bg-[#F5F5F4] p-2 rounded-full">
                  <ArrowDownLeft className="text-[#A8A29E] rotate-45" size={20} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1.5 ml-1">Fornecedor de Destino (Nome Correto)</label>
                <select 
                  className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                  value={targetSupplier}
                  onChange={e => setTargetSupplier(e.target.value)}
                >
                  <option value="">Selecione o nome correto...</option>
                  {uniqueSuppliers.map(s => (
                    <option key={`target-${s}`} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowMergeSuppliers(false)}
                  className="flex-1 py-3 bg-[#F5F5F4] text-[#57534E] rounded-xl font-bold hover:bg-[#E7E5E4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleMergeSuppliers}
                  disabled={isMerging || !sourceSupplier || !targetSupplier || sourceSupplier === targetSupplier}
                  className={`flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isMerging || !sourceSupplier || !targetSupplier || sourceSupplier === targetSupplier ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
                >
                  {isMerging ? (
                    <>
                      <RotateCcw className="animate-spin" size={18} /> Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} /> Confirmar Mesclagem
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showMergeItems && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#1C1917]">Mesclar Itens Duplicados</h3>
              <button 
                onClick={() => setShowMergeItems(false)}
                className="p-2 hover:bg-[#F5F5F4] rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 mb-4">
                <p className="text-xs text-emerald-700 font-medium">
                  Esta ação irá unificar dois itens com nomes diferentes. Todos os registros de estoque e histórico serão movidos para o nome correto.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1.5 ml-1">Item de Origem (Nome Incorreto)</label>
                <select 
                  className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                  value={sourceItemName}
                  onChange={e => setSourceItemName(e.target.value)}
                >
                  <option value="">Selecione o nome duplicado...</option>
                  {uniqueItemNames.map(name => (
                    <option key={`source-item-${name}`} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <div className="bg-[#F5F5F4] p-2 rounded-full">
                  <ArrowDownLeft className="text-[#A8A29E] rotate-45" size={20} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1.5 ml-1">Item de Destino (Nome Correto)</label>
                <select 
                  className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                  value={targetItemName}
                  onChange={e => setTargetItemName(e.target.value)}
                >
                  <option value="">Selecione o nome que deve permanecer...</option>
                  {uniqueItemNames.map(name => (
                    <option key={`target-item-${name}`} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowMergeItems(false)}
                  className="flex-1 py-3 bg-[#F5F5F4] text-[#57534E] rounded-xl font-bold hover:bg-[#E7E5E4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleMergeItems}
                  disabled={isMerging || !sourceItemName || !targetItemName || sourceItemName === targetItemName}
                  className={`flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isMerging || !sourceItemName || !targetItemName || sourceItemName === targetItemName ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-700'}`}
                >
                  {isMerging ? (
                    <>
                      <RotateCcw className="animate-spin" size={18} /> Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} /> Confirmar Mesclagem
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showChangeCategoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                  <Tag size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[#1C1917]">Alterar Categoria de Material</h3>
                  <p className="text-xs text-slate-500 font-medium">Corrija a categoria de insumos cadastrados incorretamente</p>
                </div>
              </div>
              <button 
                onClick={() => setShowChangeCategoryModal(false)}
                className="p-2 hover:bg-[#F5F5F4] rounded-full transition-all text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Selecione o Material / Insumo</label>
                <select 
                  className="w-full px-4 py-3 bg-[#F5F5F4] border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold text-sm text-slate-800"
                  value={categoryModalMaterial}
                  onChange={e => {
                    const selectedName = e.target.value;
                    setCategoryModalMaterial(selectedName);
                    const itemGroup = items.find(i => i.name === selectedName);
                    if (itemGroup && itemGroup.category) {
                      setCategoryModalNewCategory(itemGroup.category);
                    }
                  }}
                >
                  <option value="">Selecione um material do estoque...</option>
                  {uniqueItemNames.map(name => {
                    const currentCat = items.find(i => i.name === name)?.category || 'Sem Categoria';
                    return (
                      <option key={`cat-modal-${name}`} value={name}>
                        {name} ({currentCat})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nova Categoria</label>
                <select 
                  className="w-full px-4 py-3 bg-[#F5F5F4] border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold text-sm text-slate-800"
                  value={categoryModalNewCategory}
                  onChange={e => setCategoryModalNewCategory(e.target.value)}
                >
                  <option value="">Selecione a categoria correta...</option>
                  {categories.map(cat => (
                    <option key={`cat-opt-${cat}`} value={cat}>{cat}</option>
                  ))}
                  <option value="__NEW__">+ Cadastrar Nova Categoria...</option>
                </select>
              </div>

              {categoryModalNewCategory === '__NEW__' && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                  <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1.5 ml-1">Nome da Nova Categoria</label>
                  <input 
                    type="text"
                    placeholder="Ex: Odontológico, Laboratorial..."
                    value={customModalCategory}
                    onChange={e => setCustomModalCategory(e.target.value)}
                    className="w-full px-4 py-3 bg-indigo-50/50 border border-indigo-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold text-sm text-indigo-900"
                    autoFocus
                  />
                </motion.div>
              )}

              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => setShowChangeCategoryModal(false)}
                  className="flex-1 py-3.5 bg-[#F5F5F4] text-[#57534E] rounded-2xl font-bold hover:bg-[#E7E5E4] transition-all text-xs"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleModalChangeCategory}
                  disabled={isUpdatingCategory || !categoryModalMaterial || !categoryModalNewCategory}
                  className={`flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold transition-all text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 ${isUpdatingCategory || !categoryModalMaterial || !categoryModalNewCategory ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
                >
                  {isUpdatingCategory ? (
                    <>
                      <RotateCcw className="animate-spin" size={16} /> Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} /> Salvar Categoria
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Critical Materials Report Type Selection Modal */}
      {showCriticalReportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[85] flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 overflow-hidden relative"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-amber-500 to-rose-600 text-white rounded-2xl shadow-md">
                  <Printer size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                    Relatório de Materiais Críticos
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Selecione o tipo de relatório que deseja exportar em PDF
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowCriticalReportModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Options List */}
            <div className="space-y-3.5">
              {/* Option 1: Validade */}
              <div 
                onClick={() => {
                  setShowCriticalReportModal(false);
                  handleExportCriticalReportPDF('expiry');
                }}
                className="p-4 rounded-2xl border-2 border-rose-200 bg-rose-50/40 hover:bg-rose-50 hover:border-rose-400 transition-all cursor-pointer group flex items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                    <Clock size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-rose-700 transition-colors">
                        Crítico por Validade
                      </h4>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
                        {expiredItems.length + nearExpiryItems.length} lote(s)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Lotes já vencidos e insumos que expiram nos próximos 60 dias (2 meses) com data, prazo em dias e status de risco.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center text-rose-600 group-hover:translate-x-1 transition-transform">
                  <ChevronRight size={20} />
                </div>
              </div>

              {/* Option 2: Estoque Baixo */}
              <div 
                onClick={() => {
                  setShowCriticalReportModal(false);
                  handleExportCriticalReportPDF('low_stock');
                }}
                className="p-4 rounded-2xl border-2 border-amber-200 bg-amber-50/40 hover:bg-amber-50 hover:border-amber-400 transition-all cursor-pointer group flex items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2.5 bg-amber-600 text-white rounded-xl shadow-xs shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                    <TrendingDown size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-amber-700 transition-colors">
                        Crítico por Estoque Baixo
                      </h4>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                        {lowStockItems.length} insumo(s)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Insumos zerados ou com quantidade abaixo do estoque mínimo, exibindo déficit necessário para reposição.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center text-amber-600 group-hover:translate-x-1 transition-transform">
                  <ChevronRight size={20} />
                </div>
              </div>

              {/* Option 3: Consolidado Geral */}
              <div 
                onClick={() => {
                  setShowCriticalReportModal(false);
                  handleExportCriticalReportPDF('all');
                }}
                className="p-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-400 transition-all cursor-pointer group flex items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                    <FileText size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-indigo-700 transition-colors">
                        Relatório Consolidado Geral
                      </h4>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-300">
                        Completo ({totalAlertsCount})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Documento unificado contendo as duas seções: 1. Controle de Validade e 2. Estoque Baixo / Ruptura.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center text-indigo-600 group-hover:translate-x-1 transition-transform">
                  <ChevronRight size={20} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setShowCriticalReportModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all text-xs"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Purchase Planning Modal */}
      {showPurchasePlanningModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[90] flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-2xl shadow-md shadow-indigo-500/20 text-white shrink-0">
                  <ShoppingCart size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black tracking-tight text-white">Planejamento de Compras (Estimativa de Aquisição)</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 border border-blue-400/30 text-blue-200">
                      Previsão de Consumo
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs mt-0.5 font-medium">
                    Calcula a quantidade exata de insumos e medicamentos necessária para suprir o estoque até o mês de interesse.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={handleExportPurchasePlanningPDF}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  title="Exportar Relatório Oficial em PDF"
                >
                  <Printer size={15} /> Exportar PDF
                </button>
                <button 
                  onClick={handleExportPurchasePlanningExcel}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  title="Exportar Planilha Completa em Excel"
                >
                  <Download size={15} /> Exportar Excel
                </button>
                <button 
                  onClick={() => setShowPurchasePlanningModal(false)}
                  className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all ml-2"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Filter Configuration Toolbar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-center shrink-0">
              {/* Target Month */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Mês Alvo de Cobertura
                </label>
                <select 
                  value={planningTargetMonth}
                  onChange={(e) => setPlanningTargetMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                >
                  {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Target Year */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Ano Alvo
                </label>
                <select 
                  value={planningTargetYear}
                  onChange={(e) => setPlanningTargetYear(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                >
                  {Array.from({ length: 4 }).map((_, i) => {
                    const y = new Date().getFullYear() + i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
              </div>

              {/* Safety Margin */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Margem de Segurança
                </label>
                <select 
                  value={planningSafetyOption}
                  onChange={(e) => setPlanningSafetyOption(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="standard_8w">Padrão: +8 semanas (2 meses)</option>
                  <option value="margin_10">+10% de Segurança</option>
                  <option value="margin_20">+20% de Segurança</option>
                  <option value="none">Sem Margem Adicional</option>
                </select>
              </div>

              {/* Stock Location */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Local do Estoque
                </label>
                <select 
                  value={planningLocation}
                  onChange={(e) => setPlanningLocation(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="Almoxarifado">Almoxarifado Geral</option>
                  <option value="Farmácia">Farmácia (Medicamentos)</option>
                  <option value="all">Almoxarifado & Farmácia</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Categoria
                </label>
                <select 
                  value={planningCategory}
                  onChange={(e) => setPlanningCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="all">Todas as Categorias</option>
                  {Object.keys(CATEGORY_COLORS).sort().map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Search & Sort */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Ordenar Por
                </label>
                <select 
                  value={planningSort}
                  onChange={(e) => setPlanningSort(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="deficit_desc">Maior Quantidade a Comprar</option>
                  <option value="cost_desc">Maior Custo Estimado (R$)</option>
                  <option value="cost_asc">Menor Custo Estimado (R$)</option>
                  <option value="duration_asc">Menor Duração do Estoque Atual</option>
                  <option value="name_asc">Ordem Alfabética (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Quick KPI Bar & Toggle */}
            <div className="px-6 py-3.5 bg-indigo-50/60 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                  <span className="text-xs font-bold text-slate-600">Período Alvo:</span>
                  <span className="text-xs font-black text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs">
                    {purchasePlanningSummary.targetPeriodLabel} ({purchasePlanningSummary.totalTargetWeeks} sem • ~{purchasePlanningSummary.totalTargetMonths} meses)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-600"></div>
                  <span className="text-xs font-bold text-slate-600">Itens com Déficit:</span>
                  <span className="text-xs font-black text-rose-600 bg-white px-2.5 py-1 rounded-lg border border-rose-200 shadow-2xs">
                    {purchasePlanningSummary.totalItemsWithDeficit} de {purchasePlanningSummary.totalAnalyzed} itens
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                  <span className="text-xs font-bold text-slate-600">Volume Total a Comprar:</span>
                  <span className="text-xs font-black text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs">
                    {purchasePlanningSummary.totalUnitsToBuy.toLocaleString('pt-BR')} unidades
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div>
                  <span className="text-xs font-bold text-slate-600">Custo Total Estimado:</span>
                  <span className="text-xs font-black text-emerald-700 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(purchasePlanningSummary.totalEstimatedFinancialCost)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Filtrar por nome..." 
                    value={planningSearch}
                    onChange={(e) => setPlanningSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-48"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={planningOnlyWithDeficit}
                    onChange={(e) => setPlanningOnlyWithDeficit(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Apenas itens a comprar (Déficit &gt; 0)</span>
                </label>
              </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-y-auto overflow-x-auto p-4 custom-scrollbar">
              {purchasePlanningSummary.items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mb-3">
                    <CheckCircle size={32} />
                  </div>
                  <h4 className="text-base font-black text-slate-800">Nenhum item com necessidade de compra!</h4>
                  <p className="text-xs text-slate-500 max-w-md mt-1">
                    Todos os materiais filtrados possuem estoque suficiente para cobrir o consumo previsto até {purchasePlanningSummary.targetPeriodLabel}.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs text-[11px] font-black text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3">Material / Insumo</th>
                      <th className="py-3 px-2.5 text-center">Estoque Atual</th>
                      <th className="py-3 px-2.5 text-center">Consumo Semanal</th>
                      <th className="py-3 px-2.5 text-center">Duração Atual</th>
                      <th className="py-3 px-2.5 text-center">Demanda ({purchasePlanningSummary.totalTargetWeeks} sem)</th>
                      <th className="py-3 px-2.5 text-center">Estoque Seg.</th>
                      <th className="py-3 px-2.5 text-center">Necessidade Total</th>
                      <th className="py-3 px-3 text-center bg-rose-100/60 text-rose-900 border-x border-rose-200">QTD A COMPRAR</th>
                      <th className="py-3 px-2.5 text-right">Vlr. Unitário</th>
                      <th className="py-3 px-2.5 text-right">Custo Estimado</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {purchasePlanningSummary.items.map((item) => {
                      const unit = item.unit_measure ? ` ${item.unit_measure}` : '';
                      const isDeficit = item.quantityToBuy > 0;
                      
                      return (
                        <tr key={item.name} className="hover:bg-slate-50/80 transition-colors">
                          {/* Name & Category */}
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-900">{item.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span 
                                className="inline-block w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: CATEGORY_COLORS[item.category] || '#64748b' }}
                              />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {item.category || 'Geral'}
                              </span>
                            </div>
                          </td>

                          {/* Current Stock */}
                          <td className="py-3 px-2.5 text-center">
                            <span className={`font-black ${item.currentStock === 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                              {item.currentStock}{unit}
                            </span>
                          </td>

                          {/* Weekly Consumption */}
                          <td className="py-3 px-2.5 text-center font-bold text-slate-600">
                            {item.weeklyRate > 0 ? `${item.weeklyRate.toFixed(1)}/sem` : '0.0/sem'}
                          </td>

                          {/* Current Duration */}
                          <td className="py-3 px-2.5 text-center">
                            {item.durationWeeks === 'infinite' ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-600">
                                Indeterminado (∞)
                              </span>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className={`font-black ${item.durationWeeks <= 4 ? 'text-rose-600' : item.durationWeeks <= 8 ? 'text-amber-600' : 'text-slate-800'}`}>
                                  {item.durationWeeks.toFixed(1)} sem
                                </span>
                                <span className="text-[9px] font-semibold text-slate-400">
                                  Dura até {item.durationMonthInfo.monthYear}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Period Demand */}
                          <td className="py-3 px-2.5 text-center font-bold text-slate-700">
                            {item.periodDemand}{unit}
                          </td>

                          {/* Safety Stock */}
                          <td className="py-3 px-2.5 text-center font-bold text-slate-500">
                            +{item.safetyStock}{unit}
                          </td>

                          {/* Total Required */}
                          <td className="py-3 px-2.5 text-center font-black text-slate-800">
                            {item.totalRequired}{unit}
                          </td>

                          {/* Quantity to Buy */}
                          <td className="py-3 px-3 text-center bg-rose-50/50 border-x border-rose-100">
                            {isDeficit ? (
                              <span className="px-3 py-1 rounded-xl text-xs font-black bg-rose-600 text-white shadow-2xs inline-block">
                                +{item.quantityToBuy.toLocaleString('pt-BR')}{unit}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-emerald-100 text-emerald-800 inline-block">
                                Suficiente (0)
                              </span>
                            )}
                          </td>

                          {/* Unit Price */}
                          <td className="py-3 px-2.5 text-right font-bold text-slate-600">
                            {item.unitPrice > 0 
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)
                              : '---'}
                          </td>

                          {/* Total Cost */}
                          <td className="py-3 px-2.5 text-right font-black text-slate-900">
                            {item.totalEstimatedCost > 0 
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.totalEstimatedCost)
                              : '---'}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center">
                            {item.status === 'ZERADO_SEM_ESTOQUE' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                Zerado / Ruptura
                              </span>
                            )}
                            {item.status === 'DEFICIT_CRITICO' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                Déficit Imediato
                              </span>
                            )}
                            {item.status === 'DEFICIT_MODERADO' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                                Repor p/ Período
                              </span>
                            )}
                            {item.status === 'COBRE_TOTAL' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Atende até o Mês
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Sparkles size={15} className="text-indigo-600 shrink-0" />
                <span>Os cálculos usam a média semanal de saídas reais dos últimos 21 dias para projetar o consumo com precisão.</span>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowPurchasePlanningModal(false)}
                  className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all text-xs cursor-pointer"
                >
                  Fechar Painel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Room Inventory Modal */}
      <AnimatePresence>
        {showRoomInventoryModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-[95vw] lg:w-full lg:max-w-2xl rounded-[32px] p-4 sm:p-8 shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-black text-[#1C1917] flex items-center gap-3">
                    <Printer className="text-blue-600" size={28} />
                    Mapa de Sala (Porta)
                  </h3>
                  <p className="text-sm text-[#78716C] mt-1 font-medium italic">Selecione a sala e as categorias para o documento de estoque</p>
                </div>
                <button 
                  onClick={() => setShowRoomInventoryModal(false)}
                  className="p-2 hover:bg-[#F5F5F4] rounded-full transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-8 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {/* Room Selection */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-[#1C1917] uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                    1. Selecione a Sala
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {ROOMS.map(room => (
                      <button 
                        key={room}
                        onClick={() => {
                          setSelectedRoom(room);
                          setCustomRoomName(room);
                        }}
                        className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all text-left flex flex-col gap-1 ${
                          selectedRoom === room 
                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md' 
                            : 'border-[#E7E5E4] hover:border-blue-200 hover:bg-slate-50 text-[#44403C]'
                        }`}
                      >
                        <span className="opacity-70 text-[10px] uppercase">Local</span>
                        {room}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Name */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-[#1C1917] uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                    2. Nome da Sala no Relatório (Editável)
                  </h3>
                  <input 
                    type="text"
                    value={customRoomName}
                    onChange={(e) => setCustomRoomName(e.target.value)}
                    className="w-full px-6 py-4 bg-[#FAFAF9] border-2 border-[#E7E5E4] rounded-2xl text-sm font-bold focus:border-blue-600 transition-all outline-none"
                    placeholder="Ex: Sala de Curativos, Emergência..."
                  />
                </div>

                {/* Categories Selection */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-[#1C1917] uppercase tracking-widest flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                      3. Filtrar Categorias
                    </h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedRoomCategories([...categories])}
                        className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-tighter"
                      >
                        Marcar Todas
                      </button>
                      <span className="text-[#D6D3D1]">|</span>
                      <button 
                        onClick={() => setSelectedRoomCategories([])}
                        className="text-[10px] font-bold text-red-600 hover:underline uppercase tracking-tighter"
                      >
                        Desmarcar Todas
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {categories.map(category => (
                      <label 
                        key={category}
                        className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E7E5E4] hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <input 
                          type="checkbox" 
                          checked={selectedRoomCategories.includes(category)}
                          onChange={() => {
                            if (selectedRoomCategories.includes(category)) {
                              setSelectedRoomCategories(selectedRoomCategories.filter(c => c !== category));
                            } else {
                              setSelectedRoomCategories([...selectedRoomCategories, category]);
                            }
                          }}
                          className="w-4 h-4 rounded border-[#D6D3D1] text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-[#44403C] truncate">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 italic">
                  <div className="flex items-start gap-3">
                    <Info size={18} className="text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-blue-900 mb-1">Informações do Documento</h4>
                      <p className="text-xs text-blue-800 leading-relaxed">
                        Será gerado um PDF formatado para impressão contendo os itens de <strong>{selectedRoom}</strong> 
                        com o título personalizado <strong>"{customRoomName}"</strong> 
                        que pertencem às <strong>{selectedRoomCategories.length}</strong> categorias selecionadas.
                        O relatório inclui lote, validade e situação do estoque em dias.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-[#E7E5E4] flex gap-4">
                <button 
                  onClick={() => setShowRoomInventoryModal(false)}
                  className="flex-1 py-4 px-6 border-2 border-[#E7E5E4] text-[#78716C] rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-[#F5F5F4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    handleExportRoomInventoryPDF(selectedRoom, customRoomName, selectedRoomCategories);
                    setShowRoomInventoryModal(false);
                  }}
                  disabled={selectedRoomCategories.length === 0}
                  className="flex-[2] py-4 px-6 bg-blue-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  <Printer size={18} />
                  Gerar Mapa de Sala
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showRequestDetailModal.show && showRequestDetailModal.request && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-3xl rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-[#1C1917]">{showRequestDetailModal.request.isReturn ? 'Detalhes da Devolução' : 'Detalhes da Solicitação'}</h3>
                <p className="text-sm text-[#78716C] font-bold">#{showRequestDetailModal.request.id.slice(-5).toUpperCase()} - {new Date(showRequestDetailModal.request.date).toLocaleDateString('pt-BR')}</p>
              </div>
              <button 
                onClick={() => setShowRequestDetailModal({ show: false })}
                className="p-2 hover:bg-[#F5F5F4] rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">SETOR SOLICITANTE</p>
                <p className="text-lg font-black text-emerald-900">{showRequestDetailModal.request.sector}</p>
                <p className="text-xs text-emerald-700/70 font-medium">{showRequestDetailModal.request.requesterEmail}</p>
              </div>
              <div className="p-4 bg-[#FAFAF9] rounded-2xl border border-[#E7E5E4]">
                <p className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-widest mb-1">Status Atual</p>
                <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                  showRequestDetailModal.request.status === 'PENDENTE' ? 'bg-amber-100 text-amber-600' :
                  showRequestDetailModal.request.status === 'EM_SEPARACAO' ? 'bg-purple-100 text-purple-600' :
                  showRequestDetailModal.request.status === 'APROVADO' ? 'bg-blue-100 text-blue-600' :
                  showRequestDetailModal.request.status === 'ENTREGUE' ? 'bg-emerald-100 text-emerald-600' :
                  showRequestDetailModal.request.status === 'RECUSADO' ? 'bg-rose-100 text-rose-600' :
                  showRequestDetailModal.request.status === 'DEVOLUCAO_PENDENTE' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                  showRequestDetailModal.request.status === 'DEVOLUCAO_APROVADA' ? 'bg-emerald-100 text-emerald-700' :
                  showRequestDetailModal.request.status === 'DEVOLUCAO_RECUSADA' ? 'bg-rose-100 text-rose-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {showRequestDetailModal.request.status === 'EM_SEPARACAO' ? 'EM SEPARAÇÃO' : 
                   showRequestDetailModal.request.status === 'DEVOLUCAO_PENDENTE' ? 'DEVOLUÇÃO PENDENTE' :
                   showRequestDetailModal.request.status === 'DEVOLUCAO_APROVADA' ? 'DEVOLUÇÃO APROVADA' :
                   showRequestDetailModal.request.status === 'DEVOLUCAO_RECUSADA' ? 'DEVOLUÇÃO RECUSADA' :
                   showRequestDetailModal.request.status}
                </span>
              </div>
            </div>

            {showRequestDetailModal.request.isReturn && showRequestDetailModal.request.returnReason && (
              <div className="mb-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Motivo da Devolução</p>
                <p className="text-sm font-black text-amber-900">{showRequestDetailModal.request.returnReason}</p>
              </div>
            )}

            {showRequestDetailModal.request.observation && (
              <div className="mb-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">
                  {showRequestDetailModal.request.isReturn ? 'Observação da Devolução' : 'Observação do Solicitante'}
                </p>
                <p className="text-sm text-amber-800 italic">"{showRequestDetailModal.request.observation}"</p>
              </div>
            )}

            {showRequestDetailModal.request.adminObservation && (
              <div className={`mb-8 p-5 rounded-[24px] border-2 ${
                showRequestDetailModal.request.status === 'RECUSADO' 
                  ? 'bg-rose-50 border-rose-100 text-rose-900' 
                  : 'bg-blue-50 border-blue-100 text-blue-900'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {showRequestDetailModal.request.status === 'RECUSADO' ? (
                    <AlertTriangle size={18} className="text-rose-600" />
                  ) : (
                    <Info size={18} className="text-blue-600" />
                  )}
                  <p className={`text-[10px] font-black uppercase tracking-widest ${
                    showRequestDetailModal.request.status === 'RECUSADO' ? 'text-rose-600' : 'text-blue-600'
                  }`}>
                    {showRequestDetailModal.request.status === 'RECUSADO' ? 'Motivo da Recusa' : 'Observação do Administrador'}
                  </p>
                </div>
                <p className="text-sm font-medium italic">"{showRequestDetailModal.request.adminObservation}"</p>
              </div>
            )}

            {showRequestDetailModal.request.status === 'ENTREGUE' && (
              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <button 
                  onClick={() => {
                    const itemsForReceipt = allRequestItems
                      .filter(ri => ri.request_id === showRequestDetailModal.request?.id)
                      .map(i => ({
                        product_name: i.product_name,
                        quantity: i.quantity_approved || 0
                      }));
                    
                    if (itemsForReceipt.length > 0 && showRequestDetailModal.request) {
                      handleExportDeliveryReceiptPDF({
                        sector: showRequestDetailModal.request.sector,
                        items: itemsForReceipt,
                        requestId: showRequestDetailModal.request.id,
                        date: showRequestDetailModal.request.deliveredAt || showRequestDetailModal.request.date
                      });
                    }
                  }}
                  className="flex-1 py-4 px-6 bg-emerald-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3"
                >
                  <Printer size={18} />
                  Reimprimir Comprovante
                </button>
                {!showRequestDetailModal.request.isReturn && (isAdmin || userProfile?.sector === showRequestDetailModal.request.sector || showRequestDetailModal.request.requesterEmail === user?.email) && (
                  <button 
                    onClick={() => {
                      const reqItems = allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request!.id);
                      const basketItems = reqItems.map(ri => {
                        const alreadyReturned = ri.quantity_returned || 0;
                        const remaining = ri.quantity_approved - alreadyReturned;
                        const productBatches = items.filter(item => !item.deletedAt && item.name === ri.product_name);
                        return {
                          product_id: ri.product_id,
                          product_name: ri.product_name,
                          quantity: remaining,
                          maxQty: remaining,
                          selectedBatchId: ri.batch_id || productBatches[0]?.id || ''
                        };
                      }).filter(item => item.quantity > 0);

                      if (basketItems.length === 0) {
                        showToast("Todos os itens desta entrega já foram totalmente devolvidos.", "info");
                        return;
                      }

                      setDevolutionBasket(basketItems);
                      setDevolutionReason('Não teve uso');
                      setDevolutionObservation('');
                      setShowRequestDetailModal({ show: false });
                      setShowDevolutionModal({ show: true, request: showRequestDetailModal.request });
                    }}
                    className="flex-1 py-4 px-6 bg-amber-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-xl shadow-amber-200 flex items-center justify-center gap-3 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <RotateCcw size={18} />
                    Devolver Materiais
                  </button>
                )}
              </div>
            )}

            {isAdmin && showRequestDetailModal.request.status !== 'ENTREGUE' && (
              <div className="mb-8">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-widest block">
                    {showRequestDetailModal.request.status === 'RECUSADO' ? 'Editar Motivo da Recusa' : 'Observação do Administrador (Opcional)'}
                  </label>
                  {showRequestDetailModal.request.status !== 'PENDENTE' && (
                    <button 
                      onClick={() => handleUpdateObservation(showRequestDetailModal.request!.id)}
                      className="text-[10px] font-bold text-blue-600 uppercase hover:underline"
                    >
                      Salvar Apenas Observação
                    </button>
                  )}
                </div>
                <textarea
                  value={adminObservation}
                  onChange={(e) => setAdminObservation(e.target.value)}
                  placeholder={showRequestDetailModal.request.status === 'RECUSADO' ? "Explique o motivo da recusa..." : "Explique alterações ou adicione informações..."}
                  className="w-full p-4 bg-[#FAFAF9] border border-[#E7E5E4] rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px]"
                />
              </div>
            )}

            {isAdmin && (showRequestDetailModal.request.status === 'PENDENTE' || showRequestDetailModal.request.status === 'EM_SEPARACAO') && (
              <div className="mb-8 p-6 bg-blue-50/50 border border-blue-100 rounded-3xl">
                <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3">Adicionar Material Esquecido</label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Pesquisar material para adicionar..."
                      className="w-full pl-12 pr-4 py-3 bg-white border border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm transition-all shadow-sm"
                      value={adminAddItemSearch}
                      onChange={(e) => setAdminAddItemSearch(e.target.value)}
                    />
                  </div>

                  {adminAddItemSearch.length >= 2 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute z-50 w-full mt-2 bg-white border border-[#E7E5E4] rounded-xl shadow-2xl overflow-hidden max-h-[250px] overflow-y-auto"
                    >
                      {(() => {
                        const allActiveGroups: Record<string, {name: string, category: string, id: string}> = {};
                        items.filter(i => !i.deletedAt && i.quantity > 0).forEach(i => {
                          if (!allActiveGroups[i.name]) {
                            allActiveGroups[i.name] = { name: i.name, category: i.category || 'Outros', id: i.id };
                          }
                        });

                        const filtered = Object.values(allActiveGroups)
                          .filter(group => normalizeString(group.name).includes(normalizeString(adminAddItemSearch)))
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .slice(0, 5);

                        if (filtered.length === 0) {
                          return <div className="p-4 text-center text-xs text-gray-500">Nenhum material encontrado.</div>;
                        }

                        return filtered.map(group => (
                          <button
                            key={group.name}
                            type="button"
                            onClick={() => handleAddExtraItemToRequest(showRequestDetailModal.request!.id, group.name, group.id)}
                            disabled={isAdminAddingItem}
                            className="w-full px-4 py-3 hover:bg-blue-50 flex items-center justify-between text-left transition-colors border-b border-[#F5F5F4] last:border-0"
                          >
                            <div>
                              <p className="text-sm font-bold text-[#1C1917]">{group.name}</p>
                              <p className="text-[10px] text-[#A8A29E] uppercase font-bold">{group.category}</p>
                            </div>
                            <Plus size={16} className="text-blue-600" />
                          </button>
                        ));
                      })()}
                    </motion.div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4 mb-8">
              <h4 className="font-bold text-[#1C1917] flex items-center gap-2">
                <Package size={18} /> {showRequestDetailModal.request.isReturn ? 'Itens a Devolver' : 'Itens Solicitados'}
              </h4>
              <div className="bg-white rounded-2xl border border-[#E7E5E4] overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                      <th className="px-4 py-3 font-bold text-xs text-[#78716C]">Item</th>
                      <th className="px-4 py-3 font-bold text-xs text-[#78716C] text-center">{showRequestDetailModal.request.isReturn ? 'Qtd. Devolvida' : 'Qtd. Solicitada'}</th>
                      {!showRequestDetailModal.request.isReturn && isAdmin && <th className="px-4 py-3 font-bold text-xs text-[#78716C] text-center">Saldo em Estoque</th>}
                      {!showRequestDetailModal.request.isReturn && <th className="px-4 py-3 font-bold text-xs text-[#78716C] text-center">Qtd. Liberada</th>}
                      {showRequestDetailModal.request.isReturn && <th className="px-4 py-3 font-bold text-xs text-[#78716C] text-center">Lote de Destino</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E5E4]">
                    {allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request?.id).map(item => {
                      // Calcular estoque atual deste item (somando todos os lotes)
                      const totalStock = items
                        .filter(i => !i.deletedAt && i.name === item.product_name)
                        .reduce((sum, i) => sum + i.quantity, 0);

                      const matchedBatch = items.find(i => i.id === item.batch_id);
                        
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-bold text-[#1C1917]">{item.product_name}</td>
                          <td className="px-4 py-3 text-sm font-bold text-center text-[#78716C] bg-slate-50/50">
                            {showRequestDetailModal.request.isReturn ? item.quantity_approved : item.quantity_requested}
                          </td>
                          {!showRequestDetailModal.request.isReturn && isAdmin && (
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center">
                                <span className={`text-sm font-black ${totalStock <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {totalStock}
                                </span>
                                {totalStock < item.quantity_requested && totalStock > 0 && (
                                  <span className="text-[9px] text-amber-600 font-bold uppercase leading-none">Estoque Insuficiente</span>
                                )}
                              </div>
                            </td>
                          )}
                          {!showRequestDetailModal.request.isReturn && (
                            <td className="px-4 py-3 text-center">
                              {isAdmin && (showRequestDetailModal.request?.status === 'PENDENTE' || showRequestDetailModal.request?.status === 'EM_SEPARACAO') ? (
                                <div className="flex justify-center">
                                  <input 
                                    type="number" 
                                    min="0"
                                    value={item.quantity_approved}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      setAllRequestItems(allRequestItems.map(ri => ri.id === item.id ? { ...ri, quantity_approved: val } : ri));
                                    }}
                                    className={`w-20 px-3 py-2 border-2 rounded-xl text-center font-black text-sm transition-all outline-none ${
                                      item.quantity_approved > totalStock 
                                        ? 'bg-rose-50 border-rose-200 text-rose-700 focus:border-rose-500' 
                                        : 'bg-white border-blue-100 text-blue-700 focus:border-blue-500'
                                    }`}
                                  />
                                </div>
                              ) : (
                                <span className="text-sm font-black text-[#1C1917]">{item.quantity_approved}</span>
                              )}
                            </td>
                          )}
                          {showRequestDetailModal.request.isReturn && (
                            <td className="px-4 py-3 text-center text-xs font-bold text-[#57534E]">
                              {matchedBatch ? `Lote: ${matchedBatch.batch_number}` : 'Qualquer Lote Ativo'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {isAdmin && (
              <div className="flex flex-col gap-3 w-full">
                <div className="flex gap-3 w-full">
                  {/* PENDENTE or EM_SEPARACAO Actions */}
                  {!showRequestDetailModal.request.isReturn && (showRequestDetailModal.request.status === 'PENDENTE' || showRequestDetailModal.request.status === 'EM_SEPARACAO') && (
                    <>
                      <button 
                        onClick={() => handleRejectRequest(showRequestDetailModal.request!.id)}
                        className="flex-1 py-3 bg-rose-100 text-rose-600 rounded-xl font-bold hover:bg-rose-200 transition-all"
                      >
                        Recusar
                      </button>

                      {showRequestDetailModal.request.isNewFlow ? (
                        <button 
                          onClick={() => handleApproveAndDeliverNewRequest(showRequestDetailModal.request!.id, allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request?.id))}
                          className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={18} /> Dar Baixa no Estoque
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleApproveRequest(showRequestDetailModal.request!.id, allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request?.id))}
                          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                        >
                          Aprovar Solicitação
                        </button>
                      )}
                    </>
                  )}

                  {/* DEVOLUCAO_PENDENTE Actions */}
                  {showRequestDetailModal.request.isReturn && showRequestDetailModal.request.status === 'DEVOLUCAO_PENDENTE' && (
                    <>
                      <button 
                        onClick={() => handleRejectDevolution(showRequestDetailModal.request!.id)}
                        disabled={isProcessingDevolution}
                        className="flex-1 py-4 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
                      >
                        Recusar Devolução
                      </button>
                      <button 
                        onClick={() => handleApproveDevolution(showRequestDetailModal.request!.id, allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request?.id))}
                        disabled={isProcessingDevolution}
                        className="flex-1 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        {isProcessingDevolution ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                          <>
                            <CheckCircle size={18} />
                            Aprovar Devolução
                          </>
                        )}
                      </button>
                    </>
                  )}

                  {/* Old flow APROVADO delivery action */}
                  {!showRequestDetailModal.request.isReturn && !showRequestDetailModal.request.isNewFlow && showRequestDetailModal.request.status === 'APROVADO' && (
                    <button 
                      onClick={() => handleDeliverRequest(showRequestDetailModal.request!.id, allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request?.id))}
                      className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg"
                    >
                      <CheckCircle size={20} /> Confirmar Entrega e Baixar Estoque
                    </button>
                  )}
                </div>
              </div>
            )}

            {!isAdmin && showRequestDetailModal.request.status === 'PENDENTE' && showRequestDetailModal.request.requesterEmail === user?.email && (
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setShowRequestDetailModal({ show: false });
                    handleEditRequest(showRequestDetailModal.request!);
                  }}
                  className="flex-1 py-3 bg-blue-100 text-blue-600 rounded-xl font-bold hover:bg-blue-200 transition-all flex items-center justify-center gap-2"
                >
                  <Edit2 size={18} /> Editar Solicitação
                </button>
                <button 
                  onClick={() => {
                    setShowRequestDetailModal({ show: false });
                    handleDeleteRequest(showRequestDetailModal.request!.id);
                  }}
                  className="flex-1 py-3 bg-rose-100 text-rose-600 rounded-xl font-bold hover:bg-rose-200 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} /> Excluir Solicitação
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {showDevolutionModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl w-full max-w-3xl p-6 sm:p-8 relative max-h-[92vh] overflow-y-auto space-y-6"
          >
            {/* Close Button */}
            <button 
              onClick={() => setShowDevolutionModal({ show: false })}
              className="absolute right-6 top-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500 hover:text-slate-800"
            >
              <X size={18} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3.5 pb-2 border-b border-slate-100">
              <div className="bg-amber-500/10 p-3 rounded-2xl text-amber-700 border border-amber-200/50">
                <RotateCcw size={22} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Nova Devolução de Materiais</h3>
                <p className="text-slate-500 text-xs sm:text-sm font-medium">Setor de origem: <span className="font-bold text-amber-700">{selectedSector}</span></p>
              </div>
            </div>

            {/* Notice Callout */}
            <div className="bg-amber-50/70 border border-amber-200/70 p-4 rounded-2xl text-slate-700 text-xs font-medium flex gap-3 items-start">
              <div className="p-1 text-amber-600 shrink-0 mt-0.5">
                <RotateCcw size={16} />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-amber-900">Como funciona a devolução?</p>
                <p className="text-slate-600 leading-relaxed">
                  Os itens adicionados nesta solicitação serão avaliados pelo almoxarifado. Após a aprovação, as quantidades indicadas retornarão automaticamente ao saldo do estoque.
                </p>
              </div>
            </div>

            {/* Form Fields: Motivo & Observações */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
                  Motivo da Devolução <span className="text-rose-500">*</span>
                </label>
                <select 
                  value={devolutionReason}
                  onChange={(e) => setDevolutionReason(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-bold text-slate-800"
                >
                  <option value="Não teve uso">Não teve uso</option>
                  <option value="Vencido">Vencido</option>
                  <option value="Validade próxima">Validade próxima</option>
                  <option value="Material danificado">Material danificado</option>
                  <option value="Erro na solicitação">Erro na solicitação</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
                  Observações / Detalhes
                </label>
                <input 
                  type="text"
                  value={devolutionObservation}
                  onChange={(e) => setDevolutionObservation(e.target.value)}
                  placeholder="Ex: Material sobrou após procedimento..."
                  className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-medium text-slate-800"
                />
              </div>
            </div>

            {/* Add Item Selector Section */}
            {(() => {
              // 1. Fetch items currently in sector stock
              const sectorStockItems = items.filter(i => 
                !i.deletedAt && 
                (i.location === selectedSector || (selectedSector === 'Farmácia' && i.location === 'Farmácia')) && 
                i.quantity > 0
              );

              // 2. Fetch delivered request items
              const deliveredReqs = requests.filter(r => r.sector === selectedSector && r.status === 'ENTREGUE' && !r.deletedAt);
              const reqIds = new Set(deliveredReqs.map(r => r.id));
              const productMap: Record<string, { product_id: string, product_name: string, quantity_approved: number, quantity_returned: number, batch_id: string }> = {};
              
              allRequestItems.forEach(ri => {
                if (reqIds.has(ri.request_id)) {
                  const remaining = ri.quantity_approved - (ri.quantity_returned || 0);
                  if (remaining > 0) {
                    if (!productMap[ri.product_name]) {
                      productMap[ri.product_name] = {
                        product_id: ri.product_id,
                        product_name: ri.product_name,
                        quantity_approved: 0,
                        quantity_returned: 0,
                        batch_id: ri.batch_id || ''
                      };
                    }
                    productMap[ri.product_name].quantity_approved += ri.quantity_approved;
                    productMap[ri.product_name].quantity_returned += (ri.quantity_returned || 0);
                  }
                }
              });
              
              const sectorDeliveredItems = Object.values(productMap).map(p => ({
                ...p,
                available: p.quantity_approved - p.quantity_returned
              })).filter(p => p.available > 0);

              // 3. Find expired items in sector stock
              const expiredSectorItems = sectorStockItems.filter(i => isExpired(i));

              // 4. Combine options for dropdown
              const returnableMap: Record<string, { key: string, product_id: string, product_name: string, available: number, batch_id: string, isFromStock?: boolean }> = {};

              sectorStockItems.forEach(sItem => {
                returnableMap[`stock-${sItem.id}`] = {
                  key: `stock-${sItem.id}`,
                  product_id: sItem.id,
                  product_name: `${sItem.name} [Lote: ${sItem.batch_number || 'S/N'}]`,
                  available: sItem.quantity,
                  batch_id: sItem.id,
                  isFromStock: true
                };
              });

              sectorDeliveredItems.forEach(dItem => {
                if (!returnableMap[`req-${dItem.product_id}`]) {
                  returnableMap[`req-${dItem.product_id}`] = {
                    key: `req-${dItem.product_id}`,
                    product_id: dItem.product_id,
                    product_name: dItem.product_name,
                    available: dItem.available,
                    batch_id: dItem.batch_id
                  };
                }
              });

              const availableOptions = Object.values(returnableMap);

              return (
                <div className="space-y-4">
                  {/* Expired Items Highlight Banner */}
                  {expiredSectorItems.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-rose-800 font-black text-xs uppercase tracking-wider">
                          <AlertTriangle size={16} className="text-rose-600" />
                          Materiais Vencidos no Estoque ({selectedSector})
                        </div>
                        <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200">
                          {expiredSectorItems.length} {expiredSectorItems.length === 1 ? 'item vencido' : 'itens vencidos'}
                        </span>
                      </div>
                      <p className="text-xs text-rose-700 leading-relaxed">
                        Detectamos materiais com validade expirada no estoque do seu setor. Clique no botão ao lado de cada item para adicioná-lo automaticamente para devolução ao almoxarifado:
                      </p>
                      <div className="space-y-2">
                        {expiredSectorItems.map(expItem => {
                          const isAlreadyInBasket = devolutionBasket.some(b => b.product_name === expItem.name && b.selectedBatchId === expItem.id);
                          return (
                            <div key={expItem.id} className="bg-white p-3 sm:p-3.5 rounded-xl border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                              <div>
                                <p className="font-bold text-xs text-slate-900">{expItem.name}</p>
                                <p className="text-[11px] text-slate-500 font-medium pt-0.5">
                                  Lote: <span className="font-bold text-slate-700">{expItem.batch_number || 'S/N'}</span> • Vencimento: <span className="font-bold text-rose-600">{new Date(expItem.expiry_date).toLocaleDateString('pt-BR')}</span> • Qtd Atual: <span className="font-bold text-slate-900">{expItem.quantity}</span>
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={isAlreadyInBasket}
                                onClick={() => {
                                  const newItem = {
                                    product_id: expItem.id,
                                    product_name: expItem.name,
                                    quantity: expItem.quantity,
                                    maxQty: expItem.quantity,
                                    selectedBatchId: expItem.id
                                  };
                                  setDevolutionBasket([...devolutionBasket, newItem]);
                                  setDevolutionReason('Vencido');
                                  setDevolutionObservation(`Devolução de material vencido em ${new Date(expItem.expiry_date).toLocaleDateString('pt-BR')} (Lote: ${expItem.batch_number || 'S/N'})`);
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shrink-0 ${
                                  isAlreadyInBasket 
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                                }`}
                              >
                                {isAlreadyInBasket ? 'Já Adicionado' : 'Devolver (Vencido)'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Standard Add Item Dropdown */}
                  <div className="bg-slate-50/80 p-4.5 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Plus size={15} className="text-amber-600" /> Selecionar Material do Estoque do Setor
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <select
                        value={selectedDevProduct}
                        onChange={(e) => setSelectedDevProduct(e.target.value)}
                        className="flex-1 p-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold text-slate-800"
                      >
                        <option value="">-- Selecione o Material para Devolução --</option>
                        {availableOptions
                          .filter(p => !devolutionBasket.some(b => b.product_name === p.product_name || b.product_id === p.product_id))
                          .map(p => (
                            <option key={p.key} value={p.key}>
                              {p.product_name} (Disponível: {p.available})
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedDevProduct) return;
                          const matched = availableOptions.find(p => p.key === selectedDevProduct);
                          if (matched) {
                            const productBatches = items.filter(i => !i.deletedAt && i.name === matched.product_name);
                            const newItem = {
                              product_id: matched.product_id,
                              product_name: matched.product_name.split(' [Lote:')[0],
                              quantity: 1,
                              maxQty: matched.available,
                              selectedBatchId: matched.batch_id || productBatches[0]?.id || ''
                            };
                            setDevolutionBasket([...devolutionBasket, newItem]);
                            setSelectedDevProduct('');
                          }
                        }}
                        disabled={!selectedDevProduct}
                        className="bg-slate-900 text-white px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Plus size={16} /> Adicionar Item
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* List of items in devolution basket */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Package size={16} className="text-amber-600" /> Itens na Lista de Devolução
                </h4>
                {devolutionBasket.length > 0 && (
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                    {devolutionBasket.length} {devolutionBasket.length === 1 ? 'item' : 'itens'}
                  </span>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                {devolutionBasket.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {devolutionBasket.map((item, idx) => {
                      const productBatches = items.filter(i => !i.deletedAt && i.name === item.product_name);
                      return (
                        <div key={item.product_name} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-slate-900">{item.product_name}</span>
                              <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                Máx. {item.maxQty}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-400">Lote:</span>
                              {productBatches.length > 0 ? (
                                <select 
                                  value={item.selectedBatchId}
                                  onChange={(e) => {
                                    const updated = [...devolutionBasket];
                                    updated[idx].selectedBatchId = e.target.value;
                                    setDevolutionBasket(updated);
                                  }}
                                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                >
                                  {productBatches.map(b => (
                                    <option key={b.id} value={b.id}>
                                      {b.batch_number || 'S/N'} {b.expiry_date !== 'Indeterminada' ? `(val: ${new Date(b.expiry_date).toLocaleDateString('pt-BR')})` : ''}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-rose-500 font-bold">Sem lote cadastrado</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                            <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...devolutionBasket];
                                  updated[idx].quantity = Math.max(1, item.quantity - 1);
                                  setDevolutionBasket(updated);
                                }}
                                disabled={item.quantity <= 1}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-2xs hover:bg-slate-200 text-slate-700 disabled:opacity-30 transition-all font-black text-base cursor-pointer"
                              >
                                -
                              </button>
                              <input 
                                type="number" 
                                min="1"
                                max={item.maxQty}
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = Math.min(item.maxQty, Math.max(1, parseInt(e.target.value) || 1));
                                  const updated = [...devolutionBasket];
                                  updated[idx].quantity = val;
                                  setDevolutionBasket(updated);
                                }}
                                className="w-12 h-8 text-center font-black text-sm outline-none bg-transparent text-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...devolutionBasket];
                                  updated[idx].quantity = Math.min(item.maxQty, item.quantity + 1);
                                  setDevolutionBasket(updated);
                                }}
                                disabled={item.quantity >= item.maxQty}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-2xs hover:bg-slate-200 text-slate-700 disabled:opacity-30 transition-all font-black text-base cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const updated = devolutionBasket.filter((_, i) => i !== idx);
                                setDevolutionBasket(updated);
                              }}
                              className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all"
                              title="Remover da lista"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs font-semibold space-y-1">
                    <Package className="mx-auto text-slate-300 mb-2" size={32} />
                    <p className="font-bold text-slate-600">Nenhum item selecionado para devolução.</p>
                    <p>Selecione um material no seletor acima para adicionar a esta solicitação.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-100">
              <button 
                onClick={() => setShowDevolutionModal({ show: false })}
                className="order-2 sm:order-1 flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleRequestDevolution}
                disabled={isProcessingDevolution || devolutionBasket.length === 0}
                className="order-1 sm:order-2 flex-1 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isProcessingDevolution ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <RotateCcw size={16} />
                    Confirmar Devolução
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px] ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' :
              toast.type === 'error' ? 'bg-rose-600 text-white' :
              'bg-[#1C1917] text-white'
            }`}
          >
            {toast.type === 'success' && <CheckCircle size={20} />}
            {toast.type === 'error' && <AlertTriangle size={20} />}
            <p className="font-bold text-sm">{toast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Delete Confirmation Modal */}
      <AnimatePresence>
        {showUserDeleteConfirm.show && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black mb-2">Excluir Usuário?</h3>
              <p className="text-[#78716C] mb-8">
                Tem certeza que deseja excluir o acesso de <strong>{showUserDeleteConfirm.user?.name}</strong>? 
                Esta ação removerá o perfil do sistema.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowUserDeleteConfirm({ show: false })}
                  className="flex-1 py-3 bg-[#F5F5F4] text-[#57534E] rounded-xl font-bold hover:bg-[#E7E5E4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={async () => {
                    if (showUserDeleteConfirm.user) {
                      try {
                        await deleteDoc(doc(db, 'users', showUserDeleteConfirm.user.id));
                        showToast("Usuário excluído com sucesso!", "success");
                      } catch (error: any) {
                        showToast(`Erro ao excluir: ${error.message}`, "error");
                      }
                      setShowUserDeleteConfirm({ show: false });
                    }
                  }}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all"
                >
                  Sim, Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Stock Zero Acknowledge Confirmation Modal */}
      <AnimatePresence>
        {showStockConfirm.show && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-black mb-2 uppercase tracking-tight text-[#1C1917]">Confirmar Ciência?</h3>
              <p className="text-[#78716C] mb-8 font-medium">
                Deseja confirmar que está ciente de que o material <strong>"{showStockConfirm.itemName}"</strong> está com estoque zero? 
                Esta notificação será excluída.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowStockConfirm({ show: false })}
                  className="flex-1 py-3 bg-[#F5F5F4] text-[#57534E] rounded-xl font-bold hover:bg-[#E7E5E4] transition-all"
                >
                  Voltar
                </button>
                <button 
                  onClick={async () => {
                    if (showStockConfirm.notificationId) {
                      try {
                        const itemName = showStockConfirm.itemName;
                        if (itemName) {
                          const safeId = getSafeDocId(itemName);
                          await setDoc(doc(db, 'dismissed_stock_alerts', safeId), {
                            itemName: itemName,
                            dismissedAt: new Date().toISOString()
                          });
                        }
                        await deleteDoc(doc(db, 'notifications', showStockConfirm.notificationId));
                        showToast("Ciência confirmada! Notificação excluída.", "success");
                      } catch (error: any) {
                        showToast(`Erro ao confirmar: ${error.message}`, "error");
                      }
                      setShowStockConfirm({ show: false });
                    }
                  }}
                  className="flex-[1.5] py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-200"
                >
                  <Check size={18} /> Sim, Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
