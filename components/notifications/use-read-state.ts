'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { getReadIds, getLastMarkAllReadTime, NOTIFICATIONS_UPDATED_EVENT } from '@/lib/notifications/storage'

function subscribe(notify: () => void) {
  window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, notify)
  window.addEventListener('storage', notify)
  return () => {
    window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, notify)
    window.removeEventListener('storage', notify)
  }
}
const snapshot = () => JSON.stringify([[...getReadIds()], getLastMarkAllReadTime()])
const serverSnapshot = () => '[[],0]'

export function useReadState() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  return useMemo(() => {
    const [ids, time] = JSON.parse(value) as [string[], number]
    return { readIds: new Set(ids), lastAllTime: time }
  }, [value])
}
