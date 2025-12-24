import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { aiGateway } from '@/lib/ai/gateway'
import { z } from 'zod'

const sttSchema = z.object({
  audio_url: z.string().url(),
  language: z.string().optional(),
  task: z.enum(['transcribe', 'translate']).optional(),
})

// POST /api/ai/speech-to-text - Convert speech to text
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const body = await request.json()
    const validated = sttSchema.parse(body)

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
        console.log('🎤 Attempting STT via AI Gateway...')
        const result = await aiGateway.speechToText({
          audio_url: validated.audio_url,
          language: validated.language,
          task: validated.task,
        })
        
        console.log('✅ STT completed successfully via AI Gateway')
        return NextResponse.json({
          text: result.text,
          language: result.language,
          segments: result.segments,
          service: result.service || 'self-hosted',
        })
      } catch (gatewayError) {
        console.error('❌ AI Gateway error:', gatewayError)
        return NextResponse.json(
          { error: 'STT service unavailable', details: gatewayError instanceof Error ? gatewayError.message : String(gatewayError) },
          { status: 503 }
        )
      }
    }

    // Fallback: Service not configured
    return NextResponse.json({
      error: 'STT service not configured',
      message: 'Please configure AI_GATEWAY_URL or USE_AI_GATEWAY=true in your .env file',
    }, { status: 503 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('STT error:', error)
    return NextResponse.json(
      { error: 'Failed to transcribe audio', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
