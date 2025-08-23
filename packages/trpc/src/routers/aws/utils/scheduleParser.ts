/**
 * Utility functions for parsing human-readable schedule expressions
 * into AWS EventBridge Scheduler cron/rate expressions
 */

export interface ParsedSchedule {
  expression: string;
  type: "rate" | "cron";
}

const TIME_PATTERNS = {
  // Time formats: "9am", "2:30pm", "14:30", "9:00"
  TIME_12H: /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i,
  TIME_24H: /^(\d{1,2}):(\d{2})$/,
  TIME_SIMPLE: /^(\d{1,2})$/,
};

const WEEKDAYS = {
  sunday: "SUN",
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sun: "SUN",
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
};

/**
 * Parses time string into 24-hour format
 * @param timeStr - Time string like "9am", "2:30pm", "14:30"
 * @returns Object with hour and minute
 */
function parseTime(timeStr: string): { hour: number; minute: number } {
  const time12h = timeStr.match(TIME_PATTERNS.TIME_12H);
  if (time12h && time12h[1] && time12h[3]) {
    let hour = parseInt(time12h[1], 10);
    const minute = parseInt(time12h[2] || "0", 10);
    const ampm = time12h[3].toLowerCase();

    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    return { hour, minute };
  }

  const time24h = timeStr.match(TIME_PATTERNS.TIME_24H);
  if (time24h && time24h[1] && time24h[2]) {
    return {
      hour: parseInt(time24h[1], 10),
      minute: parseInt(time24h[2], 10),
    };
  }

  const timeSimple = timeStr.match(TIME_PATTERNS.TIME_SIMPLE);
  if (timeSimple && timeSimple[1]) {
    return {
      hour: parseInt(timeSimple[1], 10),
      minute: 0,
    };
  }

  throw new Error(`Invalid time format: ${timeStr}`);
}

/**
 * Parses human-readable schedule expressions into AWS EventBridge format
 * @param expression - Human-readable expression or AWS cron/rate expression
 * @returns Parsed schedule object
 */
export function parseScheduleExpression(expression: string): ParsedSchedule {
  const expr = expression.toLowerCase().trim();

  // If already in AWS format, return as-is (with validation)
  if (expr.startsWith("rate(")) {
    if (!expr.match(/^rate\(\d+\s+(minute|minutes|hour|hours|day|days)\)$/)) {
      throw new Error(`Invalid rate expression: ${expression}`);
    }
    return { expression, type: "rate" };
  }

  if (expr.startsWith("cron(")) {
    // Basic cron validation (6 fields for EventBridge)
    const cronParts = expr.slice(5, -1).split(/\s+/);
    if (cronParts.length !== 6) {
      throw new Error(
        `Invalid cron expression: ${expression}. EventBridge cron requires 6 fields.`
      );
    }
    return { expression, type: "cron" };
  }

  // Parse human-readable expressions

  // "every X minutes/hours/days"
  const everyMatch = expr.match(
    /^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/
  );
  if (everyMatch && everyMatch[1] && everyMatch[2]) {
    const value = everyMatch[1];
    const unit = everyMatch[2].replace(/s$/, ""); // Remove plural 's'
    return {
      expression: `rate(${value} ${unit}${parseInt(value) > 1 ? "s" : ""})`,
      type: "rate",
    };
  }

  // "daily at [time]"
  const dailyMatch = expr.match(/^daily(?:\s+at\s+(.+))?$/);
  if (dailyMatch) {
    const timeStr = dailyMatch[1] || "9am";
    const { hour, minute } = parseTime(timeStr);
    return {
      expression: `cron(${minute} ${hour} * * ? *)`,
      type: "cron",
    };
  }

  // "weekly on [day] at [time]"
  const weeklyMatch = expr.match(/^weekly(?:\s+on\s+(\w+))?(?:\s+at\s+(.+))?$/);
  if (weeklyMatch) {
    const dayStr = weeklyMatch[1] || "monday";
    const timeStr = weeklyMatch[2] || "9am";

    const day = WEEKDAYS[dayStr as keyof typeof WEEKDAYS];
    if (!day) {
      throw new Error(`Invalid day of week: ${dayStr}`);
    }

    const { hour, minute } = parseTime(timeStr);
    return {
      expression: `cron(${minute} ${hour} ? * ${day} *)`,
      type: "cron",
    };
  }

  // "monthly on [date] at [time]"
  const monthlyMatch = expr.match(
    /^monthly(?:\s+on\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:\s+at\s+(.+))?$/
  );
  if (monthlyMatch) {
    const day = monthlyMatch[1] || "1";
    const timeStr = monthlyMatch[2] || "9am";

    const dayNum = parseInt(day, 10);
    if (dayNum < 1 || dayNum > 31) {
      throw new Error(`Invalid day of month: ${day}`);
    }

    const { hour, minute } = parseTime(timeStr);
    return {
      expression: `cron(${minute} ${hour} ${dayNum} * ? *)`,
      type: "cron",
    };
  }

  // "hourly at [minute]"
  const hourlyMatch = expr.match(
    /^hourly(?:\s+at\s+(?::(\d{1,2})|(\d{1,2})\s*(?:minutes?|mins?)))?$/
  );
  if (hourlyMatch) {
    const minute = parseInt(hourlyMatch[1] || hourlyMatch[2] || "0", 10);
    if (minute < 0 || minute > 59) {
      throw new Error(`Invalid minute: ${minute}`);
    }
    return {
      expression: `cron(${minute} * * * ? *)`,
      type: "cron",
    };
  }

  // "weekdays at [time]" (Monday-Friday)
  const weekdaysMatch = expr.match(/^weekdays(?:\s+at\s+(.+))?$/);
  if (weekdaysMatch) {
    const timeStr = weekdaysMatch[1] || "9am";
    const { hour, minute } = parseTime(timeStr);
    return {
      expression: `cron(${minute} ${hour} ? * MON-FRI *)`,
      type: "cron",
    };
  }

  // "weekends at [time]" (Saturday-Sunday)
  const weekendsMatch = expr.match(/^weekends(?:\s+at\s+(.+))?$/);
  if (weekendsMatch) {
    const timeStr = weekendsMatch[1] || "9am";
    const { hour, minute } = parseTime(timeStr);
    return {
      expression: `cron(${minute} ${hour} ? * SAT,SUN *)`,
      type: "cron",
    };
  }

  throw new Error(`Unsupported schedule expression: ${expression}`);
}

/**
 * Validates that a schedule expression is properly formatted
 * @param expression - Schedule expression to validate
 * @returns true if valid, throws error if invalid
 */
export function validateScheduleExpression(expression: string): boolean {
  try {
    parseScheduleExpression(expression);
    return true;
  } catch (error) {
    throw error;
  }
}
