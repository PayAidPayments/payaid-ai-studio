/**
 * @payaid/auth - Authentication and Authorization Package
 * 
 * Shared authentication utilities for all PayAid modules
 */

// JWT utilities
export {
  signToken,
  verifyToken,
  decodeToken,
  type JWTPayload,
} from './jwt'

// Password utilities
export {
  hashPassword,
  comparePassword,
} from './password'

// License checking
export {
  checkModuleAccess,
  requireModuleAccess,
  handleLicenseError,
  LicenseError,
} from './license'

// Auth hook (for React)
export {
  usePayAidAuth,
} from './hooks'
