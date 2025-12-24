import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { aiGateway } from '@/lib/ai/gateway'
import { getHuggingFaceClient } from '@/lib/ai/huggingface'
import { getNanoBananaClient } from '@/lib/ai/nanobanana'
import { prisma } from '@payaid/db'
import { enhanceImagePrompt } from '@/lib/ai/prompt-enhancer'
import { analyzePromptContext } from '@/lib/ai/context-analyzer'
import { z } from 'zod'

const generateImageSchema = z.object({
  prompt: z.string().min(1),
  style: z.string().optional(),
  size: z.string().optional(),
})

// POST /api/ai/generate-image - Generate image using AI
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const body = await request.json()
    const validated = generateImageSchema.parse(body)

    // Get token from request headers
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    if (token) {
      aiGateway.setToken(token)
    }

    // Get provider preference from request (default: auto-detect)
    const provider = body.provider || 'auto' // 'auto', 'self-hosted', 'google-ai-studio', 'huggingface' (free options only)

    // If Nano Banana is explicitly selected, use it directly
    if (provider === 'nanobanana') {
      const nanoBanana = getNanoBananaClient()
      
      if (!nanoBanana.isAvailable()) {
        return NextResponse.json({
          error: 'Nano Banana service not configured',
          message: 'GEMINI_API_KEY is not set in your .env file.',
          hint: 'Get API key from https://aistudio.google.com/app/apikey and add to .env: GEMINI_API_KEY="AIza_xxx"',
        }, { status: 503 })
      }
      
      try {
        console.log('🎨 Attempting image generation with Nano Banana (explicit selection)...')
        
        const result = await nanoBanana.generateImage({
          prompt: validated.prompt,
          style: validated.style,
          size: validated.size,
        })
        
        console.log('✅ Image generated successfully with Nano Banana')
        return NextResponse.json({
          imageUrl: result.image_url,
          revisedPrompt: result.revised_prompt,
          service: result.service,
          processingTimeMs: result.processingTimeMs,
          costInINR: result.costInINR,
        })
      } catch (nanoBananaError) {
        console.error('❌ Nano Banana error:', nanoBananaError)
        const errorMessage = nanoBananaError instanceof Error ? nanoBananaError.message : String(nanoBananaError)
        
        let hint = `Nano Banana API call failed: ${errorMessage}`
        
        if (errorMessage.includes('API_KEY') || errorMessage.includes('API key')) {
          hint += '\n\nPlease verify your GEMINI_API_KEY is correct at https://aistudio.google.com/app/apikey'
        } else if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
          hint += '\n\nCheck your usage and quota at https://ai.dev/usage'
        }
        
        return NextResponse.json({
          error: 'Nano Banana API error',
          message: errorMessage,
          hint,
          details: process.env.NODE_ENV === 'development' && nanoBananaError instanceof Error ? { 
            name: nanoBananaError.name, 
            message: nanoBananaError.message,
            stack: nanoBananaError.stack 
          } : undefined,
        }, { status: 500 })
      }
    }

    // If Hugging Face is explicitly selected, use it directly (skip gateway)
    if (provider === 'huggingface') {
      const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY
      if (!huggingFaceApiKey) {
        return NextResponse.json({
          error: 'Hugging Face Inference API key not configured',
          message: 'HUGGINGFACE_API_KEY is not set in your .env file.',
          hint: 'Add HUGGINGFACE_API_KEY to your .env file:\n\n1. Get API key from https://huggingface.co/settings/tokens\n2. Add to .env: HUGGINGFACE_API_KEY="hf_your_token"\n3. Optional: Set HUGGINGFACE_IMAGE_MODEL (default: ByteDance/SDXL-Lightning)\n4. Restart dev server: npm run dev',
        }, { status: 503 })
      }
      
      try {
        console.log('🎨 Attempting image generation with Hugging Face Inference API (explicit selection)...')
        console.log('🔑 Hugging Face API key found:', huggingFaceApiKey.substring(0, 10) + '...')
        
        const huggingFace = getHuggingFaceClient()
        const result = await huggingFace.textToImage({
          prompt: validated.prompt,
          style: validated.style,
          size: validated.size,
        })
        
        console.log('✅ Image generated successfully with Hugging Face Inference API')
        return NextResponse.json({
          imageUrl: result.image_url,
          revisedPrompt: result.revised_prompt,
          service: result.service,
        })
      } catch (huggingFaceError) {
        console.error('❌ Hugging Face Inference API error:', huggingFaceError)
        const errorMessage = huggingFaceError instanceof Error ? huggingFaceError.message : String(huggingFaceError)
        console.error('❌ Full error stack:', huggingFaceError instanceof Error ? huggingFaceError.stack : 'No stack trace')
        
        // Extract more helpful information from error
        let hint = `Hugging Face API call failed: ${errorMessage}`
        
        if (errorMessage.includes('loading')) {
          hint += '\n\nThe model is currently loading. Please wait a moment and try again.'
        } else if (errorMessage.includes('Authentication')) {
          hint += '\n\nPlease verify your HUGGINGFACE_API_KEY is correct and active at https://huggingface.co/settings/tokens'
        } else if (errorMessage.includes('not found')) {
          hint += `\n\nThe model "${process.env.HUGGINGFACE_IMAGE_MODEL || 'ByteDance/SDXL-Lightning'}" may not be available. Try a different model in .env: HUGGINGFACE_IMAGE_MODEL="black-forest-labs/FLUX.1-dev"`
        } else {
          hint += `\n\nPlease check:\n1. Your HUGGINGFACE_API_KEY is valid\n2. The API key has access to image generation models\n3. The model "${process.env.HUGGINGFACE_IMAGE_MODEL || 'ByteDance/SDXL-Lightning'}" is available\n4. Check server logs for detailed error information`
        }
        
        return NextResponse.json({
          error: 'Hugging Face Inference API error',
          message: errorMessage,
          hint,
          details: process.env.NODE_ENV === 'development' && huggingFaceError instanceof Error ? { 
            name: huggingFaceError.name, 
            message: huggingFaceError.message,
            stack: huggingFaceError.stack 
          } : undefined,
        }, { status: 500 })
      }
    }

    // Note: Self-hosted Docker image generation removed - using cloud APIs only
    // (Hugging Face Docker services removed due to space constraints)

    // Try Google AI Studio (if selected or auto)
    // Check if tenant has their own API key configured
    const shouldUseGoogle = provider === 'auto' || provider === 'google-ai-studio'
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { googleAiStudioApiKey: true },
    })
    
    if (shouldUseGoogle && tenant?.googleAiStudioApiKey) {
      try {
        console.log('🎨 Attempting image generation with Google AI Studio...')
        
        // Call Google AI Studio API
        const baseUrl = process.env.APP_URL || 'http://localhost:3000'
        const googleResponse = await fetch(`${baseUrl}/api/ai/google-ai-studio/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('authorization') || '',
          },
          body: JSON.stringify({
            prompt: validated.prompt,
            style: validated.style,
            size: validated.size,
          }),
        })

        if (googleResponse.ok) {
          const googleData = await googleResponse.json()
          console.log('✅ Image generated successfully with Google AI Studio')
          return NextResponse.json(googleData)
        }
        // If Google fails but provider is auto, fall through to other options
        if (provider === 'google-ai-studio') {
          const errorData = await googleResponse.json().catch(() => ({}))
          return NextResponse.json(errorData, { status: googleResponse.status })
        }
      } catch (googleError) {
        console.error('❌ Google AI Studio error:', googleError)
        // If explicitly selected, return error
        if (provider === 'google-ai-studio') {
          return NextResponse.json({
            error: 'Google AI Studio error',
            message: googleError instanceof Error ? googleError.message : String(googleError),
            hint: 'Please check your API key in Settings > AI Integrations. Make sure it\'s valid and not expired.',
            details: googleError instanceof Error ? { name: googleError.name, stack: googleError.stack } : undefined,
          }, { status: 500 })
        }
        // Fall through to other providers if auto
      }
    }

    // Try Hugging Face Inference API (if selected or auto)
    // Only try if not already handled above (when explicitly selected)
    if (provider === 'auto') {
      const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY
      
      if (huggingFaceApiKey) {
        try {
          console.log('🎨 Attempting image generation with Hugging Face Inference API (auto fallback)...')
          console.log('🔑 Hugging Face API key found:', huggingFaceApiKey.substring(0, 10) + '...')
          
          const huggingFace = getHuggingFaceClient()
          const result = await huggingFace.textToImage({
            prompt: validated.prompt,
            style: validated.style,
            size: validated.size,
          })
          
          console.log('✅ Image generated successfully with Hugging Face Inference API')
          return NextResponse.json({
            imageUrl: result.image_url,
            revisedPrompt: result.revised_prompt,
            service: result.service,
          })
        } catch (huggingFaceError) {
          console.error('❌ Hugging Face Inference API error (auto fallback):', huggingFaceError)
          const errorMessage = huggingFaceError instanceof Error ? huggingFaceError.message : String(huggingFaceError)
          console.error('❌ Error details:', errorMessage)
          console.error('❌ Full error:', huggingFaceError)
          console.error('❌ Full error stack:', huggingFaceError instanceof Error ? huggingFaceError.stack : 'No stack trace')
          // Continue to error message below - but include info that Hugging Face was tried
        }
      } else {
        console.log('⚠️ Hugging Face API key not found in environment variables')
      }
    }

    // No image generation service configured
    // Note: Self-hosted Docker image generation has been removed (cloud-only now)
    const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY
    const hasHuggingFace = !!huggingFaceApiKey
    const nanoBanana = getNanoBananaClient()
    const hasNanoBanana = nanoBanana.isAvailable()
    
    let errorMessage = 'Image generation service not configured.'
    let hint = ''
    
    // Check provider-specific errors
    if (provider === 'self-hosted') {
      errorMessage = 'Self-hosted image generation is no longer available. Docker services for image generation have been removed.'
      hint = 'Please use cloud APIs instead:\n- Google AI Studio (free, per-tenant API key)\n- Hugging Face Cloud API (free tier)\n\nSee CLOUD_ONLY_SETUP.md for details.'
    } else if (provider === 'google-ai-studio') {
      errorMessage = 'Google AI Studio API key is not configured for your account. Each tenant must use their own API key.'
      hint = 'Get your free API key from https://aistudio.google.com/app/apikey\n\n1. Go to https://aistudio.google.com/app/apikey\n2. Click "Create API Key"\n3. Copy the API key\n4. Go to Settings > AI Integrations\n5. Add your API key in the Google AI Studio section'
    } else if (provider === 'nanobanana') {
      if (!hasNanoBanana) {
        errorMessage = 'Nano Banana API key is not configured.'
        hint = 'Get API key from https://aistudio.google.com/app/apikey and add to .env:\n\n1. Go to https://aistudio.google.com/app/apikey\n2. Click "Create API Key"\n3. Copy the API key\n4. Add to .env: GEMINI_API_KEY="AIza_xxx"\n5. Restart dev server: npm run dev'
      } else {
        errorMessage = 'Nano Banana image generation failed. Please check your API key and try again.'
        hint = 'Your GEMINI_API_KEY is configured, but image generation failed. Please check:\n1. API key is valid\n2. Server has been restarted after adding the key\n3. Check server logs for detailed error messages'
      }
    } else if (provider === 'huggingface') {
      if (!hasHuggingFace) {
        errorMessage = 'Hugging Face Inference API key is not configured.'
        hint = 'Add HUGGINGFACE_API_KEY to your .env file:\n\n1. Get API key from https://huggingface.co/settings/tokens\n2. Add to .env: HUGGINGFACE_API_KEY="hf_your_token"\n3. Optional: Set HUGGINGFACE_IMAGE_MODEL (default: ByteDance/SDXL-Lightning)\n4. Restart dev server: npm run dev'
      } else {
        // This shouldn't happen - if we got here, Hugging Face failed
        errorMessage = 'Hugging Face image generation failed. Please check your API key and try again.'
        hint = 'Your HUGGINGFACE_API_KEY is configured, but image generation failed. Please check:\n1. API key is valid\n2. Server has been restarted after adding the key\n3. Check server logs for detailed error messages'
      }
    } else {
      // Auto mode - check what's available
      if (hasHuggingFace) {
        // Hugging Face is configured but failed - this is unexpected
        errorMessage = 'Image generation failed. Hugging Face API key is configured, but generation failed.'
        hint = 'Your HUGGINGFACE_API_KEY is set, but image generation failed. Please:\n1. Check server logs for detailed error messages\n2. Verify your API key is valid at https://huggingface.co/settings/tokens\n3. Try restarting the dev server: npm run dev\n\nAlternatively, you can configure Google AI Studio in Settings > AI Integrations.'
      } else {
        // Nothing configured
        errorMessage = 'Image generation service not configured. Please configure one of these free cloud services:\n\n1. Google AI Studio: Get free key from https://aistudio.google.com/app/apikey (Recommended)\n2. Hugging Face: Get free key from https://huggingface.co/settings/tokens'
        hint = 'Image generation requires one of:\n- Google AI Studio API key (free, per-tenant - add via Dashboard > Settings > AI Integrations)\n- Hugging Face API key (free, cloud-based - add to .env file)\n\nNote: Self-hosted Docker image generation has been removed. See CLOUD_ONLY_SETUP.md for details.'
      }
    }
    
    return NextResponse.json({
      error: 'Image generation service not configured',
      message: errorMessage,
      hint,
      setupInstructions: {
        nanoBanana: {
          url: 'https://aistudio.google.com/app/apikey',
          steps: [
            '1. Go to https://aistudio.google.com/app/apikey',
            '2. Click "Create API Key"',
            '3. Copy the API key',
            '4. Add to .env: GEMINI_API_KEY="AIza_xxx"',
            '5. Restart dev server: npm run dev',
          ],
          cost: '₹3.23 per image (~$0.039 USD)',
          features: 'Superior quality, faster (5-10s), image editing, multi-image fusion',
        },
        googleAiStudio: {
          url: 'https://aistudio.google.com/app/apikey',
          steps: [
            '1. Go to https://aistudio.google.com/app/apikey',
            '2. Click "Create API Key"',
            '3. Copy the API key',
            '4. Go to Dashboard > Settings > AI Integrations',
            '5. Add your API key in the Google AI Studio section',
          ],
        },
        huggingFace: {
          url: 'https://huggingface.co/settings/tokens',
          steps: [
            '1. Get API key from https://huggingface.co/settings/tokens',
            '2. Add to .env: HUGGINGFACE_API_KEY="hf_your_token"',
            '3. Optional: Set HUGGINGFACE_IMAGE_MODEL (default: ByteDance/SDXL-Lightning)',
            '4. Restart dev server: npm run dev',
          ],
        },
      },
    }, { status: 503 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Image generation error:', error)
    
    // Provide more helpful error messages
    let errorMessage = 'Failed to generate image'
    let hint = ''
    
    if (error instanceof Error) {
      errorMessage = error.message || errorMessage
      
      // Check for common error patterns
      if (error.message.includes('decrypt') || error.message.includes('ENCRYPTION_KEY')) {
        hint = 'Server encryption is not configured. Please contact support.'
      } else if (error.message.includes('fetch') || error.message.includes('network')) {
        hint = 'Network error. Please check your internet connection and try again.'
      } else if (error.message.includes('timeout')) {
        hint = 'Request timed out. Please try again.'
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to generate image',
        message: errorMessage,
        hint,
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
