import type { PlantNetMatch } from "./plantnet.js";

export function isINatConfigured(): boolean {
  const key = process.env.INATURALIST_API_TOKEN;
  return !!key && key !== "your_key_here";
}

export async function identifyWithINat(imageBuffer: Buffer, mimeType: string): Promise<PlantNetMatch[]> {
  const token = process.env.INATURALIST_API_TOKEN!;

  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), "plant.jpg");

  const res = await fetch("https://api.inaturalist.org/v1/computervision/score_image", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) throw new Error(`iNaturalist CV error: ${res.status}`);

  const data = await res.json() as {
    results: Array<{
      score: number;
      taxon: {
        name: string;
        rank: string;
        preferred_common_name?: string;
        iconic_taxon_name?: string;
      };
    }>;
  };

  return data.results
    .filter((r) => r.taxon.iconic_taxon_name === "Plantae")
    .slice(0, 5)
    .map((r) => {
      const nameParts = r.taxon.name.split(" ");
      return {
        scientificName: r.taxon.name,
        commonNames: r.taxon.preferred_common_name ? [r.taxon.preferred_common_name] : [r.taxon.name],
        score: r.score,
        genus: nameParts[0] ?? "",
        family: "",
      };
    });
}
