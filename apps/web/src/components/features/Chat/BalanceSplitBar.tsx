import { useSignal, themeParams } from "@telegram-apps/sdk-react";
import { Skeleton } from "@telegram-apps/telegram-ui";
import { cn } from "@/utils/cn";
import { getBalanceColorClass, sumDecimals } from "@/utils/financial";

export interface BalanceTotals {
  owe: number;
  owed: number;
  net: number;
}

/** Split per-counterparty nets into what the user owes vs is owed. */
export const computeBalanceTotals = (nets: number[]): BalanceTotals => {
  const owe = sumDecimals(nets.filter((n) => n < 0)).abs();
  const owed = sumDecimals(nets.filter((n) => n > 0));
  return {
    owe: owe.toNumber(),
    owed: owed.toNumber(),
    net: owed.minus(owe).toNumber(),
  };
};

const amountFormatter = new Intl.NumberFormat("en", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatAmount = (n: number) => amountFormatter.format(Math.abs(n));
const formatSigned = (n: number) => {
  const abs = formatAmount(n);
  // Sub-cent dust rounds to 0.00; don't sign it.
  if (abs === formatAmount(0)) return abs;
  return `${n > 0 ? "+" : "−"}${abs}`;
};

interface BalanceSplitBarProps {
  nets: number[];
  currency: string;
  isLoading?: boolean;
}

const BalanceSplitBar = ({
  nets,
  currency,
  isLoading = false,
}: BalanceSplitBarProps) => {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tSubtitleColor = useSignal(themeParams.subtitleTextColor);
  const tSeparatorColor = useSignal(themeParams.sectionSeparatorColor);

  const { owe, owed, net } = computeBalanceTotals(nets);
  const settled = owe === 0 && owed === 0;
  // Percentages, not raw amounts: flex-grow factors summing below 1 leave
  // the track partly empty (e.g. owe 0.30 + owed 0.20).
  const total = owe + owed;
  const owePct = settled ? 0 : (owe / total) * 100;
  const owedPct = settled ? 0 : (owed / total) * 100;

  return (
    <div
      className="flex items-center gap-4 rounded-2xl px-4 py-3"
      style={{ backgroundColor: tSectionBgColor }}
      data-testid="balance-split-bar"
    >
      <Skeleton visible={isLoading}>
        <div className="flex min-w-0 flex-col">
          <span
            className="text-[12px] font-semibold tracking-wide"
            style={{ color: tSubtitleColor }}
          >
            {currency}
          </span>
          <span
            className={cn(
              "text-[24px] font-bold tabular-nums leading-tight",
              getBalanceColorClass(net)
            )}
            data-testid="balance-net"
          >
            {formatSigned(net)}
          </span>
        </div>
      </Skeleton>

      <div
        className="w-px self-stretch"
        style={{ backgroundColor: tSeparatorColor }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
        <div className="flex h-2 gap-0.5">
          {settled || isLoading ? (
            <div
              className="flex-1 rounded-full opacity-20"
              style={{ backgroundColor: tSubtitleColor }}
            />
          ) : (
            <>
              {owe > 0 && (
                // Floor keeps a tiny debt visible next to a large collectable.
                <div
                  className="min-w-1.5 rounded-full bg-red-500"
                  style={{ flex: `${owePct} 1 0` }}
                  data-testid="balance-owe-slice"
                />
              )}
              {owed > 0 && (
                <div
                  className="min-w-1.5 rounded-full bg-green-500"
                  style={{ flex: `${owedPct} 1 0` }}
                  data-testid="balance-owed-slice"
                />
              )}
            </>
          )}
        </div>
        <div className="flex justify-between text-[12px] font-semibold tabular-nums">
          <span
            className={cn(owe > 0 && "text-red-500")}
            style={owe > 0 ? undefined : { color: tSubtitleColor }}
            data-testid="balance-owe"
          >
            {owe > 0 ? `−${formatAmount(owe)}` : formatAmount(0)}
          </span>
          <span
            className={cn(owed > 0 && "text-green-500")}
            style={owed > 0 ? undefined : { color: tSubtitleColor }}
            data-testid="balance-owed"
          >
            {owed > 0 ? `+${formatAmount(owed)}` : formatAmount(0)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BalanceSplitBar;
