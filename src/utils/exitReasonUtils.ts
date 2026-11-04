export type CategorizedExitType = 'consumo' | 'doacao' | 'vencido' | 'perda' | 'ajuste_balanco';

export interface ExitTxLike {
  type?: string;
  exitReason?: string;
  observation?: string;
}

/**
 * Categoriza com precisão o tipo de saída, garantindo que:
 * - Vencimento / Descarte (Validade técnica expirada) NUNCA se misture com Perda / Avaria nem com Ajuste de Balanço.
 * - Perda / Avaria física (quebra, extravio operacional) fique estritamente separada.
 * - Ajuste de Balanço (falta apurada na contagem física periódica do inventário) tenha categoria própria.
 */
export function getCategorizedExitType(tx: ExitTxLike): CategorizedExitType {
  const obs = tx.observation || '';

  // Verifica se é um ajuste originado no balanço físico ou inventário
  if (
    tx.exitReason === 'ajuste_balanco' ||
    obs.includes('[Ajuste de Balanço') ||
    obs.includes('[Balanço em Lote') ||
    obs.includes('Ajuste de Balanço') ||
    obs.includes('Balanço Periódico') ||
    obs.includes('conferência física do inventário/balanço') ||
    obs.includes('Falta de contagem') ||
    obs.includes('Falta / Quebra física')
  ) {
    return 'ajuste_balanco';
  }

  // Baixa por validade vencida / descarte sanitário
  if (tx.exitReason === 'vencido') {
    return 'vencido';
  }

  // Baixa por perda / avaria física
  if (tx.exitReason === 'perda') {
    return 'perda';
  }

  // Doação externa
  if (tx.exitReason === 'doacao') {
    return 'doacao';
  }

  return 'consumo';
}

export function getExitReasonLabel(type: CategorizedExitType): string {
  switch (type) {
    case 'vencido':
      return 'Vencimento / Descarte (Validade)';
    case 'perda':
      return 'Perda / Avaria';
    case 'ajuste_balanco':
      return 'Ajuste de Balanço (Inventário)';
    case 'doacao':
      return 'Doação';
    case 'consumo':
    default:
      return 'Consumo do Setor';
  }
}

export function getExitReasonBadgeClasses(type: CategorizedExitType): {
  container: string;
  badge: string;
  dotColor: string;
} {
  switch (type) {
    case 'vencido':
      return {
        container: 'bg-rose-50 border-rose-200 text-rose-800',
        badge: 'bg-rose-100 text-rose-700 border-rose-200',
        dotColor: 'bg-rose-500'
      };
    case 'perda':
      return {
        container: 'bg-amber-50 border-amber-200 text-amber-800',
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
        dotColor: 'bg-amber-500'
      };
    case 'ajuste_balanco':
      return {
        container: 'bg-purple-50 border-purple-200 text-purple-800',
        badge: 'bg-purple-100 text-purple-800 border-purple-200',
        dotColor: 'bg-purple-500'
      };
    case 'doacao':
      return {
        container: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        dotColor: 'bg-emerald-500'
      };
    case 'consumo':
    default:
      return {
        container: 'bg-blue-50 border-blue-200 text-blue-800',
        badge: 'bg-blue-100 text-blue-800 border-blue-200',
        dotColor: 'bg-blue-500'
      };
  }
}
