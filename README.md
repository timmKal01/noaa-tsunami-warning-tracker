# Tsunami Warning Tracker: Active NOAA Alerts by Area

Check for active tsunami warnings, watches, and advisories from the
official NOAA/National Weather Service alerts feed. Optionally scope to
specific coastal states so you only see what matters for your operations.

## Output (sample)

```json
{
  "id": "urn:oid:2.49.0.1.840.0.abc123",
  "event": "Tsunami Warning",
  "severity": "Extreme",
  "certainty": "Observed",
  "urgency": "Immediate",
  "headline": "Tsunami Warning issued for the coastal areas of California",
  "description": "A tsunami warning is in effect...",
  "instruction": "Move to high ground or inland immediately.",
  "areaDesc": "Coastal Los Angeles County",
  "senderName": "NWS Los Angeles CA",
  "effective": "2026-09-19T08:00:00-07:00",
  "expires": "2026-09-19T14:00:00-07:00",
  "nwsUrl": "https://api.weather.gov/alerts/urn:oid:..."
}
```

No active alerts returns an empty result, still billed once for the check.

## Who this is for

- **Coastal emergency management teams** running a standing check instead of manually watching NOAA's site.
- **Ports and shipping operations** deciding whether to hold or divert vessels.
- **Coastal property and insurance teams** who need an automated trigger for a wider alert process.

## Input

| Field | Type | Description |
|---|---|---|
| `areas` | array | Two-letter US state/territory codes, e.g. `["CA", "HI", "AK"]`. Leave empty for all coastal areas nationwide. |
| `severities` | array | Limit to `"Tsunami Warning"`, `"Tsunami Watch"`, `"Tsunami Advisory"`. Leave empty for all three. |

```json
{
  "areas": ["CA", "HI"]
}
```

## How it works

One direct call to the official NWS/NOAA alerts API (`api.weather.gov`),
the same data source and reliability pattern already proven in
[US Weather Tracker](https://github.com/timmKal01/us-weather-tracker) and
[Field Operations Risk Briefing](https://github.com/timmKal01/field-operations-risk-briefing)
in this portfolio: automatic retries on transient failures, a per-attempt
timeout so a slow response cannot hang the run. No key, no proxy, no
scraping, public-domain US government data.

## Related products

- [US Weather Tracker](https://github.com/timmKal01/us-weather-tracker): everyday NWS forecasts and alerts for a specific location, not scoped to tsunamis
- [Earthquake Alert](https://github.com/timmKal01/earthquake-alert): the seismic event that most often triggers a tsunami warning in the first place
- [Active Hurricane Tracker](https://github.com/timmKal01/active-hurricane-tracker) / [Volcano Alert Tracker](https://github.com/timmKal01/volcano-alert-tracker): the rest of this portfolio's natural hazard family
