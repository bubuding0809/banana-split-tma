import { z } from "zod";

/**
 * Currency API utilities for fetching exchange rates from fxratesapi.com
 */

// Environment configuration
const FXRATES_API_URL =
  process.env.FXRATES_API_URL || "https://api.fxratesapi.com";
const FXRATES_API_KEY = process.env.FXRATES_API_KEY;
const CURRENCY_CACHE_TTL_SECONDS = parseInt(
  process.env.CURRENCY_CACHE_TTL || "3600",
  10
);

// Response schema validation
const fxRatesApiResponseSchema = z.object({
  success: z.boolean(),
  terms: z.string(),
  privacy: z.string(),
  timestamp: z.number(),
  date: z.string(),
  base: z.string(),
  rates: z.record(z.string(), z.number()),
});

export type FxRatesApiResponse = z.infer<typeof fxRatesApiResponseSchema>;

/**
 * Fetches latest exchange rates from fxratesapi.com
 * @param baseCurrency - Base currency (defaults to USD)
 * @returns Promise with exchange rates data
 */
export async function fetchExchangeRates(
  baseCurrency: string = "USD"
): Promise<FxRatesApiResponse> {
  const url = new URL(`${FXRATES_API_URL}/latest`);
  url.searchParams.set("base", baseCurrency);

  if (FXRATES_API_KEY) {
    url.searchParams.set("access_key", FXRATES_API_KEY);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BananaSplitTMA/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Validate the response structure
    const validatedData = fxRatesApiResponseSchema.parse(data);

    if (!validatedData.success) {
      throw new Error("API returned unsuccessful response");
    }

    return validatedData;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid API response format: ${error.message}`);
    }

    throw new Error(
      `Failed to fetch exchange rates: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Gets a specific exchange rate from the rates object
 * @param rates - Rates object from API response
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @returns Exchange rate or null if not found
 */
export function getExchangeRate(
  rates: Record<string, number>,
  fromCurrency: string,
  toCurrency: string
): number | null {
  // If converting from base currency (USD) to target
  if (fromCurrency === "USD") {
    return rates[toCurrency] || null;
  }

  // If converting to base currency (USD) from source
  if (toCurrency === "USD") {
    const rate = rates[fromCurrency];
    return rate ? 1 / rate : null;
  }

  // Cross-currency conversion (via USD)
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];

  if (fromRate && toRate) {
    return toRate / fromRate;
  }

  return null;
}

/**
 * Comprehensive currency database with detailed information
 */
export const CURRENCY_DATABASE = {
  AED: {
    code: "AED",
    name: "United Arab Emirates Dirham",
    decimal_digits: 2,
    name_plural: "UAE dirhams",
    rounding: 0,
    symbol: "AED",
    symbol_native: "د.إ",
  },
  AUD: {
    code: "AUD",
    name: "Australian Dollar",
    decimal_digits: 2,
    name_plural: "Australian dollars",
    rounding: 0,
    symbol: "AU$",
    symbol_native: "$",
  },
  BRL: {
    code: "BRL",
    name: "Brazilian Real",
    decimal_digits: 2,
    name_plural: "Brazilian reals",
    rounding: 0,
    symbol: "R$",
    symbol_native: "R$",
  },
  CAD: {
    code: "CAD",
    name: "Canadian Dollar",
    decimal_digits: 2,
    name_plural: "Canadian dollars",
    rounding: 0,
    symbol: "CA$",
    symbol_native: "$",
  },
  CHF: {
    code: "CHF",
    name: "Swiss Franc",
    decimal_digits: 2,
    name_plural: "Swiss francs",
    rounding: 0,
    symbol: "CHF",
    symbol_native: "CHF",
  },
  CNY: {
    code: "CNY",
    name: "Chinese Yuan",
    decimal_digits: 2,
    name_plural: "Chinese yuan",
    rounding: 0,
    symbol: "CN¥",
    symbol_native: "CN¥",
  },
  DKK: {
    code: "DKK",
    name: "Danish Krone",
    decimal_digits: 2,
    name_plural: "Danish kroner",
    rounding: 0,
    symbol: "Dkr",
    symbol_native: "kr",
  },
  EUR: {
    code: "EUR",
    name: "Euro",
    decimal_digits: 2,
    name_plural: "Euros",
    rounding: 0,
    symbol: "€",
    symbol_native: "€",
  },
  GBP: {
    code: "GBP",
    name: "British Pound Sterling",
    decimal_digits: 2,
    name_plural: "British pounds sterling",
    rounding: 0,
    symbol: "£",
    symbol_native: "£",
  },
  HKD: {
    code: "HKD",
    name: "Hong Kong Dollar",
    decimal_digits: 2,
    name_plural: "Hong Kong dollars",
    rounding: 0,
    symbol: "HK$",
    symbol_native: "$",
  },
  IDR: {
    code: "IDR",
    name: "Indonesian Rupiah",
    decimal_digits: 0,
    name_plural: "Indonesian rupiahs",
    rounding: 0,
    symbol: "Rp",
    symbol_native: "Rp",
  },
  INR: {
    code: "INR",
    name: "Indian Rupee",
    decimal_digits: 2,
    name_plural: "Indian rupees",
    rounding: 0,
    symbol: "Rs",
    symbol_native: "টকা",
  },
  JPY: {
    code: "JPY",
    name: "Japanese Yen",
    decimal_digits: 0,
    name_plural: "Japanese yen",
    rounding: 0,
    symbol: "¥",
    symbol_native: "￥",
  },
  KRW: {
    code: "KRW",
    name: "South Korean Won",
    decimal_digits: 0,
    name_plural: "South Korean won",
    rounding: 0,
    symbol: "₩",
    symbol_native: "₩",
  },
  MXN: {
    code: "MXN",
    name: "Mexican Peso",
    decimal_digits: 2,
    name_plural: "Mexican pesos",
    rounding: 0,
    symbol: "MX$",
    symbol_native: "$",
  },
  MYR: {
    code: "MYR",
    name: "Malaysian Ringgit",
    decimal_digits: 2,
    name_plural: "Malaysian ringgits",
    rounding: 0,
    symbol: "RM",
    symbol_native: "RM",
  },
  NOK: {
    code: "NOK",
    name: "Norwegian Krone",
    decimal_digits: 2,
    name_plural: "Norwegian kroner",
    rounding: 0,
    symbol: "Nkr",
    symbol_native: "kr",
  },
  NZD: {
    code: "NZD",
    name: "New Zealand Dollar",
    decimal_digits: 2,
    name_plural: "New Zealand dollars",
    rounding: 0,
    symbol: "NZ$",
    symbol_native: "$",
  },
  PHP: {
    code: "PHP",
    name: "Philippine Peso",
    decimal_digits: 2,
    name_plural: "Philippine pesos",
    rounding: 0,
    symbol: "₱",
    symbol_native: "₱",
  },
  PLN: {
    code: "PLN",
    name: "Polish Zloty",
    decimal_digits: 2,
    name_plural: "Polish zlotys",
    rounding: 0,
    symbol: "zł",
    symbol_native: "zł",
  },
  RUB: {
    code: "RUB",
    name: "Russian Ruble",
    decimal_digits: 2,
    name_plural: "Russian rubles",
    rounding: 0,
    symbol: "RUB",
    symbol_native: "руб.",
  },
  SAR: {
    code: "SAR",
    name: "Saudi Riyal",
    decimal_digits: 2,
    name_plural: "Saudi riyals",
    rounding: 0,
    symbol: "SR",
    symbol_native: "ر.س.‏",
  },
  SEK: {
    code: "SEK",
    name: "Swedish Krona",
    decimal_digits: 2,
    name_plural: "Swedish kronor",
    rounding: 0,
    symbol: "Skr",
    symbol_native: "kr",
  },
  SGD: {
    code: "SGD",
    name: "Singapore Dollar",
    decimal_digits: 2,
    name_plural: "Singapore dollars",
    rounding: 0,
    symbol: "S$",
    symbol_native: "$",
  },
  THB: {
    code: "THB",
    name: "Thai Baht",
    decimal_digits: 2,
    name_plural: "Thai baht",
    rounding: 0,
    symbol: "฿",
    symbol_native: "฿",
  },
  TRY: {
    code: "TRY",
    name: "Turkish Lira",
    decimal_digits: 2,
    name_plural: "Turkish Lira",
    rounding: 0,
    symbol: "TL",
    symbol_native: "TL",
  },
  TWD: {
    code: "TWD",
    name: "New Taiwan Dollar",
    decimal_digits: 2,
    name_plural: "New Taiwan dollars",
    rounding: 0,
    symbol: "NT$",
    symbol_native: "NT$",
  },
  USD: {
    code: "USD",
    name: "US Dollar",
    decimal_digits: 2,
    name_plural: "US dollars",
    rounding: 0,
    symbol: "$",
    symbol_native: "$",
  },
  VND: {
    code: "VND",
    name: "Vietnamese Dong",
    decimal_digits: 0,
    name_plural: "Vietnamese dong",
    rounding: 0,
    symbol: "₫",
    symbol_native: "₫",
  },
  ZAR: {
    code: "ZAR",
    name: "South African Rand",
    decimal_digits: 2,
    name_plural: "South African rand",
    rounding: 0,
    symbol: "R",
    symbol_native: "R",
  },
} as const;

export type CurrencyInfo =
  (typeof CURRENCY_DATABASE)[keyof typeof CURRENCY_DATABASE];

/**
 * Gets the currency symbol for a given currency code
 * @param currencyCode - ISO currency code (e.g., "USD", "EUR")
 * @returns Currency symbol or the code itself if not found
 */
export function getCurrencySymbol(currencyCode: string): string {
  const currency =
    CURRENCY_DATABASE[
      currencyCode.toUpperCase() as keyof typeof CURRENCY_DATABASE
    ];
  return currency?.symbol || currencyCode;
}

/**
 * Gets comprehensive currency information
 * @param currencyCode - ISO currency code (e.g., "USD", "EUR")
 * @returns Currency information object or null if not found
 */
export function getCurrencyInfo(currencyCode: string): CurrencyInfo | null {
  return (
    CURRENCY_DATABASE[
      currencyCode.toUpperCase() as keyof typeof CURRENCY_DATABASE
    ] || null
  );
}

/**
 * Gets the decimal digits for a currency
 * @param currencyCode - ISO currency code (e.g., "USD", "EUR")
 * @returns Number of decimal digits for the currency
 */
export function getCurrencyDecimalDigits(currencyCode: string): number {
  const currency =
    CURRENCY_DATABASE[
      currencyCode.toUpperCase() as keyof typeof CURRENCY_DATABASE
    ];
  return currency?.decimal_digits ?? 2; // Default to 2 decimal places
}

/**
 * Gets the currency name
 * @param currencyCode - ISO currency code (e.g., "USD", "EUR")
 * @returns Currency name or the code itself if not found
 */
export function getCurrencyName(currencyCode: string): string {
  const currency =
    CURRENCY_DATABASE[
      currencyCode.toUpperCase() as keyof typeof CURRENCY_DATABASE
    ];
  return currency?.name || currencyCode;
}

/**
 * Gets all available currencies from the database
 * @returns Array of all currency information
 */
export function getAllCurrencies(): CurrencyInfo[] {
  return Object.values(CURRENCY_DATABASE);
}

/**
 * Checks if a cached currency rate has expired based on TTL
 * @param updatedAt - The timestamp when the rate was last updated
 * @param ttlSeconds - Time-to-live in seconds (optional, defaults to environment config)
 * @returns True if the cache entry is expired, false otherwise
 */
export function isCacheExpired(updatedAt: Date, ttlSeconds?: number): boolean {
  const ttl = ttlSeconds ?? CURRENCY_CACHE_TTL_SECONDS;
  const now = new Date();
  const ageInSeconds = (now.getTime() - updatedAt.getTime()) / 1000;
  return ageInSeconds > ttl;
}

/**
 * Gets the configured currency cache TTL in seconds
 * @returns TTL in seconds
 */
export function getCurrencyCacheTTL(): number {
  return CURRENCY_CACHE_TTL_SECONDS;
}
