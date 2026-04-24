import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  CreateScheduleCommand,
  CreateScheduleInput,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { protectedProcedure } from "../../trpc.js";
import { parseScheduleExpression } from "./utils/scheduleParser.js";
import {
  assertValidLambdaArn,
  validateLambdaPayload,
  createLambdaTarget,
} from "./utils/lambdaValidator.js";
import { getSchedulerClient, AWS_REGION } from "./utils/schedulerClient.js";

const AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN =
  process.env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN!;

export const inputSchema = z.object({
  scheduleName: z
    .string()
    .min(1, "Schedule name is required")
    .max(64, "Schedule name must be 64 characters or less")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Schedule name can only contain letters, numbers, periods, hyphens, and underscores"
    ),

  scheduleExpression: z
    .string()
    .min(1, "Schedule expression is required")
    .describe(
      "Human-readable (e.g., 'daily at 9am', 'every 5 minutes') or AWS format (cron/rate expressions)"
    ),

  lambdaArn: z
    .string()
    .min(1, "Lambda ARN is required")
    .describe("AWS Lambda function ARN to trigger"),

  payload: z
    .unknown()
    .optional()
    .describe("JSON payload to send to the Lambda function"),

  description: z
    .string()
    .max(512, "Description must be 512 characters or less")
    .optional()
    .describe("Optional description for the schedule"),

  timezone: z
    .string()
    .optional()
    .default("UTC")
    .describe(
      "Timezone for schedule (e.g., 'America/New_York', 'Europe/London', 'UTC')"
    ),

  startDate: z
    .date()
    .optional()
    .describe("Optional start date for the schedule"),

  endDate: z.date().optional().describe("Optional end date for the schedule"),

  enabled: z
    .boolean()
    .default(true)
    .describe("Whether the schedule should be enabled initially"),

  scheduleGroup: z
    .string()
    .max(64, "Schedule group name must be 64 characters or less")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Schedule group name can only contain letters, numbers, periods, hyphens, and underscores"
    )
    .default("default")
    .describe("Schedule group to organize related schedules"),

  retryPolicy: z
    .object({
      MaximumRetryAttempts: z
        .number()
        .min(0, "Maximum retry attempts must be 0 or greater")
        .max(185, "Maximum retry attempts must be 185 or less")
        .optional()
        .catch(3)
        .describe("Maximum number of retry attempts for failed invocations"),
      MaximumEventAgeInSeconds: z
        .number()
        .min(60, "Maximum event age must be at least 60 seconds")
        .max(86400, "Maximum event age must be 86400 seconds or less")
        .optional()
        .catch(3600)
        .describe("Maximum age of the event in seconds"),
    })
    .optional()
    .catch({
      MaximumRetryAttempts: 3,
      MaximumEventAgeInSeconds: 60 * 60 * 24,
    })
    .describe("Retry policy configuration"),
});

export const outputSchema = z.object({
  scheduleArn: z.string().describe("ARN of the created schedule"),
  scheduleName: z.string().describe("Name of the created schedule"),
  scheduleExpression: z.string().describe("Normalized AWS schedule expression"),
  expressionType: z
    .enum(["rate", "cron"])
    .describe("Type of schedule expression"),
  state: z
    .enum(["ENABLED", "DISABLED"])
    .describe("Current state of the schedule"),
  createdDate: z.date().describe("Date when the schedule was created"),
  lambdaTarget: z
    .object({
      arn: z.string().describe("Lambda function ARN"),
      payload: z.unknown().optional().describe("Payload sent to Lambda"),
    })
    .describe("Lambda target configuration"),
  timezone: z.string().describe("Timezone for the schedule"),
  scheduleGroup: z.string().describe("Schedule group name"),
  message: z.string().describe("Success message"),
});

export const createRecurringScheduleHandler = async (
  input: z.infer<typeof inputSchema>
) => {
  try {
    const {
      scheduleName,
      scheduleExpression,
      lambdaArn,
      payload,
      description,
      timezone,
      startDate,
      endDate,
      enabled,
      scheduleGroup,
      retryPolicy,
    } = input;

    // Validate inputs
    assertValidLambdaArn(lambdaArn);

    if (payload !== undefined) {
      validateLambdaPayload(payload);
    }

    // Validate start/end date logic
    if (startDate && endDate && startDate >= endDate) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Start date must be before end date",
      });
    }

    // Parse schedule expression
    let parsedSchedule;
    try {
      parsedSchedule = parseScheduleExpression(scheduleExpression);
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid schedule expression: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }

    // Create Lambda target configuration
    const lambdaTarget = createLambdaTarget(lambdaArn, payload);
    // Note: RoleArn will be set in the Target configuration below

    // AWS EventBridge Scheduler defaults to 185 retries over 24h when
    // RetryPolicy is omitted. Resolve undefined to our conservative defaults.
    const resolvedRetryPolicy = retryPolicy ?? {
      MaximumRetryAttempts: 3,
      MaximumEventAgeInSeconds: 60 * 60 * 24,
    };

    // Prepare schedule configuration
    const scheduleInput: CreateScheduleInput = {
      Name: scheduleName,
      GroupName: scheduleGroup,
      ScheduleExpression: parsedSchedule.expression,
      ScheduleExpressionTimezone: timezone,
      Description: description,
      State: enabled ? "ENABLED" : "DISABLED",
      Target: {
        Arn: lambdaTarget.Arn,
        RoleArn: AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN,
        Input: lambdaTarget.Input,
        RetryPolicy: resolvedRetryPolicy,
      },
      FlexibleTimeWindow: {
        Mode: "OFF", // Exact time execution
      },
    };

    // Add start and end dates if provided
    if (startDate || endDate) {
      scheduleInput.ScheduleExpression = parsedSchedule.expression;

      if (startDate) {
        scheduleInput.StartDate = startDate;
      }

      if (endDate) {
        scheduleInput.EndDate = endDate;
      }
    }

    // Create the schedule
    const createCommand = new CreateScheduleCommand(scheduleInput);
    const schedulerClient = getSchedulerClient();
    const result = await schedulerClient.send(createCommand);

    // Get the created schedule details
    const getCommand = new GetScheduleCommand({
      Name: scheduleName,
      GroupName: scheduleGroup,
    });

    const scheduleDetails = await schedulerClient.send(getCommand);

    const createdDate = scheduleDetails.CreationDate || new Date();

    return {
      scheduleArn:
        result.ScheduleArn ||
        `arn:aws:scheduler:${AWS_REGION}:*:schedule/${scheduleGroup}/${scheduleName}`,
      scheduleName,
      scheduleExpression: parsedSchedule.expression,
      expressionType: parsedSchedule.type,
      state: scheduleDetails.State as "ENABLED" | "DISABLED",
      createdDate,
      lambdaTarget: {
        arn: lambdaArn,
        payload,
      },
      timezone,
      scheduleGroup,
      message: `Successfully created ${parsedSchedule.type} schedule '${scheduleName}' to trigger Lambda function`,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle AWS SDK errors
    if (error instanceof Error) {
      if (error.name === "ConflictException") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Schedule with name '${input.scheduleName}' already exists in group '${input.scheduleGroup}'`,
        });
      }

      if (error.name === "ValidationException") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `AWS validation error: ${error.message}`,
        });
      }

      if (error.name === "ResourceNotFoundException") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Schedule group '${input.scheduleGroup}' not found. Create the group first or use 'default'.`,
        });
      }
    }

    console.error("Failed to create recurring schedule:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to create recurring schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/aws/schedule/create",
      tags: ["aws"],
      summary: "Create recurring schedule for Lambda function",
      description:
        "Creates a recurring schedule using AWS EventBridge Scheduler to trigger a Lambda function with human-readable schedule expressions",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input }) => {
    return createRecurringScheduleHandler(input);
  });
