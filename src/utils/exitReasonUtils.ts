export type CategorizedExitType = 'consumo' | 'doacao' | 'vencido' | 'perda' | 'ajuste_balanco';

export interface ExitTxLike {
  type?: string;
  exitReason?: string;
  balanceMovementType?: 'saida_balanco' | 'alteracao_balanco' | string | null;
  observation?: string;
  expiryReason?: string;
  sector?: string;
}

const normalizeForMatch = (val?: string | null): string =>
  String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

/**
 * Categoriza com precisão o tipo de saída, garantindo que:
 * - Toda movimentação decorrente de balanço (Saída de Balanço e Alteração de Balanço) seja
 *   identificada como 'ajuste_balanco' (SAÍDA DE BALANÇO), nunca como consumo do setor.
 * - Vencimento / Descarte (Validade técnica expirada) NUNCA se misture com Perda / Avaria nem com Balanço.
 * - Perda / Avaria física (quebra, extravio operacional) fique estritamente separada.
 */
export function getCategorizedExitType(tx: ExitTxLike): CategorizedExitType {
  const obs = tx.observation || '';
  const normObs = normalizeForMatch(obs);
  const normExpiry = normalizeForMatch(tx.expiryReason);
  const normSector = normalizeForMatch(tx.sector);

  // Verifica se é uma Saída de Balanço ou Alteração de Balanço
  if (
    tx.exitReason === 'ajuste_balanco' ||
    tx.exitReason === 'saida_balanco' ||
    tx.exitReason === 'alteracao_balanco' ||
    tx.balanceMovementType === 'saida_balanco' ||
    tx.balanceMovementType === 'alteracao_balanco' ||
    obs.includes('[Ajuste de Balanço') ||
    obs.includes('[Saída de Balanço') ||
    obs.includes('[Alteração de Balanço') ||
    obs.includes('[Balanço em Lote') ||
    normObs.includes('SAIDA DE BALANCO') ||
    normObs.includes('ALTERACAO DE BALANCO') ||
    normObs.includes('AJUSTE DE BALANCO') ||
    normObs.includes('BALANCO PERIODICO') ||
    normObs.includes('PRIMEIRO BALANCO') ||
    normObs.includes('1O BALANCO') ||
    normObs.includes('1º BALANCO') ||
    normObs.includes('CONFERENCIA FISICA DO INVENTARIO') ||
    normObs.includes('FALTA DE CONTAGEM') ||
    normObs.includes('FALTA / QUEBRA FISICA') ||
    normExpiry.includes('SAIDA DE BALANCO') ||
    normExpiry.includes('ALTERACAO DE BALANCO') ||
    normExpiry.includes('AJUSTE DE BALANCO') ||
    normExpiry.includes('BALANCO DE ESTOQUE') ||
    normSector === 'BALANCO' ||
    normSector === 'SAIDA DE BALANCO' ||
    normSector === 'ALTERACAO DE BALANCO' ||
    normSector === 'AJUSTE DE BALANCO' ||
    normSector.includes('SAIDA DE BALANCO') ||
    normSector.includes('AJUSTE DE BALANCO')
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

export function getExitReasonLabel(type: CategorizedExitType, tx?: ExitTxLike): string {
  switch (type) {
    case 'vencido':
      return 'Vencimento / Descarte (Validade)';
    case 'perda':
      return 'Perda / Avaria';
    case 'ajuste_balanco': {
      if (tx) {
        const normObs = normalizeForMatch(tx.observation);
        if (
          tx.balanceMovementType === 'alteracao_balanco' ||
          normObs.includes('ALTERACAO DE BALANCO') ||
          normObs.includes('AJUSTE DIRETO DE CONTAGEM')
        ) {
          return 'Saída de Balanço (Alteração de Balanço)';
        }
      }
      return 'Saída de Balanço';
    }
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
