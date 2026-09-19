import { Actor, log } from 'apify';
import { getActiveTsunamiAlerts } from './nws.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { areas = [], severities = [] } = input;

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const TSUNAMI_CHECK_EVENT = 'tsunami-check';

const alerts = await getActiveTsunamiAlerts({ areas, severities });

for (const alert of alerts) {
    await Actor.pushData(alert);
}

await Actor.charge({ eventName: TSUNAMI_CHECK_EVENT });

log.info(`Found ${alerts.length} active tsunami alert(s)`, { areas, severities });

await Actor.exit();
