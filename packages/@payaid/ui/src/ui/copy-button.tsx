'use client'

import * as React from 'react'
import { Button } from './button'

interface CopyButtonProps {
  text: string
  label?: string
  onCopy?: () => void
}

export function CopyButton({ text, label = 'Copy', onCopy }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onCopy?.()
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-2"
    >
      {copied ? '✓ Copied' : label}
    </Button>
  )
}
