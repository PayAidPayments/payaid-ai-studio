import { ModuleGate } from '@/components/modules/ModuleGate'
'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function AIPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">AI Assistant</h1>
        <p className="mt-2 text-gray-600">AI-powered insights and chat assistant</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>AI Chat</CardTitle>
            <CardDescription>Ask questions about your business</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Chat with AI to get instant answers about your business data, revenue, customers,
              and more.
            </p>
            <Link href="/dashboard/ai/chat">
              <Button>Open Chat</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Business Insights</CardTitle>
            <CardDescription>AI-powered recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Get AI-generated insights and recommendations to improve your business performance.
            </p>
            <Link href="/dashboard/ai/insights">
              <Button variant="outline">View Insights</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


export default function Page() {
  return (
    <ModuleGate module="ai-studio">
      <AIPage />
    </ModuleGate>
  )
}
