import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { aiGateway } from '@/lib/ai/gateway'
import { prisma } from '@payaid/db'

// GET /api/ai/usage - Get AI service usage statistics
export async function GET(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    // Get token from request headers
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    if (token) {
      aiGateway.setToken(token)
    }

    // Try to get usage from gateway (Redis)
    let gatewayUsage = null
    try {
      gatewayUsage = await aiGateway.getUsage()
    } catch (error) {
      console.warn('Gateway usage not available:', error)
    }

    // Get usage from database
    const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    
    const dbUsage = await prisma.aIUsage.groupBy({
      by: ['service'],
      where: {
        tenantId: tenantId,
        createdAt: {
          gte: startOfMonth,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        tokens: true,
      },
    })

    // Format usage data
    const usageByService: Record<string, { count: number; tokens: number }> = {}
    let totalCount = 0
    let totalTokens = 0

    dbUsage.forEach((item) => {
      usageByService[item.service] = {
        count: item._count.id,
        tokens: item._sum.tokens || 0,
      }
      totalCount += item._count.id
      totalTokens += item._sum.tokens || 0
    })

    return NextResponse.json({
      month: currentMonth,
      usage: usageByService,
      total: {
        count: totalCount,
        tokens: totalTokens,
      },
      gateway: gatewayUsage, // Include gateway stats if available
    })
  } catch (error) {
    console.error('Usage retrieval error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve usage', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
