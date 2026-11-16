/**
 * Фасад клиента Worker API.
 */
export { createRemoteApi } from './client'
export type { CreateRemoteApiOptions, RemoteApi } from './client'
export {
  RemoteApiError,
  errorCodeFromStatus,
  isApiErrorCode,
  isRemoteApiError,
} from './errors'
export type { RemoteApiErrorOptions, RemoteApiFailure } from './errors'
export {
  describeRemoteApiError,
  messageForErrorCode,
  messageForFailure,
} from './messages'
export type { AuthMessageContext } from './messages'
export { API_ERROR_CODES } from './types'
export type {
  ApiErrorCode,
  LoginResponse,
  MeResponse,
  RemoteFile,
  RemoteFileUrlResponse,
  RemoteLibrary,
  RemoteTrack,
  RemoteTrackInput,
  RemoteTracksResponse,
  RemoteUser,
} from './types'
