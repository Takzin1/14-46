import * as THREE from 'three';

// Original simplified sign designs for this game (not reproductions of official pictograms).

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic","IPAGothic","Meiryo",sans-serif';

/** Running figure going up a slope + wave — drawn with simple shapes. */
function drawEvacPictogram(g: CanvasRenderingContext2D, x: number, y: number, s: number, building = false) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (building) {
    g.fillRect(52, 8, 40, 84);
    g.fillStyle = '#1f7a4a';
    for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) g.fillRect(58 + q * 18, 16 + r * 18, 10, 10);
    g.fillStyle = '#fff';
  } else {
    g.beginPath();
    g.moveTo(10, 92);
    g.lineTo(92, 30);
    g.lineTo(92, 92);
    g.closePath();
    g.fill();
  }
  // figure
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(building ? 40 : 58, building ? 20 : 12, 7, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 7;
  g.beginPath();
  const fx = building ? 36 : 54;
  const fy = building ? 30 : 22;
  g.moveTo(fx, fy);
  g.lineTo(fx - 6, fy + 22);
  g.lineTo(fx + 6, fy + 36);
  g.moveTo(fx - 6, fy + 22);
  g.lineTo(fx - 18, fy + 30);
  g.moveTo(fx - 2, fy + 6);
  g.lineTo(fx + 12, fy + 12);
  g.moveTo(fx - 2, fy + 6);
  g.lineTo(fx - 14, fy + 12);
  g.stroke();
  // wave
  g.fillStyle = '#9fd6ff';
  g.beginPath();
  g.moveTo(0, 100);
  g.quadraticCurveTo(6, 70, 26, 74);
  g.quadraticCurveTo(14, 80, 22, 92);
  g.lineTo(40, 100);
  g.closePath();
  g.fill();
  g.restore();
}

export function evacSignTexture(kind: 'area' | 'building', name: string, arrow: '↑' | '←' | '→' | '↓' | '', dist: string) {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#1f7a4a';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 240);
  drawEvacPictogram(g, 24, 30, 1.6, kind === 'building');
  g.fillStyle = '#fff';
  g.font = `bold 40px ${FONT}`;
  g.fillText(kind === 'area' ? '津波避難場所' : '津波避難ビル', 200, 70);
  g.font = `bold 30px ${FONT}`;
  g.fillText(name, 200, 120);
  g.font = `bold 64px ${FONT}`;
  g.fillText(arrow, 200, 210);
  g.font = `bold 44px ${FONT}`;
  g.fillText(dist, 270, 205);
  g.font = `18px ${FONT}`;
  g.fillText('※ゲーム用の簡略デザイン', 300, 240);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function plainSignTexture(lines: string[], bg = '#f4f1e8', fg = '#2a2a2a', w = 512, h = 192) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg;
  const maxChars = Math.max(...lines.map((l) => l.length));
  const size = Math.min(Math.floor((h - 30) / lines.length) * 0.72, ((w - 28) / maxChars) * 0.95);
  g.font = `bold ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, ((i + 0.5) * (h - 20)) / lines.length + 10));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function elevationSignTexture(meters: string) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#1f5fa8';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = `bold 34px ${FONT}`;
  g.fillText('海抜', 64, 70);
  g.font = `bold 56px ${FONT}`;
  g.fillText(meters, 64, 150);
  g.font = `bold 34px ${FONT}`;
  g.fillText('m', 64, 205);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function windowsTexture(floors: number, cols: number, base = '#d9d4c7') {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const fh = 256 / floors;
  const cw = 256 / cols;
  for (let f = 0; f < floors; f++) {
    for (let q = 0; q < cols; q++) {
      g.fillStyle = '#5b7287';
      g.fillRect(q * cw + cw * 0.18, f * fh + fh * 0.25, cw * 0.64, fh * 0.45);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, f * fh + fh - 3, 256, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function houseWallTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#56606a';
  g.fillRect(18, 22, 30, 26);
  g.fillRect(80, 22, 30, 26);
  g.fillRect(18, 78, 30, 26);
  g.fillStyle = '#8a6d52';
  g.fillRect(82, 74, 24, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
