/**
 * app/api/staff/route.ts
 * Replace your entire existing file with this.
 *
 * Your Staff collection fields:
 *   employeeId  text
 *   name        text
 *   initials    text
 *   workgroups  json  → [{ id: string, rank: number }]
 *   availability json → number[]  (0=Sun … 6=Sat)
 *   maxHours    number
 *   preferredWindow json → [startHour, endHour]
 */

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { NextRequest } from 'next/server'

// ─── What Payload stores ───────────────────────────────────────────────────

type PayloadStaffDoc = {
  id: string
  employeeId: string
  name: string
  initials?: string
  workgroups: { id: string; rank: number }[] | null
  availability: number[] | null
  maxHours: number | null
  preferredWindow: [number, number] | null
}

// ─── What the scheduling engine expects ───────────────────────────────────

export type EngineStaffMember = {
  id: string
  name: string
  initials: string
  workgroups: { id: string; rank: number }[]
  availability: number[]
  maxHours: number
  preferredWindow: [number, number]
}

// ─── Transform ────────────────────────────────────────────────────────────

export function transformStaff(doc: PayloadStaffDoc): EngineStaffMember {
  // Build initials from name if the field is blank
  const initials =
    doc.initials?.trim() ||
    doc.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  return {
    id: doc.id,
    name: doc.name,
    initials,
    workgroups: (doc.workgroups ?? []).sort((a, b) => a.rank - b.rank),
    availability: doc.availability ?? [],
    maxHours: doc.maxHours ?? 40,
    preferredWindow: doc.preferredWindow ?? [8, 17],
  }
}

// ─── GET /api/staff ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })

    // Optional ?active=true filter — add an `active` boolean field to your
    // collection later when you need it; ignored safely for now
    const activeParam = req.nextUrl.searchParams.get('active')
    const where =
      activeParam === 'true'
        ? { active: { equals: true } }
        : activeParam === 'false'
          ? { active: { equals: false } }
          : {}

    const result = await payload.find({
      collection: 'staff',

      limit: 500,
      sort: 'name',
    })

    const staff: EngineStaffMember[] = result.docs.map((doc) =>
      transformStaff(doc as unknown as PayloadStaffDoc),
    )

    return Response.json({ staff, total: result.totalDocs })
  } catch (error) {
    console.error('GET /api/staff error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// ─── POST /api/staff ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const body = await req.json()

    const result = await payload.create({
      collection: 'staff',
      data: body,
    })

    return Response.json(result)
  } catch (error) {
    console.error('POST /api/staff error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// ─── PATCH /api/staff ──────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { id, ...data } = await req.json()

    const result = await payload.update({
      collection: 'staff',
      id,
      data,
    })

    return Response.json(result)
  } catch (error) {
    console.error('PATCH /api/staff error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// ─── DELETE /api/staff ─────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { id } = await req.json()

    const result = await payload.delete({ collection: 'staff', id })

    return Response.json({ success: true, deleted: result })
  } catch (error) {
    console.error('DELETE /api/staff error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
