import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@payaid/db'
// import twilio from 'twilio'

// POST /api/calls/webhook - Twilio webhook for call events
export async function POST(request: NextRequest) {
  try {
    // TODO: Verify Twilio signature
    // const twilioSignature = request.headers.get('x-twilio-signature')
    // const url = request.url
    // const params = await request.formData()
    // const isValid = twilio.validateRequest(
    //   process.env.TWILIO_AUTH_TOKEN!,
    //   twilioSignature!,
    //   url,
    //   Object.fromEntries(params)
    // )
    // if (!isValid) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    // }

    const formData = await request.formData()
    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    const direction = formData.get('Direction') as string

    // Find or create call record
    let call = await prisma.aICall.findUnique({
      where: { twilioCallSid: callSid },
    })

    if (!call) {
      // Extract tenant ID from phone number or other method
      // For now, we'll need to determine tenant from phone number mapping
      // This is a simplified version - in production, map phone numbers to tenants
      const tenantId = 'default' // TODO: Implement phone-to-tenant mapping

      call = await prisma.aICall.create({
        data: {
          phoneNumber: direction === 'inbound' ? from : to,
          direction: direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
          status: mapTwilioStatus(callStatus),
          twilioCallSid: callSid,
          twilioAccountSid: formData.get('AccountSid') as string,
          handledByAI: true,
          tenantId,
        },
      })
    } else {
      // Update call status
      await prisma.aICall.update({
        where: { id: call.id },
        data: {
          status: mapTwilioStatus(callStatus),
          answeredAt: callStatus === 'in-progress' ? new Date() : call.answeredAt,
          endedAt: callStatus === 'completed' ? new Date() : call.endedAt,
        },
      })
    }

    // Handle call based on status
    if (callStatus === 'ringing' || callStatus === 'in-progress') {
      // Return TwiML for AI handling
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is an AI assistant. How can I help you today?</Say>
  <Gather input="speech" action="/api/calls/process-speech" method="POST" speechTimeout="auto">
    <Say>Please speak your question or request.</Say>
  </Gather>
</Response>`,
        {
          headers: {
            'Content-Type': 'text/xml',
          },
        }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Call webhook error:', error)
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    )
  }
}

function mapTwilioStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'ringing': 'RINGING',
    'in-progress': 'ANSWERED',
    'completed': 'COMPLETED',
    'busy': 'BUSY',
    'no-answer': 'NO_ANSWER',
    'failed': 'FAILED',
    'canceled': 'FAILED',
  }
  return statusMap[status.toLowerCase()] || 'RINGING'
}
