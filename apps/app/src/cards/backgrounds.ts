import type { CardBackground } from '@bible-app/core';

/**
 * Card backgrounds: small landscapes in the app's "first light" idiom (sky, sun, water, hills),
 * described as shapes in a 1000 × 1250 box so the same description draws the card on screen
 * (react-native-svg) and into a shared image (canvas).
 */
export const ART_W = 1000;
export const ART_H = 1250;

export type Layer =
  | { kind: 'sky'; stops: Array<[number, string]> }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; opacity?: number }
  | { kind: 'shape'; d: string; fill: string; opacity?: number }
  | { kind: 'line'; d: string; stroke: string; width: number; opacity?: number };

export interface CardArt {
  layers: Layer[];
  /** Text colour family: dark ink on light skies, white on dark ones. */
  text: 'dark' | 'light';
}

/**
 * Shapes reach far beyond the 0–1000 box on both sides, so on wide screens the landscape can be
 * shown wider (at the same scale) instead of being stretched or boxed in.
 */
const FAR_L = -3000;
const FAR_R = 4000;
const wave = (y: number, amp = 36) => {
  let d = `M${FAR_L} ${y}`;
  for (let x = FAR_L; x < FAR_R; x += 1000) d += ` C ${x + 166} ${y - amp} ${x + 333} ${y + amp} ${x + 500} ${y} S ${x + 833} ${y - amp} ${x + 1000} ${y}`;
  return d;
};
/** A ground line drawn from x=0 to x=1000, extended flat on both sides and filled down to the bottom. */
const ground = (top: string) => {
  const y0 = /^M0 (-?\d+)/.exec(top)![1];
  const y1 = /(-?\d+)$/.exec(top)![1];
  return `M${FAR_L} ${y0} L${top.slice(1)} L${FAR_R} ${y1} L${FAR_R} 1250 L${FAR_L} 1250 Z`;
};
const below = (y: number) => `M${FAR_L} ${y} L${FAR_R} ${y} L${FAR_R} 1250 L${FAR_L} 1250 Z`;

const STARS: Array<[number, number, number]> = [
  [90, 120, 3], [210, 260, 2], [330, 90, 2.5], [470, 200, 2], [560, 70, 3], [640, 330, 2], [120, 420, 2],
  [880, 120, 2], [930, 420, 2.5], [260, 560, 2], [720, 520, 2], [60, 700, 2.5], [940, 680, 2], [400, 380, 1.8],
];

export const CARD_ART: Record<CardBackground, CardArt> = {
  dawn: {
    text: 'dark',
    layers: [
      { kind: 'sky', stops: [[0, '#F8EEDC'], [0.62, '#F3D6A6'], [1, '#E6AE60']] },
      { kind: 'circle', cx: 500, cy: 1250, r: 430, fill: '#F6DDAE', opacity: 0.55 },
      { kind: 'circle', cx: 500, cy: 1250, r: 280, fill: '#B07314', opacity: 0.9 },
    ],
  },
  tide: {
    text: 'light',
    layers: [
      { kind: 'sky', stops: [[0, '#2E5E8C'], [1, '#132C45']] },
      { kind: 'line', d: wave(930), stroke: '#8DB8E0', width: 6, opacity: 0.3 },
      { kind: 'line', d: wave(1010), stroke: '#8DB8E0', width: 6, opacity: 0.22 },
      { kind: 'line', d: wave(1090), stroke: '#8DB8E0', width: 6, opacity: 0.15 },
      { kind: 'line', d: wave(1170), stroke: '#8DB8E0', width: 6, opacity: 0.1 },
    ],
  },
  olive: {
    text: 'light',
    layers: [
      { kind: 'sky', stops: [[0, '#6B7849'], [1, '#3D4729']] },
      { kind: 'shape', d: ground('M0 960 C 220 880 420 930 600 990 C 760 1040 880 990 1000 950'), fill: '#56623A', opacity: 0.9 },
      { kind: 'shape', d: ground('M0 1070 C 200 1030 380 1080 560 1100 C 760 1120 880 1060 1000 1040'), fill: '#323B21', opacity: 0.9 },
    ],
  },
  sand: {
    text: 'dark',
    layers: [
      { kind: 'sky', stops: [[0, '#F6EEE2'], [1, '#E6D3B3']] },
      { kind: 'circle', cx: 760, cy: 900, r: 70, fill: '#B07314', opacity: 0.4 },
      { kind: 'shape', d: ground('M0 1010 C 260 950 520 1060 760 1010 C 880 985 950 990 1000 1000'), fill: '#D8C097', opacity: 0.85 },
      { kind: 'shape', d: ground('M0 1120 C 300 1080 560 1150 1000 1090'), fill: '#C9AA79', opacity: 0.8 },
    ],
  },
  dusk: {
    text: 'light',
    layers: [
      { kind: 'sky', stops: [[0, '#3A3152'], [0.55, '#6E4B66'], [1, '#C7826A']] },
      { kind: 'circle', cx: 500, cy: 1070, r: 150, fill: '#F2B880', opacity: 0.95 },
      { kind: 'shape', d: below(1070), fill: '#2A2340', opacity: 0.92 },
      { kind: 'line', d: 'M400 1110 L600 1110', stroke: '#F2B880', width: 6, opacity: 0.5 },
      { kind: 'line', d: 'M440 1150 L560 1150', stroke: '#F2B880', width: 6, opacity: 0.35 },
    ],
  },
  night: {
    text: 'light',
    layers: [
      { kind: 'sky', stops: [[0, '#0E1A26'], [1, '#22405E']] },
      ...STARS.map(([cx, cy, r]): Layer => ({ kind: 'circle', cx, cy, r: r * 2, fill: '#F0E6C8', opacity: 0.75 })),
      { kind: 'circle', cx: 780, cy: 1010, r: 72, fill: '#F0E6C8', opacity: 0.95 },
      { kind: 'circle', cx: 808, cy: 992, r: 64, fill: '#1D3854' },
    ],
  },
  meadow: {
    text: 'dark',
    layers: [
      { kind: 'sky', stops: [[0, '#F1F6EA'], [1, '#D3E5C2']] },
      { kind: 'shape', d: ground('M0 980 C 240 900 460 960 640 1000 C 820 1040 920 990 1000 970'), fill: '#A9C890', opacity: 0.9 },
      { kind: 'shape', d: ground('M0 1090 C 260 1040 520 1100 720 1110 C 860 1116 940 1090 1000 1080'), fill: '#86AD6C', opacity: 0.9 },
    ],
  },
  rose: {
    text: 'dark',
    layers: [
      { kind: 'sky', stops: [[0, '#FBF0F1'], [1, '#F0CDD2']] },
      { kind: 'circle', cx: 860, cy: 1000, r: 250, fill: '#E3A5AF', opacity: 0.3 },
      { kind: 'circle', cx: 170, cy: 1150, r: 150, fill: '#E3A5AF', opacity: 0.3 },
    ],
  },
  stone: {
    text: 'dark',
    layers: [
      { kind: 'sky', stops: [[0, '#E9EDF1'], [1, '#BAC4CF']] },
      { kind: 'shape', d: ground('M0 940 L180 860 L320 920 L520 820 L700 900 L860 840 L1000 900'), fill: '#9AA6B4', opacity: 0.55 },
      { kind: 'shape', d: ground('M0 1030 L160 980 L360 1040 L560 960 L760 1030 L1000 980'), fill: '#7F8B9A', opacity: 0.7 },
      { kind: 'shape', d: ground('M0 1130 L240 1090 L480 1140 L720 1080 L1000 1130'), fill: '#66727F', opacity: 0.85 },
    ],
  },
  sea: {
    text: 'light',
    layers: [
      { kind: 'sky', stops: [[0, '#2A7880'], [1, '#1A555C']] },
      { kind: 'circle', cx: 500, cy: 930, r: 120, fill: '#F2D49B', opacity: 0.9 },
      { kind: 'shape', d: below(930), fill: '#0E3A40', opacity: 0.95 },
      { kind: 'line', d: 'M380 975 L620 975', stroke: '#F2D49B', width: 7, opacity: 0.55 },
      { kind: 'line', d: 'M420 1025 L580 1025', stroke: '#F2D49B', width: 7, opacity: 0.4 },
      { kind: 'line', d: 'M455 1075 L545 1075', stroke: '#F2D49B', width: 7, opacity: 0.28 },
    ],
  },
  ember: {
    text: 'light',
    layers: [
      { kind: 'sky', stops: [[0, '#361812'], [0.6, '#6E2E1F'], [1, '#A2502B']] },
      { kind: 'circle', cx: 500, cy: 1320, r: 540, fill: '#E08A45', opacity: 0.3 },
      { kind: 'circle', cx: 500, cy: 1320, r: 330, fill: '#F0B060', opacity: 0.35 },
    ],
  },
  mist: {
    text: 'dark',
    layers: [
      { kind: 'sky', stops: [[0, '#F7F9FA'], [1, '#DCE3EA']] },
      { kind: 'line', d: 'M200 1250 A 300 300 0 0 1 800 1250', stroke: '#2E5E8C', width: 4, opacity: 0.16 },
      { kind: 'line', d: 'M80 1250 A 420 420 0 0 1 920 1250', stroke: '#2E5E8C', width: 4, opacity: 0.12 },
      { kind: 'line', d: 'M-40 1250 A 540 540 0 0 1 1040 1250', stroke: '#2E5E8C', width: 4, opacity: 0.08 },
      { kind: 'circle', cx: 500, cy: 1250, r: 90, fill: '#B07314', opacity: 0.75 },
    ],
  },
};

export const CARD_TEXT_COLORS = {
  dark: { verse: '#1C2B3A', soft: '#3E4C5B' },
  light: { verse: '#FFFFFF', soft: 'rgba(255,255,255,0.86)' },
} as const;

/** Verse type size as a fraction of the card's width (core cardTextSize). */
export const CARD_TEXT_SCALE = { xl: 0.072, l: 0.06, m: 0.05, s: 0.043 } as const;
