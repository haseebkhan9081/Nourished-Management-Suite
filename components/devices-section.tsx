"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Fingerprint, ScanFace, Users, Wifi, Network, Cpu, MapPin, Clock, Power, ClipboardList, RefreshCw } from "lucide-react"
import { LoadingOverlay } from "./LoadingOverlay"

const POLL_INTERVAL_MS = 15000

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

interface DevicesSectionProps {
  selectedSchoolId: number | null
}

type Health = "online" | "stale" | "offline" | "unknown"

interface Device {
  id: number
  school_id: number | null
  sn: string
  model: string | null
  mac: string | null
  firmware: string | null
  ip_address: string | null
  user_count: number | null
  face_count: number | null
  fingerprint_count: number | null
  location: string | null
  last_ping: string | null
  last_attlog: string | null
  last_options: string | null
  last_restart: string | null
  status: Health | null
  created_at: string
  updated_at: string
}

interface MachinesResponse {
  machines: Device[]
}

function getHealth(device: Device): Health {
  if (device.status === "online" || device.status === "stale" || device.status === "offline") {
    return device.status
  }
  if (!device.last_ping) return "unknown"
  const ageMs = Date.now() - new Date(device.last_ping).getTime()
  const minutes = ageMs / 60000
  if (minutes < 15) return "online"
  if (minutes < 60 * 24) return "stale"
  return "offline"
}

function formatRelative(value: string | null): string {
  if (!value) return "Never"
  const ms = Date.now() - new Date(value).getTime()
  if (ms < 0) return "Just now"
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} mo ago`
  return `${Math.floor(months / 12)} yr ago`
}

function HealthBadge({ health }: { health: Health }) {
  const styles: Record<Health, string> = {
    online: "bg-green-100 text-green-700 border-green-300",
    stale: "bg-amber-100 text-amber-700 border-amber-300",
    offline: "bg-red-100 text-red-700 border-red-300",
    unknown: "bg-gray-100 text-gray-600 border-gray-300",
  }
  const labels: Record<Health, string> = {
    online: "Online",
    stale: "Stale",
    offline: "Offline",
    unknown: "Unknown",
  }
  return (
    <Badge variant="outline" className={`${styles[health]} font-medium`}>
      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
        health === "online" ? "bg-green-500"
          : health === "stale" ? "bg-amber-500"
          : health === "offline" ? "bg-red-500"
          : "bg-gray-400"
      }`} />
      {labels[health]}
    </Badge>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md bg-[#A2BD9D]/5 p-3">
      <Icon className="h-4 w-4 text-[#A2BD9D] mb-1" />
      <span className="text-lg font-semibold text-gray-800">{value ?? "—"}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

function MetaRow({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 text-[#A2BD9D] mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <span className="text-gray-500">{label}: </span>
        <span className="text-gray-700 break-all">{value ?? "—"}</span>
      </div>
    </div>
  )
}

function DeviceCard({ device }: { device: Device }) {
  const health = getHealth(device)
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base text-gray-800 truncate">{device.sn}</CardTitle>
            <p className="text-xs text-gray-500 mt-1">{device.model ?? "Unknown model"}</p>
          </div>
          <HealthBadge health={health} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-[#A2BD9D]/20 bg-[#A2BD9D]/5 p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Clock className="h-3.5 w-3.5" />
            Last ping
          </div>
          <div className="text-sm font-semibold text-gray-800">
            {formatRelative(device.last_ping)}
          </div>
          {device.last_ping && (
            <div className="text-xs text-gray-500 mt-0.5">
              {new Date(device.last_ping).toLocaleString()}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat icon={Users} label="Users" value={device.user_count} />
          <Stat icon={ScanFace} label="Faces" value={device.face_count} />
          <Stat icon={Fingerprint} label="Prints" value={device.fingerprint_count} />
        </div>

        <div className="space-y-1.5 pt-2 border-t border-gray-100">
          <MetaRow icon={Cpu} label="Firmware" value={device.firmware} />
          <MetaRow icon={Wifi} label="IP" value={device.ip_address} />
          <MetaRow icon={Network} label="MAC" value={device.mac} />
          <MetaRow icon={MapPin} label="Location" value={device.location} />
          <MetaRow icon={ClipboardList} label="Last attendance log" value={device.last_attlog ? formatRelative(device.last_attlog) : null} />
          <MetaRow icon={Power} label="Last restart" value={device.last_restart ? formatRelative(device.last_restart) : null} />
        </div>
      </CardContent>
    </Card>
  )
}

export function DevicesSection({ selectedSchoolId }: DevicesSectionProps) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    if (!selectedSchoolId) {
      setDevices([])
      setLastUpdated(null)
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let abortController: AbortController | null = null
    let hasLoadedOnce = false

    const doFetch = async () => {
      if (cancelled) return
      abortController?.abort()
      abortController = new AbortController()

      const isInitial = !hasLoadedOnce
      if (isInitial) setLoading(true)
      else setRefreshing(true)

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/machines?school_id=${selectedSchoolId}`,
          { signal: abortController.signal },
        )
        if (!res.ok) throw new Error("Failed to fetch devices!")
        const data: MachinesResponse = await res.json()
        if (cancelled) return
        setDevices(data.machines || [])
        setLastUpdated(new Date())
        hasLoadedOnce = true
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return
        console.error("Error fetching devices:", error)
        if (isInitial) setDevices([])
      } finally {
        if (!cancelled) {
          if (isInitial) setLoading(false)
          else setRefreshing(false)
          scheduleNext()
        }
      }
    }

    const scheduleNext = () => {
      if (cancelled) return
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (document.visibilityState === "hidden") {
          // user isn't looking — postpone
          scheduleNext()
          return
        }
        doFetch()
      }, POLL_INTERVAL_MS)
    }

    const handleVisibility = () => {
      if (cancelled) return
      if (document.visibilityState === "visible") {
        if (timeoutId) clearTimeout(timeoutId)
        doFetch()
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    doFetch()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      abortController?.abort()
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [selectedSchoolId, refreshTrigger])

  const triggerRefresh = () => setRefreshTrigger((t) => t + 1)

  if (!selectedSchoolId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Please select a school to view devices</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="relative space-y-4">
      {loading && <LoadingOverlay />}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="text-[#A2BD9D]">Biometric Devices</CardTitle>
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500">
                {devices.length} device{devices.length === 1 ? "" : "s"}
              </p>
              {lastUpdated && (
                <span className="text-xs text-gray-400" title={lastUpdated.toLocaleString()}>
                  Updated {formatTimeAgo(lastUpdated)}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#A2BD9D] hover:text-[#8FA889] hover:bg-[#A2BD9D]/10"
                onClick={triggerRefresh}
                disabled={loading || refreshing}
                title="Refresh now"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
      {devices.length === 0 && !loading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No devices registered for this school</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </div>
  )
}
