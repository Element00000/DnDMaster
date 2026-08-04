import { useLayoutEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'

/**
 * Position eines schwebenden Bedienelements ueber der unteren Leiste: Ist ein Panel
 * geoeffnet, sitzt das Element auf dessen Oberkante statt am Kartenrand.
 *
 * "snap" ist genau in dem Moment gesetzt, in dem sich das Panel oeffnet oder schliesst.
 * Dann soll die neue Position ohne weichen Nachlauf uebernommen werden - das Panel steht
 * sofort auf voller Hoehe, ein nachlaufendes Element laege waehrenddessen darauf. Beim
 * Ziehen an der Panelhoehe bleibt der Nachlauf dagegen erhalten.
 *
 * @param gap Abstand zwischen Element und Panel-Oberkante bzw. Kartenrand (px).
 */
export function useBottomPanelOffset(gap: number): { bottom: string; snap: boolean } {
  const bottomPanel = useStore((s) => s.bottomPanel)
  const bottomPanelHeight = useStore((s) => s.bottomPanelHeight)

  const open = bottomPanel !== null
  const [snap, setSnap] = useState(false)
  const wasOpen = useRef(open)

  useLayoutEffect(() => {
    if (wasOpen.current === open) return
    wasOpen.current = open
    setSnap(true)
  }, [open])

  // Ab dem naechsten Frame wieder mit Nachlauf - die Position steht dann bereits.
  useLayoutEffect(() => {
    if (!snap) return
    const id = requestAnimationFrame(() => setSnap(false))
    return () => cancelAnimationFrame(id)
  }, [snap])

  return { bottom: `calc(${open ? bottomPanelHeight : 0}% + ${gap}px)`, snap }
}
