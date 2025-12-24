import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { getOllamaClient } from '@/lib/ai/ollama'

// GET /api/ai/ollama/health - Check Ollama health status
export async function GET(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireAIStudioAccess(request)

    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    const model = process.env.OLLAMA_MODEL || 'mistral:7b'
    const hasApiKey = !!process.env.OLLAMA_API_KEY

    const healthStatus = {
      service: 'Ollama',
      baseUrl,
      model,
      hasApiKey,
      status: 'unknown' as 'healthy' | 'unhealthy' | 'unknown',
      details: {} as any,
      timestamp: new Date().toISOString(),
    }

    try {
      // Test 1: Check if Ollama server is reachable (tags endpoint)
      const tagsResponse = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        headers: hasApiKey ? {
          'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}`,
        } : {},
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })

      if (!tagsResponse.ok) {
        healthStatus.status = 'unhealthy'
        healthStatus.details.error = `Tags endpoint returned ${tagsResponse.status}: ${tagsResponse.statusText}`
        return NextResponse.json(healthStatus, { status: 200 })
      }

      const tagsData = await tagsResponse.json().catch(() => ({}))
      const availableModels = tagsData.models || []
      const modelExists = availableModels.some((m: any) => m.name === model || m.name?.includes(model.split(':')[0]))

      healthStatus.details.availableModels = availableModels.map((m: any) => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at,
      }))
      healthStatus.details.modelExists = modelExists
      healthStatus.details.totalModels = availableModels.length

      // Test 2: Try a simple chat request to verify the model works
      if (modelExists) {
        try {
          const ollama = getOllamaClient()
          const testResponse = await ollama.chat([
            {
              role: 'user',
              content: 'Say "OK" if you can read this.',
            },
          ])

          if (testResponse.message && testResponse.message.length > 0) {
            healthStatus.status = 'healthy'
            healthStatus.details.testResponse = 'Model responded successfully'
            healthStatus.details.responsePreview = testResponse.message.substring(0, 100)
          } else {
            healthStatus.status = 'unhealthy'
            healthStatus.details.error = 'Model did not return a valid response'
          }
        } catch (chatError) {
          healthStatus.status = 'unhealthy'
          healthStatus.details.error = chatError instanceof Error ? chatError.message : String(chatError)
          healthStatus.details.chatTestFailed = true
        }
      } else {
        healthStatus.status = 'unhealthy'
        healthStatus.details.error = `Configured model "${model}" not found in available models`
        healthStatus.details.suggestion = `Available models: ${availableModels.map((m: any) => m.name).join(', ')}`
      }
    } catch (error) {
      healthStatus.status = 'unhealthy'
      
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          healthStatus.details.error = 'Connection timeout - Ollama server may be unreachable or slow'
          healthStatus.details.suggestion = 'Check if Ollama is running and accessible at ' + baseUrl
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          healthStatus.details.error = 'Connection refused - Ollama server is not running or not accessible'
          healthStatus.details.suggestion = 'Start Ollama: docker-compose -f docker-compose.ai-services.yml up -d payaid-ollama'
        } else {
          healthStatus.details.error = error.message
        }
      } else {
        healthStatus.details.error = String(error)
      }
    }

    return NextResponse.json(healthStatus, { status: 200 })
  } catch (error) {
    console.error('Ollama health check error:', error)
    return NextResponse.json(
      {
        service: 'Ollama',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
