import React, { useState, useMemo } from 'react';
import { 
  Scale, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  Download, 
  Printer, 
  Search, 
  Filter, 
  Edit3, 
  Check, 
  X, 
  RefreshCw, 
  History, 
  TrendingDown, 
  TrendingUp, 
  ShieldAlert, 
  Package, 
  DollarSign, 
  FileSpreadsheet, 
  Info,
  ChevronDown,
  ChevronUp,
  Save,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays, addMonths, isBefore, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Item, BalanceRecord, BalanceAdjustmentItem, Transaction } from '../types';

interface StockBalanceProps {
  items: Item[];
  transactions: Transaction[];
  balances: BalanceRecord[];
  isAdmin: boolean;
  currentUserEmail: string;
  currentUserName: string;
  categories: string[];
  onSaveItemAdjustment: (
    updatedItem: Partial<Item> & { id: string }, 
    auditData: { 
      previousQty: number; 
      newQty: number; 
      difference: number; 
      reason: string; 
      notes?: string; 
    }
  ) => Promise<void>;
  onFinalizeBalance: (balanceData: Omit<BalanceRecord, 'id'>) => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  appLogo?: string;
}

export const StockBalance: React.FC<StockBalanceProps> = ({
  items,
  balances,
  isAdmin,
  currentUserEmail,
  currentUserName,
  categories,
  onSaveItemAdjustment,
  onFinalizeBalance,
  showToast,
  appLogo
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'balance_table' | 'history' | 'guidelines'>('balance_table');
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<'all' | 'Almoxarifado' | 'Farmácia'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [divergenceFilter, setDivergenceFilter] = useState<'all' | 'divergent' | 'matched' | 'pending'>('all');
  
  // Local state for counts and adjustments in progress
  const [countedQuantities, setCountedQuantities] = useState<Record<string, number>>({});
  const [adjustmentReasons, setAdjustmentReasons] = useState<Record<string, string>>({});
  const [adjustmentNotes, setAdjustmentNotes] = useState<Record<string, string>>({});
  
  // Modal for detailed item spec edit inside Balanço
  const [editingItemModal, setEditingItemModal] = useState<{
    show: boolean;
    item?: Item;
    formName: string;
    formDesc: string;
    formCategory: string;
    formUnitMeasure: string;
    formMinQty: number;
    formBatchNumber: string;
    formExpiryDate: string;
    formUnitPrice: number;
    formLocation: 'Almoxarifado' | 'Farmácia';
    formRoom: string;
    formCountedQty: number;
    formReason: string;
    formNotes: string;
  } | null>(null);

  // Modal for viewing historical balance record
  const [viewHistoryModal, setViewHistoryModal] = useState<BalanceRecord | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [generalBalanceNotes, setGeneralBalanceNotes] = useState('');
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

  // Active items (excluding soft-deleted)
  const activeItems = useMemo(() => {
    return items.filter(i => !i.deletedAt);
  }, [items]);

  // Latest balance record
  const latestBalance = useMemo(() => {
    if (!balances || balances.length === 0) return null;
    const sorted = [...balances].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0];
  }, [balances]);

  // Calculation of 4-Month (120 days) Periodicity
  const periodicityStatus = useMemo(() => {
    const now = new Date();
    if (!latestBalance) {
      return {
        status: 'OVERDUE' as const,
        lastDateStr: 'Nenhum balanço realizado',
        daysElapsed: 999,
        nextDeadlineStr: 'Imediato',
        daysRemaining: -1,
        progressPercent: 100,
        badgeText: 'Balanço Inicial Obrigatório Pendente',
        badgeColor: 'bg-rose-500 text-white'
      };
    }

    const lastDate = new Date(latestBalance.date);
    const nextDeadline = addMonths(lastDate, 4);
    const daysElapsed = differenceInDays(now, lastDate);
    const daysRemaining = differenceInDays(nextDeadline, now);
    
    // Progress calculation for 120 days (4 months)
    const progressPercent = Math.min(100, Math.max(0, Math.round((daysElapsed / 120) * 100)));

    if (daysElapsed > 120 || isAfter(now, nextDeadline)) {
      return {
        status: 'OVERDUE' as const,
        lastDateStr: format(lastDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
        daysElapsed,
        nextDeadlineStr: format(nextDeadline, "dd/MM/yyyy"),
        daysRemaining,
        progressPercent: 100,
        badgeText: `Balanço Obrigatório Vencido (${daysElapsed} dias desde o último)`,
        badgeColor: 'bg-rose-600 text-white animate-pulse'
      };
    } else if (daysElapsed >= 90) {
      return {
        status: 'WARNING' as const,
        lastDateStr: format(lastDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
        daysElapsed,
        nextDeadlineStr: format(nextDeadline, "dd/MM/yyyy"),
        daysRemaining,
        progressPercent,
        badgeText: `Atenção: Prazo de 4 Meses Próximo (${daysRemaining} dias restantes)`,
        badgeColor: 'bg-amber-500 text-white'
      };
    } else {
      return {
        status: 'OK' as const,
        lastDateStr: format(lastDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
        daysElapsed,
        nextDeadlineStr: format(nextDeadline, "dd/MM/yyyy"),
        daysRemaining,
        progressPercent,
        badgeText: `Em Dia (${daysRemaining} dias até o próximo balanço quadrimestral)`,
        badgeColor: 'bg-emerald-600 text-white'
      };
    }
  }, [latestBalance]);

  // Filtered items for balance table
  const filteredItems = useMemo(() => {
    return activeItems.filter(item => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchDesc = (item.description || '').toLowerCase().includes(q);
        const matchBatch = (item.batch_number || '').toLowerCase().includes(q);
        const matchCat = (item.category || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchBatch && !matchCat) return false;
      }

      // Sector
      if (sectorFilter !== 'all') {
        const itemLoc = item.location || 'Almoxarifado';
        if (itemLoc !== sectorFilter) return false;
      }

      // Category
      if (categoryFilter !== 'all') {
        if (item.category !== categoryFilter) return false;
      }

      // Divergence Filter
      const hasCount = countedQuantities[item.id] !== undefined;
      const countVal = hasCount ? countedQuantities[item.id] : item.quantity;
      const diff = countVal - item.quantity;

      if (divergenceFilter === 'divergent') {
        if (!hasCount || diff === 0) return false;
      } else if (divergenceFilter === 'matched') {
        if (!hasCount || diff !== 0) return false;
      } else if (divergenceFilter === 'pending') {
        if (hasCount) return false;
      }

      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeItems, searchQuery, sectorFilter, categoryFilter, divergenceFilter, countedQuantities]);

  // Statistics for current balance in progress
  const currentAuditStats = useMemo(() => {
    let totalItemsAudited = 0;
    let divergentCount = 0;
    let totalStockBefore = 0;
    let totalStockAfter = 0;
    let financialImpact = 0;

    activeItems.forEach(item => {
      totalStockBefore += item.quantity || 0;
      const isCounted = countedQuantities[item.id] !== undefined;
      const counted = isCounted ? countedQuantities[item.id] : item.quantity;
      totalStockAfter += counted;

      if (isCounted) {
        totalItemsAudited++;
        const diff = counted - item.quantity;
        if (diff !== 0) {
          divergentCount++;
          financialImpact += diff * (item.unit_price || 0);
        }
      }
    });

    return {
      totalActiveItems: activeItems.length,
      totalItemsAudited,
      divergentCount,
      totalStockBefore,
      totalStockAfter,
      netVolumeDiff: totalStockAfter - totalStockBefore,
      financialImpact
    };
  }, [activeItems, countedQuantities]);

  // Handler for opening edit modal for an item
  const handleOpenEditModal = (item: Item) => {
    const currentCount = countedQuantities[item.id] !== undefined ? countedQuantities[item.id] : item.quantity;
    setEditingItemModal({
      show: true,
      item,
      formName: item.name,
      formDesc: item.description || '',
      formCategory: item.category || categories[0] || 'Expediente',
      formUnitMeasure: item.unit_measure || 'un',
      formMinQty: item.min_quantity || 0,
      formBatchNumber: item.batch_number || '',
      formExpiryDate: item.expiry_date === 'Indeterminada' ? 'Indeterminada' : (item.expiry_date || ''),
      formUnitPrice: item.unit_price || 0,
      formLocation: item.location || 'Almoxarifado',
      formRoom: item.room || '',
      formCountedQty: currentCount,
      formReason: adjustmentReasons[item.id] || 'Inventário Quadrimestral',
      formNotes: adjustmentNotes[item.id] || ''
    });
  };

  // Handler for saving an item adjustment from modal
  const handleSaveModalAdjustment = async () => {
    if (!editingItemModal || !editingItemModal.item) return;
    const item = editingItemModal.item;
    const previousQty = item.quantity;
    const newQty = Math.max(0, editingItemModal.formCountedQty);
    const diff = newQty - previousQty;

    try {
      await onSaveItemAdjustment(
        {
          id: item.id,
          name: editingItemModal.formName.trim(),
          description: editingItemModal.formDesc.trim(),
          category: editingItemModal.formCategory.trim(),
          unit_measure: editingItemModal.formUnitMeasure.trim(),
          min_quantity: editingItemModal.formMinQty,
          batch_number: editingItemModal.formBatchNumber.trim(),
          expiry_date: editingItemModal.formExpiryDate.trim() || 'Indeterminada',
          unit_price: editingItemModal.formUnitPrice,
          location: editingItemModal.formLocation,
          room: editingItemModal.formRoom.trim(),
          quantity: newQty
        },
        {
          previousQty,
          newQty,
          difference: diff,
          reason: editingItemModal.formReason,
          notes: editingItemModal.formNotes
        }
      );

      // Update local state
      setCountedQuantities(prev => ({ ...prev, [item.id]: newQty }));
      setAdjustmentReasons(prev => ({ ...prev, [item.id]: editingItemModal.formReason }));
      if (editingItemModal.formNotes) {
        setAdjustmentNotes(prev => ({ ...prev, [item.id]: editingItemModal.formNotes }));
      }

      showToast(`Item "${editingItemModal.formName}" atualizado no Balanço com sucesso!`, 'success');
      setEditingItemModal(null);
    } catch (error: any) {
      showToast(`Erro ao salvar alterações: ${error.message}`, 'error');
    }
  };

  // Quick inline count change
  const handleInlineCountChange = (itemId: string, val: number) => {
    setCountedQuantities(prev => ({ ...prev, [itemId]: Math.max(0, val) }));
    if (!adjustmentReasons[itemId]) {
      setAdjustmentReasons(prev => ({ ...prev, [itemId]: 'Inventário Quadrimestral' }));
    }
  };

  // Quick single-item count confirmation
  const handleQuickConfirmItem = async (item: Item) => {
    const counted = countedQuantities[item.id] !== undefined ? countedQuantities[item.id] : item.quantity;
    const diff = counted - item.quantity;
    const reason = adjustmentReasons[item.id] || (diff === 0 ? 'Conferência de Rotina' : 'Inventário Quadrimestral');
    const notes = adjustmentNotes[item.id] || '';

    try {
      await onSaveItemAdjustment(
        {
          id: item.id,
          quantity: counted
        },
        {
          previousQty: item.quantity,
          newQty: counted,
          difference: diff,
          reason,
          notes
        }
      );
      showToast(`Contagem de "${item.name}" confirmada (${counted} un)!`, 'success');
    } catch (error: any) {
      showToast(`Erro ao confirmar item: ${error.message}`, 'error');
    }
  };

  // Finalize full balance
  const handleExecuteFinalizeBalance = async () => {
    if (!isAdmin) {
      showToast('Apenas administradores podem homologar o Balanço.', 'error');
      return;
    }

    try {
      setIsFinalizing(true);
      const auditItems: BalanceAdjustmentItem[] = activeItems.map(item => {
        const isCounted = countedQuantities[item.id] !== undefined;
        const counted = isCounted ? countedQuantities[item.id] : item.quantity;
        const diff = counted - item.quantity;
        return {
          itemId: item.id,
          itemName: item.name,
          description: item.description,
          category: item.category || 'Geral',
          unit_measure: item.unit_measure || 'un',
          batch_number: item.batch_number || 'S/N',
          expiry_date: item.expiry_date || 'Indeterminada',
          location: item.location || 'Almoxarifado',
          room: item.room,
          unit_price: item.unit_price || 0,
          systemQuantity: item.quantity,
          countedQuantity: counted,
          difference: diff,
          reason: adjustmentReasons[item.id] || (diff !== 0 ? 'Inventário Quadrimestral' : 'Sem divergência'),
          notes: adjustmentNotes[item.id] || '',
          adjusted: isCounted && diff !== 0
        };
      });

      const divergentCount = auditItems.filter(i => i.difference !== 0).length;
      const totalStockBefore = auditItems.reduce((sum, i) => sum + i.systemQuantity, 0);
      const totalStockAfter = auditItems.reduce((sum, i) => sum + i.countedQuantity, 0);
      const financialImpact = auditItems.reduce((sum, i) => sum + (i.difference * i.unit_price), 0);

      // Apply adjustments to database for all divergent items that were counted
      for (const audItem of auditItems) {
        if (audItem.difference !== 0) {
          await onSaveItemAdjustment(
            {
              id: audItem.itemId,
              quantity: audItem.countedQuantity
            },
            {
              previousQty: audItem.systemQuantity,
              newQty: audItem.countedQuantity,
              difference: audItem.difference,
              reason: audItem.reason || 'Inventário Quadrimestral',
              notes: audItem.notes
            }
          );
        }
      }

      const balancePayload: Omit<BalanceRecord, 'id'> = {
        date: new Date().toISOString(),
        responsibleName: currentUserName || currentUserEmail,
        responsibleEmail: currentUserEmail,
        location: sectorFilter === 'all' ? 'Geral' : sectorFilter,
        title: `Balanço Geral de Estoque - ${format(new Date(), 'MMMM/yyyy', { locale: ptBR }).toUpperCase()}`,
        status: 'CONCLUÍDO',
        totalItemsAudited: auditItems.length,
        divergentItemsCount: divergentCount,
        totalStockBefore,
        totalStockAfter,
        financialImpact,
        justificationGeneral: generalBalanceNotes.trim() || 'Balanço quadrimestral de rotina para auditoria e prestação de contas.',
        items: auditItems,
        createdAt: new Date().toISOString()
      };

      await onFinalizeBalance(balancePayload);

      showToast('Balanço Quadrimestral concluído e registrado com sucesso!', 'success');
      setShowFinalizeConfirm(false);
      setCountedQuantities({});
      setAdjustmentReasons({});
      setAdjustmentNotes({});
      setGeneralBalanceNotes('');
      setActiveSubTab('history');
    } catch (error: any) {
      console.error('Error finalizing balance:', error);
      showToast(`Erro ao finalizar balanço: ${error.message}`, 'error');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Export Blank Physical Count Sheet (Folha de Contagem Cega)
  const handlePrintBlankCountSheet = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Por favor, permita popups para imprimir a folha de contagem.', 'error');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Folha de Contagem Física - Balanço de Estoque</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 10px; color: #1E293B; margin: 0; padding: 10px; }
            .header { border-bottom: 2px solid #0F172A; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
            .header h1 { font-size: 16px; margin: 0; text-transform: uppercase; color: #0F172A; }
            .header p { margin: 2px 0 0 0; color: #64748B; font-size: 9px; }
            .meta-box { display: flex; gap: 20px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 6px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; }
            th, td { border: 1px solid #CBD5E1; padding: 5px 6px; text-align: left; }
            th { background-color: #F1F5F9; font-weight: bold; text-transform: uppercase; font-size: 8.5px; color: #334155; }
            .center { text-align: center; }
            .count-box { width: 65px; height: 18px; border: 1.5px solid #0F172A; text-align: center; background: #FFFFFF; }
            .sign-section { margin-top: 30px; display: flex; justify-content: space-around; page-break-inside: avoid; }
            .sign-line { width: 220px; border-top: 1px solid #334155; text-align: center; padding-top: 4px; font-size: 9px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Folha de Contagem Física - Inventário / Balanço</h1>
              <p>Almoxarifado Central & Farmácia • Ciclo Quadrimestral Obrigatório</p>
            </div>
            <div style="text-align: right; font-size: 9px; color: #64748B;">
              <div><strong>Data de Emissão:</strong> ${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
              <div><strong>Filtro:</strong> ${sectorFilter === 'all' ? 'Todos os Setores' : sectorFilter}</div>
            </div>
          </div>

          <div class="meta-box">
            <div><strong>Responsável pela Contagem:</strong> _____________________________________</div>
            <div><strong>Data da Contagem:</strong> ____/____/________</div>
            <div><strong>Total de Itens Listados:</strong> ${filteredItems.length}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 25px;">Nº</th>
                <th style="width: 30%;">Item / Descrição</th>
                <th style="width: 14%;">Categoria</th>
                <th style="width: 12%;">Lote</th>
                <th style="width: 10%;">Validade</th>
                <th style="width: 10%;">Local / Sala</th>
                <th class="center" style="width: 10%;">Qtd Sistema</th>
                <th class="center" style="width: 14%;">CONTAGEM FÍSICA</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.map((item, idx) => {
                const exp = item.expiry_date && item.expiry_date !== 'Indeterminada' 
                  ? format(new Date(item.expiry_date + 'T12:00:00'), 'dd/MM/yyyy') 
                  : 'Indet.';
                return `
                  <tr>
                    <td class="center" style="font-weight: bold;">${idx + 1}</td>
                    <td style="font-weight: bold;">${item.name}</td>
                    <td>${item.category || 'Geral'}</td>
                    <td>${item.batch_number || 'S/N'}</td>
                    <td>${exp}</td>
                    <td>${item.location || 'Almoxarifado'}${item.room ? ` (${item.room})` : ''}</td>
                    <td class="center" style="font-weight: bold; color: #475569;">${item.quantity} ${item.unit_measure || 'un'}</td>
                    <td class="center">
                      <div class="count-box"></div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="sign-section">
            <div class="sign-line">Auditor / Responsável pela Contagem</div>
            <div class="sign-line">Gestor do Almoxarifado / Farmácia</div>
          </div>

          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Export Excel of current balance table
  const handleExportBalanceExcel = () => {
    const data = filteredItems.map((item, idx) => {
      const isCounted = countedQuantities[item.id] !== undefined;
      const counted = isCounted ? countedQuantities[item.id] : item.quantity;
      const diff = counted - item.quantity;
      const exp = item.expiry_date && item.expiry_date !== 'Indeterminada' 
        ? format(new Date(item.expiry_date + 'T12:00:00'), 'dd/MM/yyyy') 
        : 'Indet.';

      return {
        'Nº': idx + 1,
        'Item': item.name,
        'Descrição': item.description || '',
        'Categoria': item.category || 'Geral',
        'Unidade': item.unit_measure || 'un',
        'Lote': item.batch_number || 'S/N',
        'Validade': exp,
        'Localização': item.location || 'Almoxarifado',
        'Preço Unitário (R$)': item.unit_price || 0,
        'Qtd Sistema': item.quantity,
        'Qtd Contada / Balanço': counted,
        'Divergência (Qtd)': diff,
        'Impacto Financeiro (R$)': diff * (item.unit_price || 0),
        'Motivo do Ajuste': adjustmentReasons[item.id] || (diff !== 0 ? 'Inventário Quadrimestral' : 'Sem divergência'),
        'Observações': adjustmentNotes[item.id] || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Balanco_Estoque');
    XLSX.writeFile(workbook, `Balanco_Estoque_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    showToast('Planilha Excel de Balanço exportada com sucesso!', 'success');
  };

  // Export PDF of current balance audit
  const handleExportBalancePDF = () => {
    const doc = new jsPDF('landscape');
    
    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE BALANÇO E AUDITORIA DE ESTOQUE', 14, 15);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Responsável: ${currentUserEmail}`, 14, 22);
    doc.text(`Status do Ciclo Quadrimestral: ${periodicityStatus.badgeText}`, 14, 27);

    // Summary box
    doc.setFillColor(245, 247, 250);
    doc.rect(14, 32, 269, 14, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Lotes Auditados: ${currentAuditStats.totalItemsAudited} / ${currentAuditStats.totalActiveItems}`, 18, 40);
    doc.text(`Itens Divergentes: ${currentAuditStats.divergentCount}`, 110, 40);
    doc.text(`Impacto Financeiro: R$ ${currentAuditStats.financialImpact.toFixed(2)}`, 200, 40);

    const tableRows = filteredItems.map((item, idx) => {
      const isCounted = countedQuantities[item.id] !== undefined;
      const counted = isCounted ? countedQuantities[item.id] : item.quantity;
      const diff = counted - item.quantity;
      const exp = item.expiry_date && item.expiry_date !== 'Indeterminada' 
        ? format(new Date(item.expiry_date + 'T12:00:00'), 'dd/MM/yyyy') 
        : 'Indet.';

      return [
        (idx + 1).toString(),
        item.name,
        item.category || 'Geral',
        item.batch_number || 'S/N',
        exp,
        `${item.quantity} ${item.unit_measure || 'un'}`,
        `${counted} ${item.unit_measure || 'un'}`,
        diff === 0 ? '0' : (diff > 0 ? `+${diff}` : `${diff}`),
        `R$ ${(diff * (item.unit_price || 0)).toFixed(2)}`,
        adjustmentReasons[item.id] || (diff !== 0 ? 'Inventário' : 'OK')
      ];
    });

    autoTable(doc, {
      startY: 50,
      head: [['#', 'Item', 'Categoria', 'Lote', 'Validade', 'Sistema', 'Contada', 'Dif.', 'Impacto', 'Motivo']],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 60 },
        2: { cellWidth: 28 },
        3: { cellWidth: 24 },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 20, halign: 'center' },
        7: { cellWidth: 15, halign: 'center' },
        8: { cellWidth: 25, halign: 'right' },
        9: { cellWidth: 45 }
      }
    });

    doc.save(`Balanco_Auditoria_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    showToast('Relatório PDF do Balanço gerado com sucesso!', 'success');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 4-Month Cycle Cadence Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 lg:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        {/* Subtle background decorative shapes */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-white/10 backdrop-blur-md border border-white/10 text-blue-200">
                <Scale size={14} className="text-blue-400" />
                <span>Ciclo Quadrimestral de Balanço</span>
              </div>
              <span className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold shadow-sm ${periodicityStatus.badgeColor}`}>
                {periodicityStatus.badgeText}
              </span>
            </div>

            <div>
              <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                Balanço e Auditoria de Estoque
              </h2>
              <p className="text-slate-300 text-sm mt-1 leading-relaxed">
                Conforme diretrizes institucionais, o balanço físico deve ser realizado <strong className="text-amber-300 font-bold">a cada 4 meses</strong> para garantir a integridade dos saldos, validades, lotes e especificações.
              </p>
            </div>

            {/* Cycle metrics bar */}
            <div className="pt-2">
              <div className="flex justify-between text-xs font-bold text-slate-300 mb-1.5">
                <span>Último: {periodicityStatus.lastDateStr}</span>
                <span>Prazo limite (4 meses): {periodicityStatus.nextDeadlineStr}</span>
              </div>
              <div className="w-full bg-slate-700/80 rounded-full h-3 overflow-hidden p-0.5 border border-slate-600">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    periodicityStatus.status === 'OVERDUE' 
                      ? 'bg-rose-500' 
                      : periodicityStatus.status === 'WARNING' 
                      ? 'bg-amber-400' 
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${periodicityStatus.progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action and Summary column */}
          <div className="flex flex-col gap-3 min-w-[280px]">
            <div className="grid grid-cols-2 gap-2 bg-white/5 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 text-center">
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lotes em Estoque</div>
                <div className="text-xl font-black text-white">{activeItems.length}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Conferidos Agora</div>
                <div className="text-xl font-black text-emerald-400">{currentAuditStats.totalItemsAudited}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handlePrintBlankCountSheet}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-xs transition-all border border-white/15 shadow-sm"
                title="Imprimir Folha de Contagem Cega para contagem física nas prateleiras"
              >
                <Printer size={16} />
                <span>Folha de Contagem</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => setShowFinalizeConfirm(true)}
                  disabled={currentAuditStats.totalItemsAudited === 0}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-black text-xs transition-all shadow-lg ${
                    currentAuditStats.totalItemsAudited > 0
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-emerald-500/25'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Save size={16} />
                  <span>Concluir Balanço</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveSubTab('balance_table')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'balance_table'
                ? 'bg-white text-blue-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 size={15} />
            <span>Contagem & Alteração de Especificações</span>
            {currentAuditStats.divergentCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">
                {currentAuditStats.divergentCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'history'
                ? 'bg-white text-blue-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History size={15} />
            <span>Histórico de Balanços ({balances.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('guidelines')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'guidelines'
                ? 'bg-white text-blue-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Info size={15} />
            <span>Diretrizes & POP Quadrimestral</span>
          </button>
        </div>

        {activeSubTab === 'balance_table' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportBalanceExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition-all shadow-sm"
              title="Baixar Planilha Excel do Balanço"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              <span>Excel</span>
            </button>

            <button
              onClick={handleExportBalancePDF}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-all shadow-sm"
              title="Baixar Relatório PDF de Balanço"
            >
              <FileText size={15} className="text-rose-600" />
              <span>PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* Sub-Tab 1: Balance Table & Specification Editing */}
      {activeSubTab === 'balance_table' && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por item, lote ou categoria..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase whitespace-nowrap">Local:</label>
              <select
                value={sectorFilter}
                onChange={e => setSectorFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">Todos os Locais</option>
                <option value="Almoxarifado">Almoxarifado</option>
                <option value="Farmácia">Farmácia</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase whitespace-nowrap">Categoria:</label>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">Todas Categorias</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase whitespace-nowrap">Status:</label>
              <select
                value={divergenceFilter}
                onChange={e => setDivergenceFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">Todos os Itens</option>
                <option value="divergent">⚠️ Com Divergência de Saldo</option>
                <option value="matched">✅ Saldos Conferidos (OK)</option>
                <option value="pending">⏳ Pendentes de Contagem</option>
              </select>
            </div>
          </div>

          {/* Informational callout */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-blue-900">
            <Info size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-bold">
                Painel Oficial de Alterações e Ajustes de Estoque
              </p>
              <p className="text-blue-800 leading-relaxed">
                Neste painel, você pode ajustar quantidades físicas reais apuradas na contagem, editar nomes, descrições, categorias, unidades de medida, lotes, validades e preços. Ao salvar ou homologar, as alterações são registradas nos registros de auditoria e balanço.
              </p>
            </div>
          </div>

          {/* Table of items */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                    <th className="px-4 py-3.5">Material / Especificações</th>
                    <th className="px-3 py-3.5">Categoria / Local</th>
                    <th className="px-3 py-3.5 text-center">Lote</th>
                    <th className="px-3 py-3.5 text-center">Validade</th>
                    <th className="px-3 py-3.5 text-center">Preço Unit.</th>
                    <th className="px-3 py-3.5 text-center">Qtd Sistema</th>
                    <th className="px-4 py-3.5 text-center w-36">Qtd Física (Contagem)</th>
                    <th className="px-3 py-3.5 text-center">Divergência</th>
                    <th className="px-4 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {filteredItems.map((item) => {
                    const isCounted = countedQuantities[item.id] !== undefined;
                    const countedVal = isCounted ? countedQuantities[item.id] : item.quantity;
                    const diff = countedVal - item.quantity;
                    const expStr = item.expiry_date && item.expiry_date !== 'Indeterminada'
                      ? format(new Date(item.expiry_date + 'T12:00:00'), 'dd/MM/yyyy')
                      : 'Indet.';

                    return (
                      <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${diff !== 0 && isCounted ? 'bg-amber-50/40' : ''}`}>
                        {/* Name & Description */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-slate-900">{item.name}</span>
                            {item.description && (
                              <span className="text-[11px] text-slate-500 line-clamp-1">{item.description}</span>
                            )}
                            <span className="text-[10px] text-slate-400 mt-0.5">Unidade: {item.unit_measure || 'un'}</span>
                          </div>
                        </td>

                        {/* Category & Location */}
                        <td className="px-3 py-3.5">
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 w-fit">
                              {item.category || 'Geral'}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              {item.location || 'Almoxarifado'}{item.room ? ` • ${item.room}` : ''}
                            </span>
                          </div>
                        </td>

                        {/* Batch */}
                        <td className="px-3 py-3.5 text-center font-mono font-bold text-slate-800">
                          {item.batch_number || 'S/N'}
                        </td>

                        {/* Expiry */}
                        <td className="px-3 py-3.5 text-center">
                          <span className={`font-bold ${item.expiry_date === 'Indeterminada' ? 'text-slate-500' : 'text-slate-800'}`}>
                            {expStr}
                          </span>
                        </td>

                        {/* Unit Price */}
                        <td className="px-3 py-3.5 text-center font-bold text-slate-800">
                          R$ {(item.unit_price || 0).toFixed(2)}
                        </td>

                        {/* System Qty */}
                        <td className="px-3 py-3.5 text-center">
                          <span className="font-black text-slate-700 px-2 py-1 bg-slate-100 rounded-lg">
                            {item.quantity} {item.unit_measure || 'un'}
                          </span>
                        </td>

                        {/* Counted Qty Input */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              value={countedVal}
                              onChange={(e) => handleInlineCountChange(item.id, parseInt(e.target.value) || 0)}
                              className={`w-20 px-2 py-1.5 text-center font-black text-xs rounded-xl border-2 transition-all outline-none ${
                                isCounted && diff !== 0
                                  ? 'bg-amber-50 border-amber-400 text-amber-900 focus:ring-2 focus:ring-amber-300'
                                  : isCounted && diff === 0
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                                  : 'bg-white border-slate-200 text-slate-800 focus:border-blue-500'
                              }`}
                            />
                            {isCounted && (
                              <button
                                onClick={() => handleQuickConfirmItem(item)}
                                className="p-1.5 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-all"
                                title="Confirmar Ajuste Individual"
                              >
                                <Check size={14} />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Divergence badge */}
                        <td className="px-3 py-3.5 text-center">
                          {isCounted ? (
                            diff === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                                <CheckCircle2 size={11} /> OK
                              </span>
                            ) : diff > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                                <TrendingUp size={11} /> +{diff} (Sobra)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                                <TrendingDown size={11} /> {diff} (Falta)
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Não conferido</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl font-bold text-xs transition-all shadow-sm"
                            title="Editar todas as especificações deste item/lote no Balanço"
                          >
                            <Edit3 size={13} />
                            <span>Alterar Especificações</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredItems.length === 0 && (
              <div className="py-16 text-center">
                <Package size={36} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-700">Nenhum item encontrado com os filtros selecionados.</p>
                <p className="text-xs text-slate-400">Tente ajustar a busca ou os filtros de categoria/local.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Balances History */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Histórico de Balanços Concluídos</h3>
              <p className="text-xs text-slate-500">Registros permanentes de auditorias e balanços quadrimestrais realizados</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-extrabold text-xs border border-blue-200">
              Total de Balanços: {balances.length}
            </span>
          </div>

          {balances.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
              <History size={40} className="mx-auto text-slate-300 mb-3" />
              <h4 className="text-base font-extrabold text-slate-800">Nenhum balanço registrado ainda</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Ao concluir o primeiro ciclo de contagem e auditoria, o registro completo com responsáveis e divergências ficará disponível aqui.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {balances.map((record) => {
                const recordDate = new Date(record.date);
                return (
                  <div 
                    key={record.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                            {record.status}
                          </span>
                          <h4 className="text-base font-black text-slate-900 mt-1.5">
                            {record.title || `Balanço Geral de Estoque - ${format(recordDate, 'dd/MM/yyyy')}`}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <Calendar size={13} />
                            <span>{format(recordDate, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Itens Auditados</div>
                          <div className="text-sm font-black text-slate-800">{record.totalItemsAudited}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Divergências</div>
                          <div className={`text-sm font-black ${record.divergentItemsCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {record.divergentItemsCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Impacto Fin.</div>
                          <div className={`text-sm font-black ${record.financialImpact < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                            R$ {(record.financialImpact || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600">
                        <span className="font-bold">Responsável:</span> {record.responsibleName} ({record.responsibleEmail})
                      </div>

                      {record.justificationGeneral && (
                        <div className="text-xs text-slate-500 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 italic">
                          "{record.justificationGeneral}"
                        </div>
                      )}
                    </div>

                    <div className="pt-4 mt-3 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={() => setViewHistoryModal(record)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all"
                      >
                        <FileText size={14} />
                        <span>Ver Relatório Completo</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 3: Guidelines & Protocol */}
      {activeSubTab === 'guidelines' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-8 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-xl font-black text-slate-900">Procedimento Operacional Padrão (POP) - Balanço Quadrimestral</h3>
            <p className="text-xs text-slate-500 mt-1">Diretrizes de conformidade para o controle de estoque de materiais e medicamentos</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                1
              </div>
              <h4 className="font-black text-slate-900 text-sm">Periodicidade Obrigatória</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                O Balanço Geral deve ser executado no mínimo a cada <strong>4 meses (120 dias)</strong>. Durante esse período, o sistema monitora os prazos e emite alertas visuais aos gestores.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm">
                2
              </div>
              <h4 className="font-black text-slate-900 text-sm">Contagem Física Cega</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Gere a <strong>Folha de Contagem Cega</strong> impressa. A equipe realiza a checagem manual dos itens nas prateleiras e lotes físicos antes de inserir os números finais no sistema.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-teal-50/50 border border-teal-100 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-sm">
                3
              </div>
              <h4 className="font-black text-slate-900 text-sm">Ajustes & Homologação</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Todas as alterações cadastrais (descrição, validade, lote, preço) e ajustes de quantidade são documentadas com justificativa e salvas no histórico permanente para auditoria.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Full Edit of Item Specifications inside Balanço */}
      {editingItemModal && editingItemModal.show && editingItemModal.item && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-2xl rounded-3xl p-6 lg:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 px-2 py-0.5 bg-blue-50 rounded-md">
                  Balanço de Estoque
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  Alteração de Especificações do Material
                </h3>
                <p className="text-xs text-slate-500">
                  Lote atual: <strong className="text-slate-700">{editingItemModal.item.batch_number || 'S/N'}</strong> • Local: <strong className="text-slate-700">{editingItemModal.item.location || 'Almoxarifado'}</strong>
                </p>
              </div>
              <button
                onClick={() => setEditingItemModal(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-bold text-slate-700">
              {/* Name & Description */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500 uppercase">Nome do Material / Medicamento *</label>
                <input
                  type="text"
                  required
                  value={editingItemModal.formName}
                  onChange={e => setEditingItemModal({ ...editingItemModal, formName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-500 uppercase">Descrição Detalhada</label>
                <textarea
                  rows={2}
                  value={editingItemModal.formDesc}
                  onChange={e => setEditingItemModal({ ...editingItemModal, formDesc: e.target.value })}
                  placeholder="Especificações técnicas, apresentação, dosagem..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
              </div>

              {/* Category, Unit Measure & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 uppercase">Categoria</label>
                  <select
                    value={editingItemModal.formCategory}
                    onChange={e => setEditingItemModal({ ...editingItemModal, formCategory: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 uppercase">Unidade de Medida</label>
                  <input
                    type="text"
                    value={editingItemModal.formUnitMeasure}
                    onChange={e => setEditingItemModal({ ...editingItemModal, formUnitMeasure: e.target.value })}
                    placeholder="ex: un, cx, frasco, pacote"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 uppercase">Localização</label>
                  <select
                    value={editingItemModal.formLocation}
                    onChange={e => setEditingItemModal({ ...editingItemModal, formLocation: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  >
                    <option value="Almoxarifado">Almoxarifado</option>
                    <option value="Farmácia">Farmácia</option>
                  </select>
                </div>
              </div>

              {/* Batch, Expiry & Unit Price */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 uppercase">Número do Lote</label>
                  <input
                    type="text"
                    value={editingItemModal.formBatchNumber}
                    onChange={e => setEditingItemModal({ ...editingItemModal, formBatchNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 uppercase">Data de Validade</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      disabled={editingItemModal.formExpiryDate === 'Indeterminada'}
                      value={editingItemModal.formExpiryDate === 'Indeterminada' ? '' : editingItemModal.formExpiryDate}
                      onChange={e => setEditingItemModal({ ...editingItemModal, formExpiryDate: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingItemModal({
                        ...editingItemModal,
                        formExpiryDate: editingItemModal.formExpiryDate === 'Indeterminada' ? '' : 'Indeterminada'
                      })}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black border transition-all ${
                        editingItemModal.formExpiryDate === 'Indeterminada'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                      title="Validade Indeterminada"
                    >
                      Indet.
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 uppercase">Preço Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingItemModal.formUnitPrice}
                    onChange={e => setEditingItemModal({ ...editingItemModal, formUnitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
              </div>

              {/* Quantities & Count Box */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-slate-500">Saldo Atual no Sistema:</span>
                    <strong className="ml-1 text-slate-900">{editingItemModal.item.quantity} {editingItemModal.formUnitMeasure}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Divergência:</span>
                    <strong className={`ml-1 font-black ${
                      editingItemModal.formCountedQty - editingItemModal.item.quantity === 0 
                        ? 'text-emerald-600' 
                        : 'text-amber-600'
                    }`}>
                      {editingItemModal.formCountedQty - editingItemModal.item.quantity > 0 ? '+' : ''}
                      {editingItemModal.formCountedQty - editingItemModal.item.quantity} {editingItemModal.formUnitMeasure}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-500 uppercase">Nova Quantidade Física (Balanço)</label>
                    <input
                      type="number"
                      min="0"
                      value={editingItemModal.formCountedQty}
                      onChange={e => setEditingItemModal({ ...editingItemModal, formCountedQty: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-white border-2 border-blue-400 rounded-xl font-black text-sm text-blue-900 focus:ring-2 focus:ring-blue-500/20 outline-none text-center"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-500 uppercase">Motivo do Ajuste</label>
                    <select
                      value={editingItemModal.formReason}
                      onChange={e => setEditingItemModal({ ...editingItemModal, formReason: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                      <option value="Inventário Quadrimestral">Inventário Quadrimestral</option>
                      <option value="Correção Cadastral">Correção Cadastral</option>
                      <option value="Ajuste de Quebra/Avaria">Ajuste de Quebra/Avaria</option>
                      <option value="Ajuste de Sobra">Ajuste de Sobra</option>
                      <option value="Acerto de Validade/Lote">Acerto de Validade/Lote</option>
                      <option value="Doação/Descarte">Doação/Descarte</option>
                      <option value="Outro">Outro Motivo</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 uppercase">Observações da Auditoria</label>
                  <input
                    type="text"
                    value={editingItemModal.formNotes}
                    onChange={e => setEditingItemModal({ ...editingItemModal, formNotes: e.target.value })}
                    placeholder="Justificativa adicional para o registro..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingItemModal(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveModalAdjustment}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                <Save size={16} />
                <span>Salvar Alterações no Balanço</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal: Finalize Balance Confirmation */}
      {showFinalizeConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-6 lg:p-8 shadow-2xl"
          >
            <div className="flex items-center gap-3 text-emerald-600 mb-4">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Homologar Balanço Quadrimestral</h3>
                <p className="text-xs text-slate-500">Concluir o inventário e atualizar o ciclo de 4 meses</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-4">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="font-bold">Total de Itens Auditados:</span>
                <span className="font-black text-slate-900">{currentAuditStats.totalItemsAudited} / {activeItems.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="font-bold">Itens com Divergência:</span>
                <span className={`font-black ${currentAuditStats.divergentCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {currentAuditStats.divergentCount}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-bold">Impacto Financeiro Líquido:</span>
                <span className={`font-black ${currentAuditStats.financialImpact < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  R$ {currentAuditStats.financialImpact.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 mb-6">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Justificativa / Parecer do Balanço</label>
              <textarea
                rows={3}
                value={generalBalanceNotes}
                onChange={e => setGeneralBalanceNotes(e.target.value)}
                placeholder="Informe o parecer geral da comissão de inventário..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowFinalizeConfirm(false)}
                disabled={isFinalizing}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all"
              >
                Voltar à Contagem
              </button>
              <button
                type="button"
                onClick={handleExecuteFinalizeBalance}
                disabled={isFinalizing}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2"
              >
                {isFinalizing ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Salvando Balanço...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Homologar e Salvar Balanço</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal: View Historical Balance Details */}
      {viewHistoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-4xl rounded-3xl p-6 lg:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 px-2 py-0.5 bg-emerald-100 rounded-md">
                  {viewHistoryModal.status}
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {viewHistoryModal.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Data: {format(new Date(viewHistoryModal.date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })} • Responsável: {viewHistoryModal.responsibleName} ({viewHistoryModal.responsibleEmail})
                </p>
              </div>
              <button
                onClick={() => setViewHistoryModal(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {viewHistoryModal.justificationGeneral && (
              <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                <span className="font-bold text-slate-900">Parecer: </span>
                {viewHistoryModal.justificationGeneral}
              </div>
            )}

            <div className="border border-slate-200 rounded-2xl overflow-hidden mb-6">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 text-[11px]">
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5 text-center">Lote</th>
                    <th className="px-3 py-2.5 text-center">Qtd Anterior</th>
                    <th className="px-3 py-2.5 text-center">Qtd Apurada</th>
                    <th className="px-3 py-2.5 text-center">Divergência</th>
                    <th className="px-3 py-2.5">Motivo / Obs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold">
                  {viewHistoryModal.items?.map((it, idx) => (
                    <tr key={idx} className={it.difference !== 0 ? 'bg-amber-50/40' : ''}>
                      <td className="px-3 py-2 text-slate-900 font-bold">{it.itemName}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600">{it.batch_number || 'S/N'}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{it.systemQuantity}</td>
                      <td className="px-3 py-2 text-center text-slate-900 font-black">{it.countedQuantity}</td>
                      <td className="px-3 py-2 text-center">
                        {it.difference === 0 ? (
                          <span className="text-emerald-700 font-bold">0</span>
                        ) : it.difference > 0 ? (
                          <span className="text-blue-700 font-bold">+{it.difference}</span>
                        ) : (
                          <span className="text-rose-700 font-bold">{it.difference}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-[11px]">
                        {it.reason || 'Conferido'} {it.notes ? `• ${it.notes}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setViewHistoryModal(null)}
                className="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
