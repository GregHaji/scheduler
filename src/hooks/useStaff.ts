/**
 * hooks/useStaff.ts
 *
 * Drop this file into src/hooks/useStaff.ts
 * Import and use in ScheduleCalendar as shown at the bottom.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

export type EngineStaffMember = {
  id: string
  name: string
  initials: string
  workgroups: { id: string; rank: number }[]
  availability: number[]
  maxHours: number
  preferredWindow: [number, number]
}

type UseStaffResult = {
  staff: EngineStaffMember[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useStaff(activeOnly = true): UseStaffResult {
  const [staff, setStaff] = useState<EngineStaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const url = activeOnly ? '/api/staff?active=true' : '/api/staff'

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ staff: EngineStaffMember[] }>
      })
      .then((data) => {
        if (!cancelled) {
          setStaff(data.staff)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message ?? 'Failed to load staff')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeOnly, tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  return { staff, loading, error, refetch }
}
