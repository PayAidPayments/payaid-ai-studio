/**
 * @payaid/oauth-client - Token Refresh Utilities
 * 
 * Handles token refresh for OAuth2 access tokens
 */

import { NextRequest } from 'next/server'
import { getTokenFromRequest, verifyToken, JWTPayload } from './index'

// OAuth2 configuration
const CORE_AUTH_URL = process.env.CORE_AUTH_URL || 'https://payaid.io'
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || ''
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || ''

/**
 * Check if token needs refresh (within 1 hour of expiry)
 */
export function shouldRefreshToken(token: string): boolean {
  try {
    const payload = verifyToken(token)
    if (!payload || !payload.exp) {
      return false
    }

    const expiryTime = payload.exp * 1000 // Convert to milliseconds
    const now = Date.now()
    const oneHour = 60 * 60 * 1000

    // Refresh if token expires within 1 hour
    return (expiryTime - now) < oneHour
  } catch {
    return false
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const tokenUrl = `${CORE_AUTH_URL}/api/oauth/token`

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error_description || 'Failed to refresh token')
  }

  return await response.json()
}

/**
 * Get refresh token from request (cookie or Authorization header)
 */
export function getRefreshTokenFromRequest(request: NextRequest): string | null {
  // Try cookie first
  const refreshCookie = request.cookies.get('payaid_refresh_token')
  if (refreshCookie) {
    return refreshCookie.value
  }

  // Try Authorization header with refresh token prefix
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Refresh ')) {
    return authHeader.substring(8)
  }

  return null
}

/**
 * Auto-refresh token if needed
 * Returns new token if refreshed, or original token if not needed
 */
export async function autoRefreshToken(
  request: NextRequest
): Promise<{ token: string; refreshed: boolean }> {
  const currentToken = getTokenFromRequest(request)
  
  if (!currentToken) {
    throw new Error('No token found')
  }

  // Check if token needs refresh
  if (!shouldRefreshToken(currentToken)) {
    return { token: currentToken, refreshed: false }
  }

  // Get refresh token
  const refreshToken = getRefreshTokenFromRequest(request)
  if (!refreshToken) {
    // No refresh token available, return original token
    return { token: currentToken, refreshed: false }
  }

  try {
    // Refresh token
    const result = await refreshAccessToken(refreshToken)
    return { token: result.access_token, refreshed: true }
  } catch (error) {
    // Refresh failed, return original token
    console.error('Token refresh failed:', error)
    return { token: currentToken, refreshed: false }
  }
}

