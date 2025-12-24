'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function getAuthHeaders() {
  const { token } = useAuthStore.getState()
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  }
}

export default function AITestPage() {
  const [results, setResults] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTest = async () => {
    setIsLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch('/api/ai/test', {
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.error || 'Failed to test AI services')
      }

      const data = await response.json()
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test AI services')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    runTest()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">AI Service Test</h1>
        <p className="mt-2 text-gray-600">
          Test your Groq and Ollama API connections
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={runTest} disabled={isLoading}>
          {isLoading ? 'Testing...' : 'Run Test Again'}
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {results && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Groq Test Results */}
          <Card>
            <CardHeader>
              <CardTitle>Groq API</CardTitle>
              <CardDescription>Fast inference API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Configured</div>
                <div className="font-semibold">
                  {results.groq?.configured ? (
                    <span className="text-green-600">✅ Yes</span>
                  ) : (
                    <span className="text-red-600">❌ No</span>
                  )}
                </div>
              </div>
              
              {results.groq?.configured && (
                <>
                  <div>
                    <div className="text-sm text-gray-500">API Key Length</div>
                    <div className="font-semibold">{results.groq.apiKeyLength} characters</div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-gray-500">Model</div>
                    <div className="font-semibold">{results.groq.model}</div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-gray-500">Test Result</div>
                    <div className="font-semibold">
                      {results.groq.testResult === 'success' ? (
                        <span className="text-green-600">✅ Success</span>
                      ) : results.groq.testResult === 'failed' ? (
                        <span className="text-red-600">❌ Failed</span>
                      ) : results.groq.testResult === 'error' ? (
                        <span className="text-red-600">❌ Error</span>
                      ) : (
                        <span className="text-gray-500">Not tested</span>
                      )}
                    </div>
                  </div>
                  
                  {results.groq.response && (
                    <div>
                      <div className="text-sm text-gray-500">Response</div>
                      <div className="text-sm bg-gray-100 p-2 rounded">{results.groq.response}</div>
                    </div>
                  )}
                  
                  {results.groq.error && (
                    <div>
                      <div className="text-sm text-gray-500">Error</div>
                      <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{results.groq.error}</div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Ollama Test Results */}
          <Card>
            <CardHeader>
              <CardTitle>Ollama API</CardTitle>
              <CardDescription>Local or cloud LLM</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Configured</div>
                <div className="font-semibold">
                  {results.ollama?.configured ? (
                    <span className="text-green-600">✅ Yes</span>
                  ) : (
                    <span className="text-red-600">❌ No</span>
                  )}
                </div>
              </div>
              
              {results.ollama?.configured && (
                <>
                  <div>
                    <div className="text-sm text-gray-500">Base URL</div>
                    <div className="font-semibold">{results.ollama.baseUrl}</div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-gray-500">Model</div>
                    <div className="font-semibold">{results.ollama.model}</div>
                  </div>
                  
                  {results.ollama.apiKeyLength > 0 && (
                    <div>
                      <div className="text-sm text-gray-500">API Key Length</div>
                      <div className="font-semibold">{results.ollama.apiKeyLength} characters</div>
                    </div>
                  )}
                  
                  <div>
                    <div className="text-sm text-gray-500">Test Result</div>
                    <div className="font-semibold">
                      {results.ollama.testResult === 'success' ? (
                        <span className="text-green-600">✅ Success</span>
                      ) : results.ollama.testResult === 'failed' ? (
                        <span className="text-red-600">❌ Failed</span>
                      ) : results.ollama.testResult === 'error' ? (
                        <span className="text-red-600">❌ Error</span>
                      ) : (
                        <span className="text-gray-500">Not tested</span>
                      )}
                    </div>
                  </div>
                  
                  {results.ollama.response && (
                    <div>
                      <div className="text-sm text-gray-500">Response</div>
                      <div className="text-sm bg-gray-100 p-2 rounded">{results.ollama.response}</div>
                    </div>
                  )}
                  
                  {results.ollama.error && (
                    <div>
                      <div className="text-sm text-gray-500">Error</div>
                      <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{results.ollama.error}</div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!results && !error && isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Testing AI service connections...</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
