import { useRef, useState } from 'react'
import {
  ENTITY_TYPES,
  FIELD_SCHEMA,
  FREUND_BERUFE,
  RELATIONS,
  entityMeta,
  relationMeta,
} from '../types'
import type { Entity, EntityType, RelationType, Visibility } from '../types'
import { useStore } from '../store/useStore'
import { formatTime, parseTime } from '../utils/time'
import { fileToScaledDataUrl } from '../utils/image'
import { deleteAsset, putAsset } from '../utils/assets'
import { DecisionEditor } from './DecisionEditor'
import { EventEditor } from './EventEditor'
import { AssetImg } from './AssetImg'

export function DetailPanel() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const selectedId = useStore((s) => s.selectedEntityId)
  const playerMode = useStore((s) => s.playerMode)
  const updateEntity = useStore((s) => s.updateEntity)
  const setEntityField = useStore((s) => s.setEntityField)
  const deleteEntity = useStore((s) => s.deleteEntity)
  const selectEntity = useStore((s) => s.selectEntity)
  const addLink = useStore((s) => s.addLink)
  const removeLink = useStore((s) => s.removeLink)
  const setPlacement = useStore((s) => s.setPlacement)
  const setPlacingEntity = useStore((s) => s.setPlacingEntity)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const setToolsOpen = useStore((s) => s.setToolsOpen)
  const setToolsTab = useStore((s) => s.setToolsTab)

  const marker = campaign.entities.find((e) => e.id === selectedId) ?? null

  if (!selectedId || !marker) {
    return (
      <aside className="detail detail--empty">
        <p>Klicke ein Objekt auf der Karte oder in der Liste, um seine Details zu sehen.</p>
      </aside>
    )
  }

  const meta = entityMeta(marker.type)
  const fields = FIELD_SCHEMA[marker.type]
  const others = campaign.entities.filter((e) => e.id !== marker.id)
  // Eingehende Verknuepfungen (andere Objekte, die auf dieses zeigen).
  const incoming = campaign.entities
    .filter((e) => e.id !== marker.id)
    .flatMap((e) => e.links.filter((l) => l.targetId === marker.id).map((l) => ({ from: e, relation: l.relation })))

  const readOnly = playerMode

  return (
    <aside className="detail" style={{ ['--chip-color' as string]: meta.color }}>
      <div className="detail__header">
        <span className="detail__icon">{meta.icon}</span>
        <input
          className="detail__title-input"
          value={marker.name}
          onChange={(e) => updateEntity(marker.id, { name: e.target.value })}
          placeholder="Name"
          disabled={readOnly}
        />
        <button className="detail__close" onClick={() => selectEntity(null)} title="Schliessen">
          &times;
        </button>
      </div>

      <div className="detail__body">
        {marker.imageUrl && (
          <div className="detail__portrait">
            <AssetImg refUrl={marker.imageUrl} alt={marker.name} />
            {!readOnly && (
              <button
                className="detail__portrait-x"
                title="Bild entfernen"
                onClick={() => updateEntity(marker.id, { imageUrl: null })}
              >
                &times;
              </button>
            )}
          </div>
        )}

        {!readOnly && (
          <button
            className="btn btn--sm btn--full detail__ai"
            onClick={() => {
              setToolsTab('ki')
              setToolsOpen(true)
            }}
            title="KI-Werkzeug fuer dieses Objekt oeffnen"
          >
            ✨ KI: Text, Dialog oder Portrait erzeugen
          </button>
        )}

        {!readOnly && (
          <label className="field">
            <span className="field__label">Typ</span>
            <select
              className="field__control"
              value={marker.type}
              onChange={(e) => updateEntity(marker.id, { type: e.target.value as EntityType })}
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
          </label>
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
        {!playerMode && (
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

        {marker.type === 'nsc' && marker.fields.gesinnung === 'feind' && (
          <FeindFields
            entity={marker}
            readOnly={readOnly}
            onImageChange={(ref) => updateEntity(marker.id, { imageUrl: ref })}
            onFieldChange={(key, value) => setEntityField(marker.id, key, value)}
          />
        )}

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

        {/* Verknuepfungen */}
        <div className="field">
          <span className="field__label">Verknuepfungen</span>
          <LinksEditor
            entity={marker}
            others={others}
            incoming={incoming}
            readOnly={readOnly}
            onAdd={addLink}
            onRemove={removeLink}
            onNavigate={selectEntity}
          />
        </div>

        {!readOnly && (
          <>
            <TimeFields entity={marker} onUpdate={(patch) => updateEntity(marker.id, patch)} />

            <label className="field">
              <span className="field__label">Sichtbarkeit</span>
              <select
                className="field__control"
                value={marker.visibility}
                onChange={(e) => updateEntity(marker.id, { visibility: e.target.value as Visibility })}
              >
                <option value="dm">Nur DM</option>
                <option value="spieler">Fuer Spieler entdeckt</option>
              </select>
            </label>

            <div className="field field--row">
              <span className="field__label">Auf Karte</span>
              {marker.placement ? (
                <button className="btn btn--ghost btn--sm" onClick={() => setPlacement(marker.id, null)}>
                  Von Karte entfernen
                </button>
              ) : (
                <button className="btn btn--sm" onClick={() => setPlacingEntity(marker.id)}>
                  Auf Karte platzieren
                </button>
              )}
            </div>

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
    </aside>
  )
}

function TimeFields({
  entity,
  onUpdate,
}: {
  entity: Entity
  onUpdate: (patch: Partial<Entity>) => void
}) {
  const hasWindow = entity.timeStart != null && entity.timeEnd != null
  return (
    <div className="field">
      <span className="field__label">Zeit</span>
      <div className="timefields">
        <div className="timefields__row">
          <label className="timefields__cell">
            <span className="timefields__mini">Kalendertag</span>
            <input
              className="field__control field__control--sm"
              type="number"
              min={0}
              value={entity.day ?? ''}
              placeholder="z.B. 12"
              onChange={(e) =>
                onUpdate({ day: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
        </div>

        <div className="timefields__row">
          <label className="timefields__cell">
            <span className="timefields__mini">Von</span>
            <input
              className="field__control field__control--sm"
              type="time"
              value={entity.timeStart != null ? formatTime(entity.timeStart) : ''}
              onChange={(e) => onUpdate({ timeStart: parseTime(e.target.value) })}
            />
          </label>
          <label className="timefields__cell">
            <span className="timefields__mini">Bis</span>
            <input
              className="field__control field__control--sm"
              type="time"
              value={entity.timeEnd != null ? formatTime(entity.timeEnd) : ''}
              onChange={(e) => onUpdate({ timeEnd: parseTime(e.target.value) })}
            />
          </label>
        </div>

        <p className="timefields__hint">
          {hasWindow
            ? entity.timeStart! > entity.timeEnd!
              ? 'Zeitfenster laeuft ueber Mitternacht.'
              : 'Nur im Zeitfenster auf der Karte sichtbar.'
            : 'Ohne Zeitfenster immer sichtbar. Beide Felder setzen zum Filtern.'}
          {hasWindow && (
            <button
              className="timefields__clear"
              onClick={() => onUpdate({ timeStart: null, timeEnd: null })}
            >
              Fenster loeschen
            </button>
          )}
        </p>
      </div>
    </div>
  )
}

function LinksEditor({
  entity,
  others,
  incoming,
  readOnly,
  onAdd,
  onRemove,
  onNavigate,
}: {
  entity: Entity
  others: Entity[]
  incoming: { from: Entity; relation: RelationType }[]
  readOnly: boolean
  onAdd: (fromId: string, targetId: string, relation: RelationType) => void
  onRemove: (fromId: string, targetId: string, relation: RelationType) => void
  onNavigate: (id: string) => void
}) {
  const [relation, setRelation] = useState<RelationType>('befindet_sich_in')
  const [targetId, setTargetId] = useState('')

  const byId = (id: string) => others.find((e) => e.id === id)

  return (
    <div className="links">
      {entity.links.length === 0 && incoming.length === 0 && (
        <p className="links__empty">Keine Verknuepfungen.</p>
      )}

      <ul className="links__list">
        {entity.links.map((l) => {
          const target = byId(l.targetId)
          if (!target) return null
          const tMeta = entityMeta(target.type)
          return (
            <li key={`${l.targetId}-${l.relation}`} className="links__item">
              <span className="links__rel">{relationMeta(l.relation).label}</span>
              <button className="links__target" onClick={() => onNavigate(target.id)} style={{ ['--chip-color' as string]: tMeta.color }}>
                <span>{tMeta.icon}</span>
                {target.name}
              </button>
              {!readOnly && (
                <button
                  className="links__remove"
                  title="Verknuepfung entfernen"
                  onClick={() => onRemove(entity.id, l.targetId, l.relation)}
                >
                  &times;
                </button>
              )}
            </li>
          )
        })}

        {/* Eingehend, nur zur Anzeige */}
        {incoming.map(({ from, relation: rel }) => {
          const fMeta = entityMeta(from.type)
          return (
            <li key={`in-${from.id}-${rel}`} className="links__item links__item--incoming">
              <span className="links__rel">{relationMeta(rel).inverseLabel}</span>
              <button className="links__target" onClick={() => onNavigate(from.id)} style={{ ['--chip-color' as string]: fMeta.color }}>
                <span>{fMeta.icon}</span>
                {from.name}
              </button>
            </li>
          )
        })}
      </ul>

      {!readOnly && others.length > 0 && (
        <div className="links__add">
          <select className="field__control field__control--sm" value={relation} onChange={(e) => setRelation(e.target.value as RelationType)}>
            {RELATIONS.map((r) => (
              <option key={r.relation} value={r.relation}>
                {r.label}
              </option>
            ))}
          </select>
          <select className="field__control field__control--sm" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Objekt waehlen ...</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {entityMeta(e.type).icon} {e.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn--sm"
            disabled={!targetId}
            onClick={() => {
              if (targetId) {
                onAdd(entity.id, targetId, relation)
                setTargetId('')
              }
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}

function FeindFields({
  entity,
  readOnly,
  onImageChange,
  onFieldChange,
}: {
  entity: Entity
  readOnly: boolean
  onImageChange: (ref: string) => void
  onFieldChange: (key: string, value: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const prev = entity.imageUrl
    const { url } = await fileToScaledDataUrl(file, { maxDim: 900, quality: 0.82 })
    const ref = await putAsset(url)
    onImageChange(ref)
    void deleteAsset(prev)
  }

  return (
    <>
      {!readOnly && (
        <div className="field field--row">
          <span className="field__label">Bild</span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <button className="btn btn--sm" onClick={() => fileRef.current?.click()}>
            {entity.imageUrl ? 'Bild ersetzen' : 'Bild hochladen'}
          </button>
        </div>
      )}

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
