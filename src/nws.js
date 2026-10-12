// NWS explicitly requires a descriptive User-Agent identifying the calling application, with a way to contact its owner.
const USER_AGENT = '(noaa-tsunami-warning-tracker, https://github.com/timmKal01/noaa-tsunami-warning-tracker)';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const TSUNAMI_EVENTS = ['Tsunami Warning', 'Tsunami Watch', 'Tsunami Advisory'];

/** Full state and territory names people type instead of the two-letter code NWS expects. */
const AREA_NAMES = {
    alabama: 'AL', alaska: 'AK', 'american samoa': 'AS', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA',
    guam: 'GU', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
    louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
    mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
    'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
    'northern mariana islands': 'MP', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
    'puerto rico': 'PR', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN',
    texas: 'TX', utah: 'UT', vermont: 'VT', 'virgin islands': 'VI', 'us virgin islands': 'VI', virginia: 'VA',
    washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

/** api.weather.gov has no documented SLA and is known to slow down or 5xx under load; retries and a per-attempt timeout keep one bad request from failing (or hanging) the whole run. */
async function fetchJson(url) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' }, signal: controller.signal });
        } catch (err) {
            lastError = err.name === 'AbortError' ? new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`) : err;
            if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
            continue;
        } finally {
            clearTimeout(timeoutId);
        }
        if (res.ok) return res.json();
        if (!TRANSIENT_STATUSES.has(res.status)) {
            throw new Error(`Request failed: ${url} (${res.status})`);
        }
        lastError = new Error(`Request failed: ${url} (${res.status})`);
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
}

/**
 * Turns the input into the exact values NWS expects, and lists anything it couldn't understand.
 * Alert types match case-insensitively, in singular or plural, and accept the short forms "warning", "watch" and "advisory".
 * Before 2026-10-12, an alert type typed in lowercase was silently dropped, which removed the event
 * filter entirely and returned every active NWS alert (214 weather alerts in one test) as if they
 * were tsunami alerts. A full state name ("California") made NWS answer 400 and failed the run.
 */
export function normalizeInput({ areas = [], severities = [] } = {}) {
    const problems = [];

    const events = [];
    for (const raw of severities ?? []) {
        const key = String(raw).trim().toLowerCase().replace(/^tsunami\s+/, '').replace(/ies$/, 'y').replace(/(watch)es$/, '$1').replace(/s$/, '');
        const event = TSUNAMI_EVENTS.find((e) => e.toLowerCase() === `tsunami ${key}`);
        if (event) {
            if (!events.includes(event)) events.push(event);
        } else if (key) {
            problems.push(`Alert type "${raw}" isn't one of ${TSUNAMI_EVENTS.map((e) => `"${e}"`).join(', ')}.`);
        }
    }

    const codes = [];
    for (const raw of areas ?? []) {
        const text = String(raw).trim();
        if (!text) continue;
        const code = /^[a-z]{2}$/i.test(text) ? text.toUpperCase() : AREA_NAMES[text.toLowerCase()];
        if (code) {
            if (!codes.includes(code)) codes.push(code);
        } else {
            problems.push(`Area "${raw}" isn't a US state or territory. Use a two-letter code like "CA" or "HI".`);
        }
    }

    const askedForTypes = (severities ?? []).some((s) => String(s).trim());
    const askedForAreas = (areas ?? []).some((a) => String(a).trim());
    return {
        // Empty means "all three", but only when the user didn't ask for anything; a list of only
        // unrecognised types must never widen the search.
        events: events.length > 0 ? events : (askedForTypes ? [] : TSUNAMI_EVENTS),
        areas: codes,
        problems,
        nothingValid: (askedForTypes && events.length === 0) || (askedForAreas && codes.length === 0),
    };
}

export async function getActiveTsunamiAlerts({ events, areas }) {
    const url = new URL('https://api.weather.gov/alerts/active');
    for (const event of events) url.searchParams.append('event', event);
    for (const area of areas) url.searchParams.append('area', area);

    const data = await fetchJson(url);

    return (data.features ?? [])
        // A second guard, so nothing but tsunami alerts can ever reach the output.
        .filter((f) => TSUNAMI_EVENTS.includes(f.properties?.event))
        .map((f) => ({
            status: 'active_alert',
            id: f.properties.id ?? null,
            event: f.properties.event ?? null,
            severity: f.properties.severity ?? null,
            certainty: f.properties.certainty ?? null,
            urgency: f.properties.urgency ?? null,
            headline: f.properties.headline ?? null,
            description: f.properties.description ?? null,
            instruction: f.properties.instruction ?? null,
            areaDesc: f.properties.areaDesc ?? null,
            senderName: f.properties.senderName ?? null,
            effective: f.properties.effective ?? null,
            expires: f.properties.expires ?? null,
            nwsUrl: f.properties['@id'] ?? null,
        }));
}
