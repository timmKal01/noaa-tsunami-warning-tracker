// NWS explicitly requires a descriptive User-Agent identifying the calling application.
const USER_AGENT = '(noaa-tsunami-warning-tracker Apify actor, tsunami-tracker-admin@example.com)';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const TSUNAMI_EVENTS = ['Tsunami Warning', 'Tsunami Watch', 'Tsunami Advisory'];

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

export async function getActiveTsunamiAlerts({ areas = [], severities = [] } = {}) {
    const url = new URL('https://api.weather.gov/alerts/active');
    const eventsToQuery = severities.length > 0
        ? severities.filter((s) => TSUNAMI_EVENTS.includes(s))
        : TSUNAMI_EVENTS;
    for (const event of eventsToQuery) url.searchParams.append('event', event);
    for (const area of areas) url.searchParams.append('area', area.toUpperCase());

    const data = await fetchJson(url);

    return (data.features ?? []).map((f) => ({
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
