// db.ts — thin wrapper for the plant lookup layer.
// Currently delegates to in-memory JSON via plantLookup.ts.
// This module exists as the stable import point for future SQLite migration.
export { lookupPlants, getZone, getSeason, detectState, findCareByGenus } from "./plantLookup.js";
export type { PlantSuggestion, PlantCareInfo } from "./plantLookup.js";
