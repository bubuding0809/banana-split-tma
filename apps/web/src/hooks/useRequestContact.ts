import { hapticFeedback, requestContact } from "@telegram-apps/sdk-react";
import { useState } from "react";

interface UseRequestContactReturn {
  requestContactInfo: () => Promise<string | null>;
  isLoading: boolean;
  error: string | null;
  isSupported: boolean;
}

export const useRequestContact = (): UseRequestContactReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = requestContact.isAvailable();

  const requestContactInfo = async (): Promise<string | null> => {
    if (!isSupported) {
      setError("Contact request is not supported in this version of Telegram");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      hapticFeedback.impactOccurred("medium");

      const result = await requestContact.ifAvailable();

      if (result?.contact?.phoneNumber) {
        hapticFeedback.notificationOccurred("success");
        return result.contact.phoneNumber;
      } else {
        throw new Error("No phone number received from Telegram");
      }
    } catch (err) {
      hapticFeedback.notificationOccurred("error");
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to request contact information";
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    requestContactInfo,
    isLoading,
    error,
    isSupported,
  };
};

export default useRequestContact;
