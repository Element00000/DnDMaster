import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import type { DraftPos } from '../store/useStore'
import { canSchedule, entityDisplayMeta, isDead } from '../types'
import type { Entity, MapLayer } from '../types'
import type { PhaseContext } from '../utils/time'
import {
  activeTimestone,
  dayNightOverlay,
  formatTime,
  parseTime,
  placementAt,
  scheduleOfPhase,
  scheduleForDay,
} from '../utils/time'
import { useAsset } from '../useAsset'
import { useBottomPanelOffset } from '../useBottomPanelOffset'
import { PlaceholderMap } from './PlaceholderMap'
import { MapPin } from './MapPin'
import { DayPicker } from './DayPicker'
import { fileToScaledDataUrl } from '../utils/image'
import { deleteAsset, putAsset } from '../utils/assets'

interface View {
  scale: number
  tx: number
  ty: number
}

// Grosszuegig bemessen, damit auch mehrfach verschachtelte Karten (Welt > Region > Stadt >
// Kampfkarte ...) noch weit genug herangezoomt werden koennen, um die innerste Ebene
// praezise zu sehen und zu bearbeiten - ohne die eigentliche Wurzelkarte unbrauchbar
// gross/klein werden zu lassen.
const MIN_SCALE = 0.02
const MAX_SCALE = 4000
const DRAG_THRESHOLD = 4
/** Ab dieser Bildschirmgroesse (kuerzere Seite, px) wird eine eingebettete Karte aufgedeckt. */
const REVEAL_THRESHOLD = 160
/** Minimale Kantenlaenge einer Einbettung, in Weltkoordinaten der Eltern-Ebene. */
export const MIN_EMBED_SIZE = 20
/** Dauer einer Kartenfahrt (Sprung zu einer Karte/einem Objekt, Einpassen) in ms. */
const VIEW_ANIM_MS = 800
/** Anteil des Sichtbereichs, den eine eingepasste Karte einnimmt (Rest bleibt als Rand). */
const FIT_MARGIN = 0.92
/** Abstand in Bildschirmpunkten, ab dem eine gezogene Station an einer anderen einrastet. */
const STOP_SNAP_PX = 22

/** Sanft anfahren, in der Mitte am schnellsten, sanft abbremsen. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  // Immer der zuletzt gerenderte Stand - Ausgangspunkt fuer Kartenfahrten und Zoomziele,
  // ohne sie von der view-Identitaet abhaengig zu machen.
  const viewRef = useRef(view)
  viewRef.current = view
  /** Laufende Kartenfahrt (requestAnimationFrame-Handle); null = keine. */
  const viewAnim = useRef<number | null>(null)
  const [fitted, setFitted] = useState(false)

  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const layer = campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
  const entities = campaign.entities
  const tool = useStore((s) => s.tool)
  const pendingType = useStore((s) => s.pendingEntityType)
  const pendingFields = useStore((s) => s.pendingEntityFields)
  const tableMode = useStore((s) => s.tableMode)
  const placingEntityId = useStore((s) => s.placingEntityId)
  const addEntity = useStore((s) => s.addEntity)
  const setPlacement = useStore((s) => s.setPlacement)
  const setPlacingEntity = useStore((s) => s.setPlacingEntity)
  const moveEntity = useStore((s) => s.moveEntity)
  const moveTimestone = useStore((s) => s.moveTimestone)
  const updateTimestone = useStore((s) => s.updateTimestone)
  const removeTimestone = useStore((s) => s.removeTimestone)
  const selectEntity = useStore((s) => s.selectEntity)
  const selectedIds = useStore((s) => s.selectedIds)
  const setSelectedIds = useStore((s) => s.setSelectedIds)
  const toggleSelectedId = useStore((s) => s.toggleSelectedId)
  const deleteEntity = useStore((s) => s.deleteEntity)
  const setTool = useStore((s) => s.setTool)
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const setMoment = useStore((s) => s.setMoment)
  const draftPos = useStore((s) => s.draftPos)
  const setDraftPos = useStore((s) => s.setDraftPos)
  const clearDraftPos = useStore((s) => s.clearDraftPos)
  const setDraftTime = useStore((s) => s.setDraftTime)
  const setDraftDay = useStore((s) => s.setDraftDay)
  const commitDraft = useStore((s) => s.commitDraft)
  const selectedEntityId = useStore((s) => s.selectedEntityId)
  const bottomPanel = useStore((s) => s.bottomPanel)
  const setBottomPanel = useStore((s) => s.setBottomPanel)
  const fogEditingFlag = useStore((s) => s.fogEditing)
  const fogBrush = useStore((s) => s.fogBrush)
  const addReveal = useStore((s) => s.addReveal)
  const resizeLayer = useStore((s) => s.resizeLayer)
  const placingLayerId = useStore((s) => s.placingLayerId)
  const setPlacingLayer = useStore((s) => s.setPlacingLayer)
  const embedLayer = useStore((s) => s.embedLayer)
  const setEmbedRect = useStore((s) => s.setEmbedRect)
  const setLayerImage = useStore((s) => s.setLayerImage)
  const fitToViewRequest = useStore((s) => s.fitToViewRequest)

  /**
   * Der Nebel-Pinsel legt die ganze Karte lahm: kein Auswaehlen, kein Aufziehen, kein
   * Verschieben - jeder Zeigerdruck deckt stattdessen auf. Das ist nur zu vertreten,
   * solange die Ebene ueberhaupt Nebel hat. Ist er aus, fehlt jeder sichtbare Hinweis auf
   * den Pinsel (sein Knopf haengt am Haken "Nebel"), und die Karte waere ohne erkennbaren
   * Grund stumm. Darum gilt er hier nur zusammen mit dem Nebel selbst.
   */
  const fogEditing = fogEditingFlag && layer.fogEnabled

  const { width, height } = layer
  const mapImage = useAsset(layer.imageUrl)
  const mapUploadRef = useRef<HTMLInputElement>(null)

  async function onUploadMapImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const prev = layer.imageUrl
    const { url, width: w, height: h } = await fileToScaledDataUrl(file, { maxDim: 2400, quality: 0.85 })
    const ref = await putAsset(url)
    setLayerImage(layer.id, ref, w, h)
    void deleteAsset(prev)
  }

  // Auf dieser Ebene eingebettete Karten (andere Ebenen mit embed.parentLayerId === layer.id).
  const embeddedLayers = campaign.layers.filter((l) => l.embed && l.embed.parentLayerId === layer.id)

  // Auf der aktiven Ebene platzierte Objekte (im Spieltischmodus nur entdeckte).
  // Objekte sind immer sichtbar; bei aktivem Tageszeit-Filter kann sich ihre
  // Position aber gemaess eines passenden Zeitplan-Eintrags verschieben.
  // Nach der Karte, auf der das Objekt gerade steht - nicht nach der, auf der sein Tag
  // beginnt. Schickt ein Timestone es auf eine andere Karte, zeichnet ab dann diese es.
  const pins = entities.filter(
    (e) =>
      placementAt(e, timeOfDay, currentDay, campaign)?.layerId === layer.id &&
      (!tableMode || e.visibility === 'spieler'),
  )

  /**
   * Wo ein Objekt gerade zu sehen ist: der zur Uhrzeit geltende Timestone, sonst die
   * Basis-Platzierung. Die Koordinaten gelten auf der Karte, die placementAt nennt - beides
   * gehoert zusammen und darf nicht getrennt werden.
   */
  // Eine vorgemerkte Position bewegt den Pin bewusst NICHT: Sie erscheint als eigenes
  // Doppel daneben (siehe DraftOverlay), damit man sieht, dass noch nichts gespeichert ist.
  const effectivePos = useCallback(
    (e: Entity): { x: number; y: number } => {
      const p = placementAt(e, timeOfDay, currentDay, campaign)
      return p ? { x: p.x, y: p.y } : { x: e.placement!.x, y: e.placement!.y }
    },
    [timeOfDay, currentDay],
  )

  /**
   * Ziehen eines Pins - was dabei verschoben wird, haengt davon ab, was man gerade tut:
   *
   * - Aufnahme (Tagesablauf dieses Objekts offen): Es entsteht immer ein Doppel, und die
   *   Uhrzeit dazu traegt man unmittelbar daneben ein. Die eingestellte Uhrzeit spielt dabei
   *   keine Rolle - sie liefert nur den Vorschlag im Feld. Ort und Zeitpunkt bleiben so
   *   beieinander, statt sich auf Karte und untere Leiste zu verteilen. Einen vorhandenen
   *   Punkt verschiebt man an seiner nummerierten Station auf der Karte.
   * - Ohne Aufnahme wandert der Timestone mit, der gerade gilt: Seine Stelle ist die, die
   *   man sieht.
   * - Gilt keiner (0 Uhr, oder ohne Tagesablauf), gilt die Basis-Platzierung.
   */
  const moveEntityTimed = useCallback(
    (e: Entity, dxWorld: number, dyWorld: number) => {
      // Spieler-Charaktere haben keinen Tagesablauf; sie werden immer nur verschoben.
      const recording = bottomPanel === 'zeitleiste' && selectedIds.includes(e.id) && canSchedule(e)
      if (!recording) {
        const active = activeTimestone(e.schedule, timeOfDay, currentDay, campaign)
        if (active) {
          moveTimestone(e.id, active.id, dxWorld, dyWorld)
          return
        }
        moveEntity(e.id, dxWorld, dyWorld)
        return
      }
      // Waehrend des Ziehens bleibt die Karte dieselbe; auf eine andere umgesetzt wird das
      // Doppel erst beim Loslassen (siehe onReparentEntity), wo die Bildschirmstelle
      // bekannt ist.
      const here = placementAt(e, timeOfDay, currentDay, campaign)!
      const from = draftPos[e.id] ?? here
      // Gezogen wird die Nadel auf der Karte, auf der das Objekt gerade steht - das Doppel
      // kann laengst auf einer anderen liegen. Deren Massstab ist ein anderer, und dieselbe
      // Handbewegung bedeutet dort eine andere Strecke.
      let factor = 1
      if (from.layerId !== here.layerId) {
        const a = layerScreenView(campaign.layers, layer.id, here.layerId, view)
        const b = layerScreenView(campaign.layers, layer.id, from.layerId, view)
        if (a && b && b.scale !== 0) factor = a.scale / b.scale
      }
      setDraftPos(e.id, from.x + dxWorld * factor, from.y + dyWorld * factor, from.layerId)
    },
    [
      timeOfDay,
      currentDay,
      moveTimestone,
      moveEntity,
      bottomPanel,
      selectedIds,
      draftPos,
      setDraftPos,
      campaign.layers,
      layer.id,
      view,
    ],
  )

  /**
   * Ansicht setzen und viewRef sofort mitziehen. Ohne das saehe ein Effekt, der im selben
   * Durchgang laeuft (z.B. der Navigations-Effekt direkt nach dem ersten Einpassen), noch
   * den Stand vor dem Setzen und wuerde eine ueberfluessige Fahrt starten.
   */
  const applyView = useCallback((v: View) => {
    viewRef.current = v
    setView(v)
  }, [])

  /** Laufende Kartenfahrt abbrechen (neue Fahrt, manuelles Zoomen/Schieben, Unmount). */
  const stopViewAnimation = useCallback(() => {
    if (viewAnim.current != null) {
      cancelAnimationFrame(viewAnim.current)
      viewAnim.current = null
    }
  }, [])

  useEffect(() => stopViewAnimation, [stopViewAnimation])

  /**
   * Weich zur Zielansicht fahren statt hart umzuschalten: Der Weltpunkt in der Bildmitte
   * wandert sanft beschleunigend und wieder abbremsend zum Ziel, waehrend der Massstab
   * geometrisch interpoliert wird. Linear interpoliert wuerde eine Fahrt ueber mehrere
   * Zoomstufen anfangs davonrasen und am Ende kriechen.
   */
  const animateView = useCallback(
    (target: View) => {
      stopViewAnimation()
      const el = containerRef.current
      const from = viewRef.current
      const cw = el?.clientWidth ?? 0
      const ch = el?.clientHeight ?? 0
      const alreadyThere =
        Math.abs(from.scale - target.scale) < from.scale * 1e-4 &&
        Math.abs(from.tx - target.tx) < 0.5 &&
        Math.abs(from.ty - target.ty) < 0.5
      if (cw === 0 || ch === 0 || alreadyThere) {
        applyView(target)
        return
      }

      // Weltpunkte, die zu Beginn bzw. am Ende in der Bildmitte stehen.
      const fromCx = (cw / 2 - from.tx) / from.scale
      const fromCy = (ch / 2 - from.ty) / from.scale
      const toCx = (cw / 2 - target.tx) / target.scale
      const toCy = (ch / 2 - target.ty) / target.scale
      const ratio = target.scale / from.scale
      const start = performance.now()

      const step = (now: number) => {
        const t = Math.min(1, (now - start) / VIEW_ANIM_MS)
        const k = easeInOutCubic(t)
        const scale = from.scale * Math.pow(ratio, k)
        const cx = fromCx + (toCx - fromCx) * k
        const cy = fromCy + (toCy - fromCy) * k
        applyView({ scale, tx: cw / 2 - cx * scale, ty: ch / 2 - cy * scale })
        viewAnim.current = t < 1 ? requestAnimationFrame(step) : null
      }
      viewAnim.current = requestAnimationFrame(step)
    },
    [stopViewAnimation, applyView],
  )

  /** Ganze Karte einpassen. Ohne Fahrt, wenn die Ansicht ohnehin gerade neu aufgebaut wird. */
  const fitToView = useCallback(
    (animate = true) => {
      const el = containerRef.current
      if (!el) return
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (cw === 0 || ch === 0) return
      const scale = Math.min(cw / width, ch / height) * FIT_MARGIN
      const target: View = { scale, tx: (cw - width * scale) / 2, ty: (ch - height * scale) / 2 }
      if (animate) {
        animateView(target)
      } else {
        stopViewAnimation()
        applyView(target)
      }
    },
    [width, height, animateView, stopViewAnimation, applyView],
  )

  useEffect(() => {
    if (!fitted) {
      // Erster Aufbau: sofort einpassen, sonst faehrt die Karte beim Oeffnen los.
      fitToView(false)
      setFitted(true)
    }
  }, [fitted, fitToView])

  // Beim Kampagnen-/Ebenenwechsel neu einpassen - ohne Fahrt, weil die vorherige Ansicht
  // zu einer anderen Karte gehoerte und eine Fahrt dorthin nichts Nachvollziehbares zeigt.
  useEffect(() => {
    fitToView(false)
    setMapSelected(false)
    setSelectedEmbedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, layer.id])

  // Einmaliger Befehl von aussen (Logo-Klick in der TopBar), die Karte komplett einzupassen.
  useEffect(() => {
    if (fitToViewRequest > 0) fitToView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToViewRequest])

  // Kartenauswahl (Eck-Ziehpunkte zum Skalieren) automatisch aufheben, sobald
  // ein anderes Werkzeug/Modus aktiv wird.
  useEffect(() => {
    if (tableMode || fogEditing || tool === 'add' || placingEntityId || placingLayerId) {
      setMapSelected(false)
      setSelectedEmbedId(null)
    }
  }, [tableMode, fogEditing, tool, placingEntityId, placingLayerId])

  // Entf/Ruecktaste: markierte Objekte loeschen (nicht waehrend Texteingabe).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (tableMode || selectedIds.length === 0) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      e.preventDefault()
      const names = selectedIds.map((id) => entities.find((x) => x.id === id)?.name ?? 'Objekt')
      const question =
        names.length === 1 ? `Objekt "${names[0]}" loeschen?` : `${names.length} Objekte loeschen?\n\n${names.join(', ')}`
      if (!confirm(question)) return
      selectedIds.forEach((id) => deleteEntity(id))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, tableMode, entities, deleteEntity])

  const onWheel = useCallback((e: React.WheelEvent) => {
    const el = containerRef.current
    if (!el) return
    // Eigenes Zoomen hat Vorrang vor einer noch laufenden Kartenfahrt.
    stopViewAnimation()
    const rect = el.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015)
      const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = newScale / v.scale
      return { scale: newScale, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k }
    })
  }, [])

  // Rechte Maustaste: Karte verschieben.
  const drag = useRef<{ startX: number; startY: number; origTx: number; origTy: number; moved: boolean } | null>(null)
  // Linke Maustaste auf leerer Flaeche: Rechteck-Markierung.
  const marquee = useRef<{ startX: number; startY: number; moved: boolean } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const painting = useRef(false)

  // Kartengroesse per Eck-Ziehpunkt aendern (nur wenn die Karte angeklickt/ausgewaehlt ist).
  const [mapSelected, setMapSelected] = useState(false)
  // Welche eingebettete Karte ist gerade ausgewaehlt (zeigt ihre eigenen Eck-Ziehpunkte)?
  const [selectedEmbedId, setSelectedEmbedId] = useState<string | null>(null)
  type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'
  const resize = useRef<{
    startWidth: number
    startHeight: number
    startTx: number
    startTy: number
    anchorX: number
    anchorY: number
  } | null>(null)

  // Bildschirm- zu Weltkoordinaten der aktiven Ansicht.
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current!
      const rect = el.getBoundingClientRect()
      return {
        wx: (clientX - rect.left - view.tx) / view.scale,
        wy: (clientY - rect.top - view.ty) / view.scale,
      }
    },
    [view.tx, view.ty, view.scale],
  )

  const paintReveal = useCallback(
    (clientX: number, clientY: number) => {
      const { wx, wy } = toWorld(clientX, clientY)
      if (wx < 0 || wy < 0 || wx > width || wy > height) return
      addReveal(layer.id, wx, wy, fogBrush)
    },
    [toWorld, width, height, addReveal, layer.id, fogBrush],
  )

  // Klick auf eine eingeklappte Kartenpinnadel (auf beliebiger Verschachtelungstiefe):
  // zoomt so heran, dass die Karte den sichtbaren Bereich maximal ausfuellt (nicht nur
  // knapp die Aufdeck-Schwelle ueberschreitet). sx/sy/sw/sh sind ihre aktuelle
  // Bildschirm-Position/-Groesse (bereits rekursiv aus allen Eltern-Transformationen
  // berechnet), also unabhaengig davon, wie tief sie verschachtelt ist.
  const zoomToScreenRect = useCallback(
    (sx: number, sy: number, sw: number, sh: number) => {
      const cont = containerRef.current
      if (!cont) return
      const cw = cont.clientWidth
      const ch = cont.clientHeight
      // Beide Seiten einzeln pruefen und die knappere entscheiden lassen. Die kuerzere
      // Kartenseite auf die kuerzere Containerseite zu beziehen genuegt nur, wenn beide
      // dasselbe Seitenverhaeltnis haben - sonst ragt die laengere Seite hinaus.
      const neededFactor = Math.min((cw * FIT_MARGIN) / sw, (ch * FIT_MARGIN) / sh)
      const cx = sx + sw / 2
      const cy = sy + sh / 2
      const v = viewRef.current
      const newScale = clamp(v.scale * neededFactor, MIN_SCALE, MAX_SCALE)
      const wx = (cx - v.tx) / v.scale
      const wy = (cy - v.ty) / v.scale
      animateView({ scale: newScale, tx: cw / 2 - wx * newScale, ty: ch / 2 - wy * newScale })
    },
    [animateView],
  )

  const viewLayerId = useStore((s) => s.viewLayerId)
  const viewLayerNonce = useStore((s) => s.viewLayerNonce)
  const setViewLayerId = useStore((s) => s.setViewLayerId)

  const viewLayerIdRef = useRef(viewLayerId)
  viewLayerIdRef.current = viewLayerId

  // "Meine Karten" -> Karte anklicken: nicht die aktive Ebene wechseln, sondern die aktuelle
  // Wurzelkarten-Instanz per Zoom/Schwenk so fuehren, dass die angeklickte (verschachtelte)
  // Karte moeglichst gross im sichtbaren Bereich erscheint. null = zurueck zur Wurzelansicht.
  //
  // Haengt bewusst nur am Nonce, nicht an viewLayerId: Der Nonce steigt bei jedem bewussten
  // Navigationsbefehl (auch beim erneuten Klick auf dieselbe Karte, wenn man zwischendurch
  // manuell herausgezoomt hat) - und eben nicht, wenn nur der Panel-Kontext nachgezogen wird.
  useEffect(() => {
    const id = viewLayerIdRef.current
    if (id == null) {
      fitToView()
      return
    }
    const rect = computeLayerScreenRect(campaign.layers, layer.id, id, viewRef.current)
    if (rect) zoomToScreenRect(rect.x, rect.y, rect.w, rect.h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewLayerNonce])

  // Eingebettete Karte per Ziehen auf eine andere (Vorfahren-)Karte fallen lassen: die
  // Pinnadel/Box einer eingebetteten Karte bestimmt so ihre hierarchische Einordnung. Zielt
  // der Ablegepunkt (Bildschirmkoordinaten) auf eine andere, aktuell aufgedeckte Karte als die
  // bisherige Eltern-Karte, wird die Karte dorthin umgehaengt - Position/Groesse werden so
  // umgerechnet, dass sie an derselben Bildschirmstelle in gleicher Groesse erscheint.
  const onReparentEmbed = useCallback(
    (draggedId: string, clientX: number, clientY: number) => {
      const el = containerRef.current
      if (!el) return
      const dragged = campaign.layers.find((l) => l.id === draggedId)
      if (!dragged?.embed) return
      const rect = el.getBoundingClientRect()
      const v = viewRef.current
      const wx = (clientX - rect.left - v.tx) / v.scale
      const wy = (clientY - rect.top - v.ty) / v.scale
      const exclude = collectWithDescendants(campaign.layers, draggedId)
      const result = resolveDeepTarget(campaign.layers, layer.id, wx, wy, v.scale, exclude)
      if (result.layerId === dragged.embed.parentLayerId) return
      const newParent = campaign.layers.find((l) => l.id === result.layerId)
      if (!newParent) return
      const oldEffScale = computeLayerEffScale(campaign.layers, layer.id, dragged.embed.parentLayerId, v.scale)
      if (oldEffScale == null) return
      const screenW = dragged.embed.width * oldEffScale
      const screenH = dragged.embed.height * oldEffScale
      const newWidth = Math.max(MIN_EMBED_SIZE, screenW / result.effScale)
      const newHeight = Math.max(MIN_EMBED_SIZE, screenH / result.effScale)
      const newX = clamp(result.x - newWidth / 2, 0, Math.max(0, newParent.width - newWidth))
      const newY = clamp(result.y - newHeight / 2, 0, Math.max(0, newParent.height - newHeight))
      embedLayer(draggedId, { parentLayerId: result.layerId, x: newX, y: newY, width: newWidth, height: newHeight })
    },
    [campaign.layers, layer.id, embedLayer],
  )

  /**
   * Loslassen nach dem Ziehen einer Pinnadel. Erst hier ist bekannt, ueber welcher Karte der
   * Zeiger steht - waehrend des Ziehens bewegt sich alles noch in den Koordinaten der
   * bisherigen Karte. Landet die Nadel auf einer anderen, wird genau das umgehaengt, was
   * gerade gezogen wurde: das Doppel, der geltende Timestone oder die Basis-Platzierung.
   * Sonst behielte ein Punkt auf einer anderen Karte die Koordinaten der alten - er laege
   * dann rechnerisch ausserhalb und verschwaende, sobald sie einklappt.
   */
  const onReparentEntity = useCallback(
    (entityId: string, clientX: number, clientY: number) => {
      const el = containerRef.current
      if (!el) return
      const ent = entities.find((x) => x.id === entityId)
      if (!ent?.placement) return
      const rect = el.getBoundingClientRect()
      const v = viewRef.current
      const wx = (clientX - rect.left - v.tx) / v.scale
      const wy = (clientY - rect.top - v.ty) / v.scale
      const result = resolveDeepTarget(campaign.layers, layer.id, wx, wy, v.scale)

      const draft = draftPos[entityId]
      if (draft) {
        if (result.layerId === draft.layerId) return
        setDraftPos(entityId, result.x, result.y, result.layerId)
        return
      }
      // Ohne Aufnahme wurde der Punkt gezogen, der gerade gilt (siehe moveEntityTimed) -
      // nicht die Basis-Platzierung, die dabei gar nicht zu sehen ist.
      const active = activeTimestone(ent.schedule, timeOfDay, currentDay, campaign)
      if (active) {
        if (result.layerId === (active.layerId ?? ent.placement.layerId)) return
        updateTimestone(entityId, active.id, { layerId: result.layerId, x: result.x, y: result.y })
        return
      }
      if (result.layerId === ent.placement.layerId) return
      setPlacement(entityId, { layerId: result.layerId, x: result.x, y: result.y })
    },
    [
      entities,
      campaign.layers,
      layer.id,
      setPlacement,
      timeOfDay,
      currentDay,
      draftPos,
      setDraftPos,
      updateTimestone,
    ],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = containerRef.current
      if (!el) return
      // Nebel-Pinsel: aufdecken statt schieben/markieren.
      if (fogEditing) {
        if (e.button !== 0) return
        el.setPointerCapture(e.pointerId)
        painting.current = true
        paintReveal(e.clientX, e.clientY)
        return
      }
      if (e.button === 2) {
        // Rechte Maustaste: Karte verschieben. Bricht eine laufende Kartenfahrt ab,
        // damit sie nicht gegen die Handbewegung anlaeuft.
        e.preventDefault()
        stopViewAnimation()
        el.setPointerCapture(e.pointerId)
        drag.current = { startX: e.clientX, startY: e.clientY, origTx: view.tx, origTy: view.ty, moved: false }
        setPanning(true)
        return
      }
      if (e.button === 0) {
        // Linke Maustaste auf leerer Flaeche: Rechteck-Markierung aufziehen.
        // preventDefault, damit der Browser dabei nicht Text/Elemente blau markiert.
        e.preventDefault()
        el.setPointerCapture(e.pointerId)
        marquee.current = { startX: e.clientX, startY: e.clientY, moved: false }
      }
    },
    [view.tx, view.ty, fogEditing, paintReveal, stopViewAnimation],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (painting.current) {
        paintReveal(e.clientX, e.clientY)
        return
      }
      const d = drag.current
      if (d) {
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true
        if (d.moved) setView((v) => ({ ...v, tx: d.origTx + dx, ty: d.origTy + dy }))
        return
      }
      const m = marquee.current
      if (m) {
        const el = containerRef.current
        if (!el) return
        const dx = e.clientX - m.startX
        const dy = e.clientY - m.startY
        if (!m.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) m.moved = true
        if (m.moved) {
          const rect = el.getBoundingClientRect()
          const x0 = m.startX - rect.left
          const y0 = m.startY - rect.top
          const x1 = e.clientX - rect.left
          const y1 = e.clientY - rect.top
          setMarqueeRect({
            x: Math.min(x0, x1),
            y: Math.min(y0, y1),
            w: Math.abs(x1 - x0),
            h: Math.abs(y1 - y0),
          })
        }
      }
    },
    [paintReveal],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const el = containerRef.current
      if (el) el.releasePointerCapture(e.pointerId)
      if (painting.current) {
        painting.current = false
        return
      }

      // Rechte Maustaste: nur Verschieben, keine Auswahl-/Anlege-Logik.
      if (drag.current) {
        drag.current = null
        setPanning(false)
        return
      }

      const m = marquee.current
      marquee.current = null
      if (m && m.moved) {
        setMarqueeRect(null)
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x0 = Math.min(m.startX, e.clientX) - rect.left
        const y0 = Math.min(m.startY, e.clientY) - rect.top
        const x1 = Math.max(m.startX, e.clientX) - rect.left
        const y1 = Math.max(m.startY, e.clientY) - rect.top
        const ids = pins
          .filter((p) => {
            const pos = effectivePos(p)
            const sx = pos.x * view.scale + view.tx
            const sy = pos.y * view.scale + view.ty
            return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1
          })
          .map((p) => p.id)
        setSelectedIds(ids)
        return
      }
      setMarqueeRect(null)
      if (!m) return // Klick kam nicht von der linken Maustaste (z.B. Fog-Pinsel).

      if (!el) return
      const rect = el.getBoundingClientRect()
      const wx = (e.clientX - rect.left - view.tx) / view.scale
      const wy = (e.clientY - rect.top - view.ty) / view.scale
      const inside = wx >= 0 && wy >= 0 && wx <= width && wy <= height

      // Eine Karte wird gerade als eingebettete Karte platziert.
      // Faellt der Klick in eine (beliebig tief) aufgedeckte eingebettete Karte,
      // wird dort eingebettet statt immer auf der Wurzelebene.
      if (placingLayerId) {
        if (inside) {
          const t = resolveDeepTarget(campaign.layers, layer.id, wx, wy, view.scale)
          const parentLayer = campaign.layers.find((l) => l.id === t.layerId)
          const movingLayer = campaign.layers.find((l) => l.id === placingLayerId)
          if (parentLayer && movingLayer) {
            const w = Math.max(MIN_EMBED_SIZE, parentLayer.width * 0.25)
            const h = Math.max(MIN_EMBED_SIZE, w * (movingLayer.height / movingLayer.width))
            embedLayer(placingLayerId, {
              parentLayerId: parentLayer.id,
              x: clamp(t.x - w / 2, 0, Math.max(0, parentLayer.width - w)),
              y: clamp(t.y - h / 2, 0, Math.max(0, parentLayer.height - h)),
              width: w,
              height: h,
            })
          }
          setPlacingLayer(null)
        }
        return
      }

      // Vorrang: ein vorhandenes Objekt wird gerade platziert.
      if (placingEntityId) {
        if (inside) {
          const t = resolveDeepTarget(campaign.layers, layer.id, wx, wy, view.scale)
          setPlacement(placingEntityId, { layerId: t.layerId, x: t.x, y: t.y })
          setPlacingEntity(null)
        }
        return
      }

      if (tool === 'add' && !tableMode) {
        if (!inside) return
        // Faellt der Klick in eine (beliebig tief) aufgedeckte eingebettete Karte,
        // wird das Objekt dort platziert statt auf der Wurzelebene.
        const t = resolveDeepTarget(campaign.layers, layer.id, wx, wy, view.scale)
        addEntity({ type: pendingType, placement: { layerId: t.layerId, x: t.x, y: t.y }, fields: pendingFields })
        setTool('select')
      } else {
        selectEntity(null)
        setSelectedEmbedId(null)
        // Klick auf die Karte selbst waehlt sie aus (zeigt Eck-Ziehpunkte), Klick daneben hebt die Auswahl auf.
        setMapSelected(inside && !tableMode && !fogEditing)
        // Klick auf die Wurzelkarte selbst zeigt wieder deren eigene Objekte im rechten
        // Panel - ohne die Ansicht zu bewegen, sonst wuerde jeder Klick auf freie Flaeche
        // die ganze Karte einpassen und den mühsam gewaehlten Ausschnitt verwerfen.
        if (inside) setViewLayerId(null, false)
      }
    },
    [
      tool,
      pendingType,
      pendingFields,
      view,
      width,
      height,
      layer.id,
      tableMode,
      fogEditing,
      placingEntityId,
      placingLayerId,
      entities,
      campaign.layers,
      pins,
      effectivePos,
      addEntity,
      setPlacement,
      setPlacingEntity,
      embedLayer,
      setPlacingLayer,
      selectEntity,
      setSelectedIds,
      setTool,
      setViewLayerId,
    ],
  )

  const MIN_MAP_SIZE = 300

  const startResize = useCallback(
    (handle: ResizeHandle) => (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      resize.current = {
        startWidth: width,
        startHeight: height,
        startTx: view.tx,
        startTy: view.ty,
        anchorX: handle === 'nw' || handle === 'sw' ? width : 0,
        anchorY: handle === 'nw' || handle === 'ne' ? height : 0,
      }
    },
    [width, height, view.tx, view.ty],
  )

  const onResizeMove = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      const r = resize.current
      const el = containerRef.current
      if (!r || !el) return
      const rect = el.getBoundingClientRect()
      const wx = (e.clientX - rect.left - r.startTx) / view.scale
      const wy = (e.clientY - rect.top - r.startTy) / view.scale
      const rawW = Math.abs(wx - r.anchorX)
      const rawH = Math.abs(wy - r.anchorY)
      let scale = (rawW / r.startWidth + rawH / r.startHeight) / 2
      const minScale = MIN_MAP_SIZE / Math.min(r.startWidth, r.startHeight)
      scale = Math.max(scale, minScale)
      const newWidth = Math.round(r.startWidth * scale)
      const newHeight = Math.round(r.startHeight * scale)
      const anchorRoleX = r.anchorX === 0 ? 0 : newWidth
      const anchorRoleY = r.anchorY === 0 ? 0 : newHeight
      setView((v) => ({
        ...v,
        tx: r.startTx + (r.anchorX - anchorRoleX) * v.scale,
        ty: r.startTy + (r.anchorY - anchorRoleY) * v.scale,
      }))
      resizeLayer(layer.id, newWidth, newHeight)
    },
    [view.scale, layer.id, resizeLayer],
  )

  const onResizeUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    resize.current = null
  }, [])

  /**
   * Doppelklick auf die Wurzelkarte maximiert sie - dasselbe Verhalten wie bei einer
   * eingebetteten Karte. Bewusst nur auf ihrer Flaeche: Ein Doppelklick daneben (auf den
   * leeren Hintergrund) soll die Ansicht in Ruhe lassen. Eingebettete Karten fangen ihren
   * eigenen Doppelklick ab, hier kommt er also gar nicht erst an.
   */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current
      if (!el || tableMode || fogEditing) return
      const rect = el.getBoundingClientRect()
      const wx = (e.clientX - rect.left - view.tx) / view.scale
      const wy = (e.clientY - rect.top - view.ty) / view.scale
      if (wx < 0 || wy < 0 || wx > width || wy > height) return
      fitToView()
    },
    [view.tx, view.ty, view.scale, width, height, tableMode, fogEditing, fitToView],
  )

  const placingActive = placingEntityId !== null || placingLayerId !== null
  const selectedEntity = entities.find((e) => e.id === selectedEntityId && e.placement) ?? null

  /**
   * Loslassen eines Doppels - egal ob man die Figur gezogen hat oder das Doppel selbst.
   * Zwei Dinge auf einmal, weil beide erst hier entschieden werden koennen:
   *
   * 1. Liegt der Zeiger ueber einer anderen Karte, setzt das Doppel dort neu an. Waehrend
   *    des Ziehens laeuft es noch in den Koordinaten der alten.
   * 2. Nahe an einer bestehenden Station rastet es auf deren Stelle ein. Von Hand liesse
   *    sich die nie genau treffen, und schon ein Pixel Abstand ergaebe spaeter zwei
   *    getrennte Marken statt einer gemeinsamen.
   *
   * Liest den Stand frisch aus dem Store, damit beide Schritte aufeinander aufbauen.
   */
  const dropDraft = useCallback(
    (entityId: string, clientX: number, clientY: number) => {
      const el = containerRef.current
      if (!el) return
      const st = useStore.getState()
      const c = st.activeCampaign()
      const e = c.entities.find((x) => x.id === entityId)
      const draft = st.draftPos[entityId]
      if (!e?.placement || !draft) return

      const rect = el.getBoundingClientRect()
      const v = viewRef.current
      const wx = (clientX - rect.left - v.tx) / v.scale
      const wy = (clientY - rect.top - v.ty) / v.scale
      const target = resolveDeepTarget(c.layers, layer.id, wx, wy, v.scale)
      const pos =
        target.layerId === draft.layerId
          ? { layerId: draft.layerId, x: draft.x, y: draft.y }
          : { layerId: target.layerId, x: target.x, y: target.y }

      const lv = layerScreenView(c.layers, layer.id, pos.layerId, v)
      if (lv) {
        // Nur an Stellen auf derselben Karte einrasten - Koordinaten anderer Karten haben
        // hier keine Bedeutung und laegen sonst zufaellig in Reichweite.
        const stops = [
          { layerId: e.placement.layerId, x: e.placement.x, y: e.placement.y },
          ...scheduleForDay(e.schedule, st.currentDay, c).map((s) => ({
            layerId: s.layerId ?? e.placement!.layerId,
            x: s.x,
            y: s.y,
          })),
        ].filter((t) => t.layerId === pos.layerId)
        for (const t of stops) {
          const dx = t.x - pos.x
          const dy = t.y - pos.y
          if (dx === 0 && dy === 0) break
          if (Math.hypot(dx * lv.scale, dy * lv.scale) <= STOP_SNAP_PX) {
            pos.x = t.x
            pos.y = t.y
            break
          }
        }
      }
      setDraftPos(entityId, pos.x, pos.y, pos.layerId)
    },
    [layer.id, setDraftPos],
  )

  /** Doppelklick auf ein Objekt: seinen Tagesablauf in der unteren Leiste aufschlagen. */
  const openSchedule = useCallback(
    (entityId: string) => {
      selectEntity(entityId)
      // Spieler-Charaktere haben keinen - dort bleibt es beim blossen Auswaehlen, statt eine
      // Leiste aufzuschlagen, die nur erklaeren kann, warum sie leer ist.
      const e = entities.find((x) => x.id === entityId)
      if (e && canSchedule(e)) setBottomPanel('zeitleiste')
    },
    [entities, selectEntity, setBottomPanel],
  )

  /**
   * Karten, die aufgeklappt bleiben, obwohl sie zu klein dafuer geworden sind: die der
   * gerade in der Zeitleiste bearbeiteten Objekte samt aller Karten darueber. Sonst
   * verschwaende beim Herauszoomen genau die Figur, deren Weg man plant - mitsamt ihrem
   * Pin. Schliesst man die Zeitleiste oder waehlt etwas anderes, gilt wieder die
   * normale Aufdeck-Schwelle.
   */
  const keepOpenLayers = useMemo(() => {
    const ids = new Set<string>()
    if (bottomPanel !== 'zeitleiste') return ids
    const add = (start: string | undefined) => {
      let layerId = start
      // Eine innere Karte hilft nichts, wenn die Karte darueber eingeklappt ist.
      while (layerId && !ids.has(layerId)) {
        ids.add(layerId)
        layerId = campaign.layers.find((l) => l.id === layerId)?.embed?.parentLayerId
      }
    }
    for (const id of selectedIds) {
      const e = entities.find((x) => x.id === id)
      if (!e?.placement) continue
      // Alle Karten des Tagesablaufs, nicht nur die Startkarte: Fuehrt der Weg auf eine
      // andere Karte, muss auch die offen bleiben, sonst plant man auf einer Pinnadel.
      add(e.placement.layerId)
      for (const stone of e.schedule) add(stone.layerId ?? e.placement.layerId)
    }
    return ids
  }, [bottomPanel, selectedIds, entities, campaign.layers])
  // Nebel voll deckend fuer Spieler/Tisch, halbtransparent fuer den DM.
  const fogActive = layer.fogEnabled
  const fogOpacity = tableMode ? 1 : 0.45
  const showResizeHandles = mapSelected && !tableMode && !fogEditing

  return (
    <div
      ref={containerRef}
      className="map-canvas"
      data-tool={tool}
      data-placing={placingActive ? 'true' : undefined}
      data-fog={fogEditing ? 'true' : undefined}
      data-panning={panning ? 'true' : undefined}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={onDoubleClick}
    >
      <div
        className="map-world"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          width,
          height,
        }}
      >
        {layer.imageUrl && mapImage ? (
          <img
            src={mapImage}
            width={width}
            height={height}
            draggable={false}
            alt={layer.name}
            style={{ display: 'block', pointerEvents: 'none' }}
          />
        ) : layer.imageUrl && mapImage === undefined ? null : tableMode || tool === 'add' ? (
          // Waehrend des Platzierens eines neuen Objekts (tool 'add') darf dieser Bereich
          // Klicks NICHT abfangen - sonst wuerde der Klick den Datei-Dialog oeffnen statt
          // das Objekt zu platzieren. Deshalb hier bewusst kein Button, kein stopPropagation.
          <div className="map-empty" style={{ width, height }}>
            <span className="map-empty__text">
              {layer.imageUrl ? 'Kartenbild konnte nicht geladen werden.' : 'Keine Weltkarte vorhanden.'}
            </span>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="map-empty map-empty--cta"
              style={{ width, height }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => mapUploadRef.current?.click()}
            >
              <span>
                {layer.imageUrl ? 'Kartenbild konnte nicht geladen werden. Neu hochladen.' : 'Füge eine Weltkarte ein.'}
              </span>
              <svg
                className="map-empty__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="3" x2="12" y2="15" />
                <polyline points="6 9 12 3 18 9" />
                <line x1="5" y1="20" x2="19" y2="20" />
              </svg>
            </button>
            <input ref={mapUploadRef} type="file" accept="image/*" onChange={onUploadMapImage} hidden />
          </>
        )}

        {/* Nebel des Krieges: deckt unentdeckte Bereiche ab (skaliert mit der Karte). */}
        {fogActive && (
          <svg
            className="map-fog"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ opacity: fogOpacity }}
          >
            <defs>
              <mask id={`fogmask-${layer.id}`}>
                <rect x="0" y="0" width={width} height={height} fill="white" />
                {layer.reveals.map((rc, i) => (
                  <circle key={i} cx={rc.x} cy={rc.y} r={rc.r} fill="black" />
                ))}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width={width}
              height={height}
              fill="#05070c"
              mask={`url(#fogmask-${layer.id})`}
            />
          </svg>
        )}
      </div>

      {/* Tag/Nacht-Einfaerbung liegt immer ueber der Karte. */}
      <div className="map-daynight" style={{ background: dayNightOverlay(timeOfDay) }} />

      <div className="map-markers">
        {pins.map((e) => {
          const meta = entityDisplayMeta(e)
          const pos = effectivePos(e)
          return (
            <MapPin
              key={e.id}
              screenX={pos.x * view.scale + view.tx}
              screenY={pos.y * view.scale + view.ty}
              icon={meta.icon}
              // Miniatur bevorzugen; aeltere Objekte ohne sie zeigen ersatzweise das Portraet.
              imageRef={e.thumbUrl ?? e.imageUrl}
              color={meta.color}
              iconInvert={meta.iconInvert}
              emphasized={meta.emphasized}
              dead={isDead(e)}
              label={e.name}
              selected={selectedIds.includes(e.id)}
              draggable={!tableMode && !fogEditing}
              scale={view.scale}
              onClick={(ev) => {
                setMapSelected(false)
                setSelectedEmbedId(null)
                if (ev.ctrlKey || ev.metaKey || ev.shiftKey) toggleSelectedId(e.id)
                else selectEntity(e.id)
              }}
              onDoubleClick={() => openSchedule(e.id)}
              onMove={(dxWorld, dyWorld) => {
                // Ziehen eines markierten Pins bewegt die gesamte Mehrfachauswahl mit.
                if (selectedIds.length > 1 && selectedIds.includes(e.id)) {
                  selectedIds.forEach((id) => {
                    const ent = entities.find((x) => x.id === id)
                    if (ent) moveEntityTimed(ent, dxWorld, dyWorld)
                  })
                } else {
                  moveEntityTimed(e, dxWorld, dyWorld)
                }
              }}
              onDragEnd={
                selectedIds.length > 1 && selectedIds.includes(e.id)
                  ? undefined
                  : (clientX, clientY) => {
                      // Bei laufender Aufnahme wandert das Doppel, nicht das Objekt selbst.
                      if (draftPos[e.id]) dropDraft(e.id, clientX, clientY)
                      else onReparentEntity(e.id, clientX, clientY)
                    }
              }
            />
          )
        })}
      </div>

      {/* Vorgemerkte Positionen als Doppel neben dem Original. */}
      <DraftOverlay
        entities={entities}
        drafts={draftPos}
        layers={campaign.layers}
        rootLayerId={layer.id}
        view={view}
        currentDay={currentDay}
        placementOf={(e) => placementAt(e, timeOfDay, currentDay, campaign)}
        onSetTime={setDraftTime}
        onSetDay={setDraftDay}
        onMove={(id, dxWorld, dyWorld) => {
          const d = draftPos[id]
          if (d) setDraftPos(id, d.x + dxWorld, d.y + dyWorld, d.layerId)
        }}
        onDrop={dropDraft}
        onCommit={commitDraft}
        onCancel={clearDraftPos}
      />

      {/* Beim Planen in der Zeitleiste: alle Stationen des ausgewaehlten Objekts als Route. */}
      {bottomPanel === 'zeitleiste' && selectedEntity && canSchedule(selectedEntity) && (
        <ScheduleOverlay
          entity={selectedEntity}
          layers={campaign.layers}
          rootLayerId={layer.id}
          view={view}
          currentDay={currentDay}
          phaseCtx={campaign}
          timeOfDay={timeOfDay}
          onPickTime={(minutes, day) => setMoment(day ?? currentDay, minutes)}
          // Station 1 ist die Basis-Platzierung des Objekts, alle anderen sind Timestones.
          onMoveStop={(stopId, dx, dy) =>
            stopId === '__base__'
              ? moveEntity(selectedEntity.id, dx, dy)
              : moveTimestone(selectedEntity.id, stopId, dx, dy)
          }
          onEditStop={(stopId, patch) => updateTimestone(selectedEntity.id, stopId, patch)}
          onRemoveStop={(stopId) => removeTimestone(selectedEntity.id, stopId)}
        />
      )}

      {embeddedLayers.map((el) => (
        <EmbeddedMap
          key={el.id}
          embLayer={el}
          parentView={view}
          containerRef={containerRef}
          layers={campaign.layers}
          visited={[]}
          keepOpen={keepOpenLayers}
          tool={tool}
          tableMode={tableMode}
          fogEditing={fogEditing}
          timeOfDay={timeOfDay}
          entities={entities}
          selectedIds={selectedIds}
          selectedEmbedId={selectedEmbedId}
          // Einfachklick waehlt die eingebettete Karte nur aus (Eck-Griffe, und das rechte
          // Panel zeigt ihre Objekte) - ohne die Ansicht zu bewegen.
          onSelect={(id) => {
            setSelectedEmbedId(id)
            setMapSelected(false)
            selectEntity(null)
            setViewLayerId(id, false)
          }}
          // Erst der Doppelklick faehrt hin. Zoomt per viewLayerId-Effekt (der berechnet den
          // Ziel-Bildschirmbereich selbst aus der Hierarchie) statt hier zusaetzlich manuell -
          // sonst wuerde doppelt gezoomt.
          onMaximize={(id) => {
            setSelectedEmbedId(id)
            setViewLayerId(id)
          }}
          onZoomTo={(_sx, _sy, _sw, _sh, id) => setViewLayerId(id)}
          onReparent={onReparentEmbed}
          onEntityClick={(id, ev) => {
            setMapSelected(false)
            setSelectedEmbedId(null)
            if (ev.ctrlKey || ev.metaKey || ev.shiftKey) toggleSelectedId(id)
            else selectEntity(id)
          }}
          onEntityDoubleClick={openSchedule}
          onEntityMove={(id, dxSub, dySub) => {
            const ent = entities.find((x) => x.id === id)
            if (ent) moveEntityTimed(ent, dxSub, dySub)
          }}
          onEntityDragEnd={onReparentEntity}
          setEmbedRect={setEmbedRect}
        />
      ))}

      {marqueeRect && (
        <div
          className="map-marquee"
          style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
        />
      )}

      {showResizeHandles && (
        <>
          <div
            className="map-resize-outline"
            style={{ left: view.tx, top: view.ty, width: width * view.scale, height: height * view.scale }}
          />
          {(['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map((h) => (
            <div
              key={h}
              className={`map-resize-handle map-resize-handle--${h}`}
              style={{
                left: (h === 'nw' || h === 'sw' ? view.tx : view.tx + width * view.scale),
                top: (h === 'nw' || h === 'ne' ? view.ty : view.ty + height * view.scale),
              }}
              onPointerDown={startResize(h)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
            />
          ))}
        </>
      )}

      {placingActive && (
        <div className="map-banner">
          {placingLayerId
            ? 'Klicke auf die Karte, um die eingebettete Karte dort zu platzieren'
            : 'Klicke auf die Karte, um das Objekt zu platzieren'}
          <button
            className="map-banner__cancel"
            onClick={() => {
              setPlacingEntity(null)
              setPlacingLayer(null)
            }}
          >
            Abbrechen
          </button>
        </div>
      )}

      <ZoomControls
        scale={view.scale}
        onZoom={(dir) => {
          const el = containerRef.current
          if (!el) return
          const cx = el.clientWidth / 2
          const cy = el.clientHeight / 2
          setView((v) => {
            const newScale = clamp(v.scale * (dir > 0 ? 1.25 : 0.8), MIN_SCALE, MAX_SCALE)
            const k = newScale / v.scale
            return { scale: newScale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }
          })
        }}
        onFit={() => fitToView()}
      />
    </div>
  )
}

/**
 * Vorgemerkte Stationen: Waehrend man einen Tagesablauf aufzeichnet, wandert nicht der Pin
 * selbst, sondern ein Doppel von ihm. Eine gestrichelte Linie verbindet beide, damit
 * erkennbar bleibt, wozu das Doppel gehoert und dass es noch nicht festgehalten ist.
 *
 * Daran haengt die Uhrzeit-Wahl: Der Ort steht fest, sobald man die Figur losgelassen hat -
 * "ab wann?" ist die einzige offene Frage und wird deshalb hier beantwortet, nicht in der
 * unteren Leiste.
 */
function DraftOverlay({
  entities,
  drafts,
  layers,
  rootLayerId,
  view,
  currentDay,
  placementOf,
  onSetTime,
  onSetDay,
  onMove,
  onDrop,
  onCommit,
  onCancel,
}: {
  entities: Entity[]
  drafts: Record<string, DraftPos>
  layers: MapLayer[]
  rootLayerId: string
  view: View
  currentDay: number
  placementOf: (e: Entity) => { layerId: string; x: number; y: number } | null
  onSetTime: (entityId: string, minutes: number) => void
  onSetDay: (entityId: string, day: number | null) => void
  /** Doppel weiterschieben (Delta in Weltkoordinaten seiner Karte). */
  onMove: (entityId: string, dxWorld: number, dyWorld: number) => void
  /** Doppel loslassen: Kartenwechsel und Einrasten. */
  onDrop: (entityId: string, clientX: number, clientY: number) => void
  /** Vormerkung als Timestone festhalten. */
  onCommit: (entityId: string) => void
  /** Vormerkung dieses Objekts verwerfen. */
  onCancel: (entityId: string) => void
}) {
  /** Fuer welches Objekt der Kalender gerade offen ist (immer hoechstens einer). */
  const [dayPickerFor, setDayPickerFor] = useState<string | null>(null)
  const items = entities.filter((e) => e.placement && drafts[e.id])
  if (items.length === 0) return null

  return (
    <div className="draft-overlay">
      {items.map((e) => {
        const meta = entityDisplayMeta(e)
        const origin = placementOf(e)
        const draft = drafts[e.id]
        if (!origin) return null
        // Beide Enden der Linie koennen auf verschiedenen Karten liegen - merkt man eine
        // Stelle auf einer anderen Karte vor, hat jedes Ende seine eigene Umrechnung.
        const ov = layerScreenView(layers, rootLayerId, origin.layerId, view)
        const dv = layerScreenView(layers, rootLayerId, draft.layerId, view)
        if (!ov || !dv) return null
        const from = { x: origin.x * ov.scale + ov.tx, y: origin.y * ov.scale + ov.ty }
        const to = { x: draft.x * dv.scale + dv.tx, y: draft.y * dv.scale + dv.ty }
        return (
          <div key={e.id} style={{ ['--chip-color' as string]: meta.color }}>
            <svg className="draft-overlay__link">
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            </svg>
            <MapPin
              screenX={to.x}
              screenY={to.y}
              icon={meta.icon}
              imageRef={e.thumbUrl ?? e.imageUrl}
              color={meta.color}
              iconInvert={meta.iconInvert}
              emphasized={meta.emphasized}
              dead={isDead(e)}
              label={e.name}
              selected={false}
              // Auch nach dem ersten Absetzen noch zu greifen: Die Stelle steht ja erst
              // fest, wenn man sie bestaetigt - bis dahin soll sie sich nachjustieren
              // lassen, ohne die Figur erneut ueber die halbe Karte zu ziehen.
              draggable
              // Massstab der Karte, auf der das Doppel liegt - nicht der der Wurzelkarte.
              // Sonst liefe es auf einer eingebetteten Karte zu schnell mit.
              scale={dv.scale}
              ghost
              onClick={() => {}}
              onMove={(dxWorld, dyWorld) => onMove(e.id, dxWorld, dyWorld)}
              onDragEnd={(clientX, clientY) => onDrop(e.id, clientX, clientY)}
            />
            {/* Sitzt unter dem Doppel, wo weder Pin noch Name im Weg sind. */}
            <div
              className="draft-ask"
              style={{ left: to.x, top: to.y }}
              // Sonst zieht der Kartenhintergrund darunter eine Rechteck-Markierung auf,
              // sobald man ins Feld fasst.
              onPointerDown={(ev) => ev.stopPropagation()}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') onCommit(e.id)
                if (ev.key === 'Escape') onCancel(e.id)
              }}
            >
              <span className="draft-ask__label">ab</span>
              <input
                className="draft-ask__time"
                type="time"
                value={formatTime(draft.time)}
                autoFocus
                onChange={(ev) => {
                  const minutes = parseTime(ev.target.value)
                  if (minutes != null) onSetTime(e.id, minutes)
                }}
              />
              <button
                className="draft-ask__day"
                title="Kalendertag waehlen"
                onClick={() => setDayPickerFor(dayPickerFor === e.id ? null : e.id)}
              >
                {draft.day == null ? 'Jeden Tag' : `Tag ${draft.day}`}
              </button>
              <button className="draft-ask__ok" title="Timestone setzen" onClick={() => onCommit(e.id)}>
                ✓
              </button>
              <button className="draft-ask__cancel" title="Verwerfen" onClick={() => onCancel(e.id)}>
                ×
              </button>

              {dayPickerFor === e.id && (
                <DayPicker
                  value={draft.day}
                  today={currentDay}
                  onPick={(day) => {
                    onSetDay(e.id, day)
                    setDayPickerFor(null)
                  }}
                  onClose={() => setDayPickerFor(null)}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Route eines Objekts ueber den Tag: alle heute geltenden Zeitfenster als nummerierte
 * Stationen mit Verbindungslinie. Rein zur Orientierung beim Planen in der Zeitleiste -
 * nimmt keine Klicks entgegen, damit Karte und Pins normal bedienbar bleiben.
 */
function ScheduleOverlay({
  entity,
  layers,
  rootLayerId,
  view,
  currentDay,
  phaseCtx,
  timeOfDay,
  onPickTime,
  onMoveStop,
  onEditStop,
  onRemoveStop,
}: {
  entity: Entity
  layers: MapLayer[]
  rootLayerId: string
  view: View
  currentDay: number
  phaseCtx: PhaseContext
  timeOfDay: number
  /** Klick auf eine Station stellt die Zeitleiste auf deren Uhrzeit - und Tag, wenn sie einen hat. */
  onPickTime: (minutes: number, day: number | null) => void
  /** Ziehen an einer Station verschiebt sie auf der Karte (Delta in Weltkoordinaten). */
  onMoveStop: (stopId: string, dxWorld: number, dyWorld: number) => void
  /** Uhrzeit oder Kalendertag einer Station nachtraeglich aendern. */
  onEditStop: (stopId: string, patch: { time?: number; day?: number | null }) => void
  /** Station loeschen. */
  onRemoveStop: (stopId: string) => void
}) {
  // Ziehen wird vom Klicken per Schwelle getrennt, wie bei den Pinnadeln auch. Die
  // Umrechnung in Weltkoordinaten haengt an der Ebene, deren Massstab beim Griff
  // festgehalten wird.
  const drag = useRef<{
    id: string
    time: number
    /** Kalendertag der Station; null = gilt jeden Tag. */
    day: number | null
    lastX: number
    lastY: number
    moved: boolean
    scale: number
  } | null>(null)

  // Immer die aktuellen Rueckrufe, ohne die Fenster-Listener neu anzulegen.
  const moveRef = useRef(onMoveStop)
  moveRef.current = onMoveStop
  const pickRef = useRef(onPickTime)
  pickRef.current = onPickTime
  /**
   * Sucht zu einer gezogenen Station die, an der sie einrasten wuerde, und liefert deren
   * Id. Mit apply = true wird zugleich eingerastet.
   */
  const snapRef = useRef<(stopId: string, apply?: boolean) => string | null>(() => null)
  /** Welche Station gerade wohin andocken wuerde - nur fuer die Anzeige waehrend des Zugs. */
  const [snap, setSnap] = useState<{ fromId: string; toId: string } | null>(null)
  /**
   * Station, deren Uhrzeit und Tag gerade bearbeitet werden. Ein Klick oeffnet die Felder
   * an Ort und Stelle - dieselben wie beim Anlegen, nur dass hier sofort gilt, was man
   * eintraegt.
   */
  const [editId, setEditId] = useState<string | null>(null)
  const [dayPickerOpen, setDayPickerOpen] = useState(false)

  // Klick daneben oder Escape schliesst die Felder wieder. Ein Klick auf eine andere
  // Station laesst sie offen - dort uebernimmt gleich der Zeiger-Rueckruf und schaltet um.
  useEffect(() => {
    if (!editId) return
    function close() {
      setEditId(null)
      setDayPickerOpen(false)
    }
    function onDown(e: PointerEvent) {
      if ((e.target as HTMLElement | null)?.closest('.schedule-stop')) return
      close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [editId])

  /**
   * Bewegung und Loslassen haengen am Fenster, nicht am angeklickten Knopf: Beim
   * Verschieben aendert sich die Position und damit die Gruppierung der Stationen, sodass
   * React den Knopf ersetzen kann. Eine Zeigererfassung auf ihm ginge dabei verloren - das
   * Ziehen bricht dann mitten in der Bewegung ab.
   */
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.lastX
      const dy = e.clientY - d.lastY
      if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true
      if (!d.moved) return
      d.lastX = e.clientX
      d.lastY = e.clientY
      moveRef.current(d.id, dx / d.scale, dy / d.scale)
      // Schon waehrend des Zugs zeigen, wo eingerastet wuerde.
      const toId = snapRef.current(d.id)
      setSnap(toId ? { fromId: d.id, toId } : null)
    }
    function onUp() {
      const d = drag.current
      drag.current = null
      setSnap(null)
      if (!d) return
      if (d.moved) {
        snapRef.current(d.id, true)
        return
      }
      // Ohne Bewegung war es ein Klick: Uhr auf diese Station stellen und ihre Felder
      // aufschlagen. Bei einer Station eines anderen Tages springt der Kalender mit - sonst
      // bliebe sie blass, obwohl man gerade zu ihr wollte.
      pickRef.current(d.time, d.day)
      if (d.id !== '__base__') {
        setEditId((cur) => (cur === d.id ? null : d.id))
        setDayPickerOpen(false)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  if (!entity.placement) return null

  // Der Tagesablauf des laufenden Tages und dazu alle Kalendertermine - auch die anderer
  // Tage. Eine Reise ueber mehrere Tage ist ein zusammenhaengender Weg; zeigte die Route nur
  // den sichtbaren Tag, waere sie unterwegs leer, obwohl die Figur genau dann unterwegs ist.
  // Die Beschriftung nennt bei diesen Punkten ohnehin den Tag.
  // Nur die Punkte der laufenden Phase: Was in einem frueheren Kapitel eingetragen wurde,
  // gehoert nicht auf diese Karte.
  const own = scheduleOfPhase(entity.schedule, currentDay, phaseCtx)
  const keys = [...own.filter((s) => s.day == null), ...own.filter((s) => s.day != null)].sort(
    (a, b) => (a.day ?? currentDay) - (b.day ?? currentDay) || a.time - b.time,
  )
  if (keys.length === 0) return null

  // Der Tag beginnt an der Basis-Platzierung - sie ist Station 1, auch wenn sie nicht in
  // den Daten steht. Nur wenn dort schon ein echter Punkt liegt, gilt dieser als erster.
  const base = {
    id: '__base__',
    time: 0,
    layerId: entity.placement.layerId,
    x: entity.placement.x,
    y: entity.placement.y,
    label: '',
    day: null,
  }
  // Jede Station kennt ihre eigene Karte: Ein Weg darf ueber mehrere Karten fuehren, und
  // die Koordinaten einer Station gelten nur auf ihrer.
  const stops = (keys.some((k) => k.time === 0) ? keys : [base, ...keys]).map((s) => ({
    ...s,
    layerId: s.layerId ?? entity.placement!.layerId,
  }))

  const meta = entityDisplayMeta(entity)
  const active = activeTimestone(entity.schedule, timeOfDay, currentDay, phaseCtx)

  /**
   * Welche Stationen gelten am sichtbaren Tag? Nur sie bilden den Weg: volle Farbe,
   * fortlaufende Nummer, verbunden durch die gestrichelte Linie. Alle anderen - etwa eine
   * Ausnahme, die erst an Tag 3 greift - bleiben blass daneben stehen, damit man sie findet,
   * ohne dass sie einen Weg vortaeuschen, den die Figur heute gar nicht geht.
   *
   * Geprueft wird an den Uhrzeiten, an denen heute ueberhaupt ein Wechsel moeglich ist.
   */
  const activeIds = new Set<string>()
  {
    const marks = new Set<number>([0])
    for (const s of scheduleForDay(entity.schedule, currentDay, phaseCtx)) marks.add(s.time)
    for (const t of marks) {
      activeIds.add(activeTimestone(entity.schedule, t, currentDay)?.id ?? '__base__')
    }
  }
  // Ist die Figur heute unterwegs, gehoert die ganze Kette dazu - auch die Stationen, die
  // erst in den naechsten Tagen kommen. Der Tagesablauf ruht ohnehin bis zur letzten von
  // ihnen (siehe activeTimestone), sie sind also wirklich ihr weiterer Weg.
  const travelling = stops.some((s) => s.day != null && activeIds.has(s.id))
  const applies = (s: (typeof stops)[number]) => activeIds.has(s.id) || (travelling && s.day != null)

  // Jede Station mit der Umrechnung ihrer eigenen Karte auf den Bildschirm. Die Nummer laeuft
  // nur ueber die geltenden Stationen und stammt aus der vollen Reihenfolge - sie stimmt also
  // auch, wenn eine Karte gerade nicht gezeichnet wird und ihre Station wegfaellt.
  let no = 0
  const placed = stops
    .map((s) => {
      const on = applies(s)
      if (on) no += 1
      const sv = layerScreenView(layers, rootLayerId, s.layerId, view)
      return sv
        ? {
            stop: s,
            no: on ? no : null,
            on,
            x: s.x * sv.scale + sv.tx,
            y: s.y * sv.scale + sv.ty,
            scale: sv.scale,
          }
        : null
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  // Mehrere Stationen koennen auf derselben Stelle liegen - etwa jedes Mal, wenn die Figur
  // zur Startposition zurueckkehrt. Sie werden zu einer Marke zusammengefasst: Nummern
  // nebeneinander in ihrer Reihenfolge, die Uhrzeiten gesammelt darunter. Einzeln
  // gezeichnet laegen sie exakt uebereinander. Dieselbe Stelle auf verschiedenen Karten
  // gehoert dabei nicht zusammen, daher steht die Karte mit im Schluessel.
  const marks = new Map<
    string,
    {
      left: number
      top: number
      items: { stop: (typeof stops)[number]; no: number | null; on: boolean; scale: number }[]
    }
  >()
  for (const p of placed) {
    const key = `${p.stop.layerId}:${Math.round(p.stop.x)}:${Math.round(p.stop.y)}`
    const mark = marks.get(key) ?? { left: p.x, top: p.y, items: [] }
    mark.items.push({ stop: p.stop, no: p.no, on: p.on, scale: p.scale })
    marks.set(key, mark)
  }

  /** Ziehen an Nummer oder Uhrzeit verschiebt den Timestone; ein Klick stellt die Zeit. */
  function onStopDown(
    e: React.PointerEvent,
    stopId: string,
    time: number,
    scale: number,
    day: number | null,
  ) {
    if (e.button !== 0) return
    // Sonst zieht der Kartenhintergrund darunter eine Rechteck-Markierung auf.
    e.stopPropagation()
    e.preventDefault()
    drag.current = { id: stopId, time, day, lastX: e.clientX, lastY: e.clientY, moved: false, scale }
  }

  /**
   * Nach dem Loslassen an einer nahen Station einrasten: Die gezogene uebernimmt deren
   * Position exakt, sodass beide zu einer Marke zusammenfallen - Nummern nebeneinander,
   * Uhrzeiten untereinander. Von Hand liesse sich die Stelle sonst nie genau genug
   * treffen, und schon ein Pixel Abstand ergaebe zwei ueberlappende Marken.
   *
   * Nur Stationen auf derselben Karte kommen infrage: Ein Versatz zwischen zwei Karten
   * waere keine Verschiebung, sondern ein Kartenwechsel - der laeuft ueber das Ziehen der
   * Pinnadel selbst.
   */
  snapRef.current = (stopId: string, apply = false) => {
    const dragged = placed.find((p) => p.stop.id === stopId)
    if (!dragged) return null
    for (const p of placed) {
      if (p.stop.id === stopId || p.stop.layerId !== dragged.stop.layerId) continue
      const dx = p.stop.x - dragged.stop.x
      const dy = p.stop.y - dragged.stop.y
      // Bereits deckungsgleich? Dann gehoeren sie schon zusammen, nichts zu melden.
      if (dx === 0 && dy === 0) continue
      if (Math.hypot(dx * dragged.scale, dy * dragged.scale) <= STOP_SNAP_PX) {
        if (apply) onMoveStop(stopId, dx, dy)
        return p.stop.id
      }
    }
    return null
  }

  return (
    <div className="schedule-overlay" style={{ ['--chip-color' as string]: meta.color }}>
      {/* Die Linie verbindet nur, was heute wirklich zum Weg gehoert. Punkte anderer Tage
          bleiben unverbunden stehen - eine Linie dorthin wuerde einen Weg behaupten, den die
          Figur an diesem Tag gar nicht geht. */}
      {placed.filter((p) => p.on).length > 1 && (
        <svg className="schedule-overlay__lines">
          <polyline
            points={placed
              .filter((p) => p.on)
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
          />
        </svg>
      )}
      {[...marks.entries()].map(([key, mark]) => (
        <div
          key={key}
          // Die Station, an der gerade bearbeitet wird, nach vorn: Sonst uebermalten spaeter
          // gezeichnete Nachbarstationen ihre Felder (jede Station hat durch ihr transform
          // einen eigenen Stapelkontext, es zaehlt also die Reihenfolge im DOM).
          className={`schedule-stop${mark.items.some((i) => i.stop.id === editId) ? ' is-editing' : ''}`}
          style={{ left: mark.left, top: mark.top }}
          // Zwei schnelle Klicks auf eine Station sind kein Doppelklick auf die Karte
          // darunter - sonst passt sich die Ansicht ungewollt ein.
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="schedule-stop__dots">
            {mark.items.map(({ stop: s, no, on, scale }) => (
              <button
                key={s.id}
                className={`schedule-stop__dot${
                  s.id === active?.id || (s.id === '__base__' && !active) ? ' is-now' : ''
                }${s.id === snap?.toId ? ' is-snap-target' : ''}${
                  s.id === snap?.fromId ? ' is-snapping' : ''
                }${s.day != null ? ' is-exception' : ''}${
                  s.id === '__base__' ? ' is-base' : ''
                }${on ? '' : ' is-idle'}`}
                title={
                  on
                    ? `Ziehen verschiebt · Klick stellt die Zeitleiste auf ${formatTime(s.time)}`
                    : `Gilt an Tag ${s.day} · Klick springt dorthin`
                }
                onPointerDown={(e) => onStopDown(e, s.id, s.time, scale, s.day)}
              >
                {no}
              </button>
            ))}
          </div>

          {/* Je Station eine eigene Zeile: So laesst sich auch die Uhrzeit anfassen, und
              bei mehreren Stationen an einer Stelle bleiben sie auseinanderzuhalten. */}
          <div className="schedule-stop__labels">
            {mark.items.map(({ stop: s, on, scale }) => {
              // "Start" steht nur an Station 1, der eigentlichen Startposition. Spaetere
              // Timestones, die dorthin zurueckfuehren, zeigen ihre Uhrzeit - dass sie
              // wieder am Start stehen, sagt schon ihre Lage auf derselben Marke.
              const caption = s.id === '__base__' ? '' : s.label
              return (
                <button
                  key={s.id}
                  className={`schedule-stop__label${on ? '' : ' is-idle'}`}
                  title={
                    on
                      ? `Ziehen verschiebt · Klick stellt die Zeitleiste auf ${formatTime(s.time)}`
                      : `Gilt an Tag ${s.day} · Klick springt dorthin`
                  }
                  onPointerDown={(e) => onStopDown(e, s.id, s.time, scale, s.day)}
                >
                  {/* Der Kalendertag steht vor der Uhrzeit. Punkte ohne eigenen Tag gehoeren
                      zum wiederkehrenden Ablauf und zeigen nur die Uhrzeit - das
                      Fehlen der Angabe ist hier die Aussage. */}
                  {s.day != null && <span className="schedule-stop__day">Tag {s.day}</span>}
                  {s.id === '__base__' ? 'Start' : formatTime(s.time)}
                  {caption ? ` · ${caption}` : ''}
                </button>
              )
            })}
          </div>

          {/* Nachtraeglich bearbeiten: dieselben Felder wie beim Anlegen, an derselben
              Stelle. Was hier steht, gilt sofort - es gibt nichts zu bestaetigen, der
              Punkt existiert ja schon. */}
          {mark.items.map(({ stop: s }) =>
            s.id !== editId ? null : (
              <div
                key={`edit-${s.id}`}
                className="draft-ask schedule-stop__edit"
                // Sonst zieht der Kartenhintergrund darunter eine Rechteck-Markierung auf.
                onPointerDown={(ev) => ev.stopPropagation()}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') setEditId(null)
                }}
              >
                <span className="draft-ask__label">ab</span>
                <input
                  className="draft-ask__time"
                  type="time"
                  value={formatTime(s.time)}
                  onChange={(ev) => {
                    const minutes = parseTime(ev.target.value)
                    if (minutes != null) onEditStop(s.id, { time: minutes })
                  }}
                />
                <button
                  className="draft-ask__day"
                  title="Kalendertag waehlen"
                  onClick={() => setDayPickerOpen((o) => !o)}
                >
                  {s.day == null ? 'Jeden Tag' : `Tag ${s.day}`}
                </button>
                <button
                  className="draft-ask__remove"
                  title="Timestone entfernen"
                  onClick={() => {
                    onRemoveStop(s.id)
                    setEditId(null)
                    setDayPickerOpen(false)
                  }}
                >
                  ✕
                </button>

                {dayPickerOpen && (
                  <DayPicker
                    value={s.day}
                    today={currentDay}
                    onPick={(day) => {
                      onEditStop(s.id, { day })
                      setDayPickerOpen(false)
                    }}
                    onClose={() => setDayPickerOpen(false)}
                  />
                )}
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  )
}

function ZoomControls({ scale, onZoom, onFit }: { scale: number; onZoom: (dir: number) => void; onFit: () => void }) {
  // Faehrt mit der unteren Leiste hoch, genau wie die schwebende Panel-Leiste.
  const { bottom, snap } = useBottomPanelOffset(14)

  // stopPropagation: sonst faengt das darunterliegende Karten-Pointerdown (Verschieben/
  // Rechteck-Markierung) den Klick ab, bevor er die Buttons erreicht.
  return (
    <div
      className={`zoom-controls${snap ? ' is-snap' : ''}`}
      style={{ bottom }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button title="Hineinzoomen" onClick={() => onZoom(1)}>+</button>
      <span className="zoom-level">{Math.round(scale * 100)}%</span>
      <button title="Herauszoomen" onClick={() => onZoom(-1)}>&minus;</button>
      <button title="Einpassen" onClick={onFit}>&#9633;</button>
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/**
 * Bildschirm-Rechteck einer (beliebig tief verschachtelten) Karte innerhalb der Wurzelkarte,
 * rein aus den Hierarchie-Daten berechnet - unabhaengig davon, ob sie im aktuellen View
 * gerade aufgedeckt/gerendert ist. Liefert null, wenn targetLayerId keine (verschachtelte)
 * Unterkarte von rootLayerId ist (z.B. eine andere, nicht verbundene Wurzelkarte).
 */
function computeLayerScreenRect(
  layers: MapLayer[],
  rootLayerId: string,
  targetLayerId: string,
  rootView: View,
): { x: number; y: number; w: number; h: number } | null {
  const chain: MapLayer[] = []
  let current = layers.find((l) => l.id === targetLayerId)
  while (current && current.id !== rootLayerId) {
    if (!current.embed) return null
    chain.unshift(current)
    current = layers.find((l) => l.id === current!.embed!.parentLayerId)
  }
  if (!current) return null
  let v = rootView
  let rect: { x: number; y: number; w: number; h: number } | null = null
  for (const l of chain) {
    const embed = l.embed!
    const x = embed.x * v.scale + v.tx
    const y = embed.y * v.scale + v.ty
    const w = embed.width * v.scale
    const h = embed.height * v.scale
    rect = { x, y, w, h }
    v = { scale: w / l.width, tx: x, ty: y }
  }
  return rect
}

/**
 * Transformation von den Weltkoordinaten einer (beliebig tief verschachtelten) Ebene auf
 * den Bildschirm. Damit lassen sich Punkte einer Unterkarte einzeichnen, ohne die aktive
 * Ebene zu wechseln. null, wenn die Ebene nicht unter rootLayerId haengt.
 */
function layerScreenView(
  layers: MapLayer[],
  rootLayerId: string,
  targetLayerId: string,
  rootView: View,
): View | null {
  if (targetLayerId === rootLayerId) return rootView
  const target = layers.find((l) => l.id === targetLayerId)
  const rect = computeLayerScreenRect(layers, rootLayerId, targetLayerId, rootView)
  if (!target || !rect) return null
  return { scale: rect.w / target.width, tx: rect.x, ty: rect.y }
}

/**
 * Bildschirm-Massstab (Pixel pro Welteinheit) einer (beliebig tief verschachtelten) Karte
 * innerhalb der Wurzelkarte, rein aus den Hierarchie-Daten berechnet. null, wenn
 * targetLayerId keine (verschachtelte) Unterkarte von rootLayerId ist.
 */
function computeLayerEffScale(
  layers: MapLayer[],
  rootLayerId: string,
  targetLayerId: string,
  rootScale: number,
): number | null {
  if (targetLayerId === rootLayerId) return rootScale
  const chain: MapLayer[] = []
  let current = layers.find((l) => l.id === targetLayerId)
  while (current && current.id !== rootLayerId) {
    if (!current.embed) return null
    chain.unshift(current)
    current = layers.find((l) => l.id === current!.embed!.parentLayerId)
  }
  if (!current) return null
  let scale = rootScale
  for (const l of chain) scale *= l.embed!.width / l.width
  return scale
}

/**
 * Findet die am tiefsten verschachtelte, aktuell aufgedeckte eingebettete Karte an einem
 * Weltpunkt (rekursiv durch beliebig viele Ebenen). effScale ist der Bildschirm-Massstab
 * der Startebene (Pixel pro Welteinheit dieser Ebene, i.d.R. view.scale der Wurzelebene).
 * Liefert die Zielebene, den Punkt in deren eigenen Weltkoordinaten sowie effScale der
 * Zielebene. exclude ueberspringt bestimmte Ebenen (z.B. beim Verschieben einer Einbettung
 * per Drag&Drop: sich selbst und die eigenen Unterkarten, sonst waeren Zyklen moeglich).
 */
function resolveDeepTarget(
  layers: MapLayer[],
  parentLayerId: string,
  wx: number,
  wy: number,
  effScale: number,
  exclude?: Set<string>,
): { layerId: string; x: number; y: number; effScale: number } {
  for (const child of layers) {
    if (exclude?.has(child.id)) continue
    const embed = child.embed
    if (!embed || embed.parentLayerId !== parentLayerId) continue
    if (wx < embed.x || wx > embed.x + embed.width || wy < embed.y || wy > embed.y + embed.height) continue
    if (Math.min(embed.width, embed.height) * effScale < REVEAL_THRESHOLD) continue
    const subX = ((wx - embed.x) / embed.width) * child.width
    const subY = ((wy - embed.y) / embed.height) * child.height
    const childEffScale = effScale * (embed.width / child.width)
    return resolveDeepTarget(layers, child.id, subX, subY, childEffScale, exclude)
  }
  return { layerId: parentLayerId, x: wx, y: wy, effScale }
}

/** id sowie alle (beliebig tief) verschachtelten Unterkarten von id. */
function collectWithDescendants(layers: MapLayer[], id: string): Set<string> {
  const set = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const l of layers) {
      if (!set.has(l.id) && l.embed && set.has(l.embed.parentLayerId)) {
        set.add(l.id)
        changed = true
      }
    }
  }
  return set
}

type EmbedResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

/**
 * Eine auf einer anderen Ebene eingebettete Karte. Unterhalb der Aufdeck-Schwelle
 * nur eine Pinnadel mit Kartensymbol; darueber Bild + eigene Pins, verschiebbar
 * per Ziehen und per Eck-Ziehpunkten skalierbar.
 */
function EmbeddedMap({
  embLayer,
  parentView,
  containerRef,
  layers,
  visited,
  keepOpen,
  tool,
  tableMode,
  fogEditing,
  timeOfDay,
  entities,
  selectedIds,
  selectedEmbedId,
  onSelect,
  onMaximize,
  onZoomTo,
  onReparent,
  onEntityClick,
  onEntityDoubleClick,
  onEntityMove,
  onEntityDragEnd,
  setEmbedRect,
}: {
  embLayer: MapLayer
  /** Bildschirm-Transformation der Eltern-Ebene (Weltkoordinaten der Eltern-Ebene -> Bildschirm). */
  parentView: View
  containerRef: React.RefObject<HTMLDivElement>
  layers: MapLayer[]
  /** IDs aller Eltern-Ebenen auf dem Weg von der Wurzel hierher (Zyklenschutz). */
  visited: string[]
  /** Karten, die trotz geringer Groesse aufgeklappt bleiben (siehe keepOpenLayers). */
  keepOpen: Set<string>
  tool: string
  tableMode: boolean
  fogEditing: boolean
  timeOfDay: number
  entities: Entity[]
  selectedIds: string[]
  selectedEmbedId: string | null
  /** Einfachklick auf die ausgeklappte Karte: nur auswaehlen, Ansicht bleibt stehen. */
  onSelect: (id: string) => void
  /** Doppelklick auf die ausgeklappte Karte: hinfahren und formatfuellend zeigen. */
  onMaximize: (id: string) => void
  /** Klick auf die eingeklappte Kartenpinnadel: direkt hinfahren. */
  onZoomTo: (sx: number, sy: number, sw: number, sh: number, id: string) => void
  /** Nach dem Ziehen: prueft, ob die Karte auf eine andere (Vorfahren-)Karte umgehaengt werden soll. */
  onReparent: (draggedId: string, clientX: number, clientY: number) => void
  onEntityClick: (id: string, ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void
  /** Doppelklick auf ein Objekt (oeffnet seinen Tagesablauf). */
  onEntityDoubleClick: (id: string) => void
  onEntityMove: (id: string, dxSub: number, dySub: number) => void
  /** Nach dem Ziehen eines Objekt-Pins: prueft, ob es auf eine andere Karte gehoert. */
  onEntityDragEnd: (id: string, clientX: number, clientY: number) => void
  setEmbedRect: (id: string, x: number, y: number, width: number, height: number) => void
}) {
  const image = useAsset(embLayer.imageUrl)
  // Direkt aus dem Store, statt durch die (beliebig tiefe) Rekursion gereicht zu werden.
  const currentDay = useStore((s) => s.currentDay)
  const campaign = useStore((s) => s.activeCampaign())
  const embed = embLayer.embed!
  const selected = selectedEmbedId === embLayer.id
  const x = embed.x * parentView.scale + parentView.tx
  const y = embed.y * parentView.scale + parentView.ty
  const w = embed.width * parentView.scale
  const h = embed.height * parentView.scale
  // Waehrend eines aktiven Ziehens am Eck-Griff bleibt die Karte immer "aufgedeckt", auch
  // wenn sie unter die Aufdeck-Schwelle schrumpft. Sonst wuerden Bild und Eck-Griffe mitten
  // im Ziehen aus dem DOM verschwinden (Wechsel auf die Pinnadel-Darstellung), die
  // Zeigererfassung ginge stillschweigend verloren (kein pointerup mehr) und der naechste
  // Hover ueber eine neu gemountete Ecke wuerde faelschlich mit dem alten resizeRef weiterziehen.
  const [isResizing, setIsResizing] = useState(false)
  const revealed = isResizing || keepOpen.has(embLayer.id) || Math.min(w, h) >= REVEAL_THRESHOLD
  const interactive = !tableMode && !fogEditing

  // Bildschirm- zu Weltkoordinaten der Eltern-Ebene, zum Ziehen der Eck-Griffe.
  function toParentWorld(clientX: number, clientY: number) {
    const el = containerRef.current!
    const rect = el.getBoundingClientRect()
    return {
      wx: (clientX - rect.left - parentView.tx) / parentView.scale,
      wy: (clientY - rect.top - parentView.ty) / parentView.scale,
    }
  }

  const dragRef = useRef<{ startX: number; startY: number; startEx: number; startEy: number; moved: boolean } | null>(null)

  function onBgPointerDown(e: React.PointerEvent) {
    if (!interactive || tool === 'add' || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, startEx: embed.x, startEy: embed.y, moved: false }
  }
  function onBgPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    e.stopPropagation()
    const dx = (e.clientX - d.startX) / parentView.scale
    const dy = (e.clientY - d.startY) / parentView.scale
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) d.moved = true
    if (d.moved) setEmbedRect(embLayer.id, d.startEx + dx, d.startEy + dy, embed.width, embed.height)
  }
  function onBgPointerUp(e: React.PointerEvent) {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    e.stopPropagation()
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
    if (!d.moved) onSelect(embLayer.id)
    else onReparent(embLayer.id, e.clientX, e.clientY)
  }

  const resizeRef = useRef<{
    x0: number
    y0: number
    w0: number
    h0: number
    anchorX: number
    anchorY: number
    isLeft: boolean
    isTop: boolean
  } | null>(null)

  function startEmbResize(handle: EmbedResizeHandle) {
    return (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      const isLeft = handle === 'ne' || handle === 'se'
      const isTop = handle === 'sw' || handle === 'se'
      resizeRef.current = {
        x0: embed.x,
        y0: embed.y,
        w0: embed.width,
        h0: embed.height,
        anchorX: isLeft ? embed.x : embed.x + embed.width,
        anchorY: isTop ? embed.y : embed.y + embed.height,
        isLeft,
        isTop,
      }
      setIsResizing(true)
    }
  }
  function onEmbResizeMove(e: React.PointerEvent) {
    e.stopPropagation()
    const r = resizeRef.current
    if (!r) return
    const { wx, wy } = toParentWorld(e.clientX, e.clientY)
    const rawW = Math.abs(wx - r.anchorX)
    const rawH = Math.abs(wy - r.anchorY)
    let scale = (rawW / r.w0 + rawH / r.h0) / 2
    const minScale = MIN_EMBED_SIZE / Math.min(r.w0, r.h0)
    scale = Math.max(scale, minScale)
    const newW = r.w0 * scale
    const newH = r.h0 * scale
    const newX = r.isLeft ? r.anchorX : r.anchorX - newW
    const newY = r.isTop ? r.anchorY : r.anchorY - newH
    setEmbedRect(embLayer.id, newX, newY, newW, newH)
  }
  // Auch bei verlorener Zeigererfassung (z.B. Browser-Geste, Tab-Wechsel) oder
  // pointercancel sauber aufraeumen - nicht nur beim regulaeren pointerup.
  function onEmbResizeUp(e: React.PointerEvent) {
    e.stopPropagation()
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
    resizeRef.current = null
    setIsResizing(false)
  }

  if (!revealed) {
    return (
      <MapPin
        screenX={x + w / 2}
        screenY={y + h / 2}
        icon="🗺"
        color="#c9a227"
        label={embLayer.name}
        selected={false}
        draggable={interactive && tool !== 'add'}
        scale={parentView.scale}
        isMapLink
        onClick={() => onZoomTo(x, y, w, h, embLayer.id)}
        onMove={(dxWorld, dyWorld) => setEmbedRect(embLayer.id, embed.x + dxWorld, embed.y + dyWorld, embed.width, embed.height)}
        onDragEnd={(clientX, clientY) => onReparent(embLayer.id, clientX, clientY)}
      />
    )
  }

  // Eigene Bildschirm-Transformation dieser Ebene (Weltkoordinaten dieser Ebene -> Bildschirm).
  // Damit funktionieren ihre Pins und weitere, in ihr eingebettete Karten genauso wie auf
  // der Wurzelebene - rekursiv, beliebig tief, ohne die aktive Ebene zu wechseln.
  const childView: View = { scale: w / embLayer.width, tx: x, ty: y }

  // Wie auf der Wurzelebene: Es zaehlt die Karte, auf der das Objekt gerade steht.
  const embPins = entities.filter(
    (e) =>
      placementAt(e, timeOfDay, currentDay, campaign)?.layerId === embLayer.id &&
      (!tableMode || e.visibility === 'spieler'),
  )
  const nestedEmbeds = layers.filter(
    (l) => l.embed && l.embed.parentLayerId === embLayer.id && !visited.includes(l.id),
  )

  function embEffectivePos(e: Entity): { x: number; y: number } {
    const p = placementAt(e, timeOfDay, currentDay, campaign)
    return p ? { x: p.x, y: p.y } : { x: e.placement!.x, y: e.placement!.y }
  }

  return (
    <>
      <div
        className="embedded-map"
        style={{ left: x, top: y, width: w, height: h }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
        onPointerCancel={onBgPointerUp}
        onLostPointerCapture={onBgPointerUp}
        onDoubleClick={(e) => {
          if (!interactive) return
          e.stopPropagation()
          onMaximize(embLayer.id)
        }}
      >
        {embLayer.imageUrl && image ? (
          <img src={image} draggable={false} alt={embLayer.name} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill' }} />
        ) : embLayer.imageUrl && image === undefined ? null : (
          <div className="embedded-map__placeholder">
            <PlaceholderMap width={Math.max(1, Math.round(w))} height={Math.max(1, Math.round(h))} />
          </div>
        )}
        <div className="embedded-map__label">{embLayer.name}</div>
      </div>

      {embPins.map((e) => {
        const meta = entityDisplayMeta(e)
        const pos = embEffectivePos(e)
        return (
          <MapPin
            key={e.id}
            screenX={pos.x * childView.scale + childView.tx}
            screenY={pos.y * childView.scale + childView.ty}
            icon={meta.icon}
            imageRef={e.thumbUrl ?? e.imageUrl}
            color={meta.color}
            iconInvert={meta.iconInvert}
              emphasized={meta.emphasized}
              dead={isDead(e)}
            label={e.name}
            selected={selectedIds.includes(e.id)}
            draggable={interactive}
            scale={childView.scale}
            onClick={(ev) => onEntityClick(e.id, ev)}
            onDoubleClick={() => onEntityDoubleClick(e.id)}
            onMove={(dxSub, dySub) => onEntityMove(e.id, dxSub, dySub)}
            onDragEnd={(clientX, clientY) => onEntityDragEnd(e.id, clientX, clientY)}
          />
        )
      })}

      {nestedEmbeds.map((nl) => (
        <EmbeddedMap
          key={nl.id}
          embLayer={nl}
          parentView={childView}
          containerRef={containerRef}
          layers={layers}
          visited={[...visited, embLayer.id]}
          keepOpen={keepOpen}
          tool={tool}
          tableMode={tableMode}
          fogEditing={fogEditing}
          timeOfDay={timeOfDay}
          entities={entities}
          selectedIds={selectedIds}
          selectedEmbedId={selectedEmbedId}
          onSelect={onSelect}
          onMaximize={onMaximize}
          onZoomTo={onZoomTo}
          onReparent={onReparent}
          onEntityClick={onEntityClick}
          onEntityDoubleClick={onEntityDoubleClick}
          onEntityMove={onEntityMove}
          onEntityDragEnd={onEntityDragEnd}
          setEmbedRect={setEmbedRect}
        />
      ))}

      {selected && (
        <>
          <div className="map-resize-outline" style={{ left: x, top: y, width: w, height: h }} />
          {(['nw', 'ne', 'sw', 'se'] as EmbedResizeHandle[]).map((hdl) => (
            <div
              key={hdl}
              className={`map-resize-handle map-resize-handle--${hdl}`}
              style={{
                left: hdl === 'nw' || hdl === 'sw' ? x : x + w,
                top: hdl === 'nw' || hdl === 'ne' ? y : y + h,
              }}
              onPointerDown={startEmbResize(hdl)}
              onPointerMove={onEmbResizeMove}
              onPointerUp={onEmbResizeUp}
              onPointerCancel={onEmbResizeUp}
              onLostPointerCapture={onEmbResizeUp}
            />
          ))}
        </>
      )}
    </>
  )
}
