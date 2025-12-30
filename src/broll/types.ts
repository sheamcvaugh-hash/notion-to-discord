// src/broll/types.ts

// 1. Canonical Type Classification List
// These are the ONLY allowed values for a clip's type.
// Rules:
// - Action / Activity overrides everything.
// - People override Place and City.
// - Place = interior shots.
// - City = exterior built environment.
// - Transit = transport-focused.
// - Nature = only when human structures are not dominant.
// - Gear = only when the specific item/gadget is the point.
// - Animals always win.
export enum CanonicalType {
  Food = 'Food',
  City = 'City',
  People = 'People',
  Gear = 'Gear',
  Animals = 'Animals',
  Place = 'Place',
  Transit = 'Transit',
  Nature = 'Nature',
  ActionActivity = 'Action / Activity'
}

// Represents a raw file found in Google Drive
export interface BrollFile {
  id: string;
  name: string;
  mimeType: string;
  // We keep track if it is a proxy based on name ending in _low
  isProxy: boolean; 
}

// Represents a confirmed pair (Eyes Module)
// We only analyze if we have BOTH parts.
export interface BrollPair {
  proxy: BrollFile;
  master: BrollFile;
}

// The Strict JSON output expected from Gemini (Brain Module)
export interface AnalysisResult {
  suggested_filename: string;
  tags: string[]; // Limited to 3-5 tags
  type: CanonicalType; // Must match the Enum above
  summary: string;
}

// Context passed into the Analyzer to help Gemini
// NOTE: Country is authoritative (from folder), City is user-provided.
export interface AnalysisContext {
  country: string;
  city: string;
}