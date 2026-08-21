'use strict';
/* Timer de descanso. Guarda el timestamp de fin en localStorage y calcula el
   restante con Date.now(), así sobrevive a cambios de app o pantalla apagada. */
const Timer = (() => {
  const LS_KEY = 'gym.timer';
  let tick = null;
  let audioCtx = null;

  // En Android el audio necesita un gesto previo del usuario: creamos/reanudamos
  // el AudioContext en el primer toque que haya.
  document.addEventListener('pointerdown', () => {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  });

  function el(id){ return document.getElementById(id); }
  function load(){ try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; } }
  function save(st){ if (st) localStorage.setItem(LS_KEY, JSON.stringify(st)); else localStorage.removeItem(LS_KEY); }
  function fmt(sec){ const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }

  function show(){ el('timerOverlay').classList.add('show'); }
  function hide(){ el('timerOverlay').classList.remove('show'); }
  function stopLoop(){ clearInterval(tick); tick = null; }
  function loop(){ stopLoop(); update(); tick = setInterval(update, 200); }

  function update(){
    const st = load();
    if (!st) { stopLoop(); hide(); return; }
    const rem = Math.ceil((st.endTs - Date.now()) / 1000);
    if (rem <= 0) { finish(); return; }
    el('timerLabel').textContent = 'Descanso';
    el('timerTime').textContent = fmt(rem);
    const pct = Math.max(0, Math.min(1, rem / st.total));
    el('timerBar').style.width = (pct * 100) + '%';
  }

  function start(sec){
    save({ endTs: Date.now() + sec * 1000, total: sec });
    show(); loop();
  }

  function adjust(deltaSec){
    const st = load(); if (!st) return;
    st.endTs += deltaSec * 1000;
    st.total = Math.max(1, st.total + deltaSec);
    save(st); update();
  }

  function skip(){ save(null); stopLoop(); hide(); }

  function finish(){
    save(null); stopLoop();
    el('timerTime').textContent = '0:00';
    el('timerLabel').textContent = '¡Descanso terminado!';
    el('timerBar').style.width = '0%';
    if (navigator.vibrate) { try { navigator.vibrate([300, 120, 300, 120, 600]); } catch (e) {} }
    beep(); notify();
    setTimeout(hide, 4000);
  }

  function beep(){
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      for (let i = 0; i < 3; i++) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
        g.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.35 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.3);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.32);
      }
    } catch (e) {}
  }

  function notify(){
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title = '⏱ Descanso terminado';
    const opts = { body: '¡Siguiente serie!', tag: 'gym-timer', icon: 'icons/icon-192.png' };
    // En Android, Notification() directo desde la página tira error: usar el SW.
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.showNotification) reg.showNotification(title, opts);
        else new Notification(title, opts);
      }).catch(() => { try { new Notification(title, opts); } catch (e) {} });
    } else {
      try { new Notification(title, opts); } catch (e) {}
    }
  }

  // Si había un timer corriendo al recargar/volver, lo retoma.
  function resume(){
    const st = load();
    if (!st) return;
    if (st.endTs > Date.now()) { show(); loop(); } else save(null);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && load()) { show(); loop(); }
  });

  document.getElementById('tMinus').addEventListener('click', () => adjust(-15));
  document.getElementById('tPlus').addEventListener('click', () => adjust(15));
  document.getElementById('tSkip').addEventListener('click', skip);

  return { start, adjust, skip, resume };
})();
