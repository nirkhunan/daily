// A trackpad under the grid. Drag across to change the key (twelve columns,
// C to B); drag up and down to open and close the filter. The dot stays where
// you let go.

import { KEYS } from './seq.js?v=16';

export class Pad {
  constructor(el, onChange) {
    this.el = el;
    this.onChange = onChange;
    this.key = 0; this.filter = 1;

    el.innerHTML = `
      <div class="padCols">${KEYS.map(() => '<span></span>').join('')}</div>
      <div class="padDot"></div>`;
    this.cols = [...el.querySelectorAll('.padCols span')];
    this.dot = el.querySelector('.padDot');

    const move = e => {
      const r = el.getBoundingClientRect();
      const x = Math.min(0.9999, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      this.x = x;
      this.onChange(Math.floor(x * KEYS.length), 1 - y);
    };
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.classList.add('held'); move(e); });
    el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) move(e); });
    el.addEventListener('pointerup', () => el.classList.remove('held'));
    el.addEventListener('pointercancel', () => el.classList.remove('held'));
  }

  // Show a key and filter (0 closed … 1 open), however they were set.
  show(key, filter) {
    // Keep the dot where the pointer is if it is still inside the chosen key column.
    const inCol = this.x !== undefined && Math.floor(this.x * KEYS.length) === key;
    const x = inCol ? this.x : (key + 0.5) / KEYS.length;
    this.key = key; this.filter = filter;
    // Inset by the dot's radius so it never gets cut off at the edges.
    this.dot.style.left = `calc(10px + ${x} * (100% - 20px))`;
    this.dot.style.top = `calc(10px + ${1 - filter} * (100% - 20px))`;
    this.cols.forEach((c, i) => c.classList.toggle('on', i === key));
  }
}
