import { useEffect, useRef, useState } from "react";
import type { PlantSuggestion } from "../types";
import "./PlantSearchBar.css";

interface SearchResult {
  scientificName: string;
  commonName: string;
  photoUrl: string | null;
}

interface Props {
  placeholder?: string;
  onSelectPlant: (plant: PlantSuggestion) => void;
  autoFocus?: boolean;
}

function inferEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("rose"))                             return "🌹";
  if (n.includes("lavender"))                         return "💜";
  if (n.includes("sunflower"))                        return "🌻";
  if (n.includes("daisy") || n.includes("aster"))     return "🌼";
  if (n.includes("tulip"))                            return "🌷";
  if (n.includes("cactus"))                           return "🌵";
  if (n.includes("aloe") || n.includes("succulent"))  return "🪴";
  if (n.includes("grass") || n.includes("bamboo"))    return "🌾";
  if (n.includes("oak") || n.includes("maple") || n.includes("willow")) return "🌳";
  if (n.includes("palm") || n.includes("tree"))       return "🌴";
  if (n.includes("fern") || n.includes("moss"))       return "🌿";
  if (n.includes("mint") || n.includes("basil") || n.includes("thyme") || n.includes("sage")) return "🌿";
  if (n.includes("tomato") || n.includes("pepper") || n.includes("bean")) return "🥦";
  if (n.includes("strawberr") || n.includes("blueberr")) return "🍓";
  return "🪴";
}

function inferCategory(commonName: string, scientificName: string): string {
  const n = (commonName + " " + scientificName).toLowerCase();
  if (n.includes("tree") || n.includes("oak") || n.includes("maple") || n.includes("pine")) return "Trees";
  if (n.includes("shrub") || n.includes("bush") || n.includes("viburnum") || n.includes("lilac")) return "Shrubs";
  if (n.includes("grass") || n.includes("bamboo") || n.includes("sedge")) return "Grasses";
  if (n.includes("fern") || n.includes("moss") || n.includes("succulent") || n.includes("cactus") || n.includes("aloe")) return "Succulents & Ferns";
  if (n.includes("mint") || n.includes("basil") || n.includes("thyme") || n.includes("sage") || n.includes("rosemary") || n.includes("oregano") || n.includes("chive")) return "Herbs";
  if (n.includes("tomato") || n.includes("pepper") || n.includes("squash") || n.includes("cucumber") || n.includes("bean") || n.includes("lettuce")) return "Vegetables";
  return "Flowers";
}

function makePlant(commonName: string, scientificName: string): PlantSuggestion {
  return {
    name: commonName,
    emoji: inferEmoji(commonName),
    reason: scientificName !== commonName ? scientificName : commonName,
    careLevel: "moderate",
    category: inferCategory(commonName, scientificName),
  };
}

export default function PlantSearchBar({ placeholder = "Search any plant…", onSelectPlant, autoFocus = false }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 2) { setResults([]); setOpen(false); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/plant-search?q=${encodeURIComponent(query)}`);
        const d = await r.json() as { results: SearchResult[] };
        setResults(d.results ?? []);
        setOpen(true); // open even with 0 results to show free-text option
      } catch {
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 320);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const selectResult = (r: SearchResult) => {
    commit(r.commonName, r.scientificName);
  };

  const submitFreeText = () => {
    const name = query.trim();
    if (!name) return;
    // If there's an exact match in results, prefer it
    const exact = results.find((r) => r.commonName.toLowerCase() === name.toLowerCase());
    if (exact) commit(exact.commonName, exact.scientificName);
    else commit(name, name);
  };

  const commit = (commonName: string, scientificName: string) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onSelectPlant(makePlant(commonName, scientificName));
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "Enter") {
      e.preventDefault();
      submitFreeText();
    }
  };

  const hasQuery = query.trim().length >= 2;

  return (
    <div className="psb-wrap">
      <div className="psb-input-row">
        <span className="psb-icon">🔍</span>
        <input
          ref={inputRef}
          className="psb-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && <span className="psb-spinner spinner" />}
        {hasQuery && !loading && (
          <>
            <button className="psb-clear" onClick={() => { setQuery(""); setOpen(false); }} tabIndex={-1}>✕</button>
            <button className="psb-submit" onClick={submitFreeText} title="Get prices for this plant">→</button>
          </>
        )}
      </div>

      {open && hasQuery && (
        <ul className="psb-dropdown" role="listbox">
          {/* Free-text option always first */}
          <li
            className="psb-result psb-free-text"
            role="option"
            onMouseDown={(e) => { e.preventDefault(); submitFreeText(); }}
          >
            <span className="psb-thumb psb-thumb-placeholder">🔍</span>
            <div className="psb-result-text">
              <span className="psb-common">Search "{query.trim()}"</span>
              <span className="psb-scientific">Get prices for any plant name</span>
            </div>
          </li>

          {results.map((r) => (
            <li
              key={r.scientificName}
              className="psb-result"
              role="option"
              onMouseDown={(e) => { e.preventDefault(); selectResult(r); }}
            >
              {r.photoUrl
                ? <img src={r.photoUrl} alt="" className="psb-thumb" />
                : <span className="psb-thumb psb-thumb-placeholder">{inferEmoji(r.commonName)}</span>
              }
              <div className="psb-result-text">
                <span className="psb-common">{r.commonName}</span>
                <span className="psb-scientific">{r.scientificName}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
