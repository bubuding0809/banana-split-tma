function ymdInTimezone(instant, timezone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t) =>
    Number(parts.find((p) => p.type === t)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const tz = 'America/New_York'; // DST transition is at 2AM on Sunday, Mar 8, 2026. Clocks go forward to 3AM.
// Sunday Mar 8 is 23 hours long.
// So let's take Monday Mar 9, 2026 at 00:30 AM local time.
// Mon Mar 9 2026 00:30 EDT (UTC-4) = Mon Mar 9 04:30 UTC.
const now = new Date('2026-03-09T04:30:00Z'); 
console.log('Now local:', ymdInTimezone(now, tz));

const yesterday = new Date(now.getTime() - 86_400_000); // subtract 24 hours
console.log('Yesterday (24h ago) local:', ymdInTimezone(yesterday, tz));

// let's do fall back: Sunday Nov 1, 2026. 2AM goes back to 1AM. 25 hour day.
// Take Sat Oct 31, 2026 23:30 local time (EDT, UTC-4) -> Sun Nov 1 03:30 UTC
const fallBackEve = new Date('2026-11-01T03:30:00Z');
console.log('FallBackEve local:', ymdInTimezone(fallBackEve, tz));
const fallBackTomorrow = new Date(fallBackEve.getTime() + 86_400_000); // add 24 hours
console.log('FallBackTomorrow (24h later) local:', ymdInTimezone(fallBackTomorrow, tz));
