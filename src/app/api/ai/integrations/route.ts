import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'

// GET /api/ai/integrations - Get all AI integrations for the current tenant
export async function GET(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const integrations = await prisma.oAuthIntegration.findMany({
      where: {
        tenantId: tenantId,
      },
      select: {
        id: true,
        provider: true,
        providerEmail: true,
        providerName: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        // Don't return sensitive tokens
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Check tenant-specific Google AI Studio API key (not global)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { googleAiStudioApiKey: true },
    })

    const googleAiStudioConfigured = !!tenant?.googleAiStudioApiKey

    return NextResponse.json({ 
      integrations,
      configurations: {
        'google-ai-studio': {
          configured: googleAiStudioConfigured,
          method: 'api-key', // Per-tenant API key (each tenant uses their own)
        },
      },
    })
  } catch (error) {
    console.error('Failed to fetch integrations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    )
  }
}
