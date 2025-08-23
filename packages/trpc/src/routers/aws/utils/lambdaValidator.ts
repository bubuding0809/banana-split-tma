/**
 * Utility functions for validating Lambda ARNs and configurations
 */

export interface ParsedLambdaArn {
  region: string;
  accountId: string;
  functionName: string;
  qualifier?: string; // version or alias
  isValid: boolean;
}

/**
 * AWS Lambda ARN format:
 * arn:aws:lambda:region:account-id:function:function-name[:qualifier]
 *
 * Examples:
 * - arn:aws:lambda:us-east-1:123456789012:function:my-function
 * - arn:aws:lambda:us-east-1:123456789012:function:my-function:1
 * - arn:aws:lambda:us-east-1:123456789012:function:my-function:PROD
 */

const LAMBDA_ARN_PATTERN =
  /^arn:aws:lambda:([a-z0-9-]+):(\d{12}):function:([a-zA-Z0-9-_]+)(?::([a-zA-Z0-9-_$]+))?$/;

const AWS_REGIONS = [
  // US regions
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  // EU regions
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
  "eu-central-2",
  // Asia Pacific regions
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-southeast-4",
  "ap-south-1",
  "ap-south-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-east-1",
  // Other regions
  "ca-central-1",
  "ca-west-1",
  "sa-east-1",
  "af-south-1",
  "me-south-1",
  "me-central-1",
  "il-central-1",
  // GovCloud regions
  "us-gov-east-1",
  "us-gov-west-1",
  // China regions (separate partition)
  "cn-north-1",
  "cn-northwest-1",
];

/**
 * Validates and parses a Lambda function ARN
 * @param arn - The Lambda function ARN to validate
 * @returns Parsed ARN components with validation status
 */
export function validateLambdaArn(arn: string): ParsedLambdaArn {
  const trimmedArn = arn.trim();

  // Check basic ARN format
  const match = trimmedArn.match(LAMBDA_ARN_PATTERN);

  if (!match) {
    return {
      region: "",
      accountId: "",
      functionName: "",
      qualifier: undefined,
      isValid: false,
    };
  }

  const [, region, accountId, functionName, qualifier] = match;

  // Ensure extracted values are strings (they should be from regex match)
  const regionStr = region || "";
  const accountIdStr = accountId || "";
  const functionNameStr = functionName || "";

  // Validate region
  const isValidRegion = AWS_REGIONS.includes(regionStr);

  // Validate account ID (12 digits)
  const isValidAccountId = /^\d{12}$/.test(accountIdStr);

  // Validate function name (AWS Lambda naming rules)
  const isValidFunctionName = /^[a-zA-Z0-9-_]{1,64}$/.test(functionNameStr);

  // Validate qualifier if present (version number, alias, or $LATEST)
  let isValidQualifier = true;
  if (qualifier) {
    // Version number (1-99999999999999999999)
    const isVersionNumber = /^\d{1,20}$/.test(qualifier);
    // Alias (1-128 characters, alphanumeric and some special chars)
    const isAlias = /^[a-zA-Z0-9-_]{1,128}$/.test(qualifier);
    // $LATEST is a special reserved qualifier
    const isLatest = qualifier === "$LATEST";

    isValidQualifier = isVersionNumber || isAlias || isLatest;
  }

  const isValid =
    isValidRegion &&
    isValidAccountId &&
    isValidFunctionName &&
    isValidQualifier;

  return {
    region: regionStr,
    accountId: accountIdStr,
    functionName: functionNameStr,
    qualifier,
    isValid,
  };
}

/**
 * Validates that a Lambda ARN is properly formatted
 * @param arn - Lambda ARN to validate
 * @returns true if valid, throws error if invalid
 */
export function assertValidLambdaArn(arn: string): asserts arn is string {
  const parsed = validateLambdaArn(arn);

  if (!parsed.isValid) {
    throw new Error(
      `Invalid Lambda ARN format: ${arn}. Expected format: arn:aws:lambda:region:account-id:function:function-name[:qualifier]`
    );
  }

  if (!AWS_REGIONS.includes(parsed.region)) {
    throw new Error(`Invalid AWS region in ARN: ${parsed.region}`);
  }
}

/**
 * Validates payload for Lambda function
 * @param payload - JSON payload to validate
 * @returns true if valid, throws error if invalid
 */
export function validateLambdaPayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) {
    return true; // null/undefined payloads are allowed
  }

  try {
    // Test if payload can be serialized to JSON
    const serialized = JSON.stringify(payload);

    // AWS Lambda has a payload size limit of 256KB for synchronous invocations
    // EventBridge has a 256KB event size limit as well
    const payloadSize = Buffer.byteLength(serialized, "utf8");
    const maxSize = 256 * 1024; // 256KB in bytes

    if (payloadSize > maxSize) {
      throw new Error(
        `Payload size (${Math.round(payloadSize / 1024)}KB) exceeds the 256KB limit`
      );
    }

    // Test if payload can be parsed back (ensures it's valid JSON)
    JSON.parse(serialized);

    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid payload: ${error.message}`);
    }
    throw new Error("Invalid payload: Unable to serialize to JSON");
  }
}

/**
 * Creates a standardized Lambda target configuration for EventBridge Scheduler
 * @param arn - Lambda function ARN
 * @param payload - JSON payload to send to Lambda
 * @returns EventBridge Scheduler Lambda target configuration
 */
export function createLambdaTarget(arn: string, payload?: unknown) {
  assertValidLambdaArn(arn);

  if (payload !== undefined) {
    validateLambdaPayload(payload);
  }

  return {
    Arn: arn,
    Input: payload ? JSON.stringify(payload) : undefined,
    RoleArn: undefined, // Will be set by the calling procedure based on environment
  };
}
