import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { aiGateway } from '@/lib/ai/gateway'
import { z } from 'zod'

const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
  language: z.string().optional(),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
})

// POST /api/ai/text-to-speech - Convert text to speech
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireModuleAccess(request, 'ai-studio')

    const body = await request.json()
    const validated = ttsSchema.parse(body)

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
        console.log('🔊 Attempting TTS via AI Gateway...')
        const result = await aiGateway.textToSpeech({
          text: validated.text,
          language: validated.language,
          voice: validated.voice,
          speed: validated.speed,
        })
        
        console.log('✅ TTS generated successfully via AI Gateway')
        return NextResponse.json({
          audioUrl: result.audio_url,
          duration: result.duration,
          service: result.service || 'self-hosted',
        })
      } catch (gatewayError) {
        console.error('❌ AI Gateway error:', gatewayError)
        return NextResponse.json(
          { error: 'TTS service unavailable', details: gatewayError instanceof Error ? gatewayError.message : String(gatewayError) },
          { status: 503 }
        )
      }
    }

    // Fallback: Service not configured
    return NextResponse.json({
      error: 'TTS service not configured',
      message: 'Please configure AI_GATEWAY_URL or USE_AI_GATEWAY=true in your .env file',
    }, { status: 503 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('TTS error:', error)
    return NextResponse.json(
      { error: 'Failed to generate speech', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
