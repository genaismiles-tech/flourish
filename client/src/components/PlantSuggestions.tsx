import { useState } from "react";
import type { PlantSuggestion, ShopRecommendation, UserProfile } from "../types";
import PlantDetailModal from "./PlantDetailModal";
import PlantImage from "./PlantImage";
import PlantSearchBar from "./PlantSearchBar";
import "./PlantSuggestions.css";

interface Props {
  suggestions: PlantSuggestion[];
  shops: ShopRecommendation[];
  profile: UserProfile;
  token: string | null;
  onBack: () => void;
  onAddPreference: (pref: string) => void;
  onOpenPlan: () => void;
}

export default function PlantSuggestions({ suggestions, shops, profile, token, onBack, onAddPreference, onOpenPlan }: Props) {
  const [selectedPlant, setSelectedPlant] = useState<PlantSuggestion | null>(null);
  const [planCount, setPlanCount] = useState(0);

  const subtitle =
    profile.plantPreferences.length > 0
      ? `Based on your love of ${profile.plantPreferences.slice(0, 2).join(" & ")}`
      : `Curated for your ${profile.gardenType.replace("-", " ")} garden`;

  const handleAddedToPlan = (_plantName: string) => {
    setPlanCount((n) => n + 1);
  };

  return (
    <div className="ps-page">
      <div className="ps-header">
        <button className="ps-back" onClick={onBack}>← Back</button>
        <div className="ps-header-text">
          <h2 className="ps-heading">Plants for {profile.location}</h2>
          <p className="ps-sub">{subtitle}</p>
        </div>
        {token && (
          <button className="ps-plan-btn" onClick={onOpenPlan}>
            🌿 My Plan{planCount > 0 ? ` (${planCount})` : ""}
          </button>
        )}
      </div>

      {/* ── Search any plant ── */}
      <div className="ps-search-section">
        <PlantSearchBar
          placeholder="Search any plant for prices…"
          onSelectPlant={setSelectedPlant}
        />
      </div>

      {suggestions.length === 0 ? (
        <div className="ps-empty">No suggestions available.</div>
      ) : (
        <div className="ps-grid">
          {suggestions.map((plant, i) => {
            const careClass =
              plant.careLevel === "easy"
                ? "care-easy"
                : plant.careLevel === "moderate"
                ? "care-moderate"
                : "care-advanced";
            const isAdded = profile.plantPreferences.includes(plant.name);
            return (
              <div key={i} className="ps-card">
                <div className="ps-card-img-wrap">
                  <PlantImage
                    scientificName={plant.name}
                    commonName={plant.name}
                    className="ps-card-img"
                  />
                  <span className={`ps-care-badge-overlay ${careClass}`}>{plant.careLevel}</span>
                </div>
                <div className="ps-card-body">
                  <div className="ps-card-top">
                    <span className="ps-name">{plant.name}</span>
                  </div>
                  <span className="ps-category">{plant.category}</span>
                  <p className="ps-reason">{plant.reason}</p>
                  <div className="ps-card-actions">
                    <button
                      className={`btn-add-pref ${isAdded ? "added" : ""}`}
                      onClick={() => onAddPreference(plant.name)}
                      disabled={isAdded}
                    >
                      {isAdded ? "✓ Added" : "+ Interests"}
                    </button>
                    <button
                      className="btn-see-prices"
                      onClick={() => setSelectedPlant(plant)}
                    >
                      💰 Prices
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shops.length > 0 && (
        <div className="ps-shops">
          <h3 className="ps-shops-heading">🛒 Where to Find These Plants</h3>
          <p className="ps-shops-sub">Nurseries and resources near {profile.location}</p>
          <div className="ps-shops-grid">
            {shops.map((shop, i) => {
              const linkUrl = shop.url
                ?? `https://www.google.com/search?q=${encodeURIComponent(shop.name + " " + profile.location)}`;
              const linkLabel = shop.url?.includes("openstreetmap")
                ? "View on map →"
                : shop.url
                ? "Visit website →"
                : "Search →";
              return (
                <div key={i} className="ps-shop-card">
                  <div className="ps-shop-header">
                    <span className="ps-shop-type">{shop.type}</span>
                    {shop.distance && <span className="ps-shop-distance">{shop.distance}</span>}
                  </div>
                  <div className="ps-shop-name">{shop.name}</div>
                  <p className="ps-shop-desc">{shop.description}</p>
                  {shop.address && <div className="ps-shop-address">📍 {shop.address}</div>}
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ps-shop-link"
                  >
                    {linkLabel}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedPlant && (
        <PlantDetailModal
          plant={selectedPlant}
          location={profile.location}
          shops={shops}
          token={token}
          onClose={() => setSelectedPlant(null)}
          onAddedToPlan={handleAddedToPlan}
        />
      )}
    </div>
  );
}
