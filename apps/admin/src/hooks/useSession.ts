import { useCallback, useEffect, useState } from "react";

export type Session = {
  telegramId: number;
  username: string | null;
  firstName: string;
};

type State =
  | { status: "loading" }
  | { status: "authenticated"; session: Session }
  | { status: "unauthenticated" };

export function useSession() {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const session = (await res.json()) as Session;
        setState({ status: "authenticated", session });
      } else {
        setState({ status: "unauthenticated" });
      }
    } catch {
      setState({ status: "unauthenticated" });
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setState({ status: "unauthenticated" });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh, logout };
}
