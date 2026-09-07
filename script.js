(() => {
  'use strict';

  // Online (stroke-based) handwriting recognition. Unlike OCR, this reads the pen
  // path over time — direction, order and shape of each stroke — which is what makes
  // cursive and quick handwriting readable.
  // Override with `window.RECOGNIZER_URL = 'http://localhost:8787/recognize'` to route
  // through the bundled proxy (proxy.js) if your browser blocks the direct call.
  const RECOGNIZER_URL = window.RECOGNIZER_URL
    || 'https://inputtools.google.com/request?itc=en-t-i0-handwrit&app=demopage';

  const RECOGNIZE_DEBOUNCE_MS = 350;  // after a stroke ends, wait this long then read
  const COMMIT_IDLE_MS = 1500;        // keep still this long and the word is committed

  const canvas = document.getElementById('pad');
  const ctx = canvas.getContext('2d');

  const penSize = document.getElementById('penSize');
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');
  const commitBtn = document.getElementById('commitBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearDocBtn = document.getElementById('clearDocBtn');

  const statusEl = document.getElementById('status');
  const liveWordEl = document.getElementById('liveWord');
  const altsEl = document.getElementById('alts');
  const hintEl = document.getElementById('hint');
  const doc = document.getElementById('doc');
  const docNote = document.getElementById('docNote');

  let strokes = [];          // [{x:[], y:[], t:[], size}]
  let active = null;
  let drawing = false;
  let dpr = window.devicePixelRatio || 1;

  let recognizeTimer = null;
  let commitTimer = null;
  let requestSeq = 0;        // guards against out-of-order responses
  let candidates = [];
  let startTime = 0;

  /* ---------- canvas ---------- */

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function redraw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = readCssVar('--ink-strong', '#12151d');
    for (const s of strokes) drawStroke(s);
    hintEl.classList.toggle('hidden', strokes.length > 0);
  }

  function readCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawStroke(s) {
    if (!s.x.length) return;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    ctx.moveTo(s.x[0], s.y[0]);
    if (s.x.length === 1) ctx.lineTo(s.x[0] + 0.1, s.y[0] + 0.1);
    for (let i = 1; i < s.x.length; i++) ctx.lineTo(s.x[i], s.y[i]);
    ctx.stroke();
  }

  function pointOf(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function onDown(evt) {
    evt.preventDefault();
    clearTimeout(recognizeTimer);
    clearTimeout(commitTimer);
    canvas.setPointerCapture(evt.pointerId);

    if (!startTime) startTime = performance.now();
    const p = pointOf(evt);
    active = {
      x: [p.x], y: [p.y],
      t: [Math.round(performance.now() - startTime)],
      size: Number(penSize.value),
    };
    strokes.push(active);
    drawing = true;
    redraw();
  }

  function onMove(evt) {
    if (!drawing || !active) return;
    const p = pointOf(evt);
    active.x.push(p.x);
    active.y.push(p.y);
    active.t.push(Math.round(performance.now() - startTime));
    redraw();
  }

  function onUp() {
    if (!drawing) return;
    drawing = false;
    active = null;
    scheduleRecognize();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  window.addEventListener('resize', resize);
  resize();

  /* ---------- recognition ---------- */

  function scheduleRecognize() {
    clearTimeout(recognizeTimer);
    clearTimeout(commitTimer);
    if (!strokes.length) return;
    recognizeTimer = setTimeout(recognize, RECOGNIZE_DEBOUNCE_MS);
  }

  function buildRequest() {
    const rect = canvas.getBoundingClientRect();
    return {
      options: 'enable_pre_space',
      requests: [{
        writing_guide: {
          writing_area_width: Math.round(rect.width),
          writing_area_height: Math.round(rect.height),
        },
        ink: strokes.map((s) => [
          s.x.map((n) => Math.round(n)),
          s.y.map((n) => Math.round(n)),
          s.t,
        ]),
        language: 'en',
      }],
    };
  }

  // Response shape: ["SUCCESS", [["<id>", ["best","alt","alt"], ...]]]
  function parseCandidates(json) {
    if (!Array.isArray(json) || json[0] !== 'SUCCESS') return [];
    const first = json[1] && json[1][0];
    const list = first && first[1];
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.trim()) : [];
  }

  async function recognize() {
    if (!strokes.length) return;
    const seq = ++requestSeq;
    setStatus('reading…');

    try {
      const resp = await fetch(RECOGNIZER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequest()),
      });
      if (!resp.ok) throw new Error('recognizer returned ' + resp.status);

      const json = await resp.json();
      if (seq !== requestSeq) return;   // a newer stroke already superseded this read

      candidates = parseCandidates(json);
      if (candidates.length) {
        showWord(candidates[0], candidates.slice(1, 5));
        setStatus('pause to keep it');
        scheduleCommit();
      } else {
        showWord('', []);
        setStatus('no match yet — keep writing');
      }
    } catch (err) {
      if (seq !== requestSeq) return;
      console.error(err);
      showWord('', []);
      setStatus('recognizer unreachable');
      docNote.textContent =
        'Could not reach the recognition service. Check your connection, or run the bundled proxy (see README) if the browser blocked the request.';
    }
  }

  function showWord(word, alts) {
    liveWordEl.textContent = word;
    liveWordEl.classList.toggle('pending', !word);
    altsEl.innerHTML = '';
    for (const alt of alts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'alt';
      b.textContent = alt;
      b.addEventListener('click', () => commit(alt));
      altsEl.appendChild(b);
    }
  }

  function setStatus(text) { statusEl.textContent = text; }

  /* ---------- committing words ---------- */

  function scheduleCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      if (!drawing && candidates.length) commit(candidates[0]);
    }, COMMIT_IDLE_MS);
  }

  function commit(word) {
    clearTimeout(recognizeTimer);
    clearTimeout(commitTimer);
    if (!word) return;

    doc.value = doc.value ? doc.value.replace(/\s+$/, '') + ' ' + word : word;
    doc.scrollTop = doc.scrollHeight;

    resetPad();
    setStatus('added "' + word + '"');
  }

  function resetPad() {
    strokes = [];
    candidates = [];
    active = null;
    startTime = 0;
    requestSeq++;          // invalidate any read still in flight
    showWord('', []);
    redraw();
  }

  commitBtn.addEventListener('click', () => {
    if (candidates.length) commit(candidates[0]);
    else setStatus('nothing to add yet');
  });

  undoBtn.addEventListener('click', () => {
    strokes.pop();
    redraw();
    if (strokes.length) scheduleRecognize();
    else { resetPad(); setStatus('waiting for a stroke'); }
  });

  clearBtn.addEventListener('click', () => {
    resetPad();
    setStatus('waiting for a stroke');
  });

  /* ---------- document ---------- */

  clearDocBtn.addEventListener('click', () => {
    if (doc.value && !confirm('Clear the whole document?')) return;
    doc.value = '';
    docNote.textContent = '';
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(doc.value);
      docNote.textContent = 'Copied to clipboard.';
    } catch (e) {
      doc.select();
      document.execCommand('copy');
      docNote.textContent = 'Copied to clipboard.';
    }
  });

  downloadBtn.addEventListener('click', () => {
    const blob = new Blob([doc.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'handwritten-notes.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  setStatus('waiting for a stroke');
})();
