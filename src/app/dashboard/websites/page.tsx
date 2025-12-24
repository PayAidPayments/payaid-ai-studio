'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { ModuleGate } from '@/components/modules/ModuleGate'

interface Website {
  id: string
  name: string
  domain?: string
  subdomain?: string
  status: string
  trackingCode: string
  _count: {
    visits: number
    sessions: number
    pages: number
  }
  createdAt: string
}

function WebsitesPageContent() {
  const router = useRouter()

  const { data, isLoading, refetch } = useQuery<{ websites: Website[] }>({
    queryKey: ['websites'],
    queryFn: async () => {
      const response = await fetch('/api/websites')
      if (!response.ok) throw new Error('Failed to fetch websites')
      return response.json()
    },
  })

  const websites = data?.websites || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Websites</h1>
          <p className="mt-2 text-gray-600">Manage your websites and track analytics</p>
        </div>
        <Link href="/dashboard/websites/new">
          <Button>Create Website</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">Loading...</div>
      ) : websites.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-gray-500 mb-4">No websites found</p>
              <Link href="/dashboard/websites/new">
                <Button>Create Your First Website</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {websites.map((website) => (
            <Card key={website.id}>
              <CardHeader>
                <CardTitle>{website.name}</CardTitle>
                <CardDescription>
                  {website.domain || website.subdomain || 'No domain configured'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      website.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                      website.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {website.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Visits:</span>
                    <span className="font-semibold">{website._count.visits.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Sessions:</span>
                    <span className="font-semibold">{website._count.sessions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pages:</span>
                    <span className="font-semibold">{website._count.pages}</span>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <div className="text-xs text-gray-500 mb-2">Tracking Code:</div>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block break-all">
                    {website.trackingCode}
                  </code>
                </div>
                <div className="flex gap-2 mt-4">
                  <Link href={`/dashboard/analytics?websiteId=${website.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      Analytics
                    </Button>
                  </Link>
                  <Link href={`/dashboard/websites/${website.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      Edit
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function WebsitesPage() {
  return (
    <ModuleGate module="ai-studio">
      <WebsitesPageContent />
    </ModuleGate>
  )
}

export default function WebsitesPage() {
  return (
    <ModuleGate module="ai-studio">
      <WebsitesPageContent />
    </ModuleGate>
  )
}
