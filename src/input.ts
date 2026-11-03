export interface InputFrame {
  moveX: number; // right
  moveY: number; // forward
  run: boolean;
  protect: boolean;
  interact: boolean; // edge
  map: boolean; // edge
  pause: boolean; // edge
  lookX: number;
  lookY: number;
}

export class Input {
  keys = new Set<string>();
  private edges = new Set<string>();
  private look = { x: 0, y: 0 };
  private joy = { x: 0, y: 0, id: -1 as number, cx: 0, cy: 0 };
  private lookTouch = { id: -1 as number, x: 0, y: 0 };
  private touchProtect = false;
  private touchRun = false;
  private dragging = false;
  /** Virtual input (autopilot / tests). When set, overrides devices. */
  virtual: Partial<InputFrame> | null = null;
  enabled = true;
  touchMode = false;

  constructor(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.edges.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (this.touchMode) return;
      this.dragging = true;
      if (document.pointerLockElement !== canvas && e.button === 0) {
        canvas.requestPointerLock?.()?.catch?.(() => {});
      }
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas || this.dragging) {
        this.look.x += e.movementX;
        this.look.y += e.movementY;
      }
    });
  }

  /** Bind on-screen touch controls. */
  bindTouch(root: HTMLElement) {
    const joyEl = root.querySelector<HTMLElement>('#joy')!;
    const knob = root.querySelector<HTMLElement>('#joy-knob')!;
    const lookEl = root.querySelector<HTMLElement>('#look-area')!;
    const R = 56;
    const setKnob = () => (knob.style.transform = `translate(${this.joy.x * R}px, ${-this.joy.y * R}px)`);
    joyEl.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      const r = joyEl.getBoundingClientRect();
      this.joy.id = t.identifier;
      this.joy.cx = r.left + r.width / 2;
      this.joy.cy = r.top + r.height / 2;
      this.updateJoy(t.clientX, t.clientY, R);
      setKnob();
      e.preventDefault();
    }, { passive: false });
    const move = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joy.id) {
          this.updateJoy(t.clientX, t.clientY, R);
          setKnob();
        } else if (t.identifier === this.lookTouch.id) {
          this.look.x += (t.clientX - this.lookTouch.x) * 1.6;
          this.look.y += (t.clientY - this.lookTouch.y) * 1.6;
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        }
      }
    };
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joy.id) {
          this.joy.id = -1;
          this.joy.x = this.joy.y = 0;
          setKnob();
        }
        if (t.identifier === this.lookTouch.id) this.lookTouch.id = -1;
      }
    };
    root.addEventListener('touchmove', move, { passive: true });
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
    lookEl.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }, { passive: true });

    const hold = (id: string, set: (v: boolean) => void) => {
      const el = root.querySelector<HTMLElement>(id)!;
      el.addEventListener('touchstart', (e) => { set(true); el.classList.add('on'); e.preventDefault(); }, { passive: false });
      el.addEventListener('touchend', () => { set(false); el.classList.remove('on'); });
      el.addEventListener('touchcancel', () => { set(false); el.classList.remove('on'); });
    };
    hold('#btn-protect', (v) => (this.touchProtect = v));
    const tap = (id: string, key: string) => {
      const el = root.querySelector<HTMLElement>(id)!;
      el.addEventListener('touchstart', (e) => { this.edges.add(key); e.preventDefault(); }, { passive: false });
      el.addEventListener('click', () => this.edges.add(key));
    };
    tap('#btn-interact', 'e');
    tap('#btn-map', 'm');
    tap('#btn-pause', 'escape');
    const runEl = root.querySelector<HTMLElement>('#btn-run')!;
    const toggleRun = (e: Event) => { this.touchRun = !this.touchRun; runEl.classList.toggle('on', this.touchRun); e.preventDefault(); };
    runEl.addEventListener('touchstart', toggleRun, { passive: false });
  }

  private updateJoy(x: number, y: number, R: number) {
    let dx = (x - this.joy.cx) / R;
    let dy = -(y - this.joy.cy) / R;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    this.joy.x = dx;
    this.joy.y = dy;
  }

  pressEdge(key: string) {
    this.edges.add(key);
  }

  read(): InputFrame {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('w') || k.has('arrowup')) my += 1;
    if (k.has('s') || k.has('arrowdown')) my -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (this.joy.id !== -1 || this.joy.x || this.joy.y) { mx += this.joy.x; my += this.joy.y; }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    const joyMag = Math.hypot(this.joy.x, this.joy.y);
    const f: InputFrame = {
      moveX: mx,
      moveY: my,
      run: k.has('shift') || this.touchRun || joyMag > 0.85,
      protect: k.has('c') || k.has(' ') || this.touchProtect,
      interact: this.edges.has('e') || this.edges.has('enter'),
      map: this.edges.has('m'),
      pause: this.edges.has('escape') || this.edges.has('p'),
      lookX: this.look.x,
      lookY: this.look.y,
    };
    this.edges.clear();
    this.look.x = this.look.y = 0;
    if (this.virtual) Object.assign(f, this.virtual);
    if (!this.enabled) { f.moveX = f.moveY = 0; f.protect = false; f.interact = false; }
    return f;
  }
}
