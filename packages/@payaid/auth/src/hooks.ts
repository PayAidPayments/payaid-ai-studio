'use client'

import { useMemo } from 'react'
import { decodeToken, JWTPayload } from './jwt'

/**
 * Custom hook for PayAid authentication with module licensing
 * 
 * Note: This hook requires the auth store to be available in the module
 * Each module should implement its own auth store or use a shared one
 */
export interface UsePayAidAuthOptions {
  token?: string | null
  tenant?: {
    licensedModules?: string[]
    subscriptionTier?: string
  } | null
}

export function usePayAidAuth(options?: UsePayAidAuthOptions) {
  const { token, tenant } = options || {}

  // Extract licensed modules from JWT token
  const licensedModules = useMemo(() => {
    if (!token) return []
    
    try {
      const decoded = decodeToken(token) as JWTPayload & {
        licensedModules?: string[]
        subscriptionTier?: string
      }
      return decoded.licensedModules || []
    } catch {
      // Fallback to tenant data if JWT decode fails
      return tenant?.licensedModules || []
    }
  }, [token, tenant])

  // Extract subscription tier from JWT token
  const subscriptionTier = useMemo(() => {
    if (!token) return 'free'
    
    try {
      const decoded = decodeToken(token) as JWTPayload & {
        licensedModules?: string[]
        subscriptionTier?: string
      }
      return decoded.subscriptionTier || 'free'
    } catch {
      // Fallback to tenant data if JWT decode fails
      return tenant?.subscriptionTier || 'free'
    }
  }, [token, tenant])

  /**
   * Check if user has access to a specific module
   */
  const hasModule = (moduleId: string): boolean => {
    return licensedModules.includes(moduleId)
  }

  /**
   * Check if user has access to any of the provided modules
   */
  const hasAnyModule = (moduleIds: string[]): boolean => {
    return moduleIds.some(id => licensedModules.includes(id))
  }

  /**
   * Check if user has access to all of the provided modules
   */
  const hasAllModules = (moduleIds: string[]): boolean => {
    return moduleIds.every(id => licensedModules.includes(id))
  }

  return {
    licensedModules,
    subscriptionTier,
    hasModule,
    hasAnyModule,
    hasAllModules,
    isAuthenticated: !!token,
  }
}
