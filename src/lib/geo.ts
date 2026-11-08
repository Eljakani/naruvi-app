/**
 * Small gazetteer: country names and main cities per ISO code, lowercase and
 * accent-free. shortcut: covers the markets the app is used in; extend the
 * lists when a location shows up as "unknown" in goal checks.
 */
export const COUNTRIES: Record<string, { name: string; names: string[]; cities: string[] }> = {
  fr: { name: "France", names: ["france"], cities: ["paris", "ile-de-france", "lyon", "marseille", "toulouse", "lille", "bordeaux", "nantes", "nice", "rennes", "strasbourg", "montpellier", "grenoble", "sophia antipolis", "la defense", "saclay"] },
  ma: { name: "Morocco", names: ["morocco", "maroc"], cities: ["casablanca", "rabat", "marrakech", "marrakesh", "tanger", "tangier", "fes", "fez", "agadir", "kenitra", "meknes", "oujda", "tetouan", "mohammedia", "el jadida", "benguerir"] },
  tn: { name: "Tunisia", names: ["tunisia", "tunisie"], cities: ["tunis", "sfax", "sousse"] },
  dz: { name: "Algeria", names: ["algeria", "algerie"], cities: ["alger", "algiers", "oran", "constantine"] },
  gb: { name: "United Kingdom", names: ["united kingdom", "uk", "england", "scotland", "wales"], cities: ["london", "manchester", "edinburgh", "bristol", "birmingham", "leeds", "cambridge", "oxford"] },
  ie: { name: "Ireland", names: ["ireland", "irlande"], cities: ["dublin", "cork"] },
  de: { name: "Germany", names: ["germany", "deutschland", "allemagne"], cities: ["berlin", "munich", "munchen", "hamburg", "frankfurt", "cologne", "koln", "stuttgart"] },
  nl: { name: "Netherlands", names: ["netherlands", "pays-bas", "nederland"], cities: ["amsterdam", "rotterdam", "utrecht", "eindhoven", "the hague"] },
  be: { name: "Belgium", names: ["belgium", "belgique"], cities: ["brussels", "bruxelles", "antwerp", "ghent", "liege"] },
  lu: { name: "Luxembourg", names: ["luxembourg"], cities: [] },
  ch: { name: "Switzerland", names: ["switzerland", "suisse", "schweiz"], cities: ["zurich", "geneva", "geneve", "lausanne", "basel", "bern"] },
  es: { name: "Spain", names: ["spain", "espana", "espagne"], cities: ["madrid", "barcelona", "valencia", "sevilla", "malaga"] },
  pt: { name: "Portugal", names: ["portugal"], cities: ["lisbon", "lisbonne", "lisboa", "porto"] },
  it: { name: "Italy", names: ["italy", "italia", "italie"], cities: ["milan", "milano", "rome", "roma", "turin", "torino"] },
  at: { name: "Austria", names: ["austria", "autriche"], cities: ["vienna", "wien"] },
  pl: { name: "Poland", names: ["poland", "pologne"], cities: ["warsaw", "krakow", "wroclaw"] },
  ca: { name: "Canada", names: ["canada"], cities: ["toronto", "montreal", "vancouver", "ottawa", "quebec"] },
  us: { name: "United States", names: ["united states", "usa", "etats-unis"], cities: ["new york", "san francisco", "seattle", "boston", "austin", "chicago", "los angeles"] },
  ae: { name: "United Arab Emirates", names: ["united arab emirates", "uae", "emirats"], cities: ["dubai", "abu dhabi"] },
  au: { name: "Australia", names: ["australia"], cities: ["sydney", "melbourne", "brisbane"] },
  in: { name: "India", names: ["india", "inde"], cities: ["bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "pune"] },
  sg: { name: "Singapore", names: ["singapore", "singapour"], cities: [] },
}

/** Paris-area towns a "Paris" goal should accept. */
const METRO: Record<string, string[]> = {
  paris: ["ile-de-france", "idf", "la defense", "puteaux", "courbevoie", "boulogne", "issy", "nanterre", "saint-denis", "levallois", "neuilly", "montrouge", "velizy", "rueil", "massy", "saclay", "palaiseau", "clichy", "suresnes", "saint-ouen", "ivry", "vincennes", "guyancourt", "versailles", "cergy", "marne-la-vallee", "noisy"],
}

export const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
const has = (text: string, word: string) => new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`).test(text)

/** ISO code of the country a location names, or null. Never guesses. */
export function countryIn(location: string): string | null {
  const text = plain(location)
  if (!text) return null
  for (const [code, country] of Object.entries(COUNTRIES)) if ([...country.names, ...country.cities].some((word) => has(text, word))) return code
  return null
}

/** True when the place is a whole country ("France", "Maroc"). */
export const isCountry = (place: string) => Object.values(COUNTRIES).some((country) => country.names.includes(plain(place)))

/** Does `location` fall inside `place`? true / false / null when it can't tell. */
export function within(location: string, place: string): boolean | null {
  const where = plain(location)
  // "Paris, France" means Paris: the most specific part is the first one.
  const want = plain(place).split(",")[0].trim()
  place = want
  if (!where || !want) return null
  if (has(where, want) || (METRO[want] ?? []).some((town) => has(where, town))) return true
  const placeCountry = countryIn(place)
  const locationCountry = countryIn(location)
  if (isCountry(place)) return locationCountry ? locationCountry === placeCountry : null
  // A city goal: a different country is a clear no; another town in the same country is too, if we know the town.
  if (placeCountry && locationCountry) return false
  return null
}
