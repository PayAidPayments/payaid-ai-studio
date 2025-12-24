/**
 * @payaid/types - Shared TypeScript Types
 * 
 * Common types and interfaces used across all PayAid modules
 */

// Auth types
export interface User {
  id: string
  email: string
  name: string
  role: string
  tenantId: string
  createdAt: Date
  updatedAt: Date
}

export interface Tenant {
  id: string
  name: string
  subdomain?: string | null
  domain?: string | null
  plan: string
  status: string
  licensedModules: string[]
  subscriptionTier: string
  createdAt: Date
  updatedAt: Date
}

export interface Subscription {
  id: string
  tenantId: string
  modules: string[]
  tier: string
  monthlyPrice: number
  billingCycleStart: Date
  billingCycleEnd: Date
  status: string
  trialEndsAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ModuleDefinition {
  id: string
  moduleId: string
  displayName: string
  description: string
  icon?: string | null
  starterPrice: number
  professionalPrice: number
  enterprisePrice?: number | null
  features: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// JWT types
export interface JWTPayload {
  userId: string
  tenantId: string
  email: string
  role: string
  licensedModules?: string[]
  subscriptionTier?: string
}

// License types
export interface LicenseInfo {
  userId: string
  tenantId: string
  licensedModules: string[]
  subscriptionTier: string
}

// API response types
export interface ApiResponse<T = any> {
  data?: T
  error?: string
  code?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// Module IDs (V2 - 8 Module Structure)
export type ModuleId = 
  | 'crm' 
  | 'sales' 
  | 'marketing' 
  | 'finance' 
  | 'hr' 
  | 'communication' 
  | 'ai-studio' 
  | 'analytics'
  // Legacy module IDs (backward compatibility - will be removed)
  | 'invoicing' 
  | 'accounting' 
  | 'whatsapp'

// Subscription tiers
export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise'
