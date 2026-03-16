import React, { useState, useEffect, useMemo } from 'react';
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
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
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
  getDocs
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { Item, Transaction } from './types';
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
import { format, subDays, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ItemGroup {
  name: string;
  total_quantity: number;
  min_quantity: number;
  category: string | null;
  supplier: string | null;
  batches: Item[];
}

const SECTORS = [
  'Imagem', 'Ilha', 'Pé Diabético', 'Direção', 'Setor Pessoal', 
  'CER', 'Setor de Terapias', 'SSVV', 'Recepção', 
  'Higienização', 'Manutenção', 'Almoxarifado'
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
};

const CATEGORY_COLORS: Record<string, string> = {
  'Médico Hospitalar': '#ef4444',
  'Alimentício': '#f59e0b',
  'Expediente': '#3b82f6',
  'Higiene': '#10b981',
  'Radiológico': '#8b5cf6',
  'Outros': '#78716c',
};

const getCategoryColor = (cat: string) => {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  const hash = cat.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
};

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'reports'>('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState<{show: boolean, type: 'entry' | 'exit', item?: Item}>({ show: false, type: 'entry' });
  const [showDetailModal, setShowDetailModal] = useState<{show: boolean, type: 'low_stock' | 'expiry', items: Item[]}>({ show: false, type: 'low_stock', items: [] });
  const [showDeleteModal, setShowDeleteModal] = useState<{show: boolean, transactionId?: string}>({ show: false });
  const [deletionReason, setDeletionReason] = useState('');
  const [showDeletedHistory, setShowDeletedHistory] = useState(false);
  
  // Form states
  const [bulkEntry, setBulkEntry] = useState({
    supplier: '',
    category: 'Expediente',
    origin: 'extra' as 'contract' | 'extra',
    items: [{
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      initial_quantity: 1,
      min_quantity: 5,
      batch_number: '',
      expiry_date: '',
      is_indeterminate_expiry: false,
      unit_price: 0
    }]
  });
  const [categories, setCategories] = useState<string[]>(['Médico Hospitalar', 'Alimentício', 'Expediente', 'Higiene', 'Radiológico']);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const addBulkItemRow = () => {
    setBulkEntry(prev => ({
      ...prev,
      items: [...prev.items, {
        id: Math.random().toString(36).substr(2, 9),
        name: '',
        initial_quantity: 1,
        min_quantity: 5,
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

  const updateBulkItem = (id: string, field: string, value: any) => {
    setBulkEntry(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
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
  const [reportRange, setReportRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [reportSectorFilter, setReportSectorFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'contract' | 'extra'>('all');

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const uniqueSuppliers = useMemo(() => {
    const fromItems = items.map(i => i.supplier).filter(Boolean) as string[];
    const fromTrans = transactions.map(t => t.supplier).filter(Boolean) as string[];
    return Array.from(new Set([...fromItems, ...fromTrans])).sort();
  }, [items, transactions]);

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
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const role = user.email === 'gerlianemagalhaes79@gmail.com' ? 'admin' : 'user';
        try {
          await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName,
            role: role,
            lastLogin: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.error("Error updating user document:", e);
        }
      }
      setLoading(false);
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
    });

    const qTrans = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubscribeTrans = onSnapshot(qTrans, (snapshot) => {
      const fifteenDaysAgo = subDays(new Date(), 15);
      const transData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Transaction))
        .filter(t => !t.deletedAt || new Date(t.deletedAt) > fifteenDaysAgo);
      setTransactions(transData);
    });

    return () => {
      unsubscribeItems();
      unsubscribeTrans();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setLoginLoading(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/unauthorized-domain') {
        alert("Erro: Domínio não autorizado. Você precisa adicionar o domínio do Vercel nas configurações do Firebase (Authentication > Settings > Authorized Domains).");
      } else if (error.code === 'auth/popup-blocked') {
        alert("Erro: O popup de login foi bloqueado pelo seu navegador. Por favor, permita popups para este site.");
      } else {
        alert(`Erro ao entrar: ${error.message}`);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleDeleteTransaction = async (id: string, reason: string) => {
    if (!id) return;
    try {
      const transRef = doc(db, 'transactions', id);
      const transSnap = await getDoc(transRef);
      if (!transSnap.exists()) return;
      const transData = transSnap.data() as Transaction;

      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'items', transData.item_id);
        const itemSnap = await transaction.get(itemRef);
        
        if (itemSnap.exists()) {
          const itemData = itemSnap.data() as Item;
          let newQty = itemData.quantity;
          if (transData.type === 'entry') {
            newQty -= transData.quantity;
          } else {
            newQty += transData.quantity;
          }
          transaction.update(itemRef, { quantity: Math.max(0, newQty) });
        }

        transaction.update(transRef, {
          deletedAt: new Date().toISOString(),
          deletionReason: reason || 'Sem justificativa',
          deletedByEmail: user?.email
        });
      });

      setShowDeleteModal({ show: false });
      setDeletionReason('');
    } catch (error) {
      console.error("Error deleting transaction:", error);
      alert("Erro ao excluir movimentação. Verifique suas permissões.");
    }
  };

  const handleRecoverTransaction = async (id: string) => {
    try {
      const transRef = doc(db, 'transactions', id);
      const transSnap = await getDoc(transRef);
      if (!transSnap.exists()) return;
      const transData = transSnap.data() as Transaction;

      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'items', transData.item_id);
        const itemSnap = await transaction.get(itemRef);
        
        if (itemSnap.exists()) {
          const itemData = itemSnap.data() as Item;
          let newQty = itemData.quantity;
          if (transData.type === 'entry') {
            newQty += transData.quantity;
          } else {
            newQty -= transData.quantity;
          }
          transaction.update(itemRef, { quantity: Math.max(0, newQty) });
        }

        transaction.update(transRef, {
          deletedAt: null,
          deletionReason: null,
          deletedByEmail: null
        });
      });
    } catch (error) {
      console.error("Error recovering transaction:", error);
      alert("Erro ao recuperar movimentação.");
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      for (const itemData of bulkEntry.items) {
        const initial_qty = isNaN(itemData.initial_quantity) ? 0 : itemData.initial_quantity;
        const min_qty = isNaN(itemData.min_quantity) ? 5 : itemData.min_quantity;
        const price = isNaN(itemData.unit_price) ? 0 : itemData.unit_price;

        // Check if item already exists with the same name AND batch
        const existingItem = items.find(i => 
          i.name.toLowerCase() === itemData.name.toLowerCase() && 
          (i.batch_number || '').toLowerCase() === (itemData.batch_number || '').toLowerCase()
        );

        if (existingItem) {
          await runTransaction(db, async (transaction) => {
            const itemDoc = doc(db, 'items', existingItem.id);
            const transCol = collection(db, 'transactions');
            
            const expiryValue = itemData.is_indeterminate_expiry ? 'Indeterminada' : itemData.expiry_date;

            transaction.update(itemDoc, {
              quantity: existingItem.quantity + initial_qty,
              min_quantity: min_qty,
              expiry_date: expiryValue || existingItem.expiry_date,
              unit_price: price || existingItem.unit_price,
              supplier: bulkEntry.supplier || existingItem.supplier,
              category: bulkEntry.category || existingItem.category
            });

            const newTransRef = doc(transCol);
            transaction.set(newTransRef, {
              item_id: existingItem.id,
              item_name: existingItem.name,
              type: 'entry',
              origin: bulkEntry.origin,
              quantity: initial_qty,
              date: new Date().toISOString(),
              responsible: user?.displayName || 'Sistema',
              responsibleEmail: user?.email || '',
              supplier: bulkEntry.supplier || existingItem.supplier
            });
          });
        } else {
          const itemCol = collection(db, 'items');
          const transCol = collection(db, 'transactions');
          
          const expiryValue = itemData.is_indeterminate_expiry ? 'Indeterminada' : itemData.expiry_date;

          const itemRef = await addDoc(itemCol, {
            name: itemData.name,
            min_quantity: min_qty,
            expiry_date: expiryValue,
            origin: bulkEntry.origin,
            unit_price: price,
            supplier: bulkEntry.supplier,
            category: bulkEntry.category,
            batch_number: itemData.batch_number,
            quantity: initial_qty,
            createdAt: new Date().toISOString()
          });

          await addDoc(transCol, {
            item_id: itemRef.id,
            item_name: itemData.name,
            type: 'entry',
            origin: bulkEntry.origin,
            quantity: initial_qty,
            date: new Date().toISOString(),
            responsible: user?.displayName || 'Sistema',
            responsibleEmail: user?.email || '',
            supplier: bulkEntry.supplier
          });
        }
      }

      setShowAddModal(false);
      setBulkEntry({ 
        supplier: '',
        category: 'Expediente',
        origin: 'extra',
        items: [{
          id: Math.random().toString(36).substr(2, 9),
          name: '',
          initial_quantity: 1,
          min_quantity: 5,
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
          for (const b of basket) {
            const item = items.find(i => i.id === b.item_id);
            if (!item) continue;

            const itemDoc = doc(db, 'items', item.id);
            const transCol = collection(db, 'transactions');
            
            transaction.update(itemDoc, {
              quantity: item.quantity - b.quantity
            });

            const newTransRef = doc(transCol);
            transaction.set(newTransRef, {
              item_id: item.id,
              item_name: item.name,
              type: 'exit',
              origin: item.origin,
              quantity: b.quantity,
              sector: selectedSector,
              date: new Date().toISOString(),
              responsible: user?.displayName || 'Sistema',
              responsibleEmail: user?.email || '',
              exitReason: exitReason,
              expiryReason: exitReason === 'vencido' ? expiryReason : null,
              batch_number: item.batch_number,
              expiry_date: item.expiry_date
            });
          }
        });
      } else {
        const item = showTransactionModal.item || items.find(i => i.id === selectedItemId);
        if (!item) {
          alert('Por favor, selecione um item.');
          return;
        }
        
        await runTransaction(db, async (transaction) => {
          const itemDoc = doc(db, 'items', item.id);
          const transCol = collection(db, 'transactions');
          
          transaction.update(itemDoc, {
            quantity: item.quantity + transactionQty
          });

          const newTransRef = doc(transCol);
          transaction.set(newTransRef, {
            item_id: item.id,
            item_name: item.name,
            type: 'entry',
            origin: item.origin,
            quantity: transactionQty,
            sector: null,
            date: new Date().toISOString(),
            responsible: user?.displayName || 'Sistema',
            responsibleEmail: user?.email || '',
            batch_number: item.batch_number,
            expiry_date: item.expiry_date,
            supplier: item.supplier
          });
        });
      }

      setShowTransactionModal({ show: false, type: 'entry' });
      setTransactionQty(1);
      setExitReason('consumo');
      setExpiryReason('');
      setSelectedSector(SECTORS[0]);
      setSelectedItemId('');
      setBasket([]);
    } catch (error: any) {
      console.error('Erro na transação:', error);
      alert(`Erro na movimentação: ${error.message}`);
    }
  };

  const handleExportExcel = () => {
    try {
      // Prepare data for Excel
      const exportData = reportData.sectorItems.map(item => ({
        'Item': item.name,
        'Categoria': item.category,
        'Fornecedor': item.supplier,
        'Quantidade': item.quantity,
        'Valor Total (BRL)': item.value
      }));

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

  const reportData = useMemo(() => {
    const start = startOfDay(parseISO(reportRange.start));
    const end = endOfDay(parseISO(reportRange.end));

    const filteredTrans = transactions.filter(t => {
      if (t.deletedAt) return false;
      const d = new Date(t.date);
      const inRange = d >= start && d <= end;
      const matchesSector = reportSectorFilter === 'all' || t.sector === reportSectorFilter;
      return inRange && matchesSector;
    });

    const entries = filteredTrans.filter(t => t.type === 'entry').reduce((sum, t) => sum + t.quantity, 0);
    const exits = filteredTrans.filter(t => t.type === 'exit').reduce((sum, t) => sum + t.quantity, 0);

    // Extra vs Contract stats
    const originStats = {
      extra: { entries: 0, exits: 0, current: 0 },
      contract: { entries: 0, exits: 0, current: 0 }
    };

    filteredTrans.forEach(t => {
      const origin = t.origin || 'contract';
      if (t.type === 'entry') originStats[origin].entries += t.quantity;
      else originStats[origin].exits += t.quantity;
    });

    items.forEach(item => {
      const origin = item.origin || 'contract';
      originStats[origin].current += item.quantity;
    });

    // Group by date for line chart
    const dailyData: Record<string, { date: string, entries: number, exits: number }> = {};
    filteredTrans.forEach(t => {
      const dateKey = format(new Date(t.date), 'dd/MM');
      if (!dailyData[dateKey]) dailyData[dateKey] = { date: dateKey, entries: 0, exits: 0 };
      if (t.type === 'entry') dailyData[dateKey].entries += t.quantity;
      else dailyData[dateKey].exits += t.quantity;
    });

    // Group by category for pie chart
    const categoryData: Record<string, number> = {};
    items.forEach(item => {
      const cat = item.category || 'Outros';
      categoryData[cat] = (categoryData[cat] || 0) + item.quantity;
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

    // Detailed items for the selected sector
    const sectorItems: Record<string, { name: string, quantity: number, value: number, category: string, supplier: string }> = {};
    filteredTrans.filter(t => t.type === 'exit').forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const value = t.quantity * (item?.unit_price || 0);
      
      if (!sectorItems[t.item_name]) {
        sectorItems[t.item_name] = { 
          name: t.item_name, 
          quantity: 0, 
          value: 0, 
          category: item?.category || 'Outros',
          supplier: item?.supplier || 'N/A'
        };
      }
      sectorItems[t.item_name].quantity += t.quantity;
      sectorItems[t.item_name].value += value;
    });

    // Group by supplier for value chart
    const supplierData: Record<string, number> = {};
    items.forEach(item => {
      const sup = item.supplier || 'Sem Fornecedor';
      supplierData[sup] = (supplierData[sup] || 0) + (item.quantity * item.unit_price);
    });

    const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    return {
      entries,
      exits,
      daily: Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date)),
      categories: Object.entries(categoryData).map(([name, value]) => ({ name, value })),
      sectors: Object.values(sectorData),
      categoriesInSector: Array.from(categoriesInSector),
      suppliers: Object.entries(supplierData).map(([name, value]) => ({ name, value })),
      sectorItems: Object.values(sectorItems).sort((a, b) => b.value - a.value),
      totalValue,
      originStats
    };
  }, [transactions, items, reportRange, reportSectorFilter]);

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
          className="bg-white p-12 rounded-[40px] shadow-2xl max-w-md w-full text-center border border-[#E7E5E4]"
        >
          <div className="bg-[#1C1917] w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg">
            <Package className="text-white w-10 h-10" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-4">Almoxarifado Pro</h1>
          <p className="text-[#78716C] mb-10 leading-relaxed">Gerencie seu estoque com precisão cirúrgica e relatórios em tempo real.</p>
          <button 
            onClick={handleLogin}
            disabled={loginLoading}
            className="w-full bg-[#1C1917] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#292524] transition-all shadow-xl hover:shadow-2xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loginLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <><LogIn size={20} /> Entrar com Google</>
            )}
          </button>
          <p className="mt-8 text-[10px] text-[#A8A29E] uppercase tracking-widest font-bold">Acesso restrito a funcionários autorizados</p>
          <p className="mt-2 text-[10px] text-[#A8A29E]">Certifique-se de que os popups estão permitidos no seu navegador.</p>
        </motion.div>
      </div>
    );
  }

  const isNearExpiry = (dateStr: string | null) => {
    if (!dateStr || dateStr === 'Indeterminada') return false;
    const expiry = new Date(dateStr);
    const now = new Date();
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(now.getMonth() + 1);
    return expiry <= oneMonthFromNow && expiry >= now;
  };

  const isLowStock = (item: Item) => item.quantity <= item.min_quantity;

  const lowStockItems = items.filter(isLowStock);
  const nearExpiryItems = items.filter(i => isNearExpiry(i.expiry_date));
  const totalVolume = items.reduce((sum, item) => sum + item.quantity, 0);

  const filteredItems = items.filter(i => 
    (i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (originFilter === 'all' || i.origin === originFilter)
  );

  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.name]) {
      acc[item.name] = {
        name: item.name,
        total_quantity: 0,
        min_quantity: item.min_quantity,
        category: item.category,
        supplier: item.supplier,
        batches: []
      };
    }
    acc[item.name].total_quantity += item.quantity;
    acc[item.name].batches.push(item);
    return acc;
  }, {} as Record<string, ItemGroup>);

  const groupedArray: ItemGroup[] = Object.values(groupedItems);

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1C1917] font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-[#E7E5E4] p-6 flex flex-col gap-8 z-10">
        <div className="flex items-center gap-3 px-2">
          <div className="bg-[#1C1917] p-2 rounded-lg">
            <Package className="text-white w-6 h-6" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Almoxarifado</h1>
        </div>

        <nav className="flex flex-col gap-1">
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
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-[#F5F5F4] font-semibold' : 'hover:bg-[#FAFAF9] text-[#57534E]'}`}
          >
            <BarChart3 size={20} /> Relatórios
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-[#E7E5E4] space-y-2">
          <div className="px-4 py-2">
            <p className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-widest mb-2">Usuário</p>
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-[#E7E5E4]" alt="" />
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate">{user.displayName}</p>
                <button onClick={handleLogout} className="text-[10px] text-rose-600 font-bold hover:underline flex items-center gap-1">
                  <LogOut size={10} /> Sair
                </button>
              </div>
            </div>
          </div>
          <button className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#57534E] hover:bg-[#FAFAF9] w-full transition-all">
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
            </h2>
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
                  <button 
                    onClick={handleExportExcel}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
                  >
                    <Download size={14} /> Exportar Excel
                  </button>
                </div>
              )}
            </div>
          
          <div className="flex gap-4">
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
                </select>
              </div>
            )}
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
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {/* Stats Cards */}
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

              <div 
                onClick={() => lowStockItems.length > 0 && setShowDetailModal({ show: true, type: 'low_stock', items: lowStockItems })}
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

              {/* Alerts Section */}
              <div className="md:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-3xl border border-[#E7E5E4] shadow-sm">
                  <h4 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <AlertTriangle className="text-orange-500" size={20} /> Alertas Críticos
                  </h4>
                  <div className="space-y-4">
                    {lowStockItems.length === 0 && nearExpiryItems.length === 0 && (
                      <p className="text-[#A8A29E] italic">Nenhum alerta no momento.</p>
                    )}
                    {lowStockItems.map(item => (
                      <div key={`low-${item.id}`} className="flex items-center justify-between p-4 bg-orange-50 rounded-2xl border border-orange-100">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-orange-200 rounded-full flex items-center justify-center text-orange-700 font-bold">
                            {item.quantity}
                          </div>
                          <div>
                            <p className="font-bold">{item.name}</p>
                            <p className="text-sm text-orange-700">Estoque abaixo do mínimo ({item.min_quantity})</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowTransactionModal({ show: true, type: 'entry', item })}
                          className="bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-700 transition-all"
                        >
                          Repor
                        </button>
                      </div>
                    ))}
                    {nearExpiryItems.map(item => (
                      <div key={`exp-${item.id}`} className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center text-red-700">
                            <Calendar size={20} />
                          </div>
                          <div>
                            <p className="font-bold">{item.name}</p>
                            <p className="text-sm text-red-700">Vence em: {new Date(item.expiry_date!).toLocaleDateString('pt-BR')}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowTransactionModal({ show: true, type: 'exit', item })}
                          className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-all"
                        >
                          Retirar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white p-8 rounded-3xl border border-[#E7E5E4] shadow-sm">
                <h4 className="text-xl font-bold mb-6">Atividade Recente</h4>
                <div className="space-y-6">
                  {transactions.slice(0, 5).map(t => (
                    <div key={t.id} className="flex gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${t.type === 'entry' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {t.type === 'entry' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                      </div>
                      <div>
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
                    </div>
                  ))}
                  {transactions.length === 0 && <p className="text-[#A8A29E] text-sm italic">Nenhuma movimentação.</p>}
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
              className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden"
            >
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Item / Lote</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Tipo / Fornecedor</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Origem</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Preço Un.</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Quantidade</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Mínimo</th>
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
                            <p className="font-bold text-lg">{group.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-semibold text-[#44403C]">{group.category || '---'}</p>
                          <p className="text-xs text-[#78716C]">{group.supplier || '---'}</p>
                        </td>
                        <td className="px-6 py-5">
                          {(() => {
                            const origins = new Set(group.batches.map(b => b.origin));
                            if (origins.size === 1) {
                              const origin = Array.from(origins)[0];
                              return (
                                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${origin === 'contract' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                  {origin === 'contract' ? 'Contrato' : 'Extra'}
                                </span>
                              );
                            }
                            return (
                              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-500 uppercase">
                                {group.batches.length} Lotes
                              </span>
                            );
                          })()}
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
                        <td className="px-6 py-5 text-[#57534E] font-medium">{group.min_quantity}</td>
                        <td className="px-6 py-5">
                          <p className="text-xs text-[#A8A29E]">Ver lotes abaixo</p>
                        </td>
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
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs text-[#78716C]">{item.supplier || '---'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.origin === 'contract' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                              {item.origin === 'contract' ? 'Contrato' : 'Extra'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-[#57534E]">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className={`text-lg font-bold ${item.quantity <= (item.min_quantity || 0) ? 'text-orange-600' : 'text-[#1C1917]'}`}>
                                {item.quantity}
                              </span>
                              <span className="text-[9px] font-bold text-[#A8A29E] uppercase tracking-tighter">Neste Lote</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-[#A8A29E]">---</td>
                          <td className="px-6 py-4">
                            {item.expiry_date ? (
                              <span className={`text-xs ${item.expiry_date === 'Indeterminada' ? 'text-blue-600 font-bold' : isNearExpiry(item.expiry_date) ? 'text-red-600 font-bold' : 'text-[#57534E]'}`}>
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
                <h3 className="text-lg font-bold text-[#1C1917]">Histórico de Movimentações</h3>
                <button 
                  onClick={() => setShowDeletedHistory(!showDeletedHistory)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${showDeletedHistory ? 'bg-rose-100 text-rose-700' : 'bg-[#F5F5F4] text-[#78716C] hover:bg-[#E7E5E4]'}`}
                >
                  {showDeletedHistory ? <History size={14} /> : <Trash2 size={14} />}
                  {showDeletedHistory ? 'Ver Histórico Ativo' : 'Ver Excluídos (Testes)'}
                </button>
              </div>

              <div className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Data</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Item</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Setor</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Responsável</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Qtd</th>
                      <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E5E4]">
                    {transactions
                      .filter(t => showDeletedHistory ? !!t.deletedAt : !t.deletedAt)
                      .map(t => (
                      <tr key={t.id} className={`hover:bg-[#FAFAF9] transition-all ${t.deletedAt ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                        <td className="px-6 py-5 text-sm text-[#57534E]">
                          {new Date(t.date).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-6 py-5">
                          <div className="font-bold">{t.item_name}</div>
                          <div className="text-[10px] text-[#A8A29E]">
                            Lote: {t.batch_number || 'N/A'} | Val: {t.expiry_date ? new Date(t.expiry_date).toLocaleDateString('pt-BR') : 'N/A'}
                          </div>
                          {t.exitReason && t.exitReason !== 'consumo' && (
                            <div className="text-[10px] text-rose-500 font-bold mt-1 uppercase">
                              Motivo Saída: {t.exitReason}
                              {t.expiryReason && <span className="text-[#78716C] lowercase font-normal ml-1">({t.expiryReason})</span>}
                            </div>
                          )}
                          {t.deletionReason && (
                            <div className="text-[10px] text-rose-500 font-bold mt-1">Exclusão: {t.deletionReason}</div>
                          )}
                          {t.deletedByEmail && (
                            <div className="text-[10px] text-rose-400 mt-0.5 italic">Por: {t.deletedByEmail}</div>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${t.type === 'entry' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {t.type === 'entry' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                            {t.type === 'entry' ? 'Entrada' : 'Saída'}
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
                        <td className="px-6 py-5 text-right">
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
                              className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Excluir (Teste)"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {((showDeletedHistory && transactions.filter(t => !!t.deletedAt).length === 0) || 
                  (!showDeletedHistory && transactions.filter(t => !t.deletedAt).length === 0)) && (
                  <div className="p-20 text-center">
                    <History className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                    <p className="text-[#78716C]">Nenhuma movimentação encontrada.</p>
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
              {/* Report Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                  <p className="text-[#78716C] text-xs font-bold uppercase tracking-wider mb-2">Entradas no Período</p>
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600">
                      <TrendingUp size={20} />
                    </div>
                    <h3 className="text-3xl font-black">{reportData.entries}</h3>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                  <p className="text-[#78716C] text-xs font-bold uppercase tracking-wider mb-2">Saídas no Período</p>
                  <div className="flex items-center gap-3">
                    <div className="bg-rose-100 p-2 rounded-xl text-rose-600">
                      <TrendingDown size={20} />
                    </div>
                    <h3 className="text-3xl font-black">{reportData.exits}</h3>
                  </div>
                </div>
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
                <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                  <p className="text-[#78716C] text-xs font-bold uppercase tracking-wider mb-2">Entradas Extras (Mês)</p>
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-100 p-2 rounded-xl text-purple-600">
                      <Plus size={20} />
                    </div>
                    <h3 className="text-3xl font-black">{reportData.originStats.extra.entries}</h3>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-[#E7E5E4] shadow-sm">
                  <p className="text-[#78716C] text-xs font-bold uppercase tracking-wider mb-2">Saídas Extras (Mês)</p>
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-100 p-2 rounded-xl text-orange-600">
                      <LogOut size={20} />
                    </div>
                    <h3 className="text-3xl font-black">{reportData.originStats.extra.exits}</h3>
                  </div>
                </div>
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
                    <Filter size={18} className="text-[#1C1917]" /> Distribuição por Categoria
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

                {/* Exits by Sector */}
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

                {/* Value by Supplier */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm">
                  <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                    <DollarSign size={18} className="text-amber-600" /> Valor por Fornecedor
                  </h4>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.suppliers} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F5F5F4" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#A8A29E'}} />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1C1917', fontWeight: 'bold'}} width={100} />
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

                {/* Extra vs Contract Comparison */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm lg:col-span-2">
                  <h4 className="text-lg font-bold mb-8 flex items-center gap-2">
                    <BarChart3 size={18} className="text-purple-600" /> Comparativo: Contrato vs Extra
                  </h4>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[
                          { 
                            name: 'Entradas', 
                            contrato: reportData.originStats.contract.entries, 
                            extra: reportData.originStats.extra.entries 
                          },
                          { 
                            name: 'Saídas', 
                            contrato: reportData.originStats.contract.exits, 
                            extra: reportData.originStats.extra.exits 
                          },
                          { 
                            name: 'Estoque Atual', 
                            contrato: reportData.originStats.contract.current, 
                            extra: reportData.originStats.extra.current 
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
                        <Bar dataKey="contrato" name="Contrato" fill="#1C1917" radius={[8, 8, 0, 0]} barSize={40} />
                        <Bar dataKey="extra" name="Extra" fill="#8b5cf6" radius={[8, 8, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Detailed Sector Breakdown */}
                <div className="bg-white p-8 rounded-[32px] border border-[#E7E5E4] shadow-sm lg:col-span-2">
                  <div className="flex justify-between items-center mb-8">
                    <h4 className="text-lg font-bold flex items-center gap-2">
                      <History size={18} className="text-[#1C1917]" /> 
                      Detalhamento: {reportSectorFilter === 'all' ? 'Todos os Setores' : reportSectorFilter}
                    </h4>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-widest">Valor Total de Saídas</p>
                      <p className="text-xl font-black text-rose-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.sectorItems.reduce((sum, i) => sum + i.value, 0))}
                      </p>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E7E5E4]">
                          <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider">Item</th>
                          <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider">Categoria</th>
                          <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider">Fornecedor</th>
                          <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider text-center">Quantidade</th>
                          <th className="pb-4 font-bold text-xs text-[#78716C] uppercase tracking-wider text-right">Valor Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F5F5F4]">
                        {reportData.sectorItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-[#FAFAF9] transition-all">
                            <td className="py-4 font-bold text-sm">{item.name}</td>
                            <td className="py-4">
                              <span 
                                className="text-[10px] font-bold px-2 py-1 rounded-lg text-white"
                                style={{ backgroundColor: getCategoryColor(item.category) }}
                              >
                                {item.category}
                              </span>
                            </td>
                            <td className="py-4 text-xs text-[#78716C] font-medium">{item.supplier}</td>
                            <td className="py-4 text-center font-bold">{item.quantity}</td>
                            <td className="py-4 text-right font-bold text-rose-600">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                            </td>
                          </tr>
                        ))}
                        {reportData.sectorItems.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-10 text-center text-[#A8A29E] italic">Nenhuma saída registrada para este filtro.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
                    onChange={e => setBulkEntry({...bulkEntry, supplier: e.target.value})}
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
                        <th className="px-4 py-2 text-[10px] font-black text-[#A8A29E] uppercase tracking-widest w-10"></th>
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
                            {bulkEntry.items.length > 1 && (
                              <button 
                                type="button"
                                onClick={() => removeBulkItemRow(item.id)}
                                className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
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
                      <span className="text-4xl font-bold w-16 text-center">{transactionQty}</span>
                      <button 
                        type="button"
                        onClick={() => setTransactionQty(transactionQty + 1)}
                        className="w-12 h-12 rounded-2xl bg-[#F5F5F4] flex items-center justify-center text-2xl font-bold hover:bg-[#E7E5E4]"
                      >
                        +
                      </button>
                    </div>
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
                    {exitReason === 'doacao' ? (
                      <input 
                        required
                        type="text"
                        placeholder="Digite o destinatário..."
                        className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10 font-bold"
                        value={selectedSector}
                        onChange={e => setSelectedSector(e.target.value)}
                      />
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
                            <span className="font-bold w-6 text-center">{b.quantity}</span>
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
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-[#A8A29E] uppercase mb-1 ml-1">1. Escolha o Item</label>
                          <select 
                            className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#1C1917]/10"
                            value={selectedItemName}
                            onChange={e => {
                              setSelectedItemName(e.target.value);
                              setSelectedItemId('');
                            }}
                          >
                            <option value="">Selecione um item...</option>
                            {(Array.from(new Set(items.filter(i => i.quantity > 0).map(i => i.name))) as string[])
                              .sort((a, b) => a.localeCompare(b))
                              .map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))
                            }
                          </select>
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
                                // @ts-ignore
                                setSelectedItemName('');
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
              {showDetailModal.items.map(item => (
                <div 
                  key={`modal-${item.id}`} 
                  className={`flex items-center justify-between p-5 rounded-2xl border ${showDetailModal.type === 'low_stock' ? 'bg-orange-50 border-orange-100' : 'bg-red-50 border-red-100'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${showDetailModal.type === 'low_stock' ? 'bg-orange-200 text-orange-700' : 'bg-red-200 text-red-700'}`}>
                      {showDetailModal.type === 'low_stock' ? item.quantity : <Calendar size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-lg">{item.name}</p>
                      <p className={`text-sm ${showDetailModal.type === 'low_stock' ? 'text-orange-700' : 'text-red-700'}`}>
                        {showDetailModal.type === 'low_stock' 
                          ? `Estoque atual: ${item.quantity} (Mínimo: ${item.min_quantity})` 
                          : `Vencimento: ${new Date(item.expiry_date!).toLocaleDateString('pt-BR')}`}
                      </p>
                      <p className="text-xs text-[#78716C] mt-1">Lote: {item.batch_number || 'N/A'} | Fornecedor: {item.supplier || 'N/A'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setShowDetailModal({ show: false, type: 'low_stock', items: [] });
                      setShowTransactionModal({ show: true, type: showDetailModal.type === 'low_stock' ? 'entry' : 'exit', item });
                    }}
                    className={`px-5 py-2 rounded-xl text-sm font-bold text-white transition-all ${showDetailModal.type === 'low_stock' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {showDetailModal.type === 'low_stock' ? 'Repor' : 'Retirar'}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
