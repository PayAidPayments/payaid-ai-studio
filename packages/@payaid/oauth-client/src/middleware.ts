/**
 * @payaid/oauth-client - Authentication Middleware
 * 
 * Middleware helpers for automatic authentication checking in module routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestToken, redirectToAuth, JWTPayload } from './index'

/**
 * Middleware result type
 */
export interface AuthMiddlewareResult {
  authenticated: boolean
  payload: JWTPayload | null
  response: NextResponse | null
}

/**
 * Check if request is authenticated
 * Returns middleware result with authentication status
 */
export function checkAuthentication(
  request: NextRequest,
  options?: {
    redirectToLogin?: boolean
    returnUrl?: string
  }
): AuthMiddlewareResult {
  const payload = verifyRequestToken(request)

  if (!payload) {
    // Not authenticated
    if (options?.redirectToLogin) {
      const returnUrl = options.returnUrl || request.url
      const response = redirectToAuth(returnUrl)
      return {
        authenticated: false,
        payload: null,
        response,
      }
    }

    return {
      authenticated: false,
      payload: null,
      response: null,
    }
  }

  return {
    authenticated: true,
    payload,
    response: null,
  }
}

/**
 * Require authentication middleware
 * Automatically redirects to login if not authenticated
 */
export function requireAuth(
  request: NextRequest,
  returnUrl?: string
): AuthMiddlewareResult {
  return checkAuthentication(request, {
    redirectToLogin: true,
    returnUrl: returnUrl || request.url,
  })
}

/**
 * Optional authentication middleware
 * Returns authentication status without redirecting
 */
export function optionalAuth(request: NextRequest): AuthMiddlewareResult {
  return checkAuthentication(request, {
    redirectToLogin: false,
  })
}

