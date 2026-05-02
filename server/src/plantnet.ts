// PlantNet v2 API — open-source plant identification project (my.plantnet.org)
// Free tier: 500 identifications/day. Register at https://my.plantnet.org

export interface PlantNetMatch {
  scientificName: string;
  commonNames: string[];
  score: number;
  genus: string;
  family: string;
}

export function isPlantNetConfigured(): boolean {
  const key = process.env.PLANTNET_API_KEY;
  return !!key && key !== "your_key_here";
}

export async function identifyPlants(
  imageBuffer: Buffer,
  mimeType: string
): Promise<PlantNetMatch[]> {
  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    throw new Error("PLANTNET_API_KEY not configured");
  }

  const form = new FormData();
  form.append("images", new Blob([imageBuffer], { type: mimeType }), "plant.jpg");
  form.append("organs", "auto");

  const url =
    `https://my-api.plantnet.org/v2/identify/all` +
    `?api-key=${encodeURIComponent(apiKey)}&include-related-images=false&nb-results=5&lang=en`;

  const res = await fetch(url, { method: "POST", body: form });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PlantNet ${res.status}: ${text.slice(0, 200)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.results ?? []).slice(0, 5).map((r: any) => ({
    scientificName: r.species?.scientificNameWithoutAuthor ?? "Unknown",
    commonNames: (r.species?.commonNames ?? []) as string[],
    score: (r.score ?? 0) as number,
    genus: r.species?.genus?.scientificNameWithoutAuthor ?? "",
    family: r.species?.family?.scientificNameWithoutAuthor ?? "",
  }));
}
