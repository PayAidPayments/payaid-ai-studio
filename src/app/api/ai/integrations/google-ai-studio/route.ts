import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'

// DELETE /api/ai/integrations/google-ai-studio - Disconnect Google AI Studio
export async function DELETE(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const integration = await prisma.oAuthIntegration.findUnique({
      where: {
        tenantId_provider: {
          tenantId: tenantId,
          provider: 'google-ai-studio',
        },
      },
    })

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      )
    }

    await prisma.oAuthIntegration.delete({
      where: { id: integration.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to disconnect Google AI Studio:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    )
  }
}
