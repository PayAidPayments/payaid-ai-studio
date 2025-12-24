import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { getNanoBananaClient } from '@/lib/ai/nanobanana'
import { z } from 'zod'

const fuseImagesSchema = z.object({
  images: z.array(z.object({
    base64: z.string().min(1),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  })).min(2),
  fusionPrompt: z.string().min(1),
})

// POST /api/ai/nanobanana/fuse-images - Blend multiple images together
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const body = await request.json()
    const validated = fuseImagesSchema.parse(body)

    const client = getNanoBananaClient()

    if (!client.isAvailable()) {
      return NextResponse.json({
        error: 'Nano Banana service not configured',
        message: 'GEMINI_API_KEY is not set in your .env file.',
        hint: 'Get API key from https://aistudio.google.com/app/apikey and add to .env: GEMINI_API_KEY="AIza_xxx"',
      }, { status: 503 })
    }

    // Convert all base64 to buffers
    const imageBuffers = validated.images.map(img => {
      const base64Data = img.base64.includes(',')
        ? img.base64.split(',')[1]
        : img.base64
      return Buffer.from(base64Data, 'base64')
    })
    const imageMimeTypes = validated.images.map(img => img.mimeType) as any[]

    console.log('🔀 Fusing images with Nano Banana:', {
      fusionPrompt: validated.fusionPrompt.substring(0, 100),
      imageCount: validated.images.length,
    })

    const result = await client.fuseImages({
      imageBuffers,
      imageMimeTypes,
      fusionPrompt: validated.fusionPrompt,
    })

    return NextResponse.json({
      success: true,
      imageUrl: result.image_url,
      base64: result.base64,
      prompt: validated.fusionPrompt,
      processingTimeMs: result.processingTimeMs,
      costInINR: result.costInINR,
      service: result.service,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Image fusion error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Image fusion failed',
      hint: 'Check your GEMINI_API_KEY is valid and has quota available',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
