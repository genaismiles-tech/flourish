// Daily rate limiter for third-party vision APIs.
// Limits are set slightly below the free-tier ceilings as a safety buffer.
// Set PLANTNET_DAILY_LIMIT / PLANT_ID_DAILY_LIMIT in .env to override.
//
// Counts reset at midnight server local time and are held in memory —
// a server restart also resets them, which is intentional for a single-instance app.

export type ApiService = "plantnet" | "plantid" | "inat" | "gemini";

interface ServiceConfig {
  limit: number;
  used: number;
  resetDate: string; // YYYY-MM-DD
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // "2026-05-02"
}

function defaultLimit(service: ApiService): number {
  const envMap: Partial<Record<ApiService, string | undefined>> = {
    plantnet: process.env.PLANTNET_DAILY_LIMIT,
    plantid:  process.env.PLANT_ID_DAILY_LIMIT,
    inat:     process.env.INAT_DAILY_LIMIT,
    gemini:   process.env.GEMINI_DAILY_LIMIT,
  };
  const env = envMap[service];
  if (env) {
    const n = parseInt(env, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  // Conservative defaults: ~10% below published free limits
  const defaults: Record<ApiService, number> = {
    plantnet: 450,
    plantid:  90,
    inat:     450,  // no hard limit documented; conservative cap
    gemini:   1450, // Gemini Flash free tier: 1,500/day
  };
  return defaults[service];
}

const state: Record<ApiService, ServiceConfig> = {
  plantnet: { limit: defaultLimit("plantnet"), used: 0, resetDate: todayString() },
  plantid:  { limit: defaultLimit("plantid"),  used: 0, resetDate: todayString() },
  inat:     { limit: defaultLimit("inat"),     used: 0, resetDate: todayString() },
  gemini:   { limit: defaultLimit("gemini"),   used: 0, resetDate: todayString() },
};

function resetIfNewDay(service: ApiService): void {
  const today = todayString();
  if (state[service].resetDate !== today) {
    state[service].used = 0;
    state[service].resetDate = today;
  }
}

/** Returns true and increments the counter if the call is allowed; false if the daily limit is reached. */
export function consume(service: ApiService): boolean {
  resetIfNewDay(service);
  if (state[service].used >= state[service].limit) return false;
  state[service].used++;
  return true;
}

/** Quota snapshot for the /api/health endpoint. */
export function quotaSnapshot(): Record<ApiService, { used: number; limit: number; remaining: number }> {
  (["plantnet", "plantid", "inat", "gemini"] as ApiService[]).forEach(resetIfNewDay);
  const snap = {} as Record<ApiService, { used: number; limit: number; remaining: number }>;
  for (const svc of ["plantnet", "plantid", "inat", "gemini"] as ApiService[]) {
    snap[svc] = {
      used: state[svc].used,
      limit: state[svc].limit,
      remaining: Math.max(0, state[svc].limit - state[svc].used),
    };
  }
  return snap;
}
