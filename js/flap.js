// Split-flap tiles and boards.
//
// Each Flap steps through CHARSET one character at a time (like a real
// mechanical module) until it reaches its target. Every step is a two-phase
// flip: the top half falls away, then the next character's bottom half
// lands. The landing triggers a "clack" via the sound engine.

export const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/%°&'+,()!?#@";
const INDEX = new Map(Array.from(CHARSET, (c, i) => [c, i]));
const STEP_MS = 50;

/** Uppercase, strip accents, and replace anything the board cannot show. */
export function sanitize(text) {
  const s = String(text ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[–—_]/g, '-');
  return Array.from(s, (c) => (INDEX.has(c) ? c : ' ')).join('');
}

function half(kind, flip) {
  const el = document.createElement('div');
  el.className = `half ${kind}${flip ? ' flip' : ''}`;
  const span = document.createElement('span');
  span.textContent = ' ';
  el.appendChild(span);
  return { el, span };
}

export class Flap {
  static active = 0;

  constructor(sound) {
    this.sound = sound;
    this.cur = ' ';
    this.target = ' ';
    this.running = false;
    this.timer = null;
    this.anims = [];

    this.el = document.createElement('div');
    this.el.className = 'flap';
    this.topStatic = half('top');
    this.botStatic = half('bottom');
    this.topFlip = half('top', true);
    this.botFlip = half('bottom', true);
    this.el.append(this.topStatic.el, this.botStatic.el, this.topFlip.el, this.botFlip.el);
  }

  #show(ch) {
    this.topStatic.span.textContent = ch;
    this.botStatic.span.textContent = ch;
  }

  #cancelAnims() {
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.topFlip.el.style.visibility = 'hidden';
    this.botFlip.el.style.visibility = 'hidden';
  }

  stop() {
    clearTimeout(this.timer);
    this.#cancelAnims();
    if (this.running) { this.running = false; Flap.active--; }
  }

  setNow(ch) {
    this.stop();
    this.cur = this.target = ch;
    this.#show(ch);
  }

  setTarget(ch, delay = 0) {
    this.target = ch;
    if (this.running || this.cur === ch) return;
    this.running = true;
    Flap.active++;
    this.timer = setTimeout(() => this.#advance(), delay);
  }

  #advance() {
    if (this.cur === this.target) {
      this.running = false;
      Flap.active--;
      return;
    }
    const next = CHARSET[(INDEX.get(this.cur) + 1) % CHARSET.length];
    const dur = STEP_MS * (0.85 + Math.random() * 0.4);

    this.topStatic.span.textContent = next; // revealed as the top flap falls
    this.topFlip.span.textContent = this.cur;
    this.botFlip.span.textContent = next;
    this.topFlip.el.style.visibility = 'visible';
    this.botFlip.el.style.visibility = 'visible';

    const fall = this.topFlip.el.animate(
      [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }],
      { duration: dur / 2, easing: 'ease-in', fill: 'forwards' });
    const land = this.botFlip.el.animate(
      [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }],
      { duration: dur / 2, delay: dur / 2, easing: 'ease-out', fill: 'both' });
    this.anims = [fall, land];

    land.onfinish = () => {
      this.cur = next;
      this.botStatic.span.textContent = next;
      this.#cancelAnims();
      this.sound?.clack(Flap.active);
      this.#advance();
    };
  }
}

export class Board {
  constructor(parent, cols, rows, sound) {
    this.cols = cols;
    this.rows = rows;
    this.el = document.createElement('div');
    this.el.className = 'board';
    this.el.style.setProperty('--cols', cols);
    this.flaps = [];
    for (let i = 0; i < cols * rows; i++) {
      const f = new Flap(sound);
      this.flaps.push(f);
      this.el.appendChild(f.el);
    }
    parent.appendChild(this.el);
  }

  /** Show one string per row. Changed tiles flip in a left-to-right wave. */
  setLines(lines, { instant = false } = {}) {
    for (let r = 0; r < this.rows; r++) {
      const line = sanitize(lines[r] ?? '').padEnd(this.cols).slice(0, this.cols);
      for (let c = 0; c < this.cols; c++) {
        const flap = this.flaps[r * this.cols + c];
        const ch = line[c];
        if (instant) flap.setNow(ch);
        else if (flap.target !== ch) flap.setTarget(ch, c * 9 + Math.random() * 260);
      }
    }
  }

  destroy() {
    for (const f of this.flaps) f.stop();
    this.el.remove();
  }
}
