export interface Item {
  id: string;
  name: string;
  description: string;
  quantity: number;
  min_quantity: number;
  expiry_date: string | null;
  origin: 'contract' | 'extra';
  unit_price: number;
  supplier: string | null;
  category: string | null;
  batch_number: string | null;
}

export interface Transaction {
  id: string;
  item_id: string;
  item_name: string;
  type: 'entry' | 'exit';
  quantity: number;
  sector?: string;
  date: string;
  responsible?: string;
  supplier?: string;
}
