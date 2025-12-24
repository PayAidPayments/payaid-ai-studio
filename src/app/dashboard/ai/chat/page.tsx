'use client'

import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModuleGate } from '@/components/modules/ModuleGate'

function getAuthHeaders() {
  const { token } = useAuthStore.getState()
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface QuickAction {
  id: string
  label: string
  icon: string
  prompt: string
  category: string
}

const quickActions: QuickAction[] = [
  {
    id: 'proposal',
    label: 'Create Proposal',
    icon: '📄',
    prompt: 'Help me create a professional business proposal',
    category: 'Documents',
  },
  {
    id: 'quote',
    label: 'Generate Quote',
    icon: '💰',
    prompt: 'Create a detailed quote for a client',
    category: 'Documents',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Post',
    icon: '💼',
    prompt: 'Create a professional LinkedIn post about our business',
    category: 'Social Media',
  },
  {
    id: 'facebook',
    label: 'Facebook Post',
    icon: '📘',
    prompt: 'Create an engaging Facebook post',
    category: 'Social Media',
  },
  {
    id: 'instagram',
    label: 'Instagram Post',
    icon: '📷',
    prompt: 'Create an Instagram post with engaging captions and hashtags',
    category: 'Social Media',
  },
  {
    id: 'twitter',
    label: 'Twitter/X Post',
    icon: '🐦',
    prompt: 'Create a concise and engaging Twitter/X post',
    category: 'Social Media',
  },
  {
    id: 'pitch-deck',
    label: 'Pitch Deck',
    icon: '📊',
    prompt: 'Help me create a comprehensive pitch deck for investors',
    category: 'Documents',
  },
  {
    id: 'business-plan',
    label: 'Business Plan',
    icon: '📋',
    prompt: 'Create a detailed business plan',
    category: 'Documents',
  },
  {
    id: 'email-template',
    label: 'Email Template',
    icon: '✉️',
    prompt: 'Create a professional email template',
    category: 'Communication',
  },
  {
    id: 'marketing-copy',
    label: 'Marketing Copy',
    icon: '📢',
    prompt: 'Create compelling marketing copy',
    category: 'Marketing',
  },
  {
    id: 'revenue-analysis',
    label: 'Revenue Analysis',
    icon: '📈',
    prompt: 'Analyze my revenue and provide insights',
    category: 'Analytics',
  },
  {
    id: 'top-customers',
    label: 'Top Customers',
    icon: '👥',
    prompt: 'Show me my top customers and their details',
    category: 'Analytics',
  },
  {
    id: 'pipeline-status',
    label: 'Deal Pipeline',
    icon: '💼',
    prompt: 'Show me the status of my deal pipeline',
    category: 'Analytics',
  },
  {
    id: 'tasks-overdue',
    label: 'Overdue Tasks',
    icon: '⚠️',
    prompt: 'Show me tasks that need attention',
    category: 'Operations',
  },
]

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ message }),
        })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          if (response.status === 401) {
            throw new Error('Please log in to use the AI chat')
          }
          throw new Error(errorData.message || errorData.error || 'Failed to send message')
        }
        return response.json()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
        throw err
      }
    },
    onSuccess: (data, variables) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: variables, timestamp: new Date() },
        { role: 'assistant', content: data.response || data.message || 'No response', timestamp: new Date() },
      ])
      setInput('')
      setError(null)
    },
    onError: (err, variables) => {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      // Add user message even if API call failed
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: variables, timestamp: new Date() },
        { role: 'assistant', content: `Error: ${errorMessage}`, timestamp: new Date() },
      ])
      setInput('')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !sendMessage.isPending) {
      sendMessage.mutate(input.trim())
    }
  }

  const handleQuickAction = (action: QuickAction) => {
    setInput(action.prompt)
    // Auto-focus the input
    setTimeout(() => {
      const inputElement = document.querySelector('input[type="text"]') as HTMLInputElement
      inputElement?.focus()
    }, 100)
  }

  const categories = ['All', ...Array.from(new Set(quickActions.map((a) => a.category)))]
  const filteredActions = selectedCategory === 'All' 
    ? quickActions 
    : quickActions.filter((a) => a.category === selectedCategory)

  return (
    <ModuleGate module="ai-studio">
      <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">AI Chat Assistant</h1>
        <p className="mt-2 text-gray-600">Ask questions about your business data and get AI-powered insights</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Chat Area */}
        <div className="lg:col-span-3">
          <Card className="h-[600px] flex flex-col">
            <CardHeader>
              <CardTitle>Chat</CardTitle>
              <CardDescription>Ask anything about your business</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden">
              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    <p className="text-lg mb-2">👋 Start a conversation</p>
                    <p className="text-sm">Try asking:</p>
                    <ul className="text-sm mt-2 space-y-1">
                      <li>• &quot;What&apos;s my total revenue this month?&quot;</li>
                      <li>• &quot;Show me my top customers&quot;</li>
                      <li>• &quot;How many deals are in the pipeline?&quot;</li>
                    </ul>
                    <p className="text-sm mt-4 text-blue-600">Or click an option from the sidebar →</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        <div
                          className={`text-xs mt-1 ${
                            msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                          }`}
                        >
                          {msg.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {sendMessage.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg px-4 py-2">
                      <div className="text-sm text-gray-600">Thinking...</div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question or select an option from the sidebar..."
                  className="flex-1 h-10 rounded-md border border-gray-300 px-3"
                  disabled={sendMessage.isPending}
                />
                <Button type="submit" disabled={sendMessage.isPending || !input.trim()}>
                  Send
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions Sidebar */}
        <div className="lg:col-span-1">
          <Card className="h-[600px] flex flex-col">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Click to enhance your prompt</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden">
              {/* Category Filter */}
              <div className="mb-4">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Actions List */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {filteredActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action)}
                    className="w-full text-left p-3 rounded-md border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors group"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xl">{action.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 group-hover:text-blue-600">
                          {action.label}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {action.prompt}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </ModuleGate>
  )
}
