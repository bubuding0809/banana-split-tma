import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { Chip, Radio, Skeleton } from "@telegram-apps/telegram-ui";
import { useCallback, useEffect, useRef, useState } from "react";

const routeApi = getRouteApi("/_tma/chat/$chatId");

const CurrencyNavList = () => {
  const tUserData = useSignal(initData.user);
  const { selectedCurrency } = routeApi.useSearch();
  const params = routeApi.useParams();
  const navigate = routeApi.useNavigate();

  const chatId = Number(params.chatId);
  const userId = tUserData?.id ?? 0;

  // * Refs ========================================================================================
  const currencyRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const navContainerRef = useRef<HTMLElement | null>(null);
  const chipIntersectionState = useRef<Map<string, boolean>>(new Map());
  const lastScrollPosition = useRef(0);
  const lastHapticTime = useRef(0);

  // * State =======================================================================================
  const [isScrolling, setIsScrolling] = useState(false);
  const [lastTriggeredChip, setLastTriggeredChip] = useState<string | null>(
    null
  );

  // * Ref callback function =======================================================================
  const setCurrencyRef =
    (currencyCode: string) => (element: HTMLElement | null) => {
      if (element) {
        currencyRefs.current.set(currencyCode, element);
      } else {
        currencyRefs.current.delete(currencyCode);
      }
    };

  // * Boundary crossing haptic trigger ===============================================================
  const triggerHapticForChip = useCallback(
    (chipElement: Element) => {
      const now = Date.now();

      // Debounce haptic feedback to prevent rapid-fire events
      if (now - lastHapticTime.current < 100) {
        return;
      }

      const currencyCode = Array.from(currencyRefs.current.entries()).find(
        ([, element]) => element === chipElement
      )?.[0];

      // Only trigger if this is a new chip crossing the boundary and not during programmatic scroll
      if (currencyCode && currencyCode !== lastTriggeredChip && !isScrolling) {
        setLastTriggeredChip(currencyCode);
        lastHapticTime.current = now;
        hapticFeedback.impactOccurred("light");
      }
    },
    [lastTriggeredChip, isScrolling]
  );

  // * Queries =====================================================================================
  const { data: chatData } = trpc.chat.getChat.useQuery({
    chatId: Number(chatId),
  });
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});
  const { data: currencies, status: getCurrenciesStatus } =
    trpc.currency.getCurrenciesWithBalance.useQuery({
      userId,
      chatId,
    });

  // Default selected currency to base currency
  useEffect(() => {
    if (chatData && chatData.baseCurrency && selectedCurrency === undefined) {
      navigate({
        search: (prev) => ({
          ...prev,
          selectedCurrency: chatData.baseCurrency,
        }),
      });
    }
  }, [chatData, navigate, selectedCurrency]);

  // Scroll to selected currency chip
  useEffect(() => {
    if (selectedCurrency) {
      const chipElement = currencyRefs.current.get(selectedCurrency);
      if (chipElement) {
        setIsScrolling(true);
        chipElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "start",
        });
        // Reset scrolling flag after animation - this prevents haptic feedback during programmatic scroll
        setTimeout(() => {
          setIsScrolling(false);
        }, 500);
      }
    }
  }, [selectedCurrency]);

  // Intersection observer for boundary crossing detection
  useEffect(() => {
    const navElement = navContainerRef.current;
    if (!navElement) {
      return;
    }

    // Only set up observer if we have currencies loaded
    if (getCurrenciesStatus === "pending") {
      return;
    }

    // Capture ref value for cleanup
    const intersectionStateMap = chipIntersectionState.current;

    const observer = new IntersectionObserver(
      (entries) => {
        // Check scroll direction for better haptic feedback
        const currentScrollPosition = navElement.scrollLeft;

        if (Math.abs(currentScrollPosition - lastScrollPosition.current) > 5) {
          // Only update if significant scroll
          // Reset lastTriggeredChip when scroll direction changes significantly
          if (
            Math.abs(currentScrollPosition - lastScrollPosition.current) > 50
          ) {
            setLastTriggeredChip(null);
          }

          lastScrollPosition.current = currentScrollPosition;
        }

        entries.forEach((entry) => {
          const chipElement = entry.target;
          const currencyCode = Array.from(currencyRefs.current.entries()).find(
            ([, element]) => element === chipElement
          )?.[0];

          if (!currencyCode) return;

          // Get previous intersection state
          const wasIntersecting =
            chipIntersectionState.current.get(currencyCode) ?? false;

          // Only trigger on ENTRY (false → true transition)
          if (entry.isIntersecting && !wasIntersecting) {
            const chipRect = chipElement.getBoundingClientRect();
            const navRect = navElement.getBoundingClientRect();

            // Verify chip is actually crossing the start boundary FROM the right
            const threshold = 30; // 30px from start for better detection
            const isAtStartBoundary = chipRect.left <= navRect.left + threshold;
            const isComingFromRight = chipRect.right > navRect.left + threshold;

            if (isAtStartBoundary && isComingFromRight) {
              triggerHapticForChip(chipElement);
            }
          }

          // Update intersection state
          chipIntersectionState.current.set(currencyCode, entry.isIntersecting);
        });
      },
      {
        root: navElement,
        rootMargin: "0px -80% 0px 0px", // Focus on left 20% of container
        threshold: 0.5, // Single threshold to prevent multiple events
      }
    );

    // Observe all currency chips
    const elementsToObserve = Array.from(currencyRefs.current.entries());

    elementsToObserve.forEach(([, element]) => {
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
      // Clear intersection state tracking
      intersectionStateMap.clear();
    };
  }, [
    currencies,
    chatData?.baseCurrency,
    getCurrenciesStatus,
    triggerHapticForChip,
  ]);

  const handleCurrencyChange = (currencyCode: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedCurrency: currencyCode,
        selectedTab: "balance",
      }),
    });
  };

  return (
    <nav
      ref={navContainerRef}
      className="no-scrollbar flex snap-x snap-mandatory scroll-pl-4 gap-x-2 overflow-x-auto px-4 py-1"
    >
      {getCurrenciesStatus === "pending" &&
        Array.from({ length: 5 }).map((_, index) => (
          <Chip
            key={index}
            before={
              <Skeleton visible={getCurrenciesStatus === "pending"}>
                🌏
              </Skeleton>
            }
          >
            <Skeleton visible={getCurrenciesStatus === "pending"}>
              <span className="text-xl">SGD</span>
            </Skeleton>
          </Chip>
        ))}
      {currencies?.map((currency) => (
        <div
          key={currency.code}
          ref={setCurrencyRef(currency.code)}
          className="snap-start"
        >
          <Chip
            onClick={() => handleCurrencyChange(currency.code)}
            before={<span className="text-xl">{currency.flagEmoji}</span>}
            after={<Radio checked={selectedCurrency === currency.code} />}
          >
            {currency.code}
          </Chip>
        </div>
      ))}
      {currencies?.length === 0 && (
        <div
          ref={setCurrencyRef(chatData?.baseCurrency ?? "")}
          className="snap-start"
        >
          <Chip
            after={
              <span className="text-xl">
                {supportedCurrencies?.find(
                  (c) => c.code === chatData?.baseCurrency
                )?.flagEmoji ?? "🌏"}
              </span>
            }
            before={
              <Radio checked={selectedCurrency === chatData?.baseCurrency} />
            }
          >
            {chatData?.baseCurrency}
          </Chip>
        </div>
      )}
    </nav>
  );
};

export default CurrencyNavList;
