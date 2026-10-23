// Flap Mirror: a split-flap board whose flaps are pieces of your face.
// Hold still and the flaps shuffle pieces of the picture, drawing them from
// closer and closer by, until each one lands on its own piece and the face is
// whole (about ten seconds). Move and a ripple of flips spreads out from where
// you moved, and the shuffle starts again.

const W = 1080, H = 1350;          // the board, and the clip, at 4:5
const PAD = 36, GAP = 3;           // board edge and the gap between flaps
const FLIP = 170;                  // ms for one flap to fall
const SETTLE = 10000;              // ms of stillness to find the face
const RIPPLE = 700;                // ms for a ripple to cross the board
const MOVE = 2.8;                  // mean change in brightness that counts as moving

const canvas = document.getElementById('board');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');

// The source, mirrored and cropped to the board's shape, redrawn every frame.
const pic = document.createElement('canvas');
pic.width = W; pic.height = H;
const pctx = pic.getContext('2d');

// A small copy of the same picture for telling when you move.
const MW = 48, MH = 60;
const tiny = document.createElement('canvas');
tiny.width = MW; tiny.height = MH;
const tctx = tiny.getContext('2d', { willReadFrequently: true });
let prevLum = null;

const $ = id => document.getElementById(id);
const ui = {
  start: $('start'), startNote: $('startNote'), state: $('state'), progress: $('progress'),
  sound: $('sound'), record: $('record'),
};

let source = null, mirrored = false;
let cols = 24, rows = 30, tiles = [];
let stillSince = performance.now(), lastMove = -Infinity;

/* ---------- The board ---------- */

function build(c) {
  cols = c;
  const pitch = (W - PAD * 2) / cols;
  rows = Math.round((H - PAD * 2) / pitch);
  const n = cols * rows, now = performance.now();
  tiles = Array.from({ length: n }, (_, i) => ({
    i,
    show: Math.floor(Math.random() * n), // the piece of picture on the flap now
    from: 0, start: -1,                    // the flip in progress, if any
    next: now + Math.random() * 400,       // when this flap next flips
    lockAfter: 0,                          // ms of stillness before it locks
    locked: false,
  }));
  scramble(0.5, 0.5);
}

// Every flap lets go, in a ripple outward from (x, y), and draws a new time to
// find its own piece once things are still again.
function scramble(x, y) {
  const now = performance.now();
  stillSince = now;
  for (const t of tiles) {
    const dx = (t.i % cols + 0.5) / cols - x, dy = (Math.floor(t.i / cols) + 0.5) / rows - y;
    const wave = Math.hypot(dx, dy) * RIPPLE;
    if (t.locked) t.next = now + wave;
    else t.next = Math.min(t.next, now + wave);
    t.locked = false;
    t.lockAfter = 800 + (SETTLE - 800) * Math.pow(Math.random(), 0.75);
  }
}

// A random piece near flap i: anywhere at first, only near neighbours late on.
function nearby(i, settled) {
  const r = Math.max(1, Math.round(Math.max(cols, rows) * (1 - settled) ** 1.6));
  const c0 = i % cols, r0 = Math.floor(i / cols);
  for (;;) {
    const c = c0 + Math.round((Math.random() * 2 - 1) * r);
    const rr = r0 + Math.round((Math.random() * 2 - 1) * r);
    if (c < 0 || c >= cols || rr < 0 || rr >= rows) continue;
    const k = rr * cols + c;
    if (k !== i) return k;
  }
}

function update(now) {
  const moving = now - lastMove < 300;
  const still = moving ? 0 : now - stillSince;
  const settled = Math.min(1, still / SETTLE);
  let flips = 0, locked = 0;

  for (const t of tiles) {
    if (t.start >= 0 && now - t.start >= FLIP) t.start = -1;
    if (t.locked) { locked++; continue; }
    if (t.start >= 0 || now < t.next) continue;
    t.from = t.show;
    t.start = now;
    flips++;
    if (!moving && still >= t.lockAfter) {
      t.show = t.i;
      t.locked = true;
    } else {
      t.show = nearby(t.i, settled);
      t.next = now + FLIP + 60 + Math.random() * (520 - 300 * settled);
    }
  }
  if (flips) clack(flips);

  const done = locked === tiles.length && !tiles.some(t => t.start >= 0);
  ui.progress.style.width = `${(locked / tiles.length) * 100}%`;
  ui.state.textContent = !source ? 'Waiting'
    : done ? 'Found you'
    : moving ? 'Moving'
    : `Hold still · ${Math.max(1, Math.ceil((SETTLE - still) / 1000))}`;
}

/* ---------- Drawing ---------- */

function drawSource() {
  if (!source) return false;
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) return false;
  // Cover-crop to 4:5.
  const s = Math.max(W / sw, H / sh);
  const cw = W / s, ch = H / s;
  pctx.save();
  if (mirrored) { pctx.translate(W, 0); pctx.scale(-1, 1); }
  pctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
  pctx.restore();
  return true;
}

// Piece k of the picture, top half (0) or bottom half (1), as a source rect.
function piece(k, half) {
  const pw = W / cols, ph = H / rows;
  return [(k % cols) * pw, Math.floor(k / cols) * ph + half * ph / 2, pw, ph / 2];
}

function shade(x, y, w, h, a) {
  if (h <= 0 || a <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fillRect(x, y, w, h);
}

function draw(now) {
  ctx.fillStyle = '#0E0E0E';
  ctx.fillRect(0, 0, W, H);
  const pitchX = (W - PAD * 2) / cols, pitchY = (H - PAD * 2) / rows;
  const w = pitchX - GAP, h = pitchY - GAP, hh = h / 2;

  for (const t of tiles) {
    const x = PAD + (t.i % cols) * pitchX + GAP / 2;
    const y = PAD + Math.floor(t.i / cols) * pitchY + GAP / 2;
    const mid = y + hh;

    if (t.start < 0) {
      ctx.drawImage(pic, ...piece(t.show, 0), x, y, w, hh);
      ctx.drawImage(pic, ...piece(t.show, 1), x, mid, w, hh);
      shade(x, mid, w, hh, 0.08);
    } else {
      // Behind the falling flap: the new top, and the old bottom until covered.
      const p = Math.min(1, (now - t.start) / FLIP);
      ctx.drawImage(pic, ...piece(t.show, 0), x, y, w, hh);
      ctx.drawImage(pic, ...piece(t.from, 1), x, mid, w, hh);
      shade(x, mid, w, hh, 0.08);
      const k = Math.cos(p * Math.PI);
      if (k > 0) {
        // The old top folding down towards the hinge.
        const fh = hh * k;
        ctx.drawImage(pic, ...piece(t.from, 0), x, mid - fh, w, fh);
        shade(x, mid - fh, w, fh, (1 - k) * 0.55);
      } else {
        // Its back, carrying the new bottom, swinging down into place.
        const fh = hh * -k;
        ctx.drawImage(pic, ...piece(t.show, 1), x, mid, w, fh);
        shade(x, mid, w, fh, (1 + k) * 0.45 + 0.08);
      }
    }
    // The hinge, and the pins it turns on.
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x, mid - 0.75, w, 1.5);
    ctx.fillRect(x - 1, mid - 2, 2.5, 4);
    ctx.fillRect(x + w - 1.5, mid - 2, 2.5, 4);
  }
}

/* ---------- Telling when you move ---------- */

function sense(now) {
  if (!source || source instanceof HTMLImageElement) return;
  tctx.drawImage(pic, 0, 0, MW, MH);
  const d = tctx.getImageData(0, 0, MW, MH).data;
  const lum = new Float32Array(MW * MH);
  for (let i = 0; i < lum.length; i++) lum[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  if (prevLum) {
    let sum = 0, mx = 0, my = 0, mw = 0;
    for (let i = 0; i < lum.length; i++) {
      const diff = Math.abs(lum[i] - prevLum[i]);
      sum += diff;
      if (diff > 24) { mx += (i % MW) * diff; my += Math.floor(i / MW) * diff; mw += diff; }
    }
    // How much movement it takes; breathing and camera noise sit below it.
    if (sum / lum.length > MOVE && mw > 0) {
      if (now - lastMove > 300) scramble((mx / mw + 0.5) / MW, (my / mw + 0.5) / MH);
      else stillSince = now;
      lastMove = now;
    }
  }
  prevLum = lum;
}

/* ---------- Sound: the clack ---------- */

// Each flap size has its own knock: big cards thud, small ones tick.
//   card: how long the card's snap rings; drum: the pitch and ring of the
//   thump; band: the range the snap is filtered to; rate: playback speeds;
//   voices: how many knocks can sound at once.
const KNOCKS = {
  16: { card: 0.007, drum: [105, 0.03], band: [800, 700], rate: [0.7, 0.25], voices: 3, gain: 0.55 },
  24: { card: 0.0035, drum: [190, 0.012], band: [1800, 1800], rate: [0.75, 0.6], voices: 5, gain: 0.45 },
  36: { card: 0.0018, drum: [340, 0.005], band: [3200, 2200], rate: [1, 0.5], voices: 6, gain: 0.35 },
};

let audio = null, master = null, buffers = {}, soundOn = true, recordDest = null;

function startAudio() {
  if (audio) return;
  audio = new AudioContext();
  master = audio.createGain();
  master.gain.value = 0.55;
  master.connect(audio.destination);
  recordDest = audio.createMediaStreamDestination();
  master.connect(recordDest);
  // A short knock: a burst of noise for the card, a low thump for the drum.
  for (const [size, k] of Object.entries(KNOCKS)) {
    const len = Math.floor(audio.sampleRate * 0.08);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const s = i / audio.sampleRate;
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-s / k.card) * 0.9
            + Math.sin(2 * Math.PI * k.drum[0] * s) * Math.exp(-s / k.drum[1]) * 0.5;
    }
    buffers[size] = buf;
  }
}

function clack(n) {
  if (!audio || !soundOn) return;
  const k = KNOCKS[cols];
  const voices = Math.min(n, k.voices), gain = k.gain / Math.sqrt(voices) * Math.min(1, 0.35 + n / 12);
  for (let v = 0; v < voices; v++) {
    const src = audio.createBufferSource();
    src.buffer = buffers[cols];
    src.playbackRate.value = k.rate[0] + Math.random() * k.rate[1];
    const bp = audio.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = k.band[0] + Math.random() * k.band[1];
    bp.Q.value = 0.9;
    const g = audio.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(master);
    src.start(audio.currentTime + Math.random() * 0.016);
  }
}

/* ---------- Sources ---------- */

async function useCamera() {
  startAudio();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false,
    });
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    setSource(video, true);
  } catch {
    ui.startNote.textContent = 'The camera is blocked. Allow it in the address bar, or use a photo.';
  }
}

function usePhoto(file) {
  startAudio();
  const img = new Image();
  img.onload = () => setSource(img, false);
  img.src = URL.createObjectURL(file);
}

function setSource(el, mirror) {
  source = el; mirrored = mirror; prevLum = null;
  ui.start.hidden = true;
  scramble(0.5, 0.5);
}

/* ---------- Recording a clip ---------- */

let recorder = null;

function record() {
  if (recorder) { recorder.stop(); return; }
  if (!source) return;
  startAudio();
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...recordDest.stream.getAudioTracks()]);
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flap-mirror.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
    a.click();
    recorder = null;
    ui.record.classList.remove('recording');
    ui.record.textContent = 'Record a clip';
  };
  recorder.start();
  ui.record.classList.add('recording');
  ui.record.textContent = 'Stop and save';
  // Start from a scramble so the clip holds the whole find.
  scramble(0.5, 0.5);
  lastMove = performance.now();
}

/* ---------- Controls and loop ---------- */

$('useCamera').onclick = useCamera;
$('usePhoto').onchange = e => e.target.files[0] && usePhoto(e.target.files[0]);
$('scramble').onclick = () => { scramble(0.5, 0.5); lastMove = performance.now(); };
ui.sound.onclick = () => {
  soundOn = !soundOn;
  ui.sound.classList.toggle('on', soundOn);
  ui.sound.textContent = soundOn ? 'Sound on' : 'Sound off';
};
ui.record.onclick = record;
document.querySelectorAll('#density button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#density button').forEach(o => o.classList.toggle('on', o === b));
  build(+b.dataset.cols);
});
addEventListener('keydown', e => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    scramble(0.5, 0.5);
    lastMove = performance.now();
  }
});

build(cols);

function loop(now) {
  if (drawSource()) {
    sense(now);
    update(now);
  }
  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// For testing without a camera: flapMirror.setSource(anyCanvasOrImage, mirror)
window.flapMirror = { setSource, scramble };
