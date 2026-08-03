import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { entityDisplayMeta } from '../types'
import type { Entity, MapLayer } from '../types'
import { dayNightOverlay, inWindow } from '../utils/time'
import { useAsset } from '../useAsset'
import { PlaceholderMap } from './PlaceholderMap'
import { MapPin } from './MapPin'

interface View {
  scale: number
  tx: number
  ty: number
}

const MIN_SCALE = 0.1
const MAX_SCALE = 30
const DRAG_THRESHOLD = 4
/** Ab dieser Bildschirmgroesse (kuerzere Seite, px) wird eine eingebettete Karte aufgedeckt. */
const REVEAL_THRESHOLD = 160
const MIN_EMBED_SIZE = 100

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
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
  const moveScheduleEntry = useStore((s) => s.moveScheduleEntry)
  const selectEntity = useStore((s) => s.selectEntity)
  const selectedIds = useStore((s) => s.selectedIds)
  const setSelectedIds = useStore((s) => s.setSelectedIds)
  const toggleSelectedId = useStore((s) => s.toggleSelectedId)
  const deleteEntity = useStore((s) => s.deleteEntity)
  const setTool = useStore((s) => s.setTool)
  const timeEnabled = useStore((s) => s.timeEnabled)
  const timeOfDay = useStore((s) => s.timeOfDay)
  const dayNight = useStore((s) => s.dayNight)
  const fogEditing = useStore((s) => s.fogEditing)
  const fogBrush = useStore((s) => s.fogBrush)
  const addReveal = useStore((s) => s.addReveal)
  const resizeLayer = useStore((s) => s.resizeLayer)
  const placingLayerId = useStore((s) => s.placingLayerId)
  const setPlacingLayer = useStore((s) => s.setPlacingLayer)
  const embedLayer = useStore((s) => s.embedLayer)
  const setEmbedRect = useStore((s) => s.setEmbedRect)

  const { width, height } = layer
  const mapImage = useAsset(layer.imageUrl)

  // Auf dieser Ebene eingebettete Karten (andere Ebenen mit embed.parentLayerId === layer.id).
  const embeddedLayers = campaign.layers.filter((l) => l.embed && l.embed.parentLayerId === layer.id)

  // Auf der aktiven Ebene platzierte Objekte (im Spieltischmodus nur entdeckte).
  // Objekte sind immer sichtbar; bei aktivem Tageszeit-Filter kann sich ihre
  // Position aber gemaess eines passenden Zeitplan-Eintrags verschieben.
  const pins = entities.filter(
    (e) => e.placement && e.placement.layerId === layer.id && (!tableMode || e.visibility === 'spieler'),
  )

  // Effektive Position eines Objekts: aktiver Zeitplan-Eintrag (falls vorhanden), sonst Basis-Platzierung.
  const effectivePos = useCallback(
    (e: Entity): { x: number; y: number } => {
      if (timeEnabled && e.schedule.length > 0) {
        const active = e.schedule.find((s) => inWindow(timeOfDay, s.timeStart, s.timeEnd))
        if (active) return { x: active.x, y: active.y }
      }
      return { x: e.placement!.x, y: e.placement!.y }
    },
    [timeEnabled, timeOfDay],
  )

  // Bewegt bei aktivem Zeitplan-Eintrag dessen Position, sonst die Basis-Platzierung.
  const moveEntityTimed = useCallback(
    (e: Entity, dxWorld: number, dyWorld: number) => {
      const active = timeEnabled ? e.schedule.find((s) => inWindow(timeOfDay, s.timeStart, s.timeEnd)) : undefined
      if (active) moveScheduleEntry(e.id, active.id, dxWorld, dyWorld)
      else moveEntity(e.id, dxWorld, dyWorld)
    },
    [timeEnabled, timeOfDay, moveScheduleEntry, moveEntity],
  )

  const fitToView = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (cw === 0 || ch === 0) return
    const scale = Math.min(cw / width, ch / height) * 0.92
    setView({ scale, tx: (cw - width * scale) / 2, ty: (ch - height * scale) / 2 })
  }, [width, height])

  useEffect(() => {
    if (!fitted) {
      fitToView()
      setFitted(true)
    }
  }, [fitted, fitToView])

  // Beim Kampagnen-/Ebenenwechsel neu einpassen.
  useEffect(() => {
    fitToView()
    setMapSelected(false)
    setSelectedEmbedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, layer.id])

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
  // automatisch nah genug heranzoomen, um sie aufzudecken. sx/sy/sw/sh sind ihre aktuelle
  // Bildschirm-Position/-Groesse (bereits rekursiv aus allen Eltern-Transformationen
  // berechnet), also unabhaengig davon, wie tief sie verschachtelt ist.
  const zoomToScreenRect = useCallback((sx: number, sy: number, sw: number, sh: number) => {
    const cont = containerRef.current
    if (!cont) return
    const cw = cont.clientWidth
    const ch = cont.clientHeight
    const targetScreen = REVEAL_THRESHOLD * 1.4
    const neededFactor = targetScreen / Math.min(sw, sh)
    const cx = sx + sw / 2
    const cy = sy + sh / 2
    setView((v) => {
      const newScale = clamp(v.scale * neededFactor, MIN_SCALE, MAX_SCALE)
      const wx = (cx - v.tx) / v.scale
      const wy = (cy - v.ty) / v.scale
      return { scale: newScale, tx: cw / 2 - wx * newScale, ty: ch / 2 - wy * newScale }
    })
  }, [])

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
        // Rechte Maustaste: Karte verschieben.
        e.preventDefault()
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
    [view.tx, view.ty, fogEditing, paintReveal],
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

      // Hoechste Prioritaet: eine Karte wird gerade als eingebettete Karte platziert.
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

  const placingActive = placingEntityId !== null || placingLayerId !== null
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
      onDoubleClick={() => fitToView()}
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
        {layer.imageUrl ? (
          mapImage && (
            <img
              src={mapImage}
              width={width}
              height={height}
              draggable={false}
              alt={layer.name}
              style={{ display: 'block', pointerEvents: 'none' }}
            />
          )
        ) : (
          <PlaceholderMap width={width} height={height} />
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

      {timeEnabled && dayNight && (
        <div
          className="map-daynight"
          style={{ background: dayNightOverlay(timeOfDay) }}
        />
      )}

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
              color={meta.color}
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
            />
          )
        })}
      </div>

      {embeddedLayers.map((el) => (
        <EmbeddedMap
          key={el.id}
          embLayer={el}
          parentView={view}
          containerRef={containerRef}
          layers={campaign.layers}
          visited={[]}
          tool={tool}
          tableMode={tableMode}
          fogEditing={fogEditing}
          timeEnabled={timeEnabled}
          timeOfDay={timeOfDay}
          entities={entities}
          selectedIds={selectedIds}
          selectedEmbedId={selectedEmbedId}
          onSelect={(id) => {
            setSelectedEmbedId(id)
            setMapSelected(false)
            selectEntity(null)
          }}
          onZoomTo={zoomToScreenRect}
          onEntityClick={(id, ev) => {
            setMapSelected(false)
            setSelectedEmbedId(null)
            if (ev.ctrlKey || ev.metaKey || ev.shiftKey) toggleSelectedId(id)
            else selectEntity(id)
          }}
          onEntityMove={(id, dxSub, dySub) => {
            const ent = entities.find((x) => x.id === id)
            if (ent) moveEntityTimed(ent, dxSub, dySub)
          }}
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
        onFit={fitToView}
      />
    </div>
  )
}

function ZoomControls({ scale, onZoom, onFit }: { scale: number; onZoom: (dir: number) => void; onFit: () => void }) {
  return (
    <div className="zoom-controls">
      <button title="Hineinzoomen" onClick={() => onZoom(1)}>+</button>
      <span className="zoom-level">{Math.round(scale * 100)}%</span>
      <button title="Herauszoomen" onClick={() => onZoom(-1)}>&minus;</button>
      <button title="Einpassen (Doppelklick)" onClick={onFit}>&#9633;</button>
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/**
 * Findet die am tiefsten verschachtelte, aktuell aufgedeckte eingebettete Karte an einem
 * Weltpunkt (rekursiv durch beliebig viele Ebenen). effScale ist der Bildschirm-Massstab
 * der Startebene (Pixel pro Welteinheit dieser Ebene, i.d.R. view.scale der Wurzelebene).
 * Liefert die Zielebene sowie den Punkt in deren eigenen Weltkoordinaten.
 */
function resolveDeepTarget(
  layers: MapLayer[],
  parentLayerId: string,
  wx: number,
  wy: number,
  effScale: number,
): { layerId: string; x: number; y: number } {
  for (const child of layers) {
    const embed = child.embed
    if (!embed || embed.parentLayerId !== parentLayerId) continue
    if (wx < embed.x || wx > embed.x + embed.width || wy < embed.y || wy > embed.y + embed.height) continue
    if (Math.min(embed.width, embed.height) * effScale < REVEAL_THRESHOLD) continue
    const subX = ((wx - embed.x) / embed.width) * child.width
    const subY = ((wy - embed.y) / embed.height) * child.height
    const childEffScale = effScale * (embed.width / child.width)
    return resolveDeepTarget(layers, child.id, subX, subY, childEffScale)
  }
  return { layerId: parentLayerId, x: wx, y: wy }
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
  tool,
  tableMode,
  fogEditing,
  timeEnabled,
  timeOfDay,
  entities,
  selectedIds,
  selectedEmbedId,
  onSelect,
  onZoomTo,
  onEntityClick,
  onEntityMove,
  setEmbedRect,
}: {
  embLayer: MapLayer
  /** Bildschirm-Transformation der Eltern-Ebene (Weltkoordinaten der Eltern-Ebene -> Bildschirm). */
  parentView: View
  containerRef: React.RefObject<HTMLDivElement>
  layers: MapLayer[]
  /** IDs aller Eltern-Ebenen auf dem Weg von der Wurzel hierher (Zyklenschutz). */
  visited: string[]
  tool: string
  tableMode: boolean
  fogEditing: boolean
  timeEnabled: boolean
  timeOfDay: number
  entities: Entity[]
  selectedIds: string[]
  selectedEmbedId: string | null
  onSelect: (id: string) => void
  onZoomTo: (sx: number, sy: number, sw: number, sh: number) => void
  onEntityClick: (id: string, ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void
  onEntityMove: (id: string, dxSub: number, dySub: number) => void
  setEmbedRect: (id: string, x: number, y: number, width: number, height: number) => void
}) {
  const image = useAsset(embLayer.imageUrl)
  const embed = embLayer.embed!
  const selected = selectedEmbedId === embLayer.id
  const x = embed.x * parentView.scale + parentView.tx
  const y = embed.y * parentView.scale + parentView.ty
  const w = embed.width * parentView.scale
  const h = embed.height * parentView.scale
  const revealed = Math.min(w, h) >= REVEAL_THRESHOLD
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
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (!d.moved) onSelect(embLayer.id)
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
  function onEmbResizeUp(e: React.PointerEvent) {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    resizeRef.current = null
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
        onClick={() => onZoomTo(x, y, w, h)}
        onMove={(dxWorld, dyWorld) => setEmbedRect(embLayer.id, embed.x + dxWorld, embed.y + dyWorld, embed.width, embed.height)}
      />
    )
  }

  // Eigene Bildschirm-Transformation dieser Ebene (Weltkoordinaten dieser Ebene -> Bildschirm).
  // Damit funktionieren ihre Pins und weitere, in ihr eingebettete Karten genauso wie auf
  // der Wurzelebene - rekursiv, beliebig tief, ohne die aktive Ebene zu wechseln.
  const childView: View = { scale: w / embLayer.width, tx: x, ty: y }

  const embPins = entities.filter(
    (e) => e.placement && e.placement.layerId === embLayer.id && (!tableMode || e.visibility === 'spieler'),
  )
  const nestedEmbeds = layers.filter(
    (l) => l.embed && l.embed.parentLayerId === embLayer.id && !visited.includes(l.id),
  )

  function embEffectivePos(e: Entity): { x: number; y: number } {
    if (timeEnabled && e.schedule.length > 0) {
      const active = e.schedule.find((s) => inWindow(timeOfDay, s.timeStart, s.timeEnd))
      if (active) return { x: active.x, y: active.y }
    }
    return { x: e.placement!.x, y: e.placement!.y }
  }

  return (
    <>
      <div
        className="embedded-map"
        style={{ left: x, top: y, width: w, height: h }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
      >
        {embLayer.imageUrl ? (
          image && <img src={image} draggable={false} alt={embLayer.name} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill' }} />
        ) : (
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
            color={meta.color}
            label={e.name}
            selected={selectedIds.includes(e.id)}
            draggable={interactive}
            scale={childView.scale}
            onClick={(ev) => onEntityClick(e.id, ev)}
            onMove={(dxSub, dySub) => onEntityMove(e.id, dxSub, dySub)}
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
          tool={tool}
          tableMode={tableMode}
          fogEditing={fogEditing}
          timeEnabled={timeEnabled}
          timeOfDay={timeOfDay}
          entities={entities}
          selectedIds={selectedIds}
          selectedEmbedId={selectedEmbedId}
          onSelect={onSelect}
          onZoomTo={onZoomTo}
          onEntityClick={onEntityClick}
          onEntityMove={onEntityMove}
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
            />
          ))}
        </>
      )}
    </>
  )
}
