import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PDFReportFilterSummary {
  periodLabel: string;
  location: string;
  sectorFilter: string;
  categoryFilter: string;
  materialFilter: string;
  generatedBy?: string;
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
function renderTimelineChartCanvas(data: PDFTimePoint[]): string {
  const W = 800;
  const H = 310;
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  // Header
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px Helvetica, Arial, sans-serif';
  ctx.fillText('Evolução de Entradas e Saídas no Período (Unidades)', 20, 28);

  // Legend on top-right
  const legY = 18;
  drawRoundRect(ctx, W - 230, legY, 12, 12, 3, '#10b981');
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  ctx.fillText('Entradas', W - 212, legY + 10);

  drawRoundRect(ctx, W - 135, legY, 12, 12, 3, '#2563eb');
  ctx.fillStyle = '#334155';
  ctx.fillText('Saídas / Consumo', W - 117, legY + 10);

  if (!data || data.length === 0) {
    drawRoundRect(ctx, 20, 50, W - 40, H - 70, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhuma movimentação registrada para os filtros selecionados neste período.', W / 2, H / 2 + 10);
    return canvas.toDataURL('image/png', 1.0);
  }

  const displayData = data.slice(-14); // Max 14 buckets for clean legibility
  const chartLeft = 58;
  const chartRight = W - 24;
  const chartTop = 52;
  const chartBottom = H - 48;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  const maxVal = Math.max(
    10,
    ...displayData.map(d => Math.max(d.entries || 0, d.exits || 0))
  );

  // Horizontal grid lines & Y axis labels
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
  const barW = Math.min(22, Math.max(8, (groupW - 14) / 2));

  displayData.forEach((pt, idx) => {
    const centerX = chartLeft + groupW * idx + groupW / 2;

    // Entries Bar
    const entH = maxVal > 0 ? ((pt.entries || 0) / maxVal) * chartH : 0;
    const entX = centerX - barW - 2;
    const entY = chartBottom - entH;
    if (entH > 0) {
      drawRoundRect(ctx, entX, entY, barW, Math.max(2, entH), 3, '#10b981');
      if (pt.entries > 0) {
        ctx.fillStyle = '#047857';
        ctx.font = 'bold 9px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatInt(pt.entries), entX + barW / 2, Math.max(chartTop - 4, entY - 4));
      }
    }

    // Exits Bar
    const extH = maxVal > 0 ? ((pt.exits || 0) / maxVal) * chartH : 0;
    const extX = centerX + 2;
    const extY = chartBottom - extH;
    if (extH > 0) {
      drawRoundRect(ctx, extX, extY, barW, Math.max(2, extH), 3, '#2563eb');
      if (pt.exits > 0) {
        ctx.fillStyle = '#1d4ed8';
        ctx.font = 'bold 9px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatInt(pt.exits), extX + barW / 2, Math.max(chartTop - 4, extY - 4));
      }
    }

    // X Axis Label
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 9.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(truncateText(pt.label, 10), centerX, chartBottom + 16);
  });

  // Totals Footer Summary inside chart
  const totalEnt = data.reduce((a, b) => a + (b.entries || 0), 0);
  const totalExt = data.reduce((a, b) => a + (b.exits || 0), 0);
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Total no período: Entradas = ${formatInt(totalEnt)} un  |  Saídas = ${formatInt(totalExt)} un`,
    chartLeft,
    H - 10
  );

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Chart 2: Situação do Estoque Consolidado (Horizontal Status Breakdown)
 */
function renderStockStatusChartCanvas(summary: PDFStockStatusSummary): string {
  const W = 800;
  const H = 250;
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px Helvetica, Arial, sans-serif';
  ctx.fillText('Situação Atual do Estoque Consolidado (Materiais e Validades)', 20, 28);

  const items = [
    {
      label: 'Materiais com Estoque Regular (Acima do Mínimo)',
      value: summary.regularCount,
      color: '#10b981',
      bg: '#ecfdf5',
      unit: 'materiais'
    },
    {
      label: 'Materiais com Estoque Baixo (≤ Estoque Mínimo)',
      value: summary.lowStockCount,
      color: '#f59e0b',
      bg: '#fffbeb',
      unit: 'materiais'
    },
    {
      label: 'Materiais Zerados / Em Ruptura (Saldo = 0)',
      value: summary.zeroStockCount,
      color: '#e11d48',
      bg: '#fff1f2',
      unit: 'materiais'
    },
    {
      label: 'Lotes com Validade Próxima (Vencem em até 60 dias)',
      value: summary.expiring60dBatchesCount,
      color: '#d97706',
      bg: '#fef3c7',
      unit: 'lotes'
    },
    {
      label: 'Lotes com Saldo Vencido Hoje',
      value: summary.expiredBatchesCount,
      color: '#be123c',
      bg: '#ffe4e6',
      unit: 'lotes'
    }
  ];

  const maxVal = Math.max(10, ...items.map(i => i.value));
  const startY = 48;
  const rowH = 36;
  const labelW = 310;
  const barLeft = 330;
  const barMaxW = W - barLeft - 110;

  items.forEach((it, idx) => {
    const y = startY + idx * rowH;

    // Color dot + Label
    drawRoundRect(ctx, 20, y + 6, 10, 10, 3, it.color);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(it.label, 38, y + 15);

    // Track
    drawRoundRect(ctx, barLeft, y + 3, barMaxW, 16, 5, '#f1f5f9');

    // Fill Bar
    const fillW = maxVal > 0 ? Math.max(it.value > 0 ? 8 : 0, (it.value / maxVal) * barMaxW) : 0;
    if (fillW > 0) {
      drawRoundRect(ctx, barLeft, y + 3, fillW, 16, 5, it.color);
    }

    // Value label on right
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${formatInt(it.value)} ${it.unit}`, W - 20, y + 15);
  });

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Chart 3: Consumo por Setor (Horizontal Ranking Bar Chart)
 */
function renderSectorChartCanvas(sectors: PDFSectorPoint[], isAdmin = true): string {
  const topSectors = sectors.slice(0, 8);
  const W = 800;
  const H = Math.max(210, 70 + Math.max(1, topSectors.length) * 32);
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Consumo por Setor no Período (Top Setores Demandantes)', 20, 28);

  if (topSectors.length === 0) {
    drawRoundRect(ctx, 20, 44, W - 40, H - 64, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhum consumo setorial registrado para os filtros selecionados.', W / 2, H / 2 + 8);
    return canvas.toDataURL('image/png', 1.0);
  }

  const totalUnitsAll = sectors.reduce((a, b) => a + (b.units || 0), 0);
  const maxUnits = Math.max(1, ...topSectors.map(s => s.units || 0));
  const barLeft = 215;
  const barMaxW = W - barLeft - (isAdmin ? 190 : 120);
  const startY = 48;
  const rowH = 30;

  topSectors.forEach((sec, idx) => {
    const y = startY + idx * rowH;
    const pct = totalUnitsAll > 0 ? ((sec.units / totalUnitsAll) * 100).toFixed(1) : '0.0';

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${idx + 1}. ${truncateText(sec.sector, 26)}`, 20, y + 14);

    // Track
    drawRoundRect(ctx, barLeft, y + 2, barMaxW, 15, 4, '#f1f5f9');

    // Bar
    const fillW = Math.max(6, (sec.units / maxUnits) * barMaxW);
    drawRoundRect(ctx, barLeft, y + 2, fillW, 15, 4, idx === 0 ? '#1d4ed8' : idx < 3 ? '#2563eb' : '#3b82f6');

    // Value label
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    const rightLabel = isAdmin
      ? `${formatInt(sec.units)} un (${pct}%) • ${formatBRL(sec.value)}`
      : `${formatInt(sec.units)} un (${pct}%)`;
    ctx.fillText(rightLabel, barLeft + barMaxW + 10, y + 13);
  });

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Chart 4: Distribuição por Categoria (Horizontal Bars + Legend & Share)
 */
function renderCategoryChartCanvas(categories: PDFCategoryPoint[], isAdmin = true): string {
  const topCats = categories.slice(0, 8);
  const W = 800;
  const H = Math.max(210, 70 + Math.max(1, topCats.length) * 32);
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Distribuição por Categoria de Material (Consumo e Estoque)', 20, 28);

  if (topCats.length === 0) {
    drawRoundRect(ctx, 20, 44, W - 40, H - 64, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhuma categoria com dados para os filtros selecionados.', W / 2, H / 2 + 8);
    return canvas.toDataURL('image/png', 1.0);
  }

  const useConsumed = topCats.some(c => c.consumedUnits > 0);
  const totalMetric = categories.reduce(
    (a, b) => a + (useConsumed ? b.consumedUnits : b.stockUnits),
    0
  );
  const maxMetric = Math.max(
    1,
    ...topCats.map(c => (useConsumed ? c.consumedUnits : c.stockUnits))
  );

  const palette = ['#2563eb', '#4f46e5', '#0891b2', '#059669', '#d97706', '#e11d48', '#7c3aed', '#475569'];
  const barLeft = 220;
  const barMaxW = W - barLeft - (isAdmin ? 205 : 130);
  const startY = 48;
  const rowH = 30;

  topCats.forEach((cat, idx) => {
    const y = startY + idx * rowH;
    const val = useConsumed ? cat.consumedUnits : cat.stockUnits;
    const finVal = useConsumed ? cat.consumedValue : cat.stockValue;
    const pct = totalMetric > 0 ? ((val / totalMetric) * 100).toFixed(1) : '0.0';
    const barColor = cat.color && cat.color.startsWith('#') ? cat.color : palette[idx % palette.length];

    drawRoundRect(ctx, 20, y + 4, 11, 11, 3, barColor);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(truncateText(cat.category, 25), 37, y + 14);

    drawRoundRect(ctx, barLeft, y + 2, barMaxW, 15, 4, '#f1f5f9');
    const fillW = Math.max(val > 0 ? 6 : 0, (val / maxMetric) * barMaxW);
    if (fillW > 0) {
      drawRoundRect(ctx, barLeft, y + 2, fillW, 15, 4, barColor);
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    const textRight = isAdmin
      ? `${formatInt(val)} un (${pct}%) • ${formatBRL(finVal)}`
      : `${formatInt(val)} un (${pct}%) • ${cat.materialsCount} itens`;
    ctx.fillText(textRight, barLeft + barMaxW + 10, y + 13);
  });

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Chart 5: Materiais Mais Requisitados / Consumidos (Top 10 Consolidado sem duplicar lotes)
 */
function renderTopMaterialsChartCanvas(materials: PDFMaterialPoint[]): string {
  const topList = materials.slice(0, 8);
  const W = 800;
  const H = Math.max(220, 76 + Math.max(1, topList.length) * 34);
  const { canvas, ctx } = createHiDPICanvas(W, H);

  drawRoundRect(ctx, 2, 2, W - 4, H - 4, 12, '#ffffff', '#e2e8f0');

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Materiais Mais Requisitados e Consumidos (Lotes Consolidados)', 20, 28);

  // Legend
  drawRoundRect(ctx, W - 245, 16, 11, 11, 3, '#6366f1');
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif';
  ctx.fillText('Requisitado', W - 229, 25);

  drawRoundRect(ctx, W - 145, 16, 11, 11, 3, '#0284c7');
  ctx.fillStyle = '#334155';
  ctx.fillText('Consumido / Saída', W - 129, 25);

  if (topList.length === 0) {
    drawRoundRect(ctx, 20, 46, W - 40, H - 66, 8, '#f8fafc', '#e2e8f0');
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhum material requisitado ou consumido no período com os filtros atuais.', W / 2, H / 2 + 8);
    return canvas.toDataURL('image/png', 1.0);
  }

  const maxVal = Math.max(
    1,
    ...topList.map(m => Math.max(m.requestedUnits || 0, m.consumedUnits || 0))
  );

  const barLeft = 250;
  const barMaxW = W - barLeft - 155;
  const startY = 50;
  const rowH = 33;

  topList.forEach((mat, idx) => {
    const y = startY + idx * rowH;

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${idx + 1}º ${truncateText(mat.name, 32)}`, 20, y + 15);

    // Requested bar (top thin bar)
    drawRoundRect(ctx, barLeft, y + 2, barMaxW, 8, 2, '#f1f5f9');
    const reqW = maxVal > 0 ? Math.max(mat.requestedUnits > 0 ? 4 : 0, (mat.requestedUnits / maxVal) * barMaxW) : 0;
    if (reqW > 0) {
      drawRoundRect(ctx, barLeft, y + 2, reqW, 8, 2, '#6366f1');
    }

    // Consumed bar (bottom thin bar)
    drawRoundRect(ctx, barLeft, y + 12, barMaxW, 8, 2, '#f1f5f9');
    const consW = maxVal > 0 ? Math.max(mat.consumedUnits > 0 ? 4 : 0, (mat.consumedUnits / maxVal) * barMaxW) : 0;
    if (consW > 0) {
      drawRoundRect(ctx, barLeft, y + 12, consW, 8, 2, '#0284c7');
    }

    // Values
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 9.5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Req: ${formatInt(mat.requestedUnits)} | Saída: ${formatInt(mat.consumedUnits)} un`,
      barLeft + barMaxW + 8,
      y + 14
    );
  });

  return canvas.toDataURL('image/png', 1.0);
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
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const nowStr = new Date().toLocaleString('pt-BR');

  // Helper to draw page header
  const drawHeader = (isFirstPage: boolean): number => {
    let y = 10;

    if (isFirstPage && letterheadImage) {
      try {
        const imgFormat = letterheadImage.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(letterheadImage, imgFormat, margin, 8, contentWidth, 24, undefined, 'FAST');
        y = 35;
      } catch {
        y = 12;
      }
    }

    if (!letterheadImage || !isFirstPage) {
      // Clean institutional banner
      doc.setFillColor(15, 23, 42); // Slate-900
      doc.roundedRect(margin, y, contentWidth, isFirstPage ? 18 : 12, 2, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isFirstPage ? 11.5 : 9);
      doc.text(title.toUpperCase(), margin + 4, y + (isFirstPage ? 7.5 : 7.5));

      if (isFirstPage) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(191, 219, 254);
        doc.text(
          subtitle || `Unidade: ${filters.location} • Emitido em: ${nowStr}`,
          margin + 4,
          y + 13.5
        );
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(203, 213, 225);
        doc.text(`${filters.location} • ${filters.periodLabel}`, pageWidth - margin - 4, y + 7.5, {
          align: 'right'
        });
      }

      y += isFirstPage ? 22 : 16;
    } else {
      // Title below custom letterhead on page 1
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(title.toUpperCase(), pageWidth / 2, y + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        subtitle || `Unidade: ${filters.location} • Emitido em: ${nowStr}`,
        pageWidth / 2,
        y + 9.5,
        { align: 'center' }
      );
      y += 14;
    }

    return y;
  };

  let currentY = drawHeader(true);

  const ensureSpace = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - 16) {
      doc.addPage();
      currentY = drawHeader(false);
    }
  };

  // --- 1. APPLIED FILTERS SUMMARY BOX ---
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY, contentWidth, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 58, 138);
  doc.text('PARÂMETROS E FILTROS APLICADOS NO RELATÓRIO', margin + 4, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  const filterLine1 = `Período Analisado: ${filters.periodLabel}   |   Unidade: ${filters.location}   |   Setor: ${filters.sectorFilter}`;
  const filterLine2 = `Categoria: ${filters.categoryFilter}   |   Material: ${filters.materialFilter}   |   Data de Emissão: ${nowStr}`;
  doc.text(truncateText(filterLine1, 115), margin + 4, currentY + 10.5);
  doc.text(truncateText(filterLine2, 115), margin + 4, currentY + 15.2);

  currentY += 22;

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
  const cardH = 19;

  kpiCards.forEach((card, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const x = margin + col * (cardW + 3);
    const y = currentY + row * (cardH + 3);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardW, cardH, 1.8, 1.8, 'FD');

    // Top accent bar
    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.rect(x, y, cardW, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(card.title, x + 2.5, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(truncateText(card.main, 22), x + 2.5, y + 11.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(truncateText(card.sub, 32), x + 2.5, y + 16.2);
  });

  currentY += cardH * 2 + 9;

  // --- 3. VISUAL CHARTS SECTION ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. PAINEL GRÁFICO DE MOVIMENTAÇÃO, ESTOQUE, SETORES E CATEGORIAS', margin, currentY);
  currentY += 3;

  // Chart 1: Timeline (Entradas e Saídas)
  const timelineImg = renderTimelineChartCanvas(timelineData);
  const timelineH = (contentWidth * 310) / 800;
  ensureSpace(timelineH + 4);
  doc.addImage(timelineImg, 'PNG', margin, currentY, contentWidth, timelineH, undefined, 'FAST');
  currentY += timelineH + 5;

  // Chart 2: Stock Status Summary
  const stockStatusImg = renderStockStatusChartCanvas(stockStatusSummary);
  const stockStatusH = (contentWidth * 250) / 800;
  ensureSpace(stockStatusH + 4);
  doc.addImage(stockStatusImg, 'PNG', margin, currentY, contentWidth, stockStatusH, undefined, 'FAST');
  currentY += stockStatusH + 5;

  // Chart 3: Sector Consumption
  const secRowsCount = Math.max(1, Math.min(8, sectorData.length));
  const secCanvasH = Math.max(210, 70 + secRowsCount * 32);
  const sectorImg = renderSectorChartCanvas(sectorData, isAdmin);
  const sectorH = (contentWidth * secCanvasH) / 800;
  ensureSpace(sectorH + 4);
  doc.addImage(sectorImg, 'PNG', margin, currentY, contentWidth, sectorH, undefined, 'FAST');
  currentY += sectorH + 5;

  // Chart 4: Category Breakdown
  const catRowsCount = Math.max(1, Math.min(8, categoryData.length));
  const catCanvasH = Math.max(210, 70 + catRowsCount * 32);
  const categoryImg = renderCategoryChartCanvas(categoryData, isAdmin);
  const categoryH = (contentWidth * catCanvasH) / 800;
  ensureSpace(categoryH + 4);
  doc.addImage(categoryImg, 'PNG', margin, currentY, contentWidth, categoryH, undefined, 'FAST');
  currentY += categoryH + 5;

  // Chart 5: Top Requested & Consumed Materials
  const matRowsCount = Math.max(1, Math.min(8, topMaterialsData.length));
  const matCanvasH = Math.max(220, 76 + matRowsCount * 34);
  const topMatImg = renderTopMaterialsChartCanvas(topMaterialsData);
  const topMatH = (contentWidth * matCanvasH) / 800;
  ensureSpace(topMatH + 4);
  doc.addImage(topMatImg, 'PNG', margin, currentY, contentWidth, topMatH, undefined, 'FAST');
  currentY += topMatH + 7;

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
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: 28, bottom: 16 },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'left', fontStyle: 'bold' },
        2: { halign: 'center', cellWidth: 26 },
        3: { halign: 'right', cellWidth: 34, fontStyle: 'bold' },
        4: { halign: 'center', cellWidth: 26 },
        ...(isAdmin ? { 5: { halign: 'right', cellWidth: 34, fontStyle: 'bold' } } : {})
      },
      didDrawPage: data => {
        if (data.pageNumber > 1 && data.cursor && data.cursor.y < 30) {
          drawHeader(false);
        }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
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
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: 28, bottom: 16 },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', fontStyle: 'bold' },
        2: { halign: 'left', cellWidth: 28 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 25, fontStyle: 'bold' },
        ...(isAdmin
          ? {
              5: { halign: 'center', cellWidth: 20 },
              6: { halign: 'right', cellWidth: 28, fontStyle: 'bold' }
            }
          : {})
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
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
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: 28, bottom: 16 },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        textColor: [30, 41, 59],
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
        1: { halign: 'left', cellWidth: 25 },
        2: { halign: 'center', cellWidth: 13 },
        3: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
        4: { halign: 'right', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 20 },
        ...(isAdmin
          ? {
              6: { halign: 'right', cellWidth: 25 },
              7: { halign: 'center', cellWidth: 24, fontStyle: 'bold' }
            }
          : {
              6: { halign: 'center', cellWidth: 26, fontStyle: 'bold' }
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

    currentY = (doc as any).lastAutoTable.finalY + 8;
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
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: 28, bottom: 16 },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59]
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
        1: { halign: 'center', fontStyle: 'bold' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'center' },
        7: { halign: 'center' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // TABLE 5: DOAÇÕES E BAIXAS POR VENCIMENTO (IF PROVIDED)
  if (donationsAndWriteOffsTable && donationsAndWriteOffsTable.length > 0) {
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('7. REGISTROS DE DOAÇÕES EFETIVAS E BAIXAS POR VENCIMENTO / PERDA', margin, currentY);
    currentY += 3;

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
      showHead: 'everyPage',
      margin: { left: margin, right: margin, top: 28, bottom: 16 },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        textColor: [30, 41, 59],
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 26, fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 18 },
        2: { halign: 'left', fontStyle: 'bold' },
        3: { halign: 'left', cellWidth: 22 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'left', cellWidth: 36 },
        6: { halign: 'right', cellWidth: 16, fontStyle: 'bold' },
        7: { halign: 'right', cellWidth: 22 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- 5. ADD HEADERS & PAGE NUMBERS TO ALL PAGES ---
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) {
      drawHeader(false);
    }

    // Footer line & page number
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Relatório Gerencial de Estoque e Indicadores • ${filters.location} • Emitido em ${nowStr}`,
      margin,
      pageHeight - 7.5
    );

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 7.5, {
      align: 'right'
    });
  }

  const defaultFileName = `Relatorio_Indicadores_${filters.location}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName || defaultFileName);
}
