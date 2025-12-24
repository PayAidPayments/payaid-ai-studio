'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ProtectedRouteProps {
  children: React.ReactNode
  isAuthenticated: boolean
  redirectTo?: string
}

/**
 * ProtectedRoute Component
 * 
 * Redirects to login if user is not authenticated
 */
export function ProtectedRoute({
  children,
  isAuthenticated,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated) {
      router.push(redirectTo)
    }
  }, [isAuthenticated, redirectTo, router])

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
