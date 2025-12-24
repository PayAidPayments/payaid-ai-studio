/**
 * Encryption/Decryption for API Keys
 * AES-256-CBC encryption for sensitive data at rest
 */

import crypto from 'crypto'

// Get encryption key from environment
const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be set in production environment')
    }
    console.warn('⚠️ ENCRYPTION_KEY not set. Using temporary key (not secure for production!)')
    return crypto.randomBytes(32).toString('hex')
  }
  
  // Validate key format (should be 64 hex characters for AES-256)
  if (key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hexadecimal string')
  }
  
  return key
}

const ENCRYPTION_KEY = getEncryptionKey()

/**
 * Encrypt sensitive data (API keys, tokens, etc.)
 */
export function encrypt(text: string): string {
  if (!text) return ''
  
  const iv = crypto.randomBytes(16)
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex')
  
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  return `${iv.toString('hex')}:${encrypted}`
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) return ''
  
  const [ivHex, encryptedData] = encrypted.split(':')
  if (!ivHex || !encryptedData) {
    throw new Error('Invalid encrypted data format')
  }
  
  const iv = Buffer.from(ivHex, 'hex')
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex')
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
