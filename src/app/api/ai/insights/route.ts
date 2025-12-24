import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { getOllamaClient } from '@/lib/ai/ollama'
import { getGroqClient } from '@/lib/ai/groq'
import { prisma } from '@payaid/db'
import { mediumPriorityQueue } from '@/lib/queue/bull'

// GET /api/ai/insights - Get AI-powered business insights
export async function GET(request: NextRequest) {
  try {
    // Check Analytics module license (AI insights are part of analytics)
    const { tenantId, userId } = await requireAIStudioAccess(request)

    // Get business data with limits to prevent loading too much data
    const [
      contacts,
      deals,
      orders,
      invoices,
      tasks,
    ] = await Promise.all([
      prisma.contact.findMany({
        where: { tenantId: tenantId },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          lastContactedAt: true,
          likelyToBuy: true,
          churnRisk: true,
        },
        take: 100, // Limit to 100 most recent contacts
        orderBy: { createdAt: 'desc' },
      }),
      prisma.deal.findMany({
        where: { tenantId: tenantId },
        select: {
          id: true,
          name: true,
          value: true,
          stage: true,
          probability: true,
          expectedCloseDate: true,
        },
        take: 100, // Limit to 100 most recent deals
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.findMany({
        where: { tenantId: tenantId },
        select: {
          id: true,
          total: true,
          status: true,
          createdAt: true,
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.findMany({
        where: { tenantId: tenantId },
        select: {
          id: true,
          total: true,
          status: true,
          dueDate: true,
          paidAt: true,
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where: {
          tenantId: tenantId,
          status: { not: 'completed' },
        },
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
        },
        take: 50, // Limit to 50 pending tasks
        orderBy: { dueDate: 'asc' },
      }),
    ])

    // Calculate metrics
    const totalRevenue = orders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + o.total, 0)

    const pendingInvoices = invoices.filter(i => i.status === 'sent' && !i.paidAt)
    const totalPendingAmount = pendingInvoices.reduce((sum, i) => sum + i.total, 0)

    const activeDeals = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost')
    const forecastedRevenue = activeDeals.reduce(
      (sum, d) => sum + d.value * (d.probability / 100),
      0
    )

    const atRiskContacts = contacts.filter(c => c.churnRisk === true).length
    const highValueLeads = contacts.filter(c => c.likelyToBuy === true).length

    // Generate AI insights - try Ollama, then Groq, then rule-based
    let parsedInsights
    try {
      const insightsPrompt = `
Analyze this business data and provide 5 key insights and recommendations:

Business Metrics:
- Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')}
- Pending Invoices: ${pendingInvoices.length} (₹${totalPendingAmount.toLocaleString('en-IN')})
- Forecasted Revenue: ₹${forecastedRevenue.toLocaleString('en-IN')}
- Active Deals: ${activeDeals.length}
- At-Risk Contacts: ${atRiskContacts}
- High-Value Leads: ${highValueLeads}
- Pending Tasks: ${tasks.length}

Deal Pipeline:
${deals.slice(0, 10).map(d => `- ${d.name}: ₹${d.value} (${d.stage}, ${d.probability}% probability)`).join('\n')}

Provide:
1. Top 3 urgent actions
2. Revenue opportunities
3. Risk warnings
4. Growth recommendations
5. Operational improvements

Format as JSON with keys: urgentActions, opportunities, risks, recommendations, improvements
`

      const systemPrompt = `You are a business analyst AI. Analyze the provided business data and return insights in JSON format.
Be specific, actionable, and data-driven.`

      let insights: string
      
      // Try Ollama first
      try {
        const ollama = getOllamaClient()
        insights = await ollama.generateCompletion(insightsPrompt, systemPrompt)
      } catch (ollamaError) {
        console.error('Ollama failed, trying Groq:', ollamaError)
        // Fallback to Groq
        const groq = getGroqClient()
        insights = await groq.generateCompletion(insightsPrompt, systemPrompt)
      }

      // Parse insights (handle both JSON and text responses)
      try {
        parsedInsights = JSON.parse(insights)
      } catch {
        // If not JSON, create structured response from text
        parsedInsights = {
          urgentActions: [],
          opportunities: [],
          risks: [],
          recommendations: [],
          improvements: [],
          raw: insights,
        }
      }
    } catch (error) {
      console.error('AI insights generation failed, using rule-based insights:', error)
      // Fallback to rule-based insights
      parsedInsights = generateRuleBasedInsights({
        totalRevenue,
        pendingInvoices: pendingInvoices.length,
        totalPendingAmount,
        forecastedRevenue,
        activeDeals: activeDeals.length,
        atRiskContacts,
        highValueLeads,
        pendingTasks: tasks.length,
        deals: deals.slice(0, 10),
      })
    }

    // Log insights generation
    mediumPriorityQueue.add('log-insights-generation', {
      userId: userId,
      tenantId: tenantId,
      insights: parsedInsights,
    })

    return NextResponse.json({
      insights: parsedInsights,
      metrics: {
        totalRevenue,
        pendingInvoices: pendingInvoices.length,
        totalPendingAmount,
        forecastedRevenue,
        activeDeals: activeDeals.length,
        atRiskContacts,
        highValueLeads,
        pendingTasks: tasks.length,
      },
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error('AI insights error:', error)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}

function generateRuleBasedInsights(metrics: {
  totalRevenue: number
  pendingInvoices: number
  totalPendingAmount: number
  forecastedRevenue: number
  activeDeals: number
  atRiskContacts: number
  highValueLeads: number
  pendingTasks: number
  deals: any[]
}): any {
  const urgentActions: string[] = []
  const opportunities: string[] = []
  const risks: string[] = []
  const recommendations: string[] = []
  const improvements: string[] = []

  // Urgent Actions
  if (metrics.pendingInvoices > 0) {
    urgentActions.push(`Follow up on ${metrics.pendingInvoices} pending invoice(s) worth ₹${metrics.totalPendingAmount.toLocaleString('en-IN')}`)
  }
  if (metrics.pendingTasks > 5) {
    urgentActions.push(`Complete ${metrics.pendingTasks} pending tasks to improve productivity`)
  }
  if (metrics.atRiskContacts > 0) {
    urgentActions.push(`Re-engage ${metrics.atRiskContacts} at-risk contact(s) to prevent churn`)
  }

  // Opportunities
  if (metrics.forecastedRevenue > 0) {
    opportunities.push(`Focus on closing active deals to realize ₹${metrics.forecastedRevenue.toLocaleString('en-IN')} in forecasted revenue`)
  }
  if (metrics.highValueLeads > 0) {
    opportunities.push(`Nurture ${metrics.highValueLeads} high-value lead(s) to convert them to customers`)
  }
  if (metrics.activeDeals > 0) {
    opportunities.push(`Accelerate ${metrics.activeDeals} active deal(s) through the pipeline`)
  }

  // Risks
  if (metrics.totalPendingAmount > 10000) {
    risks.push(`High pending invoice amount (₹${metrics.totalPendingAmount.toLocaleString('en-IN')}) may impact cash flow`)
  }
  if (metrics.atRiskContacts > 0) {
    risks.push(`${metrics.atRiskContacts} contact(s) are at risk of churning - immediate action needed`)
  }

  // Recommendations
  if (metrics.totalRevenue < 100000) {
    recommendations.push('Focus on increasing revenue through new customer acquisition and upselling')
  }
  if (metrics.activeDeals < 5) {
    recommendations.push('Build a stronger pipeline by generating more leads and opportunities')
  }

  // Improvements
  if (metrics.pendingTasks > 10) {
    improvements.push('Implement task prioritization and automation to reduce backlog')
  }
  if (metrics.pendingInvoices > 0) {
    improvements.push('Set up automated invoice reminders to improve collection rates')
  }

  return {
    urgentActions: urgentActions.length > 0 ? urgentActions : ['No urgent actions at this time'],
    opportunities: opportunities.length > 0 ? opportunities : ['Continue building your pipeline'],
    risks: risks.length > 0 ? risks : ['No major risks identified'],
    recommendations: recommendations.length > 0 ? recommendations : ['Keep up the good work!'],
    improvements: improvements.length > 0 ? improvements : ['System is running smoothly'],
  }
}

