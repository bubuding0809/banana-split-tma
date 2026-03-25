import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTrpcCaller } from "./trpc.js";
import { appRouter, withCreateTRPCContext } from "@dko/trpc";

// Mock the dependencies
vi.mock("@dko/trpc", () => {
  const mockCreateContext = vi.fn().mockReturnValue({ mocked: "context" });
  const mockWithCreateTRPCContext = vi.fn().mockReturnValue(mockCreateContext);

  const mockCreateCaller = vi.fn().mockReturnValue({ mocked: "caller" });
  const mockAppRouter = {
    createCaller: mockCreateCaller,
  };

  return {
    withCreateTRPCContext: mockWithCreateTRPCContext,
    appRouter: mockAppRouter,
  };
});

describe("createTrpcCaller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.API_KEY = "test-api-key";
    process.env.AWS_GROUP_REMINDER_LAMBDA_ARN = "test-lambda-arn";
    process.env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN = "test-role-arn";
  });

  it("should extract telegramUserId and chatId from valid context", () => {
    const context = {
      telegramUserId: 12345,
      chatId: 67890,
      otherData: "should be ignored",
    };

    const result = createTrpcCaller(context);

    expect(result.telegramUserId).toBe(12345);
    expect(result.chatId).toBe(67890);
    expect(result.caller).toEqual({ mocked: "caller" });

    // Verify correct env vars were passed
    expect(withCreateTRPCContext).toHaveBeenCalledWith({
      TELEGRAM_BOT_TOKEN: "test-token",
      AWS_GROUP_REMINDER_LAMBDA_ARN: "test-lambda-arn",
      AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN: "test-role-arn",
    });

    // Verify context generation uses the API key
    const createContextMock = vi.mocked(withCreateTRPCContext).mock.results[0]
      ?.value;
    expect(createContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        req: expect.objectContaining({
          headers: {
            "x-api-key": "test-api-key",
          },
        }),
      })
    );

    // Verify appRouter uses the generated context
    expect(appRouter.createCaller).toHaveBeenCalledWith({ mocked: "context" });
  });

  it("should throw error if context is null", () => {
    expect(() => createTrpcCaller(null)).toThrow(
      "Missing or invalid Mastra execution context"
    );
  });

  it("should throw error if context is undefined", () => {
    expect(() => createTrpcCaller(undefined)).toThrow(
      "Missing or invalid Mastra execution context"
    );
  });

  it("should throw error if context is not an object", () => {
    expect(() => createTrpcCaller("string")).toThrow(
      "Missing or invalid Mastra execution context"
    );
  });

  it("should throw error if telegramUserId is missing", () => {
    const context = {
      chatId: 67890,
    };
    expect(() => createTrpcCaller(context)).toThrow(
      "Context must include numeric telegramUserId and chatId"
    );
  });

  it("should throw error if chatId is missing", () => {
    const context = {
      telegramUserId: 12345,
    };
    expect(() => createTrpcCaller(context)).toThrow(
      "Context must include numeric telegramUserId and chatId"
    );
  });

  it("should throw error if telegramUserId is not a number", () => {
    const context = {
      telegramUserId: "12345",
      chatId: 67890,
    };
    expect(() => createTrpcCaller(context)).toThrow(
      "Context must include numeric telegramUserId and chatId"
    );
  });

  it("should throw error if chatId is not a number", () => {
    const context = {
      telegramUserId: 12345,
      chatId: "67890",
    };
    expect(() => createTrpcCaller(context)).toThrow(
      "Context must include numeric telegramUserId and chatId"
    );
  });
});
