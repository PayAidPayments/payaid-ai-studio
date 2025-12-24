/**
 * @payaid/db - Shared Database Client
 * 
 * Prisma client for core models (User, Tenant, Subscription, ModuleDefinition)
 * Each module will have its own Prisma schema for module-specific models
 */

import { PrismaClient } from '@prisma/client'

// Create singleton Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Re-export Prisma types
export * from '@prisma/client'
