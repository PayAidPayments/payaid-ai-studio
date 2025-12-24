import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { aiGateway } from '@/lib/ai/gateway'
import { z } from 'zod'

const img2imgSchema = z.object({
  image_url: z.string().url(),
  prompt: z.string().min(1),
  strength: z.number().min(0).max(1).optional(),
  num_inference_steps: z.number().int().min(1).max(100).optional(),
})

// POST /api/ai/image-to-image - Transform image using AI
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const body = await request.json()
    const validated = img2imgSchema.parse(body)

    // Note: Self-hosted Docker image-to-image removed - using cloud APIs only
    // (Hugging Face Docker services removed due to space constraints)
    
    // Try Hugging Face Cloud API for image-to-image
    const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY
    if (huggingFaceApiKey) {
      try {
        console.log('🖼️ Attempting image-to-image via Hugging Face Cloud API...')
        // Note: Hugging Face Cloud API may not support image-to-image directly
        // This would need to be implemented using their inference API
        return NextResponse.json({
          error: 'Image-to-image via cloud API not yet implemented',
          message: 'Hugging Face Docker services have been removed. Image-to-image transformation is not available via cloud APIs yet.',
          hint: 'Use /api/ai/generate-image endpoint for text-to-image generation instead',
          alternatives: [
            'Use text-to-image generation with a detailed prompt describing the transformation',
            'Use image editing tools for basic transformations',
          ],
        }, { status: 501 })
      } catch (error) {
        console.error('❌ Hugging Face API error:', error)
        return NextResponse.json(
          { error: 'Image-to-image service unavailable', details: error instanceof Error ? error.message : String(error) },
          { status: 503 }
        )
      }
    }

    // Fallback: Service not configured
    return NextResponse.json({
      error: 'Image-to-image service not configured',
      message: 'Hugging Face Docker services have been removed. Please use cloud APIs for image generation.',
      hint: 'Configure HUGGINGFACE_API_KEY in .env or use Google AI Studio via Settings > AI Integrations',
      note: 'Image-to-image transformation is not available via cloud APIs. Use text-to-image generation instead.',
    }, { status: 503 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Image-to-image error:', error)
    return NextResponse.json(
      { error: 'Failed to transform image', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
