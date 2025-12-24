import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { getNanoBananaClient } from '@/lib/ai/nanobanana'
import { z } from 'zod'

const editImageSchema = z.object({
  imageBase64: z.string().min(1),
  imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']).optional().default('image/png'),
  editPrompt: z.string().min(1),
})

// POST /api/ai/nanobanana/edit-image - Edit existing image with text prompt
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const body = await request.json()
    const validated = editImageSchema.parse(body)

    const client = getNanoBananaClient()

    if (!client.isAvailable()) {
      return NextResponse.json({
        error: 'Nano Banana service not configured',
        message: 'GEMINI_API_KEY is not set in your .env file.',
        hint: 'Get API key from https://aistudio.google.com/app/apikey and add to .env: GEMINI_API_KEY="AIza_xxx"',
      }, { status: 503 })
    }

    // Convert base64 to buffer
    const base64Data = validated.imageBase64.includes(',')
      ? validated.imageBase64.split(',')[1]
      : validated.imageBase64
    const imageBuffer = Buffer.from(base64Data, 'base64')

    console.log('✏️ Editing image with Nano Banana:', {
      editPrompt: validated.editPrompt.substring(0, 100),
      imageSize: imageBuffer.length,
    })

    const result = await client.editImage({
      imageBuffer,
      imageMimeType: validated.imageMimeType,
      editPrompt: validated.editPrompt,
    })

    return NextResponse.json({
      success: true,
      imageUrl: result.image_url,
      base64: result.base64,
      prompt: validated.editPrompt,
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

    console.error('Image edit error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Image edit failed',
      hint: 'Check your GEMINI_API_KEY is valid and has quota available',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
