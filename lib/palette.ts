// Single source of colour tokens: read by CSS (via cssVars) and by three.js materials.

export const palette = {
  bg: '#F4F1EA',
  bgDeep: '#E9E4D8',
  surface: '#FFFFFF',
  board: '#E2DDD1',
  boardEdge: '#D3CCBD',
  ink: '#2F2B3A',
  inkSoft: '#6B6578',
  line: '#D9D3C6',
  accent: '#6C8CD5',

  // process states
  NEW: '#C9B6E4', // lilac
  READY: '#A7C7E7', // sky
  RUNNING: '#A8D8B9', // mint
  WAITING: '#F9D89C', // butter
  TERMINATED: '#C4C0BA', // grey

  fault: '#F08A7E', // coral
  hit: '#7CCB9A',
  ctx: '#F5B971', // amber
  idle: '#CFCAC0',
  chip: '#5B5F73',
  chipTop: '#6E7389',
  disk: '#B8C4DA',
  printer: '#D9C6B0',
  tileEmpty: '#F7F5F0',
} as const;

export const processColors = [
  '#F4A6A6', // coral pink
  '#8FCFAE', // mint
  '#8DB6E0', // sky
  '#F6CF7E', // butter
  '#B9A3DE', // lilac
  '#F3A9CB', // pink
  '#7FCFCB', // teal
  '#F4B48C', // peach
  '#A9D18E', // lime
  '#C9B79C', // sand
] as const;

export const resourceColors = ['#8DB6E0', '#F4A6A6', '#A9D18E', '#F6CF7E', '#B9A3DE'] as const;

export function colorForPid(pid: number): string {
  return processColors[(pid - 1 + processColors.length) % processColors.length];
}

/** CSS custom properties generated from the palette, applied on <body>. */
export function cssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(palette)) vars[`--c-${k}`] = v;
  return vars;
}
