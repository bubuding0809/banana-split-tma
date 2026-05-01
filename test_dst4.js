const target = { year: 2026, month: 3, day: 8 };
const today = { year: 2026, month: 3, day: 9 };

const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
const targetDate = new Date(Date.UTC(target.year, target.month - 1, target.day));
const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86_400_000);

console.log('diffDays:', diffDays);
