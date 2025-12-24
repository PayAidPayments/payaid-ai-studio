import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, JWTPayload } from './jwt'

/**
 * License Error - thrown when module access is denied
 */
export class LicenseError extends Error {
  constructor(
    public moduleId: string,
    public message: string = `Module '${moduleId}' is not licensed`
  ) {
    super(message)
    this.name = 'LicenseError'
  }
}

/**
 * Check if user has access to a specific module
 * 
 * @param request - Next.js request object
 * @param moduleId - Module ID to check (e.g., 'crm', 'invoicing', 'whatsapp')
 * @returns Object with userId, tenantId, and licensedModules
 * @throws LicenseError if module is not licensed
 */
export async function checkModuleAccess(
  request: NextRequest,
  moduleId: string
): Promise<{
  userId: string
  tenantId: string
  licensedModules: string[]
  subscriptionTier: string
}> {
  // Get token from Authorization header
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new LicenseError(moduleId, 'No authorization token provided')
  }

  const token = authHeader.substring(7)
  
  try {
    // Verify and decode token
    const payload = verifyToken(token)
    
    if (!payload.tenantId) {
      throw new LicenseError(moduleId, 'Invalid token: missing tenantId')
    }

    // Get licensed modules from token
    const licensedModules = payload.licensedModules || []
    const subscriptionTier = payload.subscriptionTier || 'free'

    // Check if module is licensed
    if (!licensedModules.includes(moduleId)) {
      throw new LicenseError(
        moduleId,
        `Module '${moduleId}' is not licensed. Licensed modules: ${licensedModules.join(', ') || 'none'}`
      )
    }

    // Check if subscription is active (free tier is always active)
    if (subscriptionTier === 'free' && licensedModules.length === 0) {
      // Free tier with no modules - allow access but log it
      console.warn(`Free tier user accessing module ${moduleId} without license`)
    }

    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      licensedModules,
      subscriptionTier,
    }
  } catch (error) {
    if (error instanceof LicenseError) {
      throw error
    }
    
    // If token verification failed, throw license error
    throw new LicenseError(moduleId, 'Invalid or expired token')
  }
}

/**
 * Middleware wrapper for API routes that require module access
 * 
 * Usage:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const { tenantId } = await requireModuleAccess(request, 'crm')
 *   // ... rest of route logic
 * }
 * ```
 */
export async function requireModuleAccess(
  request: NextRequest,
  moduleId: string
): Promise<{
  userId: string
  tenantId: string
  licensedModules: string[]
  subscriptionTier: string
}> {
  try {
    return await checkModuleAccess(request, moduleId)
  } catch (error) {
    if (error instanceof LicenseError) {
      throw error
    }
    throw new LicenseError(moduleId, 'Failed to verify module access')
  }
}

/**
 * Helper to check if a module is licensed (non-throwing)
 * Returns true if licensed, false otherwise
 */
export async function hasModuleAccess(
  request: NextRequest,
  moduleId: string
): Promise<boolean> {
  try {
    await checkModuleAccess(request, moduleId)
    return true
  } catch {
    return false
  }
}

/**
 * Error handler for LicenseError
 * Returns appropriate HTTP response (403 Forbidden)
 */
export function handleLicenseError(error: unknown): NextResponse {
  if (error instanceof LicenseError) {
    return NextResponse.json(
      {
        error: error.message,
        code: 'MODULE_NOT_LICENSED',
        moduleId: error.moduleId,
      },
      { status: 403 }
    )
  }

  // Unknown error
  return NextResponse.json(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    { status: 500 }
  )
}
