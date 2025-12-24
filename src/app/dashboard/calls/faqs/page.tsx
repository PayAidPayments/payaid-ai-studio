'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface FAQ {
  id: string
  question: string
  answer: string
  category?: string
  timesUsed: number
  isActive: boolean
  createdAt: string
}

export default function FAQsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: '',
  })

  const { data, isLoading, refetch } = useQuery<{ faqs: FAQ[] }>({
    queryKey: ['call-faqs'],
    queryFn: async () => {
      const response = await fetch('/api/calls/faqs')
      if (!response.ok) throw new Error('Failed to fetch FAQs')
      return response.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/calls/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          category: data.category || undefined,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create FAQ')
      }
      return response.json()
    },
    onSuccess: () => {
      setShowCreateForm(false)
      setFormData({ question: '', answer: '', category: '' })
      refetch()
    },
  })

  const faqs = data?.faqs || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Call FAQs</h1>
          <p className="mt-2 text-gray-600">Manage FAQ knowledge base for AI calling bot</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowCreateForm(true)}>Add FAQ</Button>
          <Link href="/dashboard/calls">
            <Button variant="outline">Back to Calls</Button>
          </Link>
        </div>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New FAQ</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createMutation.mutate(formData)
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Question <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  required
                  placeholder="e.g., What are your business hours?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Answer <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  required
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="e.g., Our business hours are Monday to Friday, 9 AM to 6 PM IST."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., pricing, product, support"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create FAQ'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All FAQs</CardTitle>
          <CardDescription>{faqs.length} total FAQs</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">Loading...</div>
          ) : faqs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-4">No FAQs found</p>
              <Button onClick={() => setShowCreateForm(true)}>Create Your First FAQ</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Answer</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Times Used</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faqs.map((faq) => (
                  <TableRow key={faq.id}>
                    <TableCell className="font-medium">{faq.question}</TableCell>
                    <TableCell className="max-w-md truncate">{faq.answer}</TableCell>
                    <TableCell>{faq.category || '-'}</TableCell>
                    <TableCell>{faq.timesUsed}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        faq.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {faq.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
