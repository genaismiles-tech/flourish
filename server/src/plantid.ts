// Plant.id v3 API — health assessment and disease detection (plant.id)
// Free tier: 100 requests/day. Register at https://plant.id

export interface DiseaseDetail {
  name: string;
  probability: number;
  description: string;
  treatment: {
    biological: string[];
    chemical: string[];
    prevention: string[];
  };
}

export interface HealthAssessment {
  isPlant: boolean;
  isHealthy: boolean;
  healthProbability: number;
  diseases: DiseaseDetail[];
}

export function isPlantIdConfigured(): boolean {
  const key = process.env.PLANT_ID_API_KEY;
  return !!key && key !== "your_key_here";
}

export async function assessHealth(
  imageBuffer: Buffer,
  mimeType: string
): Promise<HealthAssessment> {
  const apiKey = process.env.PLANT_ID_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    throw new Error("PLANT_ID_API_KEY not configured");
  }

  const base64 = imageBuffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;

  const res = await fetch("https://plant.id/api/v3/health_assessment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
    },
    body: JSON.stringify({ images: [dataUri], similar_images: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plant.id ${res.status}: ${text.slice(0, 200)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  const result = data.result ?? {};

  const isPlant = (result.is_plant?.probability ?? 1) > 0.5;
  const healthProb = result.is_healthy?.probability ?? 1.0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diseases: DiseaseDetail[] = (result.disease?.suggestions ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => (d.probability ?? 0) >= 0.08)
    .slice(0, 4)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({
      name: d.name ?? "Unknown issue",
      probability: d.probability ?? 0,
      description: d.details?.description ?? "",
      treatment: {
        biological: d.details?.treatment?.biological ?? [],
        chemical: d.details?.treatment?.chemical ?? [],
        prevention: d.details?.treatment?.prevention ?? [],
      },
    }));

  return { isPlant, isHealthy: healthProb > 0.6, healthProbability: healthProb, diseases };
}
