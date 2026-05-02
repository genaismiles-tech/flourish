// Shop lookup: OpenStreetMap Overpass API (real data, no key) + curated CA/TX nurseries
// + verified community resources, online seed stores, and government programs.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CuratedShop {
  name: string;
  type: string;
  region?: string;
  description: string;
  states: string[];
  website?: string;
  phone?: string;
  address?: string;
  specialty: string[];
  cities?: string[];
  tags?: string[];
}

interface CommunityResource {
  name: string;
  type: string;
  resource_type: string;
  region?: string | null;
  description: string;
  states: string[];
  url?: string;
  phone?: string;
  specialty: string[];
  cities?: string[];
  tags?: string[];
}

const CURATED: CuratedShop[] = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "shops-ca-tx.json"), "utf-8")
);

const COMMUNITY: CommunityResource[] = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "community-resources.json"), "utf-8")
);

export interface ShopResult {
  name: string;
  shopType: string;
  description: string;
  address?: string;
  phone?: string;
  distance?: string;
  website?: string;
  mapUrl?: string;
  source: "osm" | "curated" | "community";
  tags?: string[];
}

// ── Bay Area / subregion detection ────────────────────────────────────────────

const BAY_AREA_CITIES = new Set([
  "san jose", "cupertino", "sunnyvale", "santa clara", "mountain view",
  "palo alto", "menlo park", "redwood city", "san mateo", "san francisco",
  "oakland", "berkeley", "fremont", "hayward", "milpitas", "campbell",
  "los gatos", "saratoga", "los altos", "morgan hill", "gilroy", "san martin",
  "pleasanton", "livermore", "dublin", "walnut creek", "concord", "richmond",
  "marin", "san rafael", "novato", "petaluma", "santa rosa", "napa",
]);

const SOCAL_CITIES = new Set([
  "los angeles", "san diego", "anaheim", "irvine", "riverside",
  "orange", "corona del mar", "newport beach", "santa ana", "long beach",
  "pasadena", "burbank", "glendale", "torrance", "compton", "ventura",
  "santa barbara", "thousand oaks", "oxnard", "san bernardino",
  "palm springs", "coachella", "palm desert", "temecula", "escondido",
  "chula vista", "el cajon", "poway", "san marcos",
]);

const AUSTIN_CITIES = new Set(["austin", "round rock", "pflugerville", "cedar park", "kyle", "buda"]);
const HOUSTON_CITIES = new Set(["houston", "galveston", "sugar land", "katy", "the woodlands", "pearland"]);
const DALLAS_CITIES = new Set(["dallas", "fort worth", "plano", "arlington", "irving", "garland", "frisco", "mckinney"]);
const SA_CITIES = new Set(["san antonio", "new braunfels"]);

export type GardenRegion = "bay-area" | "socal" | "san-diego" | "austin" | "houston" | "dallas" | "san-antonio" | "other";

export function detectRegion(location: string): GardenRegion {
  const lower = location.toLowerCase();
  if (BAY_AREA_CITIES.has(lower) || [...BAY_AREA_CITIES].some((c) => lower.includes(c))) return "bay-area";
  if ([...SOCAL_CITIES].some((c) => lower.includes(c))) {
    if (lower.includes("san diego") || lower.includes("poway") || lower.includes("escondido")) return "san-diego";
    return "socal";
  }
  if ([...AUSTIN_CITIES].some((c) => lower.includes(c))) return "austin";
  if ([...HOUSTON_CITIES].some((c) => lower.includes(c))) return "houston";
  if ([...DALLAS_CITIES].some((c) => lower.includes(c))) return "dallas";
  if ([...SA_CITIES].some((c) => lower.includes(c))) return "san-antonio";
  return "other";
}

// ── Geocoding via Nominatim (OSM) ─────────────────────────────────────────────

async function geocode(location: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Flourish-GardenApp/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hits = (await res.json()) as any[];
    if (!hits.length) return null;
    return { lat: parseFloat(hits[0].lat), lon: parseFloat(hits[0].lon) };
  } catch {
    return null;
  }
}

// ── Overpass QL query for garden centres / nurseries ─────────────────────────

function buildOverpassQuery(lat: number, lon: number, radiusM = 30000): string {
  return `
[out:json][timeout:8];
(
  node["shop"="garden_centre"](around:${radiusM},${lat},${lon});
  node["shop"="nursery"](around:${radiusM},${lat},${lon});
  way["shop"="garden_centre"](around:${radiusM},${lat},${lon});
  way["shop"="nursery"](around:${radiusM},${lat},${lon});
);
out body;
>;
out skel qt;`.trim();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function queryOverpass(lat: number, lon: number): Promise<ShopResult[]> {
  try {
    const body = `data=${encodeURIComponent(buildOverpassQuery(lat, lon))}`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as { elements: any[] };

    return data.elements
      .filter((el) => el.tags?.name)
      .slice(0, 5)
      .map((el) => {
        const tags = el.tags;
        const elLat: number = el.lat ?? el.center?.lat ?? lat;
        const elLon: number = el.lon ?? el.center?.lon ?? lon;
        const km = haversineKm(lat, lon, elLat, elLon);

        let address = "";
        if (tags["addr:housenumber"] && tags["addr:street"]) {
          address = `${tags["addr:housenumber"]} ${tags["addr:street"]}`;
          if (tags["addr:city"]) address += `, ${tags["addr:city"]}`;
        } else if (tags["addr:full"]) {
          address = tags["addr:full"];
        }

        return {
          name: tags.name,
          shopType: tags.shop === "nursery" ? "Plant Nursery" : "Garden Centre",
          description: `Local ${tags.shop === "nursery" ? "plant nursery" : "garden centre"} stocking plants and gardening supplies.`,
          address: address || undefined,
          distance: `${km.toFixed(1)} km away`,
          website: tags.website,
          mapUrl: `https://www.openstreetmap.org/?mlat=${elLat}&mlon=${elLon}&zoom=16`,
          source: "osm" as const,
        };
      });
  } catch {
    return [];
  }
}

// ── Curated physical shops by state + region ──────────────────────────────────

function curatedPhysicalShops(state: string | null, region: GardenRegion, limit: number): ShopResult[] {
  if (!state) return [];

  const regionMap: Record<GardenRegion, string[]> = {
    "bay-area": ["bay-area"],
    "socal": ["socal"],
    "san-diego": ["san-diego", "socal"],
    "austin": ["austin"],
    "houston": ["houston"],
    "dallas": ["dallas"],
    "san-antonio": ["san-antonio"],
    "other": [],
  };

  const preferredRegions = regionMap[region];

  // First: region-matched shops
  let pool = CURATED.filter(
    (s) =>
      s.states.includes(state) &&
      s.type !== "online-nursery" &&
      s.type !== "government" &&
      s.type !== "community" &&
      (preferredRegions.length === 0 || preferredRegions.includes(s.region ?? ""))
  );

  // Fallback: any shop in the state if region didn't match enough
  if (pool.length < 2) {
    pool = CURATED.filter(
      (s) =>
        s.states.includes(state) &&
        s.type !== "online-nursery" &&
        s.type !== "government" &&
        s.type !== "community"
    );
  }

  return pool.slice(0, limit).map((s) => ({
    name: s.name,
    shopType:
      s.type === "nursery-chain"
        ? "Nursery Chain"
        : s.type === "arborist"
        ? "Tree Care"
        : "Independent Nursery",
    description: s.description,
    address: s.address,
    phone: s.phone,
    website: s.website,
    mapUrl: s.website ? `https://${s.website}` : undefined,
    source: "curated" as const,
  }));
}

// ── Community resources: online stores, programs, compost ────────────────────

export function getCommunityResources(
  state: string | null,
  region: GardenRegion,
  plantTags: string[] = []
): ShopResult[] {
  const results: ShopResult[] = [];

  // Bay Area government programs
  if (region === "bay-area") {
    const bayAreaResources = COMMUNITY.filter(
      (r) =>
        r.region === "bay-area" &&
        (r.type === "government" || r.type === "community")
    );
    for (const r of bayAreaResources) {
      results.push({
        name: r.name,
        shopType:
          r.type === "government"
            ? r.resource_type === "rebate"
              ? "Water Rebate Program"
              : "Community Facility"
            : "Community Garden",
        description: r.description,
        phone: r.phone,
        website: r.url,
        mapUrl: r.url,
        source: "community",
        tags: r.tags,
      });
    }
  }

  // South Asian plant sources when relevant tags are detected
  const hasSouthAsianPlants =
    plantTags.some((t) => t === "south-asian") ||
    plantTags.some((t) => ["tulsi", "ajwain", "curry", "karela", "moringa", "karpooravalli"].some((k) => t.includes(k)));

  if (hasSouthAsianPlants || region === "bay-area") {
    const indianSources = COMMUNITY.filter(
      (r) => r.tags?.includes("south-asian") && r.resource_type.includes("online")
    ).slice(0, 2);
    for (const r of indianSources) {
      results.push({
        name: r.name,
        shopType: "Online Seeds & Plants",
        description: r.description,
        website: r.url,
        mapUrl: r.url,
        source: "community",
        tags: r.tags,
      });
    }
  }

  // Community networks and seed banks
  const communityNets = COMMUNITY.filter(
    (r) =>
      (r.type === "community" && r.resource_type === "community-network") ||
      (r.resource_type === "seed-bank" &&
        (state === null || r.states.includes(state)))
  ).slice(0, 1);
  for (const r of communityNets) {
    results.push({
      name: r.name,
      shopType: r.resource_type === "seed-bank" ? "Heirloom Seed Bank" : "Community Network",
      description: r.description,
      website: r.url,
      mapUrl: r.url,
      source: "community",
      tags: r.tags,
    });
  }

  return results;
}

// ── Generic helpful resources (always appended) ───────────────────────────────

const GENERIC_RESOURCES: ShopResult[] = [
  {
    name: "Community Garden Network",
    shopType: "Community Resource",
    description:
      "Local community gardens often run plant swaps, seed libraries, and share excess seedlings — great for free plants and local knowledge.",
    source: "community",
  },
  {
    name: "Master Gardener Program",
    shopType: "Educational Resource",
    description:
      "Your county's Master Gardener Extension office offers free gardening advice, soil testing, and workshops tailored to your local climate.",
    source: "community",
  },
];

// ── Main export ───────────────────────────────────────────────────────────────

export async function findLocalShops(
  location: string,
  state: string | null,
  plantTags: string[] = []
): Promise<ShopResult[]> {
  const region = detectRegion(location);
  const results: ShopResult[] = [];

  // 1. Real OSM data
  const coords = await geocode(location);
  if (coords) {
    const osmShops = await queryOverpass(coords.lat, coords.lon);
    results.push(...osmShops);
  }

  // 2. Curated physical nurseries (region-matched)
  const needed = Math.max(0, 4 - results.length);
  if (needed > 0) {
    results.push(...curatedPhysicalShops(state, region, needed));
  }

  // 3. Community resources (rebates, online seeds, compost, networks)
  results.push(...getCommunityResources(state, region, plantTags));

  // 4. Generic fallbacks
  results.push(...GENERIC_RESOURCES);

  return results;
}
