'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'

function getAuthHeaders() {
  const { token } = useAuthStore.getState()
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  }
}

interface Website {
  id: string
  name: string
  domain?: string
  subdomain?: string
  status: string
  trackingCode: string
  metaTitle?: string
  metaDescription?: string
  pages: Array<{
    id: string
    path: string
    title: string
    isPublished: boolean
  }>
  _count: {
    visits: number
    sessions: number
    pages: number
  }
  createdAt: string
}

export default function WebsiteDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    subdomain: '',
    metaTitle: '',
    metaDescription: '',
    status: 'DRAFT' as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
  })

  const { data: website, refetch } = useQuery<Website>({
    queryKey: ['website', id],
    queryFn: async () => {
      const response = await fetch(`/api/websites/${id}`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to view this website')
        }
        throw new Error('Failed to fetch website')
      }
      const data = await response.json()
      setFormData({
        name: data.name,
        domain: data.domain || '',
        subdomain: data.subdomain || '',
        metaTitle: data.metaTitle || '',
        metaDescription: data.metaDescription || '',
        status: data.status,
      })
      return data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch(`/api/websites/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...data,
          domain: data.domain || null,
          subdomain: data.subdomain || null,
          metaTitle: data.metaTitle || null,
          metaDescription: data.metaDescription || null,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        if (response.status === 401) {
          throw new Error('Please log in to update this website')
        }
        throw new Error(error.error || 'Failed to update website')
      }
      return response.json()
    },
    onSuccess: () => {
      setIsEditing(false)
      refetch()
    },
  })

  // Create page mutation
  const createPageMutation = useMutation({
    mutationFn: async (data: { path: string; title: string }) => {
      const response = await fetch(`/api/websites/${id}/pages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create page')
      }
      return response.json()
    },
    onSuccess: () => {
      refetch()
    },
  })

  // Toggle page publish mutation
  const togglePagePublishMutation = useMutation({
    mutationFn: async (data: { pageId: string; isPublished: boolean }) => {
      const response = await fetch(`/api/websites/${id}/pages/${data.pageId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isPublished: data.isPublished }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update page')
      }
      return response.json()
    },
    onSuccess: () => {
      refetch()
    },
  })

  // Delete page mutation
  const deletePageMutation = useMutation({
    mutationFn: async (pageId: string) => {
      const response = await fetch(`/api/websites/${id}/pages/${pageId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete page')
      }
      return response.json()
    },
    onSuccess: () => {
      refetch()
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  if (!website) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{website.name}</h1>
          <p className="mt-2 text-gray-600">Website details and tracking</p>
        </div>
        <div className="flex gap-2">
          {!isEditing && (
            <>
              <Link href={`/dashboard/websites/${id}/preview`}>
                <Button variant="outline">
                  👁️ Preview Website
                </Button>
              </Link>
              <Button 
                onClick={() => {
                  updateMutation.mutate({
                    ...formData,
                    status: website.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
                  })
                }}
                variant={website.status === 'PUBLISHED' ? 'outline' : 'default'}
                disabled={updateMutation.isPending}
              >
                {website.status === 'PUBLISHED' ? 'Unpublish Website' : 'Publish Website'}
              </Button>
              <Button onClick={() => setIsEditing(true)} variant="outline">
                Edit
              </Button>
              <Link href="/dashboard/websites">
                <Button variant="outline">Back</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Website</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="name" className="text-sm font-medium text-gray-700">
                    Website Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="domain" className="text-sm font-medium text-gray-700">
                    Custom Domain
                  </label>
                  <Input
                    id="domain"
                    name="domain"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="subdomain" className="text-sm font-medium text-gray-700">
                    Subdomain
                  </label>
                  <Input
                    id="subdomain"
                    name="subdomain"
                    value={formData.subdomain}
                    onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="status" className="text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="metaTitle" className="text-sm font-medium text-gray-700">
                    Meta Title
                  </label>
                  <Input
                    id="metaTitle"
                    name="metaTitle"
                    value={formData.metaTitle}
                    onChange={(e) => setFormData({ ...formData, metaTitle: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="metaDescription" className="text-sm font-medium text-gray-700">
                    Meta Description
                  </label>
                  <textarea
                    id="metaDescription"
                    name="metaDescription"
                    value={formData.metaDescription}
                    onChange={(e) => setFormData({ ...formData, metaDescription: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Website Info */}
          <Card>
            <CardHeader>
              <CardTitle>Website Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Domain</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {website.domain || website.subdomain || 'Not configured'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      website.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                      website.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {website.status}
                    </span>
                  </dd>
                </div>
                {website.status === 'PUBLISHED' && website.subdomain && (
                  <div className="md:col-span-2">
                    <dt className="text-sm font-medium text-gray-500 mb-2">Public Website URL</dt>
                    <dd className="mt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`/sites/${website.subdomain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm break-all"
                        >
                          {process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/sites/{website.subdomain}
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
                            const url = `${baseUrl}/sites/${website.subdomain}`
                            navigator.clipboard.writeText(url)
                            alert('URL copied to clipboard!')
                          }}
                        >
                          Copy URL
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Share this URL to let visitors view your published website
                      </p>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Total Visits</dt>
                  <dd className="mt-1 text-sm text-gray-900">{website._count.visits.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Total Sessions</dt>
                  <dd className="mt-1 text-sm text-gray-900">{website._count.sessions.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Pages</dt>
                  <dd className="mt-1 text-sm text-gray-900">{website._count.pages}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900">{format(new Date(website.createdAt), 'PPp')}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Tracking Code */}
          <Card>
            <CardHeader>
              <CardTitle>Tracking Code</CardTitle>
              <CardDescription>Add this script to your website to start tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm overflow-x-auto">
                {`<script>
  window.PAYAID_TRACKING_CODE = '${website.trackingCode}';
  window.PAYAID_ANALYTICS_URL = '${process.env.NEXT_PUBLIC_APP_URL || 'https://api.payaid.com'}/api/analytics';
</script>
<script src="${process.env.NEXT_PUBLIC_APP_URL || 'https://api.payaid.com'}/analytics.js"></script>`}
              </div>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `<script>\n  window.PAYAID_TRACKING_CODE = '${website.trackingCode}';\n  window.PAYAID_ANALYTICS_URL = '${process.env.NEXT_PUBLIC_APP_URL || 'https://api.payaid.com'}/api/analytics';\n</script>\n<script src="${process.env.NEXT_PUBLIC_APP_URL || 'https://api.payaid.com'}/analytics.js"></script>`
                  )
                  alert('Tracking code copied to clipboard!')
                }}
              >
                Copy Tracking Code
              </Button>
            </CardContent>
          </Card>

          {/* Pages */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pages ({website.pages.length})</CardTitle>
                <CardDescription>Manage your website pages</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    try {
                      const response = await fetch(`/api/websites/${id}/pages/update-content`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                      })
                      const data = await response.json()
                      if (response.ok) {
                        alert(`Success! ${data.message || 'Pages updated with business content!'}`)
                        refetch()
                      } else {
                        alert(`Failed to update pages: ${data.error || 'Unknown error'}`)
                        console.error('Update content error:', data)
                      }
                    } catch (error) {
                      console.error('Update content error:', error)
                      alert(`Error updating pages: ${error instanceof Error ? error.message : 'Unknown error'}`)
                    }
                  }}
                  variant="outline"
                  size="sm"
                >
                  📝 Update Content
                </Button>
                <Button
                  onClick={() => {
                    const newPath = prompt('Enter page path (e.g., /services, /blog):')
                    if (newPath && newPath.trim()) {
                      const newTitle = prompt('Enter page title:') || newPath.trim()
                      createPageMutation.mutate({
                        path: newPath.trim(),
                        title: newTitle.trim(),
                      })
                    }
                  }}
                  variant="outline"
                  size="sm"
                >
                  + Add Page
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {website.pages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm mb-4">No pages created yet</p>
                  <Button
                    onClick={() => {
                      const newPath = prompt('Enter page path (e.g., /services):')
                      if (newPath && newPath.trim()) {
                        const newTitle = prompt('Enter page title:') || newPath.trim()
                        createPageMutation.mutate({
                          path: newPath.trim(),
                          title: newTitle.trim(),
                        })
                      }
                    }}
                    variant="outline"
                  >
                    Create First Page
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {website.pages.map((page) => (
                    <div key={page.id} className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                      <div className="flex-1">
                        <div className="font-medium">{page.title}</div>
                        <div className="text-sm text-gray-500">{page.path}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          page.isPublished ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {page.isPublished ? 'Published' : 'Draft'}
                        </span>
                        <Link href={`/dashboard/websites/${id}/pages/${page.id}/preview`}>
                          <Button
                            variant="outline"
                            size="sm"
                          >
                            👁️ Preview
                          </Button>
                        </Link>
                        <Button
                          onClick={() => {
                            togglePagePublishMutation.mutate({
                              pageId: page.id,
                              isPublished: !page.isPublished,
                            })
                          }}
                          variant="outline"
                          size="sm"
                        >
                          {page.isPublished ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button
                          onClick={() => {
                            if (confirm(`Delete page "${page.title}"?`)) {
                              deletePageMutation.mutate(page.id)
                            }
                          }}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
