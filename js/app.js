'use strict';
/* Lógica principal: ruteo por hash, sesiones, historial, progresión,
   edición de rutina, import/export y ajustes. */

const KG_PER_LB = 0.45359237;
let routine = null;
let settings = { unit: 'kg', restSec: 100 };
let pendingImport = null; // rutina validada esperando confirmación
let saveTimer = null;

const $ = sel => document.querySelector(sel);

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function uid(){ return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayISO(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtDate(iso){ if (!iso) return ''; const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function fmtSecs(sec){ const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
function round2(n){ return Math.round(n * 100) / 100; }

const byDateDesc = (a, b) => a.date === b.date ? (b.startedAt || 0) - (a.startedAt || 0) : (a.date < b.date ? 1 : -1);
const byDateAsc = (a, b) => a.date === b.date ? (a.startedAt || 0) - (b.startedAt || 0) : (a.date < b.date ? -1 : 1);

// ---- unidades: siempre guardamos kg; convertimos solo al mostrar ----
function kgToDisplay(kg){
  if (settings.unit === 'lb') return Math.round(kg / KG_PER_LB); // redondeo a 1 lb
  return Math.round(kg * 2) / 2; // redondeo a 0,5 kg
}
function displayToKg(v){
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) return null;
  return settings.unit === 'lb' ? n * KG_PER_LB : n;
}
function fmtWeight(kg, withUnit){
  if (kg == null) return '—';
  const v = kgToDisplay(kg);
  const s = (settings.unit === 'kg' && !Number.isInteger(v)) ? v.toFixed(1) : String(v);
  return withUnit === false ? s : s + ' ' + settings.unit;
}

// ---- helpers de UI ----
let toastId = null;
function toast(msg, ms){
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastId); toastId = setTimeout(() => el.classList.remove('show'), ms || 2200);
}
function setView(html){
  const root = document.createElement('div');
  root.innerHTML = html;
  $('#view').replaceChildren(root);
  window.scrollTo(0, 0);
  return root;
}
function setNav(name){
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
}
function download(name, content, type){
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---- ruteo ----
function route(){
  const parts = (location.hash || '#/home').split('/');
  const view = parts[1] || 'home', a = parts[2], b = parts[3];
  switch (view) {
    case 'home': return renderHome();
    case 'session': return renderSession(a);
    case 'history': return a ? renderHistoryDetail(a) : renderHistory();
    case 'progress': return renderProgress();
    case 'routine': return renderRoutine();
    case 'exercise': return renderExerciseEditor(a, b);
    case 'import': return renderImportPreview();
    case 'settings': return renderSettings();
    default: return renderHome();
  }
}

// ---- inicio ----
async function renderHome(){
  setNav('home');
  const sessions = await getAllSessions();
  const open = sessions.filter(s => s.status === 'open').sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  let html = '<h1 class="apptitle">💪 Mi rutina</h1>';
  if (open.length) {
    html += '<div class="section-label">Sesión en curso</div>';
    for (const s of open) {
      html += `<a class="card card-resume" href="#/session/${s.id}"><div><div class="card-title">${esc(s.dayName)}</div><div class="card-sub">${fmtDate(s.date)} — tocá para continuar</div></div><div class="chev">›</div></a>`;
    }
  }
  html += '<div class="section-label">Elegí el día de hoy</div>';
  routine.days.forEach((d, i) => {
    html += `<button class="card card-day" data-day="${esc(d.id)}"><div class="daynum">${i + 1}</div><div><div class="card-title">${esc(d.name)}</div><div class="card-sub">${d.exercises.length} ejercicios</div></div></button>`;
  });
  const root = setView(html);
  root.querySelectorAll('.card-day').forEach(btn =>
    btn.addEventListener('click', () => startSession(btn.dataset.day))
  );
}

async function startSession(dayId){
  const day = routine.days.find(d => d.id === dayId);
  if (!day) return;
  const s = {
    id: 's' + Date.now(),
    dayId: day.id,
    dayName: day.name,
    date: todayISO(),
    startedAt: Date.now(),
    status: 'open',
    entries: day.exercises.map(x => ({
      exerciseId: x.id,
      name: x.name,
      type: x.type || 'reps',
      sets: Array.from({ length: x.sets || 3 }, () => ({ w: null, r: null }))
    }))
  };
  await putSession(s);
  location.hash = '#/session/' + s.id;
}

// ---- sesión de entrenamiento ----
function findPrev(others, name){
  for (const o of others) {
    const en = (o.entries || []).find(x => x.name === name);
    if (en) {
      const sets = en.sets.filter(t => t.w != null || t.r != null);
      if (sets.length) return { date: o.date, sets };
    }
  }
  return null;
}

function setRowHTML(ei, si, t){
  const w = t.w != null ? fmtWeight(t.w, false) : '';
  const r = t.r != null ? t.r : '';
  return `<div class="set-row" data-ei="${ei}" data-si="${si}">
    <span class="set-n">${si + 1}</span>
    <input class="in-w" type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="${w}">
    <input class="in-r" type="number" inputmode="numeric" step="1" min="0" placeholder="0" value="${r}">
    <button class="btn-timer" title="Arrancar descanso">⏱</button>
  </div>`;
}

async function renderSession(id){
  setNav('home');
  const s = await getSession(id);
  if (!s) { toast('No se encontró la sesión'); location.hash = '#/home'; return; }
  const day = routine.days.find(d => d.id === s.dayId);
  const others = (await getAllSessions()).filter(x => x.id !== s.id).sort(byDateDesc);
  const backHref = s.status === 'done' ? '#/history/' + s.id : '#/home';

  let html = `<div class="session-head">
    <a class="back" href="${backHref}">‹ Volver</a>
    <h2>${esc(s.dayName)}</h2>
    <label class="date-row">Fecha <input type="date" id="sessDate" value="${esc(s.date)}"></label>
  </div>`;

  s.entries.forEach((en, ei) => {
    const meta = day ? (day.exercises.find(x => x.id === en.exerciseId) || day.exercises.find(x => x.name === en.name)) : null;
    const prev = findPrev(others, en.name);
    const isTime = en.type === 'time';
    html += `<section class="exercise card">
      <div class="ex-head">
        <div>
          <div class="ex-name">${esc(en.name)}</div>
          ${meta ? `<div class="ex-meta">${esc(meta.group)}${meta.grip ? ' · ' + esc(meta.grip) : ''}</div>
          <div class="ex-meta">${esc(meta.sets + ' x ' + meta.repsTarget)} · descanso ${fmtSecs(meta.restSec || settings.restSec)}</div>` : ''}
        </div>
        ${meta && meta.url ? `<a class="demo" href="${esc(meta.url)}" target="_blank" rel="noopener">Ver demo ↗</a>` : ''}
      </div>`;
    if (prev) {
      html += `<div class="prev">Última vez (${fmtDate(prev.date)}): ${prev.sets.map(t => (t.w != null ? fmtWeight(t.w, false) : '—') + '×' + (t.r != null ? t.r : '—')).join(' · ')} ${settings.unit}</div>`;
    }
    html += `<div class="sets" data-ei="${ei}">
      <div class="set-row set-row-head"><span>#</span><span>Peso (${settings.unit})</span><span>${isTime ? 'Seg' : 'Reps'}</span><span></span></div>`;
    en.sets.forEach((t, si) => { html += setRowHTML(ei, si, t); });
    html += `</div>
      <button class="btn-ghost add-set" data-ei="${ei}">+ serie</button>
    </section>`;
  });

  if (day && day.stretches && day.stretches.length) {
    html += `<details class="card stretches"><summary>🧘 Elongación post-entreno</summary><ul>` +
      day.stretches.map(x => `<li>${esc(x.name)}${x.url ? ` — <a href="${esc(x.url)}" target="_blank" rel="noopener">ver ↗</a>` : ''}</li>`).join('') +
      `</ul></details>`;
  }

  html += `<div class="session-actions">
    <button id="finishBtn" class="btn-primary">${s.status === 'done' ? 'Guardar cambios' : 'Finalizar sesión'}</button>
    ${s.status === 'open' ? '<button id="discardBtn" class="btn-danger">Descartar sesión</button>' : ''}
    <div class="savehint" id="saveHint"></div>
  </div>`;

  const root = setView(html);
  bindSession(root, s, day);
}

function bindSession(root, s, day){
  const hint = root.querySelector('#saveHint');
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await putSession(s);
      if (hint) {
        hint.textContent = 'Guardado ✓';
        setTimeout(() => { if (hint.textContent === 'Guardado ✓') hint.textContent = ''; }, 1500);
      }
    }, 300);
  };

  root.querySelector('#sessDate').addEventListener('change', e => {
    if (e.target.value) { s.date = e.target.value; save(); }
  });

  root.addEventListener('input', e => {
    const row = e.target.closest('.set-row');
    if (!row || row.classList.contains('set-row-head')) return;
    const t = s.entries[+row.dataset.ei].sets[+row.dataset.si];
    if (e.target.classList.contains('in-w')) t.w = displayToKg(e.target.value);
    if (e.target.classList.contains('in-r')) {
      const n = parseFloat(e.target.value);
      t.r = isNaN(n) ? null : n;
    }
    save();
  });

  root.addEventListener('click', async e => {
    const tbtn = e.target.closest('.btn-timer');
    if (tbtn) {
      const en = s.entries[+tbtn.closest('.set-row').dataset.ei];
      const meta = day ? (day.exercises.find(x => x.id === en.exerciseId) || day.exercises.find(x => x.name === en.name)) : null;
      Timer.start((meta && meta.restSec) || settings.restSec);
      return;
    }
    const add = e.target.closest('.add-set');
    if (add) {
      const ei = +add.dataset.ei;
      const en = s.entries[ei];
      en.sets.push({ w: null, r: null });
      root.querySelector(`.sets[data-ei="${ei}"]`)
        .insertAdjacentHTML('beforeend', setRowHTML(ei, en.sets.length - 1, en.sets[en.sets.length - 1]));
      save();
      return;
    }
    if (e.target.id === 'finishBtn') {
      const wasDone = s.status === 'done';
      if (!wasDone) { s.status = 'done'; s.finishedAt = Date.now(); }
      clearTimeout(saveTimer);
      await putSession(s);
      toast(wasDone ? 'Cambios guardados ✓' : 'Sesión guardada 💪');
      location.hash = wasDone ? '#/history/' + s.id : '#/home';
      return;
    }
    if (e.target.id === 'discardBtn') {
      if (confirm('¿Descartar esta sesión y sus datos?')) {
        clearTimeout(saveTimer);
        await deleteSession(s.id);
        toast('Sesión descartada');
        location.hash = '#/home';
      }
    }
  });
}

// ---- historial ----
function countSets(s){
  let n = 0;
  for (const en of s.entries) n += en.sets.filter(t => t.w != null || t.r != null).length;
  return n;
}
function totalVolume(s){
  let v = 0;
  for (const en of s.entries) for (const t of en.sets) if (t.w != null && t.r != null) v += t.w * t.r;
  return v;
}

async function renderHistory(){
  setNav('history');
  const sessions = (await getAllSessions()).sort(byDateDesc);
  let html = '<h1 class="apptitle">Historial</h1>';
  if (!sessions.length) html += '<p class="empty">Todavía no hay sesiones.<br>¡Arrancá una desde Inicio!</p>';
  for (const s of sessions) {
    html += `<a class="card card-row" href="#/history/${s.id}">
      <div><div class="card-title">${esc(s.dayName)}</div>
      <div class="card-sub">${fmtDate(s.date)}${s.status === 'open' ? ' · en curso' : ''} · ${countSets(s)} series · vol. ${fmtWeight(totalVolume(s))}</div></div>
      <div class="chev">›</div></a>`;
  }
  setView(html);
}

async function renderHistoryDetail(id){
  setNav('history');
  const s = await getSession(id);
  if (!s) { location.hash = '#/history'; return; }
  let html = `<div class="session-head"><a class="back" href="#/history">‹ Historial</a>
    <h2>${esc(s.dayName)}</h2>
    <div class="card-sub">${fmtDate(s.date)}${s.status === 'open' ? ' · en curso' : ''} · volumen total ${fmtWeight(totalVolume(s))}</div></div>`;
  for (const en of s.entries) {
    const sets = en.sets.filter(t => t.w != null || t.r != null);
    html += `<div class="card"><div class="ex-name">${esc(en.name)}</div>` +
      (sets.length
        ? `<div class="detail-sets">${sets.map((t, i) => `<span class="pill">${i + 1}: ${t.w != null ? fmtWeight(t.w, false) : '—'}×${t.r != null ? t.r : '—'}${en.type === 'time' ? '″' : ''}</span>`).join('')}</div>`
        : '<div class="card-sub">Sin datos</div>') +
      '</div>';
  }
  html += `<div class="session-actions">
    <a class="btn-primary" href="#/session/${s.id}">✏️ Editar sesión</a>
    <button id="delSess" class="btn-danger">🗑 Borrar sesión</button></div>`;
  const root = setView(html);
  root.querySelector('#delSess').addEventListener('click', async () => {
    if (confirm('¿Borrar esta sesión? No se puede deshacer.')) {
      await deleteSession(s.id);
      toast('Sesión borrada');
      location.hash = '#/history';
    }
  });
}

// ---- progresión ----
let progressSel = null;
async function renderProgress(){
  setNav('progress');
  const sessions = (await getAllSessions()).sort(byDateAsc);
  const names = [];
  routine.days.forEach(d => d.exercises.forEach(x => { if (!names.includes(x.name)) names.push(x.name); }));
  sessions.forEach(s => s.entries.forEach(en => { if (!names.includes(en.name)) names.push(en.name); }));
  if (!names.length) { setView('<h1 class="apptitle">Progresión</h1><p class="empty">No hay ejercicios.</p>'); return; }
  const sel = names.includes(progressSel) ? progressSel : names[0];

  const pts = [];
  for (const s of sessions) {
    const en = s.entries.find(x => x.name === sel);
    if (!en) continue;
    const sets = en.sets.filter(t => t.w != null && t.r != null && t.r > 0);
    if (!sets.length) continue;
    pts.push({
      date: s.date,
      max: Math.max.apply(null, sets.map(t => t.w)),
      vol: sets.reduce((a, t) => a + t.w * t.r, 0)
    });
  }

  let html = `<h1 class="apptitle">Progresión</h1>
    <select id="progSel" class="input">${names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  if (!pts.length) {
    html += '<p class="empty">Sin datos todavía para este ejercicio.<br>Registrá alguna sesión primero.</p>';
  } else {
    html += `<div class="card"><div class="chart-title">Peso máximo por sesión (${settings.unit})</div><div id="chartMax"></div></div>
      <div class="card"><div class="chart-title">Volumen total por sesión (peso × reps, ${settings.unit})</div><div id="chartVol"></div></div>`;
  }
  const root = setView(html);
  root.querySelector('#progSel').addEventListener('change', e => {
    progressSel = e.target.value;
    renderProgress();
  });
  if (pts.length) {
    const labels = pts.map(p => fmtDate(p.date).slice(0, 5));
    renderLineChart(root.querySelector('#chartMax'), labels, pts.map(p => kgToDisplay(p.max)));
    renderLineChart(root.querySelector('#chartVol'), labels, pts.map(p => Math.round(kgToDisplay(p.vol))));
  }
}

// ---- edición de rutina ----
async function renderRoutine(){
  setNav('routine');
  let html = '<h1 class="apptitle">Editar rutina</h1>';
  routine.days.forEach(d => {
    html += `<div class="card"><div class="ex-name">${esc(d.name)}</div><div class="ex-list">`;
    d.exercises.forEach((x, i) => {
      html += `<div class="ex-row">
        <div class="ex-row-info"><div>${esc(x.name)}</div><div class="card-sub">${esc(x.group)} · ${x.sets} x ${esc(x.repsTarget)}${x.type === 'time' ? ' (tiempo)' : ''}</div></div>
        <div class="ex-row-btns">
          <button class="btn-icon mv" data-d="${esc(d.id)}" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icon mv" data-d="${esc(d.id)}" data-i="${i}" data-dir="1" ${i === d.exercises.length - 1 ? 'disabled' : ''}>↓</button>
          <a class="btn-icon" href="#/exercise/${esc(d.id)}/${esc(x.id)}">✏️</a>
          <button class="btn-icon del" data-d="${esc(d.id)}" data-i="${i}">✕</button>
        </div></div>`;
    });
    html += `</div><a class="btn-ghost" href="#/exercise/${esc(d.id)}/new">+ Agregar ejercicio</a></div>`;
  });
  html += `<div class="card">
    <div class="ex-name">Importar / Exportar</div>
    <button id="impRoutine" class="btn-ghost">⬆️ Importar rutina (JSON)</button>
    <input type="file" id="impFile" accept=".json,application/json" hidden>
    <button id="expRoutine" class="btn-ghost">⬇️ Exportar rutina (JSON)</button>
    <button id="expHistJson" class="btn-ghost">⬇️ Exportar historial (JSON)</button>
    <button id="expHistCsv" class="btn-ghost">⬇️ Exportar historial (CSV)</button>
    <div class="card-sub">El esquema JSON está documentado en el README del proyecto.</div>
  </div>`;
  const root = setView(html);

  root.querySelectorAll('.mv').forEach(b => b.addEventListener('click', async () => {
    const d = routine.days.find(x => x.id === b.dataset.d);
    const i = +b.dataset.i, j = i + (+b.dataset.dir);
    const it = d.exercises.splice(i, 1)[0];
    d.exercises.splice(j, 0, it);
    await setKV('routine', routine);
    renderRoutine();
  }));
  root.querySelectorAll('.del').forEach(b => b.addEventListener('click', async () => {
    const d = routine.days.find(x => x.id === b.dataset.d);
    const i = +b.dataset.i;
    if (confirm('¿Borrar "' + d.exercises[i].name + '" de la rutina?')) {
      d.exercises.splice(i, 1);
      await setKV('routine', routine);
      renderRoutine();
    }
  }));
  root.querySelector('#expRoutine').addEventListener('click', () =>
    download('rutina.json', JSON.stringify(routine, null, 2), 'application/json'));
  root.querySelector('#impRoutine').addEventListener('click', () => root.querySelector('#impFile').click());
  root.querySelector('#impFile').addEventListener('change', onImportFile);
  root.querySelector('#expHistJson').addEventListener('click', async () => {
    const ss = (await getAllSessions()).sort(byDateAsc);
    download('historial.json', JSON.stringify(ss, null, 2), 'application/json');
  });
  root.querySelector('#expHistCsv').addEventListener('click', async () => {
    const ss = (await getAllSessions()).sort(byDateAsc);
    const q = t => '"' + String(t).replace(/"/g, '""') + '"';
    let csv = 'fecha,dia,ejercicio,serie,peso_kg,reps_o_seg\n';
    for (const s of ss) for (const en of s.entries) en.sets.forEach((t, i) => {
      if (t.w == null && t.r == null) return;
      csv += [s.date, q(s.dayName), q(en.name), i + 1, t.w != null ? round2(t.w) : '', t.r != null ? t.r : ''].join(',') + '\n';
    });
    download('historial.csv', csv, 'text/csv');
  });
}

// ---- import de rutina ----
function strOr(v){ return typeof v === 'string' ? v : ''; }
function validateRoutine(obj){
  const errors = [];
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
    return { ok: false, errors: ['La raíz debe ser un objeto con la propiedad "days".'] };
  if (!Array.isArray(obj.days) || !obj.days.length)
    return { ok: false, errors: ['Falta "days": lista con al menos un día.'] };
  const days = obj.days.map((d, di) => {
    if (typeof d !== 'object' || d === null) { errors.push(`Día ${di + 1}: debe ser un objeto.`); return null; }
    if (!d.name || typeof d.name !== 'string') errors.push(`Día ${di + 1}: falta "name" (texto).`);
    if (!Array.isArray(d.exercises) || !d.exercises.length) errors.push(`Día ${di + 1}: falta "exercises" (lista con al menos un ejercicio).`);
    const exercises = (Array.isArray(d.exercises) ? d.exercises : []).map((x, xi) => {
      const tag = `Día ${di + 1}, ejercicio ${xi + 1}`;
      if (typeof x !== 'object' || x === null) { errors.push(`${tag}: debe ser un objeto.`); return null; }
      if (!x.name || typeof x.name !== 'string') errors.push(`${tag}: falta "name".`);
      const sets = Number(x.sets);
      if (x.sets != null && (!Number.isInteger(sets) || sets < 1 || sets > 20)) errors.push(`${tag}: "sets" debe ser un entero entre 1 y 20.`);
      if (x.type != null && x.type !== 'reps' && x.type !== 'time') errors.push(`${tag}: "type" debe ser "reps" o "time".`);
      const rest = Number(x.restSec);
      if (x.restSec != null && (isNaN(rest) || rest < 5 || rest > 3600)) errors.push(`${tag}: "restSec" debe ser un número entre 5 y 3600.`);
      return {
        id: typeof x.id === 'string' ? x.id : uid(),
        group: strOr(x.group),
        name: String(x.name || ''),
        grip: strOr(x.grip),
        sets: Number.isInteger(sets) && sets > 0 ? sets : 3,
        repsTarget: strOr(x.repsTarget) || '8-12',
        type: x.type === 'time' ? 'time' : 'reps',
        restSec: !isNaN(rest) && rest >= 5 ? rest : DEFAULT_REST,
        url: strOr(x.url)
      };
    }).filter(Boolean);
    const stretches = Array.isArray(d.stretches)
      ? d.stretches.filter(t => t && t.name).map(t => ({ name: String(t.name), url: strOr(t.url) }))
      : [];
    return { id: typeof d.id === 'string' ? d.id : uid(), name: String(d.name || `Día ${di + 1}`), exercises, stretches };
  }).filter(Boolean);
  if (errors.length) return { ok: false, errors };
  return { ok: true, routine: { version: 1, days } };
}

async function onImportFile(e){
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let obj;
  try { obj = JSON.parse(await f.text()); }
  catch (err) { alert('El archivo no es JSON válido:\n' + err.message); return; }
  const res = validateRoutine(obj);
  if (!res.ok) { alert('La rutina no es válida:\n\n- ' + res.errors.join('\n- ')); return; }
  pendingImport = res.routine;
  location.hash = '#/import';
}

function renderImportPreview(){
  setNav('routine');
  if (!pendingImport) { location.hash = '#/routine'; return; }
  let html = `<div class="session-head"><a class="back" href="#/routine">‹ Rutina</a><h2>Vista previa de importación</h2>
    <div class="card-sub">Esto reemplaza tu rutina actual. El historial de sesiones no se toca.</div></div>`;
  pendingImport.days.forEach(d => {
    html += `<div class="card"><div class="ex-name">${esc(d.name)}</div><ul class="preview-list">` +
      d.exercises.map(x => `<li>${esc(x.name)} — ${x.sets} x ${esc(x.repsTarget)}${x.type === 'time' ? ' (tiempo)' : ''}</li>`).join('') +
      `</ul>` +
      (d.stretches.length ? `<div class="card-sub">${d.stretches.length} estiramientos</div>` : '') +
      '</div>';
  });
  html += `<div class="session-actions">
    <button id="impOk" class="btn-primary">Confirmar e importar</button>
    <button id="impNo" class="btn-ghost">Cancelar</button></div>`;
  const root = setView(html);
  root.querySelector('#impOk').addEventListener('click', async () => {
    routine = pendingImport;
    pendingImport = null;
    await setKV('routine', routine);
    toast('Rutina importada ✓');
    location.hash = '#/routine';
  });
  root.querySelector('#impNo').addEventListener('click', () => {
    pendingImport = null;
    location.hash = '#/routine';
  });
}

// ---- editor de ejercicio ----
function renderExerciseEditor(dayId, exId){
  setNav('routine');
  const day = routine.days.find(d => d.id === dayId);
  if (!day) { location.hash = '#/routine'; return; }
  const isNew = exId === 'new';
  const x = isNew
    ? { group: '', name: '', grip: '', sets: 3, repsTarget: '8-12', type: 'reps', restSec: settings.restSec, url: '' }
    : day.exercises.find(e => e.id === exId);
  if (!x) { location.hash = '#/routine'; return; }

  const root = setView(`
    <div class="session-head"><a class="back" href="#/routine">‹ Rutina</a>
    <h2>${isNew ? 'Nuevo ejercicio' : 'Editar ejercicio'}</h2><div class="card-sub">${esc(day.name)}</div></div>
    <div class="card form">
      <label>Nombre<input id="f-name" class="input" value="${esc(x.name)}"></label>
      <label>Grupo muscular<input id="f-group" class="input" value="${esc(x.group)}"></label>
      <label>Agarre<input id="f-grip" class="input" value="${esc(x.grip)}"></label>
      <div class="form-row">
        <label>Series<input id="f-sets" class="input" type="number" min="1" max="20" value="${x.sets}"></label>
        <label>Reps objetivo<input id="f-reps" class="input" value="${esc(x.repsTarget)}"></label>
      </div>
      <div class="form-row">
        <label>Tipo<select id="f-type" class="input">
          <option value="reps" ${x.type !== 'time' ? 'selected' : ''}>Repeticiones</option>
          <option value="time" ${x.type === 'time' ? 'selected' : ''}>Tiempo (seg)</option>
        </select></label>
        <label>Descanso (seg)<input id="f-rest" class="input" type="number" min="5" value="${x.restSec || settings.restSec}"></label>
      </div>
      <label>URL de demo<input id="f-url" class="input" type="url" placeholder="https://..." value="${esc(x.url)}"></label>
    </div>
    <div class="session-actions"><button id="f-save" class="btn-primary">Guardar</button></div>`);

  root.querySelector('#f-save').addEventListener('click', async () => {
    const name = root.querySelector('#f-name').value.trim();
    if (!name) { toast('Poné un nombre'); return; }
    const data = {
      name,
      group: root.querySelector('#f-group').value.trim(),
      grip: root.querySelector('#f-grip').value.trim(),
      sets: Math.max(1, parseInt(root.querySelector('#f-sets').value) || 3),
      repsTarget: root.querySelector('#f-reps').value.trim() || '8-12',
      type: root.querySelector('#f-type').value,
      restSec: Math.max(5, parseInt(root.querySelector('#f-rest').value) || settings.restSec),
      url: root.querySelector('#f-url').value.trim()
    };
    if (isNew) day.exercises.push(Object.assign({ id: uid() }, data));
    else Object.assign(x, data);
    await setKV('routine', routine);
    toast('Guardado ✓');
    location.hash = '#/routine';
  });
}

// ---- ajustes ----
async function renderSettings(){
  setNav('settings');
  const root = setView(`
    <h1 class="apptitle">Ajustes</h1>
    <div class="card form">
      <label>Unidad de peso
        <div class="seg">
          <button id="u-kg" class="seg-btn ${settings.unit === 'kg' ? 'on' : ''}">kg</button>
          <button id="u-lb" class="seg-btn ${settings.unit === 'lb' ? 'on' : ''}">lb</button>
        </div>
      </label>
      <div class="card-sub">Los pesos se guardan siempre en kg: podés cambiar de unidad sin romper el historial.</div>
      <label>Descanso por defecto (segundos)<input id="s-rest" class="input" type="number" min="5" value="${settings.restSec}"></label>
      <button id="s-notif" class="btn-ghost">🔔 Activar notificaciones del timer</button>
    </div>
    <div class="card form">
      <button id="s-wipe" class="btn-danger">🗑 Borrar TODOS los datos</button>
      <div class="card-sub">Rutina, historial y ajustes. Todo vive solo en este dispositivo: hacé backups desde "Rutina".</div>
    </div>`);

  const setUnit = async u => {
    settings.unit = u;
    await setKV('settings', settings);
    renderSettings();
  };
  root.querySelector('#u-kg').addEventListener('click', () => setUnit('kg'));
  root.querySelector('#u-lb').addEventListener('click', () => setUnit('lb'));
  root.querySelector('#s-rest').addEventListener('change', async e => {
    const v = parseInt(e.target.value);
    if (v >= 5) { settings.restSec = v; await setKV('settings', settings); toast('Guardado ✓'); }
  });
  root.querySelector('#s-notif').addEventListener('click', async () => {
    if (!('Notification' in window)) { toast('Este navegador no soporta notificaciones'); return; }
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Notificaciones activadas ✓' : 'Permiso no otorgado');
  });
  root.querySelector('#s-wipe').addEventListener('click', async () => {
    if (confirm('¿Borrar rutina, historial y ajustes? No se puede deshacer.') && confirm('¿Seguro? Es la última confirmación.')) {
      await wipeAll();
      location.hash = '#/home';
      location.reload();
    }
  });
}

// ---- arranque ----
async function main(){
  await initDB();
  const r = await getKV('routine');
  if (r) routine = r;
  else { routine = DEFAULT_ROUTINE; await setKV('routine', routine); }
  settings = Object.assign({ unit: 'kg', restSec: 100 }, (await getKV('settings')) || {});
  window.addEventListener('hashchange', route);
  route();
  Timer.resume();
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
main();
