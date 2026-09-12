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
  const view = parts[1] || 'home', a = parts[2], b = parts[3], c = parts[4];
  switch (view) {
    case 'home': return renderHome();
    case 'session': return b === 'ex' ? renderSessionExercise(a, c) : renderSession(a);
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
    stretchesDone: false,
    entries: day.exercises.map(x => ({
      exerciseId: x.id,
      name: x.name,
      type: x.type || 'reps',
      done: false,
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

function setsSummary(en){
  const sets = en.sets.filter(t => t.w != null || t.r != null);
  if (!sets.length) return '';
  return sets.map(t => (t.w != null ? fmtWeight(t.w, false) : '—') + '×' + (t.r != null ? t.r : '—')).join(' · ') + ' ' + settings.unit;
}
function prevSummary(prev){
  return prev.sets.map(t => (t.w != null ? fmtWeight(t.w, false) : '—') + '×' + (t.r != null ? t.r : '—')).join(' · ');
}

/* Hub del día: progreso, ejercicios pendientes (elegís el próximo), hechos,
   elongación y cierre. Cada ejercicio se completa de a uno en su propia vista. */
async function renderSession(id){
  setNav('home');
  const s = await getSession(id);
  if (!s) { toast('No se encontró la sesión'); location.hash = '#/home'; return; }
  const day = routine.days.find(d => d.id === s.dayId);
  const others = (await getAllSessions()).filter(x => x.id !== s.id).sort(byDateDesc);
  const isDone = s.status === 'done';
  const total = s.entries.length;
  const doneN = s.entries.filter(en => en.done).length;
  const backHref = isDone ? '#/history/' + s.id : '#/home';

  let html = `<div class="session-head">
    <a class="back" href="${backHref}">‹ Volver</a>
    <h2>${esc(s.dayName)}</h2>
    <label class="date-row">Fecha <input type="date" id="sessDate" value="${esc(s.date)}"></label>
    ${!isDone ? `<div class="prog-row"><div class="prog-track"><div class="prog-fill" style="width:${total ? Math.round(doneN / total * 100) : 0}%"></div></div><span class="prog-txt">${doneN}/${total}</span></div>` : ''}
  </div>`;

  const pend = [], ready = [];
  s.entries.forEach((en, ei) => ((en.done || isDone) ? ready : pend).push([en, ei]));

  if (pend.length) {
    html += `<div class="section-label">Elegí el próximo ejercicio · ${pend.length} restante${pend.length === 1 ? '' : 's'}</div>`;
    for (const [en, ei] of pend) {
      const meta = day ? (day.exercises.find(x => x.id === en.exerciseId) || day.exercises.find(x => x.name === en.name)) : null;
      const cur = setsSummary(en);
      const prev = cur ? null : findPrev(others, en.name);
      const sub = cur
        ? 'En curso: ' + cur
        : (meta ? meta.sets + ' x ' + meta.repsTarget : '') + (prev ? ' · últ: ' + prevSummary(prev) : '');
      html += `<a class="card card-row" href="#/session/${s.id}/ex/${ei}">
        <div><div class="card-title">${esc(en.name)}</div><div class="card-sub">${esc(sub)}</div></div>
        <div class="chev">›</div></a>`;
    }
  }

  if (ready.length) {
    html += `<div class="section-label">${isDone ? 'Ejercicios (tocá para editar)' : 'Hechos ✓'}</div>`;
    for (const [en, ei] of ready) {
      html += `<a class="card card-row card-done" href="#/session/${s.id}/ex/${ei}">
        <div><div class="card-title">✓ ${esc(en.name)}</div><div class="card-sub">${esc(setsSummary(en) || 'Sin datos')}</div></div>
        <div class="chev">›</div></a>`;
    }
  }

  const stretches = (day && day.stretches) || [];
  if (!isDone) {
    if (!pend.length) {
      if (stretches.length && !s.stretchesDone) {
        html += `<div class="card"><div class="ex-name">🧘 Elongación post-entreno</div><ul class="stretch-list">` +
          stretches.map(x => `<li>${esc(x.name)}${x.url ? ` — <a href="${esc(x.url)}" target="_blank" rel="noopener">ver ↗</a>` : ''}</li>`).join('') +
          `</ul>
          <button id="stretchDone" class="btn-primary">✓ Terminé la elongación</button>
          <button id="stretchSkip" class="btn-ghost">Saltar elongación por hoy</button></div>`;
      } else {
        html += `<div class="card"><div class="ex-name">🎉 ¡Día completo!</div>
          <div class="card-sub">${s.stretchesDone ? 'Ejercicios y elongación listos.' : 'Todos los ejercicios listos.'} Confirmá para guardar la sesión.</div>
          <button id="finishBtn" class="btn-primary">💪 Finalizar y guardar sesión</button></div>`;
      }
    }
    html += `<div class="session-actions">
      ${pend.length ? `<button id="finishEarly" class="btn-ghost">Finalizar ahora (faltan ${pend.length})</button>` : ''}
      <button id="discardBtn" class="btn-danger">Descartar sesión</button>
    </div>`;
  } else {
    html += `<div class="session-actions"><div class="card-sub" style="text-align:center">Los cambios se guardan solos al editar cada ejercicio.</div></div>`;
  }

  const root = setView(html);
  const q = sel => root.querySelector(sel);
  q('#sessDate').addEventListener('change', async e => {
    if (e.target.value) { s.date = e.target.value; await putSession(s); }
  });
  const markStretch = async msg => {
    s.stretchesDone = true;
    await putSession(s);
    if (msg) toast(msg);
    renderSession(id);
  };
  if (q('#stretchDone')) q('#stretchDone').addEventListener('click', () => markStretch('Elongación lista 🧘'));
  if (q('#stretchSkip')) q('#stretchSkip').addEventListener('click', () => markStretch());
  const finish = async () => {
    s.status = 'done'; s.finishedAt = Date.now();
    await putSession(s);
    toast('Sesión guardada 💪');
    location.hash = '#/home';
  };
  if (q('#finishBtn')) q('#finishBtn').addEventListener('click', finish);
  if (q('#finishEarly')) q('#finishEarly').addEventListener('click', () => {
    const left = s.entries.filter(en => !en.done).length;
    if (confirm(`Te quedan ${left} ejercicio${left === 1 ? '' : 's'} sin marcar. ¿Finalizar la sesión igual?`)) finish();
  });
  if (q('#discardBtn')) q('#discardBtn').addEventListener('click', async () => {
    if (confirm('¿Descartar esta sesión y sus datos?')) {
      await deleteSession(s.id);
      toast('Sesión descartada');
      location.hash = '#/home';
    }
  });
}

/* Vista de un ejercicio: cargás las series, descansás con el timer y lo marcás
   como terminado para volver al hub del día. Todo se autoguarda. */
async function renderSessionExercise(id, eiRaw){
  setNav('home');
  const s = await getSession(id);
  if (!s) { toast('No se encontró la sesión'); location.hash = '#/home'; return; }
  const ei = parseInt(eiRaw, 10);
  const en = s.entries[ei];
  if (!en) { location.hash = '#/session/' + s.id; return; }
  const day = routine.days.find(d => d.id === s.dayId);
  const meta = day ? (day.exercises.find(x => x.id === en.exerciseId) || day.exercises.find(x => x.name === en.name)) : null;
  const others = (await getAllSessions()).filter(x => x.id !== s.id).sort(byDateDesc);
  const prev = findPrev(others, en.name);
  const isTime = en.type === 'time';
  const isDone = s.status === 'done';
  const doneN = s.entries.filter(x => x.done).length;

  let html = `<div class="session-head">
    <a class="back" href="#/session/${s.id}">‹ Rutina del día${isDone ? '' : ` (${doneN}/${s.entries.length})`}</a>
    <h2>${esc(en.name)}</h2>
  </div>
  <section class="exercise card">
    <div class="ex-head">
      <div>
        ${meta ? `<div class="ex-meta">${esc(meta.group)}${meta.grip ? ' · ' + esc(meta.grip) : ''}</div>
        <div class="ex-meta">Objetivo: ${esc(meta.sets + ' x ' + meta.repsTarget)} · descanso ${fmtSecs(meta.restSec || settings.restSec)}</div>` : ''}
      </div>
      ${meta && meta.url ? `<a class="demo" href="${esc(meta.url)}" target="_blank" rel="noopener">Ver demo ↗</a>` : ''}
    </div>
    ${prev ? `<div class="prev">Última vez (${fmtDate(prev.date)}): ${prevSummary(prev)} ${settings.unit}</div>` : ''}
    <div class="sets" data-ei="${ei}">
      <div class="set-row set-row-head"><span>#</span><span>Peso (${settings.unit})</span><span>${isTime ? 'Seg' : 'Reps'}</span><span></span></div>`;
  en.sets.forEach((t, si) => { html += setRowHTML(ei, si, t); });
  html += `</div>
    <button class="btn-ghost add-set">+ serie</button>
  </section>
  <div class="session-actions">
    ${!isDone && !en.done ? `<button id="exDone" class="btn-primary">✓ Terminé este ejercicio</button>` : ''}
    ${!isDone && en.done ? `<a class="btn-primary" href="#/session/${s.id}">‹ Volver a la rutina del día</a>
      <button id="exUndone" class="btn-ghost">↩ Marcar como pendiente</button>` : ''}
    ${isDone ? `<a class="btn-primary" href="#/session/${s.id}">‹ Volver</a>` : ''}
    <div class="savehint" id="saveHint"></div>
  </div>`;

  const root = setView(html);
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

  root.addEventListener('input', e => {
    const row = e.target.closest('.set-row');
    if (!row || row.classList.contains('set-row-head')) return;
    const t = en.sets[+row.dataset.si];
    if (e.target.classList.contains('in-w')) t.w = displayToKg(e.target.value);
    if (e.target.classList.contains('in-r')) {
      const n = parseFloat(e.target.value);
      t.r = isNaN(n) ? null : n;
    }
    save();
  });

  root.addEventListener('click', async e => {
    if (e.target.closest('.btn-timer')) {
      Timer.start((meta && meta.restSec) || settings.restSec);
      return;
    }
    if (e.target.closest('.add-set')) {
      en.sets.push({ w: null, r: null });
      root.querySelector('.sets').insertAdjacentHTML('beforeend', setRowHTML(ei, en.sets.length - 1, en.sets[en.sets.length - 1]));
      save();
      return;
    }
    if (e.target.id === 'exDone' || e.target.id === 'exUndone') {
      en.done = e.target.id === 'exDone';
      clearTimeout(saveTimer);
      await putSession(s);
      if (en.done) toast('Ejercicio listo 💪');
      location.hash = '#/session/' + s.id;
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

// ---- stats del período (mes / año / todo) ----
let statsPeriod = 'month';
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function statsHTML(sessions){
  const now = todayISO();
  const inPeriod =
    statsPeriod === 'month' ? s => s.date.slice(0, 7) === now.slice(0, 7) :
    statsPeriod === 'year' ? s => s.date.slice(0, 4) === now.slice(0, 4) :
    () => true;
  const label = statsPeriod === 'month' ? 'este mes' : statsPeriod === 'year' ? 'este año' : 'histórico';
  const ss = sessions.filter(inPeriod);
  let sets = 0, vol = 0;
  ss.forEach(s => { sets += countSets(s); vol += totalVolume(s); });

  let html = `<div class="seg stats-seg">
    <button class="seg-btn ${statsPeriod === 'month' ? 'on' : ''}" data-p="month">Este mes</button>
    <button class="seg-btn ${statsPeriod === 'year' ? 'on' : ''}" data-p="year">Este año</button>
    <button class="seg-btn ${statsPeriod === 'all' ? 'on' : ''}" data-p="all">Todo</button>
  </div>
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-num">${ss.length}</div><div class="stat-lbl">sesiones</div></div>
    <div class="stat-box"><div class="stat-num">${sets}</div><div class="stat-lbl">series</div></div>
    <div class="stat-box"><div class="stat-num">${fmtTick(kgToDisplay(vol))}</div><div class="stat-lbl">volumen (${settings.unit})</div></div>
  </div>`;

  // balance entre días: cuántas veces hiciste cada día de la rutina en el período
  const cnt = new Map();
  routine.days.forEach(d => cnt.set(d.id, { name: d.name, n: 0, last: '' }));
  ss.forEach(s => {
    let e = cnt.get(s.dayId);
    if (!e) { // el día ya no existe en la rutina: agrupamos por nombre
      for (const v of cnt.values()) if (v.name === s.dayName) { e = v; break; }
      if (!e) { e = { name: s.dayName, n: 0, last: '' }; cnt.set('x:' + s.dayName, e); }
    }
    e.n++;
    if (s.date > e.last) e.last = s.date;
  });
  const rows = [...cnt.values()];
  if (rows.length) {
    const maxN = Math.max(1, ...rows.map(r => r.n));
    const minN = Math.min(...rows.map(r => r.n));
    html += `<div class="card"><div class="chart-title">Balance de días (${label})</div>`;
    rows.forEach(r => {
      html += `<div class="bal-row">
        <div class="bal-name">${esc(r.name)}</div>
        <div class="bal-track"><div class="bal-fill${r.n === minN && minN < maxN ? ' low' : ''}" style="width:${Math.round(r.n / maxN * 100)}%"></div></div>
        <div class="bal-n">${r.n}</div>
      </div>`;
    });
    const dayRows = routine.days.map(d => cnt.get(d.id));
    if (dayRows.length > 1) {
      const dMin = Math.min(...dayRows.map(r => r.n)), dMax = Math.max(...dayRows.map(r => r.n));
      if (dMax > dMin) {
        const cand = dayRows.filter(r => r.n === dMin).sort((a, b) => (a.last || '') < (b.last || '') ? -1 : 1)[0];
        html += `<div class="bal-hint">⚖️ Venís desparejo: te conviene hacer <b>${esc(cand.name)}</b> (${dMin} ${dMin === 1 ? 'vez' : 'veces'} contra ${dMax}).</div>`;
      } else if (dMax > 0) {
        html += '<div class="bal-hint ok">✅ Venís parejo entre los días.</div>';
      }
    }
    html += '</div>';
  }

  // desglose: sesiones por mes (en "este año") o por año (en "todo")
  if (statsPeriod !== 'month' && ss.length) {
    const bucket = new Map();
    const keyOf = statsPeriod === 'year' ? s => s.date.slice(5, 7) : s => s.date.slice(0, 4);
    ss.forEach(s => bucket.set(keyOf(s), (bucket.get(keyOf(s)) || 0) + 1));
    const keys = statsPeriod === 'year'
      ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
      : [...bucket.keys()].sort();
    const lbl = statsPeriod === 'year' ? k => MONTHS_ES[+k - 1] : k => k;
    const maxB = Math.max(1, ...keys.map(k => bucket.get(k) || 0));
    html += `<div class="card"><div class="chart-title">Sesiones por ${statsPeriod === 'year' ? 'mes' : 'año'}</div><div class="mini-bars">` +
      keys.map(k => {
        const n = bucket.get(k) || 0;
        return `<div class="mini-bar"><i>${n || ''}</i><div style="height:${Math.round(n / maxB * 56)}px"></div><span>${lbl(k)}</span></div>`;
      }).join('') +
      '</div></div>';
  }
  return html;
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
    ${statsHTML(sessions)}
    <div class="section-label">Por ejercicio</div>
    <select id="progSel" class="input">${names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  if (!pts.length) {
    html += '<p class="empty">Sin datos todavía para este ejercicio.<br>Registrá alguna sesión primero.</p>';
  } else {
    html += `<div class="card"><div class="chart-title">Peso máximo por sesión (${settings.unit})</div><div id="chartMax"></div></div>
      <div class="card"><div class="chart-title">Volumen total por sesión (peso × reps, ${settings.unit})</div><div id="chartVol"></div></div>`;
  }
  const root = setView(html);
  root.querySelectorAll('.stats-seg .seg-btn').forEach(b => b.addEventListener('click', () => {
    statsPeriod = b.dataset.p;
    renderProgress();
  }));
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
function parseFirebaseCfg(text){
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  // acepta el snippet tal cual lo da la consola de Firebase (objeto JS, no JSON estricto)
  const t = m[0]
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // comentarios; no toca "https://..."
    .replace(/'/g, '"')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1');
  try {
    const o = JSON.parse(t);
    return o && o.apiKey && o.projectId ? o : null;
  } catch (e) { return null; }
}

function syncCardHTML(){
  if (!window.Sync) return '';
  const st = Sync.status();
  let inner;
  if (!st.configured) {
    inner = `<div class="card-sub">Guardá el historial en la nube (Firebase, gratis) para tenerlo igual en todos tus dispositivos. Los pasos para crear el proyecto están en el README.</div>
      <textarea id="sy-cfg" class="input" rows="5" placeholder="Pegá acá el objeto firebaseConfig que te da la consola de Firebase"></textarea>
      <button id="sy-save" class="btn-ghost">Guardar configuración</button>`;
  } else {
    const txt = {
      loading: 'Cargando…',
      signedout: 'Configurado. Falta iniciar sesión.',
      syncing: 'Sincronizando…',
      ok: 'Sincronizado ✓' + (st.email ? ' — ' + st.email : ''),
      error: '⚠️ ' + (st.lastError || 'Error')
    }[st.state] || st.state;
    inner = `<div class="card-sub">${esc(txt)}</div>`;
    if (st.email) {
      inner += `<button id="sy-now" class="btn-ghost">🔄 Sincronizar ahora</button>
        <button id="sy-out" class="btn-ghost">Cerrar sesión</button>`;
    } else if (st.state !== 'loading') {
      inner += `<button id="sy-login" class="btn-primary">Iniciar sesión con Google</button>`;
    }
    inner += `<button id="sy-del" class="btn-danger">Quitar configuración de este dispositivo</button>`;
  }
  return `<div class="card form"><div class="ex-name">☁️ Sincronización</div>${inner}</div>`;
}

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
    ${syncCardHTML()}
    <div class="card form">
      <button id="s-wipe" class="btn-danger">🗑 Borrar TODOS los datos</button>
      <div class="card-sub">Rutina, historial y ajustes de este dispositivo. Hacé backups desde "Rutina".</div>
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

  // sincronización (los botones existen según el estado)
  const q = id => root.querySelector(id);
  if (q('#sy-save')) q('#sy-save').addEventListener('click', () => {
    const cfg = parseFirebaseCfg(q('#sy-cfg').value);
    if (!cfg) { alert('No pude leer la configuración. Pegá el objeto firebaseConfig completo (con apiKey y projectId) tal cual lo da la consola de Firebase.'); return; }
    Sync.setup(cfg);
    toast('Configuración guardada ✓');
    renderSettings();
  });
  if (q('#sy-login')) q('#sy-login').addEventListener('click', () => Sync.signIn());
  if (q('#sy-now')) q('#sy-now').addEventListener('click', () => Sync.syncNow());
  if (q('#sy-out')) q('#sy-out').addEventListener('click', () => Sync.signOut());
  if (q('#sy-del')) q('#sy-del').addEventListener('click', () => {
    if (confirm('¿Quitar la configuración de sincronización de este dispositivo? No borra nada en la nube ni el historial local.')) Sync.remove();
  });
}

// ---- arranque ----
async function migrate(){
  // v2: sacamos "Plancha con peso o rueda abdominal" también de rutinas ya guardadas
  if (await getKV('migr-noplank')) return;
  let changed = false;
  routine.days.forEach(d => {
    const before = d.exercises.length;
    d.exercises = d.exercises.filter(x => x.id !== 'd3e8' && !/plancha con peso o rueda/i.test(x.name || ''));
    if (d.exercises.length !== before) changed = true;
  });
  // sin sello de edición: que esto no pise una rutina más nueva en la nube
  if (changed) await setKV('routine', routine, true);
  await setKV('migr-noplank', 1, true);
}

async function main(){
  await initDB();
  const r = await getKV('routine');
  if (r) routine = r;
  else { routine = DEFAULT_ROUTINE; await setKV('routine', routine, true); } // seed: sin sello de edición
  await migrate();
  settings = Object.assign({ unit: 'kg', restSec: 100 }, (await getKV('settings')) || {});
  window.addEventListener('hashchange', route);
  route();
  Timer.resume();
  if (window.Sync) {
    Sync.onChange(() => { if ((location.hash || '').startsWith('#/settings')) renderSettings(); });
    Sync.init();
  }
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
main();
