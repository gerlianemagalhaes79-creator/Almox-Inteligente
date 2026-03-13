import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Item, Transaction } from './types';

interface ItemGroup {
  name: string;
  total_quantity: number;
  min_quantity: number;
  category: string | null;
  supplier: string | null;
  batches: Item[];
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history'>('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState<{show: boolean, type: 'entry' | 'exit', item?: Item}>({ show: false, type: 'entry' });
  const [showDetailModal, setShowDetailModal] = useState<{show: boolean, type: 'low_stock' | 'expiry', items: Item[]}>({ show: false, type: 'low_stock', items: [] });
  
  // Form states
  const [newItem, setNewItem] = useState({ 
    name: '', 
    min_quantity: 5, 
    expiry_date: '', 
    origin: 'extra' as 'contract' | 'extra', 
    unit_price: 0,
    supplier: '',
    category: 'Expediente',
    initial_quantity: 1,
    batch_number: ''
  });
  const [transactionQty, setTransactionQty] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const toggleExpand = (name: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(name)) newSet.delete(name);
    else newSet.add(name);
    setExpandedItems(newSet);
  };

  const fetchData = async () => {
    const [itemsRes, transRes] = await Promise.all([
      fetch('/api/items'),
      fetch('/api/transactions')
    ]);
    setItems(await itemsRes.json());
    setTransactions(await transRes.json());
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const initial_qty = isNaN(newItem.initial_quantity) ? 0 : newItem.initial_quantity;
    const min_qty = isNaN(newItem.min_quantity) ? 5 : newItem.min_quantity;
    const price = isNaN(newItem.unit_price) ? 0 : newItem.unit_price;

    // Check if item already exists with the same name AND batch
    const existingItem = items.find(i => 
      i.name.toLowerCase() === newItem.name.toLowerCase() && 
      (i.batch_number || '').toLowerCase() === (newItem.batch_number || '').toLowerCase()
    );

    if (existingItem) {
      // If exists, record an entry transaction AND update min_quantity if provided
      await Promise.all([
        fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: existingItem.id,
            type: 'entry',
            quantity: initial_qty
          })
        }),
        fetch(`/api/items/${existingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...existingItem,
            min_quantity: min_qty,
            // Also update other fields if they were changed in the form
            expiry_date: newItem.expiry_date || existingItem.expiry_date,
            unit_price: price || existingItem.unit_price,
            supplier: newItem.supplier || existingItem.supplier,
            category: newItem.category || existingItem.category
          })
        })
      ]);
    } else {
      // If new, create item first
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItem.name,
          min_quantity: min_qty,
          expiry_date: newItem.expiry_date,
          origin: newItem.origin,
          unit_price: price,
          supplier: newItem.supplier,
          category: newItem.category,
          batch_number: newItem.batch_number
        })
      });
      const data = await res.json();
      
      // Then record initial quantity transaction
      await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: data.id,
          type: 'entry',
          quantity: initial_qty
        })
      });
    }

    setShowAddModal(false);
    setNewItem({ 
      name: '', 
      min_quantity: 5, 
      expiry_date: '', 
      origin: 'extra', 
      unit_price: 0,
      supplier: '',
      category: 'Expediente',
      initial_quantity: 1,
      batch_number: ''
    });
    fetchData();
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showTransactionModal.item) return;
    
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: showTransactionModal.item.id,
        type: showTransactionModal.type,
        quantity: transactionQty
      })
    });
    setShowTransactionModal({ show: false, type: 'entry' });
    setTransactionQty(1);
    fetchData();
  };

  const isNearExpiry = (dateStr: string | null) => {
    if (!dateStr) return false;
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
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())
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
        </nav>

        <div className="mt-auto pt-6 border-t border-[#E7E5E4]">
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
            <p className="text-[#78716C]">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
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
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-[#1C1917] text-white px-5 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-[#292524] transition-all shadow-sm"
            >
              <Plus size={20} /> Novo Item
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
                        <p className="text-xs text-[#78716C]">{t.type === 'entry' ? 'Entrada' : 'Saída'} de {t.quantity} unidades</p>
                        <p className="text-[10px] text-[#A8A29E] mt-1">{new Date(t.date).toLocaleString('pt-BR')}</p>
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
                              <span className={`text-xs ${isNearExpiry(item.expiry_date) ? 'text-red-600 font-bold' : 'text-[#57534E]'}`}>
                                {new Date(item.expiry_date).toLocaleDateString('pt-BR')}
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
              className="bg-white rounded-3xl border border-[#E7E5E4] shadow-sm overflow-hidden"
            >
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAFAF9] border-bottom border-[#E7E5E4]">
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Data</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-4 font-bold text-sm text-[#78716C] uppercase tracking-wider text-right">Quantidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]">
                  {transactions.map(t => (
                    <tr key={t.id} className="hover:bg-[#FAFAF9] transition-all">
                      <td className="px-6 py-5 text-sm text-[#57534E]">
                        {new Date(t.date).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-5 font-bold">{t.item_name}</td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${t.type === 'entry' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {t.type === 'entry' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                          {t.type === 'entry' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right font-bold text-lg">
                        {t.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {transactions.length === 0 && (
                <div className="p-20 text-center">
                  <History className="mx-auto text-[#E7E5E4] mb-4" size={48} />
                  <p className="text-[#78716C]">Nenhuma movimentação registrada.</p>
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
            className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
          >
            <h3 className="text-2xl font-bold mb-6">Cadastrar Novo Item</h3>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#57534E] mb-1">Nome do Item</label>
                <input 
                  required
                  list="item-suggestions"
                  type="text" 
                  className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                  value={newItem.name}
                  onChange={e => setNewItem({...newItem, name: e.target.value})}
                  placeholder="Digite o nome do item..."
                />
                <datalist id="item-suggestions">
                  {items.map(item => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#57534E] mb-1">Quantidade Recebida</label>
                  <input 
                    required
                    type="number" 
                    min="1"
                    className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                    value={isNaN(newItem.initial_quantity) ? '' : newItem.initial_quantity}
                    onChange={e => setNewItem({...newItem, initial_quantity: e.target.value === '' ? NaN : parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#57534E] mb-1">Estoque Mínimo (Alerta)</label>
                  <input 
                    required
                    type="number" 
                    min="0"
                    className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                    value={isNaN(newItem.min_quantity) ? '' : newItem.min_quantity}
                    onChange={e => setNewItem({...newItem, min_quantity: e.target.value === '' ? NaN : parseInt(e.target.value)})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#57534E] mb-1">Lote</label>
                  <input 
                    type="text" 
                    placeholder="Nº do Lote"
                    className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                    value={newItem.batch_number}
                    onChange={e => setNewItem({...newItem, batch_number: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#57534E] mb-1">Data de Validade</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                    value={newItem.expiry_date}
                    onChange={e => setNewItem({...newItem, expiry_date: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#57534E] mb-1">Tipo de Item</label>
                  <select 
                    className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                    value={newItem.category}
                    onChange={e => setNewItem({...newItem, category: e.target.value})}
                  >
                    <option value="Médico Hospitalar">Médico Hospitalar</option>
                    <option value="Alimentício">Alimentício</option>
                    <option value="Expediente">Expediente</option>
                    <option value="Higiene">Higiene</option>
                    <option value="Radiológico">Radiológico</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#57534E] mb-1">Fornecedor</label>
                  <input 
                    type="text" 
                    placeholder="Nome do fornecedor"
                    className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                    value={newItem.supplier}
                    onChange={e => setNewItem({...newItem, supplier: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#57534E] mb-1">Origem</label>
                  <select 
                    className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                    value={newItem.origin}
                    onChange={e => setNewItem({...newItem, origin: e.target.value as 'contract' | 'extra'})}
                  >
                    <option value="contract">Contrato</option>
                    <option value="extra">Produto Extra</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#57534E] mb-1">Valor Unitário (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="0,00"
                    className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-xl focus:ring-2 focus:ring-[#1C1917]/10"
                    value={isNaN(newItem.unit_price) ? '' : newItem.unit_price}
                    onChange={e => setNewItem({...newItem, unit_price: e.target.value === '' ? NaN : parseFloat(e.target.value)})}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-[#78716C] hover:bg-[#F5F5F4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 bg-[#1C1917] text-white rounded-xl font-bold hover:bg-[#292524] transition-all"
                >
                  Salvar
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
            className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
          >
            <h3 className="text-2xl font-bold mb-2">
              {showTransactionModal.type === 'entry' ? 'Registrar Entrada' : 'Registrar Saída'}
            </h3>
            <div className="mb-6">
              <p className="text-[#78716C] font-medium">{showTransactionModal.item?.name}</p>
              <p className="text-xs font-bold text-emerald-600 mt-1">
                Disponível em estoque: {showTransactionModal.item?.quantity} unidades
              </p>
            </div>
            
            <form onSubmit={handleTransaction} className="space-y-6">
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
              
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowTransactionModal({ show: false, type: 'entry' })}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-[#78716C] hover:bg-[#F5F5F4] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className={`flex-1 px-4 py-3 text-white rounded-xl font-bold transition-all ${showTransactionModal.type === 'entry' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                >
                  Confirmar
                </button>
              </div>
            </form>
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
