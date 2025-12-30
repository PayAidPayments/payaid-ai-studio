import jwt, { SignOptions } from 'jsonwebtoken'

const JWT_SECRET: string = process.env.JWT_SECRET || 'change-me-in-production'
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '24h'

export interface JWTPayload {
  userId: string
  tenantId: string
  email: string
  role: string
  // Module licensing (Phase 1)
  licensedModules?: string[] // ['crm', 'invoicing', 'whatsapp', etc.]
  subscriptionTier?: string // 'free', 'starter', 'professional', 'enterprise'
}

export function signToken(payload: JWTPayload): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret === 'change-me-in-production') {
    throw new Error('JWT_SECRET is not configured')
  }
  const expiresIn: string = process.env.JWT_EXPIRES_IN || '24h'
  return jwt.sign(payload, secret, { expiresIn } as SignOptions)
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch (error) {
    throw new Error('Invalid or expired token')
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload
  } catch {
    return null
  }
}
