(() => {
  const canvas = document.getElementById('pad');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const doc = document.getElementById('doc');

  const penSizeInput = document.getElementById('penSize');
  const clearBtn = document.getElementById('clearBtn');
  const undoBtn = document.getElementById('undoBtn');
  const convertBtn = document.getElementById('convertBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearDocBtn = document.getElementById('clearDocBtn');

  let strokes = [];      // committed strokes, each an array of {x,y}
  let currentStroke = null;
  let drawing = false;
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
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
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111318';
    for (const stroke of strokes) {
      drawStroke(stroke);
    }
  }

  function drawStroke(stroke) {
    if (stroke.points.length < 1) return;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    const pts = stroke.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) {
      // draw a dot
      ctx.lineTo(pts[0].x + 0.1, pts[0].y + 0.1);
    }
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  }

  function getPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function pointerDown(evt) {
    evt.preventDefault();
    canvas.setPointerCapture(evt.pointerId);
    drawing = true;
    currentStroke = { size: Number(penSizeInput.value), points: [getPoint(evt)] };
    strokes.push(currentStroke);
    redraw();
  }

  function pointerMove(evt) {
    if (!drawing || !currentStroke) return;
    currentStroke.points.push(getPoint(evt));
    redraw();
  }

  function pointerUp(evt) {
    if (!drawing) return;
    drawing = false;
    currentStroke = null;
    setStatus('');
  }

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('pointerleave', pointerUp);

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function setStatus(text) {
    statusEl.textContent = text;
  }

  clearBtn.addEventListener('click', () => {
    strokes = [];
    redraw();
    setStatus('');
  });

  undoBtn.addEventListener('click', () => {
    strokes.pop();
    redraw();
  });

  clearDocBtn.addEventListener('click', () => {
    if (doc.value && !confirm('Clear the whole document?')) return;
    doc.value = '';
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(doc.value);
      setStatus('Copied to clipboard.');
    } catch (e) {
      doc.select();
      document.execCommand('copy');
      setStatus('Copied to clipboard.');
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

  let worker = null;
  async function getWorker() {
    if (worker) return worker;
    setStatus('Loading handwriting recognizer…');
    worker = await Tesseract.createWorker('eng', 1, {
      workerPath: 'vendor/tesseract/worker.min.js',
      corePath: 'vendor/tesseract-core/',
      langPath: 'vendor/tessdata/eng/4.0.0_best_int',
    });
    return worker;
  }

  convertBtn.addEventListener('click', async () => {
    if (strokes.length === 0) {
      setStatus('Draw something first.');
      return;
    }
    convertBtn.disabled = true;
    try {
      setStatus('Recognizing…');
      const w = await getWorker();
      const dataUrl = canvas.toDataURL('image/png');
      const { data } = await w.recognize(dataUrl);
      const text = (data.text || '').trim();
      if (text) {
        doc.value = doc.value ? doc.value.replace(/\s+$/, '') + ' ' + text : text;
        doc.scrollTop = doc.scrollHeight;
        setStatus('Added to document.');
      } else {
        setStatus('Could not read that — try writing bigger and more clearly.');
      }
    } catch (err) {
      console.error(err);
      setStatus('Recognition failed. Check your connection and try again.');
    } finally {
      strokes = [];
      redraw();
      convertBtn.disabled = false;
    }
  });
})();
