'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, Gauge, Link2, LogOut, Menu, Settings, X } from 'lucide-react'
import { createClient } from '../../../lib/supabase/client'
import { DashboardDataProvider, useDashboardData } from '../../../lib/use-dashboard-data'
import { PlanUsageBar, UpgradeCTA } from '../dashboard/_components/ui/upgrade-cta'

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

const navItems = [
  { href: '/dashboard', icon: Gauge, label: 'Dashboard' },
  { href: '/dashboard/events', icon: Activity, label: 'Events' },
  { href: '/dashboard/endpoints', icon: Link2, label: 'Endpoints' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
] as const

function getInitials(displayName: string, email: string) {
  const base = (displayName || email || 'User').trim()
  if (!base) return 'U'

  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }

  return (parts[0] ?? 'U').slice(0, 1).toUpperCase()
}

function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('DashboardShell context unavailable')
  }
  return context
}

export function DashboardShell({
  children,
  displayName,
  email,
  plan,
}: {
  children: ReactNode
  displayName: string
  email: string
  plan: string
}) {
  const [open, setOpen] = useState(false)

  const contextValue = useMemo(() => ({ open, setOpen }), [open])

  return (
    <DashboardDataProvider>
      <SidebarContext.Provider value={contextValue}>
        <main className="relative min-h-screen bg-[#090909] text-[#ffffff]">
          <div className="pointer-events-none absolute inset-0 app-grid-bg" />
          <MobileTopBar displayName={displayName} email={email} />
          <TabletTopBar />
          <DesktopSidebar displayName={displayName} email={email} plan={plan} />
          <TabletSidebarOverlay displayName={displayName} email={email} plan={plan} />
          <Content>
            <DroppedEventsBanner />
            {children}
          </Content>
          <MobileBottomNav />
        </main>
      </SidebarContext.Provider>
    </DashboardDataProvider>
  )
}

function DroppedEventsBanner() {
  const pathname = usePathname()
  const { me, eventsThisMonth } = useDashboardData()
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('dropped-events-banner-dismissed') === '1'
  })

  if (pathname !== '/dashboard' || !me || me.plan !== 'free') return null
  if (eventsThisMonth < me.limits.maxEventsPerMonth || dismissed) return null

  return (
    <div className="mb-4">
      <UpgradeCTA
        onDismissBanner={() => {
          setDismissed(true)
          sessionStorage.setItem('dropped-events-banner-dismissed', '1')
        }}
        trigger="event_limit"
        variant="banner"
      />
    </div>
  )
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
}

function NavLinks({ onSelect }: { onSelect?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isActive(pathname, item.href)

        return (
          <Link
            className={`inline-flex h-11 items-center gap-3 rounded-r-lg border-l-2 px-3 text-sm transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
              active
                ? 'border-green-500 bg-white/5 text-white'
                : 'border-transparent text-zinc-500 hover:bg-white/5 hover:text-white'
            }`}
            href={item.href}
            key={item.href}
            onClick={onSelect}
          >
            <Icon className="h-5 w-5" />
            <span className="font-display uppercase tracking-[0.14em]">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarFooter({ displayName, email }: { displayName: string; email: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  async function onLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs uppercase text-white">
          {(displayName || email || 'U').slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-[#ffffff]">{displayName || email.split('@')[0] || 'User'}</p>
          <p className="truncate text-xs text-[#a1a1aa]">{email}</p>
        </div>
      </div>
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 text-sm text-[#ffffff] hover:bg-white/10"
        onClick={() => {
          void onLogout()
        }}
        type="button"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </div>
  )
}

function SidebarContent({ displayName, email, onSelect }: { displayName: string; email: string; onSelect?: () => void }) {
  const { me, eventsThisMonth } = useDashboardData()

  return (
    <>
      <div>
        <div className="mb-8 px-6">
          <p className="inline-flex h-6 items-center gap-2 font-display text-[12px] uppercase tracking-[0.24em] text-white">
            <Image alt="Perspectify" className="h-4 w-4" height={16} src="/favicon.svg" width={16} />
            Perspectify
          </p>
        </div>
        <NavLinks onSelect={onSelect} />
      </div>

      <div>
        {me ? (
          <div className="mb-4 px-4">
            <PlanUsageBar limit={me.limits.maxEventsPerMonth} plan={me.plan} used={eventsThisMonth} />
          </div>
        ) : null}
        <SidebarFooter displayName={displayName} email={email} />
      </div>
    </>
  )
}

function DesktopSidebar({ displayName, email }: { displayName: string; email: string; plan: string }) {
  return (
    <aside className="fixed left-0 top-0 hidden h-[100dvh] w-[240px] flex-col justify-between border-r border-white/10 bg-[#111111] py-6 lg:flex">
      <SidebarContent displayName={displayName} email={email} />
    </aside>
  )
}

function MobileTopBar({ displayName, email }: { displayName: string; email: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { me, eventsThisMonth } = useDashboardData()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const initials = getInitials(displayName, email)
  const eventsMax = me?.limits.maxEventsPerMonth ?? 0
  const usagePercent =
    eventsMax > 0 ? Math.min((eventsThisMonth / eventsMax) * 100, 100) : 0

  useEffect(() => {
    if (!popoverOpen) return

    function handleClick(e: MouseEvent) {
      if (
        avatarRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setPopoverOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [popoverOpen])

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-[#111111]/[0.92] px-4 backdrop-blur-sm md:hidden">
      <p className="inline-flex h-6 items-center gap-2 font-display text-[12px] uppercase tracking-[0.24em] text-white">
        <Image alt="Perspectify" className="h-4 w-4" height={16} src="/favicon.svg" width={16} />
        Perspectify
      </p>

      <div className="relative md:hidden">
        <button
          ref={avatarRef}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-white transition-transform active:scale-95"
          onClick={(e) => {
            e.stopPropagation()
            setPopoverOpen((v) => !v)
          }}
          type="button"
        >
          {initials}
        </button>

        {popoverOpen ? (
          <div
            ref={popoverRef}
            className="absolute right-0 top-[calc(100%+8px)] z-[60] min-w-[220px] rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
            style={{
              animation: 'popoverIn 150ms ease-out',
            }}
          >
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{displayName || 'User'}</p>
                <p className="truncate text-xs text-zinc-500">{email}</p>
              </div>
            </div>

            <div className="mb-3 h-px bg-white/10" />

            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Events this month</p>

            <div className="mb-1.5 h-1 rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  eventsMax !== -1 && eventsThisMonth >= eventsMax
                    ? 'bg-red-500'
                    : eventsMax !== -1 && eventsThisMonth >= eventsMax * 0.8
                      ? 'bg-amber-400'
                      : 'bg-green-500'
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>

            <p className="text-xs text-zinc-400">
              {eventsMax === -1 ? (
                `${eventsThisMonth.toLocaleString()} events`
              ) : eventsThisMonth >= eventsMax ? (
                <span className="text-red-400">Limit reached</span>
              ) : (
                `${eventsThisMonth.toLocaleString()} / ${eventsMax.toLocaleString()}`
              )}
            </p>

            <div className="my-3 h-px bg-white/10" />

            <button
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
              onClick={async () => {
                await supabase.auth.signOut()
                setPopoverOpen(false)
                router.push('/login')
                router.refresh()
              }}
              type="button"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function TabletTopBar() {
  const { open, setOpen } = useSidebar()

  return (
    <header className="sticky top-0 z-40 hidden h-14 items-center justify-between border-b border-white/10 bg-[#111111]/[0.92] px-4 backdrop-blur-sm md:flex lg:hidden">
      <button
        aria-label="Open sidebar"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#ffffff] hover:bg-white/10"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      <p className="font-display text-[12px] uppercase tracking-[0.24em] text-white">Perspectify</p>
      <div className="h-8 w-8 rounded-full bg-zinc-700" />
    </header>
  )
}

function TabletSidebarOverlay({ displayName, email }: { displayName: string; email: string; plan: string }) {
  const { open, setOpen } = useSidebar()

  return (
    <>
      <button
        aria-hidden={!open}
        aria-label="Close sidebar"
        className={`fixed inset-0 z-[49] hidden bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 md:block lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setOpen(false)}
        type="button"
      />
      <aside
        className={`fixed left-0 top-0 z-50 hidden h-[100dvh] w-[280px] flex-col justify-between border-r border-white/10 bg-[#111111] py-6 transition-transform duration-200 ease-in-out md:flex lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent displayName={displayName} email={email} onSelect={() => setOpen(false)} />
      </aside>
    </>
  )
}

function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#111111] md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <ul className="grid h-14 grid-cols-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                aria-label={item.label}
                className="inline-flex h-14 w-full items-center justify-center"
                href={item.href}
                title={item.label}
              >
                <span className="relative inline-flex h-11 w-11 items-center justify-center">
                  <Icon className={`h-5 w-5 transition-colors duration-150 ${active ? 'text-[#22c55e]' : 'text-zinc-500'}`} />
                  {active ? <span className="absolute bottom-0 h-1 w-1 rounded-full bg-[#22c55e]" /> : null}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Content({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen pb-14 md:pb-0 lg:ml-[240px]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8">{children}</div>
    </div>
  )
}
