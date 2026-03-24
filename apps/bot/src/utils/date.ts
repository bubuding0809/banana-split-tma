export type PeriodKey =
  | "today"
  | "current_month"
  | "last_month"
  | "last_30_days"
  | "last_12_months"
  | "all_time";

export function getPeriodRange(period: PeriodKey | string): {
  startDt: Date;
  endDt: Date | null;
} {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let startDt: Date;
  let endDt: Date | null = null;

  switch (period) {
    case "today":
      startDt = todayStart;
      endDt = new Date(todayStart);
      endDt.setDate(endDt.getDate() + 1);
      break;
    case "current_month":
      startDt = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
      endDt = null;
      break;
    case "last_month":
      startDt = new Date(
        todayStart.getFullYear(),
        todayStart.getMonth() - 1,
        1
      );
      endDt = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
      break;
    case "last_30_days":
      startDt = new Date(todayStart);
      startDt.setDate(startDt.getDate() - 30);
      endDt = null;
      break;
    case "last_12_months":
      startDt = new Date(todayStart);
      startDt.setFullYear(startDt.getFullYear() - 1);
      endDt = null;
      break;
    case "all_time":
    default:
      startDt = new Date(0);
      endDt = null;
      break;
  }

  return { startDt, endDt };
}
