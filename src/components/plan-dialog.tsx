"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, Info, LoaderCircle, LockKeyhole, SlidersHorizontal } from "lucide-react";
import { sensors, type SensorId } from "@/lib/architecture";
import type { MissionPlan, PlanPayload } from "@/lib/plan-validation";
import { Modal } from "./ui";

export function PlanDialog({ plan, sensor, onClose, onSave }: { plan: MissionPlan | null; sensor: SensorId; onClose: () => void; onSave: (payload: PlanPayload, id?: string) => Promise<void> }) {
  const [name, setName] = useState(plan?.name ?? `${sensors.find((item) => item.id === sensor)?.name} → LRO NAC study`);
  const [sourceSensor, setSourceSensor] = useState<SensorId>(plan?.sourceSensor ?? sensor);
  const [sourceId, setSourceId] = useState(plan?.sourceProductId ?? "");
  const [referenceId, setReferenceId] = useState(plan?.referenceProductId ?? "");
  const [tileOverlap, setTileOverlap] = useState(plan?.tileOverlap ?? 20);
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await onSave({ name, sourceSensor, referenceSensor: "lro_nac", sourceProductId: sourceId.trim() || null, referenceProductId: referenceId.trim() || null, tileOverlap, notes }, plan?.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this draft. Please try again.");
      setSaving(false);
    }
  }

  return <Modal title={plan ? "Edit mission plan" : "Plan your lunar study"} eyebrow="ONE SOURCE. ONE REFERENCE." onClose={onClose} busy={saving} className="plan-modal">
    <form onSubmit={submit}>
      <div className="modal-content form-content">
        <div className="subtle-notice"><Info size={17}/><p>A planning draft only. No imagery is downloaded or processed.</p></div>
        <label className="field-label" htmlFor="plan-name">Study name <span>Required</span></label>
        <input data-autofocus id="plan-name" autoComplete="off" className="text-input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100}/>
        <div className="field-label">Source sensor <span>Choose one</span></div>
        <div className="form-sensor-options" role="radiogroup" aria-label="Source sensor">
          {sensors.map((item) => <button type="button" role="radio" aria-checked={sourceSensor === item.id} className={`form-sensor ${sourceSensor === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSourceSensor(item.id)}><span>{item.name}</span>{sourceSensor === item.id && <Check size={14}/>}</button>)}
        </div>
        <div className="fixed-reference"><span>Chandrayaan-2</span><ArrowRight size={15}/><strong>LRO NAC</strong><LockKeyhole size={13}/><span className="push-right">Fixed reference</span></div>
        <div className="form-two-col">
          <div><label className="field-label" htmlFor="source-id">Source product ID <span>Optional</span></label><input id="source-id" className="text-input" value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder="From the official archive" maxLength={200}/></div>
          <div><label className="field-label" htmlFor="reference-id">NAC product ID <span>Optional</span></label><input id="reference-id" className="text-input" value={referenceId} onChange={(event) => setReferenceId(event.target.value)} placeholder="One left or right NAC image" maxLength={200}/></div>
        </div>
        <p className="field-help">IDs are planning references, not validated or acquired products. Do not enter archive credentials.</p>
        <button type="button" className="advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={15}/> Processing intent <ChevronDown size={15} className={advanced ? "rotate" : ""}/></button>
        {advanced && <div className="advanced-fields">
          <label className="field-label" htmlFor="tile-overlap">Long-axis tile overlap <strong>{tileOverlap}%</strong></label>
          <input id="tile-overlap" type="range" min={10} max={50} step={5} value={tileOverlap} onChange={(event) => setTileOverlap(Number(event.target.value))}/><div className="range-labels"><span>10%</span><span>50%</span></div>
          <p className="field-help">Common-GSD normalization and orientation handling precede tiling. Anisotropic search remains off by default. Quality gates cannot be relaxed here.</p>
        </div>}
        <label className="field-label" htmlFor="plan-notes">Study notes <span>{notes.length.toLocaleString()} / 4,000</span></label>
        <textarea id="plan-notes" className="text-input" rows={3} placeholder="Study area, product provenance, questions to investigate…" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000}/>
        {error && <div className="error-notice" role="alert">{error}</div>}
        <p className="privacy-note"><LockKeyhole size={12}/> Saved to this browser’s private planning session. Export to keep a portable copy.</p>
      </div>
      <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} {saving ? "Saving plan…" : "Save mission plan"}</button></div>
    </form>
  </Modal>;
}
