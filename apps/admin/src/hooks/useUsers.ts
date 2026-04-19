import { useMemo } from "react";
import { trpcReact } from "../utils/trpc";

export type AdminUser = {
  id: bigint;
  firstName: string;
  lastName: string | null;
  username: string | null;
};

export function useUsers() {
  const query = trpcReact.admin.getUsers.useQuery();
  const users = useMemo<AdminUser[]>(() => query.data ?? [], [query.data]);
  return { ...query, users };
}
