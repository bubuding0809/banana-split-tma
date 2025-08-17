import React, { useMemo } from "react";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Caption,
  Cell,
  IconButton,
  Modal,
  Section,
  Selectable,
  Title,
} from "@telegram-apps/telegram-ui";
import { X } from "lucide-react";
import { trpc } from "@/utils/trpc";

interface CurrencySelectionModalProps {
  /**
   * Whether the modal is open
   */
  open: boolean;
  /**
   * Callback when modal open state changes
   */
  onOpenChange: (open: boolean) => void;
  /**
   * Currently selected currency code
   */
  selectedCurrency?: string;
  /**
   * Callback when a currency is selected
   */
  onCurrencySelect: (currencyCode: string) => void;
  /**
   * List of featured currency codes to show at the top
   * @default ["USD", "SGD"]
   */
  featuredCurrencies?: string[];
  /**
   * Whether to show recently used currencies section
   * @default true
   */
  showRecentlyUsed?: boolean;
  /**
   * Maximum number of recently used currencies to show
   * @default 6
   */
  maxRecentlyUsed?: number;
  /**
   * User ID for fetching recently used currencies
   */
  userId?: number;
  /**
   * Chat ID for fetching recently used currencies
   */
  chatId?: number;
  /**
   * Whether to show other currencies section
   * @default true
   */
  showOthers?: boolean;
  /**
   * Footer message to display at the bottom
   */
  footerMessage?: string;
}

const CurrencySelectionModal: React.FC<CurrencySelectionModalProps> = ({
  open,
  onOpenChange,
  selectedCurrency,
  onCurrencySelect,
  featuredCurrencies = ["USD", "SGD"],
  showRecentlyUsed = true,
  showOthers = true,
  maxRecentlyUsed = 6,
  userId,
  chatId,
  footerMessage = `That’s all the currencies we support for now!`,
}) => {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  // Fetch supported currencies
  const { data: supportedCurrencies, isLoading } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  // Fetch recently used currencies if enabled
  const { data: currenciesWithBalance } =
    trpc.currency.getCurrenciesWithBalance.useQuery(
      {
        userId: userId!,
        chatId: chatId!,
      },
      {
        enabled: showRecentlyUsed && !!userId && !!chatId,
      }
    );

  // Generate flag URL from country code
  const getFlagUrl = (countryCode: string): string => {
    // Handle special cases
    const normalizedCode = countryCode.toLowerCase();
    return `https://hatscripts.github.io/circle-flags/flags/${normalizedCode}.svg`;
  };

  // Organize currencies into sections
  const { featuredSection, recentlyUsedSection, allCurrenciesSection } =
    useMemo(() => {
      if (!supportedCurrencies) {
        return {
          featuredSection: [],
          recentlyUsedSection: [],
          allCurrenciesSection: [],
        };
      }

      // Featured currencies
      const featured = featuredCurrencies
        .map((code) =>
          supportedCurrencies.find((currency) => currency.code === code)
        )
        .filter((currency): currency is NonNullable<typeof currency> =>
          Boolean(currency)
        );

      // Recently used currencies
      const recentlyUsed = showRecentlyUsed
        ? currenciesWithBalance
            ?.filter(
              ({ creditors, debtors, currency }) =>
                !featuredCurrencies.includes(currency.code) &&
                (creditors.length > 0 || debtors.length > 0)
            )
            .slice(0, maxRecentlyUsed)
            .map(({ currency }) => {
              const fullCurrencyInfo = supportedCurrencies.find(
                (c) => c.code === currency.code
              );
              return {
                code: currency.code,
                name: currency.name,
                flagEmoji: currency.flagEmoji,
                countryCode: fullCurrencyInfo?.countryCode || "XX",
              };
            }) || []
        : [];

      // All currencies excluding featured and recently used
      const usedCodes = new Set([
        ...featuredCurrencies,
        ...recentlyUsed.map((c) => c.code),
      ]);
      const allOthers = supportedCurrencies.filter(
        (currency) => !usedCodes.has(currency.code)
      );

      return {
        featuredSection: featured,
        recentlyUsedSection: recentlyUsed,
        allCurrenciesSection: allOthers,
      };
    }, [
      supportedCurrencies,
      featuredCurrencies,
      showRecentlyUsed,
      currenciesWithBalance,
      maxRecentlyUsed,
    ]);

  const handleCurrencySelect = (currencyCode: string) => {
    onCurrencySelect(currencyCode);
    onOpenChange(false);
    hapticFeedback.notificationOccurred("success");
  };

  const renderCurrencyCell = (currency: {
    code: string;
    name: string;
    flagEmoji: string;
    countryCode: string;
  }) => (
    <Cell
      key={currency.code}
      Component="label"
      before={
        <Avatar
          size={40}
          src={getFlagUrl(currency.countryCode)}
          fallbackIcon={currency.flagEmoji}
        >
          {currency.flagEmoji}
        </Avatar>
      }
      subtitle={currency.code}
      after={
        <Selectable
          value={currency.code}
          checked={selectedCurrency === currency.code}
          onChange={() => handleCurrencySelect(currency.code)}
        />
      }
      style={{
        backgroundColor: tSectionBgColor,
      }}
    >
      {currency.name}
    </Cell>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title weight="2" level="3">
              Choose Currency
            </Title>
          }
          after={
            <Modal.Close>
              <IconButton
                size="s"
                mode="gray"
                onClick={() => hapticFeedback.impactOccurred("light")}
              >
                <X
                  size={20}
                  strokeWidth={3}
                  style={{
                    color: tSubtitleTextColor,
                  }}
                />
              </IconButton>
            </Modal.Close>
          }
        />
      }
    >
      <div className="max-h-[75vh] min-h-40">
        {/* Featured currencies */}
        {featuredSection.length > 0 && (
          <Section className="px-3" header="Featured Currencies">
            {featuredSection.map(renderCurrencyCell)}
          </Section>
        )}

        {/* Recently used currencies */}
        {showRecentlyUsed && recentlyUsedSection.length > 0 && (
          <Section header="Recently used currencies" className="px-3">
            {recentlyUsedSection.map(renderCurrencyCell)}
          </Section>
        )}

        {/* All other currencies */}
        {showOthers && allCurrenciesSection.length > 0 && (
          <Section
            header={
              featuredSection.length > 0 || recentlyUsedSection.length > 0
                ? "Other currencies"
                : undefined
            }
            className="px-3"
          >
            {allCurrenciesSection.map(renderCurrencyCell)}
          </Section>
        )}

        {/* Loading state */}
        {isLoading && (
          <Section className="px-3">
            <Cell>Loading currencies...</Cell>
          </Section>
        )}

        <footer className="flex h-16 items-center justify-center px-4 pb-2">
          <Caption
            style={{
              color: tSubtitleTextColor,
            }}
            className="text-center"
          >
            {footerMessage}
          </Caption>
        </footer>
      </div>
    </Modal>
  );
};

export default CurrencySelectionModal;
