import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  attachLetterheadToDoc,
  drawContinuationAndPageNumbers,
  drawInstitutionalReportHeader,
  getPrintLetterheadLayout
} from './letterheadLayout';

export interface PDFReportFilterSummary {
  periodLabel: string;
  location: string;
  sectorFilter: string;
  categoryFilter: string;
  materialFilter: string;
  generatedBy?: string;
  medicamentosNote?: string;
}

export interface PDFReportKPIs {
  consolidatedMaterialsCount: number;
  activeBatchesCount: number;
  lowStockMaterialsCount: number;
  stockoutMaterialsCount: number;
  totalMovementsCount: number;
  entriesCount: number;
  entriesUnits: number;
  entriesValue: number;
  exitsCount: number;
  exitsUnits: number;
  exitsValue: number;
  returnsCount: number;
  returnsUnits: number;
  returnsValue: number;
  netConsumptionUnits: number;
  netConsumptionValue: number;
  currentStockUnits: number;
  currentStockValue: number;
  stockTurnover: number;
  annualizedTurnover: number;
  stockCoverageDays: number | null;
  serviceLevelPct: number;
  itemsFulfilledPct: number;
  avgLeadTimeHours: number | null;
  expiredBatchesCount: number;
  expiredBatchesValue: number;
  expiring60dBatchesCount: number;
  expiring60dBatchesValue: number;
  lossAndExpiredExitsUnits: number;
  lossAndExpiredExitsValue: number;
}

export interface PDFTimePoint {
  label: string;
  entries: number;
  exits: number;
  entriesValue?: number;
  exitsValue?: number;
}

export interface PDFSectorPoint {
  sector: string;
  units: number;
  value: number;
  movementsCount: number;
  returnsUnits?: number;
}

export interface PDFMaterialPoint {
  name: string;
  category: string;
  requestedUnits: number;
  consumedUnits: number;
  value: number;
  abcClass?: string;
}

export interface PDFCategoryPoint {
  category: string;
  consumedUnits: number;
  consumedValue: number;
  stockUnits: number;
  stockValue: number;
  materialsCount: number;
  color: string;
}

export interface PDFStockStatusSummary {
  regularCount: number;
  lowStockCount: number;
  zeroStockCount: number;
  expiredBatchesCount: number;
  expiring60dBatchesCount: number;
}

export interface PDFConsolidatedMaterialRow {
  name: string;
  category: string;
  batchesCount: number;
  totalUnits: number;
  minQuantity: number;
  consumed90d: number;
  totalValue: number;
  status: 'Regular' | 'Estoque Baixo' | 'Zerado / Ruptura';
}

export interface PDFRoomRow {
  room: string;
  status: string;
  distinctItemsCount: number;
  batchesCount: number;
  stockUnits: number;
  stockValue: number;
  expiredBatches: number;
  expiring60dBatches: number;
}

export interface PDFDonationOrWriteOffRow {
  flow: string;
  date: string;
  material: string;
  category: string;
  batch: string;
  partnerOrReason: string;
  qty: number;
  value: number;
}

export interface GenerateCompletePDFReportParams {
  title: string;
  subtitle?: string;
  letterheadImage?: string | null;
  isAdmin?: boolean;
  filters: PDFReportFilterSummary;
  kpis: PDFReportKPIs;
  timelineData: PDFTimePoint[];
  sectorData: PDFSectorPoint[];
  topMaterialsData: PDFMaterialPoint[];
  categoryData: PDFCategoryPoint[];
  stockStatusSummary: PDFStockStatusSummary;
  consolidatedMaterialsTable: PDFConsolidatedMaterialRow[];
  roomsTable?: PDFRoomRow[];
  donationsAndWriteOffsTable?: PDFDonationOrWriteOffRow[];
  fileName?: string;
}

const formatBRL = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const formatInt = (val: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(val || 0));

const formatDec = (val: number, digits = 1) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(val || 0);

const truncateText = (str: string, maxLen: number) => {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
};

/**
 * Helper to create a high-DPI offscreen HTML5 Canvas and return its 2D context
 */
function createHiDPICanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  // Crisp white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

/**
 * Draws a rounded rectangle on 2D canvas
 */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * Chart 1: Entradas vs Saídas por Período (Grouped Bar Chart with Legend & Values)
 */
function renderTimelineChartCanvas(data: PDFTimePoint[]): {
  dataUrl: string;
  width: number;
  height: number;
} {
  const W = 1100;
  const H = 310;
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14.5px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Evolução de Entradas e Saídas no Período (Unidades)', 22, 28);

  const legY = 18;
  drawRoundRect(ctx, W - 245, legY, 12, 12, 3, '#10b981');
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  ctx.fillText('Entradas', W - 227, legY + 10);

  drawRoundRect(ctx, W - 145, legY, 12, 12, 3, '#2563eb');
  ctx.fillStyle = '#334155';
  ctx.fillText('Saídas / Consumo', W - 127, legY + 10);

  if (!data || data.length === 0) {
    drawRoundRect(ctx, 22, 50, W - 44, H - 70, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhuma movimentação registrada para os filtros selecionados neste período.', W / 2, H / 2 + 10);
    return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
  }

  const displayData = data.slice(-14);
  const chartLeft = 68;
  const chartRight = W - 26;
  const chartTop = 52;
  const chartBottom = H - 48;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  const maxVal = Math.max(10, ...displayData.map(d => Math.max(d.entries || 0, d.exits || 0)));

  const steps = 4;
  ctx.textAlign = 'right';
  ctx.font = '10px Helvetica, Arial, sans-serif';
  for (let i = 0; i <= steps; i++) {
    const val = Math.round((maxVal / steps) * (steps - i));
    const y = chartTop + (chartH / steps) * i;
    ctx.strokeStyle = i === steps ? '#cbd5e1' : '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.fillText(formatInt(val), chartLeft - 8, y + 3);
  }

  const groupW = chartW / displayData.length;
  const barW = Math.min(26, Math.max(10, (groupW - 16) / 2));
  const maxLabelChars = Math.max(8, Math.floor((groupW - 6) / 5.5));

  displayData.forEach((pt, idx) => {
    const centerX = chartLeft + groupW * idx + groupW / 2;

    const entH = maxVal > 0 ? ((pt.entries || 0) / maxVal) * chartH : 0;
    const entX = centerX - barW - 2;
    const entY = chartBottom - entH;
    if (entH > 0) {
      drawRoundRect(ctx, entX, entY, barW, Math.max(2, entH), 3, '#10b981');
      if (pt.entries > 0) {
        ctx.fillStyle = '#047857';
        ctx.font = 'bold 9px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatInt(pt.entries), entX + barW / 2, Math.max(chartTop - 4, entY - 4), barW + 10);
      }
    }

    const extH = maxVal > 0 ? ((pt.exits || 0) / maxVal) * chartH : 0;
    const extX = centerX + 2;
    const extY = chartBottom - extH;
    if (extH > 0) {
      drawRoundRect(ctx, extX, extY, barW, Math.max(2, extH), 3, '#2563eb');
      if (pt.exits > 0) {
        ctx.fillStyle = '#1d4ed8';
        ctx.font = 'bold 9px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatInt(pt.exits), extX + barW / 2, Math.max(chartTop - 4, extY - 4), barW + 10);
      }
    }

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 9.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(truncateText(pt.label, maxLabelChars), centerX, chartBottom + 16, groupW - 6);
  });

  const totalEnt = data.reduce((a, b) => a + (b.entries || 0), 0);
  const totalExt = data.reduce((a, b) => a + (b.exits || 0), 0);
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Total no período: Entradas = ${formatInt(totalEnt)} un  |  Saídas = ${formatInt(totalExt)} un`,
    chartLeft,
    H - 10
  );

  return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
}

/**
 * Chart 2: Situação do Estoque Consolidado (Horizontal Status Breakdown)
 */
function renderStockStatusChartCanvas(summary: PDFStockStatusSummary): {
  dataUrl: string;
  width: number;
  height: number;
} {
  const W = 1100;
  const H = 242;
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14.5px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Situação Atual do Estoque Consolidado (Materiais e Validades)', 22, 28);

  const items = [
    { label: 'Materiais com Estoque Regular (Acima do Mínimo)', value: summary.regularCount, color: '#10b981', unit: 'materiais' },
    { label: 'Materiais com Estoque Baixo (≤ Estoque Mínimo)', value: summary.lowStockCount, color: '#f59e0b', unit: 'materiais' },
    { label: 'Materiais Zerados / Em Ruptura (Saldo = 0)', value: summary.zeroStockCount, color: '#e11d48', unit: 'materiais' },
    { label: 'Lotes com Validade Próxima (Vencem em até 60 dias)', value: summary.expiring60dBatchesCount, color: '#d97706', unit: 'lotes' },
    { label: 'Lotes com Saldo Vencido Hoje', value: summary.expiredBatchesCount, color: '#be123c', unit: 'lotes' }
  ];

  const maxVal = Math.max(10, ...items.map(i => i.value));
  const startY = 48;
  const rowH = 35;
  const barLeft = 365;
  const barMaxW = W - barLeft - 130;

  items.forEach((it, idx) => {
    const y = startY + idx * rowH;

    drawRoundRect(ctx, 22, y + 6, 10, 10, 3, it.color);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(it.label, 40, y + 15, barLeft - 52);

    drawRoundRect(ctx, barLeft, y + 3, barMaxW, 16, 5, '#f1f5f9');

    const fillW = maxVal > 0 ? Math.max(it.value > 0 ? 8 : 0, (it.value / maxVal) * barMaxW) : 0;
    if (fillW > 0) {
      drawRoundRect(ctx, barLeft, y + 3, fillW, 16, 5, it.color);
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${formatInt(it.value)} ${it.unit}`, W - 22, y + 15);
  });

  return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
}

/**
 * Chart 3: Consumo por Setor (Horizontal Ranking Bar Chart)
 */
function renderSectorChartCanvas(
  sectors: PDFSectorPoint[],
  isAdmin = true
): { dataUrl: string; width: number; height: number } {
  const topSectors = sectors.slice(0, 8);
  const W = 1100;
  const H = Math.max(210, 68 + Math.max(1, topSectors.length) * 31);
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14.5px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Consumo por Setor no Período (Top Setores Demandantes)', 22, 28);

  if (topSectors.length === 0) {
    drawRoundRect(ctx, 22, 44, W - 44, H - 64, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhum consumo setorial registrado para os filtros selecionados.', W / 2, H / 2 + 8);
    return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
  }

  const totalUnitsAll = sectors.reduce((a, b) => a + (b.units || 0), 0);
  const maxUnits = Math.max(1, ...topSectors.map(s => s.units || 0));
  const barLeft = 290;
  const rightAreaW = isAdmin ? 245 : 155;
  const barMaxW = W - barLeft - rightAreaW;
  const startY = 48;
  const rowH = 30;

  topSectors.forEach((sec, idx) => {
    const y = startY + idx * rowH;
    const pct = totalUnitsAll > 0 ? ((sec.units / totalUnitsAll) * 100).toFixed(1) : '0.0';

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${idx + 1}. ${truncateText(sec.sector, 34)}`, 22, y + 14, barLeft - 32);

    drawRoundRect(ctx, barLeft, y + 2, barMaxW, 15, 4, '#f1f5f9');

    const fillW = Math.max(6, (sec.units / maxUnits) * barMaxW);
    drawRoundRect(ctx, barLeft, y + 2, fillW, 15, 4, idx === 0 ? '#1d4ed8' : idx < 3 ? '#2563eb' : '#3b82f6');

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    const rightLabel = isAdmin
      ? `${formatInt(sec.units)} un (${pct}%) • ${formatBRL(sec.value)}`
      : `${formatInt(sec.units)} un (${pct}%)`;
    ctx.fillText(rightLabel, barLeft + barMaxW + 12, y + 13, rightAreaW - 22);
  });

  return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
}

/**
 * Chart 4: Distribuição por Categoria (Horizontal Bars + Legend & Share)
 */
function renderCategoryChartCanvas(
  categories: PDFCategoryPoint[],
  isAdmin = true
): { dataUrl: string; width: number; height: number } {
  const topCats = categories.slice(0, 8);
  const W = 1100;
  const H = Math.max(210, 68 + Math.max(1, topCats.length) * 31);
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14.5px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Distribuição por Categoria de Material (Consumo e Estoque)', 22, 28);

  if (topCats.length === 0) {
    drawRoundRect(ctx, 22, 44, W - 44, H - 64, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhuma categoria com dados para os filtros selecionados.', W / 2, H / 2 + 8);
    return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
  }

  const useConsumed = topCats.some(c => c.consumedUnits > 0);
  const totalMetric = categories.reduce((a, b) => a + (useConsumed ? b.consumedUnits : b.stockUnits), 0);
  const maxMetric = Math.max(1, ...topCats.map(c => (useConsumed ? c.consumedUnits : c.stockUnits)));

  const palette = ['#2563eb', '#4f46e5', '#0891b2', '#059669', '#d97706', '#e11d48', '#7c3aed', '#475569'];
  const barLeft = 295;
  const rightAreaW = isAdmin ? 250 : 175;
  const barMaxW = W - barLeft - rightAreaW;
  const startY = 48;
  const rowH = 30;

  topCats.forEach((cat, idx) => {
    const y = startY + idx * rowH;
    const val = useConsumed ? cat.consumedUnits : cat.stockUnits;
    const finVal = useConsumed ? cat.consumedValue : cat.stockValue;
    const pct = totalMetric > 0 ? ((val / totalMetric) * 100).toFixed(1) : '0.0';
    const barColor = cat.color && cat.color.startsWith('#') ? cat.color : palette[idx % palette.length];

    drawRoundRect(ctx, 22, y + 4, 11, 11, 3, barColor);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(truncateText(cat.category, 33), 40, y + 14, barLeft - 50);

    drawRoundRect(ctx, barLeft, y + 2, barMaxW, 15, 4, '#f1f5f9');
    const fillW = Math.max(val > 0 ? 6 : 0, (val / maxMetric) * barMaxW);
    if (fillW > 0) {
      drawRoundRect(ctx, barLeft, y + 2, fillW, 15, 4, barColor);
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    const textRight = isAdmin
      ? `${formatInt(val)} un (${pct}%) • ${formatBRL(finVal)}`
      : `${formatInt(val)} un (${pct}%) • ${cat.materialsCount} itens`;
    ctx.fillText(textRight, barLeft + barMaxW + 12, y + 13, rightAreaW - 22);
  });

  return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
}

/**
 * Chart 5: Materiais Mais Requisitados / Consumidos (Top 10 Consolidado sem duplicar lotes)
 */
function renderTopMaterialsChartCanvas(materials: PDFMaterialPoint[]): {
  dataUrl: string;
  width: number;
  height: number;
} {
  const topList = materials.slice(0, 8);
  const W = 1100;
  const H = Math.max(220, 74 + Math.max(1, topList.length) * 33);
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14.5px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Materiais Mais Requisitados e Consumidos (Lotes Consolidados)', 22, 28);

  drawRoundRect(ctx, W - 260, 16, 11, 11, 3, '#6366f1');
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
  ctx.fillText('Requisitado', W - 244, 25);

  drawRoundRect(ctx, W - 150, 16, 11, 11, 3, '#0284c7');
  ctx.fillStyle = '#334155';
  ctx.fillText('Consumido / Saída', W - 134, 25);

  if (topList.length === 0) {
    drawRoundRect(ctx, 22, 46, W - 44, H - 66, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhum material requisitado ou consumido no período com os filtros atuais.', W / 2, H / 2 + 8);
    return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
  }

  const maxVal = Math.max(1, ...topList.map(m => Math.max(m.requestedUnits || 0, m.consumedUnits || 0)));

  const barLeft = 345;
  const rightAreaW = 215;
  const barMaxW = W - barLeft - rightAreaW;
  const startY = 50;
  const rowH = 32;

  topList.forEach((mat, idx) => {
    const y = startY + idx * rowH;

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${idx + 1}º ${truncateText(mat.name, 44)}`, 22, y + 15, barLeft - 32);

    drawRoundRect(ctx, barLeft, y + 2, barMaxW, 8, 2, '#f1f5f9');
    const reqW = maxVal > 0 ? Math.max(mat.requestedUnits > 0 ? 4 : 0, (mat.requestedUnits / maxVal) * barMaxW) : 0;
    if (reqW > 0) {
      drawRoundRect(ctx, barLeft, y + 2, reqW, 8, 2, '#6366f1');
    }

    drawRoundRect(ctx, barLeft, y + 12, barMaxW, 8, 2, '#f1f5f9');
    const consW = maxVal > 0 ? Math.max(mat.consumedUnits > 0 ? 4 : 0, (mat.consumedUnits / maxVal) * barMaxW) : 0;
    if (consW > 0) {
      drawRoundRect(ctx, barLeft, y + 12, consW, 8, 2, '#0284c7');
    }

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Req: ${formatInt(mat.requestedUnits)} | Saída: ${formatInt(mat.consumedUnits)} un`,
      barLeft + barMaxW + 10,
      y + 14,
      rightAreaW - 20
    );
  });

  return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
}

/**
 * Generates and downloads a comprehensive, multi-page professional PDF report
 */
export async function generateCompletePDFReport(params: GenerateCompletePDFReportParams): Promise<void> {
  const {
    title,
    subtitle,
    letterheadImage,
    isAdmin = true,
    filters,
    kpis,
    timelineData,
    sectorData,
    topMaterialsData,
    categoryData,
    stockStatusSummary,
    consolidatedMaterialsTable,
    roomsTable,
    donationsAndWriteOffsTable,
    fileName
  } = params;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // Attach institutional letterhead proportionally (0% distortion) on Page 1 and every subsequent page
  const lh = attachLetterheadToDoc(doc, letterheadImage, {
    sideMargin: 12,
    continuationHeaderHeight: 11
  });

  const pageWidth = lh.pageWidth; // 297mm
  const pageHeight = lh.pageHeight; // 210mm
  const margin = lh.marginLeft;
  const contentWidth = lh.contentWidth; // 273mm
  const continuationTopMargin = lh.continuationTop;
  const footerBottomMargin = lh.marginBottom;
  const nowStr = new Date().toLocaleString('pt-BR');

  // Unified light institutional editorial header directly on white background (no dark blocks or filter boxes)
  let currentY = drawInstitutionalReportHeader(doc, lh, {
    kicker: `Unidade Responsável: Policlínica de Sobral • ${filters.location}`,
    emissionText: `Emitido em ${nowStr}`,
    title,
    subtitle: subtitle && !subtitle.includes('Emitido em') ? subtitle : undefined,
    metadata: [
      { label: 'Período Analisado', value: filters.periodLabel },
      { label: 'Unidade', value: filters.location },
      { label: 'Setor', value: filters.sectorFilter },
      { label: 'Categoria', value: filters.categoryFilter },
      { label: 'Material', value: filters.materialFilter },
      ...(filters.generatedBy
        ? [{ label: 'Responsável pela Emissão', value: filters.generatedBy }]
        : [{ label: 'Data de Emissão', value: nowStr }])
    ],
    metadataColumns: 3,
    observation: filters.medicamentosNote,
    observationTone: 'warning'
  });

  const ensureSpace = (neededHeight: number) => {
    if (currentY + neededHeight > lh.contentBottom) {
      doc.addPage();
      currentY = continuationTopMargin;
    }
  };

  const addChartImage = (
    rendered: { dataUrl: string; width: number; height: number },
    maxHeightCap = 76
  ) => {
    const naturalH = (contentWidth * rendered.height) / rendered.width;
    const fullPagePrintableH = lh.contentBottom - continuationTopMargin - 3;
    let remaining = lh.contentBottom - currentY;

    // Only break to a new page if the remaining space cannot fit a clearly readable chart (>= 56mm)
    if (remaining < 56) {
      doc.addPage();
      currentY = continuationTopMargin;
      remaining = lh.contentBottom - currentY;
    }

    const maxAllowed = Math.min(maxHeightCap, remaining - 2, fullPagePrintableH);
    const drawH = Math.min(naturalH, maxAllowed);
    const drawW = Math.min(contentWidth, (drawH * rendered.width) / rendered.height);
    const drawX = margin + (contentWidth - drawW) / 2;

    doc.addImage(rendered.dataUrl, 'PNG', drawX, currentY, drawW, drawH, undefined, 'FAST');
    currentY += drawH + 4;
  };

  // --- 2. EXECUTIVE KPI CARDS GRID (2 ROWS OF 4 CARDS) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. INDICADORES NUMÉRICOS CONSOLIDADOS (LOTES SOMADOS POR MATERIAL)', margin, currentY);
  currentY += 3.5;

  const kpiCards = [
    {
      title: 'MATERIAIS CADASTRADOS',
      main: `${formatInt(kpis.consolidatedMaterialsCount)} materiais`,
      sub: `${formatInt(kpis.activeBatchesCount)} lotes registrados (sem duplicar)`,
      accent: [37, 99, 235] as [number, number, number]
    },
    {
      title: 'ITENS COM ESTOQUE BAIXO',
      main: `${formatInt(kpis.lowStockMaterialsCount)} materiais`,
      sub: `${formatInt(kpis.stockoutMaterialsCount)} zerados / em ruptura hoje`,
      accent: [217, 119, 6] as [number, number, number]
    },
    {
      title: 'MOVIMENTAÇÕES NO PERÍODO',
      main: `${formatInt(kpis.totalMovementsCount)} registros`,
      sub: `Ent: ${formatInt(kpis.entriesCount)} | Saídas: ${formatInt(kpis.exitsCount)} | Dev: ${formatInt(kpis.returnsCount)}`,
      accent: [79, 70, 229] as [number, number, number]
    },
    {
      title: isAdmin ? 'PATRIMÔNIO EM ESTOQUE' : 'SALDO FÍSICO ATUAL',
      main: isAdmin ? formatBRL(kpis.currentStockValue) : `${formatInt(kpis.currentStockUnits)} un`,
      sub: `${formatInt(kpis.currentStockUnits)} unidades em saldo ativo`,
      accent: [5, 150, 105] as [number, number, number]
    },
    {
      title: 'ENTRADAS NO PERÍODO',
      main: `${formatInt(kpis.entriesUnits)} un`,
      sub: isAdmin ? `Valor: ${formatBRL(kpis.entriesValue)}` : `${formatInt(kpis.entriesCount)} entradas de estoque`,
      accent: [16, 185, 129] as [number, number, number]
    },
    {
      title: 'CONSUMO LÍQUIDO NO PERÍODO',
      main: `${formatInt(kpis.netConsumptionUnits)} un`,
      sub: isAdmin ? `Valor: ${formatBRL(kpis.netConsumptionValue)}` : `Descontadas ${formatInt(kpis.returnsUnits)} un devolvidas`,
      accent: [225, 29, 72] as [number, number, number]
    },
    {
      title: 'GIRO E COBERTURA DE ESTOQUE',
      main: `${formatDec(kpis.stockTurnover, 2)}x no período`,
      sub:
        kpis.stockCoverageDays !== null
          ? `Cobertura: ~${Math.round(kpis.stockCoverageDays)} dias (${formatDec(kpis.annualizedTurnover, 1)}x/ano)`
          : 'Sem consumo no período para cobertura',
      accent: [2, 132, 199] as [number, number, number]
    },
    {
      title: 'NÍVEL DE SERVIÇO E VALIDADE',
      main: `${formatDec(kpis.serviceLevelPct, 1)}% atendimento`,
      sub: `Vencidos: ${kpis.expiredBatchesCount} lotes | 60d: ${kpis.expiring60dBatchesCount} lotes`,
      accent: [190, 18, 60] as [number, number, number]
    }
  ];

  const cardW = (contentWidth - 9) / 4;
  const cardH = 16.8;

  kpiCards.forEach((card, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const x = margin + col * (cardW + 3);
    const y = currentY + row * (cardH + 2.5);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardW, cardH, 1.6, 1.6, 'FD');

    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.rect(x, y, cardW, 1.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.3);
    doc.setTextColor(100, 116, 139);
    doc.text(truncateText(card.title, 38), x + 3, y + 4.9);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(15, 23, 42);
    doc.text(truncateText(card.main, 34), x + 3, y + 10.4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(71, 85, 105);
    doc.text(truncateText(card.sub, 48), x + 3, y + 14.5);
  });

  currentY += cardH * 2 + 6.5;

  // --- 3. VISUAL CHARTS SECTION (balanced sizing so Page 1 fits Chart 1 and consecutive charts pair cleanly) ---
  ensureSpace(62);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. PAINEL GRÁFICO DE MOVIMENTAÇÃO, ESTOQUE, SETORES E CATEGORIAS', margin, currentY);
  currentY += 3;

  addChartImage(renderTimelineChartCanvas(timelineData), 72);
  addChartImage(renderStockStatusChartCanvas(stockStatusSummary), 66);
  addChartImage(renderSectorChartCanvas(sectorData, isAdmin), 72);
  addChartImage(renderCategoryChartCanvas(categoryData, isAdmin), 72);
  addChartImage(renderTopMaterialsChartCanvas(topMaterialsData), 74);

  currentY += 2;

  // --- 4. ANALYTICAL TABLES SECTION ---
  // TABLE 1: CONSUMO POR SETOR
  if (sectorData.length > 0) {
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('3. TABELA DE CONSUMO CONSOLIDADO POR SETOR', margin, currentY);
    currentY += 3;

    const totalSecUnits = sectorData.reduce((a, b) => a + b.units, 0);
    const secHead = isAdmin
      ? [['#', 'Setor Destino', 'Movimentações', 'Qtd. Consumida (Líquida)', '% Participação', 'Valor Total (R$)']]
      : [['#', 'Setor Destino', 'Movimentações', 'Qtd. Consumida (Líquida)', '% Participação']];

    const secBody = sectorData.map((s, i) => {
      const pct = totalSecUnits > 0 ? `${formatDec((s.units / totalSecUnits) * 100, 1)}%` : '0,0%';
      const row = [
        `${i + 1}º`,
        s.sector,
        formatInt(s.movementsCount),
        `${formatInt(s.units)} un`,
        pct
      ];
      if (isAdmin) row.push(formatBRL(s.value));
      return row;
    });

    autoTable(doc, {
      startY: currentY,
      head: secHead,
      body: secBody,
      theme: 'striped',
      tableWidth: contentWidth,
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: continuationTopMargin, bottom: footerBottomMargin },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 8.2,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      styles: {
        fontSize: 7.8,
        cellPadding: 2.4,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 14 },
        1: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 38, fontStyle: 'bold' },
        4: { halign: 'center', cellWidth: 28 },
        ...(isAdmin ? { 5: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } } : {})
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 7;
  }

  // TABLE 2: MATERIAIS MAIS REQUISITADOS E CONSUMIDOS (LOTES SOMADOS)
  if (topMaterialsData.length > 0) {
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('4. MATERIAIS MAIS REQUISITADOS E CONSUMIDOS NO PERÍODO (CONSOLIDADO)', margin, currentY);
    currentY += 3;

    const matHead = isAdmin
      ? [['#', 'Material (Consolidado)', 'Categoria', 'Qtd. Requisitada', 'Qtd. Consumida', 'Classe ABC', 'Valor Consumido']]
      : [['#', 'Material (Consolidado)', 'Categoria', 'Qtd. Requisitada', 'Qtd. Consumida']];

    const matBody = topMaterialsData.slice(0, 30).map((m, idx) => {
      const row = [
        `${idx + 1}º`,
        m.name,
        m.category || 'Outros',
        `${formatInt(m.requestedUnits)} un`,
        `${formatInt(m.consumedUnits)} un`
      ];
      if (isAdmin) {
        row.push(m.abcClass ? `Classe ${m.abcClass}` : '—');
        row.push(formatBRL(m.value));
      }
      return row;
    });

    autoTable(doc, {
      startY: currentY,
      head: matHead,
      body: matBody,
      theme: 'striped',
      tableWidth: contentWidth,
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: continuationTopMargin, bottom: footerBottomMargin },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8.2,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      styles: {
        fontSize: 7.8,
        cellPadding: 2.4,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        2: { halign: 'left', cellWidth: isAdmin ? 46 : 54 },
        3: { halign: 'right', cellWidth: 32 },
        4: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
        ...(isAdmin
          ? {
              5: { halign: 'center', cellWidth: 24 },
              6: { halign: 'right', cellWidth: 34, fontStyle: 'bold' }
            }
          : {})
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 7;
  }

  // TABLE 3: SITUAÇÃO DO ESTOQUE CONSOLIDADO POR MATERIAL (SEM DUPLICAR PRODUTOS)
  if (consolidatedMaterialsTable.length > 0) {
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `5. SITUAÇÃO DO ESTOQUE CONSOLIDADO POR MATERIAL (${consolidatedMaterialsTable.length} MATERIAIS)`,
      margin,
      currentY
    );
    currentY += 3;

    const stockHead = isAdmin
      ? [['Material Consolidado', 'Categoria', 'Lotes', 'Saldo Total', 'Est. Mínimo', 'Consumo (90d)', 'Valor em Saldo', 'Situação']]
      : [['Material Consolidado', 'Categoria', 'Lotes', 'Saldo Total', 'Est. Mínimo', 'Consumo (90d)', 'Situação']];

    // Prioritize critical / low stock first, then alphabetical
    const sortedStock = [...consolidatedMaterialsTable].sort((a, b) => {
      const rank = (s: string) => (s === 'Zerado / Ruptura' ? 0 : s === 'Estoque Baixo' ? 1 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return a.name.localeCompare(b.name);
    });

    const stockBody = sortedStock.slice(0, 120).map(item => {
      const row = [
        item.name,
        item.category,
        String(item.batchesCount),
        `${formatInt(item.totalUnits)} un`,
        `${formatInt(item.minQuantity)} un`,
        `${formatInt(item.consumed90d)} un`
      ];
      if (isAdmin) {
        row.push(formatBRL(item.totalValue));
      }
      row.push(item.status);
      return row;
    });

    autoTable(doc, {
      startY: currentY,
      head: stockHead,
      body: stockBody,
      theme: 'striped',
      tableWidth: contentWidth,
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: continuationTopMargin, bottom: footerBottomMargin },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        1: { halign: 'left', cellWidth: isAdmin ? 42 : 46 },
        2: { halign: 'center', cellWidth: 16 },
        3: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
        4: { halign: 'right', cellWidth: 24 },
        5: { halign: 'right', cellWidth: 26 },
        ...(isAdmin
          ? {
              6: { halign: 'right', cellWidth: 30 },
              7: { halign: 'center', cellWidth: 28, fontStyle: 'bold' }
            }
          : {
              6: { halign: 'center', cellWidth: 30, fontStyle: 'bold' }
            })
      },
      didParseCell: data => {
        const statusColIdx = isAdmin ? 7 : 6;
        if (data.section === 'body' && data.column.index === statusColIdx) {
          const txt = data.cell.text[0] || '';
          if (txt.includes('Zerado')) {
            data.cell.styles.textColor = [225, 29, 72];
          } else if (txt.includes('Baixo')) {
            data.cell.styles.textColor = [217, 119, 6];
          } else {
            data.cell.styles.textColor = [5, 150, 105];
          }
        }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 7;
  }

  // TABLE 4: SITUAÇÃO POR SALA DE ESTOQUE (IF PROVIDED)
  if (roomsTable && roomsTable.length > 0) {
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('6. SITUAÇÃO ATUAL POR SALA FÍSICA DE ESTOQUE', margin, currentY);
    currentY += 3;

    const roomHead = [
      ['Sala', 'Situação', 'Tipos de Material', 'Lotes', 'Total Unidades', 'Valor em Estoque', 'Vencidos', 'Vencem 60d']
    ];
    const roomBody = roomsTable.map(r => [
      r.room,
      r.status,
      formatInt(r.distinctItemsCount),
      formatInt(r.batchesCount),
      `${formatInt(r.stockUnits)} un`,
      formatBRL(r.stockValue),
      formatInt(r.expiredBatches),
      formatInt(r.expiring60dBatches)
    ]);

    autoTable(doc, {
      startY: currentY,
      head: roomHead,
      body: roomBody,
      theme: 'striped',
      tableWidth: contentWidth,
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: continuationTopMargin, bottom: footerBottomMargin },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      styles: {
        fontSize: 7.8,
        cellPadding: 2.4,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        1: { halign: 'center', fontStyle: 'bold', cellWidth: 32 },
        2: { halign: 'right', cellWidth: 28 },
        3: { halign: 'right', cellWidth: 20 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 32 },
        5: { halign: 'right', fontStyle: 'bold', cellWidth: 38 },
        6: { halign: 'center', cellWidth: 24 },
        7: { halign: 'center', cellWidth: 28 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 7;
  }

  // TABLE 5: DOAÇÕES E BAIXAS POR VENCIMENTO (IF PROVIDED)
  if (donationsAndWriteOffsTable && donationsAndWriteOffsTable.length > 0) {
    ensureSpace(26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('7. REGISTROS DE DOAÇÕES EFETIVAS E BAIXAS POR VENCIMENTO / PERDA', margin, currentY);
    currentY += 3.2;

    const donHead = [
      ['Fluxo / Tipo', 'Data', 'Material', 'Categoria', 'Lote', 'Unidade / Justificativa', 'Qtd.', 'Valor (R$)']
    ];
    const donBody = donationsAndWriteOffsTable.slice(0, 80).map(d => [
      d.flow,
      d.date,
      d.material,
      d.category,
      d.batch,
      d.partnerOrReason,
      `${formatInt(d.qty)} un`,
      formatBRL(d.value)
    ]);

    autoTable(doc, {
      startY: currentY,
      head: donHead,
      body: donBody,
      theme: 'striped',
      tableWidth: contentWidth,
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: continuationTopMargin, bottom: footerBottomMargin },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 38, fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 22 },
        2: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        3: { halign: 'left', cellWidth: 34 },
        4: { halign: 'center', cellWidth: 24 },
        5: { halign: 'left', cellWidth: 50 },
        6: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
        7: { halign: 'right', cellWidth: 26, fontStyle: 'bold' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 7;
  }

  // --- 5. ADD CONTINUATION HEADERS & PAGE NUMBERS TO ALL PAGES (strictly clear of institutional letterhead) ---
  drawContinuationAndPageNumbers(doc, lh, {
    title,
    rightHeaderText: `${filters.location} • ${filters.periodLabel}`,
    footerLeftText: `Relatório Gerencial de Estoque e Indicadores • ${filters.location} • Emitido em ${nowStr}`
  });

  const defaultFileName = `Relatorio_Indicadores_${filters.location}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName || defaultFileName);
}

// ============================================================================
// SINGLE INDICATOR EXPORT & PRINT UTILITIES (PER-INDICATOR PDF & PRINT)
// ============================================================================

export interface SingleIndicatorKPI {
  label: string;
  value: string;
  subValue?: string;
  subvalue?: string;
  helper?: string;
  tone?: string;
  accent?: [number, number, number];
}

export interface SingleIndicatorChartPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
  cumPct?: number;
}

export interface SingleIndicatorChartConfig {
  title: string;
  subtitle?: string;
  type: 'verticalBar' | 'horizontalBar' | 'groupedBar' | 'donut' | 'line' | 'pareto';
  unit?: string;
  isCurrency?: boolean;
  valuePrefix?: string;
  valueFormatter?:
    | 'currency'
    | 'number'
    | 'integer'
    | 'decimal'
    | 'percent'
    | 'days'
    | 'hours'
    | ((val: number) => string);
  secondaryFormatter?: string;
  seriesLabels?: [string, string];
  seriesALabel?: string;
  seriesBLabel?: string;
  seriesAName?: string;
  seriesAColor?: string;
  seriesBName?: string;
  seriesBColor?: string;
  data: SingleIndicatorChartPoint[];
}

export interface SingleIndicatorTableConfig {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface SingleIndicatorExportParams {
  title?: string;
  indicatorTitle?: string;
  subtitle?: string;
  indicatorSubtitle?: string;
  explanation?: string;
  groupName?: string;
  accentColor?: [number, number, number];
  letterheadImage?: string | null;
  filters: PDFReportFilterSummary;
  kpis: SingleIndicatorKPI[];
  chart: SingleIndicatorChartConfig;
  table?: SingleIndicatorTableConfig;
  fileName?: string;
}

const DEFAULT_CHART_COLORS = [
  '#2563eb',
  '#4f46e5',
  '#10b981',
  '#f59e0b',
  '#e11d48',
  '#0891b2',
  '#7c3aed',
  '#0d9488',
  '#ea580c',
  '#475569'
];

function formatChartMetric(
  val: number,
  isCurrency?: boolean,
  unit?: string,
  valueFormatter?: SingleIndicatorChartConfig['valueFormatter'],
  valuePrefix?: string
): string {
  if (typeof valueFormatter === 'function') return valueFormatter(val);
  if (isCurrency || valueFormatter === 'currency' || valuePrefix === 'R$ ') return formatBRL(val);
  if (valueFormatter === 'percent') return `${formatDec(val, 1)}%`;
  if (valueFormatter === 'days') return `${formatInt(val)} d`;
  if (valueFormatter === 'hours') return `${formatDec(val, 1)} h`;
  if (valueFormatter === 'integer') return unit ? `${formatInt(val)} ${unit}` : formatInt(val);
  const formatted = Number.isInteger(val) ? formatInt(val) : formatDec(val, 2);
  if (valuePrefix) return `${valuePrefix}${formatted}${unit ? ` ${unit}` : ''}`;
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Renders any single-indicator chart to a high-DPI PNG data URL for PDF and Print
 */
export function renderSingleIndicatorChartCanvas(chart: SingleIndicatorChartConfig): {
  dataUrl: string;
  width: number;
  height: number;
} {
  const W = 1120;
  const items = chart.data || [];
  const H =
    chart.type === 'horizontalBar'
      ? Math.max(260, 88 + Math.min(12, Math.max(1, items.length)) * 31)
      : 345;

  const { canvas, ctx } = createHiDPICanvas(W, H);
  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#cbd5e1');

  // Top accent bar
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(2, 2, W - 4, 4);

  const hasRightLegend =
    chart.type === 'pareto' ||
    (chart.type === 'groupedBar' &&
      Boolean(chart.seriesLabels || (chart.seriesAName && chart.seriesBName)));

  // Title (constrained so it never collides with right-side legend)
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14.5px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(truncateText(chart.title, hasRightLegend ? 72 : 105), 24, 30, hasRightLegend ? W - 380 : W - 48);

  if (!items || items.length === 0 || items.every(d => (d.value || 0) === 0 && (d.secondaryValue || 0) === 0)) {
    drawRoundRect(ctx, 24, 48, W - 48, H - 68, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Dados insuficientes no período ou filtros selecionados para exibição gráfica.',
      W / 2,
      H / 2 + 8
    );
    return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
  }

  if (chart.type === 'horizontalBar') {
    const topItems = items.slice(0, 12);
    const totalSum = items.reduce((acc, it) => acc + Math.max(0, it.value || 0), 0);
    const maxVal = Math.max(1, ...topItems.map(i => Math.max(i.value || 0, i.secondaryValue || 0)));
    const barLeft = 305;
    const rightAreaW = 245;
    const barMaxW = W - barLeft - rightAreaW - 18;
    const startY = 52;
    const rowH = 31;

    topItems.forEach((it, idx) => {
      const y = startY + idx * rowH;
      const color = it.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
      const pct = totalSum > 0 ? ((it.value / totalSum) * 100).toFixed(1) : '0.0';

      if (idx % 2 === 0) {
        drawRoundRect(ctx, 16, y - 3, W - 32, rowH - 3, 5, '#f8fafc');
      }

      drawRoundRect(ctx, 24, y + 4, 10, 10, 3, color);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(truncateText(it.label, 38), 40, y + 13, barLeft - 52);

      drawRoundRect(ctx, barLeft, y + 1, barMaxW, 16, 4, '#f1f5f9');
      const fillW = Math.max(it.value > 0 ? 6 : 0, (it.value / maxVal) * barMaxW);
      if (fillW > 0) {
        drawRoundRect(ctx, barLeft, y + 1, fillW, 16, 4, color);
      }

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'left';
      const valText = `${formatChartMetric(it.value, chart.isCurrency, chart.unit, chart.valueFormatter, chart.valuePrefix)} (${pct}%)`;
      ctx.fillText(truncateText(valText, 36), barLeft + barMaxW + 12, y + 13, rightAreaW - 8);
    });

    return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
  }

  if (chart.type === 'donut') {
    const validSlices = items.filter(i => i.value > 0);
    const total = validSlices.reduce((acc, i) => acc + i.value, 0) || 1;
    const centerX = 230;
    const centerY = H / 2 + 12;
    const outerR = 104;
    const innerR = 58;

    let startAngle = -Math.PI / 2;
    validSlices.forEach((slice, idx) => {
      const sliceAngle = (slice.value / total) * Math.PI * 2;
      const color = slice.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, outerR, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      startAngle += sliceAngle;
    });

    // Inner hole for Donut
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Center total label
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 9.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TOTAL', centerX, centerY - 5);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.fillText(
      truncateText(formatChartMetric(total, chart.isCurrency, chart.unit, chart.valueFormatter, chart.valuePrefix), 16),
      centerX,
      centerY + 12,
      innerR * 1.8
    );

    // Legend table on right
    const legLeft = 400;
    const legW = W - legLeft - 24;
    const startY = 58;
    const rowH = 33;
    items.slice(0, 8).forEach((slice, idx) => {
      const y = startY + idx * rowH;
      const color = slice.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
      const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';

      drawRoundRect(ctx, legLeft, y, legW, 26, 6, '#f8fafc', '#e2e8f0');
      drawRoundRect(ctx, legLeft + 10, y + 7, 12, 12, 3, color);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(truncateText(slice.label, 48), legLeft + 30, y + 17, legW - 265);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${formatChartMetric(slice.value, chart.isCurrency, chart.unit, chart.valueFormatter, chart.valuePrefix)} (${pct}%)`,
        W - 36,
        y + 17,
        225
      );
    });

    return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
  }

  // Vertical Bar, Grouped Bar, Line, or Pareto
  const displayData = items.slice(0, 14);
  const chartLeft = 86;
  const chartRight = chart.type === 'pareto' ? W - 62 : W - 28;
  const chartTop = 58;
  const chartBottom = H - 54;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  const maxVal = Math.max(
    1,
    ...displayData.map(d => Math.max(d.value || 0, d.secondaryValue || 0))
  );

  const resolvedSeriesLabels: [string, string] | undefined =
    chart.seriesLabels ||
    (chart.seriesAName && chart.seriesBName ? [chart.seriesAName, chart.seriesBName] : undefined);

  // Right-aligned dynamic legend for groupedBar or pareto (prevents text collision)
  if (chart.type === 'groupedBar' && resolvedSeriesLabels) {
    ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
    const labelA = truncateText(resolvedSeriesLabels[0], 24);
    const labelB = truncateText(resolvedSeriesLabels[1], 24);
    const wB = ctx.measureText(labelB).width;
    const wA = ctx.measureText(labelA).width;
    const xB = W - 26 - wB - 16;
    const xA = xB - 20 - wA - 16;

    drawRoundRect(ctx, xA, 17, 11, 11, 3, chart.seriesAColor || '#2563eb');
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText(labelA, xA + 16, 26);

    drawRoundRect(ctx, xB, 17, 11, 11, 3, chart.seriesBColor || '#10b981');
    ctx.fillText(labelB, xB + 16, 26);
  } else if (chart.type === 'pareto') {
    ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
    const labelA = 'Valor Consumido';
    const labelB = '% Acumulado ABC';
    const wB = ctx.measureText(labelB).width;
    const wA = ctx.measureText(labelA).width;
    const xB = W - 26 - wB - 16;
    const xA = xB - 20 - wA - 16;

    drawRoundRect(ctx, xA, 17, 11, 11, 3, '#2563eb');
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText(labelA, xA + 16, 26);

    drawRoundRect(ctx, xB, 17, 11, 11, 3, '#e11d48');
    ctx.fillText(labelB, xB + 16, 26);
  }

  // Grid lines
  const isCurr = chart.isCurrency || chart.valueFormatter === 'currency' || chart.valuePrefix === 'R$ ';
  const steps = 4;
  ctx.font = '9.5px Helvetica, Arial, sans-serif';
  for (let i = 0; i <= steps; i++) {
    const val = (maxVal / steps) * (steps - i);
    const y = chartTop + (chartH / steps) * i;
    ctx.strokeStyle = i === steps ? '#cbd5e1' : '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(
      isCurr ? `R$ ${formatInt(val)}` : formatInt(val),
      chartLeft - 8,
      y + 3,
      chartLeft - 14
    );

    if (chart.type === 'pareto') {
      const pctVal = Math.round((100 / steps) * (steps - i));
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e11d48';
      ctx.fillText(`${pctVal}%`, chartRight + 8, y + 3);
    }
  }

  const groupW = chartW / displayData.length;
  const maxLabelChars = Math.max(9, Math.min(20, Math.floor((groupW - 8) / 5.5)));
  const maxLabelWidth = Math.max(26, groupW - 6);

  if (chart.type === 'line') {
    const points = displayData.map((pt, idx) => ({
      x: chartLeft + groupW * idx + groupW / 2,
      y: chartBottom - ((pt.value || 0) / maxVal) * chartH,
      pt
    }));

    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, chartBottom);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, chartBottom);
      ctx.closePath();
      ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
      ctx.fill();

      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#1d4ed8';
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        formatChartMetric(p.pt.value, chart.isCurrency, chart.unit, chart.valueFormatter, chart.valuePrefix),
        p.x,
        Math.max(chartTop - 4, p.y - 8),
        maxLabelWidth
      );

      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9.5px Helvetica, Arial, sans-serif';
      ctx.fillText(truncateText(p.pt.label, maxLabelChars), p.x, chartBottom + 18, maxLabelWidth);
    });
  } else {
    // verticalBar, groupedBar, or pareto
    const isGrouped = chart.type === 'groupedBar';
    const barW = isGrouped
      ? Math.min(28, Math.max(10, (groupW - 14) / 2))
      : Math.min(48, Math.max(14, groupW * 0.55));

    displayData.forEach((pt, idx) => {
      const centerX = chartLeft + groupW * idx + groupW / 2;
      const color = pt.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];

      if (isGrouped) {
        const h1 = maxVal > 0 ? ((pt.value || 0) / maxVal) * chartH : 0;
        const x1 = centerX - barW - 2;
        const y1 = chartBottom - h1;
        if (h1 > 0) {
          drawRoundRect(ctx, x1, y1, barW, Math.max(2, h1), 3, pt.color || chart.seriesAColor || '#2563eb');
          ctx.fillStyle = '#1e3a8a';
          ctx.font = 'bold 8.5px Helvetica, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(formatInt(pt.value), x1 + barW / 2, Math.max(chartTop - 4, y1 - 4), barW + 10);
        }

        const h2 = maxVal > 0 ? ((pt.secondaryValue || 0) / maxVal) * chartH : 0;
        const x2 = centerX + 2;
        const y2 = chartBottom - h2;
        if (h2 > 0) {
          drawRoundRect(ctx, x2, y2, barW, Math.max(2, h2), 3, chart.seriesBColor || '#10b981');
          ctx.fillStyle = '#065f46';
          ctx.font = 'bold 8.5px Helvetica, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(formatInt(pt.secondaryValue || 0), x2 + barW / 2, Math.max(chartTop - 4, y2 - 4), barW + 10);
        }
      } else {
        const h = maxVal > 0 ? ((pt.value || 0) / maxVal) * chartH : 0;
        const x = centerX - barW / 2;
        const y = chartBottom - h;
        if (h > 0) {
          drawRoundRect(ctx, x, y, barW, Math.max(3, h), 4, color);
        }
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 9px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          truncateText(formatChartMetric(pt.value, chart.isCurrency, chart.unit, chart.valueFormatter, chart.valuePrefix), 15),
          centerX,
          Math.max(chartTop - 4, y - 5),
          maxLabelWidth
        );
      }

      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9.5px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(truncateText(pt.label, maxLabelChars), centerX, chartBottom + 18, maxLabelWidth);
    });

    // Overlay cumulative curve for Pareto
    if (chart.type === 'pareto') {
      const linePts = displayData.map((pt, idx) => ({
        x: chartLeft + groupW * idx + groupW / 2,
        y: chartBottom - (Math.min(100, Math.max(0, pt.cumPct || 0)) / 100) * chartH,
        cumPct: pt.cumPct || 0
      }));

      if (linePts.length > 1) {
        ctx.beginPath();
        linePts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }

      linePts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#e11d48';
        ctx.fill();

        ctx.fillStyle = '#be123c';
        ctx.font = 'bold 8.5px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${p.cumPct.toFixed(0)}%`, p.x, Math.max(chartTop + 6, p.y - 6));
      });
    }
  }

  return { dataUrl: canvas.toDataURL('image/png', 1.0), width: W, height: H };
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inferColumnAlignment(header: string): 'left' | 'center' | 'right' {
  const norm = String(header || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (
    norm === '#' ||
    norm === 'pos' ||
    norm === 'pos.' ||
    norm === 'rk' ||
    /^(classe|curva|abc|status|situacao|tipo|data|validade|vencimento|mes|periodo|lote|codigo|cod\.?|risco|criticidade|nivel|faixa|unidade|un\.?)$/.test(
      norm
    )
  ) {
    return 'center';
  }

  if (
    /(%|qtd|quant|total|valor|custo|r\$|dias|horas|media|giro|saldo|estoque|minimo|maximo|consumo|saida|entrada|taxa|indice|ticket|cobertura|sku|itens|movim|variacao|acumul|share|part\.|particip|freq|nota|score|ponto|prazo)/.test(
      norm
    )
  ) {
    return 'right';
  }

  return 'left';
}

function buildSingleIndicatorColumnStyles(headers: string[]): Record<number, any> {
  const styles: Record<number, any> = {};
  headers.forEach((h, idx) => {
    const trimmed = String(h || '').trim();
    const halign = inferColumnAlignment(trimmed);
    if (trimmed === '#' || trimmed.toLowerCase() === 'pos' || trimmed.toLowerCase() === 'pos.') {
      styles[idx] = { halign: 'center', cellWidth: 11 };
    } else {
      styles[idx] = { halign };
    }
  });
  return styles;
}

/**
 * Exports a PDF in mandatory A4 landscape orientation containing ONLY the selected indicator,
 * its chart, title, KPIs, period, applied filters, and optional table
 */
export function exportSingleIndicatorPDF(params: SingleIndicatorExportParams): void {
  const { groupName, letterheadImage, filters, kpis, chart, table, fileName } = params;
  const title = params.title || params.indicatorTitle || chart.title || 'Indicador';
  const subtitle = params.subtitle || params.indicatorSubtitle || chart.subtitle;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // Attach institutional letterhead proportionally on Page 1 and every subsequent page
  const lh = attachLetterheadToDoc(doc, letterheadImage, {
    sideMargin: 12,
    continuationHeaderHeight: 11
  });

  const margin = lh.marginLeft;
  const contentWidth = lh.contentWidth; // 273mm
  const continuationTopMargin = lh.continuationTop;
  const footerBottomMargin = lh.marginBottom;
  const nowStr = new Date().toLocaleString('pt-BR');

  // Unified light institutional editorial header directly on white background (no dark blocks or filter boxes)
  let currentY = drawInstitutionalReportHeader(doc, lh, {
    kicker: groupName
      ? `${groupName} • Unidade Responsável: ${filters.location}`
      : `Unidade Responsável: Policlínica de Sobral • ${filters.location}`,
    emissionText: `Emitido em ${nowStr}`,
    title,
    metadata: [
      { label: 'Período Analisado', value: filters.periodLabel },
      { label: 'Unidade', value: filters.location },
      { label: 'Setor', value: filters.sectorFilter },
      { label: 'Categoria', value: filters.categoryFilter },
      { label: 'Material', value: filters.materialFilter },
      ...(filters.generatedBy
        ? [{ label: 'Responsável pela Emissão', value: filters.generatedBy }]
        : [{ label: 'Data de Emissão', value: nowStr }])
    ],
    metadataColumns: 3,
    observation: filters.medicamentosNote,
    observationTone: 'warning',
    methodology: subtitle
  });

  // KPIs Grid (up to 4 wide cards across 273mm)
  if (kpis && kpis.length > 0) {
    const cols = Math.min(4, Math.max(1, kpis.length));
    const cardW = (contentWidth - (cols - 1) * 3.5) / cols;
    const cardH = 17;

    kpis.forEach((kpi, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = margin + col * (cardW + 3.5);
      const y = currentY + row * (cardH + 2.5);

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, cardW, cardH, 1.6, 1.6, 'FD');

      const accent = kpi.accent || params.accentColor || [37, 99, 235];
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(x, y, cardW, 1.4, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.3);
      doc.setTextColor(100, 116, 139);
      doc.text(truncateText(kpi.label.toUpperCase(), 42), x + 3.2, y + 5.1);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(truncateText(kpi.value, 34), x + 3.2, y + 10.8);

      const subText = kpi.subValue || kpi.subvalue || kpi.helper;
      if (subText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(71, 85, 105);
        doc.text(truncateText(subText, 48), x + 3.2, y + 14.9);
      }
    });

    const totalRows = Math.ceil(kpis.length / cols);
    currentY += totalRows * (cardH + 2.5) + 2;
  }

  // Chart Canvas — scaled cleanly to landscape printable height strictly above the institutional footer
  const rendered = renderSingleIndicatorChartCanvas(chart);
  const naturalH = (contentWidth * rendered.height) / rendered.width;
  let remainingSpace = lh.contentBottom - currentY;

  if (remainingSpace < 54) {
    doc.addPage();
    currentY = continuationTopMargin;
    remainingSpace = lh.contentBottom - currentY;
  }

  const maxChartH = Math.min(remainingSpace - 2, 102);
  const finalChartH = Math.min(naturalH, Math.max(46, maxChartH));
  const finalChartW = Math.min(contentWidth, (finalChartH * rendered.width) / rendered.height);
  const chartX = margin + (contentWidth - finalChartW) / 2;

  doc.addImage(rendered.dataUrl, 'PNG', chartX, currentY, finalChartW, finalChartH, undefined, 'FAST');
  currentY += finalChartH + 5;

  // Optional Table (full landscape width, balanced columns, automatic multi-page letterhead & headers)
  if (table && table.rows.length > 0) {
    if (currentY + 26 > lh.contentBottom) {
      doc.addPage();
      currentY = continuationTopMargin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(15, 23, 42);
    doc.text(truncateText(table.title.toUpperCase(), 125), margin, currentY);
    currentY += 3;

    const colCount = table.headers.length;
    const headFontSize = colCount >= 10 ? 6.6 : colCount >= 8 ? 7.0 : 7.5;
    const bodyFontSize = colCount >= 10 ? 6.4 : colCount >= 8 ? 6.8 : 7.3;

    autoTable(doc, {
      startY: currentY,
      head: [table.headers],
      body: table.rows,
      theme: 'striped',
      showHead: 'everyPage',
      tableWidth: contentWidth,
      margin: { left: margin, right: margin, top: continuationTopMargin, bottom: footerBottomMargin },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: headFontSize,
        fontStyle: 'bold',
        valign: 'middle',
        cellPadding: 2.2
      },
      styles: {
        fontSize: bodyFontSize,
        cellPadding: 2,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
        valign: 'middle'
      },
      columnStyles: buildSingleIndicatorColumnStyles(table.headers)
    });
  }

  drawContinuationAndPageNumbers(doc, lh, {
    title,
    rightHeaderText: `${filters.location} • ${filters.periodLabel}`,
    footerLeftText: `Indicador Individual: ${truncateText(title, 75)} • ${filters.location} • ${nowStr}`
  });

  const safeSlug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  doc.save(fileName || `Indicador_${safeSlug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Prints ONLY the selected indicator in mandatory A4 landscape orientation (title, KPIs, rendered chart,
 * period, filters, and optional table) using a hidden iframe so it works seamlessly without window.open
 */
export function printSingleIndicator(params: SingleIndicatorExportParams): void {
  const { groupName, letterheadImage, filters, kpis, chart, table } = params;
  const title = params.title || params.indicatorTitle || chart.title || 'Indicador';
  const subtitle = params.subtitle || params.indicatorSubtitle || chart.subtitle;
  const rendered = renderSingleIndicatorChartCanvas(chart);
  const nowStr = new Date().toLocaleString('pt-BR');

  const existingFrame = document.getElementById('single-indicator-print-frame');
  if (existingFrame && existingFrame.parentNode) {
    existingFrame.parentNode.removeChild(existingFrame);
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'single-indicator-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const kpisHtml = (kpis || [])
    .map(k => {
      const subText = k.subValue || k.subvalue || k.helper;
      return `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(k.label)}</div>
        <div class="kpi-val">${escapeHtml(k.value)}</div>
        ${subText ? `<div class="kpi-sub">${escapeHtml(subText)}</div>` : ''}
      </div>
    `;
    })
    .join('');

  const alignments = table ? table.headers.map(h => inferColumnAlignment(h)) : [];
  const tableHtml =
    table && table.rows.length > 0
      ? `
      <div class="table-section">
        <h3 class="table-title">${escapeHtml(table.title)}</h3>
        <table class="data-table">
          <thead>
            <tr>
              ${table.headers
                .map((h, i) => `<th style="text-align:${alignments[i] || 'left'};">${escapeHtml(h)}</th>`)
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${table.rows
              .slice(0, 60)
              .map(
                (r, idx) => `
                <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
                  ${r
                    .map(
                      (c, i) =>
                        `<td style="text-align:${alignments[i] || 'left'};">${escapeHtml(String(c ?? ''))}</td>`
                    )
                    .join('')}
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
      : '';

  const printLh = getPrintLetterheadLayout('landscape', letterheadImage);

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          ${printLh.css}
          .editorial-header {
            background: transparent;
            padding: 0 0 7px 0;
            border-bottom: 1px solid #cbd5e1;
            position: relative;
            margin-bottom: 8px;
          }
          .editorial-header::after {
            content: '';
            position: absolute;
            left: 0;
            bottom: -1px;
            width: 32mm;
            height: 2px;
            background: #3e99a6;
          }
          .editorial-kicker-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 3px;
          }
          .editorial-kicker {
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #3e99a6;
          }
          .editorial-emission {
            font-size: 9px;
            color: #64748b;
          }
          .editorial-title {
            font-size: 16px;
            font-weight: 800;
            color: #0e4d64;
            line-height: 1.2;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px 14px;
            padding: 6px 0 8px 0;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 8px;
          }
          .meta-label {
            font-size: 7.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.03em;
          }
          .meta-value {
            font-size: 10px;
            color: #1e293b;
            margin-top: 1px;
          }
          .meta-note {
            border-left: 2px solid #92400e;
            padding-left: 7px;
            font-size: 9.5px;
            color: #92400e;
            margin: 4px 0 6px 0;
          }
          .subtitle { font-size: 9.5px; color: #475569; font-style: italic; margin-bottom: 8px; }
          .subtitle strong { font-style: normal; color: #0e4d64; }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(${Math.min(4, Math.max(1, (kpis || []).length))}, 1fr);
            gap: 8px;
            margin-bottom: 9px;
          }
          .kpi-card {
            border: 1px solid #cbd5e1;
            border-top: 3px solid #2563eb;
            border-radius: 7px;
            padding: 7px 10px;
            background: #fff;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .kpi-label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; }
          .kpi-val { font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 3px; }
          .kpi-sub { font-size: 9px; color: #475569; margin-top: 2px; }
          .chart-wrap {
            text-align: center;
            margin-top: 4px;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .chart-wrap img {
            max-width: 100%;
            max-height: 92mm;
            width: auto;
            height: auto;
            object-fit: contain;
            border-radius: 7px;
          }
          .table-section { margin-top: 12px; }
          .table-title {
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
            text-transform: uppercase;
            margin: 0 0 6px;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.8px;
            table-layout: auto;
          }
          .data-table thead { display: table-header-group; }
          .data-table tr { break-inside: avoid; page-break-inside: avoid; }
          .data-table th {
            background: #1e3a8a;
            color: #fff;
            padding: 5px 7px;
            border: 1px solid #cbd5e1;
            font-weight: 700;
            word-break: break-word;
          }
          .data-table td {
            padding: 4.5px 7px;
            border: 1px solid #e2e8f0;
            color: #1e293b;
            word-break: break-word;
            overflow-wrap: anywhere;
          }
          .row-even { background: #ffffff; }
          .row-odd { background: #f8fafc; }
        </style>
      </head>
      <body>
        ${printLh.backgroundHtml}
        <table class="print-layout-table">
          <thead>
            <tr><td><div class="print-header-spacer"></div></td></tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="print-content-shell">
                  <div class="editorial-header">
                    <div class="editorial-kicker-row">
                      <div class="editorial-kicker">${groupName ? `${escapeHtml(groupName)} • ` : ''}Unidade Responsável: ${escapeHtml(filters.location)}</div>
                      <div class="editorial-emission">Emitido em ${escapeHtml(nowStr)}</div>
                    </div>
                    <div class="editorial-title">${escapeHtml(title)}</div>
                  </div>

                  <div class="meta-grid">
                    <div><div class="meta-label">Período Analisado</div><div class="meta-value">${escapeHtml(filters.periodLabel)}</div></div>
                    <div><div class="meta-label">Unidade</div><div class="meta-value">${escapeHtml(filters.location)}</div></div>
                    <div><div class="meta-label">Setor</div><div class="meta-value">${escapeHtml(filters.sectorFilter)}</div></div>
                    <div><div class="meta-label">Categoria</div><div class="meta-value">${escapeHtml(filters.categoryFilter)}</div></div>
                    <div><div class="meta-label">Material</div><div class="meta-value">${escapeHtml(filters.materialFilter)}</div></div>
                    <div><div class="meta-label">Data de Emissão</div><div class="meta-value">${escapeHtml(nowStr)}</div></div>
                  </div>
                  ${filters.medicamentosNote ? `<div class="meta-note"><strong>Observação:</strong> ${escapeHtml(filters.medicamentosNote)}</div>` : ''}

                  ${
                    subtitle
                      ? `<div class="subtitle"><strong>Metodologia:</strong> ${escapeHtml(subtitle)}</div>`
                      : ''
                  }

                  ${kpis && kpis.length > 0 ? `<div class="kpi-grid">${kpisHtml}</div>` : ''}

                  <div class="chart-wrap">
                    <img id="chart-img" src="${rendered.dataUrl}" />
                  </div>

                  ${tableHtml}
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td><div class="print-footer-spacer"></div></td></tr>
          </tfoot>
        </table>
      </body>
    </html>
  `;

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();

    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Erro ao acionar impressão:', e);
      }
    };

    const imgs = Array.from(doc.querySelectorAll('img'));
    const pending = imgs.filter(img => !img.complete);
    if (pending.length === 0) {
      setTimeout(triggerPrint, 180);
    } else {
      let remaining = pending.length;
      const onImgDone = () => {
        remaining -= 1;
        if (remaining <= 0) {
          setTimeout(triggerPrint, 120);
        }
      };
      pending.forEach(img => {
        img.onload = onImgDone;
        img.onerror = onImgDone;
      });
      setTimeout(triggerPrint, 1200);
    }
  }
}

