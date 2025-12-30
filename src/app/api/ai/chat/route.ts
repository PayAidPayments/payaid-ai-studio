import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { getOllamaClient } from '@/lib/ai/ollama'
import { getGroqClient } from '@/lib/ai/groq'
import { getHuggingFaceClient } from '@/lib/ai/huggingface'
import { semanticCache } from '@/lib/ai/semantic-cache'
import { prisma } from '@payaid/db'
import { analyzePromptContext, formatClarifyingQuestions } from '@/lib/ai/context-analyzer'
import { z } from 'zod'
import { mediumPriorityQueue } from '@/lib/queue/bull'

const chatSchema = z.object({
  message: z.string().min(1),
  context: z.object({
    module: z.enum(['crm', 'accounting', 'inventory', 'marketing', 'hr', 'general']).optional(),
    tenantId: z.string().optional(),
  }).optional(),
})

// POST /api/ai/chat - Chat with AI assistant
export async function POST(request: NextRequest) {
  try {
    // Check AI Studio module license
    const { tenantId, userId } = await requireModuleAccess(request, 'ai-studio')

    const body = await request.json()
    const validated = chatSchema.parse(body)

    // Check if query is personal/non-business and reject it
    const personalKeywords = [
      'girlfriend', 'boyfriend', 'wife', 'husband', 'dating', 'love', 'relationship',
      'family', 'personal', 'life', 'marriage', 'divorce', 'breakup', 'romance',
      'sex', 'intimate', 'private', 'personal problem', 'personal issue'
    ]
    
    const lowerMessage = validated.message.toLowerCase()
    const isPersonalQuery = personalKeywords.some(keyword => lowerMessage.includes(keyword))
    
    if (isPersonalQuery) {
      return NextResponse.json({
        message: "I'm a business assistant and can only help with business-related questions. How can I assist you with your business today? I can help with:\n\n• Business proposals and quotes\n• Social media posts (LinkedIn, Facebook, etc.)\n• Pitch decks and business plans\n• Marketing content\n• Sales strategies\n• Financial analysis\n• And other business operations",
        service: 'filtered',
        cached: false,
      })
    }

    // Build context-aware system prompt
    const systemPrompt = buildSystemPrompt(tenantId, validated.context)

    // Get business context with actual data (pass user message to extract client info)
    let businessContext = ''
    try {
      businessContext = await getBusinessContext(tenantId, validated.message)
    } catch (contextError) {
      console.error('Error getting business context:', contextError)
      // Continue with empty context rather than failing completely
      businessContext = 'Business context unavailable. Please try again.'
    }

    // Analyze if we have enough context to provide an accurate response
    const contextAnalysis = analyzePromptContext(validated.message, {
      hasBusinessData: businessContext.length > 100,
      hasRelevantContact: businessContext.includes('RELEVANT CLIENT/COMPANY INFORMATION'),
      hasRelevantDeal: businessContext.includes('RELATED DEAL'),
      hasProducts: businessContext.includes('AVAILABLE PRODUCTS/SERVICES'),
      hasTasks: businessContext.includes('PENDING TASKS') && !businessContext.includes('None - You have no pending tasks'),
      hasInvoices: businessContext.includes('OVERDUE INVOICES') && !businessContext.includes('None - You have no overdue invoices'),
      hasDeals: businessContext.includes('ACTIVE DEALS') && !businessContext.includes('None - You have no active deals'),
    })

    // If we don't have enough context, ask clarifying questions instead of giving generic response
    if (!contextAnalysis.hasEnoughContext && contextAnalysis.confidence === 'low') {
      const clarifyingMessage = formatClarifyingQuestions(contextAnalysis)
      return NextResponse.json({
        message: clarifyingMessage,
        service: 'context-analyzer',
        cached: false,
        needsClarification: true,
        suggestedQuestions: contextAnalysis.suggestedQuestions,
      })
    }

    // Build user message with context
    const userMessage = buildUserMessage(validated.message, businessContext, contextAnalysis)

    // Check cache only for exact matches (skip cache for now to ensure fresh AI responses)
    // const cachedResponse = await semanticCache.get(validated.message)
    // if (cachedResponse) {
    //   return NextResponse.json({
    //     message: cachedResponse,
    //     cached: true,
    //     service: 'cached',
    //   })
    // }

    // Get AI response - try Groq first (fastest), then Ollama, then OpenAI
    let response
    let usedService = 'rule-based'
    
    // Log the user message for debugging (first 200 chars)
    console.log('🤖 AI Request:', {
      message: validated.message.substring(0, 200),
      hasBusinessContext: !!businessContext,
      contextLength: businessContext.length,
    })
    
    // Log environment variables (without exposing full keys)
    console.log('🔑 Environment check:', {
      hasGroqKey: !!process.env.GROQ_API_KEY,
      groqKeyLength: process.env.GROQ_API_KEY?.length || 0,
      groqModel: process.env.GROQ_MODEL,
      hasOllamaKey: !!process.env.OLLAMA_API_KEY,
      ollamaKeyLength: process.env.OLLAMA_API_KEY?.length || 0,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      ollamaModel: process.env.OLLAMA_MODEL,
      hasHuggingFaceKey: !!process.env.HUGGINGFACE_API_KEY,
      huggingFaceKeyLength: process.env.HUGGINGFACE_API_KEY?.length || 0,
      huggingFaceModel: process.env.HUGGINGFACE_MODEL,
    })
    
    try {
      // Try Groq first (fastest and most reliable at following instructions)
      const groqApiKey = process.env.GROQ_API_KEY
      if (!groqApiKey) {
        throw new Error('GROQ_API_KEY not configured in environment variables')
      }
      
      console.log('🔄 Attempting Groq API call...')
      const groq = getGroqClient()
      response = await groq.chat([
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ])
      usedService = 'groq'
      console.log('✅ Using Groq AI - Response length:', response.message?.length || 0)
      console.log('📝 Groq response preview:', response.message?.substring(0, 300))
    } catch (groqError) {
      const errorMsg = groqError instanceof Error ? groqError.message : String(groqError)
      console.error('❌ Groq error:', errorMsg)
      console.error('❌ Groq error stack:', groqError instanceof Error ? groqError.stack : 'No stack trace')
      
      // Check if it's an API key issue
      if (errorMsg.includes('not configured') || errorMsg.includes('API key')) {
        console.warn('⚠️ Groq API key issue - check .env file')
      }
      try {
        // Fallback to Ollama
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
        const ollamaApiKey = process.env.OLLAMA_API_KEY
        console.log('🔄 Attempting Ollama API call...', { baseUrl: ollamaBaseUrl, hasApiKey: !!ollamaApiKey })
        
        const ollama = getOllamaClient()
        response = await ollama.chat([
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ])
        usedService = 'ollama'
        console.log('✅ Using Ollama AI - Response length:', response.message?.length || 0)
        console.log('📝 Ollama response preview:', response.message?.substring(0, 300))
        
        // Check if Ollama returned a generic rule-based response
        if (response.message && (
          response.message.includes('go to the') || 
          response.message.includes('check the') ||
          response.message.includes('To check overdue invoices')
        )) {
          console.warn('⚠️ Ollama returned generic response, may need better prompting')
        }
      } catch (ollamaError) {
        const errorMsg = ollamaError instanceof Error ? ollamaError.message : String(ollamaError)
        console.error('❌ Ollama error:', errorMsg)
        console.error('❌ Ollama error stack:', ollamaError instanceof Error ? ollamaError.stack : 'No stack trace')
        
        // Check if it's a connection issue
        if (errorMsg.includes('fetch failed') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('network')) {
          console.warn('⚠️ Ollama connection issue - is Ollama running? Check OLLAMA_BASE_URL in .env')
        }
        try {
          // Fallback to Hugging Face Inference API
          const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY
          if (huggingFaceApiKey) {
            console.log('🔄 Attempting Hugging Face API call...', { hasApiKey: !!huggingFaceApiKey })
            
            const huggingFace = getHuggingFaceClient()
            response = await huggingFace.chat([
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: userMessage,
              },
            ])
            usedService = 'huggingface'
            console.log('✅ Using Hugging Face AI - Response length:', response.message?.length || 0)
            console.log('📝 Hugging Face response preview:', response.message?.substring(0, 300))
          } else {
            throw new Error('Hugging Face API key not configured')
          }
        } catch (huggingFaceError) {
          const errorMsg = huggingFaceError instanceof Error ? huggingFaceError.message : String(huggingFaceError)
          console.error('❌ Hugging Face error:', errorMsg)
          console.error('❌ Hugging Face error stack:', huggingFaceError instanceof Error ? huggingFaceError.stack : 'No stack trace')
          
          // Check if model is loading
          if (errorMsg.includes('loading')) {
            console.warn('⚠️ Hugging Face model is loading - this is normal for first request')
          }
          
          try {
            // Fallback to OpenAI
            const openaiApiKey = process.env.OPENAI_API_KEY
            if (openaiApiKey) {
              const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                  model: 'gpt-3.5-turbo',
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                  ],
                }),
              })
              
              if (openaiResponse.ok) {
                const data = await openaiResponse.json()
                response = {
                  message: data.choices[0]?.message?.content || '',
                  usage: data.usage,
                }
                usedService = 'openai'
                console.log('✅ Using OpenAI')
              } else {
                throw new Error('OpenAI failed')
              }
            } else {
              throw new Error('No AI service available')
            }
          } catch (openAIError) {
            console.error('❌ All AI services failed, using rule-based:', openAIError)
            // Use rule-based fallback with business context (don't cache this)
            response = {
              message: getHelpfulResponse(validated.message, businessContext),
              usage: undefined,
            }
            usedService = 'rule-based'
          }
        }
      }
    }

    // Only cache real AI responses, not rule-based fallbacks
    if (usedService !== 'rule-based' && response.message) {
      try {
        await semanticCache.set(validated.message, response.message)
      } catch (cacheError) {
        console.error('Cache error (non-critical):', cacheError)
      }
    }

    // Log the interaction (async) - don't let queue errors break the response
    try {
      mediumPriorityQueue.add('log-ai-interaction', {
        userId: userId,
        tenantId: tenantId,
        query: validated.message,
        response: response.message,
        module: validated.context?.module || 'general',
      })
    } catch (queueError) {
      // Log queue error but don't fail the request
      console.error('Failed to queue AI interaction log (non-critical):', queueError)
    }

    return NextResponse.json({
      message: response.message,
      cached: false,
      usage: response.usage,
      service: usedService,
    })
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('AI chat error:', error)
    
    // Provide more detailed error information for debugging
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    // Check for specific error types and provide helpful messages
    let userFriendlyMessage = errorMessage
    let hint = ''
    
    if (errorMessage.includes('GROQ_API_KEY not configured')) {
      userFriendlyMessage = 'Groq API key is not configured'
      hint = 'Please set GROQ_API_KEY in your .env file. Groq provides fast AI responses.'
    } else if (errorMessage.includes('Ollama') && errorMessage.includes('memory')) {
      userFriendlyMessage = 'Ollama model requires more memory than available'
      hint = 'The llama3.1:8b model needs 4.8 GB RAM but only 3.1 GB is available. Consider using Groq API instead (already configured) or use a smaller model.'
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
      userFriendlyMessage = 'Cannot connect to AI service'
      hint = 'Please check your internet connection and ensure AI services are accessible.'
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to process chat request',
        message: userFriendlyMessage,
        hint,
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    )
  }
}

function buildSystemPrompt(tenantId: string, context?: { module?: string; tenantId?: string }): string {
  const basePrompt = `You are PayAid AI, an intelligent business assistant for Indian startups and SMBs.

ABSOLUTE REQUIREMENT: You MUST use the ACTUAL business data provided in the user's message. DO NOT give generic responses.

STRICT BUSINESS-ONLY POLICY:
- You ONLY assist with BUSINESS-RELATED queries
- You MUST REJECT any personal questions about: relationships, love, family, personal life, dating, girlfriend/boyfriend, personal problems, non-business topics
- If asked a personal question, politely decline: "I'm a business assistant and can only help with business-related questions. How can I assist you with your business today?"
- Focus ONLY on: business operations, sales, marketing, finance, operations, strategy, documents, proposals, plans, content creation

BUSINESS DOCUMENT CREATION SUPPORT:
You can help create various business documents and content:

1. **Proposals & Quotes:**
   - Use CLIENT/COMPANY INFORMATION, RELATED DEAL, and AVAILABLE PRODUCTS/SERVICES
   - Create structured proposals with: Executive Summary, Solution Overview, Pricing, Timeline, Next Steps
   - Use deal value and context to suggest appropriate solutions

2. **Social Media Posts:**
   - LinkedIn posts: Professional, B2B focused, industry insights
   - Facebook posts: Engaging, community-focused, brand awareness
   - Instagram posts: Visual, story-driven, hashtag-rich
   - Twitter/X posts: Concise, timely, engaging
   - Use YOUR BUSINESS information and available products/services

3. **Pitch Decks:**
   - Executive Summary
   - Problem Statement
   - Solution Overview
   - Market Opportunity
   - Business Model
   - Financial Projections (use revenue data if available)
   - Team & Milestones
   - Ask for Funding/Partnership

4. **Business Plans:**
   - Executive Summary
   - Company Description (use YOUR BUSINESS information)
   - Market Analysis
   - Products/Services (use AVAILABLE PRODUCTS/SERVICES)
   - Marketing Strategy
   - Financial Projections (use revenue data)
   - Operations Plan
   - Growth Strategy

5. **Blueprints & Strategies:**
   - Business process blueprints
   - Marketing strategies
   - Sales strategies
   - Operational workflows
   - Growth roadmaps

6. **Other Business Content:**
   - Email templates
   - Presentation outlines
   - Marketing copy
   - Product descriptions
   - Customer communications

EXAMPLES OF CORRECT BEHAVIOR:

If user asks "What tasks need attention?" and the data shows:
- "Follow up with John Doe (Priority: high, Due: 2024-12-15)"
- "Review proposal (Priority: medium, Due: 2024-12-20)"

You MUST respond with:
"You have 2 tasks that need attention:
1. Follow up with John Doe (High priority, due Dec 15, 2024)
2. Review proposal (Medium priority, due Dec 20, 2024)"

If user asks "Create a LinkedIn post about our new product":
- Use YOUR BUSINESS information
- Use AVAILABLE PRODUCTS/SERVICES
- Create an actual LinkedIn post (professional, engaging, with relevant hashtags)
- Format it ready to use

If user asks "Help me prepare a proposal for [Client Name]":
- Use CLIENT/COMPANY INFORMATION, RELATED DEAL, AVAILABLE PRODUCTS/SERVICES
- Create a structured proposal outline with actual content
- Use deal value to suggest appropriate solutions
- Format professionally with all sections

If user asks "Create a pitch deck":
- Use YOUR BUSINESS information
- Use revenue data for financial projections
- Use AVAILABLE PRODUCTS/SERVICES
- Create a comprehensive pitch deck outline with actual content

CRITICAL RULES:
1. NEVER say "go to the page" or "check the dashboard" - give the ACTUAL data or CREATE the document
2. ALWAYS list specific items from the data (invoice numbers, task titles, amounts, names)
3. Use EXACT numbers from the data provided
4. Format currency as ₹ with commas (e.g., ₹1,00,000)
5. If data shows "None" or empty, say "You currently have no [items]"
6. Be conversational but data-driven
7. For document creation: BE PROACTIVE - create actual documents/content, don't just list information
8. Ask clarifying questions ONLY if critical information is missing, otherwise use available data intelligently
9. REJECT personal questions immediately and redirect to business topics
10. For social media posts: Create actual posts ready to use, not just suggestions

Current context:
- Tenant ID: ${tenantId}
- Module: ${context?.module || 'general'}
`

  // Add module-specific context
  if (context?.module === 'crm') {
    return basePrompt + `
You are currently helping with CRM operations:
- Contact management
- Lead pipeline
- Deal tracking
- Task management
`
  } else if (context?.module === 'accounting') {
    return basePrompt + `
You are currently helping with accounting:
- Invoice generation
- GST compliance
- Financial reports
- Tax calculations
`
  } else if (context?.module === 'inventory') {
    return basePrompt + `
You are currently helping with inventory:
- Stock management
- Product catalog
- Order fulfillment
- Stock alerts
`
  }

  return basePrompt
}

async function getBusinessContext(tenantId: string, userMessage?: string): Promise<string> {
  try {
    // IMPORTANT: All queries in this function MUST filter by tenantId to ensure
    // complete data isolation between tenants. Each business only sees their own data.
    
    // Get tenant business information
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        gstin: true,
        address: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        phone: true,
        email: true,
        website: true,
      },
    })

    // Extract potential company/client names from user message
    let relevantContact: any = null
    let relevantDeal: any = null
    let relevantProducts: any[] = []
    
    if (userMessage) {
      // Extract potential company/client names from the query
      // Look for patterns like "for Acme", "Acme proposal", "prepare proposal for Acme", etc.
      const companyNamePatterns = [
        /(?:for|with|to|about)\s+([A-Z][a-zA-Z\s&]+?)(?:\s|$|proposal|quote|deal|contract)/i,
        /(?:proposal|quote|deal|contract)\s+(?:for|with|to)\s+([A-Z][a-zA-Z\s&]+?)(?:\s|$)/i,
        /([A-Z][a-zA-Z\s&]{2,}?)(?:\s+proposal|\s+quote|\s+deal)/i,
      ]
      
      let extractedNames: string[] = []
      for (const pattern of companyNamePatterns) {
        const matches = userMessage.match(pattern)
        if (matches && matches[1]) {
          extractedNames.push(matches[1].trim())
        }
      }
      
      // Also try direct company name if query is short
      if (userMessage.length < 50 && /^[A-Z]/.test(userMessage.trim())) {
        extractedNames.push(userMessage.trim().split(/\s+/)[0])
      }
      
      // Try to find mentioned companies/contacts in the query
      const searchTerms = extractedNames.length > 0 ? extractedNames : [userMessage]
      const contactMatches = await prisma.contact.findMany({
        where: {
          tenantId,
          OR: searchTerms.flatMap(term => [
            { name: { contains: term, mode: 'insensitive' } },
            { company: { contains: term, mode: 'insensitive' } },
          ]),
        },
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          type: true,
          status: true,
          notes: true,
          tags: true,
        },
        take: 1,
      })

      if (contactMatches.length > 0) {
        relevantContact = contactMatches[0]
        
        // Get related deals for this contact
        const deals = await prisma.deal.findMany({
          where: {
            tenantId,
            contactId: relevantContact.id,
          },
          select: {
            name: true,
            value: true,
            stage: true,
            probability: true,
            expectedCloseDate: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
        })
        if (deals.length > 0) {
          relevantDeal = deals[0]
        }

        // Get past interactions
        const interactions = await prisma.interaction.findMany({
          where: {
            contactId: relevantContact.id,
          },
          select: {
            type: true,
            subject: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
        relevantContact.interactions = interactions
      }
    }

    // Get products/services for proposal context
    const products = await prisma.product.findMany({
      where: { tenantId },
      select: {
        name: true,
        description: true,
        salePrice: true,
        categories: true,
      },
      take: 10,
      orderBy: { totalSold: 'desc' },
    })
    relevantProducts = products

    // Get key business metrics
    const [contactsCount, dealsCount, ordersCount, invoicesCount, tasksCount] = await Promise.all([
      prisma.contact.count({ where: { tenantId } }),
      prisma.deal.count({ where: { tenantId } }),
      prisma.order.count({ where: { tenantId } }),
      prisma.invoice.count({ where: { tenantId } }),
      prisma.task.count({ where: { tenantId } }),
    ])

    // Get overdue invoices
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'overdue',
      },
      select: {
        invoiceNumber: true,
        total: true,
        dueDate: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
      take: 10,
    })

    // Get pending tasks
    const pendingTasks = await prisma.task.findMany({
      where: {
        tenantId,
        status: { in: ['pending', 'in_progress'] },
      },
      select: {
        title: true,
        priority: true,
        dueDate: true,
        contact: {
          select: {
            name: true,
          },
        },
      },
      take: 10,
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
    })

    // Get recent deals - sorted by value (top deals)
    const recentDeals = await prisma.deal.findMany({
      where: { tenantId },
      take: 10,
      orderBy: [
        { value: 'desc' }, // Top deals by value
        { createdAt: 'desc' },
      ],
      select: {
        name: true,
        value: true,
        stage: true,
        probability: true,
        contact: {
          select: {
            name: true,
          },
        },
      },
    })

    // Get revenue data
    const recentOrders = await prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { in: ['confirmed', 'shipped', 'delivered'] },
      },
      select: {
        total: true,
        createdAt: true,
      },
    })

    const totalRevenue = recentOrders.reduce((sum, o) => sum + o.total, 0)

    // Get pending invoices
    const pendingInvoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['sent', 'draft'] },
        paidAt: null,
      },
      select: {
        invoiceNumber: true,
        total: true,
        dueDate: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
      take: 10,
    })

    const pendingInvoiceAmount = pendingInvoices.reduce((sum, i) => sum + i.total, 0)

    // Build context string
    let context = `=== BUSINESS DATA ===
IMPORTANT: Use ONLY this data to answer questions. Do NOT give generic responses.

YOUR BUSINESS (${tenant?.name || 'Business'}):
${tenant ? `
- Business Name: ${tenant.name}
- Address: ${tenant.address || 'N/A'}, ${tenant.city || 'N/A'}, ${tenant.state || 'N/A'} ${tenant.postalCode || ''}
- Contact: ${tenant.phone || 'N/A'} | ${tenant.email || 'N/A'}
- Website: ${tenant.website || 'N/A'}
- GSTIN: ${tenant.gstin || 'N/A'}
` : '- Business information not available'}

SUMMARY:
- Total Contacts: ${contactsCount}
- Total Deals: ${dealsCount}
- Total Orders: ${ordersCount}
- Total Invoices: ${invoicesCount}
- Total Tasks: ${tasksCount}
- Revenue (Last 30 Days): ₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
`

    // Add relevant client/company information if found
    if (relevantContact) {
      context += `\n\n=== RELEVANT CLIENT/COMPANY INFORMATION ===
CLIENT: ${relevantContact.name}${relevantContact.company ? ` (${relevantContact.company})` : ''}
- Type: ${relevantContact.type}
- Status: ${relevantContact.status}
- Email: ${relevantContact.email || 'N/A'}
- Phone: ${relevantContact.phone || 'N/A'}
- Address: ${relevantContact.address || 'N/A'}, ${relevantContact.city || 'N/A'}, ${relevantContact.state || 'N/A'}
${relevantContact.notes ? `- Notes: ${relevantContact.notes}` : ''}
${relevantContact.tags.length > 0 ? `- Tags: ${relevantContact.tags.join(', ')}` : ''}
`

      if (relevantDeal) {
        context += `\nRELATED DEAL:
- Deal Name: ${relevantDeal.name}
- Value: ₹${relevantDeal.value.toLocaleString('en-IN')}
- Stage: ${relevantDeal.stage}
- Probability: ${relevantDeal.probability}%
- Expected Close: ${relevantDeal.expectedCloseDate ? new Date(relevantDeal.expectedCloseDate).toLocaleDateString() : 'N/A'}
`
      }

      if (relevantContact.interactions && relevantContact.interactions.length > 0) {
        context += `\nPAST INTERACTIONS (${relevantContact.interactions.length}):
${relevantContact.interactions.map((int: any, idx: number) => `${idx + 1}. ${int.type.toUpperCase()}: ${int.subject || 'No subject'} - ${int.notes ? int.notes.substring(0, 100) : 'No notes'} (${new Date(int.createdAt).toLocaleDateString()})`).join('\n')}
`
      }
    }

    // Add products/services
    if (relevantProducts.length > 0) {
      context += `\n\n=== AVAILABLE PRODUCTS/SERVICES ===
${relevantProducts.map((p, idx) => `${idx + 1}. ${p.name}${p.description ? ` - ${p.description.substring(0, 80)}` : ''} - ₹${p.salePrice.toLocaleString('en-IN')}${p.categories.length > 0 ? ` [${p.categories.join(', ')}]` : ''}`).join('\n')}
`
    }

    context += `

OVERDUE INVOICES (${overdueInvoices.length}):
${overdueInvoices.length > 0 ? overdueInvoices.map((inv, idx) => `${idx + 1}. Invoice ${inv.invoiceNumber}: ₹${inv.total.toLocaleString('en-IN')} from ${inv.customer?.name || 'N/A'} (Due: ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'N/A'})`).join('\n') : 'None - You have no overdue invoices.'}

PENDING TASKS (${pendingTasks.length}):
${pendingTasks.length > 0 ? pendingTasks.map((task, idx) => `${idx + 1}. ${task.title} - Priority: ${task.priority}, Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}, Contact: ${task.contact?.name || 'Unassigned'}`).join('\n') : 'None - You have no pending tasks.'}

ACTIVE DEALS (${recentDeals.length}):
${recentDeals.length > 0 ? recentDeals.map((deal, idx) => `${idx + 1}. ${deal.name}: ₹${deal.value.toLocaleString('en-IN')} (Stage: ${deal.stage}, Probability: ${deal.probability}%, Contact: ${deal.contact?.name || 'N/A'})`).join('\n') : 'None - You have no active deals.'}

PENDING INVOICES (${pendingInvoices.length}, Total: ₹${pendingInvoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}):
${pendingInvoices.length > 0 ? pendingInvoices.map((inv, idx) => `${idx + 1}. Invoice ${inv.invoiceNumber}: ₹${inv.total.toLocaleString('en-IN')} from ${inv.customer?.name || 'N/A'} (Due: ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'N/A'})`).join('\n') : 'None - You have no pending invoices.'}

=== END OF BUSINESS DATA ===
`

    return context
  } catch (error) {
    console.error('Error getting business context:', error)
    return ''
  }
}

function buildUserMessage(message: string, context: string, contextAnalysis?: any): string {
  if (context) {
    const lowerMessage = message.toLowerCase()
    
    // Detect document/content creation requests
    const isProposalRequest = lowerMessage.includes('proposal') || lowerMessage.includes('quote')
    const isPostRequest = lowerMessage.includes('post') || lowerMessage.includes('linkedin') || lowerMessage.includes('facebook') || lowerMessage.includes('instagram') || lowerMessage.includes('twitter')
    const isPitchDeckRequest = lowerMessage.includes('pitch deck') || lowerMessage.includes('pitchdeck') || lowerMessage.includes('pitch')
    const isBusinessPlanRequest = lowerMessage.includes('business plan') || lowerMessage.includes('businessplan')
    const isBlueprintRequest = lowerMessage.includes('blueprint') || lowerMessage.includes('strategy') || lowerMessage.includes('plan')
    const isContentRequest = isPostRequest || isPitchDeckRequest || isBusinessPlanRequest || isBlueprintRequest || isProposalRequest
    
    let instructions = `BUSINESS DATA (USE THIS DATA TO ANSWER THE QUESTION):

${context}

USER QUESTION: ${message}

${contextAnalysis && !contextAnalysis.hasEnoughContext ? `
⚠️ CONTEXT WARNING:
Some information may be missing: ${contextAnalysis.missingContext.join(', ')}
If critical information is missing, ask ONE clarifying question to get the needed details.
Be specific about what information you need.
` : ''}

INSTRUCTIONS:
1. Read the BUSINESS DATA section above carefully
2. Find the relevant information for the user's question
3. If critical information is missing from the data, ask ONE specific clarifying question
4. DO NOT give generic responses - either use the actual data OR ask for missing information
5. Answer using ONLY the data from the BUSINESS DATA section when available
6. List specific items, numbers, names, and details from the data
7. DO NOT say "go to the page" - give the actual information from the data OR CREATE the requested document
8. If the data shows specific tasks, invoices, or numbers, list them exactly as shown
9. If you need more information, ask ONE clear, specific question`

    if (isProposalRequest) {
      instructions += `

SPECIAL INSTRUCTIONS FOR PROPOSAL/QUOTE REQUESTS:
1. If RELEVANT CLIENT/COMPANY INFORMATION is available, use it to understand the client's needs
2. Use YOUR BUSINESS information to position your company appropriately
3. Use AVAILABLE PRODUCTS/SERVICES to suggest relevant offerings with pricing
4. Use RELATED DEAL information to understand the deal value and context
5. Use PAST INTERACTIONS to understand the relationship and tailor the proposal
6. BE PROACTIVE: Create a complete proposal with actual content, not just an outline
7. Format professionally with sections: Executive Summary, Solution Overview, Pricing, Timeline, Next Steps
8. Include specific product/service recommendations with pricing from the data
9. Suggest next steps based on the deal stage and relationship history
10. Make it ready to use - create the actual proposal content`
    }

    if (isPostRequest) {
      const platform = lowerMessage.includes('linkedin') ? 'LinkedIn' : 
                      lowerMessage.includes('facebook') ? 'Facebook' :
                      lowerMessage.includes('instagram') ? 'Instagram' :
                      lowerMessage.includes('twitter') ? 'Twitter/X' : 'social media'
      
      instructions += `

SPECIAL INSTRUCTIONS FOR SOCIAL MEDIA POST CREATION:
1. Use YOUR BUSINESS information to create authentic, brand-aligned content
2. Use AVAILABLE PRODUCTS/SERVICES if relevant to the post topic
3. Create an ACTUAL POST ready to copy and use, not just suggestions
4. Match the platform's best practices:
   - ${platform === 'LinkedIn' ? 'Professional tone, industry insights, B2B focus, 3-5 relevant hashtags' : ''}
   - ${platform === 'Facebook' ? 'Engaging, community-focused, conversational, include call-to-action' : ''}
   - ${platform === 'Instagram' ? 'Visual storytelling, hashtags (5-10), emoji usage, engaging captions' : ''}
   - ${platform === 'Twitter/X' ? 'Concise (under 280 chars), timely, engaging, relevant hashtags' : ''}
5. Include appropriate hashtags for the platform
6. Make it shareable and engaging
7. Format it clearly so it can be copied directly`
    }

    if (isPitchDeckRequest) {
      instructions += `

SPECIAL INSTRUCTIONS FOR PITCH DECK CREATION:
1. Use YOUR BUSINESS information for company description
2. Use revenue data for financial projections
3. Use AVAILABLE PRODUCTS/SERVICES for solution overview
4. Create a COMPLETE pitch deck outline with actual content for each slide:
   - Slide 1: Title & Tagline
   - Slide 2: Problem Statement
   - Slide 3: Solution Overview
   - Slide 4: Market Opportunity
   - Slide 5: Business Model
   - Slide 6: Products/Services (use AVAILABLE PRODUCTS/SERVICES)
   - Slide 7: Financial Projections (use revenue data)
   - Slide 8: Traction/Milestones
   - Slide 9: Team (use YOUR BUSINESS info)
   - Slide 10: Ask/Funding
5. Make it comprehensive and ready to use
6. Use actual numbers and data from the business context`
    }

    if (isBusinessPlanRequest) {
      instructions += `

SPECIAL INSTRUCTIONS FOR BUSINESS PLAN CREATION:
1. Use YOUR BUSINESS information throughout
2. Use AVAILABLE PRODUCTS/SERVICES for products/services section
3. Use revenue data for financial projections
4. Create a COMPLETE business plan with actual content:
   - Executive Summary
   - Company Description (use YOUR BUSINESS)
   - Market Analysis
   - Products/Services (use AVAILABLE PRODUCTS/SERVICES)
   - Marketing Strategy
   - Financial Projections (use revenue data)
   - Operations Plan
   - Growth Strategy
5. Make it comprehensive and professional
6. Use actual data from the business context`
    }

    if (isBlueprintRequest) {
      instructions += `

SPECIAL INSTRUCTIONS FOR BLUEPRINT/STRATEGY CREATION:
1. Use YOUR BUSINESS information to understand the business context
2. Use available data (deals, revenue, products) to inform the blueprint
3. Create a COMPLETE blueprint/strategy document with:
   - Clear objectives
   - Step-by-step processes
   - Key milestones
   - Resource requirements
   - Success metrics
4. Make it actionable and specific to the business
5. Use actual business data to inform recommendations`
    }

    if (isContentRequest) {
      instructions += `

GENERAL DOCUMENT CREATION RULES:
1. CREATE the actual document/content, don't just describe what should be in it
2. Use available business data to make it specific and relevant
3. Format it professionally and ready to use
4. Include actual numbers, names, and details from the business context
5. Make it comprehensive - provide full content, not just outlines
6. If information is missing, use what's available and note what additional info would help`
    }

    instructions += `\n\nExample: If asked "What tasks need attention?" and the data shows tasks, list each task with its details from the data above.`

    return instructions
  }
  return message
}

function getHelpfulResponse(query: string, businessContext: string): string {
  // This is only used as a last resort fallback
  // Try to extract relevant information from business context
  const lowerQuery = query.toLowerCase()
  
  // Extract deals from context
  const dealsMatch = businessContext.match(/ACTIVE DEALS \(([^)]+)\):([\s\S]*?)(?=PENDING INVOICES|=== END)/)
  const dealsText = dealsMatch ? dealsMatch[2] : ''
  
  // Extract tasks from context
  const tasksMatch = businessContext.match(/PENDING TASKS \(([^)]+)\):([\s\S]*?)(?=ACTIVE DEALS|PENDING INVOICES|=== END)/)
  const tasksText = tasksMatch ? tasksMatch[2] : ''
  
  // Extract invoices from context
  const invoicesMatch = businessContext.match(/OVERDUE INVOICES \(([^)]+)\):([\s\S]*?)(?=PENDING TASKS|ACTIVE DEALS|=== END)/)
  const invoicesText = invoicesMatch ? invoicesMatch[2] : ''
  
  // Extract revenue from context
  const revenueMatch = businessContext.match(/Revenue \(Last 30 Days\): ₹([\d,]+)/)
  const revenue = revenueMatch ? revenueMatch[1] : null
  
  // Deal-related queries
  if (lowerQuery.includes('deal') || lowerQuery.includes('top deal') || lowerQuery.includes('best deal')) {
    if (dealsText && dealsText.trim() && !dealsText.includes('None')) {
      // Extract top deals (first 5)
      const dealLines = dealsText.split('\n').filter(line => line.trim() && /^\d+\./.test(line.trim())).slice(0, 5)
      if (dealLines.length > 0) {
        return `Here are your top deals:\n\n${dealLines.join('\n')}\n\nThese are the highest value deals in your pipeline.`
      }
    }
    return `I couldn't find active deals in your data. You can view all deals on the Deals page.`
  }
  
  // Task-related queries
  if (lowerQuery.includes('task') || lowerQuery.includes('todo') || lowerQuery.includes('attention')) {
    if (tasksText && tasksText.trim() && !tasksText.includes('None')) {
      // Extract tasks (first 5)
      const taskLines = tasksText.split('\n').filter(line => line.trim() && /^\d+\./.test(line.trim())).slice(0, 5)
      if (taskLines.length > 0) {
        return `Here are the tasks that need your attention:\n\n${taskLines.join('\n')}\n\nThese are prioritized by importance and due date.`
      }
    }
    return `You currently have no pending tasks. Great job staying on top of things!`
  }
  
  // Invoice-related queries
  if (lowerQuery.includes('invoice') || lowerQuery.includes('overdue')) {
    if (invoicesText && invoicesText.trim() && !invoicesText.includes('None')) {
      // Extract invoices (first 5)
      const invoiceLines = invoicesText.split('\n').filter(line => line.trim() && /^\d+\./.test(line.trim())).slice(0, 5)
      if (invoiceLines.length > 0) {
        return `Here are your overdue invoices:\n\n${invoiceLines.join('\n')}\n\nPlease follow up with these customers to ensure timely payment.`
      }
    }
    return `You have no overdue invoices. Excellent!`
  }
  
  // Revenue-related queries
  if (lowerQuery.includes('revenue') || lowerQuery.includes('income') || lowerQuery.includes('sales')) {
    if (revenue) {
      return `Your revenue for the last 30 days is ₹${revenue}. For detailed financial reports, check the Accounting > Reports section.`
    }
    return `Revenue data is not available at the moment. Check the Dashboard or Accounting > Reports for financial information.`
  }
  
  // Default response
  return `I'm having trouble connecting to the AI service right now. 

To enable full AI capabilities, please ensure your API keys are configured in the .env file:
- GROQ_API_KEY (recommended - fastest)
- OLLAMA_API_KEY (or local Ollama running)
- OPENAI_API_KEY (optional fallback)

Once configured, I'll be able to provide specific answers based on your actual business data.

For now, you can:
- Check the Dashboard for overview statistics
- Use the navigation menu to access specific modules
- View detailed information in each section`
}

