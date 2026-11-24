// Synthesised split-flap "clack" sounds (Web Audio, no audio files).
//
// A handful of short noise-burst buffers are generated once: a sharp click,
// a softer second tick as the flap settles, and a low plastic "thock".
// Playback varies pitch and level so the cascade doesn't sound mechanical
// in the wrong way, and it's thinned out when hundreds of tiles flip at once.

function makeClack(ctx, variant) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.05);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const a = 0.3 + Math.random() * 0.35;          // noise low-pass coefficient
  const settleAt = 0.010 + Math.random() * 0.005; // second, softer tick
  const thock = 140 + variant * 18;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    lp += a * ((Math.random() * 2 - 1) - lp);
    let v = lp * Math.exp(-t / 0.0035) * Math.min(1, t / 0.0004);
    const t2 = t - settleAt;
    if (t2 > 0) v += 0.5 * lp * Math.exp(-t2 / 0.0028) * Math.min(1, t2 / 0.0003);
    v += 0.35 * Math.sin(2 * Math.PI * thock * t) * Math.exp(-t / 0.011);
    d[i] = v;
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] /= peak || 1;
  return buf;
}

export class FlapAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.6;
    this.lastTime = 0;
    this.count = 0; // clacks actually played (handy for debugging)
    this.onstate = null;
  }

  #ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.buffers = Array.from({ length: 6 }, (_, i) => makeClack(ctx, i));
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    ctx.onstatechange = () => this.onstate?.(ctx.state);
    this.ctx = ctx;
    return ctx;
  }

  /** Create/resume the context. Browsers only allow this after a user gesture. */
  async unlock() {
    const ctx = this.#ensure();
    if (!ctx) return false;
    try { await ctx.resume(); } catch { /* ignore */ }
    this.onstate?.(ctx.state);
    return ctx.state === 'running';
  }

  get running() { return this.ctx?.state === 'running'; }

  clack(density = 1) {
    if (!this.enabled || this.volume <= 0 || document.hidden) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastTime < 0.006) return;
    // Thin out the clatter when lots of tiles are moving at once.
    if (Math.random() > Math.min(1, 30 / Math.max(1, density))) return;
    this.lastTime = now;
    this.count++;

    const src = ctx.createBufferSource();
    src.buffer = this.buffers[(Math.random() * this.buffers.length) | 0];
    src.playbackRate.value = 0.85 + Math.random() * 0.4;
    const g = ctx.createGain();
    g.gain.value = (0.55 + Math.random() * 0.45) * this.volume;
    src.connect(g).connect(this.master);
    src.start(now);
  }
}
