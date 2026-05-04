import type { GardenAnalysis, DiagnosisData } from "./gardenAnalyzer.js";

export interface PriceEstimate {
  retailerType: string;
  examples?: string;
  priceRange: string;
  sizes: string[];
  availability: string;
  notes: string;
  badge?: string;
}

export interface PlantPriceResponse {
  prices: PriceEstimate[];
  localShopEstimates: Array<{ shopName: string; priceRange: string; notes: string }>;
  seasonalTip: string;
  bestTimeToBuy: string;
}

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return !!key && key !== "your_key_here";
}

async function geminiRequest(
  imageBuffer: Buffer,
  mimeType: string,
  prompt: string
): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBuffer.toString("base64") } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  return data.candidates[0]?.content.parts[0]?.text ?? "";
}

export async function analyzeGardenWithGemini(
  imageBuffer: Buffer,
  mimeType: string,
  params: {
    location: string;
    gardenType: string;
    experience: string;
    preferences: string[];
    season: string;
  }
): Promise<GardenAnalysis> {
  const { location, gardenType, experience, preferences, season } = params;

  const prompt = `You are Flourish — an expert AI garden advisor. Analyse this garden photo and respond with ONLY a valid JSON object, no markdown fences:
{
  "identifiedPlants": [{"name":"scientific name","commonName":"common name","healthStatus":"healthy|needs-attention|struggling","healthNotes":"brief care note","position":"optional location in photo"}],
  "gardenSummary": "2-3 sentence overview",
  "layoutSuggestions": [{"title":"","description":"","priority":"quick-win|seasonal|long-term","estimatedImpact":"optional"}],
  "beautySuggestions": [{"title":"","description":"","suggestedPlants":["optional"]}],
  "recommendedNewPlants": [{"name":"","reason":"","careLevel":"easy|moderate|advanced","whenToPlant":"optional"}],
  "maintenanceSchedule": [{"task":"","frequency":"","bestTime":"","tips":"optional"}],
  "trimmingAndWaste": {"advice":"","compostingTips":"optional","disposalAdvice":"optional"},
  "localResources": [{"type":"","description":"","searchSuggestion":""}],
  "weatherConsiderations": "",
  "seasonalAdvice": "",
  "potAndContainerAdvice": "optional",
  "overallScore": {"score":7,"label":"","message":""}
}
Provide 3-5 items per array. Score 1-10.
Context: location=${location}, gardenType=${gardenType.replace("-", " ")}, experience=${experience}, season=${season}, preferences=${preferences.join(", ") || "none"}.`;

  const text = await geminiRequest(imageBuffer, mimeType, prompt);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned no JSON");
  return JSON.parse(jsonMatch[0]) as GardenAnalysis;
}

export async function chatWithGemini(
  messages: Array<{ role: "user" | "assistant"; text: string }>,
  context: string
): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{
          text: `You are Flourish, a friendly expert garden advisor. Answer questions concisely (2–4 sentences) and practically. Context about the plant or garden: ${context}`,
        }],
      },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  return data.candidates[0]?.content.parts[0]?.text ?? "";
}

export async function diagnoseWithGemini(
  imageBuffer: Buffer,
  mimeType: string
): Promise<DiagnosisData> {
  const prompt = `You are Flourish — an expert plant pathologist. Analyse this plant image for diseases, pests, or nutrient deficiencies. Respond with ONLY a valid JSON object, no markdown fences:
{"plantName":"","healthStatus":"healthy|diseased|stressed|unknown","issues":[{"name":"","severity":"low|medium|high","description":"","symptoms":[""],"causes":[""],"treatment":[""],"prevention":[""]}],"overallAdvice":"","confidence":"high|medium|low"}
Provide step-by-step treatment for each issue found.`;

  const text = await geminiRequest(imageBuffer, mimeType, prompt);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned no JSON");
  return JSON.parse(jsonMatch[0]) as DiagnosisData;
}

async function geminiTextRequest(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return data.candidates[0]?.content.parts[0]?.text ?? "";
}

export async function getPlantPricesWithGemini(
  plantName: string,
  category: string,
  location: string,
  state: string,
  localShops: Array<{ name: string; type: string }>
): Promise<PlantPriceResponse> {
  const shopsText = localShops.length
    ? `Local nurseries in the area: ${localShops.map((s) => s.name).join(", ")}.`
    : "";

  const prompt = `You are a gardening retail expert. Give realistic plant purchase price estimates for "${plantName}" (category: ${category}) for a gardener in ${location}, ${state}.
${shopsText}

Respond with ONLY valid JSON, no markdown:
{
  "prices": [
    {
      "retailerType": "Big Box Store",
      "examples": "Home Depot, Lowe's, Walmart",
      "priceRange": "$X – $Y",
      "sizes": ["4\\" pot", "1-gallon"],
      "availability": "March – June",
      "notes": "brief note",
      "badge": "Best Value"
    },
    {
      "retailerType": "Local Independent Nursery",
      "examples": "",
      "priceRange": "$X – $Y",
      "sizes": ["1-gallon", "3-gallon"],
      "availability": "Year-round",
      "notes": "brief note",
      "badge": "Best Quality"
    },
    {
      "retailerType": "Online Retailer",
      "examples": "Amazon, Etsy, specialty sites",
      "priceRange": "$X – $Y + shipping",
      "sizes": ["Seed packet", "Bare root", "Small pot"],
      "availability": "Year-round",
      "notes": "brief note",
      "badge": "Widest Selection"
    }
  ],
  "localShopEstimates": [
    { "shopName": "Example Nursery", "priceRange": "$X – $Y", "notes": "brief" }
  ],
  "seasonalTip": "one sentence about best time to buy in this region",
  "bestTimeToBuy": "month range e.g. March–May"
}
Only include localShopEstimates for shops that were listed (${localShops.map((s) => s.name).join(", ") || "none"}). Be realistic with prices for ${state}.`;

  const text = await geminiTextRequest(prompt);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in price response");
  return JSON.parse(jsonMatch[0]) as PlantPriceResponse;
}
