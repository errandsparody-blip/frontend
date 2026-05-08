/**
 * Public surface of the errors module. Pages and components import from
 * `@/lib/errors`, never from the individual files inside.
 */

export {
  errorCatalog,
  lookupErrorEntry,
  setUnknownErrorCodeTracker,
  trackUnknownErrorCode,
  type ErrorAction,
  type ErrorEntry,
  type ErrorSurface,
} from "./catalog";

export { isUnexpected, normalizeError, type NormalizedError } from "./normalize";

export { useApiErrorHandler, type ApiErrorHandler } from "./use-api-error-handler";
