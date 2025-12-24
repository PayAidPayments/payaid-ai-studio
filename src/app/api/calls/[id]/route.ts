import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@payaid/db'
import { authenticateRequest } from '@/lib/middleware/auth'

// GET /api/calls/[id] - Get single call
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const call = await prisma.aICall.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        recordings: {
          orderBy: { createdAt: 'desc' },
        },
        transcripts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!call) {
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(call)
  } catch (error) {
    console.error('Get call error:', error)
    return NextResponse.json(
      { error: 'Failed to get call' },
      { status: 500 }
    )
  }
}
