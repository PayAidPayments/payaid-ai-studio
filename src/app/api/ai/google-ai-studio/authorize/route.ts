import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'

// Generate Google AI Studio OAuth authorization URL
export async function GET(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireModuleAccess(request, 'ai-studio')

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
      return NextResponse.json(
        { error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID in .env' },
        { status: 500 }
      )
    }

    const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/ai/google-ai-studio/callback`
    
    // Scopes for Google AI Studio / Gemini API
    // Note: This scope must be added in Google Cloud Console > OAuth consent screen
    const scope = 'https://www.googleapis.com/auth/generative-language'
    
    // Alternative: Use openid email profile for basic OAuth (if generative-language scope fails)
    // const scope = 'openid email profile https://www.googleapis.com/auth/generative-language'
    
    // Generate state parameter with tenant ID for security
    const state = Buffer.from(JSON.stringify({ tenantId: tenantId })).toString('base64')

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', scope)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('access_type', 'offline') // Get refresh token
    authUrl.searchParams.set('prompt', 'consent') // Force consent screen to get refresh token

    return NextResponse.json({ authUrl: authUrl.toString() })
  } catch (error) {
    console.error('Google AI Studio OAuth authorization error:', error)
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    )
  }
}
