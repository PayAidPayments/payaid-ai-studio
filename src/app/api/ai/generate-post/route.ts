import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { getGroqClient } from '@/lib/ai/groq'
import { getOllamaClient } from '@/lib/ai/ollama'
import { analyzePromptContext, formatClarifyingQuestions } from '@/lib/ai/context-analyzer'
import { prisma } from '@payaid/db'
import { z } from 'zod'

const generatePostSchema = z.object({
  topic: z.string().min(1),
  platform: z.string().optional(),
  tone: z.string().optional(),
  length: z.string().optional(),
})

// POST /api/ai/generate-post - Generate social media post using AI
export async function POST(request: NextRequest) {
  try {
    // Check analytics module license
    const { tenantId, userId } = await requireModuleAccess(request, 'ai-studio')

    const body = await request.json()
    const validated = generatePostSchema.parse(body)

    // Check if topic has enough detail
    if (!validated.topic || validated.topic.trim().length < 10) {
      return NextResponse.json({
        error: 'Topic too vague',
        message: 'To create an engaging post, I need more details about the topic.',
        needsClarification: true,
        suggestedQuestions: [
          'What is the main message or theme of this post?',
          'What should readers learn or take away?',
          'Is this about a product, company update, industry insight, or something else?',
        ],
      }, { status: 400 })
    }

    // Get business context for better post generation
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        website: true,
      },
    })

    // Build system prompt for post generation
    const systemPrompt = `You are an expert social media content creator. Generate engaging, professional social media posts.

Business Context:
- Business Name: ${tenant?.name || 'Business'}
- Website: ${tenant?.website || 'N/A'}

Platform: ${validated.platform || 'general'}
Tone: ${validated.tone || 'professional'}
Length: ${validated.length || 'medium'}

Guidelines:
- Create engaging, authentic content
- Match the platform's best practices
- Use appropriate tone for the platform
- Include relevant hashtags if appropriate
- Make it shareable and engaging
- Keep it professional but relatable`

    const userPrompt = `Create a ${validated.length || 'medium'}-length social media post for ${validated.platform || 'general'} platform with a ${validated.tone || 'professional'} tone about: ${validated.topic}`

    // Try to generate post using AI services
    let generatedPost = ''
    let usedService = 'rule-based'

    try {
      // Try Groq first
      const groqApiKey = process.env.GROQ_API_KEY
      if (groqApiKey) {
        const groq = getGroqClient()
        const response = await groq.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ])
        generatedPost = response.message
        usedService = 'groq'
      } else {
        throw new Error('Groq not configured')
      }
    } catch (groqError) {
      console.error('Groq post generation error:', groqError)
      try {
        // Fallback to Ollama
        const ollama = getOllamaClient()
        const response = await ollama.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ])
        generatedPost = response.message
        usedService = 'ollama'
      } catch (ollamaError) {
        console.error('Ollama post generation error:', ollamaError)
        // Fallback to rule-based
        generatedPost = generateRuleBasedPost(validated.topic, validated.platform, validated.tone, validated.length)
        usedService = 'rule-based'
      }
    }

    return NextResponse.json({
      post: generatedPost,
      service: usedService,
      platform: validated.platform,
      tone: validated.tone,
      length: validated.length,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Post generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate post', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

function generateRuleBasedPost(topic: string, platform?: string, tone?: string, length?: string): string {
  const platformEmojis: Record<string, string> = {
    facebook: '📘',
    instagram: '📷',
    linkedin: '💼',
    twitter: '🐦',
    youtube: '📺',
  }

  const emoji = platformEmojis[platform || 'general'] || '✨'

  let post = `${emoji} ${topic}\n\n`

  if (tone === 'enthusiastic') {
    post += 'We\'re excited to share this with you! 🚀\n\n'
  } else if (tone === 'friendly') {
    post += 'We hope you find this helpful! 😊\n\n'
  }

  if (length === 'long') {
    post += 'Stay tuned for more updates and insights. We value your support and engagement!\n\n'
  }

  post += '#Business #Growth #Success'

  return post.trim()
}
