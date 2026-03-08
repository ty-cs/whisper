// Package api provides the HTTP client for the Whisper API.
package api

// Error codes returned by the Whisper API.
// These mirror the TypeScript ErrorCode enum in packages/core/src/errors.ts.
const (
	ErrorCodeOK = 0

	// 4xx validation errors
	ErrorCodeMissingFields      = 1001
	ErrorCodeInvalidExpiry      = 1002
	ErrorCodePayloadTooLarge    = 1003
	ErrorCodeMaxViewsExceeded   = 1004
	ErrorCodeConflictingOptions = 1005

	// 4xx resource errors
	ErrorCodeNotFound = 1006

	// 5xx
	ErrorCodeInternalServerError = 5000
)
