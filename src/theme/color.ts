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
