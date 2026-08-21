'use strict';
/* Gráfico de línea liviano en SVG propio (sin dependencias externas). */
function renderLineChart(container, labels, values){
  const W = 640, H = 280, L = 52, R = 16, T = 18, B = 34;
  const n = values.length;
  const iw = W - L - R, ih = H - T - B;
  let vmin = Math.min(...values), vmax = Math.max(...values);
  if (vmin === vmax) {
    const pad = Math.max(1, Math.abs(vmin) * 0.1);
    vmax = vmin + pad; vmin = Math.max(0, vmin - pad);
  } else {
    const pad = (vmax - vmin) * 0.12;
    vmax += pad; vmin = Math.max(0, vmin - pad);
  }
  const x = i => n === 1 ? L + iw / 2 : L + i * iw / (n - 1);
  const y = v => T + ih - (v - vmin) / (vmax - vmin) * ih;

  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">';
  const rows = 4;
  for (let g = 0; g <= rows; g++) {
    const v = vmin + (vmax - vmin) * g / rows;
    const yy = y(v).toFixed(1);
    s += '<line x1="' + L + '" y1="' + yy + '" x2="' + (W - R) + '" y2="' + yy + '" stroke="var(--line)" stroke-width="1"/>';
    s += '<text x="' + (L - 8) + '" y="' + (+yy + 4) + '" text-anchor="end" font-size="12" fill="var(--muted)">' + fmtTick(v) + '</text>';
  }
  const path = values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  s += '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  const vpeak = Math.max(...values);
  values.forEach((v, i) => {
    s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="5" fill="var(--accent)"/>';
    if (n <= 8 || i === 0 || i === n - 1 || v === vpeak) {
      s += '<text x="' + x(i).toFixed(1) + '" y="' + (y(v) - 10).toFixed(1) + '" text-anchor="middle" font-size="12" fill="var(--text)">' + fmtTick(v) + '</text>';
    }
  });
  const step = Math.max(1, Math.ceil(n / 6));
  labels.forEach((lb, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="12" fill="var(--muted)">' + lb + '</text>';
  });
  s += '</svg>';
  container.innerHTML = s;
}

function fmtTick(v){
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (Math.abs(v) >= 100 || Number.isInteger(v)) return String(Math.round(v));
  return v.toFixed(1);
}
