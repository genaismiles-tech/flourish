import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { lookupPlants, getZone, getSeason, detectState } from "./db.js";
import { identifyWithINat, isINatConfigured } from "./inaturalist.js";
import { analyzeGardenWithGemini, diagnoseWithGemini, chatWithGemini, isGeminiConfigured, getPlantPricesWithGemini } from "./gemini.js";
import { findLocalShops } from "./shopLookup.js";
import { buildGardenAnalysis, buildDiagnosis } from "./gardenAnalyzer.js";
import { consume, quotaSnapshot } from "./rateLimiter.js";
import {
  createUser, getUserByEmail, getUserById,
  upsertProfile, getProfile,
  addHistory, listHistory, getHistoryItem, deleteHistoryItem,
  addPlanItem, listPlan, updatePlanStatus, deletePlanItem, planItemExists,
} from "./database.js";
import { signToken, requireAuth, type AuthRequest } from "./auth.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const HAS_INAT = isINatConfigured();
const HAS_GEMINI = isGeminiConfigured();

const modeLines = [
  HAS_INAT   ? "🌿 iNaturalist (plant ID)" : "",
  HAS_GEMINI ? "🤖 Gemini Flash (AI analysis)" : "",
].filter(Boolean);

if (modeLines.length === 0) {
  console.log("⚠️  No API keys found — running in DEMO MODE (mock data only)");
} else {
  console.log(`✅ Active data sources: ${modeLines.join(", ")}`);
  console.log("🗺️  OpenStreetMap (local shops) — always active");
}

// ── Mock data ──────────────────────────────────────────────────────────────
const MOCK_GARDEN_ANALYSIS = {
  identifiedPlants: [
    { name: "Rosa 'Peace'", commonName: "Peace Rose", healthStatus: "healthy", healthNotes: "Vibrant foliage, no signs of disease. Deadheading recommended.", position: "Front border" },
    { name: "Lavandula angustifolia", commonName: "English Lavender", healthStatus: "healthy", healthNotes: "Compact and aromatic. Ready for light trimming after flowering.", position: "Middle bed" },
    { name: "Hedera helix", commonName: "English Ivy", healthStatus: "needs-attention", healthNotes: "Some yellowing leaves — likely overwatering or root congestion.", position: "Back wall" },
    { name: "Salvia officinalis", commonName: "Garden Sage", healthStatus: "healthy", healthNotes: "Good colour, harvest tips regularly to encourage bushiness.", position: "Herb corner" },
  ],
  gardenSummary: "🌿 DEMO MODE — Your garden shows a lovely mix of roses, lavender, and herbs with great potential. The ivy at the back needs attention but everything else looks healthy. Add your API keys in server/.env for real plant identification.",
  layoutSuggestions: [
    { title: "Move lavender to the sunniest spot", description: "Lavender thrives in full sun. Shifting it to the south-facing border will improve flowering and fragrance significantly.", priority: "quick-win", estimatedImpact: "50% more blooms next season" },
    { title: "Add a focal point at the garden centre", description: "A birdbath, small sculpture, or tall ornamental grass in the centre will draw the eye and give the garden a sense of design.", priority: "seasonal", estimatedImpact: "Dramatically improves visual structure" },
    { title: "Create defined pathways", description: "Bark chip or stepping stone paths between beds will make the garden feel intentional and reduce lawn maintenance.", priority: "long-term", estimatedImpact: "Reduces weekly maintenance by 30%" },
  ],
  beautySuggestions: [
    { title: "Add a colour burst with summer annuals", description: "Interplant zinnias and marigolds between your roses for a vivid pop of orange and yellow from June to October.", suggestedPlants: ["Zinnia 'Benary Giant'", "French Marigold", "Cosmos bipinnatus"] },
    { title: "Introduce night-scented plants", description: "Plant jasmine or nicotiana near a seating area so evenings in the garden are fragrant and atmospheric.", suggestedPlants: ["Jasminum officinale", "Nicotiana alata", "Matthiola incana"] },
  ],
  recommendedNewPlants: [
    { name: "Echinacea purpurea", reason: "Drought-tolerant, loved by pollinators, and provides colour from midsummer through autumn. Perfect for beginners.", careLevel: "easy", whenToPlant: "Spring or early autumn" },
    { name: "Salvia nemorosa 'Caradonna'", reason: "Deep purple spikes that pair beautifully with your existing roses and lavender. Very low maintenance.", careLevel: "easy", whenToPlant: "Spring" },
    { name: "Acer palmatum", reason: "A Japanese maple would add stunning autumn colour and year-round structure to your garden.", careLevel: "moderate", whenToPlant: "Autumn for best establishment" },
  ],
  maintenanceSchedule: [
    { task: "Deadhead roses", frequency: "Weekly", bestTime: "Morning", tips: "Cut just above a 5-leaflet leaf to encourage reblooming" },
    { task: "Trim lavender", frequency: "Twice yearly", bestTime: "After first flush in July, again in September", tips: "Never cut back into old wood — keep it in the green growth" },
    { task: "Feed with slow-release fertiliser", frequency: "Monthly (April–August)", bestTime: "After watering", tips: "Avoid high-nitrogen feeds near flowering plants" },
    { task: "Weed & mulch beds", frequency: "Monthly", bestTime: "After rain when soil is soft", tips: "2–3 cm of bark mulch suppresses weeds and retains moisture" },
  ],
  trimmingAndWaste: {
    advice: "Collect rose prunings and spent lavender stems separately. Most healthy trimmings can be composted but avoid diseased material.",
    compostingTips: "Soft green cuttings, deadheaded flowers, and grass clippings compost quickly. Chop woody stems before adding.",
    disposalAdvice: "Take diseased leaves, ivy cuttings (invasive), and treated timber to your local green waste centre — don't compost these.",
  },
  localResources: [
    { type: "Local nursery", description: "A good independent nursery will stock climate-appropriate varieties and staff can advise on your soil type.", searchSuggestion: "independent garden nursery near me" },
    { type: "Community compost site", description: "Many councils offer free compost in exchange for green waste drop-offs — great for sustainable gardening.", searchSuggestion: "council compost scheme near me" },
    { type: "Tool library or hire shop", description: "Rent larger tools like rotavators or pressure washers rather than buying — saves money and storage space.", searchSuggestion: "garden tool hire near me" },
  ],
  weatherConsiderations: "Based on a temperate climate, expect frosts between November and March — protect tender plants with fleece. Summer drought is increasingly common; consider installing a water butt.",
  seasonalAdvice: "Now is a great time to mulch beds before summer heat arrives, plant out tender annuals after the last frost, and divide any overcrowded perennials.",
  potAndContainerAdvice: "Use a loam-based compost with added grit for drainage, and repot every 2 years.",
  overallScore: { score: 7, label: "Looking Great!", message: "Your garden has excellent bones. A few targeted improvements will take it from good to stunning. (Demo data)" },
};

const MOCK_SUGGESTIONS = [
  { name: "Lavender", emoji: "💜", reason: "Drought-tolerant, fragrant, and loved by bees. Perfect for beginners.", careLevel: "easy", category: "Flowering Plants" },
  { name: "Cherry Tomato", emoji: "🍅", reason: "Incredibly rewarding for new gardeners — fast growing and productive even in pots.", careLevel: "easy", category: "Vegetables" },
  { name: "Basil", emoji: "🌿", reason: "Easy to grow indoors or outside, useful in the kitchen, and keeps pests away.", careLevel: "easy", category: "Herbs" },
  { name: "Hydrangea", emoji: "💐", reason: "Stunning summer blooms that last for months. Tolerates partial shade.", careLevel: "moderate", category: "Flowering Plants" },
  { name: "Mint", emoji: "🫙", reason: "Vigorous and fragrant — grow in a pot to contain it. Great for teas.", careLevel: "easy", category: "Herbs" },
  { name: "Sunflower", emoji: "🌻", reason: "Fast-growing and cheerful — a great confidence booster for new gardeners.", careLevel: "easy", category: "Flowering Plants" },
  { name: "Rosemary", emoji: "🌱", reason: "Drought-tolerant evergreen herb that doubles as an ornamental shrub.", careLevel: "easy", category: "Herbs" },
  { name: "Strawberry", emoji: "🍓", reason: "Compact, productive, and perfect for containers or hanging baskets.", careLevel: "easy", category: "Fruit Plants" },
  { name: "Fuchsia", emoji: "🌺", reason: "Reliable, colourful, and great for hanging baskets in shadier spots.", careLevel: "moderate", category: "Flowering Plants" },
  { name: "Japanese Anemone", emoji: "🌸", reason: "Elegant autumn bloomer that fills the garden with colour when most plants are fading.", careLevel: "moderate", category: "Flowering Plants" },
];

const MOCK_DIAGNOSIS = {
  plantName: "Peace Lily (Spathiphyllum)",
  healthStatus: "stressed",
  issues: [
    {
      name: "Overwatering",
      severity: "medium",
      description: "The yellowing lower leaves and soggy-looking soil suggest the plant is receiving more water than it can absorb, leading to root stress.",
      symptoms: ["Yellow lower leaves", "Drooping despite moist soil", "Dark mushy stem base"],
      causes: ["Watering on a fixed schedule rather than checking soil moisture", "Pot without adequate drainage holes"],
      treatment: ["Allow soil to dry out completely before next watering", "Check drainage holes are clear", "Remove yellowed leaves at the base"],
      prevention: ["Water only when top 2 cm of soil is dry", "Always use pots with drainage holes"],
    },
  ],
  overallAdvice: "This peace lily needs a drier spell and higher humidity. Let the soil dry out, improve drainage, and mist regularly — it should recover well within 2–3 weeks. (Demo data)",
  confidence: "medium",
};
// ──────────────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.path}`);
  next();
});

function apiErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const status = e.status as number | undefined;
    const inner = (e.error as Record<string, unknown> | undefined)?.error as Record<string, unknown> | undefined;
    // Log technical detail server-side only — never expose to user
    if (status === 401 || inner?.type === "authentication_error")
      console.error("Auth error — check API key configuration");
    if (status === 429 || inner?.type === "rate_limit_error")
      console.error("Upstream rate limit hit");
  }
  return "Our plant analysis service is temporarily unavailable. Please try again in a little while.";
}

const RATE_LIMIT_MSG = "Our plant analysis service is a little busy right now. Please try again in a few hours.";
const GENERIC_ERR_MSG = "Our plant analysis service is temporarily unavailable. Please try again in a little while.";

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: "Email and password are required" }); return; }
  if (password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Invalid email address" }); return; }

  if (getUserByEmail(email.toLowerCase())) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const user = createUser(email.toLowerCase(), hash);
  res.status(201).json({ token: signToken(user.id), user: { id: user.id, email: user.email } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: "Email and password are required" }); return; }

  const user = getUserByEmail(email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: "Incorrect email or password" });
    return;
  }
  const profile = getProfile(user.id);
  res.json({ token: signToken(user.id), user: { id: user.id, email: user.email }, profile });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  const user = getUserById(r.userId!);
  const profile = getProfile(r.userId!);
  res.json({ user: { id: user!.id, email: user!.email }, profile });
});

// ── User profile ──────────────────────────────────────────────────────────────
app.put("/api/user/profile", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  upsertProfile(r.userId!, req.body);
  res.json({ ok: true });
});

// ── History ───────────────────────────────────────────────────────────────────
app.get("/api/user/history", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  res.json({ history: listHistory(r.userId!) });
});

app.get("/api/user/history/:id", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  const item = getHistoryItem(Number(req.params.id), r.userId!);
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: item.id, type: item.type, title: item.title, created_at: item.created_at, result: JSON.parse(item.result_json) });
});

app.post("/api/user/history", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  const { type, title, result } = req.body as { type?: string; title?: string; result?: object };
  if (!type || !title || !result) { res.status(400).json({ error: "type, title, result required" }); return; }
  const id = addHistory(r.userId!, type, title, result);
  res.json({ id });
});

app.delete("/api/user/history/:id", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  const ok = deleteHistoryItem(Number(req.params.id), r.userId!);
  res.json({ ok });
});

// ── /api/analyze-garden ───────────────────────────────────────────────────────
app.post("/api/analyze-garden", upload.single("image"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No image provided" }); return; }

  const location = (req.body.location as string) || "Unknown";
  const gardenType = (req.body.gardenType as string) || "mixed";
  const experience = (req.body.experience as string) || "beginner";
  let preferences: string[] = [];
  try { preferences = JSON.parse(req.body.plantPreferences || "[]"); } catch { preferences = []; }
  const state = detectState(location);
  const zone = getZone(location);
  const season = getSeason();

  // ── Path 1: iNaturalist + template engine + OSM shops ───────────────────
  if (HAS_INAT) {
    if (!consume("inat")) {
      console.error("iNaturalist daily quota exhausted");
      res.status(429).json({ error: RATE_LIMIT_MSG });
      return;
    }
    try {
      const matches = await identifyWithINat(req.file.buffer, req.file.mimetype)
        .catch((e: unknown) => { console.error("iNaturalist error:", e); return []; });
      const { findCareByGenus: fcbg } = await import("./db.js");
      const identifiedTags = matches.flatMap((m) => fcbg(m.genus)?.tags ?? []);
      const shops = await findLocalShops(location, state, identifiedTags);
      const analysis = buildGardenAnalysis({ matches, location, gardenType, experience, preferences, season, state, zone, shops });
      res.json(analysis);
    } catch (err) {
      console.error("Garden analysis error:", err);
      res.status(500).json({ error: GENERIC_ERR_MSG });
    }
    return;
  }

  // ── Path 2: Gemini Flash + OSM shops ────────────────────────────────────
  if (HAS_GEMINI) {
    if (!consume("gemini")) {
      console.error("Gemini daily quota exhausted");
      res.status(429).json({ error: RATE_LIMIT_MSG });
      return;
    }
    try {
      const [shops, analysis] = await Promise.all([
        findLocalShops(location, state, preferences),
        analyzeGardenWithGemini(req.file.buffer, req.file.mimetype, { location, gardenType, experience, preferences, season }),
      ]);
      // Inject real shop data over Gemini's generic resource suggestions
      analysis.localResources = shops.map((shop) => ({
        type: shop.shopType,
        description: shop.description,
        searchSuggestion: shop.name,
        name: shop.name,
        address: shop.address,
        distance: shop.distance,
        url: shop.mapUrl ?? (shop.website ? `https://${shop.website}` : undefined),
      }));
      res.json(analysis);
    } catch (err) {
      console.error("Garden analysis error:", err);
      res.status(500).json({ error: GENERIC_ERR_MSG });
    }
    return;
  }

  // ── Path 3: Demo mode ────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 1800));
  res.json(MOCK_GARDEN_ANALYSIS);
});

// ── /api/plant-suggestions ────────────────────────────────────────────────────
app.post("/api/plant-suggestions", async (req, res) => {
  const { location, gardenType, experience, plantPreferences } = req.body;
  if (!location) { res.status(400).json({ error: "Location is required" }); return; }

  try {
    const state = detectState(location as string);
    const zone = getZone(location as string);
    const season = getSeason();
    const preferences: string[] = Array.isArray(plantPreferences) ? (plantPreferences as string[]) : [];

    const [plants, shopResults] = await Promise.all([
      Promise.resolve(lookupPlants({
        state,
        zone,
        experience: (experience as string) || "beginner",
        gardenType: (gardenType as string) || "mixed",
        preferences,
        season,
        limit: 10,
      })),
      findLocalShops(location as string, state, preferences),
    ]);

    const shops = shopResults.map((s) => ({
      name: s.name,
      type: s.shopType,
      description: s.description,
      address: s.address ?? (s.phone ? `📞 ${s.phone}` : undefined),
      distance: s.distance,
      url: s.mapUrl ?? (s.website ? `https://${s.website}` : undefined),
    }));

    res.json({ plants, shops });
  } catch (err) {
    console.error("Plant suggestions error:", err);
    res.status(500).json({ error: "Could not load plant suggestions." });
  }
});

// ── /api/diagnose ─────────────────────────────────────────────────────────────
app.post("/api/diagnose", upload.single("image"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No image provided" }); return; }

  // ── Path 1: Gemini Flash (vision + disease detection) ────────────────────
  if (HAS_GEMINI && consume("gemini")) {
    try {
      res.json(await diagnoseWithGemini(req.file.buffer, req.file.mimetype));
      return;
    } catch (err) {
      console.error("Gemini diagnosis failed, falling back to iNaturalist:", err);
    }
  }

  // ── Path 2: iNaturalist (plant ID only, no disease detection) ────────────
  if (HAS_INAT) {
    if (!consume("inat")) {
      console.error("iNaturalist daily quota exhausted");
      res.status(429).json({ error: RATE_LIMIT_MSG });
      return;
    }
    try {
      const matches = await identifyWithINat(req.file.buffer, req.file.mimetype);
      res.json(buildDiagnosis(matches, null));
      return;
    } catch (err) {
      console.error("Diagnosis error:", err);
      res.status(500).json({ error: GENERIC_ERR_MSG });
      return;
    }
  }

  // ── Path 3: Demo mode ────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 1500));
  res.json(MOCK_DIAGNOSIS);
});

// ── /api/plant-image ──────────────────────────────────────────────────────────
app.get("/api/plant-image", async (req, res) => {
  const name = (req.query.name as string) || "";
  if (!name) { res.json({ imageUrl: null }); return; }
  try {
    const r = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&rank=species&per_page=1`,
      { headers: { Accept: "application/json" } }
    );
    const data = await r.json() as { results?: Array<{ default_photo?: { medium_url?: string } }> };
    res.json({ imageUrl: data.results?.[0]?.default_photo?.medium_url ?? null });
  } catch {
    res.json({ imageUrl: null });
  }
});

// ── /api/chat ─────────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  if (!HAS_GEMINI) { res.status(503).json({ error: GENERIC_ERR_MSG }); return; }

  const { messages, context } = req.body as {
    messages: Array<{ role: "user" | "assistant"; text: string }>;
    context: string;
  };

  if (!messages?.length) { res.status(400).json({ error: "messages required" }); return; }

  if (!consume("gemini")) {
    res.status(429).json({ error: RATE_LIMIT_MSG });
    return;
  }

  try {
    const reply = await chatWithGemini(messages, context || "");
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: GENERIC_ERR_MSG });
  }
});

// ── Local price fallback (no API needed) ────────────────────────────────────
const CATEGORY_PRICES: Record<string, { bigBox: string; nursery: string; online: string; sizes: string[] }> = {
  "Flowers":    { bigBox: "$3 – $8",  nursery: "$6 – $18",  online: "$4 – $15 + shipping", sizes: ['6-pack', '4" pot', '1-gallon'] },
  "Herbs":      { bigBox: "$3 – $6",  nursery: "$5 – $12",  online: "$3 – $12 + shipping", sizes: ['4" pot', '6" pot'] },
  "Vegetables": { bigBox: "$3 – $7",  nursery: "$4 – $15",  online: "$2 – $10 + shipping", sizes: ['6-pack', '4" pot', 'seed packet'] },
  "Shrubs":     { bigBox: "$12 – $35", nursery: "$18 – $60", online: "$15 – $50 + shipping", sizes: ['1-gallon', '3-gallon', '5-gallon'] },
  "Trees":      { bigBox: "$25 – $80", nursery: "$40 – $150", online: "$20 – $80 + shipping", sizes: ['1-gallon', '5-gallon', '10-gallon'] },
  "Succulents": { bigBox: "$4 – $12", nursery: "$8 – $25",  online: "$6 – $20 + shipping", sizes: ['2" pot', '4" pot', '6" pot'] },
  "Grasses":    { bigBox: "$8 – $20", nursery: "$12 – $35", online: "$8 – $30 + shipping", sizes: ['1-gallon', '3-gallon'] },
  "Vines":      { bigBox: "$10 – $20", nursery: "$15 – $40", online: "$8 – $30 + shipping", sizes: ['1-gallon', '3-gallon'] },
};
const DEFAULT_PRICES = { bigBox: "$5 – $20", nursery: "$10 – $35", online: "$6 – $25 + shipping", sizes: ['1-gallon', '3-gallon'] };

function localPriceFallback(
  plantName: string,
  category: string,
  location: string,
  localShops: Array<{ name: string; type: string }>
) {
  const p = CATEGORY_PRICES[category] ?? DEFAULT_PRICES;
  return {
    prices: [
      {
        retailerType: "Big Box Store",
        examples: "Home Depot, Lowe's, Walmart",
        priceRange: p.bigBox,
        sizes: p.sizes.slice(0, 2),
        availability: "Spring – Summer",
        notes: "Wide availability in spring. Stock varies — call ahead for specific varieties.",
        badge: "Best Value",
      },
      {
        retailerType: "Local Independent Nursery",
        examples: "",
        priceRange: p.nursery,
        sizes: p.sizes.slice(-2),
        availability: "Year-round (best selection spring)",
        notes: "Higher quality, expert staff, better variety selection.",
        badge: "Best Quality",
      },
      {
        retailerType: "Online Retailer",
        examples: "Amazon, Etsy, specialty sites",
        priceRange: p.online,
        sizes: ["Seed packet", "Bare root", p.sizes[0]],
        availability: "Year-round",
        notes: "Rare and heritage varieties available. Check reviews and seller ratings.",
        badge: "Widest Selection",
      },
    ],
    localShopEstimates: localShops.slice(0, 3).map((s) => ({
      shopName: s.name,
      priceRange: p.nursery,
      notes: `Call ahead to confirm availability of ${plantName}.`,
    })),
    seasonalTip: `Spring is generally the best time to find ${plantName} in ${location} with the widest selection and freshest stock.`,
    bestTimeToBuy: "March – May",
  };
}

// ── /api/plant-search ────────────────────────────────────────────────────────
app.get("/api/plant-search", async (req, res) => {
  const q = ((req.query.q as string) ?? "").trim();
  if (q.length < 2) { res.json({ results: [] }); return; }
  try {
    // ancestor_id=47126 = Plantae — limits results to plants only
    const r = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=species&per_page=8&ancestor_id=47126`,
      { headers: { Accept: "application/json" } }
    );
    const data = await r.json() as {
      results?: Array<{
        name: string;
        preferred_common_name?: string;
        iconic_taxon_name?: string;
        default_photo?: { square_url?: string };
      }>;
    };
    const results = (data.results ?? [])
      .filter((t) => !t.iconic_taxon_name || t.iconic_taxon_name === "Plantae")
      .slice(0, 7)
      .map((t) => ({
        scientificName: t.name,
        commonName: t.preferred_common_name ?? t.name,
        photoUrl: t.default_photo?.square_url ?? null,
      }));
    res.json({ results });
  } catch {
    res.json({ results: [] });
  }
});

// ── /api/plant-prices ─────────────────────────────────────────────────────────
app.post("/api/plant-prices", async (req, res) => {
  const { plantName, plantCategory, location, localShops } = req.body as {
    plantName?: string;
    plantCategory?: string;
    location?: string;
    localShops?: Array<{ name: string; type: string }>;
  };
  if (!plantName || !location) {
    res.status(400).json({ error: "plantName and location required" });
    return;
  }

  const shops = Array.isArray(localShops) ? localShops : [];

  if (HAS_GEMINI && consume("gemini")) {
    try {
      const state = detectState(location);
      const prices = await getPlantPricesWithGemini(
        plantName,
        plantCategory ?? "Plant",
        location,
        state ?? location,
        shops
      );
      res.json(prices);
      return;
    } catch (err) {
      console.warn("Gemini price lookup failed, using local fallback:", (err as Error).message);
    }
  }

  // Fallback: local price matrix
  res.json(localPriceFallback(plantName, plantCategory ?? "Plant", location, shops));
});

// ── /api/user/plan ─────────────────────────────────────────────────────────────
app.get("/api/user/plan", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  res.json({ plan: listPlan(r.userId!) });
});

app.post("/api/user/plan", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  const { plantName, plantEmoji, plantCategory, nurseryName, nurseryType, priceEstimate } = req.body as {
    plantName?: string; plantEmoji?: string; plantCategory?: string;
    nurseryName?: string; nurseryType?: string; priceEstimate?: string;
  };
  if (!plantName) { res.status(400).json({ error: "plantName required" }); return; }
  if (planItemExists(r.userId!, plantName)) {
    res.status(409).json({ error: "Already in your plan" });
    return;
  }
  const id = addPlanItem(r.userId!, plantName, plantEmoji ?? "🌱", plantCategory ?? "", nurseryName ?? null, nurseryType ?? null, priceEstimate ?? null);
  res.status(201).json({ id });
});

app.put("/api/user/plan/:id", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  const { status } = req.body as { status?: string };
  if (!status || !["planned", "purchased", "planted"].includes(status)) {
    res.status(400).json({ error: "status must be planned, purchased, or planted" });
    return;
  }
  const ok = updatePlanStatus(Number(req.params.id), r.userId!, status);
  res.json({ ok });
});

app.delete("/api/user/plan/:id", requireAuth, (req, res) => {
  const r = req as AuthRequest;
  res.json({ ok: deletePlanItem(Number(req.params.id), r.userId!) });
});

app.get("/api/health", (_req, res) => {
  const quota = quotaSnapshot();
  res.json({
    status: "ok",
    sources: { inat: HAS_INAT, gemini: HAS_GEMINI, osm: true },
    quota: {
      inat:   HAS_INAT   ? quota.inat   : null,
      gemini: HAS_GEMINI ? quota.gemini : null,
    },
  });
});

// ── Serve frontend in production ──────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "../../client/dist");

console.log(`📁 Resolved clientDist: ${clientDist}`);
if (fs.existsSync(clientDist)) {
  console.log(`✅ clientDist exists — static files will be served`);
  const indexPath = path.join(clientDist, "index.html");
  console.log(`   index.html present: ${fs.existsSync(indexPath)}`);
  try {
    const entries = fs.readdirSync(clientDist);
    console.log(`   Contents: ${entries.join(", ")}`);
  } catch (e) {
    console.error(`   Could not read clientDist:`, e);
  }
} else {
  console.error(`❌ clientDist does NOT exist: ${clientDist}`);
  console.error(`   __dirname resolved to: ${__dirname}`);
  // Attempt fallback: look for client/dist relative to the process working directory
  const cwdFallback = path.join(process.cwd(), "client/dist");
  console.error(`   Trying cwd-based fallback: ${cwdFallback} — exists: ${fs.existsSync(cwdFallback)}`);
}

app.use(express.static(clientDist));

// Log 404s on static asset requests to aid debugging
app.use((req, _res, next) => {
  if (!req.path.startsWith("/api")) {
    console.log(`[static 404] ${req.method} ${req.path}`);
  }
  next();
});

// SPA fallback — serve index.html for all non-API GET requests
app.get(/^(?!\/api).*$/, (req, res) => {
  const indexPath = path.join(clientDist, "index.html");
  console.log(`[spa fallback] ${req.path} → ${indexPath}`);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`[spa fallback] sendFile error for ${indexPath}:`, err);
      res.status(500).send("Frontend not available");
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🌿 Flourish server running on http://localhost:${PORT}`);
});
