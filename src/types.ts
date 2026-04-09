export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'SETOR';
  sector?: string;
}

export interface MaterialRequest {
  id: string;
  sector: string;
  date: string;
  status: 'PENDENTE' | 'APROVADO' | 'SEPARADO' | 'ENTREGUE' | 'RECUSADO';
  observation?: string;
  adminObservation?: string;
  requesterEmail: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface RequestItem {
  id: string;
  request_id: string;
  product_id: string;
  product_name: string;
  quantity_requested: number;
  quantity_approved: number;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  requestId?: string;
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
  deletedAt?: string;
  deletedBy?: string;
}

export interface Transaction {
  id: string;
  item_id: string;
  item_name: string;
  type: 'entry' | 'exit';
  origin: 'contract' | 'extra' | 'donation';
  quantity: number;
  sector?: string;
  date: string;
  responsible?: string;
  responsibleEmail?: string;
  supplier?: string;
  deletedAt?: string;
  deletionReason?: string;
  deletedByEmail?: string;
  exitReason?: 'consumo' | 'doacao' | 'vencido';
  expiryReason?: string;
  batch_number?: string;
  expiry_date?: string;
}
