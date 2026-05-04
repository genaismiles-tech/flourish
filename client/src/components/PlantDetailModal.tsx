import { useEffect, useState } from "react";
import type { PlantSuggestion, PlantPriceResponse, ShopRecommendation } from "../types";
import "./PlantDetailModal.css";

interface Props {
  plant: PlantSuggestion;
  location: string;
  shops: ShopRecommendation[];
  token: string | null;
  onClose: () => void;
  onAddedToPlan: (plantName: string) => void;
}

const BADGE_COLOR: Record<string, string> = {
  "Best Value":       "badge-value",
  "Best Quality":     "badge-quality",
  "Widest Selection": "badge-selection",
  "Online":           "badge-selection",
};

const STATUS_STEPS = [
  { key: "planned",   label: "Planned",   icon: "📋" },
  { key: "purchased", label: "Purchased", icon: "🛒" },
  { key: "planted",   label: "Planted",   icon: "🌱" },
] as const;

export default function PlantDetailModal({ plant, location, shops, token, onClose, onAddedToPlan }: Props) {
  const [prices, setPrices] = useState<PlantPriceResponse | null>(null);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesError, setPricesError] = useState<string | null>(null);

  // Plan selection
  const [selectedRetailer, setSelectedRetailer] = useState<{ name: string; type: string; price: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedStatus, setAddedStatus] = useState<"idle" | "added" | "duplicate">("idle");

  useEffect(() => {
    setPricesLoading(true);
    setPricesError(null);
    fetch("/api/plant-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plantName: plant.name,
        plantCategory: plant.category,
        location,
        localShops: shops.map((s) => ({ name: s.name, type: s.type })),
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json() as Promise<PlantPriceResponse>;
      })
      .then((d) => setPrices(d))
      .catch((e) => setPricesError(e.message))
      .finally(() => setPricesLoading(false));
  }, [plant.name]);

  const handleAddToPlan = async () => {
    if (!token) { window.alert("Sign in to save plants to your plan."); return; }
    if (!selectedRetailer) { window.alert("Select where you plan to buy first."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/user/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          plantName: plant.name,
          plantEmoji: plant.emoji,
          plantCategory: plant.category,
          nurseryName: selectedRetailer.name,
          nurseryType: selectedRetailer.type,
          priceEstimate: selectedRetailer.price,
        }),
      });
      if (res.status === 409) { setAddedStatus("duplicate"); return; }
      if (!res.ok) throw new Error("Failed");
      setAddedStatus("added");
      onAddedToPlan(plant.name);
    } catch {
      window.alert("Could not add to plan. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  // Build retailer options: generic prices + local shop estimates
  const allOptions: Array<{ name: string; type: string; price: string; badge?: string; notes: string }> = [];
  if (prices) {
    prices.prices.forEach((p) => {
      allOptions.push({
        name: p.examples ? `${p.retailerType} (${p.examples})` : p.retailerType,
        type: p.retailerType,
        price: p.priceRange,
        badge: p.badge,
        notes: p.notes,
      });
    });
    prices.localShopEstimates.forEach((s) => {
      allOptions.push({
        name: s.shopName,
        type: "Local Nursery",
        price: s.priceRange,
        notes: s.notes,
      });
    });
  }

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <div className="pdm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pdm-header">
          <div className="pdm-title-row">
            <span className="pdm-emoji">{plant.emoji}</span>
            <div>
              <h2 className="pdm-name">{plant.name}</h2>
              <div className="pdm-meta">
                <span className="pdm-category">{plant.category}</span>
                <span className={`pdm-care care-${plant.careLevel}`}>{plant.careLevel}</span>
              </div>
            </div>
          </div>
          <button className="pdm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="pdm-reason">{plant.reason}</p>

        {/* Price comparison */}
        <div className="pdm-section">
          <h3 className="pdm-section-title">💰 Price Comparison</h3>

          {pricesLoading && (
            <div className="pdm-loading">
              <span className="spinner" />
              <span>Fetching prices for {location}…</span>
            </div>
          )}

          {pricesError && (
            <p className="pdm-error">Could not load prices: {pricesError}</p>
          )}

          {prices && !pricesLoading && (
            <>
              {prices.prices.length > 0 && (
                <div className="pdm-price-table">
                  {prices.prices.map((p) => (
                    <div key={p.retailerType} className="pdm-price-row">
                      <div className="pdm-price-left">
                        <div className="pdm-retailer-name">
                          {p.retailerType}
                          {p.badge && (
                            <span className={`pdm-badge ${BADGE_COLOR[p.badge] ?? "badge-value"}`}>{p.badge}</span>
                          )}
                        </div>
                        {p.examples && <div className="pdm-examples">{p.examples}</div>}
                        <div className="pdm-availability">Available: {p.availability}</div>
                        <div className="pdm-sizes">{p.sizes.join(" · ")}</div>
                        <div className="pdm-price-notes">{p.notes}</div>
                      </div>
                      <div className="pdm-price-range">{p.priceRange}</div>
                    </div>
                  ))}
                </div>
              )}

              {prices.localShopEstimates.length > 0 && (
                <>
                  <h4 className="pdm-local-title">📍 Local Nursery Estimates</h4>
                  <div className="pdm-local-shops">
                    {prices.localShopEstimates.map((s) => (
                      <div key={s.shopName} className="pdm-local-row">
                        <div>
                          <div className="pdm-shop-name">{s.shopName}</div>
                          <div className="pdm-price-notes">{s.notes}</div>
                        </div>
                        <div className="pdm-price-range">{s.priceRange}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {prices.seasonalTip && (
                <div className="pdm-tip">
                  <span>🗓</span>
                  <span>{prices.seasonalTip}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Add to plan */}
        {prices && !pricesLoading && allOptions.length > 0 && (
          <div className="pdm-section pdm-plan-section">
            <h3 className="pdm-section-title">📋 Add to My Garden Plan</h3>

            {addedStatus === "added" ? (
              <div className="pdm-added-msg">
                <span>✅</span>
                <div>
                  <strong>{plant.name}</strong> added to your plan!
                  <div className="pdm-added-sub">Track it under My Plan on the home screen.</div>
                </div>
              </div>
            ) : addedStatus === "duplicate" ? (
              <div className="pdm-added-msg pdm-duplicate">
                <span>ℹ️</span>
                <div>This plant is already in your plan.</div>
              </div>
            ) : (
              <>
                <p className="pdm-plan-label">Where do you plan to buy it?</p>
                <div className="pdm-retailer-list">
                  {allOptions.map((opt) => (
                    <button
                      key={opt.name}
                      className={`pdm-retailer-btn ${selectedRetailer?.name === opt.name ? "selected" : ""}`}
                      onClick={() => setSelectedRetailer(opt)}
                    >
                      <div className="pdm-retailer-btn-top">
                        <span className="pdm-retailer-btn-name">{opt.name}</span>
                        {opt.badge && (
                          <span className={`pdm-badge ${BADGE_COLOR[opt.badge] ?? "badge-value"}`}>{opt.badge}</span>
                        )}
                      </div>
                      <div className="pdm-retailer-btn-price">{opt.price}</div>
                    </button>
                  ))}
                </div>

                <button
                  className="pdm-add-btn"
                  onClick={handleAddToPlan}
                  disabled={!selectedRetailer || adding}
                >
                  {adding ? <><span className="spinner" /> Adding…</> : "➕ Add to My Plan"}
                </button>

                {!token && (
                  <p className="pdm-auth-note">Sign in to save plants to your plan across devices.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
