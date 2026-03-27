import superjson from "superjson";

export function serializeToolResult<T>(result: T): any {
  return superjson.serialize(result).json;
}
