import * as THREE from 'three';
import {
  HISTORICAL_FACTS, FICTION_NOTES, PRINCIPLES, SOURCES, CONTENT_NOTICE, DISCLAIMER, CONTROLS_DESKTOP, CONTROLS_TOUCH,
} from './content';
import { buildReview, type DecisionLog } from './review';
import type { Phase } from './game';
import type { Settings } from './settings';
import {
  ROADS_NS, ROADS_EW, ROAD_HALF, CLIFF, SEAWALL, EVAC_BUILDING, PARK, SHRINE, RAMP_A, RAMP_B, TERRAIN,
} from './world/layout';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function sourceLink(key?: string) {
  if (!key || !SOURCES[key]) return '';
  const s = SOURCES[key];
  return `<small>出典：<a href="${s.url}" target="_blank" rel="noopener">${esc(s.org)}「${esc(s.title)}」</a></small>`;
}

export class UI {
  private subTimer = 0;
  private bcTimer = 0;
  private hintTimer = 0;
  private hintText = '';
  private modalStack: string[] = [];
  onStart: () => void = () => {};
  onRetry: () => void = () => {};
  onRestart: () => void = () => {};
  onTitle: () => void = () => {};
  onPauseChange: (p: boolean) => void = () => {};
  onSettings: (s: Settings) => void = () => {};
  onSkip: () => void = () => {};
  noticeAccepted = false;
  paused = false;

  constructor(private settings: Settings) {
    this.fillStatic();
    this.bind();
    this.syncSettingsForm();
  }

  private fillStatic() {
    $('#notice-list').innerHTML = CONTENT_NOTICE.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#fiction-list').innerHTML = FICTION_NOTES.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#disclaimer-list').innerHTML = DISCLAIMER.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#about-facts').innerHTML = HISTORICAL_FACTS.map((f) => `<li>${esc(f.text)}${sourceLink(f.source)}</li>`).join('');
    $('#about-fiction').innerHTML = FICTION_NOTES.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#about-principles').innerHTML = PRINCIPLES.map((p) => `<li><b>${esc(p.title)}</b>：${esc(p.body)}${sourceLink(p.source)}</li>`).join('');
    $('#about-sources').innerHTML = Object.values(SOURCES).map((s) => `<li>${esc(s.org)}「${esc(s.title)}」<br><a href="${s.url}" target="_blank" rel="noopener">${s.url}</a></li>`).join('');
    $('#about-disclaimer').innerHTML = DISCLAIMER.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#review-principles').innerHTML = PRINCIPLES.map((p) => `<li><b>${esc(p.title)}</b>：${esc(p.body)}${sourceLink(p.source)}</li>`).join('');
    $('#review-disclaimer').innerHTML = DISCLAIMER.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#controls-desktop').innerHTML = CONTROLS_DESKTOP.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
    $('#controls-touch').innerHTML = CONTROLS_TOUCH.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  }

  private bind() {
    document.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => b.addEventListener('click', () => this.open(b.dataset.open!)));
    document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', () => this.close(b.dataset.close!)));
    $('#btn-start').addEventListener('click', () => {
      if (this.noticeAccepted) this.onStart();
      else this.show('notice');
    });
    $('#btn-notice-ok').addEventListener('click', () => {
      this.noticeAccepted = true;
      this.settings.intensity = $<HTMLSelectElement>('#notice-intensity').value as Settings['intensity'];
      this.syncSettingsForm();
      this.onSettings(this.settings);
      this.hide('notice');
      this.onStart();
    });
    $('#btn-notice-back').addEventListener('click', () => { this.hide('notice'); this.show('title'); });
    $('#btn-resume').addEventListener('click', () => this.togglePause(false));
    $('#btn-pause-retry').addEventListener('click', () => { this.togglePause(false); this.onRetry(); });
    $('#btn-pause-title').addEventListener('click', () => { this.togglePause(false); this.onTitle(); });
    $('#btn-fail-review').addEventListener('click', () => { this.hide('fail'); this.onReviewRequest(); });
    $('#btn-retry').addEventListener('click', () => { this.hide('review'); this.onRetry(); });
    $('#btn-restart').addEventListener('click', () => { this.hide('review'); this.onRestart(); });
    $('#btn-review-title').addEventListener('click', () => { this.hide('review'); this.onTitle(); });
    $('#btn-skip').addEventListener('click', () => this.onSkip());

    const form = () => {
      const s = this.settings;
      s.intensity = $<HTMLSelectElement>('#set-intensity').value as Settings['intensity'];
      s.volume = Number($<HTMLInputElement>('#set-volume').value) / 100;
      s.sensitivity = Number($<HTMLInputElement>('#set-sens').value) / 100;
      s.invertY = $<HTMLInputElement>('#set-invert').checked;
      s.touch = $<HTMLSelectElement>('#set-touch').value as Settings['touch'];
      s.quality = $<HTMLSelectElement>('#set-quality').value as Settings['quality'];
      s.showFps = $<HTMLInputElement>('#set-fps').checked;
      $<HTMLSelectElement>('#notice-intensity').value = s.intensity;
      this.onSettings(s);
    };
    ['#set-intensity', '#set-volume', '#set-sens', '#set-invert', '#set-touch', '#set-quality', '#set-fps'].forEach((id) => $(id).addEventListener('change', form));
    $('#set-volume').addEventListener('input', form);
  }
  onReviewRequest: () => void = () => {};

  syncSettingsForm() {
    const s = this.settings;
    $<HTMLSelectElement>('#set-intensity').value = s.intensity;
    $<HTMLSelectElement>('#notice-intensity').value = s.intensity;
    $<HTMLInputElement>('#set-volume').value = String(Math.round(s.volume * 100));
    $<HTMLInputElement>('#set-sens').value = String(Math.round(s.sensitivity * 100));
    $<HTMLInputElement>('#set-invert').checked = s.invertY;
    $<HTMLSelectElement>('#set-touch').value = s.touch;
    $<HTMLSelectElement>('#set-quality').value = s.quality;
    $<HTMLInputElement>('#set-fps').checked = s.showFps;
  }

  show(id: string) { $('#screen-' + id).classList.remove('hidden'); }
  hide(id: string) { $('#screen-' + id).classList.add('hidden'); }
  open(id: string) { this.modalStack.push(id); this.show(id); }
  close(id: string) {
    if (id === 'map') { $('#map').classList.add('hidden'); return; }
    this.hide(id);
    this.modalStack = this.modalStack.filter((m) => m !== id);
  }

  setLoading(text: string) { $('#loading-text').textContent = text; }
  doneLoading() { this.hide('loading'); this.show('title'); }

  onPhase(p: Phase) {
    const playing = p === 'prologue' || p === 'quake' || p === 'evacuate' || p === 'safe';
    $('#hud').classList.toggle('hidden', !playing && p !== 'failed');
    $('#touch').classList.toggle('hidden', !playing || !document.body.classList.contains('touch'));
    if (p === 'title') { this.show('title'); this.fade(false); }
    else this.hide('title');
    if (p !== 'safe') this.showSkip(false);
  }

  setTouch(on: boolean) {
    document.body.classList.toggle('touch', on);
    const hudVisible = !$('#hud').classList.contains('hidden');
    $('#touch').classList.toggle('hidden', !on || !hudVisible);
  }

  togglePause(force?: boolean) {
    this.paused = force ?? !this.paused;
    if (this.paused) this.show('pause');
    else { this.hide('pause'); this.hide('settings'); this.hide('controls'); }
    this.onPauseChange(this.paused);
  }

  objective(text: string) { $('#objective').textContent = text; }

  subtitle(text: string, sec: number) {
    const el = $('#subtitle');
    el.textContent = text;
    el.classList.remove('hidden');
    this.subTimer = sec;
  }

  broadcast(text: string, sec: number) {
    const el = $('#broadcast');
    el.textContent = text;
    el.classList.remove('hidden');
    this.bcTimer = sec;
  }

  promptHint(text: string, sec: number) {
    this.hintText = text;
    this.hintTimer = sec;
  }

  prompt(text: string | null) {
    const el = $('#prompt');
    const t = text ?? (this.hintTimer > 0 ? this.hintText : null);
    if (t) { el.textContent = t; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  sign(text: string | null) {
    const el = $('#sign-reader');
    if (text) { el.textContent = text; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  showSkip(on: boolean) { $('#btn-skip').classList.toggle('hidden', !on); }

  hideTransient() {
    ['#subtitle', '#broadcast', '#prompt', '#sign-reader', '#flood-note'].forEach((s) => $(s).classList.add('hidden'));
    this.subTimer = this.bcTimer = this.hintTimer = 0;
    ['fail', 'review', 'choice'].forEach((s) => this.hide(s));
    $('#map').classList.add('hidden');
  }

  fade(on: boolean) { $('#fade').style.opacity = on ? '1' : '0'; }
  vignette(v: number) { $('#vignette').style.opacity = String(Math.min(1, v)); }

  tick(dt: number) {
    if (this.subTimer > 0 && (this.subTimer -= dt) <= 0) $('#subtitle').classList.add('hidden');
    if (this.bcTimer > 0 && (this.bcTimer -= dt) <= 0) $('#broadcast').classList.add('hidden');
    if (this.hintTimer > 0) this.hintTimer -= dt;
  }

  hud(h: { clock: string; shake: number; showMeter: boolean; flood: boolean; fps: number }) {
    $('#clock').textContent = h.clock;
    $('#shake-meter').classList.toggle('hidden', !h.showMeter);
    if (h.showMeter) {
      $('#shake-bar').style.width = `${Math.round(h.shake * 100)}%`;
      $('#shake-label').textContent = h.shake > 0.7 ? '非常に強い' : h.shake > 0.4 ? '強い' : h.shake > 0.05 ? '弱い' : 'おさまった';
    }
    $('#flood-note').classList.toggle('hidden', !h.flood);
    const fps = $('#fps');
    fps.classList.toggle('hidden', h.fps < 0);
    if (h.fps >= 0) fps.textContent = `${h.fps.toFixed(0)} FPS`;
  }

  choice(title: string, body: string, buttons: { label: string; primary?: boolean; act: () => void }[]) {
    $('#choice-h').textContent = title;
    $('#choice-body').textContent = body;
    const wrap = $('#choice-buttons');
    wrap.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = 'btn' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      el.addEventListener('click', () => { this.hide('choice'); b.act(); });
      wrap.appendChild(el);
    }
    this.show('choice');
    (wrap.firstElementChild as HTMLElement)?.focus();
  }

  showFail() { this.show('fail'); }

  showReview(log: DecisionLog) {
    this.fade(false);
    const r = buildReview(log);
    $('#review-outcome').textContent = r.outcome;
    const sym = { good: '◎', mid: '△', bad: '✕', info: 'ℹ' };
    $('#review-items').innerHTML = r.items
      .map((i) => `<li><span class="mark ${i.mark}">${sym[i.mark]}</span><div><b>${esc(i.title)}</b>${esc(i.body)}${sourceLink(i.source)}</div></li>`)
      .join('');
    $('#review-timeline').innerHTML = log.timeline.map((e) => `<li><time>${e.clock}</time>${esc(e.text)}</li>`).join('');
    this.hide('fail');
    this.show('review');
    $('#hud').classList.add('hidden');
    $('#touch').classList.add('hidden');
  }

  // ------------------------------------------------------------------ hazard map
  toggleMap(player: THREE.Vector3) {
    const el = $('#map');
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    this.drawMap(player);
  }

  drawMap(player: THREE.Vector3) {
    const c = $<HTMLCanvasElement>('#map-canvas');
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    // view: x [-100,100], z [-150, 120]
    const x0 = -100, x1 = 100, z0 = -160, z1 = 110;
    const sx = (x: number) => ((x - x0) / (x1 - x0)) * W;
    const sz = (z: number) => ((z - z0) / (z1 - z0)) * H;
    g.fillStyle = '#e8e4d8';
    g.fillRect(0, 0, W, H);
    // hill
    g.fillStyle = '#b9cf9e';
    g.fillRect(0, 0, W, sz(CLIFF.zBase));
    // sea
    g.fillStyle = '#9cc3dc';
    g.fillRect(0, sz(SEAWALL.zFront + 4), W, H);
    // assumed inundation area (game)
    g.fillStyle = 'rgba(70,130,200,0.28)';
    g.fillRect(0, sz(CLIFF.zBase), W, sz(SEAWALL.zFront) - sz(CLIFF.zBase));
    // roads
    g.fillStyle = '#ffffff';
    for (const rx of ROADS_NS) g.fillRect(sx(rx - ROAD_HALF), sz(CLIFF.zBase), sx(rx + ROAD_HALF) - sx(rx - ROAD_HALF), sz(SEAWALL.zBack) - sz(CLIFF.zBase));
    for (const rz of ROADS_EW) g.fillRect(0, sz(rz - ROAD_HALF), W, sz(rz + ROAD_HALF) - sz(rz - ROAD_HALF));
    g.fillStyle = '#f2efe6';
    g.fillRect(sx(RAMP_A.x - RAMP_A.halfWidth), sz(RAMP_A.z1 - 6), sx(RAMP_A.x + RAMP_A.halfWidth) - sx(RAMP_A.x - RAMP_A.halfWidth), sz(RAMP_A.z0) - sz(RAMP_A.z1 - 6));
    g.fillStyle = '#ddd6c6';
    g.fillRect(sx(RAMP_B.x - 1.5), sz(RAMP_B.z1), sx(RAMP_B.x + 1.5) - sx(RAMP_B.x - 1.5), sz(-32) - sz(RAMP_B.z1));
    // seawall
    g.fillStyle = '#8a8a8a';
    g.fillRect(0, sz(SEAWALL.zBack), W, sz(SEAWALL.zFront) - sz(SEAWALL.zBack));
    // evacuation places
    g.fillStyle = '#1f7a4a';
    g.beginPath(); g.arc(sx(PARK.x), sz(PARK.z), 14, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(sx(SHRINE.x), sz(SHRINE.z), 10, 0, Math.PI * 2); g.fill();
    g.fillRect(sx(EVAC_BUILDING.x - EVAC_BUILDING.w / 2), sz(EVAC_BUILDING.z - EVAC_BUILDING.d / 2), sx(EVAC_BUILDING.x + EVAC_BUILDING.w / 2) - sx(EVAC_BUILDING.x - EVAC_BUILDING.w / 2), sz(EVAC_BUILDING.z + EVAC_BUILDING.d / 2) - sz(EVAC_BUILDING.z - EVAC_BUILDING.d / 2));
    g.fillStyle = '#16212a';
    g.font = 'bold 14px sans-serif';
    g.textAlign = 'center';
    g.fillText('潮凪台公園（避難場所）', sx(PARK.x), sz(PARK.z) - 20);
    g.fillText('潮凪神社（より高い場所）', sx(SHRINE.x), sz(SHRINE.z) - 16);
    g.fillText('避難ビル', sx(EVAC_BUILDING.x), sz(EVAC_BUILDING.z) + 4 + 18);
    g.fillText('坂道', sx(RAMP_A.x) + 26, sz(-42));
    g.fillText('階段（近道）', sx(RAMP_B.x) - 40, sz(-50));
    g.fillText('防潮堤', sx(-70), sz(SEAWALL.zBack) - 4);
    g.fillText('海', sx(-60), sz(90));
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(sx(-98), sz(-46), sx(-30) - sx(-98), 22);
    g.fillStyle = '#1d4f86';
    g.fillText('浸水想定区域（ゲーム内）', sx(-64), sz(-46) + 16);
    // north arrow
    g.fillStyle = '#16212a';
    g.fillText('北 ↑', W - 30, 20);
    // player
    g.fillStyle = '#d93a2a';
    g.beginPath(); g.arc(sx(player.x), sz(player.z), 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    void TERRAIN;
  }
}
