// A 16 × 16 step sequencer: four drum rows, eight lead notes and four bass
// notes, all in a minor pentatonic scale so any combination sounds good.
// Every step that plays is reported with exactly what sounded, so the cloth
// can be drawn from the notes themselves. The master output is also recorded.

export const KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const SOUNDS = ['Pluck', 'Saw', 'Bell'];
export const PRESETS = ['Pulse', 'Broken', 'Drift', 'Random', 'Clear'];

const STEPS = 16;
const LEAD = [17, 15, 12, 10, 7, 5, 3, 0];   // semitones above the root, high to low
const BASS = [10, 7, 3, 0];

function rowsFor(key) {
  const leadRoot = 60 + key - (key > 6 ? 12 : 0), bassRoot = leadRoot - 24;
  return [
    { kind: 'kick', label: 'Kick', group: 'drums' },
    { kind: 'snare', label: 'Snare', group: 'drums' },
    { kind: 'hat', label: 'Hat', group: 'drums' },
    { kind: 'clap', label: 'Clap', group: 'drums' },
    // Numbered low to high, so the names stay true in any key.
    ...LEAD.map((o, i) => ({ kind: 'lead', midi: leadRoot + o, label: `Lead ${LEAD.length - i}`, group: 'lead' })),
    ...BASS.map((o, i) => ({ kind: 'bass', midi: bassRoot + o, label: `Bass ${BASS.length - i}`, group: 'bass' })),
  ];
}

// One string per row, top to bottom: 4 drums, 8 lead (high → low), 4 bass (high → low).
const PATTERNS = {
  Pulse: [
    'x...x...x...x...', '................', '..x...x...x...x.', '....x.......x...',
    '..........x.....', '......x.........', '...x.......x....', '..............x.',
    'x.......x.......', '................', '.....x......x...', '................',
    '................', '..........x.....', '................', 'x..x....x.......',
  ],
  Broken: [
    'x......x..x.....', '....x.......x..x', 'x.x.x.x.x.xxx.x.', '................',
    '................', '....x...........', '..x.........x...', '.........x......',
    'x...............', '......x.......x.', '................', '...........x....',
    '................', '.......x........', '..........x.....', 'x.....x.........',
  ],
  Drift: [
    '................', '................', '....x.......x...', '................',
    '........x.......', '................', '....x...........', '............x...',
    'x...............', '..........x.....', '................', '......x.........',
    '................', '........x.......', '................', 'x...............',
  ],
};

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export class Sequencer {
  constructor(root) {
    this.root = root;
    this.bpm = 112; this.swing = 0; this.key = 9; this.sound = 'Pluck'; this.cutoff = 1;
    this.rows = rowsFor(this.key);
    this.grid = this.rows.map(() => new Array(STEPS).fill(false));
    this.muted = this.rows.map(() => false);
    this.ctx = null; this.playing = false; this.queue = []; this.col = -1;
    this.build();
    this.preset('Pulse');
  }

  // Audio graph -----------------------------------------------------------

  audio() {
    if (this.ctx) return this.ctx;
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.out = ctx.createDynamicsCompressor();
    this.master.connect(this.filter).connect(this.out).connect(ctx.destination);
    this.setFilter(this.cutoff);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.weave();
    return ctx;
  }

  cutoffHz() { return this.cutoff >= 1 ? Infinity : 180 * Math.pow(2, this.cutoff * 6.8); }

  setFilter(x) {
    this.cutoff = x;
    if (this.filter) this.filter.frequency.setTargetAtTime(180 * Math.pow(2, x * 6.8), this.ctx.currentTime, 0.05);
  }

  setKey(k) {
    this.key = k;
    this.rows = rowsFor(k);
    this.labels.forEach((l, i) => (l.textContent = this.rows[i].label));
  }

  env(g, t, peak, decay, attack = 0.003) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  osc(type, freq, t, peak, decay, cutoff = 8000, q = 0.7) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = q;
    this.env(g, t, peak, decay);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); o.stop(t + decay + 0.05);
  }

  hiss(t, type, freq, peak, decay, q = 0.8) {
    const c = this.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noise;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, peak, decay, 0.001);
    n.connect(f).connect(g).connect(this.master);
    n.start(t); n.stop(t + decay + 0.05);
  }

  trigger(row, t) {
    const c = this.ctx;
    switch (row.kind) {
      case 'kick': {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        this.env(g, t, 1, 0.42, 0.002);
        o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.5);
        break;
      }
      case 'snare':
        this.hiss(t, 'bandpass', 1800, 0.55, 0.16);
        this.osc('triangle', 190, t, 0.35, 0.09);
        break;
      case 'hat':
        this.hiss(t, 'highpass', 8000, 0.22, 0.045);
        break;
      case 'clap':
        [0, 0.011, 0.022].forEach(d => this.hiss(t + d, 'bandpass', 1300, 0.45, 0.018, 1.2));
        this.hiss(t + 0.03, 'bandpass', 1300, 0.35, 0.14, 1.2);
        break;
      case 'lead': {
        const f = mtof(row.midi);
        if (this.sound === 'Pluck') { this.osc('triangle', f, t, 0.28, 0.38, 4000); this.osc('square', f, t, 0.05, 0.12, 2500); }
        if (this.sound === 'Saw') this.osc('sawtooth', f, t, 0.14, 0.28, 2200, 5);
        if (this.sound === 'Bell') { this.osc('sine', f, t, 0.22, 1.1); this.osc('sine', f * 2.76, t, 0.07, 0.5); }
        break;
      }
      case 'bass': {
        const f = mtof(row.midi);
        this.osc('sawtooth', f, t, 0.2, 0.26, 520, 2);
        this.osc('sine', f, t, 0.25, 0.3);
        break;
      }
    }
  }

  // Transport -------------------------------------------------------------

  play() {
    const ctx = this.audio();
    ctx.resume();
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.next = ctx.currentTime + 0.06;
    this.timer = setInterval(() => { this.drain(); this.schedule(); }, 25);
    this.rollTape();
    this.follow();
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.queue = [];
    this.setColumn(-1);
    if (this.rec?.state === 'recording') this.rec.pause();
  }

  schedule() {
    const dur = 60 / this.bpm / 4;
    while (this.next < this.ctx.currentTime + 0.12) {
      const t = this.next + (this.step % 2 ? this.swing * dur * 0.6 : 0);
      const hits = [];
      this.rows.forEach((r, i) => {
        if (this.grid[i][this.step] && !this.muted[i]) { this.trigger(r, t); hits.push({ row: i, kind: r.kind, midi: r.midi }); }
      });
      this.queue.push({ step: this.step, t, hits, sound: this.sound, cutoff: this.cutoffHz(), key: this.key, swing: this.swing });
      this.step = (this.step + 1) % STEPS;
      this.next += dur;
    }
  }

  // Report each step the moment it is heard. Called from both the animation
  // frame and the scheduler, so steps are never lost while the tab is hidden.
  drain() {
    let cur = -1;
    while (this.queue.length && this.queue[0].t <= this.ctx.currentTime) {
      const item = this.queue.shift();
      cur = item.step;
      this.onStep?.(item);
    }
    return cur;
  }

  follow() {
    const cur = this.drain();
    if (cur >= 0) this.setColumn(cur);
    this.raf = requestAnimationFrame(() => this.follow());
  }

  // The tape: while the loop plays, the master output is recorded. Stopping
  // pauses it; starting over clears it.

  weave() {
    this.dest = this.ctx.createMediaStreamDestination();
    this.out.connect(this.dest);
  }

  rollTape() {
    if (!this.rec) {
      this.chunks = [];
      this.rec = new MediaRecorder(this.dest.stream);
      this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
      this.rec.start(1000);
    } else if (this.rec.state === 'paused') this.rec.resume();
  }

  newCloth() {
    this.queue = [];   // steps already scheduled from before must not land on the fresh cloth
    if (this.rec) { this.rec.ondataavailable = null; this.rec.stop(); this.rec = null; }
    if (this.playing) this.rollTape();
  }

  // Everything recorded since the last start over, as an audio file.
  async tape() {
    if (!this.rec) return null;
    await new Promise(r => { this.rec.addEventListener('dataavailable', r, { once: true }); this.rec.requestData(); });
    return new Blob(this.chunks, { type: this.rec.mimeType });
  }

  // Grid ------------------------------------------------------------------

  build() {
    const g = document.createElement('div');
    g.className = 'grid';
    this.cells = Array.from({ length: STEPS }, () => []);
    this.labels = [];
    let paint = null;

    this.rows.forEach((r, i) => {
      const gridRow = i + 1 + (i >= 4) + (i >= 12);   // skip the spacer rows between drums, lead and bass
      const lab = document.createElement('button');
      lab.className = `lab ${r.group}`;
      lab.style.gridRow = gridRow;
      lab.textContent = r.label;
      lab.title = 'Mute or unmute this row';
      lab.onclick = () => this.mute(i, !this.muted[i]);
      g.append(lab);
      this.labels.push(lab);

      for (let c = 0; c < STEPS; c++) {
        const cell = document.createElement('div');
        cell.className = `cell ${r.group}${c % 4 === 0 ? ' beat' : ''}`;
        cell.style.gridRow = gridRow;
        cell.onpointerdown = e => {
          e.preventDefault();
          cell.releasePointerCapture(e.pointerId);
          paint = !this.grid[i][c];
          this.set(i, c, paint);
          if (paint && !this.playing) { this.audio().resume(); this.trigger(this.rows[i], this.ctx.currentTime + 0.01); }
        };
        cell.onpointerenter = () => { if (paint !== null) this.set(i, c, paint); };
        g.append(cell);
        this.cells[c].push(cell);
      }
    });
    addEventListener('pointerup', () => (paint = null));
    this.root.append(g);
  }

  set(i, c, on) {
    this.grid[i][c] = on;
    this.cells[c][i].classList.toggle('on', on);
    this.onChange?.();
  }

  mute(i, on) {
    this.muted[i] = on;
    this.labels[i].classList.toggle('muted', on);
    for (let c = 0; c < STEPS; c++) this.cells[c][i].classList.toggle('muted', on);
    this.onChange?.();
  }

  // One pass of the loop as it would play now: the repeat unit of the cloth.
  bar() {
    return Array.from({ length: STEPS }, (_, step) => ({
      step,
      hits: this.rows.flatMap((r, i) => (this.grid[i][step] && !this.muted[i] ? [{ row: i, kind: r.kind, midi: r.midi }] : [])),
      sound: this.sound, cutoff: this.cutoffHz(), key: this.key, swing: this.swing,
    }));
  }

  // Everything needed to rebuild this loop, small enough for a URL.
  save() {
    const bits = this.grid.map(row => parseInt(row.map(on => (on ? 1 : 0)).join(''), 2).toString(16).padStart(4, '0')).join('');
    const muted = parseInt(this.muted.map(m => (m ? 1 : 0)).join(''), 2).toString(16);
    return { g: bits, m: muted, t: this.bpm, w: Math.round(this.swing * 100), k: this.key, s: SOUNDS.indexOf(this.sound), f: Math.round(this.cutoff * 100) };
  }

  load(d) {
    if (/^[0-9a-f]{64}$/.test(d.g ?? '')) {
      for (let i = 0; i < 16; i++) {
        const row = parseInt(d.g.slice(i * 4, i * 4 + 4), 16);
        for (let c = 0; c < STEPS; c++) this.set(i, c, !!(row & (1 << (STEPS - 1 - c))));
      }
    }
    const m = parseInt(d.m ?? '0', 16) || 0;
    for (let i = 0; i < 16; i++) this.mute(i, !!(m & (1 << (15 - i))));
    if (d.t >= 70 && d.t <= 170) this.bpm = +d.t;
    if (d.w >= 0 && d.w <= 60) this.swing = d.w / 100;
    if (d.k >= 0 && d.k < 12) this.setKey(+d.k);
    if (SOUNDS[d.s]) this.sound = SOUNDS[d.s];
    if (d.f >= 0 && d.f <= 100) this.setFilter(d.f / 100);
  }

  setColumn(c) {
    if (this.col >= 0) this.cells[this.col].forEach(el => el.classList.remove('now'));
    this.col = c;
    if (c >= 0) this.cells[c].forEach(el => el.classList.add('now'));
  }

  preset(name) {
    const rnd = p => Math.random() < p;
    this.rows.forEach((r, i) => {
      for (let c = 0; c < STEPS; c++) {
        let on = false;
        if (PATTERNS[name]) on = PATTERNS[name][i][c] === 'x';
        if (name === 'Random') {
          on = i === 0 ? c % 8 === 0 || rnd(0.12)
            : i === 1 ? c % 8 === 4
            : i === 2 ? c % 2 === 0 && rnd(0.7)
            : i === 3 ? rnd(0.06)
            : false;
        }
        this.set(i, c, on);
      }
    });
    if (name === 'Random') {
      for (let c = 0; c < STEPS; c++) {
        if (rnd(0.4)) this.set(4 + Math.floor(Math.random() * 8), c, true);
        if (c % 4 === 0 || rnd(0.12)) this.set(12 + (rnd(0.5) ? 3 : Math.floor(Math.random() * 4)), c, true);
      }
    }
  }
}
