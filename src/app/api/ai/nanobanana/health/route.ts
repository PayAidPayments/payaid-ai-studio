import { NextRequest, NextResponse } from 'next/server'
import { getNanoBananaClient } from '@/lib/ai/nanobanana'

// GET /api/ai/nanobanana/health - Check if Nano Banana API is working
export async function GET(request: NextRequest) {
  try {
    const client = getNanoBananaClient()

    if (!client.isAvailable()) {
      return NextResponse.json({
        status: 'unavailable',
        error: 'GEMINI_API_KEY not configured',
        hint: 'Get API key from https://aistudio.google.com/app/apikey and add to .env',
        timestamp: new Date().toISOString(),
      }, { status: 503 })
    }

    // Test with a simple image generation
    console.log('[HEALTH] Testing Nano Banana API...')
    const result = await client.generateImage({
      prompt: 'a simple blue square',
    })

    return NextResponse.json({
      status: 'healthy',
      apiKey: process.env.GEMINI_API_KEY
        ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...`
        : 'NOT SET',
      imageGenerated: true,
      processingTimeMs: result.processingTimeMs,
      costPerImageINR: result.costInINR?.toFixed(2) || '3.23',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[HEALTH] ❌ Nano Banana API health check failed:', error)

    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      hint: 'Check your GEMINI_API_KEY is valid at https://aistudio.google.com/app/apikey',
      timestamp: new Date().toISOString(),
    }, { status: 503 })
  }
}
