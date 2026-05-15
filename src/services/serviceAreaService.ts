// Single source of truth for "is this address / coordinate inside the
// CareMol service area?". Used by:
//   - server-side WhatsApp webhook (src/services/botLogic.ts)
//   - in-dashboard simulator + manual booking modal (src/App.tsx, src/components/NewBookingModal.tsx)
//
// The configuration (allowed PIN list, service-area center, radius) lives on
// the singleton config/booking Firestore doc. When fields are missing the
// helpers fall back to the historical hardcoded defaults so legacy configs
// keep working without a migration.

import { calculateDistance } from "./mapsService";

export interface ServiceAreaConfig {
  pins?: string[];
  center?: { lat: number; lng: number };
  radiusKm?: number;
}

export const DEFAULT_SERVICE_PINS: readonly string[] = ["679326"];
export const DEFAULT_SERVICE_CENTER = { lat: 11.0664, lng: 76.2687 }; // Melattur
export const DEFAULT_SERVICE_RADIUS_KM = 5;

/**
 * Returns true if any configured PIN appears in the free-form input string.
 * Whitespace is stripped before matching, so "PIN: 679 326" still resolves.
 */
export function isPinInServiceArea(input: string, cfg: ServiceAreaConfig): boolean {
  const pins = cfg.pins && cfg.pins.length > 0 ? cfg.pins : DEFAULT_SERVICE_PINS;
  const normalized = (input || "").replace(/\s/g, "");
  if (!normalized) return false;
  return pins.some((pin) => normalized.includes(pin));
}

/**
 * Returns true if the (lat, lng) is within `radiusKm` of `center`. NaN-safe.
 * `radiusKm` and `center` fall back to defaults when missing on the config doc.
 */
export function isCoordInServiceArea(
  lat: number,
  lng: number,
  cfg: ServiceAreaConfig
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const center = cfg.center || DEFAULT_SERVICE_CENTER;
  const radius = typeof cfg.radiusKm === "number" && cfg.radiusKm > 0
    ? cfg.radiusKm
    : DEFAULT_SERVICE_RADIUS_KM;
  const dist = calculateDistance(lat, lng, center.lat, center.lng);
  if (!Number.isFinite(dist)) return false;
  return dist <= radius;
}

// Narrows a BookingConfig (or any partial shape) into the helper's input.
// Both bot implementations build this from the live config they already have.
export function toServiceAreaConfig(cfg: {
  servicePins?: string[];
  serviceCenter?: { lat: number; lng: number };
  serviceRadiusKm?: number;
}): ServiceAreaConfig {
  return {
    pins: cfg.servicePins,
    center: cfg.serviceCenter,
    radiusKm: cfg.serviceRadiusKm,
  };
}
