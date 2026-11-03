// Synthesized audio (WebAudio). Deliberately contains NO sirens, NO alarm-like tones and
// NO imitation of real emergency alert / broadcast chimes, so it cannot be mistaken for a real warning.

export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private rumbleGain!: GainNode;
  private rattleGain!: GainNode;
  private seaGain!: GainNode;
  private roarGain!: GainNode;
  private noise!: AudioBuffer;
  volume = 0.7;
  rumbleMul = 1;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      d[i] = last * 3.5;
    }
    const loop = (filterType: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return g;
    };
    this.rumbleGain = loop('lowpass', 70);
    this.rattleGain = loop('bandpass', 1800, 1.2);
    this.seaGain = loop('lowpass', 500);
    this.roarGain = loop('lowpass', 260);
    this.seaGain.gain.value = 0.25;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Called every frame. */
  update(shake: number, sea: number, roar: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(Math.min(1.6, shake * 1.6) * this.rumbleMul, t, 0.1);
    this.rattleGain.gain.setTargetAtTime(shake * 0.35 * this.rumbleMul * (0.6 + Math.random() * 0.4), t, 0.05);
    this.seaGain.gain.setTargetAtTime(sea * 0.3, t, 0.5);
    this.roarGain.gain.setTargetAtTime(roar * 0.9 * this.rumbleMul, t, 0.4);
  }

  /** Short impact for falling objects. */
  thud(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400 + strength * 300;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.9 * strength * this.rumbleMul, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2, 0.4);
  }

  /** Soft UI tone (single sine, not an alert chime). */
  ui(freq = 660) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  step() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2, 0.1);
  }
}
