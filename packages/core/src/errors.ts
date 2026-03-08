/**
 * API error codes.
 * code: 0 = success, non-zero = failure.
 */
export const ErrorCode = {
    OK: 0,

    // 4xx validation errors
    MISSING_FIELDS: 1001,
    INVALID_EXPIRY: 1002,
    PAYLOAD_TOO_LARGE: 1003,
    MAX_VIEWS_EXCEEDED: 1004,
    CONFLICTING_OPTIONS: 1005,

    // 4xx resource errors
    NOT_FOUND: 1006,

    // 5xx
    INTERNAL_SERVER_ERROR: 5000,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
