export type Intensity = 'standard' | 'reduced' | 'minimal';

export interface Settings {
  intensity: Intensity;
  volume: number; // 0..1
  sensitivity: number; // 0.2..2
  invertY: boolean;
  touch: 'auto' | 'on' | 'off';
  quality: 'high' | 'low';
  showFps: boolean;
}

const KEY = '1446-settings-v1';

export const DEFAULTS: Settings = {
  intensity: 'standard',
  volume: 0.7,
  sensitivity: 1,
  invertY: false,
  touch: 'auto',
  quality: 'high',
  showFps: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Multipliers derived from the intensity option. */
export function fx(s: Settings) {
  switch (s.intensity) {
    case 'reduced':
      return { shake: 0.35, buildingSway: 0.4, falling: 0.5, flash: false, rumble: 0.45, water: 'reduced' as const };
    case 'minimal':
      return { shake: 0, buildingSway: 0.1, falling: 0, flash: false, rumble: 0.15, water: 'minimal' as const };
    default:
      return { shake: 1, buildingSway: 1, falling: 1, flash: true, rumble: 1, water: 'full' as const };
  }
}
