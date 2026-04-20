import { useEffect, useState } from "react";
import { Caption } from "@telegram-apps/telegram-ui";
import { Sparkles, X } from "lucide-react";

const storageKey = (userId: number, chatId: number) =>
  `bs-onboarding-categories:${userId}:${chatId}`;

export default function CategoriesOnboarding({
  userId,
  chatId,
}: {
  userId: number;
  chatId: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey(userId, chatId))) setVisible(true);
    } catch {
      /* localStorage unavailable — skip */
    }
  }, [userId, chatId]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(userId, chatId), "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-[var(--tg-theme-section-bg-color)] p-3">
      <Sparkles size={16} className="mt-0.5 text-violet-500" />
      <div className="flex-1">
        <Caption level="1" weight="2">
          New: Categories
        </Caption>
        <div className="text-xs text-[var(--tg-theme-hint-color)]">
          Tap the filter to narrow by category. Manage custom categories in chat
          settings.
        </div>
      </div>
      <button type="button" onClick={dismiss} className="p-1">
        <X size={14} />
      </button>
    </div>
  );
}
