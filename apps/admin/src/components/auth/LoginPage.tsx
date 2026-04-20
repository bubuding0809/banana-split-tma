import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TelegramAuthPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

type Props = {
  onAuthenticated: () => void;
};

export function LoginPage({ onAuthenticated }: Props) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [exchanging, setExchanging] = useState(false);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
  const [apiKey, setApiKey] = useState("");
  const [submittingKey, setSubmittingKey] = useState(false);

  const submitApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || submittingKey) return;
    setSubmittingKey(true);
    try {
      const res = await fetch("/api/auth/apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Sign-in failed (${res.status})`);
      }
      setApiKey("");
      onAuthenticated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSubmittingKey(false);
    }
  };

  useEffect(() => {
    window.onTelegramAuth = async (user: TelegramAuthPayload) => {
      setExchanging(true);
      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(user),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Login failed (${res.status})`);
        }
        onAuthenticated();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Login failed";
        toast.error(msg);
      } finally {
        setExchanging(false);
      }
    };
    return () => {
      delete window.onTelegramAuth;
    };
  }, [onAuthenticated]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "admin_auth_ping") onAuthenticated();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [onAuthenticated]);

  useEffect(() => {
    const container = widgetRef.current;
    if (!container || !botUsername) return;
    container.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);
  }, [botUsername]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="bg-card text-card-foreground w-full max-w-sm space-y-6 rounded-lg border p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Admin sign-in
          </h1>
          <p className="text-muted-foreground text-sm">
            Authenticate with Telegram to continue.
          </p>
        </div>

        {!botUsername ? (
          <p className="text-destructive text-sm">
            Missing <code>VITE_TELEGRAM_BOT_USERNAME</code> — configure the
            admin Vercel project.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div ref={widgetRef} />
            {exchanging && (
              <p className="text-muted-foreground text-xs">Signing in…</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-[11px] uppercase">
            or
          </span>
          <div className="bg-border h-px flex-1" />
        </div>

        <form onSubmit={submitApiKey} className="flex flex-col gap-2">
          <label
            htmlFor="apikey"
            className="text-muted-foreground text-xs font-medium"
          >
            API key fallback
          </label>
          <Input
            id="apikey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="ADMIN_LAMBDA_API_KEY"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={submittingKey}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!apiKey.trim() || submittingKey}
          >
            {submittingKey ? "Signing in…" : "Sign in with API key"}
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-[11px]">
          Access is limited to an allowlist of Telegram accounts.
        </p>
      </div>
    </div>
  );
}
