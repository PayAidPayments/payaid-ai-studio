import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { aiGateway } from '@/lib/ai/gateway'
import { z } from 'zod'

const img2textSchema = z.object({
  image_url: z.string().url(),
  task: z.enum(['caption', 'ocr', 'both']).optional(),
})

// POST /api/ai/image-to-text - Extract text or generate caption from image
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const body = await request.json()
    const validated = img2textSchema.parse(body)

    // Get token from request headers
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    if (token) {
      aiGateway.setToken(token)
    }

    // Try self-hosted gateway first
    const useGateway = process.env.AI_GATEWAY_URL || process.env.USE_AI_GATEWAY === 'true'
    
    if (useGateway) {
      try {
        console.log('📝 Attempting image-to-text via AI Gateway...')
        const result = await aiGateway.imageToText({
          image_url: validated.image_url,
          task: validated.task,
        })
        
        console.log('✅ Image-to-text completed successfully via AI Gateway')
        return NextResponse.json({
          caption: result.caption,
          ocrText: result.ocr_text,
          service: result.service || 'self-hosted',
        })
      } catch (gatewayError) {
        console.error('❌ AI Gateway error:', gatewayError)
        return NextResponse.json(
          { error: 'Image-to-text service unavailable', details: gatewayError instanceof Error ? gatewayError.message : String(gatewayError) },
          { status: 503 }
        )
      }
    }

    // Fallback: Service not configured
    return NextResponse.json({
      error: 'Image-to-text service not configured',
      message: 'Please configure AI_GATEWAY_URL or USE_AI_GATEWAY=true in your .env file',
    }, { status: 503 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Image-to-text error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze image', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
