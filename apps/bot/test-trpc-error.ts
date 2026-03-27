import { TRPCError } from "@trpc/server";

const err = new TRPCError({ code: "NOT_FOUND" });
console.log("TRPCError code:", err.code);
