import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  COMBAT_STAT_FIELDS,
  ENTITY_TYPES,
  FIELD_SCHEMA,
  FREUND_BERUFE,
  SKILLS,
  SKILLS_FIELD,
  entityDisplayMeta,
  isHostile,
  parseSkills,
  serializeSkills,
} from '../types'
import type { Entity, ThumbCrop } from '../types'
import { useStore } from '../store/useStore'
import { defaultThumbCrop, fileToScaledDataUrl } from '../utils/image'
import { deleteAsset } from '../utils/assets'
import { discardEntityImage, restoreEntityThumb, storeEntityImage } from '../utils/entityImage'
import { useAsset } from '../useAsset'
import { rollDie } from '../utils/tools'
import { DecisionEditor } from './DecisionEditor'
import { EventEditor } from './EventEditor'
import { EntityIcon } from './EntityIcon'

export function DetailPanel() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const activeLayer = campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
  const viewLayerId = useStore((s) => s.viewLayerId)
  const selectedId = useStore((s) => s.selectedEntityId)
  const tableMode = useStore((s) => s.tableMode)
  const updateEntity = useStore((s) => s.updateEntity)
  const setEntityField = useStore((s) => s.setEntityField)
  const deleteEntity = useStore((s) => s.deleteEntity)
  const selectEntity = useStore((s) => s.selectEntity)
  const setPlacingEntity = useStore((s) => s.setPlacingEntity)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const setToolsOpen = useStore((s) => s.setToolsOpen)
  const setToolsTab = useStore((s) => s.setToolsTab)

  const [combatMode, setCombatMode] = useState(false)
  // Initiative wird pro Kampf gewuerfelt/eingegeben, nicht am Charakter gespeichert -
  // daher nur fluechtiger Panel-Zustand.
  const [initiatives, setInitiatives] = useState<Record<string, number | null>>({})

  const marker = campaign.entities.find((e) => e.id === selectedId) ?? null

  // Objekte der Karte, die man gerade betrachtet (viewLayerId beim Navigieren in der
  // Hierarchie, sonst die Wurzelkarte selbst) - dieselbe Karte, in die "+ Neue Karte"
  // aktuell einbetten wuerde.
  const mapLayerId = viewLayerId ?? activeLayer.id
  const mapLayer = campaign.layers.find((l) => l.id === mapLayerId) ?? activeLayer
  const mapEntities = campaign.entities.filter((e) => e.placement?.layerId === mapLayerId)
  const enemies = mapEntities.filter(isHostile)
  const sortedEnemies = [...enemies].sort(
    (a, b) => (initiatives[b.id] ?? -Infinity) - (initiatives[a.id] ?? -Infinity),
  )
  const groups = ENTITY_TYPES.map((m) => ({
    meta: m,
    items: mapEntities.filter((e) => e.type === m.type),
  })).filter((g) => g.items.length > 0)

  function rollOne(id: string) {
    setInitiatives((prev) => ({ ...prev, [id]: rollDie(20) }))
  }
  function rollAllInitiative() {
    setInitiatives(Object.fromEntries(enemies.map((e) => [e.id, rollDie(20)])))
  }

  // Erneuter Klick auf das bereits ausgewaehlte Objekt in der Liste schliesst dessen
  // Dropdown wieder, statt es einfach offen zu lassen (wie ein Akkordeon).
  function onRowSelect(id: string) {
    selectEntity(id === selectedId ? null : id)
  }

  // Details erscheinen als Dropdown direkt unter dem angeklickten Objekt in der Liste - aber
  // nur wenn dieses Objekt tatsaechlich in der aktuell sichtbaren Liste steht (auf dieser
  // Karte platziert bzw. im Kampfmodus ein Feind). Sonst (Objekt ohne Kartenposition oder ueber
  // eine Verknuepfung auf einer anderen Karte ausgewaehlt) faellt die Anzeige unterhalb der
  // Liste zurueck, wie zuvor.
  const visibleIds = combatMode ? sortedEnemies.map((e) => e.id) : mapEntities.map((e) => e.id)
  const showInline = !!selectedId && visibleIds.includes(selectedId)
  // Faellt die Anzeige unterhalb der Liste zurueck (statt Inline-Dropdown)? Nur dann muss
  // die Liste selbst Platz fuer den Detailbereich darunter lassen - sonst darf sie die ganze
  // Seitenleiste ausfuellen, auch bei vielen Objekten.
  const hasFloatingDetail = !!selectedId && !!marker && !showInline
  const readOnly = tableMode

  let detailContent: React.ReactNode = null
  if (marker) {
    const meta = entityDisplayMeta(marker)
    const fields = FIELD_SCHEMA[marker.type]

    const portrait = <EntityImageField entity={marker} readOnly={readOnly} />

    // Keine Kopfzeile: Name und Schliessen stecken in der Objektzeile darueber - beim
    // Aufklappen in der Liste ebenso wie beim Objekt einer anderen Karte, das weiter unten
    // seine eigene Zeile bekommt. So sieht die Anzeige ueberall gleich aus.

    // Kampfmodus zeigt zu einem Feind ausschliesslich sein Kampfblatt - alles andere
    // (Rolle, Motivation, Beschreibung, Geheimnis, Verknuepfungen ...) waere am Tisch
    // waehrend eines Kampfes nur Ballast. Umgekehrt tauchen die Kampfwerte ausserhalb
    // des Kampfmodus gar nicht auf.
    const isFeind = isHostile(marker)
    detailContent = combatMode && isFeind ? (
      <div className="detail__panel" style={{ ['--chip-color' as string]: meta.color }}>
        <div className="detail__body">
          {/* Im Kampf nur zur Wiedererkennung - gesetzt wird das Bild in der normalen Ansicht. */}
          {marker.imageUrl && <EntityImageField entity={marker} readOnly />}
          <CombatStatFields
            entity={marker}
            readOnly={readOnly}
            onFieldChange={(key, value) => setEntityField(marker.id, key, value)}
          />
        </div>
      </div>
    ) : (
    <div className="detail__panel" style={{ ['--chip-color' as string]: meta.color }}>

      <div className="detail__body">
        {portrait}

        {!readOnly && (
          <button
            className="btn btn--sm btn--full detail__ai"
            onClick={() => {
              setToolsTab('ki')
              setToolsOpen(true)
            }}
            title="KI-Werkzeug fuer dieses Objekt oeffnen: Portrait, Erzaehltext, Dialog"
          >
            ✨ KI: Bilder und Texte erstellen
          </button>
        )}

        {/* Typ-spezifische Felder */}
        {fields.map((f) => (
          <label key={f.key} className="field">
            <span className="field__label">{f.label}</span>
            {f.kind === 'select' ? (
              <select
                className="field__control"
                value={marker.fields[f.key] ?? ''}
                onChange={(e) => setEntityField(marker.id, f.key, e.target.value)}
                disabled={readOnly}
              >
                <option value="">&ndash;</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.kind === 'textarea' ? (
              <textarea
                className="field__control field__textarea"
                value={marker.fields[f.key] ?? ''}
                onChange={(e) => setEntityField(marker.id, f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={3}
                disabled={readOnly}
              />
            ) : (
              <input
                className="field__control"
                value={marker.fields[f.key] ?? ''}
                onChange={(e) => setEntityField(marker.id, f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={readOnly}
              />
            )}
          </label>
        ))}

        <label className="field">
          <span className="field__label">Beschreibung</span>
          <textarea
            className="field__control field__textarea"
            value={marker.description}
            onChange={(e) => updateEntity(marker.id, { description: e.target.value })}
            placeholder="Beschreibung, sichtbar auch fuer Spieler wenn entdeckt ..."
            rows={5}
            disabled={readOnly}
          />
        </label>

        {/* Geheimnisse: nur DM */}
        {!tableMode && (
          <label className="field">
            <span className="field__label field__label--secret">Geheimnis (nur DM)</span>
            <textarea
              className="field__control field__textarea field__textarea--secret"
              value={marker.secret}
              onChange={(e) => updateEntity(marker.id, { secret: e.target.value })}
              placeholder="Verborgene Informationen, Wendungen, verdeckte Motive ..."
              rows={3}
            />
          </label>
        )}

        {/* Charakter: Freund-Dialog oder Feind-Begegnung, je nach Gesinnung */}
        {marker.type === 'nsc' && marker.fields.gesinnung === 'freund' && (
          <>
            <label className="field">
              <span className="field__label">Beruf</span>
              <select
                className="field__control"
                value={marker.fields.beruf ?? ''}
                onChange={(e) => setEntityField(marker.id, 'beruf', e.target.value)}
                disabled={readOnly}
              >
                <option value="">&ndash;</option>
                {FREUND_BERUFE.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Dialog</span>
              <textarea
                className="field__control field__textarea"
                value={marker.fields.dialog ?? ''}
                onChange={(e) => setEntityField(marker.id, 'dialog', e.target.value)}
                placeholder="Moegliche Dialogzeilen, Anliegen, Ton der Figur ..."
                rows={4}
                disabled={readOnly}
              />
            </label>
          </>
        )}

        {isFeind && (
          <FeindFields
            entity={marker}
            readOnly={readOnly}
            onFieldChange={(key, value) => setEntityField(marker.id, key, value)}
          />
        )}

        {/* Fraktion und Verknuepfungen stehen in der unteren Leiste unter "Beziehungen",
            der Tagesablauf unter "Zeitleiste" - siehe EntityRelations bzw. DaySchedule. */}

        {/* Entscheidung: Optionen & Folgen */}
        {marker.type === 'entscheidung' && (
          <div className="field">
            <span className="field__label">Entscheidung</span>
            <DecisionEditor entity={marker} readOnly={readOnly} />
          </div>
        )}

        {/* Ereignis: Inhalte, Kampfkarte, Kreaturen, Kampf starten */}
        {marker.type === 'ereignis' && (
          <div className="field">
            <span className="field__label">Ereignis-Inhalt</span>
            <EventEditor entity={marker} readOnly={readOnly} />
          </div>
        )}

        {!readOnly && (
          <>
            {/* Kein "Von Karte entfernen" mehr: Jedes Objekt gehoert auf eine Karte. Der
                Knopf bleibt fuer Altbestand, der noch ohne Position angelegt wurde. */}
            {!marker.placement && (
              <div className="field field--row">
                <span className="field__label">Auf Karte</span>
                <button className="btn btn--sm" onClick={() => setPlacingEntity(marker.id)}>
                  Auf Karte platzieren
                </button>
              </div>
            )}

            {marker.type === 'ort' && (
              <label className="field">
                <span className="field__label">Unterkarte</span>
                <select
                  className="field__control"
                  value={marker.subMapId ?? ''}
                  onChange={(e) => updateEntity(marker.id, { subMapId: e.target.value || null })}
                >
                  <option value="">&ndash; keine &ndash;</option>
                  {campaign.layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {/* Unterkarte oeffnen (auch in der Spieler-/Tischsicht nutzbar) */}
        {marker.type === 'ort' && marker.subMapId && (
          <button
            className="btn btn--primary btn--full"
            onClick={() => setActiveLayer(marker.subMapId!)}
          >
            Unterkarte oeffnen &rarr;
          </button>
        )}
      </div>

      {!readOnly && (
        <div className="detail__footer">
          <button
            className="btn btn--danger"
            onClick={() => {
              if (confirm(`Objekt "${marker.name}" loeschen?`)) deleteEntity(marker.id)
            }}
          >
            Loeschen
          </button>
        </div>
      )}
    </div>
    )
  }

  const objectsSection = (
    <div className={`detail__objects${hasFloatingDetail ? ' detail__objects--capped' : ''}`}>
      <div className="detail__objects-head">
        <h2 className="detail__objects-title">
          {mapLayer.name}
          <span className="sidebar__count">{combatMode ? enemies.length : mapEntities.length}</span>
        </h2>
        <button
          className={`btn btn--sm${combatMode ? ' btn--active' : ''}`}
          onClick={() => setCombatMode((v) => !v)}
          title="Kampfmodus: nur Feinde, mit Initiative und Kampfwerten"
        >
          ⚔ Kampfmodus
        </button>
      </div>

      {combatMode ? (
        <>
          {enemies.length > 0 && (
            <button className="chipbtn detail__objects-rollall" onClick={rollAllInitiative}>
              🎲 Alle Initiativen wuerfeln
            </button>
          )}
          {sortedEnemies.length === 0 ? (
            <p className="sidebar__empty">Keine Feinde auf dieser Karte.</p>
          ) : (
            <ul className="marker-list">
              {sortedEnemies.map((e) => (
                <EnemyRow
                  key={e.id}
                  entity={e}
                  selected={e.id === selectedId}
                  initiative={initiatives[e.id] ?? null}
                  onSelect={onRowSelect}
                  onInitiativeChange={(v) => setInitiatives((prev) => ({ ...prev, [e.id]: v }))}
                  onRoll={() => rollOne(e.id)}
                  dropdown={e.id === selectedId ? detailContent : null}
                />
              ))}
            </ul>
          )}
        </>
      ) : mapEntities.length === 0 ? (
        <p className="sidebar__empty">Noch keine Objekte auf dieser Karte.</p>
      ) : (
        <div className="entity-groups">
          {groups.map((g) => (
            <div key={g.meta.type} className="entity-group">
              <div className="entity-group__title" style={{ ['--chip-color' as string]: g.meta.color }}>
                <span>{g.meta.icon}</span>
                {g.meta.plural}
                <span className="entity-group__count">{g.items.length}</span>
              </div>
              <ul className="marker-list">
                {g.items.map((e) => (
                  <EntityRow
                    key={e.id}
                    entity={e}
                    selected={e.id === selectedId}
                    onSelect={onRowSelect}
                    dropdown={e.id === selectedId ? detailContent : null}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <aside className="detail">
      {objectsSection}
      {!selectedId && (
        <div className="detail--empty">
          <p>Klicke ein Objekt auf der Karte oder in der Liste, um seine Details zu sehen.</p>
        </div>
      )}
      {/* Objekt einer anderen Karte (ueber eine Verknuepfung oder die Suche ausgewaehlt):
          Es steht in keiner Liste, bekommt hier aber dieselbe Zeile samt Dropdown - so
          gibt es nur eine Darstellung, mit Namen und Umbenennen an gewohnter Stelle. */}
      {hasFloatingDetail && marker && (
        <div className="detail__floating">
          <ul className="marker-list">
            <EntityRow entity={marker} selected onSelect={onRowSelect} dropdown={detailContent} />
          </ul>
        </div>
      )}
    </aside>
  )
}


/**
 * Bildbereich eines Objekts: immer ein Rechteck in fester Groesse - entweder mit dem
 * Portraet oder als Platzhalter, der zum Hochladen einlaedt. Jedes gesetzte Bild wird
 * zugleich als Miniatur abgelegt, die auf Kartenpinnadeln und in Listen erscheint; welcher
 * Ausschnitt das ist, laesst sich ueber den Pinnadel-Knopf frei waehlen.
 */
function EntityImageField({ entity, readOnly }: { entity: Entity; readOnly: boolean }) {
  const updateEntity = useStore((s) => s.updateEntity)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'crop' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
  const url = useAsset(entity.imageUrl)

  async function apply(dataUrl: string) {
    const prev = { imageUrl: entity.imageUrl, thumbUrl: entity.thumbUrl }
    // Neues Bild: der bisherige Ausschnitt passt nicht mehr, also wieder die Vorgabe.
    const stored = await storeEntityImage(dataUrl)
    updateEntity(entity.id, stored)
    discardEntityImage(prev)
  }

  /** Nur den Ausschnitt der Miniatur neu setzen; das Portraet bleibt wie es ist. */
  async function applyCrop(crop: ThumbCrop) {
    if (!url) return
    setError(null)
    setBusy('crop')
    const prevThumb = entity.thumbUrl
    try {
      updateEntity(entity.id, await restoreEntityThumb(url, crop))
      if (prevThumb && prevThumb !== entity.imageUrl) void deleteAsset(prevThumb)
      setCropping(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ausschnitt konnte nicht gesetzt werden.')
    } finally {
      setBusy(null)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setBusy('upload')
    try {
      const { url: scaled } = await fileToScaledDataUrl(file, { maxDim: 900, quality: 0.82 })
      await apply(scaled)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bild konnte nicht geladen werden.')
    } finally {
      setBusy(null)
    }
  }

  function onRemove() {
    discardEntityImage(entity)
    updateEntity(entity.id, { imageUrl: null, thumbUrl: null, thumbCrop: null })
  }

  return (
    <div className="entity-image">
      <div className={`entity-image__frame${url ? ' has-image' : ''}`}>
        {/* Waehrend der Ausschnittwahl bringt CropSelector sein eigenes, zoombares Bild mit. */}
        {url ? (
          !cropping && <img src={url} alt={entity.name} />
        ) : (
          <button
            type="button"
            className="entity-image__drop"
            disabled={readOnly || busy != null}
            onClick={() => fileRef.current?.click()}
            title="Bild hochladen"
          >
            <svg
              className="entity-image__upload-icon"
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
            <span>{busy === 'upload' ? 'Wird geladen …' : 'Bild hochladen'}</span>
          </button>
        )}

        {url && cropping && (
          <CropSelector
            src={url}
            crop={entity.thumbCrop}
            busy={busy === 'crop'}
            onCancel={() => setCropping(false)}
            onApply={applyCrop}
          />
        )}

        {url && !readOnly && !cropping && (
          <div className="entity-image__actions">
            <button
              className="entity-image__act entity-image__act--pin"
              title="Ausschnitt fuer die Pinnadel waehlen"
              disabled={busy != null}
              onClick={() => setCropping(true)}
            >
              {/* Umriss der Kartenpinnadel, gleiche Geometrie wie .map-pin__head. */}
              <span className="pin-glyph" aria-hidden="true" />
            </button>
            <button
              className="entity-image__act"
              title="Bild ersetzen"
              disabled={busy != null}
              onClick={() => fileRef.current?.click()}
            >
              {'↻'}
            </button>
            <button
              className="entity-image__act entity-image__act--danger"
              title="Bild entfernen"
              disabled={busy != null}
              onClick={onRemove}
            >
              &times;
            </button>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

      {error && <p className="entity-image__error">{error}</p>}
    </div>
  )
}

/**
 * Zeichengrenze der kurzen Kampfwerte (Speed, Uebung, RK, HP, STR..CHA). Bewusst Zeichen
 * statt reiner Ziffern, damit Boni wie "+3" weiterhin eingetragen werden koennen. XP und
 * die Textfelder bleiben unbegrenzt.
 */
const SHORT_STAT_LENGTH = 3

/** Kleinste Kantenlaenge des Ausschnitts, in Bildpunkten des Originals. */
const MIN_CROP_SIDE = 32
/** Groesse, die der Ausschnitt im Rahmen anstrebt (Anteil der kuerzeren Rahmenseite). */
const CROP_VIEW_TARGET = 0.6
/** Obergrenze der Vergroesserung, damit ein kleiner Ausschnitt nicht zu Matsch wird. */
const CROP_MAX_ZOOM = 6
/**
 * Groesster Anteil des nutzbaren Bereichs, den der Ausschnitt einnehmen darf. Daraus ergibt
 * sich bei Bedarf ein Zoom unter 1: Ein Ausschnitt, der fast das ganze Bild umfasst, wird
 * also verkleinert dargestellt - sonst laege sein Ziehgriff ausserhalb des Rahmens und die
 * Groesse waere nicht mehr aenderbar.
 */
const CROP_MAX_FRACTION = 0.82
/** Hoehe der Knopfleiste am unteren Rand; ueber ihr wird der Ausschnitt zentriert. */
const CROP_BAR_HEIGHT = 46

/**
 * Auswahl des Bildausschnitts, der auf der Kartenpinnadel erscheint. Liegt als Ueberlagerung
 * ueber dem Portraet: Das Quadrat laesst sich verschieben und an der unteren rechten Ecke in
 * der Groesse aendern, alles ausserhalb wird abgedunkelt.
 */
function CropSelector({
  src,
  crop,
  busy,
  onCancel,
  onApply,
}: {
  src: string
  crop: ThumbCrop | null
  busy: boolean
  onCancel: () => void
  onApply: (crop: ThumbCrop) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  /** Ausschnitt in Bildpunkten des Originals: Mittelpunkt und Kantenlaenge des Quadrats. */
  const [sel, setSel] = useState<{ cx: number; cy: number; side: number } | null>(null)
  const drag = useRef<{
    mode: 'pan' | 'resize'
    startX: number
    startY: number
    orig: { cx: number; cy: number; side: number }
  } | null>(null)

  useEffect(() => {
    let alive = true
    const img = new Image()
    img.onload = () => {
      const el = boxRef.current
      if (!alive || !el) return
      const c = crop ?? defaultThumbCrop(img.naturalWidth, img.naturalHeight)
      setNat({ w: img.naturalWidth, h: img.naturalHeight })
      setBox({ w: el.clientWidth, h: el.clientHeight })
      setSel({
        cx: (c.x + c.w / 2) * img.naturalWidth,
        cy: (c.y + c.h / 2) * img.naturalHeight,
        side: c.w * img.naturalWidth,
      })
    }
    img.src = src
    return () => {
      alive = false
    }
  }, [src, crop])

  // Darstellung: Das Bild wird umso staerker vergroessert, je kleiner der Ausschnitt ist,
  // damit ein kleines Quadrat nicht zur Fummelei wird. Die Wurzel daempft das - es wird
  // "ein Stueck" herangezoomt, nicht bis der Ausschnitt den Rahmen fuellt.
  const layout =
    nat && box && sel
      ? (() => {
          // Ueber der Knopfleiste bleibt der nutzbare Bereich; darin wird zentriert.
          const usableH = Math.max(1, box.h - CROP_BAR_HEIGHT)
          const centerY = usableH / 2
          const fit = Math.min(box.w / nat.w, box.h / nat.h)
          const base = sel.side * fit
          const target = Math.min(box.w, usableH) * CROP_VIEW_TARGET
          let zoom = clampNum(Math.sqrt(target / base), 1, CROP_MAX_ZOOM)
          // Der Ausschnitt muss samt Ziehgriff in den Rahmen passen - notfalls wird eben
          // herausgezoomt (zoom < 1), statt ihn ueber den Rand hinauslaufen zu lassen.
          const maxSel = Math.min(box.w, usableH) * CROP_MAX_FRACTION
          if (base * zoom > maxSel) zoom = maxSel / base
          const scale = fit * zoom
          return {
            scale,
            centerY,
            imgW: nat.w * scale,
            imgH: nat.h * scale,
            // Der Ausschnitt sitzt fest in der Mitte, das Bild wandert darunter.
            imgLeft: box.w / 2 - sel.cx * scale,
            imgTop: centerY - sel.cy * scale,
            selPx: sel.side * scale,
          }
        })()
      : null

  function onDown(e: React.PointerEvent, mode: 'pan' | 'resize') {
    if (!sel || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, orig: sel }
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d || !nat || !layout || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    const dx = (e.clientX - d.startX) / layout.scale
    const dy = (e.clientY - d.startY) / layout.scale

    if (d.mode === 'pan') {
      // Das Bild folgt dem Zeiger, der Ausschnitt wandert also gegenlaeufig darueber.
      setSel(clampSel({ ...d.orig, cx: d.orig.cx - dx, cy: d.orig.cy - dy }, nat))
      return
    }
    setSel(clampSel({ ...d.orig, side: d.orig.side + Math.max(dx, dy) * 2 }, nat))
  }

  function onUp(e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    drag.current = null
  }

  function commit() {
    if (!sel || !nat) return
    onApply({
      x: (sel.cx - sel.side / 2) / nat.w,
      y: (sel.cy - sel.side / 2) / nat.h,
      w: sel.side / nat.w,
      h: sel.side / nat.h,
    })
  }

  return (
    <div className="crop" ref={boxRef}>
      {layout && (
        <img
          className="crop__img"
          src={src}
          alt=""
          draggable={false}
          style={{ left: layout.imgLeft, top: layout.imgTop, width: layout.imgW, height: layout.imgH }}
          onPointerDown={(e) => onDown(e, 'pan')}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}

      {layout && (
        <div
          className="crop__sel"
          style={{ width: layout.selPx, height: layout.selPx, top: layout.centerY }}
          onPointerDown={(e) => onDown(e, 'pan')}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <span
            className="crop__handle"
            onPointerDown={(e) => onDown(e, 'resize')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>
      )}

      <div className="crop__bar">
        <span className="crop__hint">Bild schieben · Ecke ziehen</span>
        <button className="btn btn--sm" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button className="btn btn--sm btn--primary" onClick={commit} disabled={busy || !sel}>
          {busy ? '…' : 'Uebernehmen'}
        </button>
      </div>
    </div>
  )
}

/** Ausschnitt in den Bildgrenzen halten, damit er keine leeren Raender enthaelt. */
function clampSel(
  sel: { cx: number; cy: number; side: number },
  nat: { w: number; h: number },
): { cx: number; cy: number; side: number } {
  const side = clampNum(sel.side, MIN_CROP_SIDE, Math.min(nat.w, nat.h))
  return {
    side,
    cx: clampNum(sel.cx, side / 2, nat.w - side / 2),
    cy: clampNum(sel.cy, side / 2, nat.h - side / 2),
  }
}

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Zusatzfelder eines Feindes ausserhalb des Kampfmodus (das Bild steckt oben im Kopf). */
function FeindFields({
  entity,
  readOnly,
  onFieldChange,
}: {
  entity: Entity
  readOnly: boolean
  onFieldChange: (key: string, value: string) => void
}) {
  return (
    <>
      <label className="field">
        <span className="field__label">Einleitungstext fuer die Begegnung</span>
        <textarea
          className="field__control field__textarea"
          value={entity.fields.begegnungstext ?? ''}
          onChange={(e) => onFieldChange('begegnungstext', e.target.value)}
          placeholder="Wie wird die Begegnung eingeleitet? Was sieht/hoert die Gruppe zuerst?"
          rows={4}
          disabled={readOnly}
        />
      </label>
    </>
  )
}

/**
 * Kampfwerte eines Feindes (Speed/Uebungsbonus/RK/HP, Attribute, XP, Angriff/Faehigkeiten/
 * Taktik). Ausschliesslich im Kampfmodus zu sehen, dort dann als einziger Inhalt des
 * Objekt-Dropdowns - siehe detailContent weiter oben.
 */
function CombatStatFields({
  entity,
  readOnly,
  onFieldChange,
}: {
  entity: Entity
  readOnly: boolean
  onFieldChange: (key: string, value: string) => void
}) {
  const coreStats = COMBAT_STAT_FIELDS.slice(0, 4) // Speed, Uebung, RK, HP
  const abilityScores = COMBAT_STAT_FIELDS.slice(4, 10) // STR..CHA
  const xpField = COMBAT_STAT_FIELDS[10]
  const textFields = COMBAT_STAT_FIELDS.slice(11) // Angriff, Bes. Faehigkeiten, Kampf-Taktik

  return (
    <div className="field">
      <span className="field__label">Kampfwerte</span>
      <div className="statgrid statgrid--4">
        {coreStats.map((f) => (
          <label key={f.key} className="statfield">
            <span>{f.label}</span>
            <input
              className="field__control field__control--sm"
              value={entity.fields[f.key] ?? ''}
              maxLength={SHORT_STAT_LENGTH}
              onChange={(e) => onFieldChange(f.key, e.target.value)}
              disabled={readOnly}
            />
          </label>
        ))}
      </div>
      <div className="statgrid statgrid--6">
        {abilityScores.map((f) => (
          <label key={f.key} className="statfield">
            <span>{f.label}</span>
            <input
              className="field__control field__control--sm"
              value={entity.fields[f.key] ?? ''}
              maxLength={SHORT_STAT_LENGTH}
              onChange={(e) => onFieldChange(f.key, e.target.value)}
              disabled={readOnly}
            />
          </label>
        ))}
      </div>
      <div className="statgrid statgrid--1">
        <label className="statfield">
          <span>{xpField.label}</span>
          <input
            className="field__control field__control--sm"
            value={entity.fields[xpField.key] ?? ''}
            onChange={(e) => onFieldChange(xpField.key, e.target.value)}
            disabled={readOnly}
          />
        </label>
      </div>

      {textFields.map((f) => (
        <label key={f.key} className="field statfield--text">
          <span className="field__label">{f.label}</span>
          <textarea
            className="field__control field__textarea"
            value={entity.fields[f.key] ?? ''}
            onChange={(e) => onFieldChange(f.key, e.target.value)}
            rows={3}
            disabled={readOnly}
          />
        </label>
      ))}

      <SkillsField entity={entity} readOnly={readOnly} onFieldChange={onFieldChange} />
    </div>
  )
}

/**
 * Fertigkeiten des Charakters. Der Knopf zeigt die aktuelle Auswahl und oeffnet ein
 * Fenster, in dem jede Fertigkeit ein an- und abwaehlbarer Knopf ist. Uebernommen wird
 * die Auswahl beim Schliessen des Fensters.
 */
function SkillsField({
  entity,
  readOnly,
  onFieldChange,
}: {
  entity: Entity
  readOnly: boolean
  onFieldChange: (key: string, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const chosen = parseSkills(entity.fields[SKILLS_FIELD])
  const labels = SKILLS.filter((s) => chosen.includes(s.value)).map((s) => s.label)

  return (
    <div className="field statfield--text">
      <span className="field__label">Fertigkeiten</span>
      <button
        className={`skills__open${chosen.length > 0 ? ' has-skills' : ''}`}
        disabled={readOnly}
        onClick={() => setOpen(true)}
        title="Fertigkeiten waehlen"
      >
        {labels.length > 0 ? labels.join(', ') : 'Fertigkeiten waehlen …'}
      </button>

      {open && (
        <SkillPicker
          initial={chosen}
          onClose={(values) => {
            onFieldChange(SKILLS_FIELD, serializeSkills(values))
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

/**
 * Auswahlfenster fuer Fertigkeiten. Liegt als Portal an document.body, damit es nicht am
 * Rand der schmalen Seitenleiste abgeschnitten wird. Die Auswahl wird bis zum Schliessen
 * nur hier gehalten und dann in einem Rutsch uebergeben.
 */
function SkillPicker({
  initial,
  onClose,
}: {
  initial: string[]
  onClose: (values: string[]) => void
}) {
  const [chosen, setChosen] = useState<string[]>(initial)

  function toggle(value: string) {
    setChosen((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  return createPortal(
    <div className="skills-modal" onClick={() => onClose(chosen)}>
      {/* Klicks im Fenster sollen es nicht ueber den Hintergrund wieder schliessen. */}
      <div className="skills-modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="skills-modal__head">
          <h3 className="skills-modal__title">Fertigkeiten</h3>
          <span className="skills-modal__count">{chosen.length} gewaehlt</span>
          <button className="skills-modal__close" onClick={() => onClose(chosen)} title="Schliessen">
            &times;
          </button>
        </div>

        <div className="skills-modal__grid">
          {SKILLS.map((s) => (
            <button
              key={s.value}
              className={`skills-modal__skill${chosen.includes(s.value) ? ' is-active' : ''}`}
              onClick={() => toggle(s.value)}
            >
              <span className="skills-modal__skill-de">{s.label}</span>
              <span className="skills-modal__skill-en">{s.en}</span>
            </button>
          ))}
        </div>

        <div className="skills-modal__foot">
          <button className="btn btn--sm" onClick={() => setChosen([])} disabled={chosen.length === 0}>
            Auswahl leeren
          </button>
          <button className="btn btn--sm btn--primary" onClick={() => onClose(chosen)}>
            Uebernehmen
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Warten, bis feststeht, ob aus einem Klick noch ein Doppelklick wird. Ohne das wuerde ein
 * Doppelklick zum Umbenennen die Detailanzeige zwischendurch auf- und wieder zuklappen.
 * Etwas mehr als die uebliche Doppelklick-Schwelle der Betriebssysteme.
 */
const DOUBLE_CLICK_GRACE_MS = 260

/**
 * Trennt Einfach- von Doppelklick auf demselben Element: Der Einfachklick wird kurz
 * zurueckgehalten und verworfen, sobald ein Doppelklick folgt.
 */
function useClickOrDouble(onClick: () => void, onDoubleClick: () => void) {
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current)
    },
    [],
  )

  return {
    onClick: () => {
      // Zweiter Klick innerhalb der Frist: nichts tun, gleich kommt der Doppelklick.
      if (timer.current != null) return
      timer.current = window.setTimeout(() => {
        timer.current = null
        onClick()
      }, DOUBLE_CLICK_GRACE_MS)
    },
    onDoubleClick: () => {
      if (timer.current != null) {
        clearTimeout(timer.current)
        timer.current = null
      }
      onDoubleClick()
    },
  }
}

/** Namensfeld einer Objektzeile, das per Doppelklick zur Eingabe wird. */
function RowName({ entity, onSelect }: { entity: Entity; onSelect: (id: string) => void }) {
  const updateEntity = useStore((s) => s.updateEntity)
  const [draft, setDraft] = useState<string | null>(null)
  const handlers = useClickOrDouble(
    () => onSelect(entity.id),
    () => setDraft(entity.name),
  )

  function commit() {
    const name = (draft ?? '').trim()
    if (name && name !== entity.name) updateEntity(entity.id, { name })
    setDraft(null)
  }

  if (draft != null) {
    return (
      <input
        className="marker-list__rename"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(null)
        }}
        onFocus={(e) => e.currentTarget.select()}
        // Sonst wuerde jeder Klick ins Feld die umgebende Zeile aus- bzw. abwaehlen.
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    )
  }

  // stopPropagation: Die umgebende Zeile behandelt Klicks ebenfalls - ohne das wuerde die
  // Auswahl doppelt ausgeloest.
  return (
    <span
      className="marker-list__name"
      title="Doppelklick zum Umbenennen"
      onClick={(e) => {
        e.stopPropagation()
        handlers.onClick()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        handlers.onDoubleClick()
      }}
    >
      {entity.name}
    </span>
  )
}

/** Zeile fuer ein Objekt der aktuell betrachteten Karte (nicht im Kampfmodus). */
function EntityRow({
  entity,
  selected,
  onSelect,
  dropdown,
}: {
  entity: Entity
  selected: boolean
  onSelect: (id: string) => void
  dropdown?: React.ReactNode
}) {
  const meta = entityDisplayMeta(entity)
  const handlers = useClickOrDouble(() => onSelect(entity.id), () => {})
  return (
    <li className={dropdown ? 'marker-list__row--expanded' : undefined}>
      {/* Bewusst kein <button>: Der Name wird beim Umbenennen zum Eingabefeld, und ein
          Eingabefeld in einem Knopf waere ungueltig und kaum bedienbar. */}
      <div
        className={`marker-list__item${selected ? ' is-selected' : ''}`}
        style={{ ['--chip-color' as string]: meta.color }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(entity.id)
          }
        }}
        {...handlers}
      >
        <EntityIcon entity={entity} className="marker-list__icon" />
        <RowName entity={entity} onSelect={onSelect} />
      </div>
      {dropdown && <div className="marker-list__dropdown">{dropdown}</div>}
    </li>
  )
}

/** Zeile fuer einen Feind im Kampfmodus, mit direkt editierbarer/wuerfelbarer Initiative. */
function EnemyRow({
  entity,
  selected,
  initiative,
  onSelect,
  onInitiativeChange,
  onRoll,
  dropdown,
}: {
  entity: Entity
  selected: boolean
  initiative: number | null
  onSelect: (id: string) => void
  onInitiativeChange: (value: number | null) => void
  onRoll: () => void
  dropdown?: React.ReactNode
}) {
  const meta = entityDisplayMeta(entity)
  const handlers = useClickOrDouble(() => onSelect(entity.id), () => {})
  return (
    <li className={dropdown ? 'marker-list__row--expanded' : undefined}>
      <div
        className={`marker-list__item enemyrow${selected ? ' is-selected' : ''}`}
        style={{ ['--chip-color' as string]: meta.color }}
      >
        <div className="enemyrow__name" role="button" tabIndex={0} {...handlers}>
          <EntityIcon entity={entity} className="marker-list__icon" />
          <RowName entity={entity} onSelect={onSelect} />
        </div>
        <span className="enemyrow__init">
          <input
            type="number"
            className="enemyrow__init-input"
            value={initiative ?? ''}
            placeholder="–"
            onChange={(e) => onInitiativeChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          <button className="enemyrow__roll" onClick={onRoll} title="Initiative wuerfeln (d20)">
            🎲
          </button>
        </span>
      </div>
      {dropdown && <div className="marker-list__dropdown">{dropdown}</div>}
    </li>
  )
}
