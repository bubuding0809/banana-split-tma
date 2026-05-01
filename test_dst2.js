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
const tz = 'America/New_York';
// Monday Nov 2, 2026 at 00:30 EST (UTC-5) -> Mon Nov 2 05:30 UTC
const now = new Date('2026-11-02T05:30:00Z');
console.log('Now local:', ymdInTimezone(now, tz));
const yesterday = new Date(now.getTime() - 86_400_000); // 24h ago
// 24h ago = Sun Nov 1 05:30 UTC
// Nov 1 05:30 UTC is UTC-5 (since transition was at 06:00 UTC? wait)
// Nov 1 2:00 EDT = 06:00 UTC. At 06:00 UTC it becomes 01:00 EST.
// So Nov 1 05:30 UTC is before transition!
// Therefore it's UTC-4.
// Nov 1 05:30 UTC - 4 hours = Nov 1 01:30 EDT.
console.log('Yesterday (24h ago) local:', ymdInTimezone(yesterday, tz));
