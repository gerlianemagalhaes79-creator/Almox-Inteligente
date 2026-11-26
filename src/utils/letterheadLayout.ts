import type { jsPDF } from 'jspdf';

export const OFFICIAL_LETTERHEAD_URL = '/official_letterhead.png';
export const OFFICIAL_LOGO_POLICLINICA_URL = '/letterhead_logo_policlinica.png';
export const OFFICIAL_LOGO_CPSMS_URL = '/letterhead_logo_cpsms.png';

export const INSTITUTIONAL_FOOTER_TEXT =
  'Policlínica Bernardo Félix da Silva  •  Av. Monsenhor Aloísio Pinto, 481, Dom Expedito — CEP 62050-255, Sobral - Ceará  •  Fone: (88) 3614-3156  •  Fax: (88) 3614-3245';

export interface LogoAsset {
  dataUrl: string;
  width: number;
  height: number;
  format: 'PNG' | 'JPEG';
}

export interface LetterheadInfo {
  dataUrl: string;
  width: number;
  height: number;
  format: 'PNG' | 'JPEG';
  /** True when the image represents a full A4 sheet (header + body + footer) rather than a thin banner strip */
  isFullPage: boolean;
  /** Normalized vertical ratio (0..1) where the top institutional header ink ends */
  headerBottomRatio: number;
  /** Normalized vertical ratio (0..1) where the bottom institutional footer ink starts */
  footerTopRatio: number;
  /** Optional cropped top-left logo extracted from a custom vertical letterhead for landscape composition */
  extractedLeftLogo?: LogoAsset;
  /** Optional cropped top-right logo extracted from a custom vertical letterhead for landscape composition */
  extractedRightLogo?: LogoAsset;
}

export interface LetterheadPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LandscapeCompositionMetrics {
  leftLogo: { asset: LogoAsset; rect: LetterheadPlacement } | null;
  rightLogo: { asset: LogoAsset; rect: LetterheadPlacement } | null;
  headerDividerY: number;
  footerDividerY: number;
  footerTextY: number;
  footerText: string;
}

export interface LetterheadLayoutMetrics {
  hasLetterhead: boolean;
  isFullPage: boolean;
  /** Layout mode: 'portrait-full' (original vertical background), 'landscape-composed' (horizontal A4 composition), 'banner', or 'none' */
  mode: 'portrait-full' | 'landscape-composed' | 'banner' | 'none';
  pageWidth: number;
  pageHeight: number;
  marginLeft: number;
  marginRight: number;
  contentWidth: number;
  /** Safe Y (mm) where page 1 content begins, strictly below the institutional header logos */
  contentTop: number;
  /** Safe Y (mm) where continuation pages (2..N) content/tables begin (below institutional logos + continuation strip) */
  continuationTop: number;
  /** Safe bottom margin (mm) reserved for the institutional footer so content never overlaps it */
  marginBottom: number;
  /** Maximum Y (mm) allowed for content before breaking to next page (pageHeight - marginBottom) */
  contentBottom: number;
  /** Safe Y (mm) for the "Página X de Y" page indicator, strictly below the institutional footer */
  pageNumberY: number;
  placement: LetterheadPlacement | null;
  landscapeComposition?: LandscapeCompositionMetrics | null;
}

// Measured defaults for the official Policlínica de Sobral / CPSMS A4 letterhead (1414x2000px):
// Header logos span 4.6%..10.0% of height; Footer address spans 90.7%..94.85% of height.
const DEFAULT_PORTRAIT_HEADER_BOTTOM_RATIO = 0.102;
const DEFAULT_PORTRAIT_FOOTER_TOP_RATIO = 0.905;
const DEFAULT_LANDSCAPE_HEADER_BOTTOM_RATIO = 0.12;
const DEFAULT_LANDSCAPE_FOOTER_TOP_RATIO = 0.895;

// Original official letterhead physical pixel-to-mm density on A4 portrait: 210mm / 1414px = 0.148515 mm/px.
// Using 90% of original printed portrait physical size preserves exact relative proportions between
// Policlínica de Sobral and CPSMS while fitting A4 landscape (210mm height) with crisp balance.
const LANDSCAPE_LOGO_MM_PER_PX = (210 / 1414) * 0.9;

const analysisCache = new Map<string, LetterheadInfo>();
let officialLetterheadDataUrl: string | null = null;
let officialLeftLogoAsset: LogoAsset | null = null;
let officialRightLogoAsset: LogoAsset | null = null;
let officialPreloadPromise: Promise<LetterheadInfo | null> | null = null;

function cacheKey(src: string): string {
  return src.length > 160 ? `${src.slice(0, 80)}__${src.length}__${src.slice(-40)}` : src;
}

function decodeBase64Prefix(b64: string, maxBytes: number): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  const charCount = Math.min(clean.length, Math.ceil(maxBytes / 3) * 4);
  const slice = clean.slice(0, charCount);

  if (typeof atob === 'function') {
    const bin = atob(slice);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      arr[i] = bin.charCodeAt(i);
    }
    return arr;
  }

  // Node.js fallback (used during automated PDF verification scripts)
  const g = globalThis as any;
  if (g.Buffer) {
    return new Uint8Array(g.Buffer.from(slice, 'base64'));
  }
  return new Uint8Array(0);
}

/**
 * Synchronously parses exact natural pixel dimensions and image format from a PNG/JPEG data URL.
 * Guarantees 100% aspect-ratio accuracy even in synchronous PDF export handlers.
 */
export function parseImageDimensionsSync(dataUrl: string): {
  width: number;
  height: number;
  format: 'PNG' | 'JPEG';
} {
  const isJpeg = /^data:image\/jpe?g/i.test(dataUrl);
  const format: 'PNG' | 'JPEG' = isJpeg ? 'JPEG' : 'PNG';
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    return { width: 1414, height: 2000, format };
  }
  const b64 = dataUrl.slice(commaIdx + 1);

  try {
    // PNG: 8-byte signature + IHDR chunk (width at bytes 16..19, height at bytes 20..23)
    const head = decodeBase64Prefix(b64, 64);
    if (
      head.length >= 24 &&
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47
    ) {
      const width = ((head[16] << 24) | (head[17] << 16) | (head[18] << 8) | head[19]) >>> 0;
      const height = ((head[20] << 24) | (head[21] << 16) | (head[22] << 8) | head[23]) >>> 0;
      if (width > 0 && height > 0) {
        return { width, height, format: 'PNG' };
      }
    }

    // JPEG: scan SOF0/SOF1/SOF2 markers within first 64KB
    if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) {
      const jpegBytes = decodeBase64Prefix(b64, 65536);
      let offset = 2;
      while (offset + 9 < jpegBytes.length) {
        if (jpegBytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = jpegBytes[offset + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = (jpegBytes[offset + 5] << 8) | jpegBytes[offset + 6];
          const width = (jpegBytes[offset + 7] << 8) | jpegBytes[offset + 8];
          if (width > 0 && height > 0) {
            return { width, height, format: 'JPEG' };
          }
          break;
        }
        if (marker === 0xd9 || marker === 0xda) break;
        const segLen = (jpegBytes[offset + 2] << 8) | jpegBytes[offset + 3];
        if (segLen < 2) break;
        offset += 2 + segLen;
      }
    }
  } catch {
    // Fallback to official A4 portrait dimensions
  }

  return { width: 1414, height: 2000, format };
}

/**
 * Registers preloaded official horizontal logo assets (used automatically in browser preload
 * and available for headless/Node PDF verification).
 */
export function registerOfficialLandscapeLogos(
  leftLogoDataUrl: string | null,
  rightLogoDataUrl: string | null
): void {
  if (leftLogoDataUrl && leftLogoDataUrl.startsWith('data:image/')) {
    const dims = parseImageDimensionsSync(leftLogoDataUrl);
    officialLeftLogoAsset = { dataUrl: leftLogoDataUrl, ...dims };
  }
  if (rightLogoDataUrl && rightLogoDataUrl.startsWith('data:image/')) {
    const dims = parseImageDimensionsSync(rightLogoDataUrl);
    officialRightLogoAsset = { dataUrl: rightLogoDataUrl, ...dims };
  }
}

/**
 * Synchronously returns LetterheadInfo (using cached pixel-scanned metrics if available,
 * otherwise exact header-parsed dimensions + calibrated A4 letterhead safe bands).
 */
export function analyzeLetterheadSync(dataUrl: string): LetterheadInfo {
  const key = cacheKey(dataUrl);
  const cached = analysisCache.get(key);
  if (cached) return cached;

  const { width, height, format } = parseImageDimensionsSync(dataUrl);
  const aspect = width / Math.max(1, height);
  // A full-page letterhead (portrait A4 ~0.707 or landscape A4 ~1.414) has aspect <= 1.85.
  // Wide thin header strips (e.g. 1200x160 => aspect 7.5) are treated as proportional top banners.
  const isFullPage = aspect <= 1.85;
  const isLandscapeImg = aspect >= 1.12;

  const info: LetterheadInfo = {
    dataUrl,
    width,
    height,
    format,
    isFullPage,
    headerBottomRatio: isFullPage
      ? isLandscapeImg
        ? DEFAULT_LANDSCAPE_HEADER_BOTTOM_RATIO
        : DEFAULT_PORTRAIT_HEADER_BOTTOM_RATIO
      : 1,
    footerTopRatio: isFullPage
      ? isLandscapeImg
        ? DEFAULT_LANDSCAPE_FOOTER_TOP_RATIO
        : DEFAULT_PORTRAIT_FOOTER_TOP_RATIO
      : 1
  };

  analysisCache.set(key, info);
  return info;
}

/**
 * Crops a clean rectangular region from an already-loaded HTMLImageElement at full native resolution.
 */
function cropNativeRegionToAsset(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): LogoAsset | undefined {
  if (sw < 16 || sh < 12) return undefined;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL('image/png');
    return { dataUrl, width: sw, height: sh, format: 'PNG' };
  } catch {
    return undefined;
  }
}

/**
 * Scans the rendered image on an offscreen canvas (browser only) to find exact top header
 * and bottom footer ink positions — and for vertical full-page letterheads, also extracts
 * clean native-resolution left & right header logos so landscape exports compose horizontally
 * without ever using the vertical page as background.
 */
function scanInkBandsInBrowser(dataUrl: string): Promise<LetterheadInfo> {
  const baseInfo = analyzeLetterheadSync(dataUrl);
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(baseInfo);
  }

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const natW = img.naturalWidth || baseInfo.width;
        const natH = img.naturalHeight || baseInfo.height;
        const aspect = natW / Math.max(1, natH);
        const isFullPage = aspect <= 1.85;

        let headerBottomRatio = baseInfo.headerBottomRatio;
        let footerTopRatio = baseInfo.footerTopRatio;
        let extractedLeftLogo = baseInfo.extractedLeftLogo;
        let extractedRightLogo = baseInfo.extractedRightLogo;

        if (isFullPage) {
          const sampleH = Math.min(500, natH);
          const sampleW = Math.max(1, Math.round((natW / natH) * sampleH));
          const canvas = document.createElement('canvas');
          canvas.width = sampleW;
          canvas.height = sampleH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sampleW, sampleH);
            ctx.drawImage(img, 0, 0, sampleW, sampleH);
            const pixels = ctx.getImageData(0, 0, sampleW, sampleH).data;

            const topLimit = Math.floor(sampleH * 0.28);
            const bottomStart = Math.floor(sampleH * 0.72);
            let detectedTopMax = -1;
            let detectedBotMin = -1;

            for (let y = 0; y < topLimit; y++) {
              for (let x = 0; x < sampleW; x++) {
                const i = (y * sampleW + x) * 4;
                if (pixels[i] < 242 || pixels[i + 1] < 242 || pixels[i + 2] < 242) {
                  detectedTopMax = y;
                  break;
                }
              }
            }

            for (let y = bottomStart; y < sampleH; y++) {
              let rowHasInk = false;
              for (let x = 0; x < sampleW; x++) {
                const i = (y * sampleW + x) * 4;
                if (pixels[i] < 242 || pixels[i + 1] < 242 || pixels[i + 2] < 242) {
                  rowHasInk = true;
                  break;
                }
              }
              if (rowHasInk) {
                detectedBotMin = y;
                break;
              }
            }

            if (detectedTopMax >= 0) {
              headerBottomRatio = Math.min(0.24, Math.max(0.06, (detectedTopMax + 2) / sampleH));
            }
            if (detectedBotMin >= 0) {
              footerTopRatio = Math.max(0.82, Math.min(0.96, (detectedBotMin - 2) / sampleH));
            }

            // For vertical full-page letterheads, detect distinct top-left & top-right header logos
            // and crop them at 100% native pixel resolution for crisp A4 landscape composition.
            if (natW < natH && detectedTopMax > 4) {
              const bandYMax = Math.min(sampleH - 1, detectedTopMax + 3);
              const findHalfBox = (xStart: number, xEnd: number) => {
                let minX = xEnd;
                let maxX = xStart;
                let minY = bandYMax;
                let maxY = 0;
                let found = false;
                for (let y = 0; y <= bandYMax; y++) {
                  for (let x = xStart; x < xEnd; x++) {
                    const i = (y * sampleW + x) * 4;
                    if (pixels[i] < 242 || pixels[i + 1] < 242 || pixels[i + 2] < 242) {
                      found = true;
                      if (x < minX) minX = x;
                      if (x > maxX) maxX = x;
                      if (y < minY) minY = y;
                      if (y > maxY) maxY = y;
                    }
                  }
                }
                return found ? { minX, maxX, minY, maxY } : null;
              };

              const midX = Math.floor(sampleW * 0.5);
              const leftBox = findHalfBox(0, midX);
              const rightBox = findHalfBox(midX, sampleW);

              // Ensure both halves have clear independent logo blocks separated by whitespace
              if (leftBox && rightBox && rightBox.minX - leftBox.maxX >= Math.max(6, sampleW * 0.04)) {
                const scaleX = natW / sampleW;
                const scaleY = natH / sampleH;
                const pad = 4;

                const lX0 = Math.max(0, Math.floor(leftBox.minX * scaleX) - pad);
                const lY0 = Math.max(0, Math.floor(leftBox.minY * scaleY) - pad);
                const lX1 = Math.min(natW, Math.ceil((leftBox.maxX + 1) * scaleX) + pad);
                const lY1 = Math.min(natH, Math.ceil((leftBox.maxY + 1) * scaleY) + pad);

                const rX0 = Math.max(0, Math.floor(rightBox.minX * scaleX) - pad);
                const rY0 = Math.max(0, Math.floor(rightBox.minY * scaleY) - pad);
                const rX1 = Math.min(natW, Math.ceil((rightBox.maxX + 1) * scaleX) + pad);
                const rY1 = Math.min(natH, Math.ceil((rightBox.maxY + 1) * scaleY) + pad);

                extractedLeftLogo = cropNativeRegionToAsset(img, lX0, lY0, lX1 - lX0, lY1 - lY0);
                extractedRightLogo = cropNativeRegionToAsset(img, rX0, rY0, rX1 - rX0, rY1 - rY0);
              }
            }
          }
        }

        const updated: LetterheadInfo = {
          ...baseInfo,
          width: natW,
          height: natH,
          isFullPage,
          headerBottomRatio,
          footerTopRatio,
          extractedLeftLogo,
          extractedRightLogo
        };
        analysisCache.set(cacheKey(dataUrl), updated);
        resolve(updated);
      } catch {
        resolve(baseInfo);
      }
    };
    img.onerror = () => resolve(baseInfo);
    img.src = dataUrl;
  });
}

function fetchUrlAsDataUrl(url: string): Promise<string | null> {
  return fetch(url)
    .then(res => (res.ok ? res.blob() : null))
    .then(
      blob =>
        new Promise<string | null>(resolve => {
          if (!blob) return resolve(null);
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        })
    )
    .catch(() => null);
}

/**
 * Preloads the official Policlínica de Sobral / CPSMS letterhead PNG (for A4 portrait) AND
 * the lossless extracted original logos (for A4 landscape horizontal composition) into memory
 * so all synchronous PDF exports have immediate access to the full-resolution assets.
 */
export async function preloadLetterheadAsset(
  customSource?: string | null
): Promise<LetterheadInfo | null> {
  if (typeof window === 'undefined') return null;

  // Always preload the official portrait letterhead + lossless horizontal logos in the background
  if (!officialPreloadPromise) {
    officialPreloadPromise = Promise.all([
      fetchUrlAsDataUrl(OFFICIAL_LETTERHEAD_URL),
      fetchUrlAsDataUrl(OFFICIAL_LOGO_POLICLINICA_URL),
      fetchUrlAsDataUrl(OFFICIAL_LOGO_CPSMS_URL)
    ])
      .then(async ([fullDataUrl, leftLogoUrl, rightLogoUrl]) => {
        registerOfficialLandscapeLogos(leftLogoUrl, rightLogoUrl);
        if (!fullDataUrl) return null;
        officialLetterheadDataUrl = fullDataUrl;
        return scanInkBandsInBrowser(fullDataUrl);
      })
      .catch(() => null);
  }

  if (customSource && customSource.startsWith('data:image/')) {
    return scanInkBandsInBrowser(customSource);
  }

  return officialPreloadPromise;
}

// Kick off background preload immediately in browser environments
if (typeof window !== 'undefined') {
  void preloadLetterheadAsset();
}

/**
 * Returns the active letterhead data URL (custom uploaded letterhead if present,
 * otherwise the preloaded official Policlínica de Sobral / CPSMS letterhead PNG).
 */
export function resolveLetterheadDataUrl(customLetterhead?: string | null): string | null {
  if (customLetterhead && customLetterhead.startsWith('data:image/')) {
    return customLetterhead;
  }
  return officialLetterheadDataUrl;
}

/**
 * Returns the image src to use inside HTML/CSS print iframes.
 */
export function resolveLetterheadPrintSrc(customLetterhead?: string | null): string {
  if (customLetterhead && customLetterhead.startsWith('data:image/')) {
    return customLetterhead;
  }
  return officialLetterheadDataUrl || OFFICIAL_LETTERHEAD_URL;
}

/**
 * Resolves the left (Policlínica de Sobral) and right (CPSMS) logo assets for A4 Landscape
 * horizontal composition without distorting or using the full vertical letterhead as background.
 */
function resolveLandscapeLogos(
  customLetterhead?: string | null,
  info?: LetterheadInfo | null
): { left: LogoAsset | null; right: LogoAsset | null } {
  const isCustom = Boolean(customLetterhead && customLetterhead.startsWith('data:image/'));
  if (isCustom && info?.extractedLeftLogo && info?.extractedRightLogo) {
    return { left: info.extractedLeftLogo, right: info.extractedRightLogo };
  }
  if (officialLeftLogoAsset || officialRightLogoAsset) {
    return { left: officialLeftLogoAsset, right: officialRightLogoAsset };
  }
  if (info?.extractedLeftLogo || info?.extractedRightLogo) {
    return {
      left: info.extractedLeftLogo ?? null,
      right: info.extractedRightLogo ?? null
    };
  }
  return { left: null, right: null };
}

/**
 * Computes the dedicated horizontal A4 landscape letterhead composition:
 * - Policlínica de Sobral logo at top-left (proportional, zero distortion)
 * - CPSMS logo at top-right (proportional, zero distortion, exact original relative scale)
 * - Subtle institutional header divider line
 * - Adapted horizontal institutional footer (address & contacts) at bottom
 * - Clean safe content area strictly between header and footer
 */
function computeLandscapeCompositionLayout(
  pageWidth: number,
  pageHeight: number,
  sideMargin: number,
  continuationHeaderHeight: number,
  leftAsset: LogoAsset | null,
  rightAsset: LogoAsset | null
): LetterheadLayoutMetrics {
  const contentWidth = pageWidth - sideMargin * 2;
  const headerTopY = 5.5;
  const maxLogoH = 16.0;
  const maxSingleLogoW = 74.0;

  // Use one unified mm/px scale factor for both logos so their exact original relative proportions
  // from the official letterhead are preserved faithfully without distorting either logo.
  let unifiedScale = LANDSCAPE_LOGO_MM_PER_PX;
  if (leftAsset) {
    unifiedScale = Math.min(
      unifiedScale,
      maxLogoH / Math.max(1, leftAsset.height),
      maxSingleLogoW / Math.max(1, leftAsset.width)
    );
  }
  if (rightAsset) {
    unifiedScale = Math.min(
      unifiedScale,
      maxLogoH / Math.max(1, rightAsset.height),
      maxSingleLogoW / Math.max(1, rightAsset.width)
    );
  }

  const leftH = leftAsset ? leftAsset.height * unifiedScale : 0;
  const leftW = leftAsset ? leftAsset.width * unifiedScale : 0;
  const rightH = rightAsset ? rightAsset.height * unifiedScale : 0;
  const rightW = rightAsset ? rightAsset.width * unifiedScale : 0;

  const bandHeight = Math.max(leftH, rightH, 13.5);
  const headerCenterY = headerTopY + bandHeight / 2;

  const leftLogo = leftAsset
    ? {
        asset: leftAsset,
        rect: {
          x: sideMargin,
          y: headerCenterY - leftH / 2,
          w: leftW,
          h: leftH
        }
      }
    : null;

  const rightLogo = rightAsset
    ? {
        asset: rightAsset,
        rect: {
          x: pageWidth - sideMargin - rightW,
          y: headerCenterY - rightH / 2,
          w: rightW,
          h: rightH
        }
      }
    : null;

  const headerBottomY = headerTopY + bandHeight;
  const headerDividerY = Math.round((headerBottomY + 1.8) * 10) / 10; // ~22.9mm
  const contentTop = Math.ceil((headerDividerY + 2.4) * 2) / 2; // 25.5mm
  const continuationTop = contentTop + continuationHeaderHeight; // 36.5mm default

  // Dedicated horizontal footer geometry on A4 landscape (210mm tall)
  const contentBottom = 191.0;
  const marginBottom = pageHeight - contentBottom; // 19.0mm
  const footerDividerY = 194.2;
  const footerTextY = 198.6;
  const pageNumberY = 204.5;

  return {
    hasLetterhead: true,
    isFullPage: true,
    mode: 'landscape-composed',
    pageWidth,
    pageHeight,
    marginLeft: sideMargin,
    marginRight: sideMargin,
    contentWidth,
    contentTop,
    continuationTop,
    marginBottom,
    contentBottom,
    pageNumberY,
    placement: null,
    landscapeComposition: {
      leftLogo,
      rightLogo,
      headerDividerY,
      footerDividerY,
      footerTextY,
      footerText: INSTITUTIONAL_FOOTER_TEXT
    }
  };
}

/**
 * Computes exact proportional (zero-distortion) placement and safe printable content margins
 * for a jsPDF document:
 * - A4 Portrait: preserves the exact full-page vertical official letterhead unchanged.
 * - A4 Landscape: uses a dedicated horizontal composition (Policlínica top-left, CPSMS top-right,
 *   adapted horizontal footer) instead of placing the vertical page in the center.
 */
export function computeLetterheadLayout(
  doc: jsPDF,
  dataUrl: string | null,
  options?: {
    sideMargin?: number;
    continuationHeaderHeight?: number;
    customLetterhead?: string | null;
  }
): { layout: LetterheadLayoutMetrics; info: LetterheadInfo | null } {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const isLandscape = pageWidth > pageHeight;
  const sideMargin = options?.sideMargin ?? (isLandscape ? 12 : 14);
  const continuationHeaderHeight = options?.continuationHeaderHeight ?? 11;
  const contentWidth = pageWidth - sideMargin * 2;

  const info = dataUrl ? analyzeLetterheadSync(dataUrl) : null;

  // === A4 LANDSCAPE: Dedicated Horizontal Institutional Composition ===
  // Unless the user explicitly uploaded a custom horizontal full-page letterhead (width > height),
  // NEVER use the vertical portrait image as a landscape background. Compose horizontally with
  // the original Policlínica logo (top-left), CPSMS logo (top-right), and horizontal footer.
  const isCustomLandscapeSheet = Boolean(
    options?.customLetterhead &&
      options.customLetterhead.startsWith('data:image/') &&
      info &&
      info.isFullPage &&
      info.width > info.height
  );

  if (isLandscape && !isCustomLandscapeSheet) {
    const { left, right } = resolveLandscapeLogos(options?.customLetterhead, info);
    if (left || right || !info || info.isFullPage) {
      return {
        info,
        layout: computeLandscapeCompositionLayout(
          pageWidth,
          pageHeight,
          sideMargin,
          continuationHeaderHeight,
          left,
          right
        )
      };
    }
  }

  if (!info) {
    const contentTop = isLandscape ? 12 : 14;
    const marginBottom = 16;
    return {
      info: null,
      layout: {
        hasLetterhead: false,
        isFullPage: false,
        mode: 'none',
        pageWidth,
        pageHeight,
        marginLeft: sideMargin,
        marginRight: sideMargin,
        contentWidth,
        contentTop,
        continuationTop: contentTop + continuationHeaderHeight,
        marginBottom,
        contentBottom: pageHeight - marginBottom,
        pageNumberY: pageHeight - 7,
        placement: null,
        landscapeComposition: null
      }
    };
  }

  // === A4 PORTRAIT (UNCHANGED) & Custom Horizontal Full-Page Uploads ===
  if (info.isFullPage) {
    // Pure proportional "contain" fit onto the A4 sheet — ZERO stretching, flattening, cropping, or distortion
    const scale = Math.min(pageWidth / info.width, pageHeight / info.height);
    const drawW = info.width * scale;
    const drawH = info.height * scale;
    const drawX = (pageWidth - drawW) / 2;
    const drawY = (pageHeight - drawH) / 2;

    const headerEndY = drawY + info.headerBottomRatio * drawH;
    const footerStartY = drawY + info.footerTopRatio * drawH;

    // Safe printable content area strictly between institutional header logos and institutional address footer
    const topBuffer = isLandscape ? 3.8 : 4.5;
    const bottomBuffer = isLandscape ? 4.2 : 5.0;

    const contentTop = Math.ceil((headerEndY + topBuffer) * 2) / 2;
    const contentBottom = Math.floor((footerStartY - bottomBuffer) * 2) / 2;
    const marginBottom = Math.max(16, pageHeight - contentBottom);
    const continuationTop = contentTop + continuationHeaderHeight;

    // Institutional footer ends around 95% of drawH (281.7mm portrait / 199.2mm landscape).
    // Place the subtle page counter strictly below the institutional footer near the bottom page edge.
    const pageNumberY = isLandscape ? pageHeight - 4.2 : pageHeight - 6.0;

    return {
      info,
      layout: {
        hasLetterhead: true,
        isFullPage: true,
        mode: 'portrait-full',
        pageWidth,
        pageHeight,
        marginLeft: sideMargin,
        marginRight: sideMargin,
        contentWidth,
        contentTop,
        continuationTop,
        marginBottom,
        contentBottom,
        pageNumberY,
        placement: { x: drawX, y: drawY, w: drawW, h: drawH },
        landscapeComposition: null
      }
    };
  }

  // Fallback for wide thin banner-only custom uploads (proportional fit, never stretched)
  const maxBannerW = contentWidth;
  const maxBannerH = isLandscape ? 20 : 25;
  const scale = Math.min(maxBannerW / info.width, maxBannerH / info.height);
  const drawW = info.width * scale;
  const drawH = info.height * scale;
  const drawX = (pageWidth - drawW) / 2;
  const drawY = 7;

  const contentTop = Math.ceil((drawY + drawH + 4.5) * 2) / 2;
  const marginBottom = 16;

  return {
    info,
    layout: {
      hasLetterhead: true,
      isFullPage: false,
      mode: 'banner',
      pageWidth,
      pageHeight,
      marginLeft: sideMargin,
      marginRight: sideMargin,
      contentWidth,
      contentTop,
      continuationTop: contentTop + continuationHeaderHeight,
      marginBottom,
      contentBottom: pageHeight - marginBottom,
      pageNumberY: pageHeight - 6.5,
      placement: { x: drawX, y: drawY, w: drawW, h: drawH },
      landscapeComposition: null
    }
  };
}

/**
 * Draws the horizontal A4 landscape letterhead composition on the current page, preserving
 * jsPDF's active font/color state so autoTable mid-page breaks are never affected.
 */
function drawLandscapeCompositionOnPage(doc: jsPDF, layout: LetterheadLayoutMetrics): void {
  const comp = layout.landscapeComposition;
  if (!comp) return;

  // Save current text/font state so autoTable page breaks never inherit header/footer styles
  const prevFont = doc.getFont();
  const prevFontSize = doc.getFontSize();
  const prevTextColor = doc.getTextColor();

  try {
    doc.saveGraphicsState();

    // 1. Top-left: Original Policlínica de Sobral identification logo (proportional, lossless)
    if (comp.leftLogo) {
      const { asset, rect } = comp.leftLogo;
      try {
        doc.addImage(
          asset.dataUrl,
          asset.format,
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          'institutional_logo_policlinica',
          'NONE'
        );
      } catch {
        doc.addImage(asset.dataUrl, asset.format, rect.x, rect.y, rect.w, rect.h, undefined, 'MEDIUM');
      }
    }

    // 2. Top-right: Original CPSMS logo (proportional, lossless)
    if (comp.rightLogo) {
      const { asset, rect } = comp.rightLogo;
      try {
        doc.addImage(
          asset.dataUrl,
          asset.format,
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          'institutional_logo_cpsms',
          'NONE'
        );
      } catch {
        doc.addImage(asset.dataUrl, asset.format, rect.x, rect.y, rect.w, rect.h, undefined, 'MEDIUM');
      }
    }

    // 3. Subtle institutional header hairline separating header from report content
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(layout.marginLeft, comp.headerDividerY, layout.pageWidth - layout.marginRight, comp.headerDividerY);

    // 4. Adapted horizontal footer: subtle hairline + single-line institutional address & contacts
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(layout.marginLeft, comp.footerDividerY, layout.pageWidth - layout.marginRight, comp.footerDividerY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(51, 65, 85);
    doc.text(comp.footerText, layout.pageWidth / 2, comp.footerTextY, { align: 'center' });

    doc.restoreGraphicsState();
  } catch (e) {
    console.warn('Não foi possível renderizar o papel timbrado horizontal no PDF:', e);
  } finally {
    // Restore jsPDF JS-side typography state cleanly
    try {
      doc.setFont(prevFont.fontName, prevFont.fontStyle);
      doc.setFontSize(prevFontSize);
      if (typeof prevTextColor === 'string') {
        doc.setTextColor(prevTextColor);
      }
    } catch {
      // Ignore state restore edge cases
    }
  }
}

/**
 * Attaches the institutional letterhead on Page 1 AND automatically on EVERY subsequent page
 * (both manual doc.addPage() and automatic jspdf-autotable page breaks), strictly underneath
 * all report content:
 * - Portrait reports: full-page proportional vertical letterhead (unchanged).
 * - Landscape reports: dedicated horizontal composition (Policlínica top-left, CPSMS top-right,
 *   adapted horizontal institutional footer).
 */
export function attachLetterheadToDoc(
  doc: jsPDF,
  customLetterhead?: string | null,
  options?: {
    sideMargin?: number;
    continuationHeaderHeight?: number;
  }
): LetterheadLayoutMetrics {
  const dataUrl = resolveLetterheadDataUrl(customLetterhead);
  const { layout, info } = computeLetterheadLayout(doc, dataUrl, {
    ...options,
    customLetterhead
  });

  const decoratedPages = new Set<number>();

  const drawBackgroundOnCurrentPage = () => {
    const currentPage = (doc as any).internal.getCurrentPageInfo?.()?.pageNumber || 1;
    if (decoratedPages.has(currentPage)) return;
    decoratedPages.add(currentPage);

    if (layout.mode === 'landscape-composed' && layout.landscapeComposition) {
      drawLandscapeCompositionOnPage(doc, layout);
      return;
    }

    if (!info || !layout.placement) return;
    const { x, y, w, h } = layout.placement;

    try {
      // Embed the original image ONCE using a shared alias and 'NONE' compression
      // so full institutional quality is preserved on every page with minimal PDF file size.
      doc.addImage(info.dataUrl, info.format, x, y, w, h, 'institutional_letterhead_bg', 'NONE');
    } catch {
      try {
        doc.addImage(info.dataUrl, info.format, x, y, w, h, undefined, 'MEDIUM');
      } catch (e) {
        console.warn('Não foi possível renderizar o papel timbrado no PDF:', e);
      }
    }
  };

  if (layout.mode === 'none') {
    return layout;
  }

  // Draw immediately on Page 1 before any content
  drawBackgroundOnCurrentPage();

  // Wrap doc.addPage so every new page (including jspdf-autotable auto-breaks)
  // immediately receives the institutional letterhead underneath all new page content.
  const anyDoc = doc as any;
  if (!anyDoc.__letterheadHooked) {
    const originalAddPage = doc.addPage.bind(doc);
    anyDoc.addPage = (...args: any[]) => {
      const result = (originalAddPage as any)(...args);
      drawBackgroundOnCurrentPage();
      return result;
    };
    anyDoc.__letterheadHooked = true;
  }

  return layout;
}

/**
 * Institutional editorial PDF palette harmonized with Policlínica de Sobral & CPSMS identity:
 * pure white background, institutional petrol blue titles, turquoise accents, thin neutral hairlines.
 */
export const INSTITUTIONAL_COLORS = {
  petrolBlue: [14, 77, 100] as [number, number, number],
  turquoise: [62, 153, 166] as [number, number, number],
  ink: [30, 41, 59] as [number, number, number],
  slate: [100, 116, 139] as [number, number, number],
  muted: [71, 85, 105] as [number, number, number],
  hairline: [203, 213, 225] as [number, number, number],
  subtleHairline: [226, 232, 240] as [number, number, number],
  noteAmber: [146, 64, 14] as [number, number, number]
};

export interface ReportHeaderMetaItem {
  label: string;
  value: string;
  valueColor?: [number, number, number];
}

export interface InstitutionalReportHeaderOptions {
  /** Main report title displayed directly on white background in institutional petrol blue */
  title: string;
  /** Optional subtle institutional kicker above the title (e.g. responsible unit / report group) */
  kicker?: string;
  /** Optional right-aligned emission timestamp / document code on the top kicker line */
  emissionText?: string;
  /** Optional discreet subtitle directly below the title */
  subtitle?: string;
  /** Structured introductory parameters (period, unit, sector, category, material, etc.) */
  metadata?: ReportHeaderMetaItem[];
  /** Number of columns for the borderless metadata grid (defaults: 3 landscape, 2 portrait) */
  metadataColumns?: number;
  /** Optional discreet observation / warning note rendered without heavy boxes */
  observation?: string;
  /** Tone of the observation indicator ('info' = turquoise, 'warning' = subtle amber) */
  observationTone?: 'info' | 'warning';
  /** Optional discreet methodology / scope note */
  methodology?: string;
  /** Compact spacing for dense single-page reports (e.g. Monthly Sector Consumption) */
  compact?: boolean;
  /** Optional startY override (defaults to layout.contentTop) */
  startY?: number;
  /** Optional right-aligned summary highlight (e.g. total value or document number) directly on white */
  rightHighlight?: { label: string; value: string; valueColor?: [number, number, number] };
}

/**
 * Draws the unified light institutional PDF report header directly on the white page:
 * - Zero dark rectangles, zero heavy colored banners, zero boxed filter cards
 * - Predominant institutional petrol blue title + refined turquoise hairline accents
 * - Discreet typographic hierarchy for responsible unit, emission date, filters, notes & methodology
 * Works seamlessly across both A4 Landscape and A4 Portrait reports and returns the next safe Y (mm).
 */
export function drawInstitutionalReportHeader(
  doc: jsPDF,
  layout: LetterheadLayoutMetrics,
  options: InstitutionalReportHeaderOptions
): number {
  const { marginLeft, marginRight, pageWidth, contentWidth } = layout;
  const isLandscape = pageWidth > layout.pageHeight;
  const compact = Boolean(options.compact);

  const fitText = (text: string, maxW: number): string => {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return '—';
    if (doc.getTextWidth(clean) <= maxW) return clean;
    let lo = 0;
    let hi = clean.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (doc.getTextWidth(`${clean.slice(0, mid)}…`) <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return `${clean.slice(0, Math.max(1, lo)).trimEnd()}…`;
  };

  let curY = options.startY ?? layout.contentTop + (compact ? 0.5 : 1.0);

  // 1. Discreet eyebrow kicker (responsible unit / category) + right-aligned emission date
  const kickerText = options.kicker?.trim();
  const emissionText = options.emissionText?.trim();
  if (kickerText || emissionText) {
    const topBaseline = curY + 2.8;
    if (kickerText) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(compact ? 6.6 : 7.0);
      doc.setTextColor(...INSTITUTIONAL_COLORS.turquoise);
      const maxKickerW = emissionText ? contentWidth * 0.68 : contentWidth;
      doc.text(fitText(kickerText.toUpperCase(), maxKickerW), marginLeft, topBaseline);
    }
    if (emissionText) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(compact ? 6.8 : 7.2);
      doc.setTextColor(...INSTITUTIONAL_COLORS.slate);
      doc.text(fitText(emissionText, contentWidth * 0.34), pageWidth - marginRight, topBaseline, {
        align: 'right'
      });
    }
    curY += compact ? 4.4 : 5.0;
  }

  // 2. Main Report Title directly on white background in institutional petrol blue
  const rightHighlightW = options.rightHighlight ? (isLandscape ? 54 : 46) : 0;
  const titleMaxW = rightHighlightW > 0 ? contentWidth - rightHighlightW - 6 : contentWidth;
  const titleFontSize = compact ? (isLandscape ? 11.4 : 11.2) : isLandscape ? 13.4 : 12.6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  doc.setTextColor(...INSTITUTIONAL_COLORS.petrolBlue);
  const titleLines = doc.splitTextToSize(options.title.trim(), titleMaxW).slice(0, 2) as string[];
  const titleLineStep = compact ? 4.6 : 5.3;

  const titleStartY = curY;
  titleLines.forEach((line, idx) => {
    doc.text(line, marginLeft, curY + (compact ? 3.6 : 4.2) + idx * titleLineStep);
  });

  // Optional right-aligned discreet metric highlight (no box/card, pure typography with thin left accent)
  if (options.rightHighlight) {
    const rhX = pageWidth - marginRight;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.3);
    doc.setTextColor(...INSTITUTIONAL_COLORS.slate);
    doc.text(options.rightHighlight.label.toUpperCase(), rhX, titleStartY + 1.8, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(compact ? 9.8 : 10.6);
    doc.setTextColor(...(options.rightHighlight.valueColor ?? INSTITUTIONAL_COLORS.petrolBlue));
    doc.text(fitText(options.rightHighlight.value, rightHighlightW), rhX, titleStartY + 6.4, {
      align: 'right'
    });
  }

  curY += (compact ? 3.8 : 4.6) + (titleLines.length - 1) * titleLineStep;

  // Optional discreet subtitle directly below the title
  if (options.subtitle?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(compact ? 7.5 : 8.1);
    doc.setTextColor(...INSTITUTIONAL_COLORS.muted);
    const subLines = doc.splitTextToSize(options.subtitle.trim(), titleMaxW).slice(0, 2) as string[];
    subLines.forEach(line => {
      curY += compact ? 3.4 : 3.9;
      doc.text(line, marginLeft, curY);
    });
  }

  // 3. Signature thin institutional dual-tone hairline (turquoise accent + delicate neutral rule)
  curY += compact ? 2.2 : 2.8;
  doc.setDrawColor(...INSTITUTIONAL_COLORS.hairline);
  doc.setLineWidth(0.24);
  doc.line(marginLeft, curY, pageWidth - marginRight, curY);

  doc.setDrawColor(...INSTITUTIONAL_COLORS.turquoise);
  doc.setLineWidth(0.75);
  doc.line(marginLeft, curY, marginLeft + (isLandscape ? 32 : 24), curY);

  const metadata = (options.metadata ?? []).filter(m => m && m.label && String(m.value ?? '').trim() !== '');
  const hasObservation = Boolean(options.observation?.trim());
  const hasMethodology = Boolean(options.methodology?.trim());

  if (metadata.length === 0 && !hasObservation && !hasMethodology) {
    return curY + (compact ? 2.8 : 3.8);
  }

  curY += compact ? 2.4 : 3.2;

  // 4. Discreet borderless metadata composition (no grey boxes, no heavy cards)
  if (metadata.length > 0) {
    if (compact && metadata.length <= 4) {
      // Single ultra-clean horizontal inline row for compact single-page reports
      const cols = metadata.length;
      const gap = 5;
      const colW = (contentWidth - gap * (cols - 1)) / cols;
      metadata.forEach((item, idx) => {
        const x = marginLeft + idx * (colW + gap);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.0);
        doc.setTextColor(...INSTITUTIONAL_COLORS.slate);
        doc.text(fitText(item.label.toUpperCase(), colW), x, curY + 2.0);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.6);
        doc.setTextColor(...(item.valueColor ?? INSTITUTIONAL_COLORS.ink));
        doc.text(fitText(item.value, colW), x, curY + 5.4);
      });
      curY += 6.8;
    } else {
      const cols = options.metadataColumns ?? (isLandscape ? 3 : 2);
      const gapX = isLandscape ? 7 : 6;
      const colW = (contentWidth - gapX * (cols - 1)) / cols;
      const rowHeight = compact ? 6.8 : 7.4;
      const totalRows = Math.ceil(metadata.length / cols);

      metadata.forEach((item, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = marginLeft + col * (colW + gapX);
        const rowY = curY + row * rowHeight;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...INSTITUTIONAL_COLORS.slate);
        doc.text(fitText(item.label.toUpperCase(), colW), x, rowY + 2.1);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.0);
        doc.setTextColor(...(item.valueColor ?? INSTITUTIONAL_COLORS.ink));
        doc.text(fitText(item.value, colW), x, rowY + 5.7);
      });

      curY += totalRows * rowHeight;
    }
  }

  // 5. Optional discreet observation / note line (pure white background, delicate 0.7mm accent tick)
  if (hasObservation) {
    curY += 0.8;
    const isWarn = options.observationTone === 'warning';
    const noteText = options.observation!.trim();
    const labelText = isWarn ? 'Observação: ' : 'Nota: ';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    const wrapped = doc.splitTextToSize(`${labelText}${noteText}`, contentWidth - 4).slice(0, 2) as string[];
    const blockH = wrapped.length * 3.5;

    doc.setDrawColor(...(isWarn ? INSTITUTIONAL_COLORS.noteAmber : INSTITUTIONAL_COLORS.turquoise));
    doc.setLineWidth(0.65);
    doc.line(marginLeft + 0.4, curY + 0.4, marginLeft + 0.4, curY + blockH - 0.3);

    wrapped.forEach((line, idx) => {
      const baseline = curY + 2.7 + idx * 3.5;
      if (idx === 0 && line.startsWith(labelText)) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(isWarn ? INSTITUTIONAL_COLORS.noteAmber : INSTITUTIONAL_COLORS.petrolBlue));
        doc.text(labelText, marginLeft + 3.0, baseline);
        const lw = doc.getTextWidth(labelText);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...(isWarn ? INSTITUTIONAL_COLORS.noteAmber : INSTITUTIONAL_COLORS.muted));
        doc.text(line.slice(labelText.length), marginLeft + 3.0 + lw, baseline);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...(isWarn ? INSTITUTIONAL_COLORS.noteAmber : INSTITUTIONAL_COLORS.muted));
        doc.text(line, marginLeft + 3.0, baseline);
      }
    });
    curY += blockH + 0.8;
  }

  // 6. Optional discreet methodology / scope description
  if (hasMethodology) {
    curY += 0.6;
    const prefix = 'Metodologia: ';
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    const wrapped = doc.splitTextToSize(`${prefix}${options.methodology!.trim()}`, contentWidth).slice(0, 2) as string[];
    wrapped.forEach((line, idx) => {
      const baseline = curY + 2.7 + idx * 3.5;
      if (idx === 0 && line.startsWith(prefix)) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INSTITUTIONAL_COLORS.petrolBlue);
        doc.text(prefix, marginLeft, baseline);
        const pw = doc.getTextWidth(prefix);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...INSTITUTIONAL_COLORS.muted);
        doc.text(line.slice(prefix.length), marginLeft + pw, baseline);
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...INSTITUTIONAL_COLORS.muted);
        doc.text(line, marginLeft, baseline);
      }
    });
    curY += wrapped.length * 3.5 + 0.8;
  }

  // 7. Delicate closing hairline separating introductory metadata from report body
  curY += compact ? 1.4 : 1.8;
  doc.setDrawColor(...INSTITUTIONAL_COLORS.subtleHairline);
  doc.setLineWidth(0.22);
  doc.line(marginLeft, curY, pageWidth - marginRight, curY);

  return curY + (compact ? 2.6 : 3.6);
}

/**
 * Draws the light institutional continuation header on pages 2..N (pure white background,
 * petrol-blue title, turquoise accent, fine bottom hairline — zero dark rectangles) and clean
 * page numbering on ALL pages strictly below the institutional footer.
 */
export function drawContinuationAndPageNumbers(
  doc: jsPDF,
  layout: LetterheadLayoutMetrics,
  options: {
    title: string;
    rightHeaderText?: string;
    footerLeftText?: string;
    drawContinuationBar?: boolean;
  }
): void {
  const totalPages = (doc as any).internal.getNumberOfPages();
  const {
    pageWidth,
    marginLeft,
    marginRight,
    contentWidth,
    contentTop,
    pageNumberY,
    isFullPage
  } = layout;

  const truncate = (s: string, max: number) =>
    s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s;

  const isLandscape = pageWidth > layout.pageHeight;

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Light editorial continuation header on pages 2..N (directly on white background, no dark block)
    if (p > 1 && options.drawContinuationBar !== false) {
      const barY = contentTop;
      const textY = barY + 4.4;
      const lineY = barY + 6.9;

      const titleStr = truncate(options.title.trim(), isLandscape ? 88 : 50);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(...INSTITUTIONAL_COLORS.petrolBlue);
      doc.text(titleStr, marginLeft, textY);

      const titleW = doc.getTextWidth(titleStr);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(...INSTITUTIONAL_COLORS.turquoise);
      doc.text('  •  Continuação', marginLeft + titleW, textY);

      if (options.rightHeaderText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(...INSTITUTIONAL_COLORS.slate);
        doc.text(
          truncate(options.rightHeaderText, isLandscape ? 58 : 34),
          pageWidth - marginRight,
          textY,
          { align: 'right' }
        );
      }

      // Delicate dual-tone bottom hairline
      doc.setDrawColor(...INSTITUTIONAL_COLORS.hairline);
      doc.setLineWidth(0.22);
      doc.line(marginLeft, lineY, pageWidth - marginRight, lineY);

      doc.setDrawColor(...INSTITUTIONAL_COLORS.turquoise);
      doc.setLineWidth(0.6);
      doc.line(marginLeft, lineY, marginLeft + (isLandscape ? 22 : 16), lineY);
    }

    // Page identification cleanly below the institutional footer (never colliding with address)
    if (!isFullPage) {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, pageNumberY - 4.2, pageWidth - marginRight, pageNumberY - 4.2);
    }

    const rawFooterLeft = (options.footerLeftText || 'Policlínica de Sobral').trim();
    const brandedFooterLeft = /^GEPAM\b/i.test(rawFooterLeft)
      ? rawFooterLeft
      : `GEPAM  •  ${rawFooterLeft}`;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...INSTITUTIONAL_COLORS.slate);
    doc.text(
      truncate(brandedFooterLeft, isLandscape ? 120 : 72),
      marginLeft,
      pageNumberY
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...INSTITUTIONAL_COLORS.petrolBlue);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginRight, pageNumberY, {
      align: 'right'
    });
  }
}

/**
 * Generates print CSS and fixed letterhead markup for HTML/CSS iframe printing:
 * - Portrait: preserves the full-page vertical official letterhead (unchanged).
 * - Landscape: uses a dedicated fixed horizontal header (Policlínica top-left, CPSMS top-right)
 *   and adapted horizontal institutional footer repeating cleanly on every printed page.
 */
export function getPrintLetterheadLayout(
  orientation: 'landscape' | 'portrait',
  customLetterhead?: string | null
): {
  letterheadSrc: string;
  topReserveMm: number;
  bottomReserveMm: number;
  sidePaddingMm: number;
  css: string;
  backgroundHtml: string;
} {
  const letterheadSrc = resolveLetterheadPrintSrc(customLetterhead);

  // Check if user explicitly uploaded a custom horizontal full-page letterhead
  const customInfo =
    customLetterhead && customLetterhead.startsWith('data:image/')
      ? analyzeLetterheadSync(customLetterhead)
      : null;
  const useCustomLandscapeBg = Boolean(
    orientation === 'landscape' &&
      customInfo &&
      customInfo.isFullPage &&
      customInfo.width > customInfo.height
  );

  // === A4 LANDSCAPE: Dedicated Horizontal Institutional Composition ===
  if (orientation === 'landscape' && !useCustomLandscapeBg) {
    const topReserveMm = 25.5;
    const bottomReserveMm = 19;
    const sidePaddingMm = 12;

    const { left, right } = resolveLandscapeLogos(customLetterhead, customInfo);
    const leftLogoSrc = left?.dataUrl || OFFICIAL_LOGO_POLICLINICA_URL;
    const rightLogoSrc = right?.dataUrl || OFFICIAL_LOGO_CPSMS_URL;

    const css = `
      @page { size: A4 landscape; margin: 0; }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        width: 100%;
        margin: 0;
        padding: 0;
        font-family: Helvetica, Arial, sans-serif;
        color: #0f172a;
        background: #ffffff;
      }
      .letterhead-landscape-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 22.8mm;
        padding: 5.2mm ${sidePaddingMm}mm 1.6mm ${sidePaddingMm}mm;
        z-index: 0;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #ffffff;
      }
      .letterhead-landscape-header::after {
        content: '';
        position: absolute;
        left: ${sidePaddingMm}mm;
        right: ${sidePaddingMm}mm;
        bottom: 0;
        height: 0.3mm;
        background: #cbd5e1;
      }
      .letterhead-landscape-header .lh-logo-policlinica {
        height: 13.23mm;
        width: auto;
        max-width: 74mm;
        object-fit: contain;
        display: block;
      }
      .letterhead-landscape-header .lh-logo-cpsms {
        height: 15.64mm;
        width: auto;
        max-width: 74mm;
        object-fit: contain;
        display: block;
      }
      .letterhead-landscape-footer {
        position: fixed;
        left: ${sidePaddingMm}mm;
        right: ${sidePaddingMm}mm;
        bottom: 8.2mm;
        padding-top: 2mm;
        border-top: 0.3mm solid #cbd5e1;
        z-index: 0;
        pointer-events: none;
        text-align: center;
        font-family: Helvetica, Arial, sans-serif;
        font-size: 7.6pt;
        font-weight: 700;
        color: #334155;
        letter-spacing: 0.01em;
        white-space: nowrap;
        background: #ffffff;
      }
      .print-layout-table {
        position: relative;
        z-index: 1;
        width: 100%;
        border-collapse: collapse;
      }
      .print-layout-table > thead { display: table-header-group; }
      .print-layout-table > tfoot { display: table-footer-group; }
      .print-layout-table > thead td,
      .print-layout-table > tfoot td,
      .print-layout-table > tbody td {
        padding: 0;
        border: 0;
      }
      .print-header-spacer { height: ${topReserveMm}mm; }
      .print-footer-spacer { height: ${bottomReserveMm}mm; }
      .print-content-shell {
        padding: 0 ${sidePaddingMm}mm;
      }
    `;

    const backgroundHtml = `
      <div class="letterhead-landscape-header" aria-hidden="true">
        <img src="${leftLogoSrc}" alt="Policlínica de Sobral" class="lh-logo-policlinica" />
        <img src="${rightLogoSrc}" alt="CPSMS" class="lh-logo-cpsms" />
      </div>
      <div class="letterhead-landscape-footer" aria-hidden="true">
        ${INSTITUTIONAL_FOOTER_TEXT}
      </div>
    `;

    return {
      letterheadSrc,
      topReserveMm,
      bottomReserveMm,
      sidePaddingMm,
      css,
      backgroundHtml
    };
  }

  // === A4 PORTRAIT (UNCHANGED) & Custom Horizontal Full-Page Uploads ===
  const topReserveMm = orientation === 'landscape' ? 25 : 34.5;
  const bottomReserveMm = orientation === 'landscape' ? 24 : 33;
  const sidePaddingMm = orientation === 'landscape' ? 12 : 14;

  const css = `
    @page { size: A4 ${orientation}; margin: 0; }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 100%;
      margin: 0;
      padding: 0;
      font-family: Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
    }
    .letterhead-fixed-bg {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
    }
    .letterhead-fixed-bg img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center center;
      display: block;
    }
    .print-layout-table {
      position: relative;
      z-index: 1;
      width: 100%;
      border-collapse: collapse;
    }
    .print-layout-table > thead { display: table-header-group; }
    .print-layout-table > tfoot { display: table-footer-group; }
    .print-layout-table > thead td,
    .print-layout-table > tfoot td,
    .print-layout-table > tbody td {
      padding: 0;
      border: 0;
    }
    .print-header-spacer { height: ${topReserveMm}mm; }
    .print-footer-spacer { height: ${bottomReserveMm}mm; }
    .print-content-shell {
      padding: 0 ${sidePaddingMm}mm;
    }
  `;

  const backgroundHtml = `
    <div class="letterhead-fixed-bg" aria-hidden="true">
      <img src="${letterheadSrc}" alt="" />
    </div>
  `;

  return {
    letterheadSrc,
    topReserveMm,
    bottomReserveMm,
    sidePaddingMm,
    css,
    backgroundHtml
  };
}
