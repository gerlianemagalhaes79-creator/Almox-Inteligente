/**
 * Helper utilitário para controle de indicadores e filtros de medicamentos.
 * 
 * Regras obrigatórias:
 * 1. Usa APENAS o campo categoria (não usa palavras-chave da descrição).
 * 2. Compara ignorando maiúsculas, minúsculas e acentos.
 * 3. O nome exato cadastrado no sistema é "Medicamentos".
 * 4. Não apaga nem altera nenhum registro; apenas filtra os cálculos dos indicadores.
 */

export const EXACT_MEDICAMENTOS_CATEGORY_NAME = 'Medicamentos';

/**
 * Normaliza o nome da categoria para comparação case/accent-insensitive.
 */
export const normalizeCategory = (cat?: string | null): string => {
  if (!cat) return '';
  return String(cat)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
};

/**
 * Verifica se o item pertence à categoria MEDICAMENTOS baseando-se estritamente
 * no campo categoria (sem inspecionar descrição ou nome do produto).
 */
export const isMedicamentosCategory = (cat?: string | null): boolean => {
  const norm = normalizeCategory(cat);
  return norm === 'medicamentos' || norm === 'medicamento';
};

/**
 * Retorna a nota formatada com a quantidade de itens desconsiderados.
 */
export const formatMedicamentosDesconsideradosNote = (count: number, included = false): string => {
  if (included) {
    return 'Medicamentos incluídos nos indicadores';
  }
  return `${count} ${count === 1 ? 'item de medicamento desconsiderado' : 'itens de medicamentos desconsiderados'}`;
};
