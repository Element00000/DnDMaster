import { useEffect, useRef, useState } from 'react'
import { phaseAt } from '../types'
import { useStore } from '../store/useStore'

/**
 * Phasen der Kampagne: Auswahl in der oberen Leiste und die Abfrage, mit der die naechste
 * Phase betreten wird.
 *
 * Eine Phase ist ein Kapitel auf dem einen, durchlaufenden Kalender. Ihr Ende traegt man
 * hier ein; sobald der Kalender darueber hinaus soll, fragt das Tool nach, statt die naechste
 * Phase stillschweigend anzulegen - ein Kapitelwechsel ist nichts, was nebenbei passieren
 * darf.
 */
export function PhaseBar() {
  const campaign = useStore((s) => s.activeCampaign())
  const currentDay = useStore((s) => s.currentDay)
  const setCurrentDay = useStore((s) => s.setCurrentDay)
  const setPhaseEnd = useStore((s) => s.setPhaseEnd)
  const renamePhase = useStore((s) => s.renamePhase)
  const enterNextPhase = useStore((s) => s.enterNextPhase)
  const pendingPhaseDay = useStore((s) => s.pendingPhaseDay)
  const askEnterNextPhase = useStore((s) => s.askEnterNextPhase)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const phases = campaign.phases
  const active = phaseAt(phases, currentDay) ?? phases[phases.length - 1]
  const last = phases[phases.length - 1]

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div className="phasebar" ref={ref}>
      <button
        className="phasebar__btn"
        onClick={() => setOpen((v) => !v)}
        title="Phasen der Kampagne"
      >
        ❖ {active?.name ?? 'Phase'}
      </button>

      {open && (
        <div className="phasebar__menu">
          <ul className="phasebar__list">
            {phases.map((p) => (
              <li key={p.id}>
                <button
                  className={`phasebar__item${p.id === active?.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setCurrentDay(p.startDay)
                    setOpen(false)
                  }}
                  title={`Zum Anfang von ${p.name} springen`}
                >
                  <span className="phasebar__name">{p.name}</span>
                  <span className="phasebar__days">
                    Tag {p.startDay}
                    {p.endDay != null ? `–${p.endDay}` : '– …'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="phasebar__edit">
            <label className="phasebar__field">
              <span>Name</span>
              <input
                className="field__control field__control--sm"
                value={active?.name ?? ''}
                onChange={(e) => active && renamePhase(active.id, e.target.value)}
              />
            </label>
            <label className="phasebar__field">
              <span>Endet an Tag</span>
              <input
                className="field__control field__control--sm"
                type="number"
                min={active?.startDay ?? 1}
                value={active?.endDay ?? ''}
                placeholder="offen"
                onChange={(e) =>
                  active &&
                  setPhaseEnd(active.id, e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </label>
            {/* Fuer den Fall, dass es am Tisch anders kommt als geplant: Das Kapitel endet
                dann eben heute. */}
            <button
              className="btn btn--sm"
              onClick={() => active && setPhaseEnd(active.id, currentDay)}
              disabled={!active || active.endDay === currentDay}
            >
              Phase hier beenden (Tag {currentDay})
            </button>
          </div>
        </div>
      )}

      {pendingPhaseDay !== null && last && (
        <div className="phaseask">
          <div className="phaseask__box">
            <h3 className="phaseask__title">Naechste Phase betreten?</h3>
            <p className="phaseask__text">
              <strong>{last.name}</strong> endet an Tag {last.endDay}. Tag {pendingPhaseDay} gehoert
              schon zum naechsten Kapitel.
            </p>
            <p className="phaseask__text phaseask__text--dim">
              Jede Figur beginnt dort, wo sie am Ende dieser Phase steht. Bewegungen werden nicht
              uebernommen — den taeglichen Ablauf kannst du beim Oeffnen der Zeitleiste einzeln
              uebernehmen.
            </p>
            <div className="phaseask__actions">
              <button className="btn btn--sm" onClick={() => askEnterNextPhase(null)}>
                Abbrechen
              </button>
              <button className="btn btn--sm btn--primary" onClick={enterNextPhase}>
                Phase betreten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
