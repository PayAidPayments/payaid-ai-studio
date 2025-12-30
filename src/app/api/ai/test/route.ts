import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'

// GET /api/ai/test - Test AI service connections
export async function GET(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireModuleAccess(request, 'ai-studio')

    const results: any = {
      groq: {
        configured: !!process.env.GROQ_API_KEY,
        apiKeyLength: process.env.GROQ_API_KEY?.length || 0,
        model: process.env.GROQ_MODEL || 'not set',
        testResult: null,
        error: null,
      },
      ollama: {
        configured: !!process.env.OLLAMA_API_KEY || !!process.env.OLLAMA_BASE_URL,
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        apiKeyLength: process.env.OLLAMA_API_KEY?.length || 0,
        model: process.env.OLLAMA_MODEL || 'not set',
        testResult: null,
        error: null,
      },
      huggingface: {
        configured: !!process.env.HUGGINGFACE_API_KEY,
        apiKeyLength: process.env.HUGGINGFACE_API_KEY?.length || 0,
        model: process.env.HUGGINGFACE_MODEL || 'not set',
        testResult: null,
        error: null,
      },
    }

    // Test Groq
    if (process.env.GROQ_API_KEY) {
      try {
        const testResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            messages: [
              { role: 'user', content: 'Say "test" if you can read this.' },
            ],
            max_tokens: 10,
          }),
        })

        if (testResponse.ok) {
          const data = await testResponse.json()
          results.groq.testResult = 'success'
          results.groq.response = data.choices[0]?.message?.content || 'no content'
        } else {
          const errorText = await testResponse.text()
          results.groq.testResult = 'failed'
          results.groq.error = `${testResponse.status} ${testResponse.statusText}: ${errorText.substring(0, 200)}`
        }
      } catch (error) {
        results.groq.testResult = 'error'
        results.groq.error = error instanceof Error ? error.message : String(error)
      }
    }

    // Test Ollama
    if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_KEY) {
      try {
        const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        
        if (process.env.OLLAMA_API_KEY) {
          headers['Authorization'] = `Bearer ${process.env.OLLAMA_API_KEY}`
        }

        const testResponse = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: process.env.OLLAMA_MODEL || 'mistral:7b',
            messages: [
              { role: 'user', content: 'Say "test" if you can read this.' },
            ],
            stream: false,
          }),
        })

        if (testResponse.ok) {
          const data = await testResponse.json()
          results.ollama.testResult = 'success'
          results.ollama.response = data.message?.content || data.response || 'no content'
        } else {
          const errorText = await testResponse.text()
          results.ollama.testResult = 'failed'
          results.ollama.error = `${testResponse.status} ${testResponse.statusText}: ${errorText.substring(0, 200)}`
        }
      } catch (error) {
        results.ollama.testResult = 'error'
        results.ollama.error = error instanceof Error ? error.message : String(error)
      }
    }

    // Test Hugging Face
    if (process.env.HUGGINGFACE_API_KEY) {
      try {
        const model = process.env.HUGGINGFACE_MODEL || 'google/gemma-2-2b-it'
        
        // Use new router endpoint with OpenAI-compatible format
        const testResponse = await fetch('https://router.huggingface.co/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'user', content: 'Say "test" if you can read this.' },
            ],
            max_tokens: 50,
            temperature: 0.7,
          }),
        })

        if (testResponse.ok) {
          const data = await testResponse.json()
          const generatedText = data.choices?.[0]?.message?.content || ''
          results.huggingface.testResult = 'success'
          results.huggingface.response = generatedText.trim() || 'no content'
        } else {
          const errorText = await testResponse.text()
          let errorData
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { error: errorText }
          }
          
          // Handle model loading state
          if (testResponse.status === 503 && errorData.estimated_time) {
            results.huggingface.testResult = 'loading'
            results.huggingface.error = `Model is loading, estimated time: ${Math.ceil(errorData.estimated_time)} seconds`
          } else {
            results.huggingface.testResult = 'failed'
            results.huggingface.error = `${testResponse.status} ${testResponse.statusText}: ${errorData.error || errorText.substring(0, 200)}`
          }
        }
      } catch (error) {
        results.huggingface.testResult = 'error'
        results.huggingface.error = error instanceof Error ? error.message : String(error)
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('AI test error:', error)
    return NextResponse.json(
      { error: 'Failed to test AI services', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
