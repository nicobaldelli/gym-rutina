'use strict';
/* Sincronización opcional entre dispositivos con Firebase (Firestore + login de Google).
   Offline-first: sin configuración o sin conexión, la app funciona igual que siempre.
   Datos remotos: users/{uid}/sessions/{id} y users/{uid}/meta/kv (rutina + ajustes).
   Conflictos: gana la última edición (updatedAt / kvStamp). Los borrados dejan una
   marca ("tombstone") para que no resuciten desde otro dispositivo. */
const Sync = window.Sync = (() => {
  const LS_CFG = 'gym.sync.cfg';
  const LS_DEL = 'gym.sync.pendingDel';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  let auth = null, fs = null;
  let state = 'off'; // off | loading | signedout | syncing | ok | error
  let lastError = '', syncing = false, pushTimer = null, kvDirty = false;
  const listeners = [];
  const pendingPut = new Map(); // sesiones editadas esperando subir

  function getConfig(){ try { return JSON.parse(localStorage.getItem(LS_CFG)); } catch (e) { return null; } }
  function loadDel(){ try { return JSON.parse(localStorage.getItem(LS_DEL)) || {}; } catch (e) { return {}; } }
  function saveDel(m){ localStorage.setItem(LS_DEL, JSON.stringify(m)); }

  function emit(){ listeners.forEach(f => { try { f(); } catch (e) {} }); }
  function onChange(f){ listeners.push(f); }
  function status(){
    return {
      state, lastError,
      configured: !!getConfig(),
      email: auth && auth.currentUser ? (auth.currentUser.email || auth.currentUser.uid) : null
    };
  }
  function setError(e){
    const code = (e && e.code) || '';
    let msg = (e && e.message) || String(e);
    if (code === 'permission-denied') msg = 'Permiso denegado: revisá las reglas de Firestore (ver README).';
    else if (code === 'unavailable' || /network|fetch|cargar/i.test(msg)) msg = 'Sin conexión: se sincroniza cuando vuelva internet.';
    state = 'error'; lastError = msg; emit();
  }

  function loadScript(src){
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('No se pudo cargar Firebase (¿sin conexión?)'));
      document.head.appendChild(s);
    });
  }

  async function init(){
    const cfg = getConfig();
    if (!cfg) { state = 'off'; emit(); return; }
    state = 'loading'; emit();
    try {
      if (!window.firebase) {
        await loadScript(SDK + 'firebase-app-compat.js');
        await loadScript(SDK + 'firebase-auth-compat.js');
        await loadScript(SDK + 'firebase-firestore-compat.js');
      }
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      auth = firebase.auth(); fs = firebase.firestore();
      auth.onAuthStateChanged(u => {
        if (u) { state = 'ok'; emit(); syncNow(); }
        else { state = 'signedout'; emit(); }
      });
      window.addEventListener('online', () => syncNow());
    } catch (e) { setError(e); }
  }

  function setup(cfg){ localStorage.setItem(LS_CFG, JSON.stringify(cfg)); init(); }

  async function remove(){
    try { if (auth) await auth.signOut(); } catch (e) {}
    localStorage.removeItem(LS_CFG);
    localStorage.removeItem(LS_DEL);
    state = 'off'; lastError = ''; emit();
  }

  async function signIn(){
    if (!auth) return;
    const prov = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(prov); }
    catch (e) {
      const c = e && e.code;
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment' || c === 'auth/cancelled-popup-request') {
        try { await auth.signInWithRedirect(prov); } catch (e2) { setError(e2); }
      } else if (c !== 'auth/popup-closed-by-user') setError(e);
    }
  }
  async function signOut(){ if (auth) await auth.signOut(); }

  // ---- cambios locales -> nube (con debounce; si no hay sesión quedan para el próximo sync) ----
  function schedulePush(){
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, 1500);
  }
  function onLocalPut(s){ pendingPut.set(s.id, s); schedulePush(); }
  function onLocalDelete(id){
    pendingPut.delete(id);
    const m = loadDel(); m[id] = Date.now(); saveDel(m); // persiste por si estamos offline
    schedulePush();
  }
  function onLocalKV(){ kvDirty = true; schedulePush(); }

  async function flush(){
    if (!auth || !auth.currentUser || !fs) return;
    const root = fs.collection('users').doc(auth.currentUser.uid);
    try {
      const dels = loadDel();
      const b = fs.batch();
      let n = 0;
      for (const s of pendingPut.values()) { b.set(root.collection('sessions').doc(s.id), s); n++; }
      for (const id of Object.keys(dels)) { b.set(root.collection('sessions').doc(id), { id, deleted: true, updatedAt: dels[id] }); n++; }
      if (kvDirty) { b.set(root.collection('meta').doc('kv'), { routine, settings, stamp: (await getKV('kvStamp')) || Date.now() }); n++; }
      if (n) await b.commit();
      pendingPut.clear(); saveDel({}); kvDirty = false;
      if (state === 'error') { state = 'ok'; lastError = ''; emit(); }
    } catch (e) { setError(e); }
  }

  // ---- sincronización completa (al abrir, al loguearse, o manual) ----
  async function syncNow(){
    if (!auth || !auth.currentUser || !fs || syncing) return;
    syncing = true; state = 'syncing'; lastError = ''; emit();
    try {
      clearTimeout(pushTimer);
      await flush(); // sube ediciones y borrados pendientes antes de comparar
      const root = fs.collection('users').doc(auth.currentUser.uid);

      // sesiones: comparar todo y quedarse con lo más nuevo de cada lado
      const snap = await root.collection('sessions').get();
      const remote = new Map();
      snap.forEach(d => remote.set(d.id, d.data()));
      const localMap = new Map((await getAllSessions()).map(s => [s.id, s]));
      const up = [];
      let changedLocal = false;
      for (const [id, r] of remote) {
        const l = localMap.get(id);
        const rt = r.updatedAt || 0, lt = l ? (l.updatedAt || 0) : -1;
        if (r.deleted) {
          if (l && lt <= rt) { await deleteSession(id, true); changedLocal = true; }
          else if (l) up.push(l); // se editó local después del borrado: se conserva
        }
        else if (!l || rt > lt) { await putSession(r, true); changedLocal = true; }
        else if (lt > rt) up.push(l);
      }
      for (const [id, l] of localMap) if (!remote.has(id)) up.push(l);
      for (let i = 0; i < up.length; i += 400) {
        const b = fs.batch();
        up.slice(i, i + 400).forEach(s => b.set(root.collection('sessions').doc(s.id), s));
        await b.commit();
      }

      // rutina + ajustes: gana el sello más nuevo
      const kvSnap = await root.collection('meta').doc('kv').get();
      const rkv = kvSnap.exists ? kvSnap.data() : null;
      const lStamp = (await getKV('kvStamp')) || 0;
      if (rkv && (rkv.stamp || 0) > lStamp) {
        if (rkv.routine) { routine = rkv.routine; await setKV('routine', routine, true); }
        if (rkv.settings) { settings = Object.assign({ unit: 'kg', restSec: 100 }, rkv.settings); await setKV('settings', settings, true); }
        await setKV('kvStamp', rkv.stamp, true);
        changedLocal = true;
      } else if (!rkv || (rkv.stamp || 0) < lStamp) {
        await root.collection('meta').doc('kv').set({ routine, settings, stamp: lStamp || Date.now() });
      }

      state = 'ok'; emit();
      // refresca la vista actual, salvo que estés cargando una sesión (para no pisar inputs)
      if (changedLocal && !(location.hash || '').startsWith('#/session/')) route();
    } catch (e) { setError(e); }
    finally { syncing = false; }
  }

  return { init, setup, remove, signIn, signOut, syncNow, onChange, status, onLocalPut, onLocalDelete, onLocalKV };
})();
