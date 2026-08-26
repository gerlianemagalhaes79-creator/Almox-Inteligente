export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'SETOR' | 'LÍDER';
  sector?: string;
  allowedSectors?: string[];
}

export interface MaterialRequest {
  id: string;
  sector: string;
  date: string;
  status: 'PENDENTE' | 'APROVADO' | 'SEPARADO' | 'ENTREGUE' | 'RECUSADO' | 'EM_SEPARACAO' | 'DEVOLUCAO_PENDENTE' | 'DEVOLUCAO_APROVADA' | 'DEVOLUCAO_RECUSADA';
  observation?: string;
  adminObservation?: string;
  requesterEmail: string;
  deliveredAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  isNewFlow?: boolean;
  isReturn?: boolean;
  returnReason?: string;
  originalRequestId?: string;
}

export interface RequestItem {
  id: string;
  request_id: string;
  product_id: string;
  product_name: string;
  quantity_requested: number;
  quantity_approved: number;
  quantity_returned?: number;
  batch_id?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  requestId?: string;
  type?: 'STOCK_ZERO' | 'SYSTEM' | 'REQUEST';
  itemName?: string;
  confirmedByAdmins?: string[];
}

export interface Item {
  id: string;
  name: string;
  description: string;
  quantity: number;
  min_quantity: number;
  expiry_date: string | null;
  origin: 'contract' | 'extra' | 'donation';
  unit_price: number;
  supplier: string | null;
  category: string | null;
  batch_number: string | null;
  location?: 'Almoxarifado' | 'Farmácia';
  room?: string;
  medication_type?: string;
  unit_measure?: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface BalanceAdjustmentItem {
  itemId: string;
  itemName: string;
  description?: string;
  category?: string;
  unit_measure?: string;
  batch_number?: string;
  expiry_date?: string | null;
  location?: 'Almoxarifado' | 'Farmácia';
  room?: string;
  unit_price: number;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  reason?: string;
  notes?: string;
  adjusted: boolean;
}

export interface BalanceRecord {
  id: string;
  date: string;
  responsibleName: string;
  responsibleEmail: string;
  location: 'Almoxarifado' | 'Farmácia' | 'Geral';
  title?: string;
  status: 'CONCLUÍDO' | 'EM_ANDAMENTO';
  totalItemsAudited: number;
  divergentItemsCount: number;
  totalStockBefore: number;
  totalStockAfter: number;
  financialImpact: number;
  justificationGeneral?: string;
  items: BalanceAdjustmentItem[];
  createdAt: string;
}

export interface Transaction {
  id: string;
  item_id: string;
  item_name: string;
  type: 'entry' | 'exit';
  origin: 'contract' | 'extra' | 'donation';
  quantity: number;
  sector?: string;
  location?: 'Almoxarifado' | 'Farmácia';
  room?: string;
  date: string;
  responsible?: string;
  responsibleEmail?: string;
  supplier?: string;
  deletedAt?: string;
  deletionReason?: string;
  deletedByEmail?: string;
  exitReason?: 'consumo' | 'doacao' | 'vencido' | 'perda';
  expiryReason?: string;
  donationUnitName?: string;
  donationUnitAddress?: string;
  donationUnitCNPJ?: string;
  donationRevisionDate?: string;
  donationNumber?: string;
  batch_number?: string;
  expiry_date?: string;
  isReturn?: boolean;
  returnReason?: string;
  observation?: string;
}

