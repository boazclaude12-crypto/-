import { normalize } from './text';

interface Place {
  city: string;
  region: string;
  lat: number;
  lng: number;
}

/**
 * A compact gazetteer of the places a staffing desk in Israel actually works with.
 * Enough to compute a real travel distance for matching without an external API.
 */
const PLACES: Place[] = [
  { city: 'חיפה', region: 'haifa', lat: 32.794, lng: 34.9896 },
  { city: 'קריית אתא', region: 'haifa', lat: 32.8, lng: 35.1 },
  { city: 'קריית ביאליק', region: 'haifa', lat: 32.827, lng: 35.086 },
  { city: 'קריית מוצקין', region: 'haifa', lat: 32.839, lng: 35.077 },
  { city: 'קריית ים', region: 'haifa', lat: 32.847, lng: 35.068 },
  { city: 'נשר', region: 'haifa', lat: 32.766, lng: 35.043 },
  { city: 'טירת כרמל', region: 'haifa', lat: 32.76, lng: 34.972 },
  { city: 'עכו', region: 'north', lat: 32.928, lng: 35.082 },
  { city: 'נהריה', region: 'north', lat: 33.008, lng: 35.098 },
  { city: 'כרמיאל', region: 'north', lat: 32.919, lng: 35.292 },
  { city: 'צפת', region: 'north', lat: 32.965, lng: 35.496 },
  { city: 'טבריה', region: 'north', lat: 32.79, lng: 35.531 },
  { city: 'עפולה', region: 'north', lat: 32.607, lng: 35.289 },
  { city: 'נצרת', region: 'north', lat: 32.699, lng: 35.303 },
  { city: 'מגדל העמק', region: 'north', lat: 32.675, lng: 35.24 },
  { city: 'יקנעם', region: 'north', lat: 32.66, lng: 35.11 },
  { city: 'חדרה', region: 'sharon', lat: 32.434, lng: 34.92 },
  { city: 'קיסריה', region: 'sharon', lat: 32.5, lng: 34.9 },
  { city: 'נתניה', region: 'sharon', lat: 32.321, lng: 34.853 },
  { city: 'רעננה', region: 'sharon', lat: 32.184, lng: 34.871 },
  { city: 'כפר סבא', region: 'sharon', lat: 32.175, lng: 34.907 },
  { city: 'הרצליה', region: 'sharon', lat: 32.166, lng: 34.843 },
  { city: 'רמת השרון', region: 'sharon', lat: 32.146, lng: 34.84 },
  { city: 'הוד השרון', region: 'sharon', lat: 32.15, lng: 34.888 },
  { city: 'תל אביב', region: 'center', lat: 32.0853, lng: 34.7818 },
  { city: 'רמת גן', region: 'center', lat: 32.082, lng: 34.814 },
  { city: 'גבעתיים', region: 'center', lat: 32.072, lng: 34.812 },
  { city: 'בני ברק', region: 'center', lat: 32.084, lng: 34.833 },
  { city: 'פתח תקווה', region: 'center', lat: 32.084, lng: 34.887 },
  { city: 'ראש העין', region: 'center', lat: 32.096, lng: 34.955 },
  { city: 'חולון', region: 'center', lat: 32.015, lng: 34.774 },
  { city: 'בת ים', region: 'center', lat: 32.017, lng: 34.75 },
  { city: 'ראשון לציון', region: 'center', lat: 31.973, lng: 34.789 },
  { city: 'רחובות', region: 'shfela', lat: 31.894, lng: 34.809 },
  { city: 'נס ציונה', region: 'shfela', lat: 31.929, lng: 34.798 },
  { city: 'יבנה', region: 'shfela', lat: 31.878, lng: 34.739 },
  { city: 'לוד', region: 'shfela', lat: 31.951, lng: 34.895 },
  { city: 'רמלה', region: 'shfela', lat: 31.928, lng: 34.866 },
  { city: 'מודיעין', region: 'shfela', lat: 31.899, lng: 35.007 },
  { city: 'אשדוד', region: 'south', lat: 31.801, lng: 34.643 },
  { city: 'אשקלון', region: 'south', lat: 31.669, lng: 34.571 },
  { city: 'קריית גת', region: 'south', lat: 31.61, lng: 34.771 },
  { city: 'באר שבע', region: 'south', lat: 31.252, lng: 34.791 },
  { city: 'דימונה', region: 'south', lat: 31.07, lng: 35.033 },
  { city: 'אילת', region: 'south', lat: 29.557, lng: 34.952 },
  { city: 'ירושלים', region: 'jerusalem', lat: 31.7683, lng: 35.2137 },
  { city: 'בית שמש', region: 'jerusalem', lat: 31.745, lng: 34.988 },
  { city: 'מעלה אדומים', region: 'jerusalem', lat: 31.773, lng: 35.298 },
];

const BY_NAME = new Map(PLACES.map((p) => [normalize(p.city), p]));

export function lookupPlace(city: string | null | undefined): Place | null {
  if (!city) return null;
  return BY_NAME.get(normalize(city)) ?? null;
}

export function regionOfCity(city: string | null | undefined): string | null {
  return lookupPlace(city)?.region ?? null;
}

export function cityOptions(): Array<{ value: string; label: string }> {
  return PLACES.map((p) => ({ value: p.city, label: p.city }));
}

/** Great-circle distance in km, or null when either place is unknown. */
export function distanceKm(cityA: string | null | undefined, cityB: string | null | undefined): number | null {
  const a = lookupPlace(cityA);
  const b = lookupPlace(cityB);
  if (!a || !b) return null;
  if (a.city === b.city) return 0;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
