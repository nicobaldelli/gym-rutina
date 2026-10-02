'use strict';
/* Demos animadas de elongaciones, dibujadas en SVG (sin dependencias, funcionan
   offline). Cada demo son dos poses (inicio → estiramiento) con crossfade CSS.
   La demo se elige por el nombre del estiramiento, así funciona también con
   rutinas ya guardadas. Si el estiramiento tiene "media" (URL de gif/mp4),
   se muestra eso en lugar de la demo. */

const STRETCH_POSES = {
  doorway: { // pecho en marco de puerta
    s: [[[82, 10], [82, 80]]],
    a: { head: [48, 20], ln: [[[48, 26], [50, 52]], [[50, 52], [42, 80]], [[50, 52], [58, 80]], [[48, 30], [38, 44]]], hl: [[[48, 30], [66, 26], [82, 26]]] },
    b: { head: [42, 18], ln: [[[42, 24], [48, 52]], [[48, 52], [40, 80]], [[48, 52], [58, 80]], [[42, 28], [32, 42]]], hl: [[[42, 28], [62, 26], [82, 26]]] }
  },
  benchfly: { // apertura acostado en banco
    s: [[[22, 62], [96, 62]], [[30, 62], [30, 80]], [[88, 62], [88, 80]]],
    a: { head: [86, 52], ln: [[[34, 56], [80, 56]], [[36, 56], [26, 74]]], hl: [[[66, 54], [62, 32]], [[66, 54], [70, 32]]] },
    b: { head: [86, 52], ln: [[[34, 56], [80, 56]], [[36, 56], [26, 74]]], hl: [[[66, 54], [48, 38]], [[66, 54], [84, 36]]] }
  },
  bicepswall: { // bíceps en pared
    s: [[[86, 12], [86, 80]]],
    a: { head: [46, 20], ln: [[[46, 26], [46, 54]], [[46, 54], [38, 80]], [[46, 54], [54, 80]], [[46, 32], [36, 46]]], hl: [[[46, 32], [86, 34]]] },
    b: { head: [40, 20], ln: [[[40, 26], [42, 54]], [[42, 54], [34, 80]], [[42, 54], [50, 80]], [[40, 32], [30, 44]]], hl: [[[40, 32], [86, 34]]] }
  },
  shoulderfront: { // hombro anterior, manos atrás
    a: { head: [58, 18], ln: [[[58, 24], [58, 54]], [[58, 54], [50, 80]], [[58, 54], [66, 80]]], hl: [[[58, 30], [70, 46]], [[58, 30], [66, 48]]] },
    b: { head: [54, 20], ln: [[[54, 26], [58, 54]], [[58, 54], [50, 80]], [[58, 54], [66, 80]]], hl: [[[54, 30], [74, 38]], [[54, 30], [70, 40]]] }
  },
  quad: { // cuádriceps de pie
    a: { head: [56, 16], ln: [[[56, 22], [58, 50]], [[58, 50], [56, 80]], [[57, 28], [48, 42]]], hl: [[[58, 50], [66, 64], [60, 76]], [[57, 28], [66, 48]]] },
    b: { head: [56, 16], ln: [[[56, 22], [58, 50]], [[58, 50], [56, 80]], [[57, 28], [48, 42]]], hl: [[[58, 50], [66, 60], [58, 54]], [[57, 28], [62, 52]]] }
  },
  hamstring: { // femorales sentado
    s: [[[20, 80], [100, 80]]],
    a: { head: [36, 44], ln: [[[38, 74], [36, 50]], [[38, 76], [82, 78]]], hl: [[[36, 54], [54, 64]]] },
    b: { head: [54, 50], ln: [[[38, 74], [52, 56]], [[38, 76], [82, 78]]], hl: [[[52, 58], [76, 74]]] }
  },
  calf: { // gemelos en escalón
    s: [[[60, 80], [60, 66], [98, 66]]],
    a: { head: [64, 14], ln: [[[64, 20], [66, 42]], [[66, 42], [76, 64]], [[76, 64], [84, 66]], [[65, 26], [74, 34]]], hl: [[[66, 42], [66, 62]], [[66, 62], [57, 65]]] },
    b: { head: [64, 17], ln: [[[64, 23], [66, 45]], [[66, 45], [76, 64]], [[76, 64], [84, 66]], [[65, 29], [74, 37]]], hl: [[[66, 45], [66, 64]], [[66, 64], [56, 73]]] }
  },
  crossshoulder: { // hombro cruzado
    a: { head: [60, 18], ln: [[[60, 24], [60, 54]], [[60, 54], [52, 80]], [[60, 54], [68, 80]], [[54, 32], [44, 42]]], hl: [[[66, 32], [46, 36]]] },
    b: { head: [60, 18], ln: [[[60, 24], [60, 54]], [[60, 54], [52, 80]], [[60, 54], [68, 80]], [[54, 32], [42, 38]]], hl: [[[66, 32], [40, 34]]] }
  },
  glute4: { // glúteos figura 4
    s: [[[12, 80], [104, 80]]],
    a: { head: [18, 70], ln: [[[26, 74], [50, 74]], [[34, 72], [56, 60]]], hl: [[[50, 74], [62, 56]], [[62, 56], [74, 64]], [[52, 70], [68, 54]]] },
    b: { head: [18, 70], ln: [[[26, 74], [50, 74]], [[34, 72], [52, 56]]], hl: [[[50, 74], [58, 52]], [[58, 52], [70, 60]], [[50, 68], [64, 50]]] }
  },
  hang: { // dorsal colgado de la barra
    s: [[[36, 10], [88, 10]]],
    a: { head: [62, 26], ln: [[[62, 32], [62, 56]], [[62, 56], [57, 78]], [[62, 56], [67, 78]]], hl: [[[54, 10], [58, 32]], [[70, 10], [66, 32]]] },
    b: { head: [62, 30], ln: [[[62, 36], [62, 60]], [[62, 60], [57, 80]], [[62, 60], [67, 80]]], hl: [[[54, 10], [58, 36]], [[70, 10], [66, 36]]] }
  },
  prayer: { // posición de rezo
    s: [[[10, 80], [106, 80]]],
    a: { head: [38, 60], ln: [[[66, 66], [44, 64]], [[66, 66], [72, 78]], [[72, 78], [86, 78]]], hl: [[[44, 64], [22, 74]]] },
    b: { head: [34, 66], ln: [[[66, 68], [42, 70]], [[66, 68], [72, 78]], [[72, 78], [86, 78]]], hl: [[[42, 70], [18, 78]]] }
  },
  triceps: { // tríceps detrás de la nuca
    a: { head: [60, 22], ln: [[[60, 28], [60, 54]], [[60, 54], [52, 80]], [[60, 54], [68, 80]], [[56, 30], [48, 16], [60, 10]]], hl: [[[64, 30], [68, 12], [74, 22]]] },
    b: { head: [60, 22], ln: [[[60, 28], [60, 54]], [[60, 54], [52, 80]], [[60, 54], [68, 80]], [[56, 30], [46, 14], [56, 8]]], hl: [[[64, 30], [60, 10], [68, 20]]] }
  },
  kneeschest: { // lumbar, rodillas al pecho
    s: [[[12, 80], [104, 80]]],
    a: { head: [18, 70], ln: [[[26, 74], [48, 74]], [[34, 72], [56, 58]]], hl: [[[48, 74], [58, 56]], [[58, 56], [70, 64]]] },
    b: { head: [18, 70], ln: [[[26, 74], [48, 74]], [[34, 72], [52, 54]]], hl: [[[48, 74], [52, 52]], [[52, 52], [64, 56]]] }
  },
  generic: { // genérico: estiramiento lateral con brazo arriba
    a: { head: [58, 18], ln: [[[58, 24], [58, 54]], [[58, 54], [50, 80]], [[58, 54], [66, 80]], [[58, 30], [50, 44]]], hl: [[[58, 28], [64, 12]]] },
    b: { head: [52, 20], ln: [[[52, 26], [58, 54]], [[58, 54], [50, 80]], [[58, 54], [66, 80]], [[52, 32], [44, 44]]], hl: [[[52, 30], [68, 16]]] }
  }
};

const STRETCH_RULES = [
  [/marco de puerta|doorway|pecho en/i, 'doorway'],
  [/apertura.*(banco|acostad)/i, 'benchfly'],
  [/b[ií]ceps.*pared/i, 'bicepswall'],
  [/hombro anterior|manos atr[aá]s/i, 'shoulderfront'],
  [/cu[aá]driceps/i, 'quad'],
  [/femoral|isquio/i, 'hamstring'],
  [/gemelo|pantorrilla|calf|escal[oó]n/i, 'calf'],
  [/hombro cruzado|cruzado/i, 'crossshoulder'],
  [/gl[uú]teo|figura 4|piriforme/i, 'glute4'],
  [/dorsal|colgado/i, 'hang'],
  [/rezo|child|ni[nñ]o|plegaria/i, 'prayer'],
  [/tr[ií]ceps/i, 'triceps'],
  [/lumbar|rodillas al pecho/i, 'kneeschest']
];

function _sdStrokes(list, cls){
  return (list || []).map(p =>
    '<path class="' + cls + '" d="M' + p.map(pt => pt.join(' ')).join(' L ') + '"/>'
  ).join('');
}
function _sdPose(pose, phase){
  return '<g class="sd-' + phase + '"><circle class="sd-head" cx="' + pose.head[0] + '" cy="' + pose.head[1] + '" r="6"/>' +
    _sdStrokes(pose.ln, 'sd-l') + _sdStrokes(pose.hl, 'sd-h') + '</g>';
}

function stretchDemoSVG(name){
  let key = 'generic';
  for (const [re, k] of STRETCH_RULES) if (re.test(name || '')) { key = k; break; }
  const d = STRETCH_POSES[key] || STRETCH_POSES.generic;
  return '<svg viewBox="0 0 120 90" aria-hidden="true">' +
    _sdStrokes(d.s, 'sd-s') + _sdPose(d.a, 'a') + _sdPose(d.b, 'b') + '</svg>';
}

/* Media del estiramiento: URL propia (gif/mp4/webm) si la tiene, si no la demo SVG. */
function stretchMediaHTML(st){
  const esc_ = typeof esc === 'function' ? esc : (x => x);
  if (st.media) {
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(st.media)) {
      return `<video class="stretch-media" src="${esc_(st.media)}" autoplay muted loop playsinline preload="metadata"></video>`;
    }
    return `<img class="stretch-media" src="${esc_(st.media)}" alt="" loading="lazy">`;
  }
  return '<div class="stretch-demo">' + stretchDemoSVG(st.name) + '</div>';
}
