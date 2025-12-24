'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/auth'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

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

interface Website {
  id: string
  name: string
  domain?: string
  subdomain?: string
  metaTitle?: string
  metaDescription?: string
  pages: Page[]
}

export default function WebsitePreviewPage() {
  const params = useParams()
  const router = useRouter()
  const websiteId = params.id as string
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)

  const { data: website, isLoading } = useQuery<Website>({
    queryKey: ['website', websiteId],
    queryFn: async () => {
      const response = await fetch(`/api/websites/${websiteId}`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        throw new Error('Failed to fetch website')
      }
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div>Loading website preview...</div>
      </div>
    )
  }

  if (!website) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div>Website not found</div>
      </div>
    )
  }

  const selectedPage = selectedPageId
    ? website.pages.find((p) => p.id === selectedPageId)
    : website.pages.find((p) => p.path === '/') || website.pages[0]

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
              <h1 className="font-semibold text-gray-900">{website.name}</h1>
              <p className="text-sm text-gray-500">
                {website.domain || website.subdomain || 'No domain configured'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/websites/${websiteId}`}>
              <Button variant="outline" size="sm">
                Manage Website
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar Navigation */}
        {website.pages.length > 1 && (
          <div className="w-64 bg-white border-r min-h-screen p-4">
            <h2 className="font-semibold text-gray-900 mb-4">Pages</h2>
            <nav className="space-y-1">
              {website.pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setSelectedPageId(page.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedPage?.id === page.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{page.title}</span>
                    <span className={`w-2 h-2 rounded-full ${
                      page.isPublished ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{page.path}</div>
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 bg-white min-h-screen">
          {selectedPage ? (
            <>
              <div className="border-b bg-gray-50 px-6 py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedPage.title}</h2>
                    <p className="text-sm text-gray-500">{selectedPage.path}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedPage.isPublished ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedPage.isPublished ? 'Published' : 'Draft'}
                  </span>
                </div>
              </div>
              {renderContent(selectedPage.contentJson as PageContent)}
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>No pages available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}



