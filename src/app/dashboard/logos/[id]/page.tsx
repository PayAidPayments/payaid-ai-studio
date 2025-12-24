'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface LogoVariation {
  id: string
  imageUrl: string
  thumbnailUrl?: string
  iconStyle?: string
  isSelected: boolean
}

interface Logo {
  id: string
  businessName: string
  industry?: string
  style?: string
  status: string
  variations: LogoVariation[]
  createdAt: string
}

export default function LogoDetailPage() {
  const params = useParams()
  const id = params.id as string

  const { data: logo, isLoading, refetch } = useQuery<Logo>({
    queryKey: ['logo', id],
    queryFn: async () => {
      const response = await fetch(`/api/logos/${id}`)
      if (!response.ok) throw new Error('Failed to fetch logo')
      return response.json()
    },
  })

  const selectMutation = useMutation({
    mutationFn: async (variationId: string) => {
      const response = await fetch(`/api/logos/${id}/variations/${variationId}/select`, {
        method: 'PUT',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to select variation')
      }
      return response.json()
    },
    onSuccess: () => {
      refetch()
    },
  })

  if (isLoading || !logo) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{logo.businessName}</h1>
          <p className="mt-2 text-gray-600">
            {logo.industry && `${logo.industry} • `}
            {logo.style && `${logo.style} style`}
          </p>
        </div>
        <Link href="/dashboard/logos">
          <Button variant="outline">Back</Button>
        </Link>
      </div>

      {logo.status === 'GENERATING' ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="text-gray-500 mb-4">Generating logo variations...</div>
              <div className="text-sm text-gray-400">This may take a few moments</div>
            </div>
          </CardContent>
        </Card>
      ) : logo.variations.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-gray-500">No variations available</div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Logo Variations</CardTitle>
              <CardDescription>Select your favorite logo or customize further</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {logo.variations.map((variation) => (
                  <Card key={variation.id} className={variation.isSelected ? 'ring-2 ring-blue-500' : ''}>
                    <CardContent className="pt-6">
                      <div className="aspect-square bg-gray-50 rounded-lg flex items-center justify-center mb-4 overflow-hidden">
                        <img
                          src={variation.thumbnailUrl || variation.imageUrl}
                          alt={`${logo.businessName} - ${variation.iconStyle || 'variation'}`}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                            const parent = target.parentElement
                            if (parent) {
                              parent.innerHTML = `
                                <div class="flex flex-col items-center justify-center h-full text-gray-400">
                                  <svg class="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                  </svg>
                                  <span class="text-xs">Image unavailable</span>
                                </div>
                              `
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 capitalize">
                          {variation.iconStyle || 'Variation'}
                        </span>
                        {variation.isSelected && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant={variation.isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => selectMutation.mutate(variation.id)}
                          disabled={variation.isSelected || selectMutation.isPending}
                        >
                          {variation.isSelected ? 'Selected' : 'Select'}
                        </Button>
                        <a href={variation.imageUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                          <Button variant="outline" size="sm" className="w-full">
                            View
                          </Button>
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Export Options */}
          {logo.variations.some((v) => v.isSelected) && (
            <Card>
              <CardHeader>
                <CardTitle>Export Logo</CardTitle>
                <CardDescription>Download your selected logo in various formats</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant="outline">Download PNG</Button>
                  <Button variant="outline">Download SVG</Button>
                  <Button variant="outline">Download PDF</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
