import type { TrpcClient } from "../client.js";

export interface CommandOption {
  type: "string" | "boolean";
  description: string;
}

export interface Command {
  name: string;
  description: string;
  options: Record<string, CommandOption>;
  execute: (
    opts: Record<string, string | boolean | string[] | undefined>,
    trpc: TrpcClient
  ) => Promise<unknown>;
}
