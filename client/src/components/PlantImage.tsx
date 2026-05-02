import { useEffect, useState } from "react";

interface Props {
  scientificName: string;
  commonName: string;
  className?: string;
}

export default function PlantImage({ scientificName, commonName, className = "" }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setImageUrl(null);

    fetch(`/api/plant-image?name=${encodeURIComponent(scientificName)}`)
      .then((r) => r.json())
      .then((data: { imageUrl: string | null }) => {
        if (!cancelled) { setImageUrl(data.imageUrl); setLoading(false); }
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [scientificName]);

  if (loading) {
    return <div className={`plant-img-wrap loading ${className}`}><div className="plant-img-shimmer" /></div>;
  }

  if (!imageUrl) {
    return (
      <div className={`plant-img-wrap placeholder ${className}`}>
        <span className="plant-img-icon">🌿</span>
      </div>
    );
  }

  return (
    <div className={`plant-img-wrap ${className}`}>
      <img src={imageUrl} alt={commonName} className="plant-img-photo" loading="lazy" />
    </div>
  );
}
