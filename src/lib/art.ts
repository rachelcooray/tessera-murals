import { hsl } from "./colour";
import { mulberry32, range } from "./rng";

export type ArtKind = "horizon" | "waves" | "hills" | "forest" | "night" | "bloom" | "abstract";

export interface ArtSpec {
  kind: ArtKind;
  seed: number;
  h: number;
  s: number;
  l: number;
}

export const ART_KINDS: ArtKind[] = ["horizon", "waves", "hills", "forest", "night", "bloom", "abstract"];

/** How a kind is described when explaining placement ("beside three seas"). */
export const KIND_MOOD: Record<ArtKind, [string, string]> = {
  horizon: ["horizon", "horizons"],
  waves: ["sea", "seas"],
  hills: ["hillside", "hillsides"],
  forest: ["forest", "forests"],
  night: ["night sky", "night skies"],
  bloom: ["flower", "flowers"],
  abstract: ["abstract", "abstracts"],
};

const W = 512;
const f = (n: number) => n.toFixed(1);

/** Three representative colours for placement and living colour. */
export function artPalette(a: ArtSpec): string[] {
  if (a.kind === "night") return [hsl(a.h, a.s * 0.7, Math.max(10, a.l - 22)), hsl(a.h, a.s, a.l), hsl(45, 70, 80)];
  return [hsl(a.h, a.s, a.l), hsl(a.h + 18, a.s, a.l - 14), hsl(a.h - 12, a.s * 0.8, a.l + 20)];
}

export function artSvg(a: ArtSpec, size = W): string {
  const r = mulberry32(a.seed);
  const { h, s, l } = a;
  const body = (() => {
    switch (a.kind) {
      case "horizon": return horizon(r, h, s, l);
      case "waves": return waves(r, h, s, l);
      case "hills": return hills(r, h, s, l);
      case "forest": return forest(r, h, s, l);
      case "night": return night(r, h, s, l);
      case "bloom": return bloom(r, h, s, l);
      default: return abstract(r, h, s, l);
    }
  })();
  const seed = Math.floor(r() * 1000);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${size}" height="${size}">
<defs>
<filter id="rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="2" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="14"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed + 1}"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.9 0"/></filter>
</defs>
<g filter="url(#rough)">${body}</g>
<rect width="${W}" height="${W}" filter="url(#grain)" opacity="0.16" style="mix-blend-mode:overlay"/>
</svg>`;
}

/** size: pixel size to rasterise at. The wall uses small thumbnails; an opened tile uses full size. */
export function artDataUrl(a: ArtSpec, size = W): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(artSvg(a, size));
}

function grad(id: string, stops: [number, string][], vertical = true): string {
  const dir = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="1"';
  return `<linearGradient id="${id}" ${dir}>${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;
}

function bg(fill: string): string {
  return `<rect x="-20" y="-20" width="${W + 40}" height="${W + 40}" fill="${fill}"/>`;
}

function strokes(r: () => number, h: number, s: number, l: number, n: number, yMin: number, yMax: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    const y = range(r, yMin, yMax), x = range(r, -40, W);
    const w = range(r, 60, 200);
    out += `<ellipse cx="${f(x + w / 2)}" cy="${f(y)}" rx="${f(w / 2)}" ry="${f(range(r, 2, 6))}" fill="${hsl(h + range(r, -12, 12), s, l + range(r, -8, 10))}" opacity="${f(range(r, 0.25, 0.55))}"/>`;
  }
  return out;
}

function horizon(r: () => number, h: number, s: number, l: number): string {
  const warm = h < 70 || h > 300;
  const hy = range(r, 250, 320);
  const skyTop = hsl(h + (warm ? 10 : 0), s, Math.max(12, l - 12));
  const skyLow = warm ? hsl(h + 25, s + 20, Math.min(78, l + 30)) : hsl(32, 60, Math.min(80, l + 32));
  const sunX = range(r, 150, 360), sunR = range(r, 34, 64), sunY = hy - range(r, 10, 90);
  const sea1 = hsl(h + (warm ? 180 : 10), s * 0.8, Math.max(14, l - 6));
  const sea2 = hsl(h + (warm ? 190 : 20), s * 0.7, Math.max(8, l - 22));
  let refl = "";
  for (let i = 0; i < 9; i++) {
    const y = hy + 10 + i * range(r, 14, 26);
    const w = range(r, 30, 120) * (1 - i / 12);
    refl += `<rect x="${f(sunX - w / 2 + range(r, -20, 20))}" y="${f(y)}" width="${f(w)}" height="${f(range(r, 2, 5))}" fill="${hsl(40, 80, 82)}" opacity="${f(0.6 - i * 0.05)}"/>`;
  }
  return `<defs>${grad("sk", [[0, skyTop], [1, skyLow]])}${grad("se", [[0, sea1], [1, sea2]])}
<radialGradient id="gl"><stop offset="0" stop-color="${hsl(42, 90, 85)}" stop-opacity="0.9"/><stop offset="1" stop-color="${hsl(42, 90, 70)}" stop-opacity="0"/></radialGradient></defs>
<rect x="-20" y="-20" width="${W + 40}" height="${f(hy + 20)}" fill="url(#sk)"/>
${strokes(r, h + 10, s, l + 6, 10, 20, hy - 30)}
<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR * 2.6)}" fill="url(#gl)"/>
<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR)}" fill="${hsl(40, 85, 84)}"/>
<rect x="-20" y="${f(hy)}" width="${W + 40}" height="${f(W - hy + 20)}" fill="url(#se)"/>
${refl}`;
}

function wavePath(r: () => number, y: number, amp: number): string {
  const ph = range(r, 0, Math.PI * 2), fr = range(r, 1.2, 2.6);
  let d = `M -20 ${f(y)}`;
  for (let x = -20; x <= W + 20; x += 16) {
    d += ` L ${x} ${f(y + Math.sin((x / W) * Math.PI * 2 * fr + ph) * amp + Math.sin(x / 23 + ph) * amp * 0.25)}`;
  }
  return d + ` L ${W + 20} ${W + 20} L -20 ${W + 20} Z`;
}

function waves(r: () => number, h: number, s: number, l: number): string {
  let out = `<defs>${grad("sk", [[0, hsl(h - 10, s * 0.6, Math.min(82, l + 30))], [1, hsl(h, s * 0.7, Math.min(70, l + 16))]])}</defs><rect x="-20" y="-20" width="${W + 40}" height="${W + 40}" fill="url(#sk)"/>`;
  const n = Math.floor(range(r, 5, 8));
  for (let i = 0; i < n; i++) {
    const y = 140 + (i * (W - 140)) / n + range(r, -10, 10);
    const light = l + 12 - i * (26 / n);
    out += `<path d="${wavePath(r, y, range(r, 10, 26))}" fill="${hsl(h + i * 4, s, Math.max(10, light))}"/>`;
    out += `<path d="${wavePath(r, y - 2, range(r, 8, 20))}" fill="none" stroke="${hsl(h - 20, 30, 88)}" stroke-width="${f(range(r, 1.5, 4))}" opacity="0.5"/>`;
  }
  return out;
}

function ridge(r: () => number, base: number, amp: number): string {
  const pts: [number, number][] = [];
  for (let x = -40; x <= W + 40; x += range(r, 60, 120)) pts.push([x, base - range(r, 0, amp)]);
  pts.push([W + 60, base - range(r, 0, amp)]);
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    d += ` Q ${f((x0 + x1) / 2)} ${f(Math.min(y0, y1) - range(r, 0, 30))} ${f(x1)} ${f(y1)}`;
  }
  return d + ` L ${W + 60} ${W + 40} L -40 ${W + 40} Z`;
}

function hills(r: () => number, h: number, s: number, l: number): string {
  const sky = hsl(h + 120 + range(r, -30, 30), s * 0.4, Math.min(84, l + 34));
  let out = `<defs>${grad("sk", [[0, hsl(h + 140, s * 0.4, Math.min(86, l + 40))], [1, sky]])}</defs><rect x="-20" y="-20" width="${W + 40}" height="${W + 40}" fill="url(#sk)"/>`;
  if (r() > 0.4) out += `<circle cx="${f(range(r, 100, 420))}" cy="${f(range(r, 70, 150))}" r="${f(range(r, 22, 40))}" fill="${hsl(45, 70, 88)}" opacity="0.9"/>`;
  out += strokes(r, h + 140, s * 0.3, l + 34, 6, 30, 180);
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const base = 230 + i * 80;
    out += `<path d="${ridge(r, base, 90 - i * 10)}" fill="${hsl(h + i * 6, s * (0.55 + i * 0.12), Math.max(12, l + 18 - i * 10))}"/>`;
  }
  return out;
}

function forest(r: () => number, h: number, s: number, l: number): string {
  let out = bg(hsl(h + 20, s * 0.4, Math.min(78, l + 26)));
  out += `<path d="${ridge(r, 300, 40)}" fill="${hsl(h + 10, s * 0.6, Math.max(14, l))}"/>`;
  for (let row = 0; row < 3; row++) {
    const y = 300 + row * 70;
    const n = 7 + row * 2;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * (W + 60) - 30 + range(r, -14, 14);
      const th = range(r, 90, 170) * (0.7 + row * 0.18);
      const tw = th * range(r, 0.32, 0.45);
      out += `<rect x="${f(x - 3)}" y="${f(y - 6)}" width="6" height="22" fill="${hsl(25, 30, 18)}"/>`;
      out += `<path d="M ${f(x)} ${f(y - th)} L ${f(x + tw / 2)} ${f(y)} L ${f(x - tw / 2)} ${f(y)} Z" fill="${hsl(h + range(r, -10, 10), s, Math.max(10, l - row * 8 + range(r, -6, 6)))}"/>`;
    }
  }
  return out + `<rect x="-20" y="${f(W - 40)}" width="${W + 40}" height="80" fill="${hsl(h, s * 0.6, Math.max(8, l - 22))}"/>`;
}

function night(r: () => number, h: number, s: number, l: number): string {
  const top = hsl(h, s * 0.7, Math.max(6, l - 26)), low = hsl(h + 20, s, Math.max(14, l - 6));
  let out = `<defs>${grad("sk", [[0, top], [1, low]])}</defs><rect x="-20" y="-20" width="${W + 40}" height="${W + 40}" fill="url(#sk)"/>`;
  for (let i = 0; i < 70; i++) out += `<circle cx="${f(range(r, 0, W))}" cy="${f(range(r, 0, 330))}" r="${f(range(r, 0.8, 2.6))}" fill="#f6efdc" opacity="${f(range(r, 0.3, 0.95))}"/>`;
  const mx = range(r, 120, 400), my = range(r, 80, 170), mr = range(r, 30, 50);
  out += `<circle cx="${f(mx)}" cy="${f(my)}" r="${f(mr)}" fill="#f3e6c4"/><circle cx="${f(mx + mr * 0.45)}" cy="${f(my - mr * 0.2)}" r="${f(mr * 0.9)}" fill="${top}"/>`;
  if (r() > 0.45) {
    let x = -10;
    while (x < W + 10) {
      const bw = range(r, 30, 70), bh = range(r, 60, 200);
      out += `<rect x="${f(x)}" y="${f(W - bh)}" width="${f(bw)}" height="${f(bh + 20)}" fill="${hsl(h, s * 0.5, 7)}"/>`;
      for (let wy = W - bh + 10; wy < W - 10; wy += 16) for (let wx = x + 6; wx < x + bw - 8; wx += 12) if (r() > 0.62) out += `<rect x="${f(wx)}" y="${f(wy)}" width="5" height="7" fill="${hsl(42, 85, 70)}" opacity="0.85"/>`;
      x += bw + range(r, 0, 8);
    }
  } else {
    out += `<path d="${ridge(r, 430, 120)}" fill="${hsl(h, s * 0.5, 7)}"/>`;
  }
  return out;
}

function bloom(r: () => number, h: number, s: number, l: number): string {
  let out = bg(hsl(h + 160 + range(r, -20, 20), s * 0.35, Math.max(14, Math.min(70, l - 6 + (r() > 0.5 ? 30 : 0)))));
  out += strokes(r, h + 160, s * 0.3, l, 8, 0, W);
  const n = Math.floor(range(r, 1, 4));
  for (let k = 0; k < n; k++) {
    const cx = n === 1 ? 256 : range(r, 110, 400), cy = n === 1 ? 230 : range(r, 120, 330);
    const pr = n === 1 ? range(r, 90, 130) : range(r, 50, 85);
    out += `<path d="M ${f(cx)} ${f(cy)} Q ${f(cx + range(r, -60, 60))} ${f((cy + W) / 2)} ${f(cx + range(r, -30, 30))} ${W + 20}" stroke="${hsl(110, 35, 30)}" stroke-width="7" fill="none"/>`;
    out += `<ellipse cx="${f(cx + 40)}" cy="${f(cy + 150)}" rx="44" ry="14" transform="rotate(-30 ${f(cx + 40)} ${f(cy + 150)})" fill="${hsl(115, 35, 34)}"/>`;
    const petals = Math.floor(range(r, 5, 10));
    const ph = hsl(h + range(r, -12, 12), s + 10, Math.min(74, l + 12));
    const ph2 = hsl(h + 8, s + 10, Math.max(20, l - 4));
    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * 360 + range(r, -6, 6);
      out += `<ellipse cx="${f(cx)}" cy="${f(cy - pr * 0.55)}" rx="${f(pr * 0.32)}" ry="${f(pr * 0.6)}" transform="rotate(${f(ang)} ${f(cx)} ${f(cy)})" fill="${i % 2 ? ph : ph2}" opacity="0.95"/>`;
    }
    out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(pr * 0.22)}" fill="${hsl(42, 80, 55)}"/>`;
  }
  return out;
}

function abstract(r: () => number, h: number, s: number, l: number): string {
  let out = bg(hsl(h + range(r, -20, 20), s * 0.6, Math.min(80, l + range(r, -6, 26))));
  const n = Math.floor(range(r, 4, 8));
  for (let i = 0; i < n; i++) {
    const hh = h + (r() > 0.75 ? 180 : range(r, -40, 40));
    const c = hsl(hh, s + range(r, -10, 15), Math.max(10, Math.min(82, l + range(r, -20, 24))));
    const t = r();
    if (t < 0.4) out += `<circle cx="${f(range(r, 60, 450))}" cy="${f(range(r, 60, 450))}" r="${f(range(r, 40, 150))}" fill="${c}" opacity="0.88"/>`;
    else if (t < 0.75) {
      const x = range(r, 0, 380), y = range(r, 0, 380);
      out += `<rect x="${f(x)}" y="${f(y)}" width="${f(range(r, 80, 260))}" height="${f(range(r, 60, 220))}" transform="rotate(${f(range(r, -14, 14))} ${f(x)} ${f(y)})" fill="${c}" opacity="0.9"/>`;
    } else {
      const cx = range(r, 100, 400), cy = range(r, 100, 400), rr = range(r, 60, 160);
      out += `<path d="M ${f(cx - rr)} ${f(cy)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(cx + rr)} ${f(cy)}" stroke="${c}" stroke-width="${f(range(r, 14, 40))}" fill="none"/>`;
    }
  }
  return out;
}
