'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

interface CallRecording {
  id: string
  recordingUrl: string
  duration: number
  format: string
  createdAt: string
}

interface CallTranscript {
  id: string
  transcript: string
  segments?: any
  sentiment?: string
  sentimentScore?: number
  keyPoints?: any
  actionItems?: any
  createdAt: string
}

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
  aiIntent?: string
  aiConfidence?: number
  contactId?: string
  dealId?: string
  leadId?: string
  recordings: CallRecording[]
  transcripts: CallTranscript[]
}

export default function CallDetailPage() {
  const params = useParams()
  const id = params.id as string

  const { data: call, isLoading } = useQuery<AICall>({
    queryKey: ['call', id],
    queryFn: async () => {
      const response = await fetch(`/api/calls/${id}`)
      if (!response.ok) throw new Error('Failed to fetch call')
      return response.json()
    },
  })

  if (isLoading || !call) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Call Details</h1>
          <p className="mt-2 text-gray-600">{call.phoneNumber}</p>
        </div>
        <Link href="/dashboard/calls">
          <Button variant="outline">Back</Button>
        </Link>
      </div>

      {/* Call Info */}
      <Card>
        <CardHeader>
          <CardTitle>Call Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Phone Number</dt>
              <dd className="mt-1 text-sm text-gray-900">{call.phoneNumber}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Direction</dt>
              <dd className="mt-1 text-sm text-gray-900 capitalize">{call.direction.toLowerCase()}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {call.status.replace('_', ' ')}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Duration</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {call.duration ? `${Math.round(call.duration / 60)}m ${call.duration % 60}s` : '-'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Started At</dt>
              <dd className="mt-1 text-sm text-gray-900">{format(new Date(call.startedAt), 'PPp')}</dd>
            </div>
            {call.endedAt && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Ended At</dt>
                <dd className="mt-1 text-sm text-gray-900">{format(new Date(call.endedAt), 'PPp')}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">AI Handled</dt>
              <dd className="mt-1">
                {call.handledByAI ? (
                  <span className="text-green-600">✓ Yes</span>
                ) : (
                  <span className="text-gray-400">No</span>
                )}
              </dd>
            </div>
            {call.aiIntent && (
              <div>
                <dt className="text-sm font-medium text-gray-500">AI Intent</dt>
                <dd className="mt-1 text-sm text-gray-900">{call.aiIntent}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Transcript */}
      {call.transcripts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
            {call.transcripts[0].sentiment && (
              <CardDescription>
                Sentiment: {call.transcripts[0].sentiment}
                {call.transcripts[0].sentimentScore && ` (${Number(call.transcripts[0].sentimentScore).toFixed(2)})`}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none">
              <p className="whitespace-pre-wrap">{call.transcripts[0].transcript}</p>
            </div>
            {call.transcripts[0].keyPoints && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-semibold mb-2">Key Points:</h4>
                <ul className="list-disc list-inside space-y-1">
                  {(call.transcripts[0].keyPoints as string[]).map((point, idx) => (
                    <li key={idx} className="text-sm">{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {call.transcripts[0].actionItems && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-semibold mb-2">Action Items:</h4>
                <ul className="list-disc list-inside space-y-1">
                  {(call.transcripts[0].actionItems as string[]).map((item, idx) => (
                    <li key={idx} className="text-sm">{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recordings */}
      {call.recordings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recordings ({call.recordings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {call.recordings.map((recording) => (
                <div key={recording.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <div className="font-medium">Recording</div>
                    <div className="text-sm text-gray-500">
                      {recording.duration}s • {recording.format} • {format(new Date(recording.createdAt), 'PPp')}
                    </div>
                  </div>
                  <a href={recording.recordingUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      Play
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
