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
  X,
  Check,
  Edit2,
  BarChart3,
  TrendingUp,
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
  Bell,
  Users,
  Info,
  Printer,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  deleteField
} from 'firebase/firestore';
import { 
  signInWithPopup, 
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
  batches: Item[];
  weeklyExitRate: number;
  durationWeeks: number | 'infinite';
}

const normalizeString = (str: string | null | undefined) => 
  (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const SECTORS = [
  'Imagem', 'Ilha', 'Pé Diabético', 'Direção', 'Setor Pessoal', 
  'CER', 'Setor de Terapias', 'SSVV', 'Recepção', 
  'Higienização', 'Manutenção', 'Almoxarifado',
  'Telefonia', 'Marcação', 'Entrega de Exames', 'Regulação',
  'Farmácia', 'CME', 'Envase', 'SESMT', 'Ouvidoria', 'Copa', 'Escritório da Qualidade', 'TI'
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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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
      return (
        <div className="min-h-screen bg-rose-50 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-rose-100">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-black text-center mb-4">Algo deu errado</h2>
            <p className="text-[#78716C] text-center mb-6">
              Ocorreu um erro inesperado. Por favor, recarregue a página ou entre em contato com o suporte.
            </p>
            <div className="bg-rose-50 p-4 rounded-xl mb-6 overflow-auto max-h-40">
              <code className="text-xs text-rose-700">
                {this.state.error?.message || "Erro desconhecido"}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all"
            >
              Recarregar Página
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
  const [authSector, setAuthSector] = useState('Administrativo');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'requests' | 'reports' | 'my-requests' | 'new-request' | 'users' | 'trash'>('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState<{show: boolean, type: 'entry' | 'exit', item?: Item}>({ show: false, type: 'entry' });
  const [transactionMinStock, setTransactionMinStock] = useState<number>(NaN);
  const [showDetailModal, setShowDetailModal] = useState<{show: boolean, type: 'low_stock' | 'expiry', items: (Item | ItemGroup)[]}>({ show: false, type: 'low_stock', items: [] });
  const [showDeleteModal, setShowDeleteModal] = useState<{show: boolean, transactionId?: string}>({ show: false });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [deletionReason, setDeletionReason] = useState('');
  const [showDeletedHistory, setShowDeletedHistory] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [inventorySort, setInventorySort] = useState<'name_asc' | 'name_desc' | 'duration_asc' | 'duration_desc'>('name_asc');
  const [inventoryLocation, setInventoryLocation] = useState<'Almoxarifado' | 'Farmácia'>('Almoxarifado');

  useEffect(() => {
    if (userProfile?.sector === 'Farmácia') {
      setInventoryLocation('Farmácia');
    } else {
      setInventoryLocation('Almoxarifado');
    }
  }, [userProfile?.sector]);
  
  const isAdmin = userProfile?.role === 'ADMIN' || 
                  user?.email === 'gerlianemagalhaes79@gmail.com' || 
                  user?.email === 'poli.almoxarifado@gmail.com' || 
                  userProfile?.sector === 'Almoxarifado';

  const weeklyExitRates = useMemo(() => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    const rates: Record<string, number> = {};
    
    transactions.forEach(t => {
      if (t.type === 'exit' && !t.deletedAt && new Date(t.date) >= sixtyDaysAgo) {
        rates[t.item_name] = (rates[t.item_name] || 0) + t.quantity;
      }
    });
    
    // Convert to weekly average (60 days is approx 8.57 weeks)
    Object.keys(rates).forEach(name => {
      rates[name] = rates[name] / (60 / 7);
    });
    
    return rates;
  }, [transactions]);

  // Request states
  const [requestBasket, setRequestBasket] = useState<{product_id: string, product_name: string, quantity: number}[]>([]);
  const [requestObservation, setRequestObservation] = useState('');
  const [adminObservation, setAdminObservation] = useState('');
  const [isSyncingStock, setIsSyncingStock] = useState(false);

  // Auto-update Minimum Stock based on consumption velocity (5 weeks coverage)
  useEffect(() => {
    if (!isAdmin || items.length === 0 || transactions.length === 0 || isSyncingStock) return;

    const syncStockVelocity = async () => {
      const updates: { id: string, newMin: number }[] = [];
      const now = new Date();
      
      // We only consider items with enough history (e.g., at least 1 exit in the last 60 days)
      Object.keys(weeklyExitRates).forEach(itemName => {
        const weeklyRate = weeklyExitRates[itemName];
        if (weeklyRate > 0) {
          const recommendedMin = Math.ceil(weeklyRate * 5);
          
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
  
  const createNotification = async (userId: string, title: string, message: string, requestId?: string) => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId,
        title,
        message,
        date: new Date().toISOString(),
        read: false,
        requestId
      });
    } catch (error) {
      console.error("Error creating notification:", error);
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
      unit_price: 0
    }]
  });
  const [categories, setCategories] = useState<string[]>(['Médico Hospitalar', 'Alimentício', 'Expediente', 'Higiene', 'Radiológico', 'Saneante', 'Copa & Cozinha', 'Papelaria', 'EPI', 'Gráfica', 'Informática', 'Limpeza', 'Anestésico', 'Medicamentos']);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

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
        unit_price: 0
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
          expiry_date: ''
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
          
          // Auto-fill min_quantity if name is changed and we have a calculated rate
          if (field === 'name' && processedValue) {
            const weeklyRate = weeklyExitRates[processedValue] || 0;
            if (weeklyRate > 0) {
              updatedItem.min_quantity = Math.ceil(weeklyRate * 5);
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
  
  const [transactionQty, setTransactionQty] = useState(1);
  const [exitReason, setExitReason] = useState<'consumo' | 'doacao' | 'vencido'>('consumo');
  const [expiryReason, setExpiryReason] = useState('');
  const [selectedSector, setSelectedSector] = useState(SECTORS[0]);
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
  const [originFilter, setOriginFilter] = useState<'all' | 'contract' | 'extra' | 'donation'>('all');

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingPrice, setEditingPrice] = useState<{ id: string, price: number } | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<{ id: string, quantity: number } | null>(null);
  const [editingMaterialName, setEditingMaterialName] = useState<{ oldName: string, newName: string } | null>(null);

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
      setEditingQuantity(null);
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
          const userSnap = await getDoc(userRef);

          // Special case for the master admins
          if (!userSnap.exists() && (userEmail === 'gerlianemagalhaes79@gmail.com' || userEmail === 'poli.almoxarifado@gmail.com')) {
            await setDoc(userRef, {
              email: userEmail,
              name: user.displayName || (userEmail === 'gerlianemagalhaes79@gmail.com' ? 'Admin' : 'Poli Almoxarifado'),
              role: 'ADMIN',
              sector: 'Almoxarifado',
              uid: user.uid,
              lastLogin: new Date().toISOString()
            });
          } else if (userSnap.exists()) {
            // Update existing profile with UID and last login
            await updateDoc(userRef, { 
              uid: user.uid,
              lastLogin: new Date().toISOString() 
            });
          } else {
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
              
              // Auto-select sector for the user
              if (profile.sector) {
                setSelectedSector(profile.sector);
              }

              // Redirect based on role
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
        console.error("Auth state change error:", error);
        showToast(`Erro na autenticação: ${error.message}`, "error");
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

    const unsubscribeNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('date', 'desc')),
      (snapshot) => {
        setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
      }
    );

    return () => {
      unsubscribeItems();
      unsubscribeTrans();
      unsubscribeRequests();
      unsubscribeReqItems();
      unsubscribeNotifications();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !userProfile) return;
    
    let unsubscribeUsers = () => {};
    if (user.email === 'gerlianemagalhaes79@gmail.com' || userProfile.role === 'ADMIN' || userProfile.sector === 'Almoxarifado') {
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
      if (error.code === 'auth/unauthorized-domain') {
        showToast("Erro: Domínio não autorizado. Você precisa adicionar o domínio do Vercel nas configurações do Firebase.", "error");
      } else if (error.code === 'auth/popup-blocked') {
        showToast("Erro: O popup de login foi bloqueado pelo seu navegador.", "error");
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
    if (!authEmail || !authName || !authSector) {
      showToast("Preencha todos os campos.", "error");
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
        sector: authSector,
        registeredAt: new Date().toISOString()
      }, { merge: true });
      
      showToast("Usuário pré-cadastrado com sucesso! Agora ele pode entrar usando o Google.", "success");
      setAuthEmail('');
      setAuthName('');
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
      setDeletionReason('');
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
    if (!userProfile?.sector) {
      showToast("Seu setor não está definido. Entre em contato com o administrador.", "error");
      return;
    }

    setIsSubmittingRequest(true);
    try {
      // Check stock availability for all items in the basket
      for (const basketItem of requestBasket) {
        const inventoryItem = groupedArray.find(gi => gi.name === basketItem.product_name);
        const totalAvailable = inventoryItem?.total_quantity || 0;
        
        if (basketItem.quantity > totalAvailable) {
          showToast(
            `Quantidade solicitada para "${basketItem.product_name}" (${basketItem.quantity}) é maior que o estoque total disponível (${totalAvailable}). Por favor, entre em contato com o responsável pelo almoxarifado para verificar a disponibilidade.`, 
            "error"
          );
          setIsSubmittingRequest(false);
          return;
        }
      }

      const requestData = {
        sector: userProfile.sector,
        date: editingRequest ? editingRequest.date : new Date().toISOString(),
        status: 'PENDENTE',
        observation: requestObservation,
        requesterEmail: user?.email || ''
      };

      let requestId = '';
      if (editingRequest) {
        requestId = editingRequest.id;
        await updateDoc(doc(db, 'requests', requestId), requestData);
        
        // Delete old items
        const oldItems = await getDocs(query(collection(db, 'request_items'), where('request_id', '==', requestId)));
        const deleteBatch = writeBatch(db);
        oldItems.docs.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
      } else {
        const requestRef = await addDoc(collection(db, 'requests'), requestData);
        requestId = requestRef.id;
      }

      const batch = writeBatch(db);
      requestBasket.forEach(item => {
        const itemRef = doc(collection(db, 'request_items'));
        batch.set(itemRef, {
          request_id: requestId,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity_requested: item.quantity,
          quantity_approved: item.quantity
        });
      });

      await batch.commit();

      if (!editingRequest) {
        // Notify Admins and Almoxarifado
        const adminQuery = query(collection(db, 'users'), where('role', '==', 'ADMIN'));
        const almoxarifadoQuery = query(collection(db, 'users'), where('sector', '==', 'Almoxarifado'));
        
        const [adminSnap, almoxSnap] = await Promise.all([
          getDocs(adminQuery),
          getDocs(almoxarifadoQuery)
        ]);

        const notifiedEmails = new Set<string>();
        
        const processSnap = (snap: any) => {
          snap.forEach((adminDoc: any) => {
            if (!notifiedEmails.has(adminDoc.id)) {
              createNotification(adminDoc.id, 'Nova Solicitação', `O setor ${userProfile.sector} enviou uma nova solicitação.`, requestId);
              notifiedEmails.add(adminDoc.id);
            }
          });
        };

        processSnap(adminSnap);
        processSnap(almoxSnap);
      }

      showToast(editingRequest ? "Solicitação atualizada com sucesso!" : "Solicitação enviada com sucesso!", "success");
      setRequestBasket([]);
      setRequestObservation('');
      setEditingRequest(null);
      setActiveTab('my-requests');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'requests');
      showToast(`Erro ao enviar solicitação: ${error.message}`, "error");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleEditRequest = (request: MaterialRequest) => {
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
      // Cleanup items
      const itemsSnap = await getDocs(query(collection(db, 'items')));
      for (const d of itemsSnap.docs) {
        const data = d.data();
        if (data.deletedAt && new Date(data.deletedAt) < threeDaysAgo) {
          await deleteDoc(doc(db, 'items', d.id));
        }
      }
      
      // Cleanup requests
      const requestsSnap = await getDocs(query(collection(db, 'requests')));
      for (const d of requestsSnap.docs) {
        const data = d.data();
        if (data.deletedAt && new Date(data.deletedAt) < threeDaysAgo) {
          await deleteDoc(doc(db, 'requests', d.id));
        }
      }

      // Cleanup transactions
      const transSnap = await getDocs(query(collection(db, 'transactions')));
      for (const d of transSnap.docs) {
        const data = d.data();
        if (data.deletedAt && new Date(data.deletedAt) < threeDaysAgo) {
          await deleteDoc(doc(db, 'transactions', d.id));
        }
      }
    } catch (error) {
      console.error("Error during cleanup:", error);
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

  const handlePrintRequests = () => {
    const filteredRequests = requests.filter(req => {
      if (req.deletedAt || req.status !== 'APROVADO') return false;
      const reqDate = req.date.split('T')[0];
      return reqDate >= printRange.start && reqDate <= printRange.end;
    });

    if (filteredRequests.length === 0) {
      showToast("Nenhuma solicitação aprovada encontrada para este período.", "info");
      return;
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
          <title>Solicitações Aprovadas - ${periodStr}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #1C1917; }
            h1 { text-align: center; border-bottom: 2px solid #1C1917; padding-bottom: 10px; font-size: 20px; }
            .request-card { border: 1px solid #E7E5E4; border-radius: 12px; padding: 15px; margin-bottom: 20px; page-break-inside: avoid; }
            .request-header { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: bold; border-bottom: 1px solid #F5F5F4; padding-bottom: 5px; font-size: 14px; }
            .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .items-table th, .items-table td { border: 1px solid #E7E5E4; padding: 8px; text-align: left; font-size: 12px; }
            .items-table th { background-color: #FAFAF9; }
            .justification { margin-top: 10px; font-style: italic; font-size: 12px; color: #57534E; background: #FAFAF9; padding: 8px; border-radius: 8px; border-left: 3px solid #E7E5E4; }
            .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #A8A29E; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Solicitações Aprovadas - ${periodStr}</h1>
          ${filteredRequests.map(req => {
            const items = allRequestItems.filter(ri => ri.request_id === req.id);
            return `
              <div class="request-card">
                <div class="request-header">
                  <span>Solicitação: #${req.id.slice(-5).toUpperCase()}</span>
                  <span>Setor: ${req.sector}</span>
                </div>
                <div style="font-size: 11px; margin-bottom: 10px; color: #78716C;">Solicitante: ${req.requesterEmail}</div>
                <table class="items-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th style="width: 80px; text-align: center;">Qtd Solicitada</th>
                      <th style="width: 80px; text-align: center;">Qtd Aprovada</th>
                      <th style="width: 100px; text-align: center;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map(item => `
                      <tr>
                        <td>${item.product_name}</td>
                        <td style="text-align: center;">${item.quantity_requested}</td>
                        <td style="text-align: center;">${item.quantity_approved !== undefined ? item.quantity_approved : item.quantity_requested}</td>
                        <td style="text-align: center;">${item.quantity_approved !== undefined && item.quantity_approved !== item.quantity_requested ? 'Alterado' : 'Original'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                ${req.adminObservation ? `<div class="justification"><strong>Justificativa:</strong> ${req.adminObservation}</div>` : ''}
              </div>
            `;
          }).join('')}
          <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
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

  const handleApproveRequest = async (requestId: string, items: RequestItem[]) => {
    try {
      const batch = writeBatch(db);
      const requestRef = doc(db, 'requests', requestId);
      batch.update(requestRef, { 
        status: 'APROVADO',
        adminObservation: adminObservation 
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

        // Auto-generate delivery receipt on approval as requested
        const itemsForReceipt = items
          .filter(i => i.quantity_approved > 0)
          .map(i => ({
            product_name: i.product_name,
            quantity: i.quantity_approved
          }));
        
        if (itemsForReceipt.length > 0) {
          handleExportDeliveryReceiptPDF({
            sector: request.sector,
            items: itemsForReceipt,
            requestId: requestId,
            date: new Date().toISOString()
          });
        }
      }

      showToast("Solicitação aprovada e recibo gerado!", "success");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
      showToast(`Erro ao aprovar: ${error.message}`, "error");
    }
  };

  const handleDeliverRequest = async (requestId: string, requestItems: RequestItem[]) => {
    console.log('Iniciando entrega da solicitação:', requestId, 'Itens:', requestItems);
    if (!requestItems || requestItems.length === 0) {
      showToast("Nenhum item encontrado nesta solicitação.", "error");
      return;
    }

    try {
      // 1. Fetch all available batches for the products in this request
      const productNames = [...new Set(requestItems.map(ri => ri.product_name))];
      console.log('Buscando lotes para os produtos:', productNames);
      
      // Firestore 'in' query is limited to 10-30 items. Let's chunk it.
      const chunks = [];
      for (let i = 0; i < productNames.length; i += 10) {
        chunks.push(productNames.slice(i, i + 10));
      }

      const availableBatchesByProduct: Record<string, any[]> = {};
      
      for (const chunk of chunks) {
        const itemsSnapshot = await getDocs(query(
          collection(db, 'items'),
          where('name', 'in', chunk),
          where('quantity', '>', 0)
        ));

        itemsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (!availableBatchesByProduct[data.name]) {
            availableBatchesByProduct[data.name] = [];
          }
          availableBatchesByProduct[data.name].push({ id: doc.id, ...data });
        });
      }

      // Sort batches by expiry date (FIFO-ish)
      Object.keys(availableBatchesByProduct).forEach(name => {
        availableBatchesByProduct[name].sort((a, b) => {
          if (a.expiry_date === 'Indeterminada') return 1;
          if (b.expiry_date === 'Indeterminada') return -1;
          return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        });
      });

      let deliveredSector = '';
      
      await runTransaction(db, async (transaction) => {
        console.log('Iniciando transação do Firestore...');
        const requestRef = doc(db, 'requests', requestId);
        const requestSnap = await transaction.get(requestRef);
        
        if (!requestSnap.exists()) {
          throw new Error("Solicitação não encontrada no banco de dados.");
        }

        const requestData = requestSnap.data() as MaterialRequest;
        deliveredSector = requestData.sector;
        console.log('Dados da solicitação recuperados:', requestData.status);
        
        if (requestData.status === 'ENTREGUE') {
          console.log('Solicitação já está marcada como ENTREGUE.');
          return;
        }

        for (const reqItem of requestItems) {
          console.log(`Processando item: ${reqItem.product_name}, Quantidade: ${reqItem.quantity_approved}`);
          let remainingToDeduct = reqItem.quantity_approved;
          const batches = availableBatchesByProduct[reqItem.product_name] || [];
          
          let totalAvailableForProduct = batches.reduce((sum, b) => sum + b.quantity, 0);
          
          if (totalAvailableForProduct < remainingToDeduct) {
            throw new Error(`Estoque insuficiente para "${reqItem.product_name}". Solicitado: ${remainingToDeduct}, Disponível total: ${totalAvailableForProduct}.`);
          }

          for (const batch of batches) {
            if (remainingToDeduct <= 0) break;

            const batchRef = doc(db, 'items', batch.id);
            const batchSnap = await transaction.get(batchRef);
            
            if (!batchSnap.exists()) {
              console.warn(`Lote ${batch.id} não existe mais.`);
              continue;
            }
            
            const currentBatchData = batchSnap.data();
            const availableInBatch = currentBatchData.quantity;

            if (availableInBatch <= 0) {
              console.warn(`Lote ${batch.id} está vazio.`);
              continue;
            }

            const amountFromThisBatch = Math.min(availableInBatch, remainingToDeduct);
            console.log(`Deduzindo ${amountFromThisBatch} do lote ${batch.batch_number} (ID: ${batch.id})`);
            
            transaction.update(batchRef, {
              quantity: availableInBatch - amountFromThisBatch,
              updatedAt: serverTimestamp()
            });

            const transRef = doc(collection(db, 'transactions'));
            transaction.set(transRef, {
              item_id: batch.id,
              item_name: reqItem.product_name,
              type: 'exit',
              origin: currentBatchData.origin,
              quantity: amountFromThisBatch,
              sector: requestData.sector,
              location: 'Almoxarifado',
              date: new Date().toISOString(),
              responsible: user?.displayName || user?.email,
              responsibleEmail: user?.email,
              exitReason: 'consumo',
              batch_number: currentBatchData.batch_number,
              expiry_date: currentBatchData.expiry_date
            });

            // Automatic transfer to Pharmacy stock if sector is 'Farmácia'
            if (requestData.sector === 'Farmácia') {
              const pharmacyItemsQuery = query(
                collection(db, 'items'),
                where('name', '==', reqItem.product_name),
                where('batch_number', '==', currentBatchData.batch_number || ''),
                where('location', '==', 'Farmácia'),
                where('deletedAt', '==', null)
              );
              
              const pharmacyItemsSnap = await getDocs(pharmacyItemsQuery);
              
              let pharmacyItemId = '';
              if (!pharmacyItemsSnap.empty) {
                const pharmacyItemDoc = pharmacyItemsSnap.docs[0];
                pharmacyItemId = pharmacyItemDoc.id;
                transaction.update(pharmacyItemDoc.ref, {
                  quantity: (pharmacyItemDoc.data().quantity || 0) + amountFromThisBatch,
                  updatedAt: serverTimestamp()
                });
              } else {
                const newItemRef = doc(collection(db, 'items'));
                pharmacyItemId = newItemRef.id;
                transaction.set(newItemRef, {
                  name: reqItem.product_name,
                  description: currentBatchData.description || '',
                  quantity: amountFromThisBatch,
                  min_quantity: currentBatchData.min_quantity || 5,
                  expiry_date: currentBatchData.expiry_date,
                  origin: currentBatchData.origin,
                  unit_price: currentBatchData.unit_price,
                  supplier: currentBatchData.supplier,
                  category: currentBatchData.category,
                  batch_number: currentBatchData.batch_number,
                  location: 'Farmácia',
                  createdAt: new Date().toISOString()
                });
              }

              // Record entry in Pharmacy history
              const pharmTransRef = doc(collection(db, 'transactions'));
              transaction.set(pharmTransRef, {
                item_id: pharmacyItemId,
                item_name: reqItem.product_name,
                type: 'entry',
                origin: currentBatchData.origin,
                quantity: amountFromThisBatch,
                location: 'Farmácia',
                date: new Date().toISOString(),
                responsible: 'Sistema (Solicitação)',
                batch_number: currentBatchData.batch_number,
                expiry_date: currentBatchData.expiry_date,
                supplier: currentBatchData.supplier
              });
            }

            remainingToDeduct -= amountFromThisBatch;
          }

          if (remainingToDeduct > 0) {
            throw new Error(`Não foi possível deduzir a quantidade total para "${reqItem.product_name}" devido a alterações simultâneas no estoque.`);
          }
        }

        transaction.update(requestRef, { 
          status: 'ENTREGUE',
          deliveredAt: new Date().toISOString(),
          deliveredBy: user?.email,
          adminObservation: adminObservation || requestData.adminObservation || ''
        });
        console.log('Transação concluída com sucesso.');
      });

      const request = requests.find(r => r.id === requestId);
      if (request) {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', request.requesterEmail)));
        if (!userSnap.empty) {
          const msg = adminObservation 
            ? `Sua solicitação #${requestId.slice(-5).toUpperCase()} foi entregue. Obs: ${adminObservation}`
            : `Sua solicitação #${requestId.slice(-5).toUpperCase()} foi entregue.`;
          await createNotification(userSnap.docs[0].id, 'Material Entregue', msg, requestId);
        }
      }

      showToast("Entrega confirmada e estoque atualizado!", "success");
      
      // Auto-generate delivery receipt for the request
      const itemsForReceipt = requestItems
        .filter(ri => ri.quantity_approved > 0)
        .map(i => ({
          product_name: i.product_name,
          quantity: i.quantity_approved
        }));
      
      if (itemsForReceipt.length > 0 && deliveredSector) {
        handleExportDeliveryReceiptPDF({
          sector: deliveredSector,
          items: itemsForReceipt,
          requestId: requestId,
          date: new Date().toISOString()
        });
      }

      setShowRequestDetailModal({ show: false });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, `requests/${requestId}/delivery`);
      if (error.message.includes('insufficient permissions')) {
        showToast("Erro de permissão: Você não tem autorização para atualizar o estoque.", "error");
      } else {
        showToast(`Erro ao processar entrega: ${error.message}`, "error");
      }
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
        
        // Dynamic min stock calculation (5 weeks coverage)
        const weeklyRate = weeklyExitRates[trimmedName] || 0;
        const calculatedMin = weeklyRate > 0 ? Math.ceil(weeklyRate * 5) : 5;
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
              supplier: bulkEntry.supplier || currentItemData.supplier,
              category: bulkEntry.category || currentItemData.category,
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
              expiry_date: expiryValue
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
            supplier: bulkEntry.supplier,
            category: bulkEntry.category,
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
            expiry_date: expiryValue
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
          unit_price: 0
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
                where('location', '==', 'Farmácia'),
                where('deletedAt', '==', null)
              );
              pharmacyItemSnap = await getDocs(pharmacyItemsQuery);
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

            transaction.set(newTransRef, {
              item_id: currentItemData.id || itemRef.id,
              item_name: currentItemData.name,
              type: 'exit',
              origin: currentItemData.origin,
              quantity: quantity,
              sector: inventoryLocation === 'Farmácia' && exitReason === 'consumo' ? 'Farmácia (Consumo Interno)' : selectedSector,
              location: inventoryLocation,
              date: new Date().toISOString(),
              responsible: user?.displayName || 'Sistema',
              responsibleEmail: user?.email || '',
              exitReason: exitReason,
              expiryReason: exitReason === 'vencido' ? expiryReason : null,
              donationUnitName: exitReason === 'doacao' ? (donationUnitName || 'Policlínica Bernardo Félix da Silva') : null,
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
        const calculatedMin = weeklyRate > 0 ? Math.ceil(weeklyRate * 5) : item.min_quantity;
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
      
      // Auto-generate delivery receipt for manual exit
      if (showTransactionModal.type === 'exit' && basket.length > 0 && selectedSector) {
        const itemsForReceipt = basket.map(b => ({
          product_name: items.find(i => i.id === b.item_id)?.name || 'Produto Não Identificado',
          quantity: b.quantity
        }));
        
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
            donatingUnitName: donationUnitName || 'Policlínica Bernardo Félix da Silva',
            receivingUnit: {
              name: selectedSector || 'Unidade Receptora',
              address: donationUnitAddress,
              cnpj: donationUnitCNPJ
            },
            items: itemsForReceipt,
            revisionDate: donationRevisionDate,
            donationNumber: currentDonationNumber,
            date: new Date().toISOString()
          });
        } else {
          handleExportDeliveryReceiptPDF({
            sector: selectedSector,
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
        exportData.push({
          'Item': item.name,
          'Categoria': item.category,
          'Fornecedor': item.supplier,
          'Quantidade Total': item.totalQuantity,
          'Valor Total (BRL)': item.totalValue,
          'Destino': 'TOTAL'
        });
        
        // Sector breakdown rows
        Object.entries(item.sectors).forEach(([sector, qty]) => {
          exportData.push({
            'Item': `   ↳ ${item.name}`,
            'Categoria': item.category,
            'Fornecedor': item.supplier,
            'Quantidade Total': qty,
            'Valor Total (BRL)': '',
            'Destino': sector
          });
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
      const exportData = groupedArray.map(group => ({
        'Item': group.name,
        'Categoria': group.category || '---',
        'Estoque Total': group.total_quantity,
        'Mínimo': group.min_quantity,
        'Status': group.total_quantity <= group.min_quantity ? 'BAIXO' : 'OK'
      }));

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
      
      // Add title
      doc.setFontSize(18);
      doc.setTextColor(28, 25, 23); // #1C1917
      doc.text('Relatório de Estoque Atual', 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(120, 113, 108); // #78716C
      doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
      
      // Prepare data for table
      const tableData = groupedArray.map(group => [
        group.name,
        group.category || '---',
        group.total_quantity.toString(),
        group.min_quantity.toString(),
        group.total_quantity <= group.min_quantity ? 'BAIXO' : 'OK'
      ]);
      
      // Generate table
      autoTable(doc, {
        startY: 40,
        head: [['Item', 'Categoria', 'Estoque', 'Mínimo', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [28, 25, 23], halign: 'center' }, // #1C1917
        columnStyles: {
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' }
        },
        styles: { fontSize: 9, cellPadding: 3 },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 4) {
            if (data.cell.text[0] === 'BAIXO') {
              data.cell.styles.textColor = [225, 29, 72]; // rose-600
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });
      
      // Save PDF
      const dateStr = format(new Date(), 'dd-MM-yyyy');
      doc.save(`Estoque_Atual_${dateStr}.pdf`);
      showToast("PDF de estoque exportado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao exportar PDF de estoque:', error);
      showToast("Erro ao exportar PDF de estoque.", "error");
    }
  };

  const handleExportRequestsPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(18);
      doc.setTextColor(28, 25, 23); // #1C1917
      doc.text('Relatório de Solicitações de Materiais', 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(120, 113, 108); // #78716C
      doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
      
      // Determine which requests to export based on current tab
      let requestsToExport = [];
      if (activeTab === 'requests') {
        requestsToExport = requests.filter(req => !req.deletedAt);
      } else if (activeTab === 'my-requests') {
        requestsToExport = requests.filter(r => r.sector === userProfile?.sector && !r.deletedAt);
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
        startY: 40,
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

  const [donationUnitName, setDonationUnitName] = useState('');
  const [donationUnitAddress, setDonationUnitAddress] = useState('');
  const [donationUnitCNPJ, setDonationUnitCNPJ] = useState('');
  const [donationRevisionDate, setDonationRevisionDate] = useState('');

  const handleExportDonationTermPDF = (data: {
    donatingUnitName?: string;
    receivingUnit: { name: string; address: string; cnpj: string };
    items: { product_name: string; quantity: number }[];
    revisionDate: string;
    donationNumber?: string;
    date: string;
  }) => {
    try {
      // @ts-ignore
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      
      const formatTitleCase = (str: string) => {
        if (!str) return '';
        const lower = str.toLowerCase();
        // Exception for common prepositions in PT-BR
        const minorWords = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para'];
        return lower.split(' ').map((word, index) => {
          if (index > 0 && minorWords.includes(word)) return word;
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
      };

      const donorName = formatTitleCase(data.donatingUnitName || 'Policlínica Bernardo Félix da Silva');
      const receivingName = formatTitleCase(data.receivingUnit.name);
      const receivingAddress = data.receivingUnit.address;
      const receivingCNPJ = data.receivingUnit.cnpj;
      const margin = 20;

      const drawLetterhead = (pdfDoc: any) => {
        // --- COLORS FROM MODEL ---
        const cpsmsCyan = [0, 169, 219];    // Official Cyan-Blue
        const cpsmsOrange = [255, 185, 0];   // Official Yellow/Orange
        const subtextGray = [120, 113, 108]; // Footer/Subtext Gray

        // --- HEADER ---
        // Left Side: Policlínica de Sobral
        pdfDoc.setFontSize(22);
        pdfDoc.setTextColor(cpsmsCyan[0], cpsmsCyan[1], cpsmsCyan[2]);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Policlínica de Sobral', margin, 20);
        
        pdfDoc.setFontSize(11);
        pdfDoc.setTextColor(cpsmsOrange[0], cpsmsOrange[1], cpsmsOrange[2]);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('BERNARDO FÉLIX DA SILVA', margin, 26);

        // Right Side: CPSMS Logo (Butterfly shape simulation)
        const logoX = pageWidth - margin - 46; 
        const logoY = 16;
        
        // Leaf 1 (Top Left - Yellow/Orange)
        pdfDoc.setFillColor(255, 185, 0);
        pdfDoc.roundedRect(logoX, logoY, 4, 4, 1.5, 1.5, 'F');
        
        // Leaf 2 (Top Right - Cyan)
        pdfDoc.setFillColor(0, 169, 219);
        pdfDoc.roundedRect(logoX + 4.5, logoY, 4, 4, 1.5, 1.5, 'F');
        
        // Leaf 3 (Bottom Left - Cyan)
        pdfDoc.setFillColor(0, 169, 219);
        pdfDoc.roundedRect(logoX, logoY + 4.5, 4, 4, 1.5, 1.5, 'F');
        
        // Leaf 4 (Bottom Right - Cyan)
        pdfDoc.setFillColor(0, 169, 219);
        pdfDoc.roundedRect(logoX + 4.5, logoY + 4.5, 4, 4, 1.5, 1.5, 'F');

        // CPSMS Text
        pdfDoc.setFontSize(26);
        pdfDoc.setTextColor(0, 169, 219);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('CPSMS', pageWidth - margin, 21, { align: 'right' });
        
        // Consórcio Subtext
        pdfDoc.setFontSize(6);
        pdfDoc.setTextColor(subtextGray[0], subtextGray[1], subtextGray[2]);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('CONSÓRCIO PÚBLICO DE SAÚDE', pageWidth - margin, 24, { align: 'right' });
        pdfDoc.text('DA MICRORREGIÃO DE SOBRAL', pageWidth - margin, 26.5, { align: 'right' });

        // --- FOOTER ---
        pdfDoc.setFontSize(8.5);
        pdfDoc.setTextColor(60, 60, 60);
        pdfDoc.setFont('helvetica', 'normal');
        const footerLine1 = 'Policlínica Bernardo Félix da Silva. Av. Monsenhor Aloísio Pinto, 481, Dom Expedito CEP';
        const footerLine2 = '62050-255, Sobral Ceará. Fone: (88) 3614-3156 . Fax: (88) 3614-3245';
        pdfDoc.text(footerLine1, pageWidth / 2, pageHeight - 15, { align: 'center' });
        pdfDoc.text(footerLine2, pageWidth / 2, pageHeight - 11, { align: 'center' });
      };

      drawLetterhead(doc);

      // --- DOCUMENT INFO ---
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text('Código: TERMO-ALMOX', pageWidth - margin, 45, { align: 'right' });
      doc.text(`Data de Implantação: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, 49, { align: 'right' });
      doc.text(`Última Revisão: ${data.revisionDate || '---'}`, pageWidth - margin, 53, { align: 'right' });
      
      if (data.donationNumber) {
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        doc.setFont('helvetica', 'bold');
        doc.text(`Termo nº: ${data.donationNumber}`, pageWidth - margin, 59, { align: 'right' });
      }

      // --- TITLE ---
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text('Termo de Doação de Materiais e Insumos', pageWidth / 2, 70, { align: 'center' });
      
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.2);
      doc.line(margin, 74, pageWidth - margin, 74);

      // --- CONTENT ---
      doc.setFontSize(10);
      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'normal');
      
      const donationText = `A ${donorName}, inscrita sob o CNPJ nº 12.208.466/0001-66, por intermédio de seu Setor de Almoxarifado, formaliza por este instrumento a doação à unidade ${receivingName}, situada em ${receivingAddress}, inscrita sob o CNPJ nº ${receivingCNPJ}, dos materiais e insumos abaixo discriminados. A presente cessão justifica-se pela otimização de estoque em virtude da redução de demanda interna e proximidade do prazo de validade, assegurando a destinação útil dos itens.`;
      
      const textWidth = pageWidth - (margin * 2);
      const textLines = doc.splitTextToSize(donationText, textWidth);
      doc.text(textLines, margin, 85, { 
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

  const handleExportDeliveryReceiptPDF = (data: {
    sector: string;
    items: { product_name: string; quantity: number }[];
    requestId?: string;
    date: string;
  }) => {
    try {
      // @ts-ignore
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      
      // Header Section (Institutional Style based on provided image)
      // Left side Branding
      doc.setFontSize(18);
      doc.setTextColor(0, 139, 190); // Cyan-Blue for "Policlínica de Sobral"
      doc.setFont('helvetica', 'bold');
      doc.text('Policlínica de Sobral', 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(245, 158, 11); // Yellow-Orange for "BERNARDO FÉLIX DA SILVA"
      doc.setFont('helvetica', 'bold');
      doc.text('BERNARDO FÉLIX DA SILVA', 14, 25);

      // Right side Institutional info/logo placeholder
      doc.setFontSize(14);
      doc.setTextColor(0, 139, 190);
      doc.text('CPSMS', pageWidth - 14, 20, { align: 'right' });
      doc.setFontSize(6);
      doc.setTextColor(120, 113, 108);
      doc.text('CONSÓRCIO PÚBLICO DE SAÚDE', pageWidth - 14, 23, { align: 'right' });
      doc.text('DA MICRORREGIÃO DE SOBRAL', pageWidth - 14, 26, { align: 'right' });
      
      // Document Title & Emissions
      doc.setFontSize(11);
      doc.setTextColor(28, 25, 23);
      doc.setFont('helvetica', 'bold');
      doc.text('RECIBO DE ENTREGA DE MATERIAL', pageWidth / 2, 40, { align: 'center' });
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - 14, 45, { align: 'right' });

      // Stylized blue separator
      doc.setDrawColor(0, 139, 190);
      doc.setLineWidth(0.5);
      doc.line(14, 48, pageWidth - 14, 48);

      // Info Card
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 52, pageWidth - 28, 20, 2, 2, 'F');
      
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
      
      const footerLine1 = 'Policlínica Bernardo Félix da Silva. Av. Monsenhor Aloísio Pinto, 481, Dom Expedito CEP 62050-255, Sobral Ceará.';
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
      
      // Summary Box (Minimalist)
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

      // Table Data
      const tableData: any[] = [];
      reportData.consumptionBySector.forEach(sectorGroup => {
        // Sector Header
        tableData.push([
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
          },
          isAdmin ? { 
            content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sectorGroup.totalValue), 
            styles: { 
              fillColor: [250, 250, 249],
              halign: 'right', 
              fontStyle: 'bold' 
            } 
          } : ''
        ]);
        
        // Items
        Object.values(sectorGroup.items).sort((a, b) => b.quantity - a.quantity).forEach(item => {
          tableData.push([
            { content: item.name, styles: { cellPadding: { left: 8 } } },
            item.category,
            { content: item.quantity.toString(), styles: { halign: 'center' } },
            isAdmin ? { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value), styles: { halign: 'right' } } : ''
          ]);
        });
      });
      
      autoTable(doc, {
        startY: 60,
        head: [['Item / Produto', 'Categoria', 'Qtd', isAdmin ? 'Total (R$)' : '']],
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
    const effectiveSectorFilter = isAdmin ? reportSectorFilter : (userProfile?.sector || 'none');

    const filteredTrans = transactions.filter(t => {
      if (t.deletedAt) return false;
      const d = new Date(t.date);
      const inRange = d >= start && d <= end;
      const matchesSector = effectiveSectorFilter === 'all' || t.sector === effectiveSectorFilter;
      return inRange && matchesSector;
    });

    const entries = filteredTrans.filter(t => t.type === 'entry').reduce((sum, t) => sum + t.quantity, 0);
    const exits = filteredTrans.filter(t => t.type === 'exit').reduce((sum, t) => sum + t.quantity, 0);
    
    const entriesValue = filteredTrans.filter(t => t.type === 'entry').reduce((sum, t) => {
      const item = items.find(i => i.id === t.item_id);
      return sum + (t.quantity * (Number(item?.unit_price) || 0));
    }, 0);
    
    const exitsValue = filteredTrans.filter(t => t.type === 'exit').reduce((sum, t) => {
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
      if (t.type === 'entry') originStats[origin].entries += t.quantity;
      else originStats[origin].exits += t.quantity;
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
    const dailyData: Record<string, { date: string, entries: number, exits: number }> = {};
    filteredTrans.forEach(t => {
      const dateKey = format(new Date(t.date), 'dd/MM');
      if (!dailyData[dateKey]) dailyData[dateKey] = { date: dateKey, entries: 0, exits: 0 };
      if (t.type === 'entry') dailyData[dateKey].entries += t.quantity;
      else dailyData[dateKey].exits += t.quantity;
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

    // Group by sector for bar chart (stacked by category)
    const sectorData: Record<string, any> = {};
    const categoriesInSector: Set<string> = new Set();

    filteredTrans.filter(t => t.type === 'exit' && t.sector).forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const category = item?.category || 'Outros';
      categoriesInSector.add(category);
      
      if (!sectorData[t.sector!]) {
        sectorData[t.sector!] = { name: t.sector };
      }
      sectorData[t.sector!][category] = (sectorData[t.sector!][category] || 0) + t.quantity;
    });

    // Consumption report with sector breakdown
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

    filteredTrans.filter(t => t.type === 'exit').forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const price = Number(item?.unit_price) || 0;
      const value = t.quantity * price;
      const sector = t.sector || 'Não Informado';
      
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
      if (!isAdmin && request.sector !== userProfile?.sector) return;
      
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
      'vencido': 0
    };
    filteredTrans.filter(t => t.type === 'exit').forEach(t => {
      const reason = t.exitReason || 'consumo';
      if (exitsByReason[reason] !== undefined) {
        exitsByReason[reason] += t.quantity;
      }
    });

    return {
      entries,
      exits,
      entriesValue,
      exitsValue,
      daily: Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date)),
      categories: Object.entries(categoryData)
        .map(([name, value]) => ({ name, value }))
        .filter(c => c.value > 0)
        .sort((a, b) => b.value - a.value),
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
      exitsByReason
    };
  }, [transactions, items, reportRange, reportSectorFilter, allRequestItems, requests, userProfile, isAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1C1917]"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F4] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[40px] shadow-2xl max-w-md w-full border border-[#E7E5E4]"
        >
          <div className="text-center mb-8">
            <div className="bg-[#1C1917] w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl overflow-hidden border-4 border-white">
              <Package className="text-white w-12 h-12" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter mb-1">Policlínica</h1>
            <p className="text-[#78716C] text-xs font-bold uppercase tracking-[0.2em] mb-4">
              Bernardo Félix da Silva
            </p>
            <div className="h-px w-12 bg-[#E7E5E4] mx-auto mb-4" />
            <p className="text-[#A8A29E] text-[10px] font-black uppercase tracking-widest">
              Almoxarifado Inteligente
            </p>
          </div>

          <div className="space-y-6">
            <button 
              onClick={handleGoogleLogin}
              disabled={loginLoading}
              className="w-full bg-white border border-[#E7E5E4] text-[#1C1917] py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#FAFAF9] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
            >
              {loginLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#1C1917]"></div>
              ) : (
                <>
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                  Entrar com Google
                </>
              )}
            </button>
            <p className="text-[10px] text-[#A8A29E] text-center font-bold uppercase tracking-widest mt-4">
              Apenas e-mails autorizados pelo administrador
            </p>
          </div>

          <div className="mt-8 text-center">
            <p className="text-[10px] text-[#A8A29E] uppercase tracking-widest font-bold">Acesso restrito a funcionários autorizados</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const isNearExpiry = (item: Item) => {
    if (item.quantity <= 0) return false;
    const dateStr = item.expiry_date;
    if (!dateStr || dateStr === 'Indeterminada') return false;
    const expiry = new Date(dateStr);
    const oneMonthFromNow = new Date();
    const now = new Date();
    oneMonthFromNow.setMonth(now.getMonth() + 1);
    // Include items that are already expired or expiring within a month
    return expiry <= oneMonthFromNow;
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
        min_quantity: weeklyExitRate > 0 ? Math.ceil(weeklyExitRate * 5) : item.min_quantity,
        category: item.category,
        supplier: item.supplier,
        batches: [],
        weeklyExitRate: weeklyExitRate,
        durationWeeks: 0
      };
    }
    acc[item.name].total_quantity += item.quantity;
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

  const nearExpiryItems = items.filter(i => (i.location || 'Almoxarifado') === inventoryLocation && isNearExpiry(i));
  const totalVolume = items
    .filter(i => !i.deletedAt && (i.location || 'Almoxarifado') === inventoryLocation)
    .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const totalInventoryValue = items
    .filter(i => !i.deletedAt && (i.location || 'Almoxarifado') === inventoryLocation)
    .reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)), 0);

  const recentTransactions = transactions
    .filter(t => (t.location || 'Almoxarifado') === inventoryLocation)
    .slice(0, 5);

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
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-[#E7E5E4] p-6 flex flex-col gap-8 z-10">
        <div className="flex items-center gap-3 px-2">
          <div className="bg-[#1C1917] p-2 rounded-lg shadow-md">
            <Package className="text-white w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-black text-xl tracking-tighter leading-none">Policlínica</h1>
            <span className="text-[10px] font-bold text-[#78716C] uppercase tracking-widest">Almoxarifado</span>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {isAdmin ? (
            <>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <LayoutDashboard size={20} /> Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('inventory')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <Package size={20} /> Estoque
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <History size={20} /> Histórico
              </button>
              <button 
                onClick={() => setActiveTab('requests')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'requests' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <FileText size={20} /> Solicitações
              </button>
              <button 
                onClick={() => setActiveTab('trash')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'trash' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <Trash2 size={20} /> Lixeira
              </button>
              <button 
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <BarChart3 size={20} /> Relatórios
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'users' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <Users size={20} /> Usuários
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setActiveTab('new-request')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'new-request' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <Plus size={20} /> Nova Solicitação
              </button>
              <button 
                onClick={() => setActiveTab('my-requests')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'my-requests' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
              >
                <FileText size={20} /> Minhas Solicitações
              </button>
              {userProfile?.sector === 'Farmácia' && (
                <>
                  <button 
                    onClick={() => setActiveTab('dashboard')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
                  >
                    <LayoutDashboard size={20} /> Visão Geral
                  </button>
                  <button 
                    onClick={() => setActiveTab('inventory')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
                  >
                    <Package size={20} /> Meu Estoque
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
                  >
                    <History size={20} /> Meu Histórico
                  </button>
                </>
              )}
            </>
          )}
        </nav>

        <div className="mt-auto pt-6 border-t border-[#E7E5E4] space-y-2">
          <div className="px-4 py-2">
            <p className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-widest mb-2">Usuário</p>
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-[#E7E5E4]" alt="" />
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate">{user.displayName}</p>
                <p className="text-[10px] text-[#A8A29E] font-medium truncate uppercase">{userProfile?.sector || 'Sem Setor'}</p>
                <button onClick={handleLogout} className="text-[10px] text-rose-600 font-bold hover:underline flex items-center gap-1 mt-1">
                  <LogOut size={10} /> Sair
                </button>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#57534E] hover:bg-[#FAFAF9] w-full transition-all"
          >
            <Settings size={20} /> Configurações
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-10 max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-1">
              {activeTab === 'dashboard' && 'Visão Geral'}
              {activeTab === 'inventory' && 'Gerenciamento de Estoque'}
              {activeTab === 'history' && 'Histórico de Movimentações'}
              {activeTab === 'requests' && 'Solicitações de Materiais'}
              {activeTab === 'trash' && 'Lixeira (Exclusão em 3 dias)'}
              {activeTab === 'my-requests' && `Minhas Solicitações - ${userProfile?.sector || ''}`}
              {activeTab === 'new-request' && `Nova Solicitação - ${userProfile?.sector || ''}`}
              {editingRequest && ' - Editando Solicitação'}
              {activeTab === 'reports' && 'Relatórios e Análises'}
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
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#E7E5E4]">
                    <Calendar size={14} className="text-[#A8A29E]" />
                    <input 
                      type="date" 
                      className="text-xs font-bold focus:outline-none"
                      value={reportRange.start}
                      onChange={e => setReportRange({...reportRange, start: e.target.value})}
                    />
                    <span className="text-[#A8A29E] text-xs">até</span>
                    <input 
                      type="date" 
                      className="text-xs font-bold focus:outline-none"
                      value={reportRange.end}
                      onChange={e => setReportRange({...reportRange, end: e.target.value})}
                    />
                  </div>
                  {(isAdmin) && (
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#E7E5E4]">
                      <Filter size={14} className="text-[#A8A29E]" />
                      <select 
                        className="text-xs font-bold focus:outline-none bg-transparent"
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
                  <button 
                    onClick={handleExportExcel}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
                  >
                    <Download size={14} /> Exportar Excel
                  </button>
                </div>
              )}
              {(activeTab === 'requests' || activeTab === 'my-requests') && (
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
                className="p-2 bg-white border border-[#E7E5E4] rounded-xl text-[#57534E] hover:bg-[#FAFAF9] relative transition-all"
              >
                <Bell size={20} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              
              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 bg-white border border-[#E7E5E4] rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-[#E7E5E4] flex justify-between items-center bg-[#FAFAF9]">
                      <h3 className="font-bold text-sm">Notificações</h3>
                      <button onClick={() => setShowNotifications(false)} className="text-[#A8A29E] hover:text-[#1C1917]">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <p className="text-xs text-[#A8A29E] font-medium">Nenhuma notificação</p>
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div 
                            key={n.id} 
                            className={`p-4 border-b border-[#F5F5F4] hover:bg-[#FAFAF9] transition-all cursor-pointer ${!n.read ? 'bg-blue-50/30' : ''}`}
                            onClick={async () => {
                              await updateDoc(doc(db, 'notifications', n.id), { read: true });
                              if (n.requestId) {
                                const req = requests.find(r => r.id === n.requestId);
                                if (req) {
                                  setShowRequestDetailModal({ show: true, request: req });
                                }
                              }
                            }}
                          >
                            <p className={`text-xs font-bold mb-1 ${!n.read ? 'text-blue-600' : 'text-[#1C1917]'}`}>{n.title}</p>
                            <p className="text-[11px] text-[#78716C] leading-relaxed mb-2">{n.message}</p>
                            <p className="text-[10px] text-[#A8A29E] font-medium">{format(new Date(n.date), "dd MMM, HH:mm", { locale: ptBR })}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A29E]" size={18} />
              <input 
                type="text" 
                placeholder="Buscar itens..."
                className="pl-10 pr-4 py-2 bg-white border border-[#E7E5E4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1C1917]/10 w-64 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {activeTab === 'inventory' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-[#E7E5E4]">
                  <Filter size={16} className="text-[#A8A29E]" />
                  <select 
                    className="text-xs font-bold focus:outline-none bg-transparent"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">Todos os Tipos</option>
                    {Object.keys(CATEGORY_COLORS).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-[#E7E5E4]">
                  <TrendingUp size={16} className="text-[#A8A29E]" />
                  <select 
                    className="text-xs font-bold focus:outline-none bg-transparent"
                    value={inventorySort}
                    onChange={e => setInventorySort(e.target.value as any)}
                  >
                    <option value="name_asc">A-Z (Nome)</option>
                    <option value="name_desc">Z-A (Nome)</option>
                    <option value="duration_asc">Duração (Menor-Maior)</option>
                    <option value="duration_desc">Duração (Maior-Menor)</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-[#E7E5E4]">
                  <Filter size={16} className="text-[#A8A29E]" />
                  <select 
                    className="text-xs font-bold focus:outline-none bg-transparent"
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
                      className="p-2 bg-white border border-[#E7E5E4] rounded-xl text-[#57534E] hover:bg-[#FAFAF9] transition-all"
                      title="Baixar Planilha Excel"
                    >
                      <Download size={20} />
                    </button>
                    <button 
                      onClick={handleExportInventoryPDF}
                      className="p-2 bg-white border border-[#E7E5E4] rounded-xl text-rose-600 hover:bg-rose-50 transition-all"
                      title="Baixar Relatório PDF"
                    >
                      <Printer size={20} />
                    </button>
                  </div>
                )}
              </div>
            )}
            {(isAdmin || userProfile?.sector === 'Farmácia') && (
              <>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="bg-[#1C1917] text-white px-5 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-[#292524] transition-all shadow-sm"
                >
                  <Plus size={20} /> Entrada
                </button>
                <button 
                  onClick={() => setShowTransactionModal({ show: true, type: 'exit' })}
                  className="bg-rose-600 text-white px-5 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-rose-700 transition-all shadow-sm"
                >
                  <ArrowUpRight size={20} /> Saída
                </button>
              </>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600">
                      <Package size={24} />
                    </div>
                  </div>
                  <p className="text-[#78716C] font-medium mb-1">Volume em Estoque</p>
                  <h3 className="text-4xl font-bold">{totalVolume}</h3>
                  <p className="text-xs text-[#A8A29E] mt-2 font-bold uppercase tracking-wider">{groupedArray.length} tipos de itens</p>
                </div>

                {(isAdmin || userProfile?.sector === 'Farmácia') && (
                  <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
                        <DollarSign size={24} />
                      </div>
                    </div>
                    <p className="text-[#78716C] font-medium mb-1">Patrimônio em Estoque</p>
                    <h3 className="text-4xl font-bold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInventoryValue)}
                    </h3>
                    <p className="text-xs text-[#A8A29E] mt-2 font-bold uppercase tracking-wider">Valor total investido</p>
                  </div>
                )}

                <div 
                  onClick={() => lowStockItems.length > 0 && setShowDetailModal({ show: true, type: 'low_stock', items: lowStockItems as any })}
                  className={`p-6 rounded-3xl border shadow-sm transition-all cursor-pointer ${lowStockItems.length > 0 ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' : 'bg-white border-[#E7E5E4]'}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-2xl ${lowStockItems.length > 0 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'}`}>
                      <AlertTriangle size={24} />
                    </div>
                  </div>
                  <p className="text-[#78716C] font-medium mb-1">Estoque Baixo</p>
                  <h3 className={`text-4xl font-bold ${lowStockItems.length > 0 ? 'text-orange-600' : ''}`}>{lowStockItems.length}</h3>
                </div>

                <div 
                  onClick={() => nearExpiryItems.length > 0 && setShowDetailModal({ show: true, type: 'expiry', items: nearExpiryItems })}
                  className={`p-6 rounded-3xl border shadow-sm transition-all cursor-pointer ${nearExpiryItems.length > 0 ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'bg-white border-[#E7E5E4]'}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-2xl ${nearExpiryItems.length > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                      <Calendar size={24} />
                    </div>
                  </div>
                  <p className="text-[#78716C] font-medium mb-1">Vencimento Próximo</p>
                  <h3 className={`text-4xl font-bold ${nearExpiryItems.length > 0 ? 'text-red-600' : ''}`}>{nearExpiryItems.length}</h3>
                </div>
              </div>

              {/* Alerts Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-3xl border border-[#E7E5E4] shadow-sm">
                  <h4 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <AlertTriangle className="text-orange-500" size={20} /> Alertas Críticos
                  </h4>
                  <div className="space-y-4">
                    {lowStockItems.length === 0 && nearExpiryItems.length === 0 && (
                      <p className="text-[#A8A29E] italic">Nenhum alerta no momento.</p>
                    )}
                    {lowStockItems.map(group => (
                      <div key={`low-${group.name}`} className="flex items-center justify-between p-4 bg-orange-50 rounded-2xl border border-orange-100">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-orange-200 rounded-full flex items-center justify-center text-orange-700 font-bold">
                            {group.total_quantity}
                          </div>
                          <div>
                            <p className="font-bold">{group.name}</p>
                            <p className="text-sm text-orange-700">Estoque total abaixo do mínimo ({group.min_quantity})</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowTransactionModal({ show: true, type: 'entry', item: group.batches[0] })}
                          className="bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-700 transition-all"
                        >
                          Repor
                        </button>
                      </div>
                    ))}
                    {nearExpiryItems.map(item => {
                      const isExpired = new Date(item.expiry_date!) < new Date();
                      return (
                        <div key={`exp-${item.id}`} className={`flex items-center justify-between p-4 rounded-2xl border ${isExpired ? 'bg-red-100 border-red-200' : 'bg-red-50 border-red-100'}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isExpired ? 'bg-red-600 text-white' : 'bg-red-200 text-red-700'}`}>
                              <Calendar size={20} />
                            </div>
                            <div>
                              <p className="font-bold">{item.name}</p>
                              <p className={`text-sm font-bold ${isExpired ? 'text-red-700' : 'text-red-700'}`}>
                                {isExpired ? 'VENCIDO EM: ' : 'Vence em: '}
                                {new Date(item.expiry_date!).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setShowTransactionModal({ show: true, type: 'exit', item })}
                            className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-all"
                          >
                            Retirar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white p-8 rounded-3xl border border-[#E7E5E4] shadow-sm">
                <h4 className="text-xl font-bold mb-6">Atividade Recente</h4>
                <div className="space-y-6">
                  {recentTransactions.map(t => (
                    <div key={t.id} className="flex gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${t.type === 'entry' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {t.type === 'entry' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm">{t.item_name}</p>
                        <p className="text-xs text-[#78716C]">
                          {t.type === 'entry' ? 'Entrada' : `Saída para ${t.sector || '---'}`} de {t.quantity} unidades
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <p className="text-[10px] text-[#A8A29E]">{new Date(t.date).toLocaleString('pt-BR')}</p>
                          {t.responsible && <p className="text-[10px] text-blue-600 font-bold">Por: {t.responsible}</p>}
                          {t.supplier && <p className="text-[10px] text-amber-600 font-bold">De: {t.supplier}</p>}
                        </div>
                      </div>
                      {isAdmin && !t.deletedAt && (
                        <button 
                          onClick={() => {
                            setDeletionReason('');
                            setShowDeleteModal({ show: true, transactionId: t.id });
                          }}
                          className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all self-center"
                          title="Excluir Movimentação"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                  {recentTransactions.length === 0 && <p className="text-[#A8A29E] text-sm italic">Nenhuma movimentação.</p>}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'inventory' && (
            <motion.div 
              key="inventory"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-[#E7E5E4] shadow-sm">
                {isAdmin ? (
                  <div className="flex items-center gap-2 bg-[#F5F5F4] p-1 rounded-2xl border border-[#E7E5E4]">
                    <button 
                      onClick={() => setInventoryLocation('Almoxarifado')}
                      className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${inventoryLocation === 'Almoxarifado' ? 'bg-[#1C1917] text-white shadow-md' : 'text-[#78716C] hover:bg-[#E7E5E4]'}`}
                    >
                      <Package size={14} /> Almoxarifado Geral
                    </button>
                    <button 
                      onClick={() => setInventoryLocation('Farmácia')}
                      className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${inventoryLocation === 'Farmácia' ? 'bg-[#1C1917] text-white shadow-md' : 'text-[#78716C] hover:bg-[#E7E5E4]'}`}
                    >
                      <Users size={14} /> Estoque Farmácia
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2 bg-[#F5F5F4] rounded-2xl border border-[#E7E5E4]">
                    <div className="p-2 bg-[#1C1917] text-white rounded-xl">
                      {inventoryLocation === 'Almoxarifado' ? <Package size={16} /> : <Users size={16} />}
                    </div>
                    <p className="text-sm font-bold text-[#1C1917]">
                      Estoque: {inventoryLocation}
                    </p>
                  </div>
                )}
                
                <div className="flex items-center gap-3">
                  <p className="text-xs font-bold text-[#A8A29E] uppercase tracking-widest">
                    Visualizando: <span className="text-[#1C1917]">{inventoryLocation}</span>
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Item / Lote</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Tipo {isAdmin && '/ Fornecedor'}</th>
                    {isAdmin && <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Origem</th>}
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">{isAdmin ? 'Preço Un.' : '---'}</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Quantidade</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Mínimo</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Duração</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Validade</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]">
                  {groupedArray.map(group => (
                    <React.Fragment key={group.name}>
                      <tr 
                        className="bg-[#FAFAF9] hover:bg-[#F5F5F4] transition-all cursor-pointer"
                        onClick={() => toggleExpand(group.name)}
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className={`transition-transform ${expandedItems.has(group.name) ? 'rotate-90' : ''}`}>
                              <ChevronRight size={18} className="text-[#A8A29E]" />
                            </div>
                            {isAdmin && editingMaterialName?.oldName === group.name ? (
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="text" 
                                  value={editingMaterialName.newName}
                                  onChange={(e) => setEditingMaterialName({ ...editingMaterialName, newName: e.target.value })}
                                  className="px-3 py-1 bg-white border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-lg"
                                  autoFocus
                                />
                                <button 
                                  onClick={handleUpdateMaterialName}
                                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl"
                                  title="Salvar"
                                >
                                  <Check size={20} />
                                </button>
                                <button 
                                  onClick={() => setEditingMaterialName(null)}
                                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl"
                                  title="Cancelar"
                                >
                                  <X size={20} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2 group/name">
                                  <p className="font-bold text-lg">{group.name}</p>
                                  {isAdmin && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setEditingMaterialName({ oldName: group.name, newName: group.name }); }}
                                      className="opacity-0 group-hover/name:opacity-100 p-1 text-[#A8A29E] hover:text-[#1C1917] transition-all"
                                      title="Editar Nome do Material"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                  )}
                                </div>
                                {group.batches[0]?.description && (
                                  <p className="text-[10px] text-[#A8A29E] italic mt-0.5 line-clamp-1">{group.batches[0].description}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      <td className="px-6 py-5">
                          <p className="text-sm font-semibold text-[#44403C]">{group.category || '---'}</p>
                          {isAdmin && <p className="text-xs text-[#78716C]">{group.supplier || '---'}</p>}
                        </td>
                        <td className="px-6 py-5">
                          {isAdmin ? (
                            (() => {
                              const origins = new Set(group.batches.map(b => b.origin));
                              if (origins.size === 1) {
                                const origin = Array.from(origins)[0];
                                return (
                                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${origin === 'contract' ? 'bg-blue-100 text-blue-700' : origin === 'donation' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                                    {origin === 'contract' ? 'Contrato' : origin === 'donation' ? 'Doação' : 'Extra'}
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-500 uppercase">
                                  {group.batches.length} Lotes
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-[#A8A29E]">---</span>
                          )}
                        </td>
                        <td className="px-6 py-5 font-medium text-[#57534E]">---</td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col items-center justify-center bg-[#F5F5F4] rounded-2xl p-2 border border-[#E7E5E4]">
                            <span className={`text-xl font-black ${group.total_quantity <= group.min_quantity ? 'text-orange-600' : 'text-emerald-600'}`}>
                              {group.total_quantity}
                            </span>
                            <span className="text-[9px] font-bold text-[#A8A29E] uppercase tracking-tighter">Total Geral</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-[#57534E] font-medium">
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1">
                              {group.min_quantity}
                              <TrendingUp size={12} className="text-emerald-500" />
                            </span>
                            <span className="text-[10px] text-[#A8A29E]">({group.weeklyExitRate.toFixed(1)}/sem)</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className={`flex flex-col items-center justify-center p-2 rounded-xl border ${
                            group.durationWeeks === 'infinite' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                            group.durationWeeks <= 1 ? 'bg-red-50 border-red-100 text-red-600' :
                            group.durationWeeks <= 5 ? 'bg-orange-50 border-orange-100 text-orange-600' :
                            'bg-emerald-50 border-emerald-100 text-emerald-600'
                          }`}>
                            <span className="text-sm font-black">
                              {group.durationWeeks === 'infinite' ? '∞' : `${group.durationWeeks.toFixed(1)}`}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-tighter">Semanas</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-xs text-[#A8A29E]">---</td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <button className="text-xs font-bold text-emerald-600 uppercase tracking-wider hover:underline">
                              {expandedItems.has(group.name) ? 'Recolher' : 'Ver Detalhes'}
                            </button>
                            <span className="text-[10px] text-[#A8A29E] font-medium">
                              {group.batches.length} remessas ativas
                            </span>
                          </div>
                        </td>
                      </tr>
                      
                      {expandedItems.has(group.name) && group.batches.map(item => (
                        <tr key={item.id} className="bg-white hover:bg-[#FAFAF9] transition-all border-l-4 border-emerald-500">
                          <td className="px-12 py-4">
                            <p className="text-sm font-mono font-bold text-[#57534E]">Lote: {item.batch_number || '---'}</p>
                            {item.description && <p className="text-[10px] text-[#A8A29E] italic">{item.description}</p>}
                          </td>
                          <td className="px-6 py-4">
                            {isAdmin ? (
                              <p className="text-xs text-[#78716C]">{item.supplier || '---'}</p>
                            ) : (
                              <p className="text-xs text-[#78716C]">---</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isAdmin ? (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.origin === 'contract' ? 'bg-blue-50 text-blue-600' : item.origin === 'donation' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>
                                {item.origin === 'contract' ? 'Contrato' : item.origin === 'donation' ? 'Doação' : 'Extra'}
                              </span>
                            ) : (
                              <span className="text-xs text-[#A8A29E]">---</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#57534E]">
                            {isAdmin ? (
                              editingPrice?.id === item.id ? (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={editingPrice.price}
                                    onChange={(e) => setEditingPrice({ ...editingPrice, price: parseFloat(e.target.value) || 0 })}
                                    className="w-24 px-2 py-1 bg-[#F5F5F4] border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-xs"
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
                                <div className="flex items-center gap-2 group">
                                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setEditingPrice({ id: item.id, price: item.unit_price }); }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-[#A8A29E] hover:text-[#1C1917] transition-all"
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
                          <td className="px-6 py-4">
                            {isAdmin ? (
                              editingQuantity?.id === item.id ? (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="number" 
                                    min="0"
                                    value={editingQuantity.quantity}
                                    onChange={(e) => setEditingQuantity({ ...editingQuantity, quantity: parseInt(e.target.value) || 0 })}
                                    className="w-20 px-2 py-1 bg-[#F5F5F4] border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
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
                                <div className="flex flex-col group">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-lg font-bold ${item.quantity <= (item.min_quantity || 0) ? 'text-orange-600' : 'text-[#1C1917]'}`}>
                                      {item.quantity}
                                    </span>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setEditingQuantity({ id: item.id, quantity: item.quantity }); }}
                                      className="opacity-0 group-hover:opacity-100 p-1 text-[#A8A29E] hover:text-[#1C1917] transition-all"
                                      title="Editar Quantidade"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                  <span className="text-[9px] font-bold text-[#A8A29E] uppercase tracking-tighter">Neste Lote</span>
                                </div>
                              )
                            ) : (
                              <div className="flex flex-col">
                                <span className={`text-lg font-bold ${item.quantity <= (item.min_quantity || 0) ? 'text-orange-600' : 'text-[#1C1917]'}`}>
                                  {item.quantity}
                                </span>
                                <span className="text-[9px] font-bold text-[#A8A29E] uppercase tracking-tighter">Neste Lote</span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-[#A8A29E]">---</td>
                          <td className="px-6 py-4">
                            {item.expiry_date ? (
                              <span className={`text-xs ${item.expiry_date === 'Indeterminada' ? 'text-blue-600 font-bold' : isNearExpiry(item) ? 'text-red-600 font-bold' : 'text-[#57534E]'}`}>
                                {item.expiry_date === 'Indeterminada' ? 'Indeterminada' : new Date(item.expiry_date).toLocaleDateString('pt-BR')}
                              </span>
                            ) : (
                              <span className="text-[#A8A29E] text-xs italic">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setShowTransactionModal({ show: true, type: 'entry', item }); }}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Entrada"
                            >
                              <Plus size={16} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setShowTransactionModal({ show: true, type: 'exit', item }); }}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Saída"
                            >
                              <ArrowUpRight size={16} />
                            </button>
                            {isAdmin && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                className="p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all"
                                title="Excluir"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-[#FAFAF9] border-t-2 border-[#E7E5E4]">
                  <tr>
                    <td colSpan={4} className="px-6 py-4 font-bold text-[#57534E] text-right uppercase tracking-wider">Total em Estoque</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center justify-center bg-[#1C1917] text-white rounded-xl py-2 px-3 shadow-sm">
                        <span className="text-xl font-black">{totalVolume}</span>
                        <span className="text-[8px] font-bold uppercase tracking-tighter opacity-70">Unidades Totais</span>
                      </div>
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
              {filteredItems.length === 0 && (
                <div className="p-20 text-center">
                  <Package className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                  <p className="text-[#78716C]">Nenhum item encontrado.</p>
                </div>
              )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
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
                <table className="w-full text-left border-collapse">
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
                          {t.exitReason && t.exitReason !== 'consumo' && (
                            <div className="text-[10px] text-rose-500 font-bold mt-1 uppercase">
                              Motivo: {t.exitReason}
                              {t.expiryReason && <span className="text-[#78716C] lowercase font-normal ml-1">({t.expiryReason})</span>}
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
                                      items: [{ product_name: t.item_name, quantity: t.quantity }],
                                      revisionDate: t.donationRevisionDate || '',
                                      donationNumber: t.donationNumber,
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
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title={t.exitReason === 'doacao' ? 'Reimprimir Termo de Doação' : 'Reimprimir Recibo de Entrega'}
                              >
                                {t.exitReason === 'doacao' ? <FileText size={18} /> : <Printer size={18} />}
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
          {activeTab === 'reports' && (
            <motion.div 
              key="reports"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8"
            >
              {/* Print Requests Section - Only for Admin */}
              {isAdmin && (
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="bg-[#1C1917] p-3 rounded-2xl text-white">
                        <Printer size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-[#1C1917]">Impressão de Solicitações</h3>
                        <p className="text-[#78716C] text-sm font-medium">Imprima as solicitações aprovadas por data</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-full sm:w-auto flex items-center gap-2">
                        <div>
                          <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1 ml-1">Início</label>
                          <input 
                            type="date" 
                            value={printRange.start}
                            onChange={(e) => setPrintRange({...printRange, start: e.target.value})}
                            className="w-full sm:w-40 px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                          />
                        </div>
                        <div className="mt-4 text-[#A8A29E] font-bold">até</div>
                        <div>
                          <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1 ml-1">Fim</label>
                          <input 
                            type="date" 
                            value={printRange.end}
                            onChange={(e) => setPrintRange({...printRange, end: e.target.value})}
                            className="w-full sm:w-40 px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={handlePrintRequests}
                        className="w-full sm:w-auto mt-4 sm:mt-0 bg-[#1C1917] text-white px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#292524] transition-all shadow-lg"
                      >
                        <Printer size={18} /> Imprimir Aprovadas
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Report Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {isAdmin && (
                  <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                    <p className="text-[#78716C] text-xs font-bold uppercase tracking-wider mb-2">Entradas no Período</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600">
                          <TrendingUp size={20} />
                        </div>
                        <h3 className="text-3xl font-black">{reportData.entries}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-[#A8A29E] uppercase">Valor Total</p>
                        <p className="text-sm font-black text-emerald-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.entriesValue)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {isAdmin && (
                  <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                    <p className="text-[#78716C] text-xs font-bold uppercase tracking-wider mb-2">Saídas no Período</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-rose-100 p-2 rounded-xl text-rose-600">
                          <TrendingDown size={20} />
                        </div>
                        <h3 className="text-3xl font-black">{reportData.exits}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-[#A8A29E] uppercase">Valor Total</p>
                        <p className="text-sm font-black text-rose-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.exitsValue)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {isAdmin && (
                  <>
                    <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                      <p className="text-[#78716C] text-xs font-bold uppercase tracking-wider mb-2">Valor Total em Estoque</p>
                      <div className="flex items-center gap-3">
                        <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
                          <DollarSign size={20} />
                        </div>
                        <h3 className="text-2xl font-black">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.totalValue)}
                        </h3>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                      <p className="text-[#78716C] text-xs font-bold uppercase tracking-wider mb-2">Itens Ativos</p>
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                          <Package size={20} />
                        </div>
                        <h3 className="text-3xl font-black">{items.length}</h3>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Daily Movement */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                  <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                    <BarChart3 size={18} className="text-[#1C1917]" /> Movimentação Diária
                  </h4>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportData.daily}>
                        <defs>
                          <linearGradient id="colorEntries" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorExits" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F4" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area type="monotone" dataKey="entries" name="Entradas" stroke="#10b981" fillOpacity={1} fill="url(#colorEntries)" strokeWidth={3} />
                        <Area type="monotone" dataKey="exits" name="Saídas" stroke="#f43f5e" fillOpacity={1} fill="url(#colorExits)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Distribution by Category */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                  <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                    <Filter size={18} className="text-[#1C1917]" /> Distribuição por Categoria (Qtd)
                  </h4>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={reportData.categories}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {reportData.categories.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name)} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Value by Category */}
                {isAdmin && (
                  <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                    <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                      <DollarSign size={18} className="text-emerald-600" /> Valor em Estoque por Categoria
                    </h4>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.categoryValues} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F5F5F4" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1C1917', fontWeight: 'bold'}} width={120} />
                          <Tooltip 
                            cursor={{fill: '#FAFAF9'}}
                            formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
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
                )}

                {/* Exits by Reason - Only for Admin */}
                {isAdmin && (
                  <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                    <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                      <TrendingDown size={18} className="text-rose-600" /> Saídas por Motivo
                    </h4>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Consumo', value: reportData.exitsByReason.consumo },
                              { name: 'Doação', value: reportData.exitsByReason.doacao },
                              { name: 'Vencimento', value: reportData.exitsByReason.vencido }
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            <Cell fill="#3b82f6" />
                            <Cell fill="#f59e0b" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Exits by Sector - Only for Admin */}
                {isAdmin && (
                  <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                    <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                      <ArrowUpRight size={18} className="text-rose-600" /> Saídas por Setor (Quantidade por Tipo)
                    </h4>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.sectors} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F5F5F4" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1C1917', fontWeight: 'bold'}} width={100} />
                          <Tooltip 
                            cursor={{fill: '#FAFAF9'}}
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          {reportData.categoriesInSector.map((cat: string) => (
                            <Bar 
                              key={cat} 
                              dataKey={cat} 
                              name={cat} 
                              stackId="a" 
                              fill={getCategoryColor(cat)} 
                              radius={[0, 0, 0, 0]} 
                              barSize={20} 
                            />
                          ))}
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Value by Supplier */}
                {isAdmin && (
                  <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                    <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                      <DollarSign size={18} className="text-amber-600" /> Valor por Fornecedor
                    </h4>
                    <div className="h-[400px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.suppliers} layout="vertical" margin={{ left: 20, right: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F5F5F4" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 10, fill: '#1C1917', fontWeight: 'bold'}} 
                            width={150}
                          />
                          <Tooltip 
                            cursor={{fill: '#FAFAF9'}}
                            formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="value" name="Valor Total" fill="#f59e0b" radius={[0, 8, 8, 0]} barSize={20} />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Top Consumed Items */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm lg:col-span-2">
                  <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                    <ArrowDownLeft size={18} className="text-rose-600" /> Itens Mais Consumidos (Top 10)
                  </h4>
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.topConsumed}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F4" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1C1917', fontWeight: 'bold'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                        <Tooltip 
                          cursor={{fill: '#FAFAF9'}}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="value" name="Qtd Consumida" fill="#f43f5e" radius={[8, 8, 0, 0]} barSize={40} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Requested Items */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm lg:col-span-2">
                  <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                    <Plus size={18} className="text-blue-600" /> Itens Mais Solicitados (Top 10)
                  </h4>
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.topRequested}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F4" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1C1917', fontWeight: 'bold'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                        <Tooltip 
                          cursor={{fill: '#FAFAF9'}}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="value" name="Qtd Solicitada" fill="#3b82f6" radius={[8, 8, 0, 0]} barSize={40} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Extra vs Contract Comparison */}
                {isAdmin && (
                  <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm lg:col-span-2">
                    <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                      <BarChart3 size={18} className="text-purple-600" /> Comparativo: Contrato vs Extra vs Doação
                    </h4>
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
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F4" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#1C1917', fontWeight: 'bold'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                          <Tooltip 
                            cursor={{fill: '#FAFAF9'}}
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Legend />
                          <Bar dataKey="contrato" name="Contrato" fill="#1C1917" radius={[8, 8, 0, 0]} barSize={30} />
                          <Bar dataKey="extra" name="Extra" fill="#8b5cf6" radius={[8, 8, 0, 0]} barSize={30} />
                          <Bar dataKey="doacao" name="Doação" fill="#10b981" radius={[8, 8, 0, 0]} barSize={30} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Detailed Sector Breakdown - Only for Admin */}
                {isAdmin && (
                  <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm lg:col-span-2">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h4 className="text-lg font-bold flex items-center gap-2 mb-1">
                        <History size={18} className="text-[#1C1917]" /> 
                        Relatório de Consumo por Item e Setor
                      </h4>
                      <p className="text-xs text-[#78716C] font-medium">
                        {reportSectorFilter === 'all' ? 'Todos os Setores' : `Setor: ${reportSectorFilter}`} • {format(parseISO(reportRange.start), 'dd/MM/yyyy')} a {format(parseISO(reportRange.end), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-widest">Valor Total de Saídas</p>
                        <p className="text-xl font-black text-rose-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.consumptionReport.reduce((sum, i) => sum + i.totalValue, 0))}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setSelectedRoomCategories([...categories]);
                            setShowRoomInventoryModal(true);
                          }}
                          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-sm"
                        >
                          <Printer size={14} /> Mapa de Sala (Porta)
                        </button>
                        <button 
                          onClick={handleExportConsumptionPDF}
                          className="flex items-center gap-2 bg-[#1C1917] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#292524] transition-all shadow-sm"
                        >
                          <Download size={14} /> Exportar PDF de Consumo
                        </button>
                      </div>
                    </div>
                  </div>
                  
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E7E5E4]">
                            <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider">Setor / Item</th>
                            <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider">Categoria</th>
                            <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider text-center">Quantidade</th>
                            {isAdmin && <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider text-right">Valor Total</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F5F5F4]">
                          {reportData.consumptionBySector.map((sectorGroup, idx) => (
                            <React.Fragment key={idx}>
                              <tr className="bg-[#F5F5F4]/50 border-b border-[#E7E5E4]">
                                <td className="py-2 px-4 font-bold text-[10px] uppercase tracking-wider text-[#78716C]" colSpan={isAdmin ? 3 : 2}>
                                  {sectorGroup.sector}
                                </td>
                                {isAdmin && (
                                  <td className="py-2 px-4 text-right font-bold text-[#1C1917] text-xs">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sectorGroup.totalValue)}
                                  </td>
                                )}
                              </tr>
                              {Object.values(sectorGroup.items).sort((a, b) => b.quantity - a.quantity).map((item, iIdx) => (
                                <tr key={`${idx}-${iIdx}`} className="hover:bg-[#FAFAF9]/50 transition-all border-b border-[#F5F5F4]/30 last:border-b-0">
                                  <td className="py-3 px-8 text-sm font-medium text-[#44403C]">
                                    {item.name}
                                  </td>
                                  <td className="py-3">
                                    <span 
                                      className="text-[10px] font-bold px-2 py-0.5 rounded text-white whitespace-nowrap opacity-80"
                                      style={{ backgroundColor: getCategoryColor(item.category) }}
                                    >
                                      {item.category}
                                    </span>
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className="text-[#1C1917] font-bold text-sm">
                                      {item.quantity}
                                    </span>
                                  </td>
                                  {isAdmin && (
                                    <td className="py-3 text-right font-medium text-[#78716C] text-sm">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                          {reportData.consumptionBySector.length === 0 && (
                            <tr>
                              <td colSpan={isAdmin ? 4 : 3} className="py-10 text-center text-[#A8A29E] italic">Nenhuma saída registrada para este período.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                </div>
                )}
              </div>
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
                      <div>
                        <label className="block text-[10px] font-black text-[#A8A29E] uppercase tracking-widest mb-1.5 ml-1">Setor</label>
                        <select 
                          required
                          className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold text-sm"
                          value={authSector}
                          onChange={e => setAuthSector(e.target.value)}
                        >
                          {SECTORS.map(sector => (
                            <option key={sector} value={sector}>{sector}</option>
                          ))}
                        </select>
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
                <table className="w-full text-left border-collapse">
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
                          <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: `${SECTOR_COLORS[u.sector || ''] || '#000000'}20`, color: SECTOR_COLORS[u.sector || ''] || '#000000' }}>
                            {u.sector}
                          </span>
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
            </motion.div>
          )}

          {activeTab === 'trash' && (
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
                  <table className="w-full text-left border-collapse">
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
                  <table className="w-full text-left border-collapse">
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
                  <table className="w-full text-left border-collapse">
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
                  {transactions.filter(t => t.deletedAt).length === 0 && (
                    <div className="p-12 text-center">
                      <p className="text-[#A8A29E] text-sm">Nenhuma movimentação na lixeira.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'requests' && (
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
                    {requests.filter(req => !req.deletedAt).map(req => (
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
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                            req.status === 'PENDENTE' ? 'bg-amber-100 text-amber-600' :
                            req.status === 'APROVADO' ? 'bg-blue-100 text-blue-600' :
                            req.status === 'ENTREGUE' ? 'bg-emerald-100 text-emerald-600' :
                            req.status === 'RECUSADO' ? 'bg-rose-100 text-rose-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {req.status}
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
                {requests.length === 0 && (
                  <div className="p-20 text-center">
                    <FileText className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                    <p className="text-[#78716C]">Nenhuma solicitação encontrada.</p>
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
                    {requests.filter(r => r.sector === userProfile?.sector && !r.deletedAt).map(req => (
                      <tr key={req.id} className="hover:bg-[#FAFAF9] transition-all">
                        <td className="px-6 py-4">
                          <p className="font-bold text-sm">#{req.id.slice(-5).toUpperCase()}</p>
                          <p className="text-xs text-[#A8A29E]">{new Date(req.date).toLocaleDateString('pt-BR')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                            req.status === 'PENDENTE' ? 'bg-amber-100 text-amber-600' :
                            req.status === 'APROVADO' ? 'bg-blue-100 text-blue-600' :
                            req.status === 'ENTREGUE' ? 'bg-emerald-100 text-emerald-600' :
                            req.status === 'RECUSADO' ? 'bg-rose-100 text-rose-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {req.status}
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
                {requests.filter(r => r.sector === userProfile?.sector).length === 0 && (
                  <div className="p-20 text-center">
                    <FileText className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                    <p className="text-[#78716C]">Você ainda não fez nenhuma solicitação.</p>
                  </div>
                )}
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
                      value={userProfile?.sector || ''} 
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
                          {Object.values(groupedItems)
                            .filter(group => normalizeString(group.name).includes(normalizeString(requestSearchTerm)))
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .slice(0, 15)
                            .map(group => (
                              <button
                                key={group.name}
                                type="button"
                                onClick={() => {
                                  const item = group.batches[0];
                                  const existing = requestBasket.find(bi => bi.product_id === item.id);
                                  if (existing) {
                                    setRequestBasket(requestBasket.map(bi => bi.product_id === item.id ? { ...bi, quantity: bi.quantity + 1 } : bi));
                                  } else {
                                    setRequestBasket([...requestBasket, { product_id: item.id, product_name: item.name, quantity: 1 }]);
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
                            ))
                          }
                          {Object.values(groupedItems).filter(group => normalizeString(group.name).includes(normalizeString(requestSearchTerm))).length === 0 && (
                            <div className="p-8 text-center text-[#78716C]">
                              <p className="text-sm font-medium">Nenhum material encontrado.</p>
                            </div>
                          )}
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
                  <label className="block text-xs font-black text-[#78716C] uppercase tracking-widest mb-2">Sala / Localização</label>
                  <select 
                    required
                    className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold appearance-none cursor-pointer"
                    value={bulkEntry.room}
                    onChange={e => setBulkEntry({...bulkEntry, room: e.target.value})}
                  >
                    {ROOMS.map(room => (
                      <option key={room} value={room}>{room}</option>
                    ))}
                  </select>
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
                  <label className="block text-xs font-black text-[#78716C] uppercase tracking-widest mb-2">Sala / Depósito</label>
                  <select 
                    className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                    value={bulkEntry.room}
                    onChange={e => setBulkEntry({...bulkEntry, room: e.target.value})}
                  >
                    {ROOMS.map(room => (
                      <option key={room} value={room}>{room}</option>
                    ))}
                  </select>
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
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest">Nome do Item</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-24">Qtd</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-24">Mín</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-32">Lote</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-48">Validade</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-32">Preço Un.</th>
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkEntry.items.map((item, index) => (
                        <tr key={item.id} className="group">
                          <td className="px-2">
                            <input 
                              required
                              list="item-suggestions"
                              type="text"
                              placeholder="Nome do produto"
                              className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 text-sm font-bold"
                              value={item.name}
                              onChange={e => updateBulkItem(item.id, 'name', e.target.value)}
                            />
                          </td>
                          <td className="px-2">
                            <input 
                              required
                              type="number"
                              min="1"
                              className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 text-sm font-bold"
                              value={isNaN(item.initial_quantity) ? '' : item.initial_quantity}
                              onChange={e => updateBulkItem(item.id, 'initial_quantity', e.target.value === '' ? NaN : parseInt(e.target.value))}
                            />
                          </td>
                          <td className="px-2">
                            <input 
                              required
                              type="number"
                              min="0"
                              className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 text-sm font-bold"
                              value={isNaN(item.min_quantity) ? '' : item.min_quantity}
                              onChange={e => updateBulkItem(item.id, 'min_quantity', e.target.value === '' ? NaN : parseInt(e.target.value))}
                            />
                          </td>
                          <td className="px-2">
                            <input 
                              type="text"
                              placeholder="Lote"
                              className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 text-sm font-bold"
                              value={item.batch_number}
                              onChange={e => updateBulkItem(item.id, 'batch_number', e.target.value)}
                            />
                          </td>
                          <td className="px-2">
                            <div className="flex flex-col gap-1">
                              <input 
                                type="date"
                                disabled={item.is_indeterminate_expiry}
                                className="w-full px-4 py-2 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 text-xs font-bold disabled:opacity-30"
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
                          <td className="px-2">
                            <input 
                              type="number"
                              step="0.01"
                              placeholder="0,00"
                              className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 text-sm font-bold"
                              value={isNaN(item.unit_price) ? '' : item.unit_price}
                              onChange={e => updateBulkItem(item.id, 'unit_price', e.target.value === '' ? NaN : parseFloat(e.target.value))}
                            />
                          </td>
                          <td className="px-2">
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
              {showTransactionModal.type === 'entry' ? 'Registrar Entrada' : 'Registrar Saída'}
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
                    <label className="block text-sm font-bold text-[#57534E] mb-2 text-center">Quantidade</label>
                    <div className="flex items-center justify-center gap-6">
                      <button 
                        type="button"
                        onClick={() => setTransactionQty(Math.max(1, transactionQty - 1))}
                        className="w-12 h-12 rounded-2xl bg-[#F5F5F4] flex items-center justify-center text-2xl font-bold hover:bg-[#E7E5E4]"
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        min="1"
                        value={transactionQty}
                        onChange={e => setTransactionQty(Math.max(1, parseInt(e.target.value) || 0))}
                        className="text-4xl font-bold w-24 text-center bg-transparent border-none focus:ring-0"
                      />
                      <button 
                        type="button"
                        onClick={() => setTransactionQty(transactionQty + 1)}
                        className="w-12 h-12 rounded-2xl bg-[#F5F5F4] flex items-center justify-center text-2xl font-bold hover:bg-[#E7E5E4]"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-[#57534E] mb-2">Estoque Mínimo (5 Semanas)</label>
                    <input 
                      type="number"
                      placeholder="Calculando..."
                      className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                      value={isNaN(transactionMinStock) ? (
                        (() => {
                          const item = showTransactionModal.item || items.find(i => i.id === selectedItemId);
                          if (item) {
                            const weeklyRate = weeklyExitRates[item.name] || 0;
                            return weeklyRate > 0 ? Math.ceil(weeklyRate * 5) : item.min_quantity;
                          }
                          return '';
                        })()
                      ) : transactionMinStock}
                      onChange={e => setTransactionMinStock(parseInt(e.target.value))}
                    />
                    <p className="text-[10px] text-[#A8A29E] mt-1 font-medium italic">
                      Deixe em branco para usar o cálculo automático do sistema.
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-[#57534E] mb-2">Motivo da Saída</label>
                    <div className="grid grid-cols-3 gap-2">
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
                          setSelectedSector('');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${exitReason === 'doacao' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-white text-[#78716C] border-[#E7E5E4] hover:bg-[#F5F5F4]'}`}
                      >
                        Doação
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExitReason('vencido');
                          setSelectedSector('Descarte');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${exitReason === 'vencido' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-white text-[#78716C] border-[#E7E5E4] hover:bg-[#F5F5F4]'}`}
                      >
                        Vencido
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-[#57534E] mb-2">
                      {exitReason === 'doacao' ? 'Destinatário da Doação' : 'Setor de Destino'}
                    </label>
                    {inventoryLocation === 'Farmácia' && exitReason === 'consumo' ? (
                      <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1">Saída Interna Farmácia</p>
                        <p className="text-sm text-emerald-600">Esta movimentação será registrada como consumo interno da Farmácia.</p>
                      </div>
                    ) : exitReason === 'doacao' ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">Unidade Doadora</label>
                          <input 
                            required
                            type="text"
                            placeholder="Policlínica Bernardo Félix da Silva"
                            className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                            value={donationUnitName || 'Policlínica Bernardo Félix da Silva'}
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
                            value={selectedSector}
                            onChange={e => setSelectedSector(e.target.value)}
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
                    ) : (
                      <select 
                        required
                        className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                        value={selectedSector}
                        onChange={e => setSelectedSector(e.target.value)}
                      >
                        {SECTORS.map(sector => (
                          <option key={sector} value={sector}>{sector}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {exitReason === 'vencido' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      <label className="block text-sm font-bold text-[#57534E]">Justificativa do Vencimento</label>
                      <textarea 
                        required
                        placeholder="Explique por que o item venceu no estoque..."
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
                  onClick={() => setShowTransactionModal({ show: false, type: 'entry' })}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-[#78716C] hover:bg-[#F5F5F4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={showTransactionModal.type === 'exit' && basket.length === 0}
                  className={`flex-1 px-4 py-3 text-white rounded-xl font-bold transition-all disabled:opacity-50 ${showTransactionModal.type === 'entry' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                >
                  Confirmar {showTransactionModal.type === 'exit' && basket.length > 0 && `(${basket.length})`}
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
            className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl max-h-[80vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">
                {showDetailModal.type === 'low_stock' ? 'Itens com Estoque Baixo' : 'Itens com Vencimento Próximo'}
              </h3>
              <button 
                onClick={() => setShowDetailModal({ show: false, type: 'low_stock', items: [] })}
                className="p-2 hover:bg-[#F5F5F4] rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {showDetailModal.items.map((item, idx) => {
                const isGroup = 'total_quantity' in item;
                const quantity = isGroup ? (item as ItemGroup).total_quantity : (item as Item).quantity;
                const minQuantity = isGroup ? (item as ItemGroup).min_quantity : (item as Item).min_quantity;
                const name = item.name;
                const id = isGroup ? `group-${idx}` : (item as Item).id;
                
                return (
                  <div 
                    key={`modal-${id}`} 
                    className={`flex items-center justify-between p-5 rounded-2xl border ${showDetailModal.type === 'low_stock' ? 'bg-orange-50 border-orange-100' : 'bg-red-50 border-red-100'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${showDetailModal.type === 'low_stock' ? 'bg-orange-200 text-orange-700' : 'bg-red-200 text-red-700'}`}>
                        {showDetailModal.type === 'low_stock' ? quantity : <Calendar size={20} />}
                      </div>
                      <div>
                        <p className="font-bold text-lg">{name}</p>
                        <p className={`text-sm ${showDetailModal.type === 'low_stock' ? 'text-orange-700' : 'text-red-700'}`}>
                          {showDetailModal.type === 'low_stock' 
                            ? `Estoque total: ${quantity} (Mínimo: ${minQuantity})` 
                            : `Vencimento: ${new Date((item as Item).expiry_date!).toLocaleDateString('pt-BR')}`}
                        </p>
                        {!isGroup && <p className="text-xs text-[#78716C] mt-1">Lote: {(item as Item).batch_number || 'N/A'} | Fornecedor: {(item as Item).supplier || 'N/A'}</p>}
                        {isGroup && <p className="text-xs text-[#78716C] mt-1">{(item as ItemGroup).batches.length} lotes ativos</p>}
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setShowDetailModal({ show: false, type: 'low_stock', items: [] });
                        const targetItem = isGroup ? (item as ItemGroup).batches[0] : (item as Item);
                        setShowTransactionModal({ show: true, type: showDetailModal.type === 'low_stock' ? 'entry' : 'exit', item: targetItem });
                      }}
                      className={`px-5 py-2 rounded-xl text-sm font-bold text-white transition-all ${showDetailModal.type === 'low_stock' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'}`}
                    >
                      {showDetailModal.type === 'low_stock' ? 'Repor' : 'Retirar'}
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
            className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#1C1917]">Configurações</h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="p-2 hover:bg-[#F5F5F4] rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              {isAdmin && (
                <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-3 mb-3 text-blue-600">
                    <Users size={24} />
                    <h4 className="font-bold">Ferramentas de Dados</h4>
                  </div>
                  <p className="text-sm text-blue-700 mb-4 leading-relaxed">
                    Corrija inconsistências unificando fornecedores cadastrados com nomes diferentes.
                  </p>
                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => {
                        setShowSettingsModal(false);
                        setShowMergeSuppliers(true);
                      }}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={18} /> Mesclar Fornecedores
                    </button>
                    <button 
                      onClick={() => {
                        setShowSettingsModal(false);
                        setShowMergeItems(true);
                      }}
                      className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Package size={18} /> Mesclar Itens Duplicados
                    </button>
                  </div>
                </div>
              )}

              <div className="p-6 bg-[#FAFAF9] rounded-2xl border border-[#E7E5E4]">
                <h4 className="font-bold text-[#1C1917] mb-2">Informações do Sistema</h4>
                <div className="space-y-2 text-sm text-[#78716C]">
                  <div className="flex justify-between">
                    <span>Versão</span>
                    <span className="font-mono">1.2.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total de Itens</span>
                    <span className="font-bold">{items.length}</span>
                  </div>
                  <div className="pt-2 border-t border-[#E7E5E4] mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#A8A29E] mb-1">Suporte e Desenvolvimento</p>
                    <p className="font-bold text-[#1C1917]">gerlianemagalhaes79@gmail.com</p>
                  </div>
                </div>
              </div>
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

      {/* Room Inventory Modal */}
      <AnimatePresence>
        {showRoomInventoryModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-[32px] p-8 shadow-2xl max-h-[90vh] flex flex-col"
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
                <h3 className="text-2xl font-black text-[#1C1917]">Detalhes da Solicitação</h3>
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
                  showRequestDetailModal.request.status === 'APROVADO' ? 'bg-blue-100 text-blue-600' :
                  showRequestDetailModal.request.status === 'ENTREGUE' ? 'bg-emerald-100 text-emerald-600' :
                  showRequestDetailModal.request.status === 'RECUSADO' ? 'bg-rose-100 text-rose-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {showRequestDetailModal.request.status}
                </span>
              </div>
            </div>

            {showRequestDetailModal.request.observation && (
              <div className="mb-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Observação do Solicitante</p>
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
                className="flex-[2] py-4 px-6 bg-emerald-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3"
              >
                <Printer size={18} />
                Reimprimir Comprovante
              </button>
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

            <div className="space-y-4 mb-8">
              <h4 className="font-bold text-[#1C1917] flex items-center gap-2">
                <Package size={18} /> Itens Solicitados
              </h4>
              <div className="bg-white rounded-2xl border border-[#E7E5E4] overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                      <th className="px-4 py-3 font-bold text-xs text-[#78716C]">Item</th>
                      <th className="px-4 py-3 font-bold text-xs text-[#78716C] text-center">Qtd. Solicitada</th>
                      <th className="px-4 py-3 font-bold text-xs text-[#78716C] text-center">Saldo em Estoque</th>
                      <th className="px-4 py-3 font-bold text-xs text-[#78716C] text-center">Qtd. a Liberar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E5E4]">
                    {allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request?.id).map(item => {
                      // Calcular estoque atual deste item (somando todos os lotes)
                      const totalStock = items
                        .filter(i => !i.deletedAt && i.name === item.product_name)
                        .reduce((sum, i) => sum + i.quantity, 0);
                        
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-bold text-[#1C1917]">{item.product_name}</td>
                          <td className="px-4 py-3 text-sm font-bold text-center text-[#78716C] bg-slate-50/50">{item.quantity_requested}</td>
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
                          <td className="px-4 py-3 text-center">
                            {isAdmin && showRequestDetailModal.request?.status === 'PENDENTE' ? (
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {isAdmin && (
              <div className="flex gap-3">
                {showRequestDetailModal.request.status === 'PENDENTE' && (
                  <>
                    <button 
                      onClick={() => handleRejectRequest(showRequestDetailModal.request!.id)}
                      className="flex-1 py-3 bg-rose-100 text-rose-600 rounded-xl font-bold hover:bg-rose-200 transition-all"
                    >
                      Recusar
                    </button>
                    <button 
                      onClick={() => handleApproveRequest(showRequestDetailModal.request!.id, allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request?.id))}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                    >
                      Aprovar Solicitação
                    </button>
                  </>
                )}
                {showRequestDetailModal.request.status === 'APROVADO' && (
                  <button 
                    onClick={() => handleDeliverRequest(showRequestDetailModal.request!.id, allRequestItems.filter(ri => ri.request_id === showRequestDetailModal.request?.id))}
                    className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={20} /> Confirmar Entrega e Baixar Estoque
                  </button>
                )}
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
    </div>
  );
}
