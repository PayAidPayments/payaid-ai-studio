'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns'
import { ModuleGate } from '@/components/modules/ModuleGate'

interface AICall {
  id: string
  phoneNumber: string
  direction: string
  status: string
  startedAt: string
  answeredAt?: string
  endedAt?: string
  duration?: number
  handledByAI: boolean
  _count: {
    recordings: number
    transcripts: number
  }
}

function CallsPageContent() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useQuery<{
    calls: AICall[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }>({
    queryKey: ['calls', page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`/api/calls?${params}`)
      if (!response.ok) throw new Error('Failed to fetch calls')
      return response.json()
    },
  })

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      RINGING: 'bg-blue-100 text-blue-800',
      ANSWERED: 'bg-green-100 text-green-800',
      COMPLETED: 'bg-gray-100 text-gray-800',
      FAILED: 'bg-red-100 text-red-800',
      BUSY: 'bg-yellow-100 text-yellow-800',
      NO_ANSWER: 'bg-orange-100 text-orange-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const calls = data?.calls || []
  const pagination = data?.pagination

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Calling Bot</h1>
          <p className="mt-2 text-gray-600">Manage calls, transcripts, and FAQs</p>
        </div>
        <Link href="/dashboard/calls/faqs">
          <Button variant="outline">Manage FAQs</Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-md border border-gray-300 px-3"
            >
              <option value="">All Status</option>
              <option value="RINGING">Ringing</option>
              <option value="ANSWERED">Answered</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
            </select>
            <Button onClick={() => refetch()}>Refresh</Button>
          </div>
        </CardContent>
      </Card>

      {/* Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle>Call History</CardTitle>
          <CardDescription>{pagination?.total || 0} total calls</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">Loading...</div>
          ) : calls.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-4">No calls found</p>
              <p className="text-sm">Calls will appear here when received or made</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>AI Handled</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => (
                    <TableRow key={call.id}>
                      <TableCell className="font-medium">{call.phoneNumber}</TableCell>
                      <TableCell className="capitalize">{call.direction.toLowerCase()}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(call.status)}`}>
                          {call.status.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {call.duration ? `${Math.round(call.duration / 60)}m ${call.duration % 60}s` : '-'}
                      </TableCell>
                      <TableCell>{format(new Date(call.startedAt), 'PPp')}</TableCell>
                      <TableCell>
                        {call.handledByAI ? (
                          <span className="text-green-600">✓ Yes</span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/calls/${call.id}`}>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CallsPage() {
  return (
    <ModuleGate module="ai-studio">
      <CallsPageContent />
    </ModuleGate>
  )
}
