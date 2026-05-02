import type { PlantSuggestion, UserProfile } from "../types";
import "./PlantSuggestions.css";

interface Props {
  suggestions: PlantSuggestion[];
  profile: UserProfile;
  onBack: () => void;
  onAddPreference: (pref: string) => void;
}

export default function PlantSuggestions({ suggestions, profile, onBack, onAddPreference }: Props) {
  const subtitle =
    profile.plantPreferences.length > 0
      ? `Based on your love of ${profile.plantPreferences.slice(0, 2).join(" & ")}`
      : `Curated for your ${profile.gardenType.replace("-", " ")} garden`;

  return (
    <div className="ps-page">
      <div className="ps-header">
        <button className="ps-back" onClick={onBack}>← Back</button>
        <div className="ps-header-text">
          <h2 className="ps-heading">Plants for {profile.location}</h2>
          <p className="ps-sub">{subtitle}</p>
        </div>
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
                <div className="ps-emoji">{plant.emoji}</div>
                <div className="ps-card-body">
                  <div className="ps-card-top">
                    <span className="ps-name">{plant.name}</span>
                    <span className={`ps-care-badge ${careClass}`}>{plant.careLevel}</span>
                  </div>
                  <span className="ps-category">{plant.category}</span>
                  <p className="ps-reason">{plant.reason}</p>
                  <button
                    className={`btn-add-pref ${isAdded ? "added" : ""}`}
                    onClick={() => onAddPreference(plant.name)}
                    disabled={isAdded}
                  >
                    {isAdded ? "✓ Added to interests" : "+ Add to my interests"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
