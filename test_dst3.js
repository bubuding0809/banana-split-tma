function getRelativeDay(todayYMD, offsetDays) {
  // Use Date.UTC which handles month/day overflow gracefully
  const d = new Date(Date.UTC(todayYMD.year, todayYMD.month - 1, todayYMD.day + offsetDays, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  };
}

const today = { year: 2026, month: 3, day: 9 };
console.log('Today:', today);
console.log('Yesterday:', getRelativeDay(today, -1));
console.log('Tomorrow:', getRelativeDay(today, 1));
