import { useState } from "react";
import type { ReactNode } from "react";
import MDEditor from "@uiw/react-md-editor";
import { trpcReact } from "../utils/trpc";
import { TargetAudienceSelector } from "./TargetAudienceSelector";
import { Send, Users } from "lucide-react";

export function BroadcastDashboard() {
  const [message, setMessage] = useState<string | undefined>("");
  const [targetMode, setTargetMode] = useState<"all" | "specific">("all");
  const [selectedUsers, setSelectedUsers] = useState<bigint[]>([]);
  const [testUserId, setTestUserId] = useState<string>("");

  // @ts-expect-error admin router is not yet fully implemented in TRPC backend
  const { data: users } = trpcReact.admin.getUsers.useQuery();
  // @ts-expect-error backend not fully updated
  const testBroadcast = trpcReact.admin.testBroadcast.useMutation();
  // @ts-expect-error backend not fully updated
  const broadcastMessage = trpcReact.admin.broadcastMessage.useMutation();

  const handleTestSend = async () => {
    if (!message || !testUserId) return;

    let parsedId: bigint;
    try {
      parsedId = BigInt(testUserId.trim());
    } catch {
      alert("Please enter a valid numeric Telegram User ID.");
      return;
    }

    try {
      const result = await testBroadcast.mutateAsync({
        message,
        testUserId: parsedId,
      });
      alert(`Test sent! Success: ${result?.success}`);
    } catch (error) {
      console.error(error);
      alert("Failed to send test.");
    }
  };

  const handleBroadcast = async () => {
    if (!message) return;
    if (targetMode === "specific" && selectedUsers.length === 0) {
      alert("Please select at least one user.");
      return;
    }

    const targetCount =
      targetMode === "all" ? users?.length : selectedUsers.length;

    let confirmMsg = `Are you sure you want to broadcast this to ALL users?`;
    if (targetMode === "specific") {
      confirmMsg = `Are you sure you want to broadcast this to ${targetCount} selected user(s)?`;
    } else if (targetCount !== undefined) {
      confirmMsg = `Are you sure you want to broadcast this to ${targetCount} users?`;
    }

    if (!window.confirm(confirmMsg)) return;

    try {
      const result = await broadcastMessage.mutateAsync({
        message,
        targetUserIds: targetMode === "specific" ? selectedUsers : undefined,
      });
      alert(
        `Broadcast complete! Sent: ${result?.successCount}, Failed: ${result?.failCount}`
      );
    } catch (error) {
      console.error(error);
      alert("Broadcast failed.");
    }
  };

  return (
    <div className="mx-auto mt-8 flex max-w-4xl flex-col gap-8 rounded-xl border bg-white p-6 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <Send className="h-6 w-6 text-blue-600" />
          Broadcast Dashboard
        </h2>
        <p className="mt-1 text-gray-500">
          Compose and send messages to Telegram Mini App users.
        </p>
      </div>

      <div className="flex flex-col gap-2" data-color-mode="light">
        <label className="text-lg font-semibold text-gray-800">
          Message Content
        </label>
        <MDEditor
          value={message}
          onChange={setMessage}
          height={300}
          className="rounded-md border shadow-sm"
          previewOptions={{
            components: {
              p: ({ children }: { children?: ReactNode }) => (
                <p className="mb-2">{children}</p>
              ),
            },
          }}
        />
        <p className="text-xs text-gray-500">
          Markdown formatting is supported. It will be sent exactly as crafted.
        </p>
      </div>

      <div className="border-t pt-6">
        <TargetAudienceSelector
          targetMode={targetMode}
          setTargetMode={setTargetMode}
          selectedUsers={selectedUsers}
          setSelectedUsers={setSelectedUsers}
        />
      </div>

      <div className="flex flex-col items-start justify-between gap-6 rounded-lg border-t bg-gray-50 p-4 pt-6 sm:flex-row sm:items-end">
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <label className="text-sm font-semibold text-gray-700">
            Test Broadcast
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Telegram User ID"
              value={testUserId}
              onChange={(e) => setTestUserId(e.target.value)}
              className="min-w-[200px] flex-1 rounded-md border bg-white px-3 py-2 shadow-sm"
            />
            <button
              onClick={handleTestSend}
              disabled={!message || !testUserId || testBroadcast.isPending}
              className="rounded-md bg-gray-800 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700 disabled:bg-gray-400"
            >
              {testBroadcast.isPending ? "Sending..." : "Send Test"}
            </button>
          </div>
        </div>

        <button
          onClick={handleBroadcast}
          disabled={!message || broadcastMessage.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-6 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:bg-blue-400 sm:w-auto"
        >
          <Users className="h-4 w-4" />
          {broadcastMessage.isPending ? "Broadcasting..." : "Broadcast Message"}
        </button>
      </div>
    </div>
  );
}
