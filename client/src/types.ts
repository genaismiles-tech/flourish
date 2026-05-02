export type GardenType = 'backyard' | 'front-yard' | 'balcony' | 'indoor' | 'mixed';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert';

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
