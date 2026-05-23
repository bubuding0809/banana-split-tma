export type ApiValidationErrorCode = "missing_field" | "invalid_field";

export class ApiValidationError extends Error {
  readonly code: ApiValidationErrorCode;

  constructor(code: ApiValidationErrorCode, message: string) {
    super(message);
    this.name = "ApiValidationError";
    this.code = code;
  }
}

export function missingField(message: string): never {
  throw new ApiValidationError("missing_field", message);
}

export function invalidField(message: string): never {
  throw new ApiValidationError("invalid_field", message);
}
