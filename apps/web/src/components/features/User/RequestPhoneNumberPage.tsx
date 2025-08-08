import { assetUrls } from "@/assets/urls";
import { useRequestContact } from "@/hooks";
import { trpc } from "@/utils/trpc";
import {
  mainButton,
  initData,
  useSignal,
  secondaryButton,
} from "@telegram-apps/sdk-react";
import {
  Caption,
  Placeholder,
  Text,
  Spinner,
} from "@telegram-apps/telegram-ui";
import { useEffect, useState, useCallback } from "react";

const RequestPhoneNumberPage = () => {
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const tUserData = useSignal(initData.user);
  const trpcUtils = trpc.useUtils();

  const userId = tUserData?.id ?? 0;

  const { requestContactInfo, isLoading, error, isSupported } =
    useRequestContact();
  const updateUserMutation = trpc.user.updateUser.useMutation({
    onMutate: ({ phoneNumber, phoneNumberRequested }) => {
      // Optimistically update the user data to avoid loading state
      trpcUtils.user.getUser.setData(
        {
          userId,
        },
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            phoneNumber: phoneNumber ?? prev.phoneNumber,
            phoneNumberRequested:
              phoneNumberRequested ?? prev.phoneNumberRequested,
          };
        }
      );
    },
    onSettled: () => {
      trpcUtils.user.getUser.invalidate({ userId });
    },
  });

  const handleRequestContact = useCallback(async () => {
    try {
      const phoneNumber = await requestContactInfo();

      if (phoneNumber && userId) {
        setIsUpdatingUser(true);

        await updateUserMutation.mutateAsync({
          userId,
          phoneNumber,
          phoneNumberRequested: true,
        });
      }
    } catch (err) {
      console.error("Failed to update user with phone number:", err);
    } finally {
      setIsUpdatingUser(false);
    }
  }, [requestContactInfo, userId, updateUserMutation]);

  const handleSkip = useCallback(async () => {
    try {
      setIsUpdatingUser(true);

      await updateUserMutation.mutateAsync({
        userId,
        phoneNumberRequested: true,
      });
    } catch (err) {
      console.error("Failed to update user skip preference:", err);
    } finally {
      setIsUpdatingUser(false);
    }
  }, [userId, updateUserMutation]);

  useEffect(() => {
    if (isSupported) {
      mainButton.setParams.ifAvailable({
        text: "Share Phone Number",
        isEnabled: true,
        isVisible: true,
        hasShineEffect: true,
      });
    } else {
      mainButton.setParams.ifAvailable({
        text: "Continue",
        isEnabled: true,
        isVisible: true,
        hasShineEffect: false,
      });
    }

    return () => {
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
        hasShineEffect: false,
      });
    };
  }, [isSupported]);

  useEffect(() => {
    const offMainButton = mainButton.onClick.ifAvailable(() => {
      if (isSupported) {
        handleRequestContact();
      } else {
        handleSkip();
      }
    });

    return () => {
      offMainButton?.();
    };
  }, [isSupported, handleRequestContact, handleSkip]);

  useEffect(() => {
    if (!isSupported) return;

    secondaryButton.setParams.ifAvailable({
      text: "Skip for now",
      isEnabled: true,
      isVisible: true,
      hasShineEffect: false,
      position: "top",
    });

    return () => {
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
        hasShineEffect: false,
        position: "left",
      });
    };
  }, [isSupported]);

  useEffect(() => {
    const offSecondaryButton = secondaryButton.onClick.ifAvailable(() => {
      handleSkip();
    });

    return () => {
      offSecondaryButton?.();
    };
  }, [handleSkip]);

  if (isLoading || isUpdatingUser) {
    return (
      <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
        <Spinner size="l" />
        <Caption weight="1">
          {isLoading
            ? "Requesting contact info..."
            : "Updating your profile..."}
        </Caption>
      </main>
    );
  }

  if (!isSupported) {
    return (
      <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
        <Placeholder
          header="📱 Phone Number Optional"
          description={
            <div className="flex flex-col items-center gap-2">
              <Text>
                We wanted your phone number so group members can easily access
                your contact info for payments via PayNow, PayLah, and more.
              </Text>
              <Caption className="text-gray-500">
                Your version of Telegram doesn&apos;t support contact sharing.
              </Caption>
            </div>
          }
        >
          <img
            alt="Telegram sticker"
            src={assetUrls.bananaSparklyEyes}
            style={{
              display: "block",
              height: "144px",
              width: "144px",
            }}
          />
        </Placeholder>
      </main>
    );
  }

  return (
    <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
      <Placeholder
        header="📱 Share Your Phone Number"
        description={
          <div className="flex flex-col items-center gap-2">
            <Text>
              Share your phone number so group members can easily access your
              contact info for payments via PayNow, PayLah, and more.
            </Text>

            {error && <Text className="text-red-500">{error}</Text>}
          </div>
        }
      >
        <img
          alt="Telegram sticker"
          src={assetUrls.bananaSparklyEyes}
          style={{
            display: "block",
            height: "144px",
            width: "144px",
          }}
        />
      </Placeholder>
    </main>
  );
};

export default RequestPhoneNumberPage;
