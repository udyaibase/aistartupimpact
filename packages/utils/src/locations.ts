import { CITY_DATABASE, type CityEntry } from './cities';

/**
 * Standard locations used everywhere a city or country is saved (jobs, startups, tools, admin forms).
 * Countries: the ISO 3166-1 list with common English names. Cities: the startup/tool city list (CITY_DATABASE)
 * plus cities admins add on the Cities page, passed in as `extra`. Pure and client-safe; the pickers and the
 * server checks both use it, so what can be picked is exactly what is accepted.
 */

export const COUNTRIES: readonly string[] = [
  'India',
  'Afghanistan', 'Åland Islands', 'Albania', 'Algeria', 'American Samoa', 'Andorra', 'Angola', 'Anguilla', 'Antarctica',
  'Antigua and Barbuda', 'Argentina', 'Armenia', 'Aruba', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain',
  'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bermuda', 'Bhutan', 'Bolivia',
  'Bosnia and Herzegovina', 'Botswana', 'Bouvet Island', 'Brazil', 'British Indian Ocean Territory',
  'British Virgin Islands', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon',
  'Canada', 'Caribbean Netherlands', 'Cayman Islands', 'Central African Republic', 'Chad', 'Chile', 'China',
  'Christmas Island', 'Cocos (Keeling) Islands', 'Colombia', 'Comoros', 'Congo', 'Cook Islands', 'Costa Rica', 'Croatia',
  'Cuba', 'Curaçao', 'Cyprus', 'Czechia', "Côte d'Ivoire", 'Democratic Republic of the Congo', 'Denmark', 'Djibouti',
  'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia',
  'Eswatini', 'Ethiopia', 'Falkland Islands', 'Faroe Islands', 'Fiji', 'Finland', 'France', 'French Guiana',
  'French Polynesia', 'French Southern Territories', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Gibraltar',
  'Greece', 'Greenland', 'Grenada', 'Guadeloupe', 'Guam', 'Guatemala', 'Guernsey', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Heard Island and McDonald Islands', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'Indonesia', 'Iran',
  'Iraq', 'Ireland', 'Isle of Man', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jersey', 'Jordan', 'Kazakhstan', 'Kenya',
  'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macao', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Marshall Islands', 'Martinique', 'Mauritania', 'Mauritius', 'Mayotte', 'Mexico', 'Micronesia', 'Moldova', 'Monaco',
  'Mongolia', 'Montenegro', 'Montserrat', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands',
  'New Caledonia', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'Niue', 'Norfolk Island', 'North Korea',
  'North Macedonia', 'Northern Mariana Islands', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Pitcairn Islands', 'Poland', 'Portugal', 'Puerto Rico',
  'Qatar', 'Romania', 'Russia', 'Rwanda', 'Réunion', 'Saint Barthélemy', 'Saint Helena', 'Saint Kitts and Nevis',
  'Saint Lucia', 'Saint Martin', 'Saint Pierre and Miquelon', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
  'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Sint Maarten', 'Slovakia', 'Slovenia',
  'Solomon Islands', 'Somalia', 'South Africa', 'South Georgia and the South Sandwich Islands', 'South Korea',
  'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Svalbard and Jan Mayen', 'Sweden', 'Switzerland', 'Syria',
  'São Tomé and Príncipe', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tokelau', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Turks and Caicos Islands', 'Tuvalu', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'US Minor Outlying Islands', 'US Virgin Islands',
  'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Wallis and Futuna', 'Western Sahara', 'Yemen',
  'Zambia', 'Zimbabwe',
];

/** Other spellings people (and older data) use, lower-case → standard name. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'United States', us: 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States', america: 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom', 'u.k.': 'United Kingdom', britain: 'United Kingdom', 'great britain': 'United Kingdom',
  england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom', 'northern ireland': 'United Kingdom',
  uae: 'United Arab Emirates', 'u.a.e.': 'United Arab Emirates', emirates: 'United Arab Emirates', 'arab emirates': 'United Arab Emirates',
  'czech republic': 'Czechia', korea: 'South Korea', 'republic of korea': 'South Korea', 'korea, republic of': 'South Korea',
  'russian federation': 'Russia', 'viet nam': 'Vietnam', burma: 'Myanmar', 'ivory coast': "Côte d'Ivoire",
  'cape verde': 'Cabo Verde', swaziland: 'Eswatini', macau: 'Macao', 'east timor': 'Timor-Leste', holland: 'Netherlands',
  'the netherlands': 'Netherlands', turkiye: 'Turkey', 'türkiye': 'Turkey', bharat: 'India', 'republic of india': 'India',
  'drc': 'Democratic Republic of the Congo', 'dr congo': 'Democratic Republic of the Congo', 'republic of the congo': 'Congo',
  'hong kong sar': 'Hong Kong', 'macedonia': 'North Macedonia', 'vatican': 'Vatican City', 'the bahamas': 'Bahamas', 'the gambia': 'Gambia',
};

const BY_LOWER = new Map(COUNTRIES.map((c) => [c.toLowerCase(), c]));

/** Any spelling → the standard country name, or null when it isn't a country. */
export function normalizeCountry(input: string | null | undefined): string | null {
  const k = String(input ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!k) return null;
  // hasOwn: input like "__proto__" must never read a built-in property.
  return BY_LOWER.get(k) ?? (Object.prototype.hasOwnProperty.call(COUNTRY_ALIASES, k) ? COUNTRY_ALIASES[k] : null);
}

// ── Cities ───────────────────────────────────────────────────────────────────

export interface PlaceCity { city: string; state: string | null; country: string; aliases: string[] }

const US_STATES = new Set(['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
  'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york',
  'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia', 'dc']);
const CA_PROVINCES = new Set(['ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick',
  'newfoundland and labrador', 'prince edward island']);
const AU_STATES = new Set(['new south wales', 'victoria', 'queensland', 'western australia', 'south australia', 'tasmania', 'australian capital territory']);
/** Regions elsewhere that the Cities page uses as the state. */
const REGION_COUNTRY: Record<string, string> = {
  'flemish brabant': 'Belgium', flanders: 'Belgium', wallonia: 'Belgium', utrecht: 'Netherlands', 'north holland': 'Netherlands',
  'south holland': 'Netherlands', ticino: 'Switzerland', zurich: 'Switzerland', geneva: 'Switzerland', vaud: 'Switzerland',
  gauteng: 'South Africa', 'western cape': 'South Africa', lancashire: 'United Kingdom', 'greater london': 'United Kingdom',
  'greater manchester': 'United Kingdom', hampshire: 'United Kingdom', kent: 'United Kingdom', surrey: 'United Kingdom', yorkshire: 'United Kingdom', normandy: 'France', 'île-de-france': 'France', 'ile-de-france': 'France', bavaria: 'Germany',
  'baden-württemberg': 'Germany', catalonia: 'Spain', 'community of madrid': 'Spain', lombardy: 'Italy', lazio: 'Italy',
};
const INDIAN_STATES = new Set(['andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat', 'haryana',
  'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
  'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal', 'delhi',
  'jammu and kashmir', 'ladakh', 'puducherry', 'chandigarh', 'andaman and nicobar islands', 'lakshadweep', 'dadra and nagar haveli and daman and diu']);

/**
 * Country of a city that was saved without one (the Cities page stores only name, state and coordinates):
 * the same city in the shared list, a state that names a country (Singapore, England), well-known state and
 * province names, then coordinates inside India. Null when it can't be told.
 */
export function inferCityCountry(e: { city?: string; state?: string | null; lat?: number | null; lng?: number | null }): string | null {
  const name = String(e.city ?? '').trim().toLowerCase();
  const known = [...new Set(CITY_DATABASE.filter((c) => c.city.toLowerCase() === name || c.aliases?.includes(name)).map((c) => normalizeCountry(c.country)))];
  if (known.length === 1 && known[0]) return known[0];
  const st = String(e.state ?? '').trim().toLowerCase();
  if (st) {
    const asCountry = normalizeCountry(st);
    if (asCountry) return asCountry;
    if (INDIAN_STATES.has(st)) return 'India';
    if (US_STATES.has(st)) return 'United States';
    if (CA_PROVINCES.has(st)) return 'Canada';
    if (AU_STATES.has(st)) return 'Australia';
    if (Object.prototype.hasOwnProperty.call(REGION_COUNTRY, st)) return REGION_COUNTRY[st];
  }
  const lat = Number(e.lat), lng = Number(e.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 6 && lat < 37.5 && lng > 68 && lng < 97.5) return 'India';
  return null;
}

const PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'of', 'and', 'on', 'upon', 'sur', 'am', 'an', 'der', 'del', 'da', 'do', 'di', 'y', 'en']);
/** Admin-typed names in title case: "sunnyvale" → "Sunnyvale", "St paul" → "St Paul", "mont-saint-aignan" → "Mont-Saint-Aignan". */
const tidyName = (s: string) =>
  s.split(/(\s+|-)/).map((w, i) => (/^\s+$|^-$/.test(w) || !w ? w : i > 0 && PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join('');

/**
 * The pickable cities: the shared list plus `extra` (admin-added), with standard country names, de-duplicated by
 * city + country (an admin entry replaces the built-in one). Sorted India first, then by name.
 */
export function cityList(extra: Partial<CityEntry>[] = []): PlaceCity[] {
  const map = new Map<string, PlaceCity>();
  for (const e of [...CITY_DATABASE, ...extra]) {
    const raw = String(e.city ?? '').trim();
    // Admin-added cities may come without a country; skip the ones whose country can't be told.
    const country = normalizeCountry(e.country) ?? inferCityCountry({ city: raw, state: e.state, lat: e.lat, lng: e.lng });
    if (!raw || !country) continue;
    const key = `${raw.toLowerCase()}|${country}`;
    const prev = map.get(key);
    map.set(key, {
      // The first spelling wins (the shared list's), so a lower-case admin entry doesn't rename a city.
      city: prev?.city ?? tidyName(raw), country, state: prev?.state || e.state?.trim() || null,
      aliases: [...new Set([...(prev?.aliases ?? []), ...(e.aliases ?? [])].map((a) => a.toLowerCase()))],
    });
  }
  return [...map.values()].sort((a, b) => (a.country === 'India' ? 0 : 1) - (b.country === 'India' ? 0 : 1) || a.city.localeCompare(b.city));
}

/** Cities matching what someone typed (name, alias or state), optionally only in one country. */
export function searchCityList(list: PlaceCity[], query: string, country?: string | null, limit = 30): PlaceCity[] {
  const q = query.trim().toLowerCase();
  const pool = country ? list.filter((c) => c.country === country) : list;
  if (!q) return pool.slice(0, limit);
  const scored: [number, PlaceCity][] = [];
  for (const c of pool) {
    const name = c.city.toLowerCase();
    const score = name === q ? 0 : c.aliases.includes(q) ? 1 : name.startsWith(q) ? 2 : c.aliases.some((a) => a.startsWith(q)) ? 3
      : name.includes(q) ? 4 : (c.state ?? '').toLowerCase().startsWith(q) ? 5 : -1;
    if (score >= 0) scored.push([score, c]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].city.localeCompare(b[1].city)).slice(0, limit).map(([, c]) => c);
}

/**
 * The standard city for a saved or submitted value: exact name or alias, ignoring case and anything after a comma
 * ("Bengaluru, KA, India" → Bengaluru). With `country`, only a city in that country matches. Null when unknown.
 */
export function matchCity(list: PlaceCity[], input: string | null | undefined, country?: string | null): PlaceCity | null {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;
  const head = raw.split(/[,;(/]| and | - /)[0].trim();
  for (const q of [raw, head]) {
    if (!q) continue;
    const hit = list.find((c) => (!country || c.country === country) && (c.city.toLowerCase() === q || c.aliases.includes(q)));
    if (hit) return hit;
  }
  return null;
}

/**
 * Older free-text values put other things in the city field: "Remote", "Remote, India", or a country ("United
 * Kingdom"). Moves those to where they belong before matching; anything else is returned unchanged.
 */
export function splitLegacyLocation(city: string, country: string): { city: string; country: string } {
  const c = city.trim().slice(0, 200);
  // "Remote", "Remote, India", "Remote - India": a prefix check and one trim, no backtracking on long input.
  if (/^remote(?![a-z0-9])/i.test(c)) {
    const rest = c.slice(6).replace(/^[\s,·:-]+/, '');
    return { city: '', country: country || (normalizeCountry(rest) ?? '') };
  }
  // A country typed as the city, unless it is also a city (Singapore, Hong Kong, Monaco).
  const asCountry = normalizeCountry(c);
  const alsoCity = CITY_DATABASE.some((e) => e.city.toLowerCase() === c.toLowerCase());
  if (asCountry && !alsoCity) return { city: '', country: country || asCountry };
  return { city: c, country };
}

/** "San Francisco, United States" for a headquarters, or whichever part is known. */
export const formatPlace = (city: string | null | undefined, country: string | null | undefined): string =>
  [city, country].filter(Boolean).join(', ');
