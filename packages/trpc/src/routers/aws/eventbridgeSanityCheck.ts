import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as EventBridge from "@aws-sdk/client-eventbridge";
import { awsCredentialsProvider } from "@vercel/functions/oidc";
import { protectedProcedure } from "../../trpc.js";

const AWS_REGION = process.env.AWS_REGION!;
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN!;

// Initialize the EventBridge Client
const eventBridgeClient = new EventBridge.EventBridgeClient({
  region: AWS_REGION,
  credentials: awsCredentialsProvider({
    roleArn: AWS_ROLE_ARN,
  }),
});

export const inputSchema = z.object({
  eventBusName: z.string().optional(),
  limit: z.number().min(1).max(50).default(10),
});

export const outputSchema = z.object({
  rules: z.array(
    z.object({
      name: z.string().optional(),
      state: z.string().optional(),
      description: z.string().optional(),
      eventBusName: z.string().optional(),
    })
  ),
  success: z.boolean(),
  message: z.string(),
});

export const eventbridgeSanityCheckHandler = async (
  input: z.infer<typeof inputSchema>
) => {
  try {
    const { eventBusName, limit } = input;

    const command = new EventBridge.ListRulesCommand({
      EventBusName: eventBusName,
      Limit: limit,
    });

    const result = await eventBridgeClient.send(command);

    const rules =
      result.Rules?.map((rule: EventBridge.Rule) => ({
        name: rule.Name,
        state: rule.State,
        description: rule.Description,
        eventBusName: rule.EventBusName,
      })) ?? [];

    return {
      rules,
      success: true,
      message: `Successfully retrieved ${rules.length} EventBridge rules`,
    };
  } catch (error) {
    console.error("EventBridge sanity check failed:", error);

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to connect to EventBridge: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/aws/eventbridge/sanity-check",
      tags: ["aws"],
      summary: "EventBridge OIDC sanity check",
      description:
        "Test EventBridge connectivity using Vercel OIDC authentication with AWS",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input }) => {
    return eventbridgeSanityCheckHandler(input);
  });
