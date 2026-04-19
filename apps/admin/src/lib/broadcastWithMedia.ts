import type { BroadcastResult } from "@dko/trpc";

type Args = {
  message: string;
  targetUserIds?: number[];
  file: File;
};

export async function broadcastWithMedia({
  message,
  targetUserIds,
  file,
}: Args): Promise<BroadcastResult> {
  const form = new FormData();
  form.append("message", message);
  if (targetUserIds) {
    form.append("targetUserIds", JSON.stringify(targetUserIds));
  }
  form.append("file", file, file.name);

  const res = await fetch("/api/admin/broadcast", {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!res.ok) {
    let msg = `Broadcast failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return (await res.json()) as BroadcastResult;
}
