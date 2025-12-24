'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Insight {
  type: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  action?: string
}

export default function AIInsightsPage() {
  const { data, isLoading, refetch } = useQuery<{ insights: Insight[] }>({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const response = await fetch('/api/ai/insights')
      if (!response.ok) throw new Error('Failed to fetch insights')
      return response.json()
    },
  })

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-red-100 text-red-800 border-red-300',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      low: 'bg-blue-100 text-blue-800 border-blue-300',
    }
    return colors[priority] || colors.low
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  const insights = data?.insights || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Business Insights</h1>
          <p className="mt-2 text-gray-600">AI-powered recommendations for your business</p>
        </div>
        <Button onClick={() => refetch()}>Refresh Insights</Button>
      </div>

      {insights.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p className="text-lg mb-2">No insights available</p>
            <p className="text-sm">AI insights will appear here as you use the platform</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight, idx) => (
            <Card key={idx} className={`border-2 ${getPriorityColor(insight.priority)}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{insight.title}</CardTitle>
                  <span className="text-xs font-medium px-2 py-1 rounded capitalize">
                    {insight.priority}
                  </span>
                </div>
                <CardDescription className="text-gray-700">{insight.type}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-4">{insight.description}</p>
                {insight.action && (
                  <Button variant="outline" size="sm">
                    {insight.action}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
