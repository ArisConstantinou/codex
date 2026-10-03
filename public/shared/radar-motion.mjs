// Positive, smoothly varying angular velocity. Incommensurate phases replace a canned loop.
// The same time origin survives source refreshes, DOM replacements and hide/show cycles.
export function sweepAngle(seconds) {
  return seconds * 15 + 42 * Math.sin(seconds / 17) + 21 * Math.sin(seconds / (11 * Math.SQRT2)) + 9 * Math.sin(seconds / (8 * Math.PI));
}
export class RadarMotion {
  constructor() {
    this.origin = performance.now();
    this.element = null; this.animation = null; this.timer = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced.addEventListener('change', () => this.restart());
    document.addEventListener('visibilitychange', () => this.restart());
  }
  attach(element) { if (element === this.element) return; this.stop(); this.element = element; this.run(); }
  stop() { clearTimeout(this.timer); this.animation?.cancel(); this.animation = null; }
  restart() { this.stop(); this.run(); }
  run() {
    if (!this.element?.isConnected || document.hidden) return;
    if (this.reduced.matches) { this.animation = this.element.animate([{ transform: 'rotate(35deg)' }, { transform: 'rotate(35deg)' }], { duration: 1, fill: 'forwards' }); return; }
    const start = (performance.now() - this.origin) / 1000;
    const frames = Array.from({ length: 33 }, (_, index) => ({ transform: `rotate(${sweepAngle(start + index / 4)}deg)`, offset: index / 32 }));
    // Duration is exact per segment; phase is recalculated from continuous elapsed time.
    this.animation = this.element.animate(frames, { duration: 8000, iterations: 1, fill: 'forwards', easing: 'linear' });
    this.element.dataset.motion = 'continuous';
    this.timer = setTimeout(() => { this.animation?.cancel(); this.run(); }, 8000);
  }
}
