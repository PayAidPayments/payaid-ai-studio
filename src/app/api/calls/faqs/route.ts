import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@payaid/db'
import { authenticateRequest } from '@/lib/middleware/auth'
import { z } from 'zod'

const createFAQSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().optional(),
})

// GET /api/calls/faqs - List all FAQs
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')
    const isActive = searchParams.get('isActive')

    const where: any = {
      tenantId: user.tenantId,
    }

    if (category) where.category = category
    if (isActive !== null) where.isActive = isActive === 'true'

    const faqs = await prisma.callFAQ.findMany({
      where,
      orderBy: [
        { timesUsed: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({ faqs })
  } catch (error) {
    console.error('Get FAQs error:', error)
    return NextResponse.json(
      { error: 'Failed to get FAQs' },
      { status: 500 }
    )
  }
}

// POST /api/calls/faqs - Create FAQ
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validated = createFAQSchema.parse(body)

    const faq = await prisma.callFAQ.create({
      data: {
        question: validated.question,
        answer: validated.answer,
        category: validated.category,
        tenantId: user.tenantId,
      },
    })

    return NextResponse.json(faq, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Create FAQ error:', error)
    return NextResponse.json(
      { error: 'Failed to create FAQ' },
      { status: 500 }
    )
  }
}
