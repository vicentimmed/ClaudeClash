const STORAGE_KEY = 'claudeclash.dev.v1';

export type SpeedMultiplier = 1 | 2 | 3;

export interface DevSettings {
  gameSpeed: SpeedMultiplier;
  elixirSpeed: SpeedMultiplier;
  botEnabled: boolean;
}

const DEFAULTS: DevSettings = { gameSpeed: 1, elixirSpeed: 1, botEnabled: true };

function parseMultiplier(value: unknown): SpeedMultiplier | undefined {
  if (value === 2 || value === 3) return value;
  if (value === 1) return 1;
  return undefined;
}

export function loadDevSettings(): DevSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<DevSettings>;
    return {
      gameSpeed: parseMultiplier(parsed.gameSpeed) ?? DEFAULTS.gameSpeed,
      elixirSpeed: parseMultiplier(parsed.elixirSpeed) ?? DEFAULTS.elixirSpeed,
      botEnabled: typeof parsed.botEnabled === 'boolean' ? parsed.botEnabled : DEFAULTS.botEnabled,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDevSettings(settings: DevSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode */
  }
}
