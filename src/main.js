import { Actor, log } from 'apify';
import { getActiveTsunamiAlerts, normalizeInput } from './nws.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const TSUNAMI_CHECK_EVENT = 'tsunami-check';

const { events, areas, problems, nothingValid } = normalizeInput(input);
for (const problem of problems) log.warning(problem);

const checkedAt = new Date().toISOString();
const where = areas.length > 0 ? areas.join(', ') : 'all US coasts';
const PLURALS = { 'Tsunami Warning': 'warnings', 'Tsunami Watch': 'watches', 'Tsunami Advisory': 'advisories' };
const kinds = events.map((e) => PLURALS[e]);
const kindsText = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} or ${kinds.at(-1)}` : kinds[0];

if (nothingValid) {
    // Nothing usable to check: say why in the output, and don't charge for a check that never ran.
    await Actor.pushData({
        status: 'input_error',
        headline: "Couldn't run the check",
        description: problems.join(' '),
        checkedAt,
    });
    log.info('No valid alert types or areas, so nothing was checked and nothing was charged.');
    await Actor.exit();
} else {
    const alerts = await getActiveTsunamiAlerts({ events, areas });

    for (const alert of alerts) {
        await Actor.pushData({ ...alert, checkedAt });
    }

    // Most of the time there's no tsunami alert anywhere. Say so in the output instead of leaving
    // an empty table that looks like the tool didn't work.
    if (alerts.length === 0) {
        await Actor.pushData({
            status: 'no_active_alerts',
            event: null,
            headline: `No active tsunami ${kindsText} for ${where}`,
            description: `The National Weather Service had no active tsunami ${kindsText} for ${where} when checked at ${checkedAt}.`
                + (problems.length ? ` Note: ${problems.join(' ')}` : ''),
            areaDesc: where,
            checkedAt,
        });
    }

    await Actor.charge({ eventName: TSUNAMI_CHECK_EVENT });

    log.info(`Found ${alerts.length} active tsunami alert(s)`, { areas, events });

    await Actor.exit();
}
