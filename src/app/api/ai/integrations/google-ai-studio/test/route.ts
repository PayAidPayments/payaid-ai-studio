import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { z } from 'zod'

const testApiKeySchema = z.object({
  apiKey: z.string().min(1),
})

// POST /api/ai/integrations/google-ai-studio/test - Test Google AI Studio API key
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireModuleAccess(request, 'ai-studio')

    const body = await request.json()
    const validated = testApiKeySchema.parse(body)

    const apiKey = validated.apiKey.trim()

    // Validate API key format (Google API keys start with "AIza")
    if (!apiKey.startsWith('AIza')) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid API key format. Google API keys must start with "AIza"' 
        },
        { status: 400 }
      )
    }

    // Test the API key using ListModels endpoint (lightweight and reliable)
    // This is the recommended way to verify API key access
    const testUrl = 'https://generativelanguage.googleapis.com/v1beta/models'
    
    try {
      const testResponse = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey, // Use header for authentication
        },
      })

      if (!testResponse.ok) {
        const errorData = await testResponse.json().catch(() => ({}))
        
        // Provide helpful error messages
        let errorMessage = errorData.error?.message || `API returned ${testResponse.status}: ${testResponse.statusText}`
        
        if (testResponse.status === 401 || testResponse.status === 403) {
          errorMessage = 'Invalid API key. Please check that your API key is correct and has not been revoked.'
        } else if (testResponse.status === 400) {
          if (errorData.error?.message?.includes('API key')) {
            errorMessage = 'Invalid API key format or the key does not have required permissions.'
          }
        }
        
        console.error('Google API test error:', {
          status: testResponse.status,
          statusText: testResponse.statusText,
          error: errorData,
        })
        
        return NextResponse.json(
          {
            success: false,
            error: errorMessage,
            details: errorData,
            statusCode: testResponse.status,
          },
          { status: 400 }
        )
      }

      // Parse the response to verify we got a valid models list
      const modelsData = await testResponse.json().catch(() => ({}))
      
      // Check if we got a valid response with models
      if (!modelsData.models || !Array.isArray(modelsData.models)) {
        console.error('Unexpected response format from Google API:', modelsData)
        return NextResponse.json(
          {
            success: false,
            error: 'Unexpected response from Google API. The API key may be invalid.',
          },
          { status: 400 }
        )
      }

      // Key is valid - we got a list of available models
      const availableModels = modelsData.models.map((m: any) => m.name || m.displayName).filter(Boolean)
      console.log('✅ API key verified. Available models:', availableModels)
      
      return NextResponse.json({
        success: true,
        message: 'API key verified successfully!',
        availableModels: availableModels.slice(0, 5), // Return first 5 models as info
      })
    } catch (fetchError) {
      console.error('API key test error:', fetchError)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to connect to Google AI Studio. Please check your internet connection and try again.',
        },
        { status: 500 }
      )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Test API key error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test API key',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
