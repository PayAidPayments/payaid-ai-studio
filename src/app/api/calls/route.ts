import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@payaid/db'
import { authenticateRequest } from '@/lib/middleware/auth'
import { z } from 'zod'

const createCallSchema = z.object({
  phoneNumber: z.string().min(1),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('INBOUND'),
})

// GET /api/calls - List all calls
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {
      tenantId: user.tenantId,
    }

    if (status) where.status = status

    const [calls, total] = await Promise.all([
      prisma.aICall.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              recordings: true,
              transcripts: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
      }),
      prisma.aICall.count({ where }),
    ])

    return NextResponse.json({
      calls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get calls error:', error)
    return NextResponse.json(
      { error: 'Failed to get calls' },
      { status: 500 }
    )
  }
}

// POST /api/calls - Create a new call (for outbound)
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validated = createCallSchema.parse(body)

    // TODO: Integrate with Twilio to initiate call
    // For now, create call record
    const call = await prisma.aICall.create({
      data: {
        phoneNumber: validated.phoneNumber,
        direction: validated.direction,
        status: 'RINGING',
        handledByAI: true,
        tenantId: user.tenantId,
      },
    })

    return NextResponse.json(call, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Create call error:', error)
    return NextResponse.json(
      { error: 'Failed to create call' },
      { status: 500 }
    )
  }
}
