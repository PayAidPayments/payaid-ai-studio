/**
 * @payaid/oauth-client - OAuth2 Client for PayAid Modules
 * 
 * Handles OAuth2 flow for cross-module authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, JWTPayload } from '@payaid/auth'

// Re-export types and functions
export type { JWTPayload }
export { verifyToken } from '@payaid/auth'

// OAuth2 configuration
const CORE_AUTH_URL = process.env.CORE_AUTH_URL || 'https://payaid.io'
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || ''
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || ''

/**
 * Redirect user to core for authentication
 */
export function redirectToAuth(returnUrl: string): NextResponse {
  const authUrl = new URL(`${CORE_AUTH_URL}/api/oauth/authorize`)
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', returnUrl)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid profile email')
  
  return NextResponse.redirect(authUrl.toString())
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<string> {
  const tokenUrl = `${CORE_AUTH_URL}/api/oauth/token`
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
    }),
  })
  
  if (!response.ok) {
    throw new Error('Failed to exchange code for token')
  }
  
  const data = await response.json()
  return data.access_token
}

/**
 * Exchange authorization code for access token and refresh token
 * Returns both tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token?: string }> {
  const tokenUrl = `${CORE_AUTH_URL}/api/oauth/token`
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
    }),
  })
  
  if (!response.ok) {
    throw new Error('Failed to exchange code for token')
  }
  
  const data = await response.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  }
}

/**
 * Get token from request (cookie or Authorization header)
 */
export function getTokenFromRequest(request: NextRequest): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  
  // Try cookie
  const tokenCookie = request.cookies.get('payaid_token')
  if (tokenCookie) {
    return tokenCookie.value
  }
  
  return null
}

/**
 * Verify token and return payload
 */
export function verifyRequestToken(request: NextRequest): JWTPayload | null {
  const token = getTokenFromRequest(request)
  if (!token) {
    return null
  }
  
  try {
    return verifyToken(token)
  } catch {
    return null
  }
}

/**
 * Set token in response cookie
 */
export function setTokenCookie(response: NextResponse, token: string): void {
  response.cookies.set('payaid_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: '.payaid.io', // Shared domain for all subdomains
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })
}

/**
 * Set refresh token in response cookie
 */
export function setRefreshTokenCookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set('payaid_refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: '.payaid.io',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
}

/**
 * Clear token cookie
 */
export function clearTokenCookie(response: NextResponse): void {
  response.cookies.set('payaid_token', '', {
    domain: '.payaid.io',
    path: '/',
    expires: new Date(0),
  })
  response.cookies.set('payaid_refresh_token', '', {
    domain: '.payaid.io',
    path: '/',
    expires: new Date(0),
  })
}

// Export middleware functions
export * from './middleware'

// Export refresh functions
export * from './refresh'
