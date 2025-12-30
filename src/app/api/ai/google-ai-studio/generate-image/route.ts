import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import { decrypt } from '@/lib/encryption'
import { enhanceImagePrompt } from '@/lib/ai/prompt-enhancer'
import { z } from 'zod'

const generateImageSchema = z.object({
  prompt: z.string().min(1),
  style: z.string().optional(),
  size: z.string().optional(),
})

// POST /api/ai/google-ai-studio/generate-image - Generate image using Google AI Studio (Gemini 2.5 Flash Image)
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireModuleAccess(request, 'ai-studio')

    const body = await request.json()
    const validated = generateImageSchema.parse(body)

    // Get tenant-specific API key (NO global fallback - each tenant must use their own key)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { googleAiStudioApiKey: true, name: true },
    })

    // Decrypt the API key (or use plain text if not encrypted)
    let apiKey: string | null = null
    if (tenant?.googleAiStudioApiKey) {
      // Check if the key is encrypted (format: "iv:encrypted") or plain text
      const isEncrypted = tenant.googleAiStudioApiKey.includes(':') && tenant.googleAiStudioApiKey.split(':').length === 2
      
      if (isEncrypted) {
        try {
          // Check if encryption key is configured
          if (!process.env.ENCRYPTION_KEY) {
            console.error('ENCRYPTION_KEY not set in environment variables')
            return NextResponse.json(
              {
                error: 'Encryption not configured',
                message: 'Server encryption key is not configured. Please contact support.',
                hint: 'ENCRYPTION_KEY must be set in server environment variables. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
              },
              { status: 500 }
            )
          }

          apiKey = decrypt(tenant.googleAiStudioApiKey)
        } catch (error) {
          console.error('Failed to decrypt API key:', error)
          return NextResponse.json(
            {
              error: 'API key decryption failed',
              message: 'Your API key could not be decrypted. This might be due to a server configuration issue or the encryption key changed.',
              hint: 'Please remove and re-add your API key in Settings > AI Integrations. This will encrypt it with the current encryption key.',
              details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
          )
        }
      } else {
        // Plain text key (backward compatibility - from before encryption was added)
        console.warn('⚠️ Using plain text API key (not encrypted). Please re-add the key to encrypt it.')
        apiKey = tenant.googleAiStudioApiKey
      }
    }
    
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'Google AI Studio not configured',
          message: 'Google AI Studio API key is not configured for your account. Each tenant must use their own API key.',
          hint: 'Get your free API key from https://aistudio.google.com/app/apikey and add it in Settings > AI Integrations',
          setupInstructions: {
            googleAiStudio: {
              steps: [
                '1. Go to https://aistudio.google.com/app/apikey',
                '2. Click "Create API Key"',
                '3. Select your Google Cloud project (or create a new one)',
                '4. Copy the API key',
                '5. Go to Settings > AI Integrations in your dashboard',
                '6. Add your API key in the Google AI Studio section',
              ],
            },
          },
        },
        { status: 403 }
      )
    }

    // Enhance prompt using AI to optimize for image generation
    console.log('🎨 Enhancing prompt with AI...')
    let enhancedPrompt: string
    let enhancementService: string
    
    try {
      const enhancement = await enhanceImagePrompt(
        validated.prompt,
        validated.style,
        validated.size
      )
      enhancedPrompt = enhancement.enhancedPrompt
      enhancementService = enhancement.service
      console.log(`✅ Prompt enhanced using ${enhancementService}`)
      console.log(`📝 Original: ${validated.prompt}`)
      console.log(`✨ Enhanced: ${enhancedPrompt.substring(0, 150)}...`)
    } catch (enhancementError) {
      console.error('⚠️ Prompt enhancement failed, using basic enhancement:', enhancementError)
      // Fallback to basic enhancement
      if (validated.style) {
        const styleMap: Record<string, string> = {
          realistic: 'photorealistic, professional photography style',
          artistic: 'artistic, creative, visually striking',
          cartoon: 'cartoon style, animated, colorful',
          minimalist: 'minimalist, clean, simple design',
          vintage: 'vintage style, retro aesthetic',
          modern: 'modern, contemporary design',
        }
        enhancedPrompt = `${validated.prompt}, ${styleMap[validated.style] || validated.style} style, high quality, detailed`
      } else {
        enhancedPrompt = `${validated.prompt}, high quality, detailed, professional`
      }
      enhancementService = 'basic'
    }

    // Call Google AI Studio Gemini 2.5 Flash Image API
    // Using API key authentication with x-goog-api-key header (recommended method)
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey, // Use header instead of query parameter (more secure)
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Generate an image: ${enhancedPrompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Google AI Studio API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      })

      // Provide helpful error messages based on common errors
      let errorMessage = errorData.error?.message || `API returned ${response.status}: ${response.statusText}`
      let hint = ''

      if (response.status === 400) {
        if (errorData.error?.message?.includes('API key')) {
          errorMessage = 'Invalid API key. Please check your API key in Settings > AI Integrations.'
          hint = 'Your API key may be incorrect or expired. Try removing and re-adding it.'
        } else if (errorData.error?.message?.includes('quota') || errorData.error?.message?.includes('limit')) {
          errorMessage = 'API quota exceeded. You may have reached your free tier limit.'
          hint = 'Check your Google AI Studio dashboard for usage limits. Free tier has generous limits but may be exhausted.'
        } else {
          errorMessage = errorData.error?.message || 'Invalid request to Google AI Studio API'
          hint = 'The request format may be incorrect. Please try again or contact support.'
        }
      } else if (response.status === 403) {
        errorMessage = 'API key access denied. Your API key may not have the required permissions.'
        hint = 'Ensure your API key has access to the Generative Language API in Google Cloud Console.'
      } else if (response.status === 429) {
        // Check if it's a quota exhaustion (limit: 0) vs temporary rate limit
        const errorText = JSON.stringify(errorData)
        const hasLimitZero = errorText.includes('limit: 0')
        const isQuotaExhausted = hasLimitZero || 
                                 errorData.error?.message?.includes('Quota exceeded') ||
                                 errorData.error?.status === 'RESOURCE_EXHAUSTED'
        
        // Extract retry delay if available
        const retryInfo = errorData.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'))
        const retryAfter = retryInfo?.retryDelay || 'a few moments'
        
        if (hasLimitZero) {
          // "limit: 0" usually means free tier is not enabled or API key not properly configured
          errorMessage = 'Free tier quota not available. Your API key may not have free tier enabled.'
          hint = 'The "limit: 0" error suggests your free tier may not be enabled. Try these steps:\n\n' +
                 '1. Check if your API key is linked to a Google Cloud project\n' +
                 '2. Verify free tier is enabled in Google Cloud Console\n' +
                 '3. Check API key permissions at https://aistudio.google.com/app/apikey\n' +
                 '4. Try creating a new API key if the current one doesn\'t work\n' +
                 '5. Use "Auto" provider to automatically fallback to Hugging Face (free tier available)\n\n' +
                 'Note: Even with no usage, free tier must be explicitly enabled in some cases.'
        } else if (isQuotaExhausted) {
          // Quota exhausted but has a limit (not 0)
          errorMessage = 'Free tier quota exhausted. Your Google AI Studio free tier quota has been reached.'
          hint = 'Your free tier quota has been exhausted. Options:\n\n' +
                 '1. Wait for quota reset (usually daily or monthly)\n' +
                 '2. Check your usage at https://ai.dev/usage?tab=rate-limit\n' +
                 '3. Use "Auto" provider to automatically fallback to Hugging Face (free tier available)\n' +
                 '4. Consider upgrading your Google AI Studio plan if you need more quota'
        } else {
          // Temporary rate limit with retry time
          errorMessage = `Rate limit exceeded. Too many requests to Google AI Studio. Please retry in ${retryAfter}.`
          hint = `Please wait ${retryAfter} and try again. Free tier has rate limits.\n\nTip: Use "Auto" provider to automatically fallback to Hugging Face when Google AI Studio is rate-limited.`
        }
      }

      return NextResponse.json(
        {
          error: 'Google AI Studio API error',
          message: errorMessage,
          hint,
          details: errorData,
          statusCode: response.status,
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Extract image from response
    // Google AI Studio returns images in inlineData format with base64 encoded data
    let imageUrl: string | null = null
    
    // First, check for inlineData format (base64 encoded image)
    const candidates = data.candidates || []
    if (candidates.length > 0) {
      const parts = candidates[0]?.content?.parts || []
      
      // Look for inlineData in any part
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || 'image/png'
          const base64Data = part.inlineData.data
          // Convert base64 to data URL
          imageUrl = `data:${mimeType};base64,${base64Data}`
          break
        }
      }
    }
    
    // Fallback: check for imageUrl in various response formats
    if (!imageUrl) {
      if (data.candidates?.[0]?.content?.parts?.[0]?.imageUrl) {
        imageUrl = data.candidates[0].content.parts[0].imageUrl
      } else if (data.imageUrl) {
        imageUrl = data.imageUrl
      } else if (data.data?.[0]?.url) {
        imageUrl = data.data[0].url
      }
    }

    if (!imageUrl) {
      console.error('Unexpected response format from Google AI Studio:', JSON.stringify(data, null, 2))
      
      // Check if this is actually a text response (Gemini might return text instead of image)
      const textResponse = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text
      if (textResponse) {
        return NextResponse.json(
          {
            error: 'Image generation not supported',
            message: 'Google AI Studio returned text instead of an image. The model may not support image generation, or the prompt format needs adjustment.',
            details: {
              textResponse,
              fullResponse: data,
            },
            hint: 'Try using a different provider or check if Gemini 2.5 Flash Image model is available in your region.',
          },
          { status: 500 }
        )
      }

      return NextResponse.json(
        {
          error: 'Unexpected response format',
          message: 'Google AI Studio returned an unexpected response format. The API may have changed.',
          details: data,
          hint: 'Please check the server logs for the full response. The image generation endpoint may need to be updated.',
        },
        { status: 500 }
      )
    }

    // Track usage
    await prisma.aIUsage.create({
      data: {
        tenantId: tenantId,
        service: 'text-to-image',
        requestType: 'generate',
        modelUsed: 'gemini-2.5-flash-image',
        duration: Date.now() - Date.now(), // Will be updated if we track timing
      },
    })

    return NextResponse.json({
      imageUrl,
      revisedPrompt: enhancedPrompt,
      originalPrompt: validated.prompt,
      enhancementService,
      service: 'google-ai-studio',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Google AI Studio image generation error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
