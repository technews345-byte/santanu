/** Small colour arithmetic, for tinting glass from a category's own colour. */

export function parseColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const hex = input.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  const rgb = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  return null;
}

/** The same colour at a given opacity. Unparseable input comes back as is. */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/** Mixes a colour toward white (amount > 0) or black (amount < 0). */
export function shade(color: string, amount: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (v: number) => Math.round(v + (target - v) * t);
  return `rgb(${mix(c.r)}, ${mix(c.g)}, ${mix(c.b)})`;
}

/** WCAG relative luminance of an opaque colour. */
export function luminance(color: string): number {
  const c = parseColor(color);
  if (!c) return 0;
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The colour, deepened only as far as a white glyph on it needs to reach the
 * given contrast. Hue is kept — an amber stays amber, just richer — so a
 * category is still recognisably its own colour.
 */
export function deepenForWhite(color: string, target = 3.2): string {
  if (contrast('#FFFFFF', color) >= target) return color;
  for (let step = 0.04; step <= 0.6; step += 0.04) {
    const candidate = shade(color, -step);
    if (contrast('#FFFFFF', candidate) >= target) return candidate;
  }
  return shade(color, -0.6);
}

/** The colour with its hue turned by some degrees, for a companion accent. */
export function rotateHue(color: string, degrees: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  h = (((h + degrees) % 360) + 360) % 360;
  const cc = (1 - Math.abs(2 * l - 1)) * s;
  const x = cc * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - cc / 2;
  const [r1, g1, b1] =
    h < 60 ? [cc, x, 0] : h < 120 ? [x, cc, 0] : h < 180 ? [0, cc, x] : h < 240 ? [0, x, cc] : h < 300 ? [x, 0, cc] : [cc, 0, x];
  const to = (v: number) => Math.round((v + m) * 255);
  return `rgb(${to(r1)}, ${to(g1)}, ${to(b1)})`;
}
