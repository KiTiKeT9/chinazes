// Best-effort country detection from server name/host.
// Free pool configs commonly include flag emoji or 2-letter codes in the name
// (e.g. "🇺🇸 US-1", "[DE] Frankfurt", "Russia-Moscow", "JP_Tokyo").

const COUNTRY_NAMES = {
  US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil',
  GB: 'United Kingdom', UK: 'United Kingdom', DE: 'Germany', FR: 'France',
  NL: 'Netherlands', RU: 'Russia', UA: 'Ukraine', PL: 'Poland',
  TR: 'Turkey', IT: 'Italy', ES: 'Spain', FI: 'Finland',
  SE: 'Sweden', NO: 'Norway', CH: 'Switzerland', AT: 'Austria',
  RO: 'Romania', LV: 'Latvia', LT: 'Lithuania', EE: 'Estonia',
  CZ: 'Czechia', BG: 'Bulgaria', GR: 'Greece', IE: 'Ireland',
  PT: 'Portugal', BE: 'Belgium', DK: 'Denmark', LU: 'Luxembourg',
  HU: 'Hungary', RS: 'Serbia', HR: 'Croatia', IS: 'Iceland',
  JP: 'Japan', KR: 'South Korea', CN: 'China', HK: 'Hong Kong',
  TW: 'Taiwan', SG: 'Singapore', MY: 'Malaysia', TH: 'Thailand',
  VN: 'Vietnam', PH: 'Philippines', ID: 'Indonesia', IN: 'India',
  PK: 'Pakistan', BD: 'Bangladesh', AE: 'UAE', SA: 'Saudi Arabia',
  IL: 'Israel', IR: 'Iran', EG: 'Egypt', ZA: 'South Africa',
  AU: 'Australia', NZ: 'New Zealand', AR: 'Argentina', CL: 'Chile',
  KZ: 'Kazakhstan', GE: 'Georgia', AM: 'Armenia', AZ: 'Azerbaijan',
};

// Common keyword → country code mapping (city/country names that appear in server names)
const KEYWORDS = {
  // English
  'united states': 'US', 'usa': 'US', 'america': 'US',
  'canada': 'CA', 'mexico': 'MX', 'brazil': 'BR',
  'united kingdom': 'GB', 'britain': 'GB', 'england': 'GB', 'london': 'GB',
  'germany': 'DE', 'frankfurt': 'DE', 'berlin': 'DE', 'munich': 'DE',
  'france': 'FR', 'paris': 'FR',
  'netherlands': 'NL', 'amsterdam': 'NL', 'holland': 'NL',
  'russia': 'RU', 'moscow': 'RU', 'россия': 'RU', 'москва': 'RU',
  'ukraine': 'UA', 'kiev': 'UA',
  'poland': 'PL', 'warsaw': 'PL',
  'turkey': 'TR', 'istanbul': 'TR',
  'italy': 'IT', 'milan': 'IT', 'rome': 'IT',
  'spain': 'ES', 'madrid': 'ES',
  'finland': 'FI', 'helsinki': 'FI',
  'sweden': 'SE', 'stockholm': 'SE',
  'norway': 'NO', 'oslo': 'NO',
  'switzerland': 'CH', 'zurich': 'CH',
  'japan': 'JP', 'tokyo': 'JP', 'osaka': 'JP',
  'korea': 'KR', 'seoul': 'KR',
  'china': 'CN', 'shanghai': 'CN', 'beijing': 'CN',
  'hong kong': 'HK', 'hongkong': 'HK',
  'taiwan': 'TW', 'taipei': 'TW',
  'singapore': 'SG',
  'malaysia': 'MY', 'kuala lumpur': 'MY',
  'thailand': 'TH', 'bangkok': 'TH',
  'vietnam': 'VN',
  'philippines': 'PH', 'manila': 'PH',
  'indonesia': 'ID', 'jakarta': 'ID',
  'india': 'IN', 'mumbai': 'IN', 'delhi': 'IN',
  'australia': 'AU', 'sydney': 'AU',
  'kazakhstan': 'KZ', 'almaty': 'KZ',
};

// Convert ISO 3166-1 alpha-2 code to flag emoji.
function codeToFlag(code) {
  if (!code || code.length !== 2) return '';
  const A = 0x1F1E6;
  const up = code.toUpperCase();
  return String.fromCodePoint(A + (up.charCodeAt(0) - 65), A + (up.charCodeAt(1) - 65));
}

// Already a flag emoji in the string? Return [flag, codeIfDetectable].
function extractFlagEmoji(s) {
  // Regional indicator symbols range U+1F1E6..U+1F1FF
  const m = s.match(/[\u{1F1E6}-\u{1F1FF}][\u{1F1E6}-\u{1F1FF}]/u);
  if (!m) return null;
  const flag = m[0];
  const cp1 = flag.codePointAt(0) - 0x1F1E6 + 65;
  const cp2 = flag.codePointAt(2) - 0x1F1E6 + 65;
  const code = String.fromCharCode(cp1, cp2);
  return { flag, code };
}

// Main: figure out country code + flag from a server's name & host.
export function detectCountry(name = '', host = '') {
  // 1. Flag emoji already in name
  const fe = extractFlagEmoji(name);
  if (fe) return { code: fe.code, flag: fe.flag, country: COUNTRY_NAMES[fe.code] || fe.code };

  // 2. [XX] or _XX_ or -XX- pattern (2-letter code surrounded by separators)
  const codeMatch = name.match(/[\[(_\-\s|]([A-Z]{2})[\])_\-\s|]/);
  if (codeMatch && COUNTRY_NAMES[codeMatch[1]]) {
    const code = codeMatch[1] === 'UK' ? 'GB' : codeMatch[1];
    return { code, flag: codeToFlag(code), country: COUNTRY_NAMES[code] };
  }

  // 3. Keyword match in name
  const lower = name.toLowerCase();
  for (const [kw, cc] of Object.entries(KEYWORDS)) {
    if (lower.includes(kw)) return { code: cc, flag: codeToFlag(cc), country: COUNTRY_NAMES[cc] || cc };
  }

  // 4. TLD heuristic from host (e.g. .jp, .de). Only for a few obvious TLDs.
  const hostLower = host.toLowerCase();
  const tldMatch = hostLower.match(/\.([a-z]{2})$/);
  if (tldMatch) {
    const code = tldMatch[1].toUpperCase();
    if (COUNTRY_NAMES[code] && code !== 'IO' && code !== 'CO' && code !== 'ME') {
      return { code, flag: codeToFlag(code), country: COUNTRY_NAMES[code] };
    }
  }

  return { code: '', flag: '🌐', country: 'Unknown' };
}
