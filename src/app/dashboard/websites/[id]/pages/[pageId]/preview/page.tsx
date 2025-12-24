'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function getAuthHeaders() {
  const { token } = useAuthStore.getState()
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  }
}

interface PageContent {
  type: string
  sections?: Array<{
    type: string
    title?: string
    subtitle?: string
    content?: string
    cta?: {
      text: string
      link: string
    } | null
  }>
}

interface Page {
  id: string
  path: string
  title: string
  contentJson: PageContent
  isPublished: boolean
}

export default function PagePreviewPage() {
  const params = useParams()
  const router = useRouter()
  const websiteId = params.id as string
  const pageId = params.pageId as string

  const { data: page, isLoading } = useQuery<Page>({
    queryKey: ['page', websiteId, pageId],
    queryFn: async () => {
      const response = await fetch(`/api/websites/${websiteId}/pages/${pageId}`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        throw new Error('Failed to fetch page')
      }
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div>Loading preview...</div>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div>Page not found</div>
      </div>
    )
  }

  const renderContent = (content: PageContent) => {
    if (!content.sections || content.sections.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p>No content available for this page.</p>
          <p className="text-sm mt-2">Edit the page to add content.</p>
        </div>
      )
    }

    return content.sections.map((section, index) => {
      switch (section.type) {
        case 'hero':
          return (
            <div key={index} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-20 px-6 text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">{section.title || 'Welcome'}</h1>
              {section.subtitle && (
                <p className="text-xl md:text-2xl mb-8 text-blue-100">{section.subtitle}</p>
              )}
              {section.cta && (
                <a
                  href={section.cta.link}
                  className="inline-block bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                >
                  {section.cta.text}
                </a>
              )}
            </div>
          )
        case 'content':
          return (
            <div key={index} className="max-w-4xl mx-auto px-6 py-12">
              {section.title && <h2 className="text-3xl font-bold mb-4">{section.title}</h2>}
              {section.content && (
                <div className="prose prose-lg max-w-none">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{section.content}</p>
                </div>
              )}
            </div>
          )
        default:
          return (
            <div key={index} className="max-w-4xl mx-auto px-6 py-8">
              {section.title && <h2 className="text-2xl font-bold mb-4">{section.title}</h2>}
              {section.subtitle && <p className="text-gray-600 mb-4">{section.subtitle}</p>}
              {section.content && <p className="text-gray-700">{section.content}</p>}
            </div>
          )
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Preview Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              ← Back
            </Button>
            <div>
              <h1 className="font-semibold text-gray-900">Preview: {page.title}</h1>
              <p className="text-sm text-gray-500">Path: {page.path}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              page.isPublished ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {page.isPublished ? 'Published' : 'Draft'}
            </span>
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="bg-white min-h-screen">
        {renderContent(page.contentJson as PageContent)}
      </div>
    </div>
  )
}



