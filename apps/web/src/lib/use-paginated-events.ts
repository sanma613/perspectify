'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAccessToken } from './access-token'
import { apiFetch } from './http'
import type { EventResponse, EventsCursor, PaginatedEventsResponse } from './api-types'
import { createClient } from './supabase/client'

const DEFAULT_PAGE_SIZE = 30
const CACHE_TTL_MS = 30_000
const MAX_CACHE_ITEMS = DEFAULT_PAGE_SIZE * 20
const MAX_CACHE_KEYS = 4

interface CacheEntry {
  items: EventResponse[]
  hasMore: boolean
  totalCount: number
  nextCursor: EventsCursor | null
  timestamp: number
}

const eventsCache = new Map<string, CacheEntry>()

type EventPatch = Partial<
  Pick<EventResponse, 'status' | 'lastAttemptStatus' | 'lastError' | 'replayCount' | 'attempts' | 'eventAttempts'>
>

interface UsePaginatedEventsOptions {
  allEndpointIds: string[]
  selectedEndpointIds: string[]
  needsRescue: boolean
}

interface UsePaginatedEventsResult {
  events: EventResponse[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  error: string | null
  totalCount: number
  pendingNewCount: number
  loadMore: () => Promise<void>
  revealNewEvents: () => void
  patchEvent: (eventId: string, patch: EventPatch | ((event: EventResponse) => EventResponse)) => void
}

function deriveCursorFromItems(items: EventResponse[]): EventsCursor | null {
  if (items.length === 0) return null
  const tail = items[items.length - 1]
  return {
    cursorReceivedAt: tail.receivedAt,
    cursorId: tail.id,
  }
}

function isNearTop() {
  return window.scrollY < 120
}

function buildEndpointIds(allEndpointIds: string[], selectedEndpointIds: string[]) {
  return selectedEndpointIds.length > 0 ? selectedEndpointIds : allEndpointIds
}

function dedupeEvents(input: EventResponse[]) {
  const byId = new Map<string, EventResponse>()
  for (const item of input) {
    byId.set(item.id, item)
  }
  return Array.from(byId.values()).sort((a, b) => {
    const tsDiff = new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    if (tsDiff !== 0) return tsDiff
    return b.id.localeCompare(a.id)
  })
}

function replaceInList(
  events: EventResponse[],
  eventId: string,
  patch: EventPatch | ((event: EventResponse) => EventResponse)
) {
  return events.map((event) => {
    if (event.id !== eventId) return event
    if (typeof patch === 'function') {
      return patch(event)
    }
    return { ...event, ...patch }
  })
}

function computeCacheKey(endpointIds: string[], needsRescue: boolean) {
  const sortedEndpointIds = [...endpointIds].sort().join(',')
  return `events:${sortedEndpointIds}:${needsRescue ? 'rescue' : 'all'}`
}

function matchesRescueFilter(event: Pick<EventResponse, 'status' | 'lastAttemptStatus'>) {
  if (event.status === 'FAILED') return true
  return event.lastAttemptStatus !== null && event.lastAttemptStatus >= 400
}

function matchesActiveFilters(event: EventResponse, endpointIdsSet: Set<string>, needsRescue: boolean) {
  if (!endpointIdsSet.has(event.endpointId)) return false
  if (!needsRescue) return true
  return matchesRescueFilter(event)
}

function readCache(cacheKey: string): { entry: CacheEntry; fresh: boolean } | null {
  const memoryEntry = eventsCache.get(cacheKey)
  if (memoryEntry) {
    const normalizedEntry: CacheEntry = {
      ...memoryEntry,
      items: dedupeEvents(memoryEntry.items).slice(0, MAX_CACHE_ITEMS),
    }
    eventsCache.set(cacheKey, normalizedEntry)
    return {
      entry: normalizedEntry,
      fresh: Date.now() - normalizedEntry.timestamp <= CACHE_TTL_MS,
    }
  }

  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    const normalizedEntry: CacheEntry = {
      items: Array.isArray(parsed.items) ? dedupeEvents(parsed.items).slice(0, MAX_CACHE_ITEMS) : [],
      hasMore: Boolean(parsed.hasMore),
      totalCount: typeof parsed.totalCount === 'number' ? parsed.totalCount : 0,
      nextCursor: parsed.nextCursor ?? null,
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
    }
    eventsCache.set(cacheKey, normalizedEntry)
    return {
      entry: normalizedEntry,
      fresh: Date.now() - normalizedEntry.timestamp <= CACHE_TTL_MS,
    }
  } catch {
    return null
  }
}

function writeCache(cacheKey: string, entry: CacheEntry) {
  eventsCache.set(cacheKey, entry)

  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(entry))

    const cacheKeys = Object.keys(window.localStorage).filter((key) => key.startsWith('events:'))
    if (cacheKeys.length > MAX_CACHE_KEYS) {
      const keyedByTimestamp = cacheKeys
        .map((key) => {
          try {
            const raw = window.localStorage.getItem(key)
            if (!raw) return { key, timestamp: 0 }
            const parsed = JSON.parse(raw) as Partial<CacheEntry>
            return { key, timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : 0 }
          } catch {
            return { key, timestamp: 0 }
          }
        })
        .sort((a, b) => a.timestamp - b.timestamp)

      const keysToDelete = keyedByTimestamp.slice(0, cacheKeys.length - MAX_CACHE_KEYS)
      for (const keyMeta of keysToDelete) {
        window.localStorage.removeItem(keyMeta.key)
        eventsCache.delete(keyMeta.key)
      }
    }
  } catch {
    // Ignore storage write failures.
  }
}

export function usePaginatedEvents({
  allEndpointIds,
  selectedEndpointIds,
  needsRescue,
}: UsePaginatedEventsOptions): UsePaginatedEventsResult {
  const [events, setEvents] = useState<EventResponse[]>([])
  const [bufferedEvents, setBufferedEvents] = useState<EventResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const nextCursorRef = useRef<EventsCursor | null>(null)
  const eventsRef = useRef<EventResponse[]>([])
  const headRefreshTimeoutRef = useRef<number | null>(null)
  const hasLoadedOnceRef = useRef(false)

  useEffect(() => {
    eventsRef.current = events
  }, [events])

  const allEndpointIdsKey = useMemo(() => allEndpointIds.join(','), [allEndpointIds])
  const selectedEndpointIdsKey = useMemo(
    () => selectedEndpointIds.join(','),
    [selectedEndpointIds]
  )

  const activeEndpointIds = useMemo(() => {
    const allIds = allEndpointIdsKey ? allEndpointIdsKey.split(',').filter(Boolean) : []
    const selectedIds = selectedEndpointIdsKey
      ? selectedEndpointIdsKey.split(',').filter(Boolean)
      : []
    return buildEndpointIds(allIds, selectedIds)
  }, [allEndpointIdsKey, selectedEndpointIdsKey])
  const activeEndpointIdsSet = useMemo(() => new Set(activeEndpointIds), [activeEndpointIds])

  const activeEndpointIdsKey = useMemo(() => activeEndpointIds.join(','), [activeEndpointIds])
  const cacheKey = useMemo(
    () => computeCacheKey(activeEndpointIds, needsRescue),
    [activeEndpointIds, needsRescue]
  )
  const globalAllCacheKey = useMemo(() => computeCacheKey(allEndpointIds, false), [allEndpointIds])

  const queryBaseString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('limit', String(DEFAULT_PAGE_SIZE))
    if (activeEndpointIdsKey.length > 0) {
      params.set('endpointIds', activeEndpointIdsKey)
    }
    if (needsRescue) {
      params.set('needsRescue', '1')
    }
    return params.toString()
  }, [activeEndpointIdsKey, needsRescue])

  const fetchPage = useCallback(
    async (cursor?: EventsCursor | null) => {
      const token = await getAccessToken()
      const params = new URLSearchParams(queryBaseString)

      if (cursor) {
        params.set('cursorReceivedAt', cursor.cursorReceivedAt)
        params.set('cursorId', cursor.cursorId)
      }

      return apiFetch<PaginatedEventsResponse>(`/events?${params.toString()}`, token)
    },
    [queryBaseString]
  )

  const updateCache = useCallback(
    (
      inputItems: EventResponse[],
      nextCursor: EventsCursor | null,
      hasMoreValue: boolean,
      totalCountValue: number
    ) => {
      const normalizedItems = dedupeEvents(inputItems)
        .filter((event) => matchesActiveFilters(event, activeEndpointIdsSet, needsRescue))
        .slice(0, MAX_CACHE_ITEMS)
      writeCache(cacheKey, {
        items: normalizedItems,
        hasMore: hasMoreValue,
        totalCount: totalCountValue,
        nextCursor,
        timestamp: Date.now(),
      })

      if (cacheKey !== globalAllCacheKey) {
        const existingGlobal = readCache(globalAllCacheKey)?.entry
        const mergedGlobalItems = dedupeEvents([...(existingGlobal?.items ?? []), ...normalizedItems]).slice(
          0,
          MAX_CACHE_ITEMS
        )
        const mergedGlobalTotal = Math.max(existingGlobal?.totalCount ?? 0, totalCountValue)
        const mergedGlobalHasMore =
          (existingGlobal?.hasMore ?? false) || hasMoreValue || mergedGlobalItems.length < mergedGlobalTotal
        writeCache(globalAllCacheKey, {
          items: mergedGlobalItems,
          hasMore: mergedGlobalHasMore,
          totalCount: mergedGlobalTotal,
          nextCursor: mergedGlobalHasMore ? deriveCursorFromItems(mergedGlobalItems) : null,
          timestamp: Date.now(),
        })
      }
    },
    [activeEndpointIdsSet, cacheKey, globalAllCacheKey, needsRescue]
  )

  const loadInitial = useCallback(async () => {
    if (activeEndpointIds.length === 0) {
      setEvents([])
      setBufferedEvents([])
      setError(null)
      setTotalCount(0)
      setHasMore(false)
      nextCursorRef.current = null
      hasLoadedOnceRef.current = true
      setLoading(false)
      return
    }

    const cached = readCache(cacheKey)
    const fallbackCacheKeys = new Set<string>()
    fallbackCacheKeys.add(computeCacheKey(allEndpointIds, false))
    fallbackCacheKeys.add(computeCacheKey(activeEndpointIds, false))
    fallbackCacheKeys.delete(cacheKey)

    const fallbackCachedItems = Array.from(fallbackCacheKeys).flatMap((key) => {
      const entry = readCache(key)
      return entry?.entry.items ?? []
    })

    const directCachedItems = cached?.entry.items ?? []
    const cachedItems = dedupeEvents([...directCachedItems, ...fallbackCachedItems])
      .filter((event) => matchesActiveFilters(event, activeEndpointIdsSet, needsRescue))
      .slice(0, MAX_CACHE_ITEMS)

    if (cachedItems.length > 0) {
      const cachedTotalCount = cached?.entry.totalCount ?? cachedItems.length
      const cachedHasMoreRaw = cached?.entry.hasMore ?? false
      const cachedCursorRaw = cached?.entry.nextCursor ?? null
      const hasLegacyUnknownTotal = cachedTotalCount <= 0 && cachedItems.length >= DEFAULT_PAGE_SIZE
      const hasLikelyMoreFromDepth = !cachedHasMoreRaw && !cachedCursorRaw && cachedItems.length >= DEFAULT_PAGE_SIZE
      const cachedHasMore =
        cachedHasMoreRaw ||
        Boolean(cachedCursorRaw) ||
        cachedItems.length < cachedTotalCount ||
        hasLegacyUnknownTotal ||
        hasLikelyMoreFromDepth
      const fallbackCursor = cachedHasMore ? deriveCursorFromItems(cachedItems) : null

      setEvents(cachedItems)
      setBufferedEvents([])
      setHasMore(cachedHasMore)
      setTotalCount(cachedTotalCount)
      nextCursorRef.current = cachedCursorRaw ?? fallbackCursor
      hasLoadedOnceRef.current = true
      setLoading(cachedItems.length < DEFAULT_PAGE_SIZE)
      setError(null)

      if (cachedItems.length >= DEFAULT_PAGE_SIZE) {
        return
      }
    } else {
      // Switching to a filter with no cache should not keep previous filter rows on screen.
      setEvents([])
      setBufferedEvents([])
      setHasMore(false)
      setTotalCount(0)
      nextCursorRef.current = null
    }

    if (!hasLoadedOnceRef.current && cachedItems.length === 0) {
      setLoading(true)
    }
    setError(null)

    try {
      const page = await fetchPage(null)
      if (cachedItems.length > 0) {
        setEvents((current) => {
          const merged = dedupeEvents([...current, ...page.items]).filter((event) =>
            matchesActiveFilters(event, activeEndpointIdsSet, needsRescue)
          )
          const mergedHasMore = merged.length < page.totalCount
          setHasMore(mergedHasMore)
          setTotalCount(page.totalCount)
          nextCursorRef.current = mergedHasMore ? deriveCursorFromItems(merged) : null
          updateCache(merged, page.nextCursor, page.hasMore, page.totalCount)
          return merged
        })
      } else {
        const initialItems = page.items.filter((event) =>
          matchesActiveFilters(event, activeEndpointIdsSet, needsRescue)
        )
        setEvents(initialItems)
        setHasMore(page.hasMore)
        setTotalCount(page.totalCount)
        nextCursorRef.current = page.nextCursor
        updateCache(initialItems, page.nextCursor, page.hasMore, page.totalCount)
      }
      setBufferedEvents([])
      hasLoadedOnceRef.current = true
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Could not load events.'
      setError(message)
      if (!hasLoadedOnceRef.current && cachedItems.length === 0) {
        setEvents([])
        setBufferedEvents([])
        setHasMore(false)
        setTotalCount(0)
        nextCursorRef.current = null
      }
    } finally {
      setLoading(false)
    }
  }, [activeEndpointIds.length, activeEndpointIdsSet, cacheKey, fetchPage, needsRescue, updateCache])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return
    if (!hasMore) return

    const cursor = nextCursorRef.current ?? deriveCursorFromItems(eventsRef.current)
    if (!cursor) return

    setLoadingMore(true)
    setError(null)

    try {
      const page = await fetchPage(cursor)
      const currentItems = eventsRef.current
      const merged = dedupeEvents([...currentItems, ...page.items]).filter((event) =>
        matchesActiveFilters(event, activeEndpointIdsSet, needsRescue)
      )
      setEvents(merged)
      updateCache(merged, page.nextCursor, page.hasMore, page.totalCount)
      const shouldKeepLoading = page.hasMore || merged.length < page.totalCount
      setHasMore(shouldKeepLoading)
      setTotalCount(page.totalCount)
      nextCursorRef.current = shouldKeepLoading ? page.nextCursor ?? deriveCursorFromItems(merged) : null
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Could not load more events.'
      setError(message)
    } finally {
      setLoadingMore(false)
    }
  }, [activeEndpointIdsSet, fetchPage, hasMore, loading, loadingMore, needsRescue, updateCache])

  const revealNewEvents = useCallback(() => {
    setEvents((current) => {
      const revealed = dedupeEvents([...bufferedEvents, ...current])
      updateCache(revealed, nextCursorRef.current, hasMore, totalCount)
      return revealed
    })
    setBufferedEvents([])
  }, [bufferedEvents, hasMore, totalCount, updateCache])

  const patchEvent = useCallback(
    (eventId: string, patch: EventPatch | ((event: EventResponse) => EventResponse)) => {
      setEvents((current) => {
        const patched = replaceInList(current, eventId, patch)
        updateCache(patched, nextCursorRef.current, hasMore, totalCount)
        return patched
      })
      setBufferedEvents((current) => replaceInList(current, eventId, patch))
    },
    [hasMore, totalCount, updateCache]
  )

  const syncHead = useCallback(async () => {
    if (activeEndpointIds.length === 0) return

    try {
      const page = await fetchPage(null)
      setTotalCount(page.totalCount)

      setEvents((current) => {
        const currentById = new Map(current.map((event) => [event.id, event]))
        const unseen = page.items.filter((event) => !currentById.has(event.id))

        const updates = page.items.filter((event) => currentById.has(event.id))
        let next = current
        if (updates.length > 0) {
          const updateMap = new Map(updates.map((event) => [event.id, event]))
          next = next.map((event) => updateMap.get(event.id) ?? event)
        }

        if (unseen.length === 0) {
          updateCache(next, nextCursorRef.current, hasMore, page.totalCount)
          return next
        }

        if (isNearTop()) {
          const merged = dedupeEvents([...unseen, ...next])
          updateCache(merged, nextCursorRef.current, hasMore, page.totalCount)
          return merged
        }

        setBufferedEvents((bufferedCurrent) => dedupeEvents([...unseen, ...bufferedCurrent]))
        updateCache(next, nextCursorRef.current, hasMore, page.totalCount)
        return next
      })
    } catch {
      // Realtime sync failures are non-blocking.
    }
  }, [activeEndpointIds.length, fetchPage, hasMore, updateCache])

  useEffect(() => {
    if (!activeEndpointIdsKey) return

    const supabase = createClient()
    const channelName = `events-head-${activeEndpointIds.join('-')}-${needsRescue ? 'rescue' : 'all'}`

    const scheduleHeadSync = () => {
      if (headRefreshTimeoutRef.current) return
      headRefreshTimeoutRef.current = window.setTimeout(() => {
        headRefreshTimeoutRef.current = null
        void syncHead()
      }, 200)
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `endpoint_id=in.(${activeEndpointIds.join(',')})`,
        },
        scheduleHeadSync
      )
      .subscribe()

    return () => {
      if (headRefreshTimeoutRef.current) {
        window.clearTimeout(headRefreshTimeoutRef.current)
        headRefreshTimeoutRef.current = null
      }
      void supabase.removeChannel(channel)
    }
  }, [activeEndpointIds, needsRescue, syncHead])

  return {
    events,
    loading,
    loadingMore,
    hasMore,
    error,
    totalCount,
    pendingNewCount: bufferedEvents.length,
    loadMore,
    revealNewEvents,
    patchEvent,
  }
}
