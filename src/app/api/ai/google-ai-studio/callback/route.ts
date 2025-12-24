import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@payaid/db'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'

// Google AI Studio OAuth callback handler
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(
        new URL(`/dashboard/settings/ai?error=${encodeURIComponent(error)}`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/dashboard/settings/ai?error=missing_parameters', request.url)
      )
    }

    // Decode state to get tenant ID
    let tenantId: string
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
      tenantId = stateData.tenantId
    } catch {
      return NextResponse.redirect(
        new URL('/dashboard/settings/ai?error=invalid_state', request.url)
      )
    }

    // Exchange code for access token
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/ai/google-ai-studio/callback`

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/dashboard/settings/ai?error=oauth_not_configured', request.url)
      )
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      console.error('Token exchange error:', errorData)
      return NextResponse.redirect(
        new URL(`/dashboard/settings/ai?error=token_exchange_failed`, request.url)
      )
    }

    const tokens = await tokenResponse.json()

    if (!tokens.access_token) {
      return NextResponse.redirect(
        new URL('/dashboard/settings/ai?error=no_access_token', request.url)
      )
    }

    // Get user info from Google (optional, for metadata)
    let providerEmail: string | undefined
    let providerName: string | undefined
    try {
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      })
      if (userResponse.ok) {
        const googleUser = await userResponse.json()
        providerEmail = googleUser.email
        providerName = googleUser.name
      }
    } catch (err) {
      console.warn('Failed to fetch Google user info:', err)
      // Continue anyway, not critical
    }

    // Calculate expiration time
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null

    // Store or update OAuth integration
    await prisma.oAuthIntegration.upsert({
      where: {
        tenantId_provider: {
          tenantId,
          provider: 'google-ai-studio',
        },
      },
      create: {
        tenantId,
        provider: 'google-ai-studio',
        accessToken: tokens.access_token, // In production, encrypt this
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope || null,
        providerEmail,
        providerName,
        isActive: true,
        lastUsedAt: new Date(),
      },
      update: {
        accessToken: tokens.access_token, // In production, encrypt this
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope || null,
        providerEmail,
        providerName,
        isActive: true,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // Redirect to settings page with success message
    return NextResponse.redirect(
      new URL('/dashboard/settings/ai?success=google_connected', request.url)
    )
  } catch (error) {
    console.error('Google AI Studio OAuth callback error:', error)
    return NextResponse.redirect(
      new URL('/dashboard/settings/ai?error=oauth_failed', request.url)
    )
  }
}
