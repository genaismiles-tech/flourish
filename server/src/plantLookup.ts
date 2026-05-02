import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ── Types ────────────────────────────────────────────────────────────────────

interface PlantRecord {
  scientific_name: string;
  common_name: string;
  emoji: string;
  category: string;
  care_level: "easy" | "moderate" | "advanced";
  description: string;
  hardiness_zone_min: number;
  hardiness_zone_max: number;
  states: string[];
  native_states: string[];
  seasons: string[];
  sun: string;
  water: string;
  beginner_friendly: boolean;
  garden_types: string[];
  tags: string[];
}

export interface PlantCareInfo {
  commonName: string;
  scientificName: string;
  sun: string;
  water: string;
  category: string;
  tags: string[];
  beginner_friendly: boolean;
  seasons: string[];
  native_states: string[];
  care_level: "easy" | "moderate" | "advanced";
}

export interface PlantSuggestion {
  name: string;
  emoji: string;
  reason: string;
  careLevel: "easy" | "moderate" | "advanced";
  category: string;
}

interface LookupParams {
  state: string | null;
  zone: number;
  experience: string;
  gardenType: string;
  preferences: string[];
  season: string;
  limit: number;
}

type ZoneMap = Record<string, number>;

// ── Load data at module startup ──────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "..", "data");

const ALL_PLANTS: PlantRecord[] = JSON.parse(
  readFileSync(join(dataDir, "plants-ca-tx.json"), "utf-8")
);

const ZONE_MAP: ZoneMap = JSON.parse(
  readFileSync(join(dataDir, "zones.json"), "utf-8")
);

// ── CA / TX city lists for state detection ───────────────────────────────────

const CA_CITIES = new Set([
  "los angeles", "san francisco", "san diego", "oakland", "berkeley",
  "san jose", "sacramento", "fresno", "bakersfield", "riverside",
  "san bernardino", "santa barbara", "palm springs", "coachella",
  "modesto", "stockton", "redding", "chico", "eureka", "santa cruz",
  "monterey", "ventura", "anaheim", "irvine", "mountain view",
  "palo alto", "sunnyvale", "hayward", "concord", "walnut creek",
  "lake tahoe", "truckee", "mammoth", "bishop", "yosemite",
]);

const TX_CITIES = new Set([
  "houston", "galveston", "dallas", "fort worth", "san antonio",
  "austin", "el paso", "lubbock", "amarillo", "midland", "odessa",
  "corpus christi", "laredo", "mcallen", "brownsville", "waco",
  "killeen", "abilene", "beaumont", "tyler", "longview", "texarkana",
  "round rock", "plano", "irving", "arlington", "garland", "sugar land",
  "new braunfels",
]);

// ── Genus-based care lookup ──────────────────────────────────────────────────

export function findCareByGenus(genus: string): PlantCareInfo | undefined {
  if (!genus) return undefined;
  const lower = genus.toLowerCase();
  const plant = ALL_PLANTS.find((p) => {
    const sci = p.scientific_name.toLowerCase();
    return sci.startsWith(lower + " ") || sci === lower;
  });
  if (!plant) return undefined;
  return {
    commonName: plant.common_name,
    scientificName: plant.scientific_name,
    sun: plant.sun,
    water: plant.water,
    category: plant.category,
    tags: plant.tags,
    beginner_friendly: plant.beginner_friendly,
    seasons: plant.seasons,
    native_states: plant.native_states,
    care_level: plant.care_level,
  };
}

// ── Exported helpers ─────────────────────────────────────────────────────────

/**
 * Detect "CA" or "TX" from a free-text location string.
 * Returns null if neither can be determined.
 */
export function detectState(location: string): string | null {
  const lower = location.toLowerCase().trim();

  // Explicit state names / abbreviations
  if (/\bcalifornia\b/.test(lower) || /\b,\s*ca\b/.test(lower) || /\bca\b/.test(lower)) return "CA";
  if (/\btexas\b/.test(lower) || /\b,\s*tx\b/.test(lower) || /\btx\b/.test(lower)) return "TX";

  // City-name match
  for (const city of CA_CITIES) {
    if (lower.includes(city)) return "CA";
  }
  for (const city of TX_CITIES) {
    if (lower.includes(city)) return "TX";
  }

  return null;
}

/**
 * Look up the USDA hardiness zone for a location string.
 * Falls back to the state default, then to 8 if nothing matches.
 */
export function getZone(location: string): number {
  const lower = location.toLowerCase().trim();

  // Try a direct city match first (check longest strings first to avoid
  // partial matches, e.g., "san" matching "san jose")
  const cityEntries = Object.entries(ZONE_MAP)
    .filter(([k]) => !k.startsWith("_"))
    .sort((a, b) => b[0].length - a[0].length);

  for (const [city, zone] of cityEntries) {
    if (lower.includes(city)) return zone;
  }

  // Fall back to state default
  const state = detectState(location);
  if (state) {
    const stateDefault = ZONE_MAP[`_${state}`];
    if (stateDefault !== undefined) return stateDefault;
  }

  return 8; // Generic fallback
}

/**
 * Return the current meteorological season based on the system clock.
 */
export function getSeason(): string {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

// ── Reason string builder ────────────────────────────────────────────────────

function buildReason(
  plant: PlantRecord,
  state: string | null,
  zone: number,
  season: string
): string {
  const parts: string[] = [];

  // Native status
  if (state && plant.native_states.includes(state)) {
    const stateName = state === "CA" ? "California" : "Texas";
    parts.push(`Native to ${stateName}`);
  }

  // Zone suitability note
  if (zone >= 9 && plant.tags.includes("drought-tolerant")) {
    parts.push("Drought-tolerant");
  }

  // Beginner highlight
  if (plant.beginner_friendly) parts.push("Beginner-friendly");

  // Seasonal bloom hint
  const currentSeasons = plant.seasons;
  if (currentSeasons.includes(season)) {
    parts.push(`Great for ${season}`);
  } else if (currentSeasons.length > 0) {
    const seasonList = currentSeasons.join("/");
    parts.push(`Best in ${seasonList}`);
  }

  // Pollinator / wildlife
  if (plant.tags.includes("pollinator") || plant.tags.includes("hummingbird")) {
    const attrs = [];
    if (plant.tags.includes("pollinator")) attrs.push("pollinators");
    if (plant.tags.includes("hummingbird")) attrs.push("hummingbirds");
    parts.push(`Attracts ${attrs.join(" & ")}`);
  }

  // Edibility
  if (plant.tags.includes("edible")) parts.push("Edible harvest");

  // Fallback to the first sentence of the description
  if (parts.length === 0) {
    const firstSentence = plant.description.split(".")[0];
    if (firstSentence) parts.push(firstSentence);
  }

  return parts.join(" · ");
}

// ── Deterministic shuffle (seeded) ──────────────────────────────────────────

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Simple numeric hash of a string, used as shuffle seed
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Main lookup function ─────────────────────────────────────────────────────

export function lookupPlants(params: LookupParams): PlantSuggestion[] {
  const { state, zone, experience, gardenType, preferences, season, limit } = params;

  // ── 1. Filter by state ──────────────────────────────────────────────────
  let pool = state
    ? ALL_PLANTS.filter((p) => p.states.includes(state))
    : [...ALL_PLANTS];

  // ── 2. Filter by hardiness zone ─────────────────────────────────────────
  let zoneFiltered = pool.filter(
    (p) => zone >= p.hardiness_zone_min && zone <= p.hardiness_zone_max
  );

  // Fallback: if zone filtering is too restrictive, relax it
  if (zoneFiltered.length < 5) zoneFiltered = pool;

  // ── 3. Filter by garden type ─────────────────────────────────────────────
  const strictGardenTypes = ["balcony", "indoor"];
  let gardenFiltered = zoneFiltered;
  if (strictGardenTypes.includes(gardenType)) {
    const narrowed = zoneFiltered.filter((p) => p.garden_types.includes(gardenType));
    if (narrowed.length >= 3) gardenFiltered = narrowed;
  }

  // ── 4. Preference category matching ─────────────────────────────────────
  const prefLower = preferences.map((p) => p.toLowerCase());

  // Normalize preference strings to category names we use
  const prefMatches = (plant: PlantRecord): boolean => {
    if (prefLower.length === 0) return false;
    const catLower = plant.category.toLowerCase();
    const tagMatch = plant.tags.some((t) =>
      prefLower.some((pref) => t.toLowerCase().includes(pref) || pref.includes(t.toLowerCase()))
    );
    const catMatch = prefLower.some(
      (pref) => catLower.includes(pref) || pref.includes(catLower)
    );
    return tagMatch || catMatch;
  };

  // ── 5. Scoring ───────────────────────────────────────────────────────────
  type Scored = { plant: PlantRecord; score: number };

  const scored: Scored[] = gardenFiltered.map((plant) => {
    let score = 0;

    // Preference match → highest boost
    if (prefMatches(plant)) score += 100;

    // Beginner boost
    if (experience === "beginner" && plant.beginner_friendly) score += 50;

    // Seasonal relevance
    if (plant.seasons.includes(season)) score += 30;

    // Native plants get a small bonus (they're well-adapted)
    if (state && plant.native_states.includes(state)) score += 20;

    return { plant, score };
  });

  // Group into preference-matched and rest
  const matched = scored.filter((s) => s.score >= 100);
  const rest = scored.filter((s) => s.score < 100);

  // Sort each group by score descending, then shuffle within equal-score clusters
  const seed = hashString(
    `${state ?? ""}${zone}${experience}${gardenType}${preferences.join("")}${season}`
  );

  const sortAndShuffle = (items: Scored[]): PlantRecord[] => {
    // Sort by score descending
    items.sort((a, b) => b.score - a.score);
    // Within ties, apply a deterministic shuffle
    const scoreGroups = new Map<number, PlantRecord[]>();
    for (const { plant, score } of items) {
      const group = scoreGroups.get(score) ?? [];
      group.push(plant);
      scoreGroups.set(score, group);
    }
    const result: PlantRecord[] = [];
    for (const [, group] of [...scoreGroups.entries()].sort((a, b) => b[0] - a[0])) {
      result.push(...seededShuffle(group, seed));
    }
    return result;
  };

  const orderedMatched = sortAndShuffle(matched);
  const orderedRest = sortAndShuffle(rest);
  const combined = [...orderedMatched, ...orderedRest];

  // ── 6. Ensure minimum output ─────────────────────────────────────────────
  let finalPool = combined.length > 0 ? combined : gardenFiltered;
  if (finalPool.length === 0) finalPool = ALL_PLANTS;

  const selected = finalPool.slice(0, limit);

  // ── 7. Map to PlantSuggestion ────────────────────────────────────────────
  return selected.map((plant) => ({
    name: plant.common_name,
    emoji: plant.emoji,
    reason: buildReason(plant, state, zone, season),
    careLevel: plant.care_level,
    category: plant.category,
  }));
}
