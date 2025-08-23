import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { awsCredentialsProvider } from "@vercel/functions/oidc";

// Environment variables
const AWS_REGION = process.env.AWS_REGION!;
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN!;
const IS_VERCEL_RUNTIME = process.env.VERCEL === "1";

// Validate required environment variables
function validateEnvironment() {
  if (!AWS_REGION) {
    throw new Error("AWS_REGION environment variable is required");
  }

  if (IS_VERCEL_RUNTIME && !AWS_ROLE_ARN) {
    throw new Error(
      "AWS_ROLE_ARN environment variable is required for Vercel runtime"
    );
  }
}

// Singleton scheduler client instance
let schedulerClientInstance: SchedulerClient | null = null;

/**
 * Creates and returns a configured AWS EventBridge Scheduler client
 * Handles both Vercel runtime and simple configurations
 * Uses singleton pattern for performance optimization
 */
export function getSchedulerClient(): SchedulerClient {
  if (schedulerClientInstance) {
    return schedulerClientInstance;
  }

  validateEnvironment();

  // Configuration for Vercel runtime (with credentials)
  if (IS_VERCEL_RUNTIME) {
    schedulerClientInstance = new SchedulerClient({
      credentials: awsCredentialsProvider({
        roleArn: AWS_ROLE_ARN,
      }),
      region: AWS_REGION,
    });
  } else {
    // Simple configuration (relies on default credentials)
    schedulerClientInstance = new SchedulerClient({
      region: AWS_REGION,
    });
  }

  return schedulerClientInstance;
}

/**
 * Creates a new scheduler client instance (bypassing singleton)
 * Use this only when you need a fresh client instance
 */
export function createSchedulerClient(): SchedulerClient {
  validateEnvironment();

  if (IS_VERCEL_RUNTIME) {
    return new SchedulerClient({
      credentials: awsCredentialsProvider({
        roleArn: AWS_ROLE_ARN,
      }),
      region: AWS_REGION,
    });
  } else {
    return new SchedulerClient({
      region: AWS_REGION,
    });
  }
}

/**
 * Resets the singleton instance (mainly for testing)
 */
export function resetSchedulerClient(): void {
  schedulerClientInstance = null;
}

// Export environment variables for use in other files
export { AWS_REGION, AWS_ROLE_ARN, IS_VERCEL_RUNTIME };
