'use strict';
/* Persistencia: IndexedDB con fallback automático a localStorage.
   Stores: 'kv' (rutina, ajustes) y 'sessions' (una entrada por sesión). */
const DB_NAME = 'gymdb', DB_VERSION = 1;
const LS_SESS = 'gym.sessions', LS_KV = 'gym.kv.';
let _db = null, _useLS = false;

function initDB(){
  return new Promise(resolve => {
    let done = false;
    const fallback = () => { if (!done) { done = true; _useLS = true; resolve(); } };
    if (!window.indexedDB) { fallback(); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { fallback(); return; }
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
    };
    req.onsuccess = () => { if (!done) { done = true; _db = req.result; resolve(); } };
    req.onerror = fallback;
    req.onblocked = fallback;
    setTimeout(fallback, 3000);
  });
}

function _req(store, mode, op){
  return new Promise((resolve, reject) => {
    const r = op(_db.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function getKV(key){
  if (_useLS) { const v = localStorage.getItem(LS_KV + key); return v ? JSON.parse(v) : null; }
  const v = await _req('kv', 'readonly', st => st.get(key));
  return v === undefined ? null : v;
}
async function setKV(key, val, fromSync){
  if (_useLS) localStorage.setItem(LS_KV + key, JSON.stringify(val));
  else await _req('kv', 'readwrite', st => st.put(val, key));
  if (!fromSync && (key === 'routine' || key === 'settings')) {
    // sello de versión para resolver conflictos al sincronizar
    await setKV('kvStamp', Date.now(), true);
    if (window.Sync) Sync.onLocalKV();
  }
}

function _lsSessions(){ try { return JSON.parse(localStorage.getItem(LS_SESS)) || {}; } catch (e) { return {}; } }

async function getAllSessions(){
  if (_useLS) return Object.values(_lsSessions());
  return (await _req('sessions', 'readonly', st => st.getAll())) || [];
}
async function getSession(id){
  if (_useLS) return _lsSessions()[id] || null;
  const v = await _req('sessions', 'readonly', st => st.get(id));
  return v === undefined ? null : v;
}
async function putSession(s, fromSync){
  if (!fromSync) s.updatedAt = Date.now();
  if (_useLS) { const m = _lsSessions(); m[s.id] = s; localStorage.setItem(LS_SESS, JSON.stringify(m)); }
  else await _req('sessions', 'readwrite', st => st.put(s));
  if (!fromSync && window.Sync) Sync.onLocalPut(s);
}
async function deleteSession(id, fromSync){
  if (_useLS) { const m = _lsSessions(); delete m[id]; localStorage.setItem(LS_SESS, JSON.stringify(m)); }
  else await _req('sessions', 'readwrite', st => st.delete(id));
  if (!fromSync && window.Sync) Sync.onLocalDelete(id);
}
async function wipeAll(){
  Object.keys(localStorage).filter(k => k.startsWith('gym.')).forEach(k => localStorage.removeItem(k));
  if (!_useLS) {
    await _req('kv', 'readwrite', st => st.clear());
    await _req('sessions', 'readwrite', st => st.clear());
  }
}
