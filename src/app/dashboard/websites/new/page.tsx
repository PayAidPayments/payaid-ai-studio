'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/auth'
import { apiRequest } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewWebsitePage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    subdomain: '',
    metaTitle: '',
    metaDescription: '',
  })
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      try {
        const response = await apiRequest('/api/websites', {
          method: 'POST',
          body: JSON.stringify({
            name: data.name.trim(),
            domain: data.domain?.trim() || undefined,
            subdomain: data.subdomain?.trim() || undefined,
            metaTitle: data.metaTitle?.trim() || undefined,
            metaDescription: data.metaDescription?.trim() || undefined,
          }),
        })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.error || errorData.message || 'Failed to create website'
          if (errorData.details) {
            console.error('API error details:', errorData.details)
          }
          throw new Error(errorMessage)
        }
        const result = await response.json()
        if (!result.id) {
          throw new Error('Invalid response from server')
        }
        return result
      } catch (err) {
        console.error('Create website mutation error:', err)
        throw err
      }
    },
    onSuccess: (data) => {
      if (data?.id) {
        router.push(`/dashboard/websites/${data.id}`)
      } else {
        setError('Website created but could not redirect. Please refresh the page.')
      }
    },
    onError: (err: Error) => {
      console.error('Create website error:', err)
      setError(err.message || 'Failed to create website. Please try again.')
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    createMutation.mutate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Website</h1>
          <p className="mt-2 text-gray-600">Create a new website and get your tracking code</p>
        </div>
        <Link href="/dashboard/websites">
          <Button variant="outline">Cancel</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Website Details</CardTitle>
          <CardDescription>Enter your website information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="name" className="text-sm font-medium text-gray-700">
                  Website Name <span className="text-red-500">*</span>
                </label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., My Business Website"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="domain" className="text-sm font-medium text-gray-700">
                  Custom Domain (optional)
                </label>
                <Input
                  id="domain"
                  name="domain"
                  value={formData.domain}
                  onChange={handleChange}
                  placeholder="example.com"
                />
                <p className="text-xs text-gray-500">Leave empty to use auto-generated subdomain</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="subdomain" className="text-sm font-medium text-gray-700">
                  Subdomain (optional)
                </label>
                <Input
                  id="subdomain"
                  name="subdomain"
                  value={formData.subdomain}
                  onChange={handleChange}
                  placeholder="my-site"
                />
                <p className="text-xs text-gray-500">Auto-generated if left empty</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="metaTitle" className="text-sm font-medium text-gray-700">
                  Meta Title (SEO)
                </label>
                <Input
                  id="metaTitle"
                  name="metaTitle"
                  value={formData.metaTitle}
                  onChange={handleChange}
                  placeholder="Page title for search engines"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="metaDescription" className="text-sm font-medium text-gray-700">
                  Meta Description (SEO)
                </label>
                <textarea
                  id="metaDescription"
                  name="metaDescription"
                  value={formData.metaDescription}
                  onChange={(e) => setFormData({ ...formData, metaDescription: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="Brief description for search engines"
                />
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Link href="/dashboard/websites">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Website'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
