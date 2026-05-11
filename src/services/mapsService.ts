const MELATTUR_COORDS = { lat: 11.0664, lng: 76.2687 };
const MAX_DISTANCE_KM = 5; // Increased slightly to account for town centroid distances

export interface GeocodeResult {
  lat: number;
  lng: number;
  address: string;
}

export async function geocodeLocation(input: string): Promise<GeocodeResult | null> {
  const apiKey = typeof process !== 'undefined' && process.env.VITE_GOOGLE_MAPS_API_KEY 
    ? process.env.VITE_GOOGLE_MAPS_API_KEY 
    : (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.error('Google Maps API Key not found');
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input)}&key=${apiKey}`
    );
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        address: result.formatted_address
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function isWithinRange(lat: number, lng: number): boolean {
  const dist = calculateDistance(lat, lng, MELATTUR_COORDS.lat, MELATTUR_COORDS.lng);
  console.log(`[Maps] Distance calculated: ${dist.toFixed(2)} km (Max: ${MAX_DISTANCE_KM} km)`);
  return dist <= MAX_DISTANCE_KM;
}
