/**
 * Object storage.
 *
 * `spaces.ts` holds the client and its two-bucket policy; `sigv4.ts` is the
 * request signer it is built on. Import from here.
 */

export {
  contentDisposition,
  getStorageConfig,
  isStorageConfigured,
  presignTtlSeconds,
  presignedGet,
  publicUrl,
  requireStorageConfig,
  StorageError,
  StorageNotConfiguredError,
  uploadPrivate,
  uploadPublic,
  type BucketName,
  type PresignedGetOptions,
  type StorageConfig,
  type UploadInput,
  type UploadResult,
} from './spaces'

export { presignObjectUrl, signRequest, type SigningCredentials } from './sigv4'
