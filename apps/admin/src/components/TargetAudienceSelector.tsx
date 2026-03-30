import { trpcReact } from "../utils/trpc";
import type { Dispatch, SetStateAction } from "react";

type TargetAudienceSelectorProps = {
  targetMode: "all" | "specific";
  setTargetMode: Dispatch<SetStateAction<"all" | "specific">>;
  selectedUsers: bigint[];
  setSelectedUsers: Dispatch<SetStateAction<bigint[]>>;
};

export function TargetAudienceSelector({
  targetMode,
  setTargetMode,
  selectedUsers,
  setSelectedUsers,
}: TargetAudienceSelectorProps) {
  const { data: users, isLoading, error } = trpcReact.admin.getUsers.useQuery();

  const handleToggleUser = (userId: bigint) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-gray-800">Target Audience</h3>

      <div className="flex items-center gap-6">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="targetMode"
            value="all"
            checked={targetMode === "all"}
            onChange={() => setTargetMode("all")}
            className="h-4 w-4 text-blue-600"
          />
          <span className="text-gray-700">All Users</span>
        </label>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="targetMode"
            value="specific"
            checked={targetMode === "specific"}
            onChange={() => setTargetMode("specific")}
            className="h-4 w-4 text-blue-600"
          />
          <span className="text-gray-700">Specific Users</span>
        </label>
      </div>

      {targetMode === "specific" && (
        <div className="max-h-60 overflow-y-auto rounded-md border bg-gray-50 p-4">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading users...</p>
          ) : error ? (
            <p className="text-sm text-red-500">Error loading users.</p>
          ) : users && users.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {users.map(
                (user: {
                  id: bigint;
                  firstName: string;
                  lastName: string | null;
                  username: string | null;
                }) => (
                  <label
                    key={user.id.toString()}
                    className="flex cursor-pointer items-center gap-2 rounded border bg-white p-2 shadow-sm hover:bg-gray-100"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => handleToggleUser(user.id)}
                      className="h-4 w-4 rounded text-blue-600"
                    />
                    <span
                      className="truncate text-sm text-gray-700"
                      title={user.username || user.firstName}
                    >
                      {user.firstName} {user.lastName || ""}{" "}
                      {user.username ? `(@${user.username})` : ""}
                    </span>
                  </label>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No users found.</p>
          )}
        </div>
      )}
    </div>
  );
}
