import { useEffect, useState } from "react";
import type { PlanItem, PlantSuggestion } from "../types";
import PlantDetailModal from "./PlantDetailModal";
import PlantSearchBar from "./PlantSearchBar";
import "./GardenPlanPanel.css";

interface Props {
  token: string;
  location: string;
  onClose: () => void;
}

type Status = "planned" | "purchased" | "planted";

const STATUS_META: Record<Status, { label: string; icon: string; next: Status | null; nextLabel: string | null }> = {
  planned:   { label: "Planned",   icon: "📋", next: "purchased", nextLabel: "Mark purchased" },
  purchased: { label: "Purchased", icon: "🛒", next: "planted",   nextLabel: "Mark planted" },
  planted:   { label: "Planted",   icon: "🌱", next: null,        nextLabel: null },
};

export default function GardenPlanPanel({ token, location, onClose }: Props) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchPlant, setSearchPlant] = useState<PlantSuggestion | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch("/api/user/plan", { headers })
      .then((r) => r.json())
      .then((d) => setItems(d.plan ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const advance = async (item: PlanItem) => {
    const meta = STATUS_META[item.status];
    if (!meta.next) return;
    await fetch(`/api/user/plan/${item.id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: meta.next }),
    });
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: meta.next! } : i));
  };

  const remove = async (id: number) => {
    await fetch(`/api/user/plan/${id}`, { method: "DELETE", headers });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const groups: Record<Status, PlanItem[]> = { planned: [], purchased: [], planted: [] };
  items.forEach((i) => { groups[i.status as Status]?.push(i); });

  const planted = groups.planted.length;
  const total = items.length;

  return (
    <div className="gpp-overlay" onClick={onClose}>
      <div className="gpp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="gpp-header">
          <div>
            <h2 className="gpp-title">🌿 My Garden Plan</h2>
            {total > 0 && (
              <p className="gpp-progress-label">
                {planted} of {total} planted
              </p>
            )}
          </div>
          <button className="gpp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {total > 0 && (
          <div className="gpp-progress-bar">
            <div className="gpp-progress-fill" style={{ width: `${(planted / total) * 100}%` }} />
          </div>
        )}

        <div className="gpp-search-wrap">
          <PlantSearchBar
            placeholder="Add any plant — search for prices…"
            onSelectPlant={setSearchPlant}
          />
        </div>

        {loading ? (
          <div className="gpp-loading"><span className="spinner" /></div>
        ) : total === 0 ? (
          <div className="gpp-empty">
            <div className="gpp-empty-icon">🌱</div>
            <p>Your garden plan is empty.</p>
            <p>Browse <strong>Plant Ideas</strong> and add plants you want to grow.</p>
          </div>
        ) : (
          <div className="gpp-body">
            {(["planned", "purchased", "planted"] as Status[]).map((status) => {
              const group = groups[status];
              if (group.length === 0) return null;
              const { label, icon } = STATUS_META[status];
              return (
                <div key={status} className="gpp-group">
                  <div className="gpp-group-header">
                    <span>{icon} {label}</span>
                    <span className="gpp-count">{group.length}</span>
                  </div>
                  <div className="gpp-items">
                    {group.map((item) => {
                      const meta = STATUS_META[item.status as Status];
                      return (
                        <div key={item.id} className={`gpp-item gpp-item-${item.status}`}>
                          <div className="gpp-item-emoji">{item.plant_emoji}</div>
                          <div className="gpp-item-body">
                            <div className="gpp-item-name">{item.plant_name}</div>
                            {item.plant_category && (
                              <div className="gpp-item-category">{item.plant_category}</div>
                            )}
                            {item.nursery_name && (
                              <div className="gpp-item-nursery">
                                🏪 {item.nursery_name}
                                {item.price_estimate && (
                                  <span className="gpp-price"> · {item.price_estimate}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="gpp-item-actions">
                            {meta.next && (
                              <button
                                className="gpp-advance-btn"
                                onClick={() => advance(item)}
                                title={meta.nextLabel ?? ""}
                              >
                                {STATUS_META[meta.next].icon}
                              </button>
                            )}
                            {item.status === "planted" && (
                              <span className="gpp-done-icon" title="Planted!">✅</span>
                            )}
                            <button
                              className="gpp-remove-btn"
                              onClick={() => remove(item.id)}
                              title="Remove from plan"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {searchPlant && (
        <PlantDetailModal
          plant={searchPlant}
          location={location}
          shops={[]}
          token={token}
          onClose={() => setSearchPlant(null)}
          onAddedToPlan={() => {
            setSearchPlant(null);
            // Refresh plan list so the new item appears immediately
            fetch("/api/user/plan", { headers: { Authorization: `Bearer ${token}` } })
              .then((r) => r.json())
              .then((d) => setItems(d.plan ?? []))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
