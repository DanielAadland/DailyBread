import { cardText, type CardStyle } from '@bible-app/core';
import { Platform } from 'react-native';
import { FONTS } from '../theme/tokens';
import { ART_H, ART_W, CARD_ART, CARD_TEXT_COLORS } from './backgrounds';
import { CARD_FONT_FAMILY, cardTypeMetrics } from './VerseCard';

/** Verse images are made in the browser for now; the mobile apps add this in Phase 6. */
export const canMakeImages = Platform.OS === 'web' && typeof document !== 'undefined';

const IMAGE_W = 1080;
const IMAGE_H = 1350;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw a verse card as a 1080 × 1350 PNG (the 4:5 size social apps use). */
export async function renderCardImage(input: { style: CardStyle; text: string; reference: string; wordmark: string }): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_W;
  canvas.height = IMAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  // Background, from the same shapes as the on-screen card.
  ctx.save();
  ctx.scale(IMAGE_W / ART_W, IMAGE_H / ART_H);
  for (const layer of CARD_ART[input.style.background].layers) {
    ctx.globalAlpha = 'opacity' in layer && layer.opacity !== undefined ? layer.opacity : 1;
    if (layer.kind === 'sky') {
      const g = ctx.createLinearGradient(0, 0, 0, ART_H);
      for (const [offset, color] of layer.stops) g.addColorStop(offset, color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ART_W, ART_H);
    } else if (layer.kind === 'circle') {
      ctx.fillStyle = layer.fill;
      ctx.beginPath();
      ctx.arc(layer.cx, layer.cy, layer.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (layer.kind === 'shape') {
      ctx.fillStyle = layer.fill;
      ctx.fill(new Path2D(layer.d));
    } else {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.width;
      ctx.lineCap = 'round';
      ctx.stroke(new Path2D(layer.d));
    }
  }
  ctx.restore();

  // Text, with the same proportions as the on-screen card.
  const verse = cardText(input.text);
  const colors = CARD_TEXT_COLORS[CARD_ART[input.style.background].text];
  const family = CARD_FONT_FAMILY[input.style.font];
  const m = cardTypeMetrics(IMAGE_W, verse, input.style.font);
  await Promise.all([
    document.fonts.load(`${m.size}px "${family}"`),
    document.fonts.load(`${m.refSize}px "${FONTS.uiMedium}"`),
  ]).catch(() => undefined);

  ctx.textBaseline = 'top';
  ctx.fillStyle = colors.verse;
  ctx.font = `${m.size}px "${family}", Georgia, serif`;
  let y = m.pad * 1.2;
  for (const line of wrap(ctx, verse, IMAGE_W - m.pad * 2)) {
    ctx.fillText(line, m.pad, y + (m.lineHeight - m.size) / 2);
    y += m.lineHeight;
  }
  ctx.fillStyle = colors.soft;
  ctx.font = `${m.refSize}px "${FONTS.uiMedium}", system-ui, sans-serif`;
  ctx.fillText(input.reference, m.pad, y + m.size * 0.7);
  // A small wordmark in the corner, so a shared image says where it came from.
  ctx.globalAlpha = 0.75;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(input.wordmark, IMAGE_W - m.pad * 0.6, IMAGE_H - m.pad * 0.6);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image_failed'))), 'image/png'));
}

export function imageFileName(reference: string): string {
  return `${reference.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'verse'}.png`;
}

/** Download the image (web). */
export function saveImage(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Share the image file through the device's share sheet where the browser supports it. */
export function canShareImage(): boolean {
  if (!canMakeImages || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Blob()], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

export async function shareImage(blob: Blob, fileName: string, text: string): Promise<void> {
  const file = new File([blob], fileName, { type: 'image/png' });
  await navigator.share({ files: [file], text });
}
