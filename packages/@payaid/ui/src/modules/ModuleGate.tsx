'use client'

import { usePayAidAuth } from '@payaid/auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'

interface ModuleGateProps {
  module: string
  children: React.ReactNode
  fallback?: React.ReactNode
  redirectTo?: string
  token?: string | null
  tenant?: {
    licensedModules?: string[]
    subscriptionTier?: string
  } | null
}

/**
 * ModuleGate Component
 * 
 * Protects module-specific pages by checking license
 * Redirects to module management if not licensed
 */
export function ModuleGate({
  module,
  children,
  fallback,
  redirectTo,
  token,
  tenant,
}: ModuleGateProps) {
  const { hasModule, licensedModules, subscriptionTier } = usePayAidAuth({ token, tenant })
  const router = useRouter()

  const defaultRedirect = '/dashboard/admin/modules'
  const redirectPath = redirectTo || defaultRedirect

  useEffect(() => {
    if (!hasModule(module)) {
      router.push(redirectPath)
    }
  }, [module, hasModule, redirectPath, router])

  if (hasModule(module)) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="text-center max-w-md">
        <div className="mb-4">
          <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">🔒</span>
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Module Not Licensed
        </h2>
        
        <p className="text-gray-600 mb-6">
          You don't have access to the <strong>{getModuleName(module)}</strong> module.
          {licensedModules.length > 0 && (
            <span className="block mt-2 text-sm">
              Your current modules: {licensedModules.map(getModuleName).join(', ')}
            </span>
          )}
        </p>

        <div className="space-y-3">
          <Link
            href={redirectPath}
            className="inline-block w-full px-6 py-3 bg-[#F5C700] text-[#53328A] rounded-lg font-medium hover:bg-[#E0B200] transition-colors text-center"
          >
            Add Modules
          </Link>
          
          <Link
            href="/dashboard"
            className="inline-block w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
          >
            Back to Dashboard
          </Link>
        </div>

        {subscriptionTier === 'free' && (
          <p className="mt-6 text-sm text-gray-500">
            Visit Module Management to activate modules
          </p>
        )}
      </div>
    </div>
  )
}

function getModuleName(moduleId: string): string {
  const moduleNames: Record<string, string> = {
    crm: 'CRM',
    invoicing: 'Invoicing',
    accounting: 'Accounting',
    hr: 'HR & Payroll',
    whatsapp: 'WhatsApp',
    analytics: 'Analytics',
  }
  return moduleNames[moduleId] || moduleId.toUpperCase()
}
