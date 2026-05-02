// Template analysis engine: converts PlantNet results + local DB into a full GardenAnalysis,
// and maps Plant.id health data into DiagnosisData. No LLM required.

import { findCareByGenus, lookupPlants, getSeason, detectState, getZone } from "./db.js";
import type { PlantCareInfo } from "./db.js";
import type { PlantNetMatch } from "./plantnet.js";
import type { HealthAssessment } from "./plantid.js";
import type { ShopResult } from "./shopLookup.js";

// ── Shared types (mirror server.ts interfaces) ────────────────────────────────

export interface GardenAnalysis {
  identifiedPlants: Array<{
    name: string;
    commonName: string;
    healthStatus: "healthy" | "needs-attention" | "struggling";
    healthNotes: string;
    position?: string;
  }>;
  gardenSummary: string;
  layoutSuggestions: Array<{
    title: string;
    description: string;
    priority: "quick-win" | "seasonal" | "long-term";
    estimatedImpact?: string;
  }>;
  beautySuggestions: Array<{ title: string; description: string; suggestedPlants?: string[] }>;
  recommendedNewPlants: Array<{
    name: string;
    reason: string;
    careLevel: "easy" | "moderate" | "advanced";
    whenToPlant?: string;
  }>;
  maintenanceSchedule: Array<{
    task: string;
    frequency: string;
    bestTime: string;
    tips?: string;
  }>;
  trimmingAndWaste: { advice: string; compostingTips?: string; disposalAdvice?: string };
  localResources: Array<{
    type: string;
    description: string;
    searchSuggestion: string;
    name?: string;
    address?: string;
    distance?: string;
    url?: string;
  }>;
  weatherConsiderations: string;
  seasonalAdvice: string;
  potAndContainerAdvice?: string;
  overallScore?: { score: number; label: string; message: string };
}

export interface DiagnosisData {
  plantName: string;
  healthStatus: "healthy" | "diseased" | "stressed" | "unknown";
  issues: Array<{
    name: string;
    severity: "low" | "medium" | "high";
    description: string;
    symptoms: string[];
    causes: string[];
    treatment: string[];
    prevention: string[];
  }>;
  overallAdvice: string;
  confidence: "high" | "medium" | "low";
}

// ── Season / climate helpers ──────────────────────────────────────────────────

const SEASON_PLANT_TIPS: Record<string, Record<string, string>> = {
  spring: {
    CA: "ideal for establishing new plants before summer heat",
    TX: "perfect for heat-tolerant annuals before the hot season arrives",
    default: "the best season to plant — roots establish well in mild soil",
  },
  summer: {
    CA: "deep, infrequent watering is key — drought-hardy plants thrive now",
    TX: "the demanding season — water deeply and mulch to protect roots",
    default: "focus on watering consistency and shade for sensitive plants",
  },
  fall: {
    CA: "excellent for natives, bulbs, and cool-season vegetables",
    TX: "ideal for trees, shrubs, and winter vegetable gardens",
    default: "great for planting bulbs and root-zone establishment",
  },
  winter: {
    CA: "mild winters allow cool-season crops and native plantings",
    TX: "protect tender plants from hard freezes; plan and prune dormant shrubs",
    default: "plan for spring, prune dormant woody plants, improve soil with compost",
  },
};

function seasonTip(season: string, state: string | null): string {
  const key = state ?? "default";
  return SEASON_PLANT_TIPS[season]?.[key] ?? SEASON_PLANT_TIPS[season]?.["default"] ?? "a rewarding time in the garden";
}

const WHEN_TO_PLANT: Record<string, Record<string, string>> = {
  spring: { CA: "Early spring (Feb–Apr)", TX: "Spring (Mar–May)", default: "Spring after last frost" },
  summer: { CA: "Late summer (Aug–Sep) for fall establishment", TX: "Wait for cooler fall conditions", default: "Late summer for fall planting" },
  fall: { CA: "Autumn (Oct–Nov) for winter rains", TX: "Fall (Sep–Nov) for root establishment", default: "Autumn for spring bloom" },
  winter: { CA: "Late winter (Jan–Feb) with rains", TX: "Early spring after risk of freeze passes", default: "Early spring once soil is workable" },
};

function plantingWindow(season: string, state: string | null): string {
  const key = state ?? "default";
  return WHEN_TO_PLANT[season]?.[key] ?? WHEN_TO_PLANT[season]?.["default"] ?? "Spring";
}

const CLIMATE_NOTES: Record<string, string> = {
  CA: "California's Mediterranean climate means dry summers and mild, wet winters. Deep but infrequent summer watering encourages drought resilience. Frost is rare below 3,000 ft elevation.",
  TX: "Texas has diverse climates — humid Gulf Coast, hot Central Plains, and arid West Texas. Summer heat stress is the main challenge; deep watering and heavy mulching are essential from May–September.",
};

// ── Layout suggestion generator ───────────────────────────────────────────────

function layoutSuggestions(
  careInfos: (PlantCareInfo | undefined)[],
  gardenType: string,
  season: string
): GardenAnalysis["layoutSuggestions"] {
  const suggestions: GardenAnalysis["layoutSuggestions"] = [];
  const known = careInfos.filter(Boolean) as PlantCareInfo[];

  const sunLovers = known.filter((c) => c.sun.includes("full sun"));
  const shadeLovers = known.filter((c) => c.sun.includes("shade"));
  const highWater = known.filter((c) => c.water === "high");
  const lowWater = known.filter((c) => c.water === "low" || c.tags.includes("drought-tolerant"));
  const hasEdibles = known.some((c) => c.category === "Vegetables" || c.category === "Herbs" || c.tags.includes("edible"));
  const hasPollinators = known.some((c) => c.tags.includes("pollinator"));

  if (sunLovers.length > 0 && shadeLovers.length > 0) {
    suggestions.push({
      title: "Separate sun and shade zones",
      description: `Your garden mixes sun-lovers (${sunLovers.map((c) => c.commonName).slice(0, 2).join(", ")}) with shade-tolerant plants. Grouping them by light requirement avoids one set being stressed by the wrong exposure.`,
      priority: "quick-win",
      estimatedImpact: "Noticeably healthier foliage and better flowering within one season",
    });
  }

  if (highWater.length > 0 && lowWater.length > 0) {
    suggestions.push({
      title: "Create a water-wise irrigation zone",
      description: `Grouping drought-tolerant plants (${lowWater.map((c) => c.commonName).slice(0, 2).join(", ")}) together allows you to water them separately from thirsty plants — reducing overall water use by up to 40%.`,
      priority: "seasonal",
      estimatedImpact: "Lower water bills and healthier plants through summer",
    });
  }

  if (hasEdibles) {
    suggestions.push({
      title: "Move edibles closest to the kitchen",
      description: "Herbs and vegetables placed within easy reach of the kitchen get harvested more often, which also encourages bushier growth. Even a window box of basil and parsley makes a real difference.",
      priority: "quick-win",
      estimatedImpact: "2× more frequent harvest and healthier herb plants",
    });
  }

  if (gardenType === "balcony" || gardenType === "indoor") {
    suggestions.push({
      title: "Use vertical space with trellises or wall planters",
      description: "Vertical growing structures multiply planting area without floor space. Climbing plants, hanging baskets, and wall-mounted pocket planters all work well for compact spaces.",
      priority: "long-term",
      estimatedImpact: "Double the planting capacity in the same footprint",
    });
  } else {
    suggestions.push({
      title: "Add a focal point to anchor the garden's design",
      description: "A specimen plant, birdbath, or tall ornamental grass placed at the visual centre draws the eye and gives the whole garden a sense of intention. Without one, gardens can feel scattered.",
      priority: "seasonal",
      estimatedImpact: "Significant improvement in overall visual coherence",
    });
  }

  if (hasPollinators) {
    suggestions.push({
      title: "Create a pollinator corridor",
      description: "You already have plants that attract bees and butterflies. Grouping these together in a continuous strip — rather than spreading them — creates a more powerful habitat that supports the whole neighbourhood.",
      priority: "long-term",
      estimatedImpact: "30–50% better pollination for fruiting plants nearby",
    });
  }

  // Universal seasonal tip
  const seasonLayoutTips: Record<string, { title: string; description: string; priority: "quick-win" | "seasonal" | "long-term" }> = {
    spring: { title: "Refresh mulch layers before summer heat", description: "A 5–8 cm layer of bark chip or straw now will suppress summer weeds, retain moisture through dry spells, and feed the soil as it breaks down. Apply before soil fully warms.", priority: "quick-win" },
    summer: { title: "Install temporary shade cloth over tender plants", description: "A 30–40% shade cloth draped over heat-sensitive plants during peak summer (11am–3pm) can reduce leaf scorch dramatically. Remove in autumn for full light.", priority: "seasonal" },
    fall: { title: "Plant bulbs now for spring colour", description: "Autumn is the only window to plant spring-flowering bulbs (tulips, alliums, narcissus). A cluster of 7–15 bulbs per spot looks far better than singles.", priority: "seasonal" },
    winter: { title: "Use the dormant season to redesign bed edges", description: "Winter is ideal for reshaping bed edges with a spade — no plants to work around and the soil holds shape better. Clean curves dramatically improve a garden's appearance.", priority: "long-term" },
  };
  const seasonTipEntry = seasonLayoutTips[season];
  if (seasonTipEntry) suggestions.push(seasonTipEntry);

  return suggestions.slice(0, 4);
}

// ── Beauty suggestion generator ───────────────────────────────────────────────

function beautySuggestions(
  matches: PlantNetMatch[],
  careInfos: (PlantCareInfo | undefined)[],
  season: string,
  state: string | null
): GardenAnalysis["beautySuggestions"] {
  const suggestions: GardenAnalysis["beautySuggestions"] = [];
  const known = careInfos.filter(Boolean) as PlantCareInfo[];
  const categories = new Set(known.map((c) => c.category));
  const tags = new Set(known.flatMap((c) => c.tags));

  if (!categories.has("Flowering Plants")) {
    suggestions.push({
      title: "Add seasonal flowering plants for colour",
      description: "Your current planting is missing dedicated flowering plants. Even two or three well-chosen flowering perennials will transform the look from functional to beautiful.",
      suggestedPlants:
        state === "CA"
          ? ["California Poppy", "Salvia", "Lavender"]
          : state === "TX"
          ? ["Black-Eyed Susan", "Mexican Sage", "Lantana"]
          : ["Coneflower", "Lavender", "Salvia"],
    });
  }

  if (!tags.has("fragrant")) {
    suggestions.push({
      title: "Introduce fragrant plants near seating",
      description: "A fragrant plant close to a sitting area or entrance creates a sensory welcome. Scent elevates a garden from something you look at into somewhere you want to linger.",
      suggestedPlants:
        state === "CA"
          ? ["Lavender", "Rosemary", "Mexican Orange Blossom"]
          : ["Rosemary", "Gardenia", "Sweet Alyssum"],
    });
  }

  const inBloomNow = known.filter((c) => c.seasons.includes(season));
  if (inBloomNow.length === 0 && matches.length > 0) {
    suggestions.push({
      title: `Add plants that peak in ${season}`,
      description: `Your current plants may not be at their best in ${season}. Adding a few well-timed performers will keep the garden looking full and vibrant now.`,
      suggestedPlants:
        season === "spring"
          ? ["Cherry Blossom", "Wisteria", "Ceanothus"]
          : season === "summer"
          ? ["Agapanthus", "Lantana", "Bougainvillea"]
          : season === "fall"
          ? ["Japanese Anemone", "Salvia", "Mexican Sage"]
          : ["Hellebore", "Camellia", "Winter Jasmine"],
    });
  }

  if (!tags.has("pollinator")) {
    suggestions.push({
      title: "Add pollinator-friendly plants",
      description: "Pollinators increase yield in fruiting plants and add life and movement to the garden. A single native salvia or lavender planted in a sunny spot will bring bees within days.",
      suggestedPlants: state === "TX" ? ["Bluebonnet", "Mexican Sage", "Black-Eyed Susan"] : ["Lavender", "California Poppy", "Coneflower"],
    });
  }

  if (!categories.has("Ornamental Grasses") && !categories.has("Succulents & Cacti")) {
    suggestions.push({
      title: "Add texture contrast with grasses or succulents",
      description: "Mixing fine-textured grasses or bold succulents among rounded flowering plants creates visual interest year-round, even when nothing is in bloom.",
      suggestedPlants:
        state === "CA"
          ? ["Blue Oat Grass", "Agave", "Festuca"]
          : ["Gulf Muhly Grass", "Agave", "Blue Grama Grass"],
    });
  }

  return suggestions.slice(0, 3);
}

// ── Maintenance schedule generator ───────────────────────────────────────────

function maintenanceSchedule(
  careInfos: (PlantCareInfo | undefined)[],
  season: string,
  state: string | null
): GardenAnalysis["maintenanceSchedule"] {
  const schedule: GardenAnalysis["maintenanceSchedule"] = [];
  const seen = new Set<string>();

  // Per-plant care tasks
  for (const care of careInfos.filter(Boolean) as PlantCareInfo[]) {
    const task = `Water ${care.commonName}`;
    if (!seen.has(task)) {
      seen.add(task);
      const freq =
        care.water === "low"
          ? "Every 2–3 weeks once established"
          : care.water === "moderate"
          ? "Weekly during dry spells"
          : "2–3 times per week";
      schedule.push({
        task,
        frequency: freq,
        bestTime: "Early morning to reduce evaporation",
        tips: care.tags.includes("drought-tolerant")
          ? "Water deeply but infrequently to encourage deep root growth."
          : undefined,
      });
    }
  }

  // Universal tasks
  schedule.push({
    task: "Weed & refresh mulch",
    frequency: "Monthly",
    bestTime: "After rain when soil is soft",
    tips: "A 5 cm bark chip layer suppresses weeds and retains moisture through dry periods.",
  });

  schedule.push({
    task: "Check for pests & disease",
    frequency: "Weekly",
    bestTime: "Morning with good light",
    tips: "Look at leaf undersides for aphids or scale. Early intervention prevents spread.",
  });

  if (careInfos.some((c) => c?.category === "Flowering Plants")) {
    schedule.push({
      task: "Deadhead spent flowers",
      frequency: "Weekly during flowering season",
      bestTime: "Morning",
      tips: "Removing spent blooms redirects energy to new flower production.",
    });
  }

  const seasonalTasks: Record<string, { task: string; frequency: string; bestTime: string; tips?: string }> = {
    spring: { task: "Apply balanced slow-release fertiliser", frequency: "Once in early spring", bestTime: "After watering", tips: "Feed flowering plants with a high-potassium formula to encourage blooms." },
    summer: { task: "Deep water and top-up mulch", frequency: "Weekly in heat waves", bestTime: "Early morning or after sunset", tips: "Never water during peak heat — leaves can scorch and water evaporates before reaching roots." },
    fall: { task: "Plant autumn bulbs and divide overcrowded perennials", frequency: "Once in early autumn", bestTime: "Cool morning", tips: "Dividing perennials now refreshes clumps and gives new plants time to establish before winter." },
    winter: { task: "Prune dormant woody shrubs and trees", frequency: "Once in late winter", bestTime: "Dry day before bud break", tips: `In ${state === "CA" ? "California" : state === "TX" ? "Texas" : "your region"}, late winter pruning avoids frost damage to fresh cuts.` },
  };
  const stask = seasonalTasks[season];
  if (stask) schedule.push(stask);

  return schedule.slice(0, 5);
}

// ── Score calculator ──────────────────────────────────────────────────────────

const SCORE_LABELS = ["", "", "", "", "Building Up", "Looking Good", "Growing Strong", "Thriving", "Garden Goals", "Master Gardener"];

function computeScore(
  matches: PlantNetMatch[],
  careInfos: (PlantCareInfo | undefined)[]
): { score: number; label: string; message: string } {
  let score = 5;
  const known = careInfos.filter(Boolean) as PlantCareInfo[];

  const families = new Set(matches.map((m) => m.family).filter(Boolean));
  if (families.size >= 3) score++;
  if (matches.length >= 4) score++;

  if (known.some((c) => c.native_states.length > 0)) score++;
  if (known.every((c) => c.beginner_friendly)) score++;

  score = Math.max(4, Math.min(9, score));
  const label = SCORE_LABELS[score] ?? "Looking Good";
  const message =
    score >= 7
      ? "Your garden is in great shape. Targeted improvements will keep it at its best."
      : "Your garden has real potential — the suggestions here will help it flourish.";
  return { score, label, message };
}

// ── Main export: buildGardenAnalysis ─────────────────────────────────────────

export function buildGardenAnalysis(params: {
  matches: PlantNetMatch[];
  location: string;
  gardenType: string;
  experience: string;
  preferences: string[];
  season: string;
  state: string | null;
  zone: number;
  shops: ShopResult[];
}): GardenAnalysis {
  const { matches, location, gardenType, experience, preferences, season, state, zone, shops } = params;

  // Resolve care info for each matched plant via genus lookup
  const careInfos = matches.map((m) => findCareByGenus(m.genus));

  // ── identifiedPlants ──────────────────────────────────────────────────────
  const identifiedPlants: GardenAnalysis["identifiedPlants"] = matches.slice(0, 6).map((m, i) => {
    const care = careInfos[i];
    const healthNotes = care
      ? `${care.sun.charAt(0).toUpperCase() + care.sun.slice(1)} plant needing ${care.water} water. ${care.beginner_friendly ? "Beginner-friendly and forgiving." : `Care level: ${care.care_level}.`}`
      : "Identified from image analysis. Check local resources for specific care advice.";
    return {
      name: m.scientificName,
      commonName: m.commonNames[0] ?? m.scientificName,
      healthStatus: "healthy" as const,
      healthNotes,
    };
  });

  // ── gardenSummary ─────────────────────────────────────────────────────────
  const plantList = matches
    .slice(0, 3)
    .map((m) => m.commonNames[0] ?? m.scientificName)
    .join(", ");
  const gardenSummary =
    matches.length > 0
      ? `Your ${gardenType.replace("-", " ")} features ${matches.length} identified plant${matches.length > 1 ? "s" : ""} — ${plantList}${matches.length > 3 ? ` and ${matches.length - 3} more` : ""}. ${season.charAt(0).toUpperCase() + season.slice(1)} is ${seasonTip(season, state)}. The suggestions below are tailored to your location and the plants in your garden.`
      : `Your ${gardenType.replace("-", " ")} was analysed for layout, health, and improvement opportunities. ${season.charAt(0).toUpperCase() + season.slice(1)} is ${seasonTip(season, state)} — use the advice below to get the most from this season.`;

  // ── recommendedNewPlants from local DB ────────────────────────────────────
  const newPlants = lookupPlants({ state, zone, experience, gardenType, preferences, season, limit: 4 });
  const recommendedNewPlants: GardenAnalysis["recommendedNewPlants"] = newPlants.map((p) => ({
    name: p.name,
    reason: p.reason,
    careLevel: p.careLevel,
    whenToPlant: plantingWindow(season, state),
  }));

  // ── trimmingAndWaste ──────────────────────────────────────────────────────
  const hasWoody = careInfos.some((c) => c?.category === "Trees & Shrubs" || c?.category === "Flowering Plants");
  const hasEdibles = careInfos.some((c) => c?.category === "Vegetables" || c?.category === "Herbs");
  const trimmingAndWaste: GardenAnalysis["trimmingAndWaste"] = {
    advice: hasWoody
      ? "Collect prunings and deadheaded material in separate bags. Healthy soft cuttings compost well; woody stems need shredding first or a longer heap time."
      : "Gather spent plant material promptly to reduce pest and disease pressure. Most healthy green waste can be composted.",
    compostingTips: hasEdibles
      ? "Vegetable and herb trimmings, coffee grounds, and eggshells are excellent compost activators. Avoid composting diseased material or meat scraps."
      : "Soft green cuttings, fallen leaves, and grass clippings all compost well. Aim for a mix of wet (green) and dry (brown) material.",
    disposalAdvice: "Any diseased leaves, invasive plant cuttings, or treated timber should go to a local green waste centre — do not compost these.",
  };

  // ── localResources from real shop data ───────────────────────────────────
  const localResources: GardenAnalysis["localResources"] = shops.map((shop) => ({
    type: shop.shopType,
    description: shop.description,
    searchSuggestion: shop.name,
    name: shop.name,
    address: shop.address ?? (shop.phone ? `📞 ${shop.phone}` : undefined),
    distance: shop.distance,
    url: shop.mapUrl ?? (shop.website ? `https://${shop.website}` : undefined),
  }));

  // ── weatherConsiderations ─────────────────────────────────────────────────
  const weatherConsiderations =
    CLIMATE_NOTES[state ?? ""] ??
    `${location} has its own microclimate — check your local extension office for frost dates, rainfall patterns, and heat zone information specific to your area.`;

  // ── seasonalAdvice ────────────────────────────────────────────────────────
  const seasonalAdvice = (() => {
    const tips: Record<string, Record<string, string>> = {
      spring: {
        CA: "Now is the time to plant warm-season vegetables, divide overcrowded perennials, and apply pre-emergent weed control before the soil warms fully.",
        TX: "Get heat-lovers like tomatoes, peppers, and lantana in the ground before May. Mulch early to prepare for the inevitable summer heat.",
        default: "Spring is ideal for planting most annuals and perennials. Divide clumping plants, feed with a balanced fertiliser, and keep newly planted areas well-watered.",
      },
      summer: {
        CA: "Deep, infrequent watering every 7–10 days for established plants. Mulch to 8 cm depth. Harvest edibles frequently to encourage production.",
        TX: "Water 2–3× per week in extreme heat. Shade netting over vegetables, evening watering only, and heavy mulch are your best defences against heat stress.",
        default: "Keep soil moisture consistent — fluctuation between wet and dry causes blossom end rot and leaf drop. Harvest regularly to keep plants productive.",
      },
      fall: {
        CA: "Plant California natives, bulbs, and cool-season crops (lettuce, kale, chard) as temperatures cool. Fall rains will help establish new plantings.",
        TX: "Cool-season vegetables (broccoli, spinach, carrots) should be in the ground by October. Plant trees and shrubs now for the best establishment success.",
        default: "Plant spring-flowering bulbs and cool-season crops. Cut back summer perennials and compost the material. Feed lawns and borders for winter strength.",
      },
      winter: {
        CA: "Winter rains reduce irrigation needs dramatically. Check for root rot in containers. Plan spring additions and order seeds for an early start.",
        TX: "Monitor overnight temperatures and cover tender tropicals during freezes. Late winter is ideal for pruning roses, fruit trees, and ornamental grasses.",
        default: "Prune dormant shrubs and trees, improve soil by digging in compost, and plan the year ahead. Start seeds indoors 6–8 weeks before the last frost.",
      },
    };
    const key = state ?? "default";
    return tips[season]?.[key] ?? tips[season]?.["default"] ?? "Now is a great time to tend and plan your garden.";
  })();

  // ── potAndContainerAdvice ─────────────────────────────────────────────────
  const potAndContainerAdvice =
    gardenType === "balcony" || gardenType === "indoor"
      ? "For containers, use a free-draining potting mix with added perlite (20%). Most container plants benefit from repotting every 2 years and a monthly liquid feed during the growing season. Ensure every pot has drainage holes — waterlogged roots are the number-one killer."
      : "Containers are an excellent way to trial plants before committing them to a border, grow tender specimens you can move under cover in winter, and add height variation to a flat planting scheme.";

  return {
    identifiedPlants,
    gardenSummary,
    layoutSuggestions: layoutSuggestions(careInfos, gardenType, season),
    beautySuggestions: beautySuggestions(matches, careInfos, season, state),
    recommendedNewPlants,
    maintenanceSchedule: maintenanceSchedule(careInfos, season, state),
    trimmingAndWaste,
    localResources,
    weatherConsiderations,
    seasonalAdvice,
    potAndContainerAdvice,
    overallScore: computeScore(matches, careInfos),
  };
}

// ── buildDiagnosis: maps PlantNet + Plant.id → DiagnosisData ─────────────────

export function buildDiagnosis(
  matches: PlantNetMatch[],
  health: HealthAssessment | null
): DiagnosisData {
  const topMatch = matches[0];
  const plantName = topMatch
    ? (topMatch.commonNames[0] ?? topMatch.scientificName)
    : "Unknown plant";

  if (!health) {
    // Only have PlantNet — report what we know
    return {
      plantName,
      healthStatus: "unknown",
      issues: [],
      overallAdvice: topMatch
        ? `Identified as ${plantName} (${topMatch.scientificName}) with ${Math.round(topMatch.score * 100)}% confidence. Upload a clearer close-up of affected leaves or stems for a health diagnosis.`
        : "Could not identify the plant. Try a clearer, well-lit close-up of a single leaf or stem for a better result.",
      confidence: "low",
    };
  }

  if (!health.isPlant) {
    return {
      plantName: "Not a plant",
      healthStatus: "unknown",
      issues: [],
      overallAdvice: "The image doesn't appear to contain a plant. Try a close-up photo of a single plant with good lighting.",
      confidence: "high",
    };
  }

  const healthStatus: DiagnosisData["healthStatus"] = health.isHealthy
    ? "healthy"
    : health.diseases.some((d) => d.probability > 0.5)
    ? "diseased"
    : "stressed";

  const issues: DiagnosisData["issues"] = health.diseases.map((d) => {
    const severity: "low" | "medium" | "high" =
      d.probability > 0.6 ? "high" : d.probability > 0.3 ? "medium" : "low";

    // Derive treatment arrays from Plant.id details
    const treatment: string[] = [
      ...d.treatment.biological.slice(0, 2),
      ...d.treatment.chemical.slice(0, 1),
    ].filter(Boolean);

    if (treatment.length === 0) treatment.push("Remove affected leaves and improve air circulation around the plant.");

    const prevention: string[] = d.treatment.prevention.slice(0, 3).filter(Boolean);
    if (prevention.length === 0) prevention.push("Maintain good air circulation and avoid overhead watering.");

    return {
      name: d.name,
      severity,
      description: d.description || `${d.name} detected with ${Math.round(d.probability * 100)}% probability.`,
      symptoms: [`Visible signs of ${d.name.toLowerCase()}`, "Check leaf surfaces, stems, and soil"],
      causes: [`Environmental stress or pathogen pressure causing ${d.name.toLowerCase()}`],
      treatment,
      prevention,
    };
  });

  const topIssue = health.diseases[0];
  const overallAdvice = health.isHealthy
    ? `${plantName} looks healthy! Keep up your current care routine. Monitor weekly for early signs of stress.`
    : topIssue
    ? `${plantName} is showing signs of ${topIssue.name}. ${topIssue.treatment.biological[0] ?? "Remove affected material and improve growing conditions."} Catch issues early to prevent spread.`
    : `${plantName} appears stressed. Check watering consistency, light levels, and look for pests on leaf undersides.`;

  const confidence: DiagnosisData["confidence"] =
    health.healthProbability > 0.8 || (topIssue?.probability ?? 0) > 0.7
      ? "high"
      : health.healthProbability > 0.5
      ? "medium"
      : "low";

  return { plantName, healthStatus, issues, overallAdvice, confidence };
}
