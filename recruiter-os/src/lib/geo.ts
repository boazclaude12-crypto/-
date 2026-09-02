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

  { city: 'תל מונד', region: 'sharon', lat: 32.253, lng: 34.918 },
  { city: 'אבן יהודה', region: 'sharon', lat: 32.269, lng: 34.888 },
  { city: 'קדימה', region: 'sharon', lat: 32.28, lng: 34.917 },
  { city: 'צורן', region: 'sharon', lat: 32.281, lng: 34.929 },
  { city: 'פרדס חנה', region: 'sharon', lat: 32.474, lng: 34.976 },
  { city: 'כרכור', region: 'sharon', lat: 32.478, lng: 34.983 },
  { city: 'זכרון יעקב', region: 'sharon', lat: 32.573, lng: 34.951 },
  { city: 'בנימינה', region: 'sharon', lat: 32.517, lng: 34.949 },
  { city: 'אור עקיבא', region: 'sharon', lat: 32.508, lng: 34.918 },
  { city: 'טירה', region: 'sharon', lat: 32.234, lng: 34.951 },
  { city: 'טייבה', region: 'sharon', lat: 32.267, lng: 35.008 },
  { city: 'קלנסווה', region: 'sharon', lat: 32.285, lng: 34.982 },
  { city: 'ג׳לג׳וליה', region: 'center', lat: 32.152, lng: 34.955 },
  { city: 'כפר יונה', region: 'sharon', lat: 32.317, lng: 34.936 },
  { city: 'פרדסיה', region: 'sharon', lat: 32.301, lng: 34.912 },
  { city: 'חריש', region: 'sharon', lat: 32.463, lng: 35.048 },

  { city: 'יהוד', region: 'center', lat: 32.033, lng: 34.888 },
  { city: 'אור יהודה', region: 'center', lat: 32.03, lng: 34.855 },
  { city: 'קריית אונו', region: 'center', lat: 32.064, lng: 34.855 },
  { city: 'גני תקווה', region: 'center', lat: 32.064, lng: 34.874 },
  { city: 'סביון', region: 'center', lat: 32.048, lng: 34.876 },
  { city: 'שוהם', region: 'center', lat: 31.999, lng: 34.947 },
  { city: 'אלעד', region: 'center', lat: 32.05, lng: 34.951 },
  { city: 'רמת אפעל', region: 'center', lat: 32.05, lng: 34.83 },
  { city: 'הרצליה פיתוח', region: 'sharon', lat: 32.163, lng: 34.803 },
  { city: 'כפר שמריהו', region: 'sharon', lat: 32.187, lng: 34.822 },
  { city: 'קריית שדה התעופה', region: 'center', lat: 32.0, lng: 34.885 },
  { city: 'ראש פינה', region: 'north', lat: 32.968, lng: 35.542 },

  { city: 'גדרה', region: 'shfela', lat: 31.813, lng: 34.777 },
  { city: 'קריית עקרון', region: 'shfela', lat: 31.86, lng: 34.819 },
  { city: 'מזכרת בתיה', region: 'shfela', lat: 31.851, lng: 34.837 },
  { city: 'בית דגן', region: 'center', lat: 32.0, lng: 34.828 },
  { city: 'אזור', region: 'center', lat: 32.024, lng: 34.804 },
  { city: 'באר יעקב', region: 'shfela', lat: 31.943, lng: 34.836 },
  { city: 'שדרות', region: 'south', lat: 31.524, lng: 34.596 },
  { city: 'נתיבות', region: 'south', lat: 31.422, lng: 34.588 },
  { city: 'אופקים', region: 'south', lat: 31.313, lng: 34.62 },
  { city: 'רהט', region: 'south', lat: 31.393, lng: 34.754 },
  { city: 'ערד', region: 'south', lat: 31.259, lng: 35.213 },
  { city: 'מצפה רמון', region: 'south', lat: 30.61, lng: 34.801 },
  { city: 'ירוחם', region: 'south', lat: 30.988, lng: 34.929 },
  { city: 'שגב שלום', region: 'south', lat: 31.201, lng: 34.842 },
  { city: 'להבים', region: 'south', lat: 31.371, lng: 34.816 },
  { city: 'מיתר', region: 'south', lat: 31.325, lng: 34.936 },
  { city: 'קריית מלאכי', region: 'south', lat: 31.729, lng: 34.747 },
  { city: 'גן יבנה', region: 'south', lat: 31.786, lng: 34.706 },
  { city: 'בית שאן', region: 'north', lat: 32.497, lng: 35.5 },
  { city: 'אור הנר', region: 'south', lat: 31.55, lng: 34.62 },

  { city: 'טמרה', region: 'north', lat: 32.851, lng: 35.2 },
  { city: 'שפרעם', region: 'north', lat: 32.806, lng: 35.171 },
  { city: 'סחנין', region: 'north', lat: 32.865, lng: 35.298 },
  { city: 'עראבה', region: 'north', lat: 32.851, lng: 35.336 },
  { city: 'כפר כנא', region: 'north', lat: 32.747, lng: 35.342 },
  { city: 'נוף הגליל', region: 'north', lat: 32.706, lng: 35.318 },
  { city: 'מעלות תרשיחא', region: 'north', lat: 33.017, lng: 35.271 },
  { city: 'קריית שמונה', region: 'north', lat: 33.207, lng: 35.571 },
  { city: 'חצור הגלילית', region: 'north', lat: 32.981, lng: 35.543 },
  { city: 'יקנעם עילית', region: 'north', lat: 32.66, lng: 35.11 },
  { city: 'טירת הכרמל', region: 'haifa', lat: 32.76, lng: 34.972 },
  { city: 'רכסים', region: 'haifa', lat: 32.741, lng: 35.121 },
  { city: 'קריית טבעון', region: 'haifa', lat: 32.72, lng: 35.126 },
  { city: 'אום אל פחם', region: 'north', lat: 32.519, lng: 35.153 },
  { city: 'באקה אל גרביה', region: 'sharon', lat: 32.418, lng: 35.038 },
  { city: 'מגדל שמס', region: 'north', lat: 33.268, lng: 35.769 },
  { city: 'עפולה עילית', region: 'north', lat: 32.62, lng: 35.3 },
  { city: 'בנימינה גבעת עדה', region: 'sharon', lat: 32.514, lng: 34.951 },

  { city: 'מבשרת ציון', region: 'jerusalem', lat: 31.797, lng: 35.15 },
  { city: 'גבעת זאב', region: 'jerusalem', lat: 31.861, lng: 35.169 },
  { city: 'ביתר עילית', region: 'jerusalem', lat: 31.696, lng: 35.115 },
  { city: 'מודיעין עילית', region: 'jerusalem', lat: 31.932, lng: 35.043 },
  { city: 'אריאל', region: 'center', lat: 32.105, lng: 35.187 },
  { city: 'קריית ארבע', region: 'jerusalem', lat: 31.532, lng: 35.114 },
  { city: 'אפרת', region: 'jerusalem', lat: 31.655, lng: 35.152 },
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
