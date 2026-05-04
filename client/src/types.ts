export type GardenType = 'backyard' | 'front-yard' | 'balcony' | 'indoor' | 'mixed';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert';

export interface AuthUser {
  id: number;
  email: string;
}

export interface AuthState {
  token: string;
  user: AuthUser;
}

export interface PriceEstimate {
  retailerType: string;
  examples?: string;
  priceRange: string;
  sizes: string[];
  availability: string;
  notes: string;
  badge?: string;
}

export interface PlantPriceResponse {
  prices: PriceEstimate[];
  localShopEstimates: Array<{ shopName: string; priceRange: string; notes: string }>;
  seasonalTip: string;
  bestTimeToBuy: string;
}

export interface PlanItem {
  id: number;
  plant_name: string;
  plant_emoji: string;
  plant_category: string | null;
  nursery_name: string | null;
  nursery_type: string | null;
  price_estimate: string | null;
  status: 'planned' | 'purchased' | 'planted';
  notes: string | null;
  created_at: string;
}

export interface UserProfile {
  location: string;
  latitude?: number;
  longitude?: number;
  gardenType: GardenType;
  experience: ExperienceLevel;
  plantPreferences: string[];
}

export interface GardenAnalysis {
  identifiedPlants: Array<{
    name: string;
    commonName: string;
    healthStatus: 'healthy' | 'needs-attention' | 'struggling';
    healthNotes: string;
    position?: string;
  }>;
  gardenSummary: string;
  layoutSuggestions: Array<{
    title: string;
    description: string;
    priority: 'quick-win' | 'seasonal' | 'long-term';
    estimatedImpact?: string;
  }>;
  beautySuggestions: Array<{
    title: string;
    description: string;
    suggestedPlants?: string[];
  }>;
  recommendedNewPlants: Array<{
    name: string;
    reason: string;
    careLevel: 'easy' | 'moderate' | 'advanced';
    whenToPlant?: string;
  }>;
  maintenanceSchedule: Array<{
    task: string;
    frequency: string;
    bestTime: string;
    tips?: string;
  }>;
  trimmingAndWaste: {
    advice: string;
    compostingTips?: string;
    disposalAdvice?: string;
  };
  localResources: Array<{
    type: string;
    description: string;
    searchSuggestion: string;
    // Present when populated from real OSM or curated shop data
    name?: string;
    address?: string;
    distance?: string;
    url?: string;
  }>;
  weatherConsiderations: string;
  seasonalAdvice: string;
  potAndContainerAdvice?: string;
  overallScore?: {
    score: number;
    label: string;
    message: string;
  };
}

export interface PlantSuggestion {
  name: string;
  emoji: string;
  reason: string;
  careLevel: 'easy' | 'moderate' | 'advanced';
  category: string;
}

export interface ShopRecommendation {
  name: string;
  type: string;
  description: string;
  address?: string;
  distance?: string;
  url?: string;
  phone?: string;
}

export interface SuggestionsResponse {
  plants: PlantSuggestion[];
  shops: ShopRecommendation[];
}

export interface Issue {
  name: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  symptoms: string[];
  causes: string[];
  treatment: string[];
  prevention: string[];
}

export interface DiagnosisData {
  plantName: string;
  healthStatus: 'healthy' | 'diseased' | 'stressed' | 'unknown';
  issues: Issue[];
  overallAdvice: string;
  confidence: 'high' | 'medium' | 'low';
}
