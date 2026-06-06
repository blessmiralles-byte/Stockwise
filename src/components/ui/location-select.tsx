'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LocationNode {
  id: string
  name: string
  code: string
  type: string
  level: number
  parent_id: string | null
}

interface LocationSelectProps {
  value?: string          // selected location id
  onChange: (id: string, path: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

function buildTree(locations: LocationNode[]) {
  const byId = Object.fromEntries(locations.map(l => [l.id, l]))
  const children: Record<string, LocationNode[]> = {}
  locations.forEach(l => {
    const key = l.parent_id ?? '__root__'
    if (!children[key]) children[key] = []
    children[key].push(l)
  })
  return { byId, children }
}

function getPath(id: string, byId: Record<string, LocationNode>): string {
  const parts: string[] = []
  let current: LocationNode | undefined = byId[id]
  while (current) {
    parts.unshift(current.name)
    current = current.parent_id ? byId[current.parent_id] : undefined
  }
  return parts.join(' › ')
}

const levelLabels = ['Location', 'Room / Area', 'Shelf / Bin', 'Position']
const levelPlaceholders = ['Select location…', 'Select room…', 'Select shelf / bin…', 'Select position…']

export function LocationSelect({ value, onChange, className, placeholder, disabled }: LocationSelectProps) {
  const [locations, setLocations] = useState<LocationNode[]>([])
  const [selected, setSelected] = useState<(string | '')[]>(['', '', '', ''])

  useEffect(() => {
    fetch('/api/locations?all=true')
      .then(r => r.json())
      .then(d => setLocations(d.data ?? []))
  }, [])

  // Restore selection from value prop
  useEffect(() => {
    if (!value || !locations.length) return
    const { byId } = buildTree(locations)
    const path: string[] = []
    let cur: LocationNode | undefined = byId[value]
    while (cur) {
      path.unshift(cur.id)
      cur = cur.parent_id ? byId[cur.parent_id] : undefined
    }
    const newSel = ['', '', '', '']
    path.forEach((id, i) => { newSel[i] = id })
    setSelected(newSel)
  }, [value, locations])

  const { children } = buildTree(locations)
  const maxLevel = Math.max(...locations.map(l => l.level), 1)

  const handleSelect = (level: number, id: string) => {
    const newSel = [...selected]
    newSel[level] = id
    // Clear deeper selections when a parent changes
    for (let i = level + 1; i < 4; i++) newSel[i] = ''
    setSelected(newSel)

    // Find the deepest non-empty selection
    let deepest = ''
    for (let i = 3; i >= 0; i--) {
      if (newSel[i]) { deepest = newSel[i]; break }
    }

    if (deepest) {
      const { byId } = buildTree(locations)
      onChange(deepest, getPath(deepest, byId))
    }
  }

  // Build dropdown options for each level
  const getOptions = (level: number): LocationNode[] => {
    if (level === 0) return children['__root__'] ?? []
    const parentId = selected[level - 1]
    if (!parentId) return []
    return children[parentId] ?? []
  }

  // How many levels to show: always show level 0,
  // show level N+1 if level N is selected AND has children
  const levelsToShow = [0]
  for (let i = 0; i < 3; i++) {
    if (selected[i] && getOptions(i + 1).length > 0) {
      levelsToShow.push(i + 1)
    }
  }

  // The full path label for the selected deepest value
  const { byId } = buildTree(locations)
  let deepestId = ''
  for (let i = 3; i >= 0; i--) { if (selected[i]) { deepestId = selected[i]; break } }
  const pathLabel = deepestId ? getPath(deepestId, byId) : ''

  return (
    <div className={cn('space-y-2', className)}>
      {levelsToShow.map(level => {
        const options = getOptions(level)
        if (!options.length) return null
        return (
          <div key={level}>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              {level > 0 && <ChevronRight className="w-3 h-3" />}
              {levelLabels[level]}
            </label>
            <select
              disabled={disabled}
              value={selected[level]}
              onChange={e => handleSelect(level, e.target.value)}
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">{levelPlaceholders[level]}</option>
              {options.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
        )
      })}

      {pathLabel && (
        <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-medium">{pathLabel}</span>
        </div>
      )}
    </div>
  )
}
