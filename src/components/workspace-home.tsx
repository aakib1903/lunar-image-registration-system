"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Crosshair, FileImage, Focus, GitBranch, Grid2X2, Layers3, LockKeyhole, MapPin, Maximize2, Minus, Orbit, Plus, Radio, RotateCcw, ScanLine, ShieldCheck, Waves } from "lucide-react";
import { sensors, workflow, type SensorId } from "@/lib/architecture";
import { PhaseOnePanel } from "./phase-one";

const sensorIcons = { ohrc: ScanLine, tmc2: Layers3, iirs: Waves };

export function WorkflowStrip({ onStage }: { onStage: (index: number) => void }) {
  return <section className="workflow-panel" aria-label="Proposed registration workflow">
    <div className="section-topline"><h2><GitBranch size={15}/> Registration workflow</h2><span className="workflow-caption">11 stages <span>·</span> One traceable journey</span></div>
    <ol className="workflow-steps">{workflow.map((step, index) => <li key={step.name} className={index === 0 ? "current" : ""}>
      <button onClick={() => onStage(index)} aria-label={`Stage ${index + 1}: ${step.name} — ${index < 4 ? "inspect Phase 1" : "read the proposal"}`}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><span className="step-label">{step.short[0]}<br/>{step.short[1]}</span></button>
    </li>)}</ol>
  </section>;
}

export function WorkspaceHome({ sensor, onSensor, onConfigure, onInspect, onStage, onContext }: { sensor: SensorId; onSensor: (sensor: SensorId) => void; onConfigure: () => void; onInspect: (id: string) => void; onStage: (index: number) => void; onContext: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(true);
  const [phaseStage, setPhaseStage] = useState<{ index: number; nonce: number } | null>(null);
  const selected = sensors.find((item) => item.id === sensor)!;
  const guardrails = [
    { icon: MapPin, title: "Overlap comes first", text: "Validate geography before matching a single pixel.", section: "G" },
    { icon: Maximize2, title: "Physical scale matters", text: "Common GSD. Full strips. No blind resizing.", section: "H" },
    { icon: Focus, title: "Evidence, not guesswork", text: "Robust matches with spatially distributed support.", section: "I" },
    { icon: ShieldCheck, title: "Success is earned", text: "Every quality gate passes. Or the result doesn’t.", section: "J" },
  ];

  return <>
    <div className="principle-banner"><span className="banner-icon"><ShieldCheck size={16}/></span><p><strong>Real lunar data. Rigorous science.</strong><span> No synthetic inputs. No simulated success.</span></p><span className="small-label">SIH / PS 26166</span></div>
    <WorkflowStrip onStage={index => index < 4 ? setPhaseStage({ index, nonce: Date.now() }) : onStage(index)}/>
    <div className="workspace-grid">
      <section className="panel pair-panel">
        <div className="panel-header"><h2><Crosshair size={17}/> Define your image pair</h2><span className="neutral-badge">1 : 1 pairing</span></div>
        <div className="pair-body">
          <div className="input-caption"><span><i className="micro-dot"/> SOURCE SENSOR</span><span>Chandrayaan-2</span></div>
          <div className="sensor-options" role="radiogroup" aria-label="Choose source sensor">{sensors.map((item) => { const Icon = sensorIcons[item.id]; return <button key={item.id} className={`sensor-card ${sensor === item.id ? "selected" : ""}`} role="radio" aria-checked={sensor === item.id} onClick={() => onSensor(item.id)}>
            <span className="sensor-card-top"><Icon size={21} strokeWidth={1.5}/><span className="radio-mark">{sensor === item.id && <Check size={10} strokeWidth={3}/>}</span></span>
            <strong>{item.name}</strong><span className="sensor-description">{item.description}</span>
          </button>; })}</div>
          <div className="sensor-spec"><span>Nominal GSD <strong>{selected.resolution} / px</strong></span><button onClick={() => onInspect("E")} aria-label="Read sensor specifications"><CircleHelp size={13}/><span>Sensor details</span></button></div>
          <a className="archive-selector" href="https://pradan.issdc.gov.in/ch2/" target="_blank" rel="noreferrer"><span className="archive-icon"><FileImage size={21} strokeWidth={1.5}/></span><span><strong>Find a real source product</strong><small>Explore the official ISRO / ISSDC archive</small></span><ArrowUpRight size={17}/></a>
          <div className="pair-connector"><span/><span className="connector-arrow"><ArrowDown size={13}/></span><span/></div>
          <div className="input-caption reference-caption"><span>REFERENCE SENSOR</span><span><LockKeyhole size={11}/> Fixed for every run</span></div>
          <button className="reference-box" onClick={() => onInspect("E")}><span className="reference-icon"><Orbit size={25} strokeWidth={1.3}/></span><span><strong>LRO NAC</strong><small>Lunar Reconnaissance Orbiter</small></span><span className="reference-badge">NASA</span><ChevronRight size={15}/></button>
          <p className="pair-rule"><GitBranch size={12}/> One source image → one NAC reference. Never a three-sensor stack.</p>
        </div>
        <div className="pair-footer"><span><i className="status-dot"/> Planning mode</span><button className="button button-primary" onClick={onConfigure}>Configure pair <ArrowRight size={15}/></button></div>
      </section>
      <section className="panel context-panel">
        <div className="panel-header"><h2><Orbit size={17}/> Lunar context</h2><span className="context-source"><i className="micro-dot"/> LRO / WAC</span></div>
        <div className={`moon-stage ${grid ? "show-grid" : ""}`}>
          <div className="context-overline"><span>LUNAR NEARSIDE</span><span>CONTEXT ONLY</span></div>
          <div className="moon-image-wrap"><Image className="moon-image" src="/images/lro-nearside.jpg" alt="NASA LRO WAC photographic mosaic of the lunar nearside, PIA14011. Context only, never a NAC reference or a run input." width={1024} height={1024} style={{ transform: `scale(${zoom})` }} unoptimized priority/></div>
          <span className="frame-corner top-left"/><span className="frame-corner top-right"/><span className="frame-corner bottom-left"/><span className="frame-corner bottom-right"/>
          <button className="context-expand viewer-control" onClick={onContext} aria-label="Expand credited lunar context image" title="Expand context"><Maximize2 size={14}/></button>
          <div className="context-layer-controls"><button className={`viewer-control ${grid ? "active" : ""}`} onClick={() => setGrid(!grid)} aria-label="Toggle illustrative viewer grid" aria-pressed={grid} title="Toggle viewer grid"><Grid2X2 size={15}/></button><button className="viewer-control" onClick={() => setZoom(1)} aria-label="Reset context zoom" title="Reset view"><RotateCcw size={14}/></button></div>
          <div className="context-zoom-controls"><button className="viewer-control" onClick={() => setZoom(Math.min(2, zoom + 0.25))} disabled={zoom >= 2} aria-label="Zoom into lunar context" title="Zoom in"><Plus size={16}/></button><span>{Math.round(zoom * 100)}%</span><button className="viewer-control" onClick={() => setZoom(Math.max(1, zoom - 0.25))} disabled={zoom <= 1} aria-label="Zoom out of lunar context" title="Zoom out"><Minus size={16}/></button></div>
          <div className="image-disclaimer"><span className="cross-mark">+</span> NO PRODUCT FOOTPRINTS LOADED</div>
        </div>
        <div className="context-description"><div><h3>A shared patch of the Moon.</h3><p>Geographic overlap comes before image matching.</p></div><button className="circle-button" onClick={() => onInspect("G")} aria-label="Explore the geographic overlap design"><ArrowUpRight size={17}/></button></div>
        <div className="context-footer"><span className="pending-status"><i/> Awaiting product metadata</span><a href="https://science.nasa.gov/photojournal/nearside-spectacular/" target="_blank" rel="noreferrer" title="Image credit: NASA / GSFC / Arizona State University. WAC mosaic PIA14011, context only.">NASA / ASU <ArrowUpRight size={11}/></a></div>
      </section>
    </div>
    <PhaseOnePanel sensor={sensor} onSensor={onSensor} requestedStage={phaseStage}/>
    <section className="guardrails-section"><div className="section-topline"><h2>Built on scientific guardrails</h2><Link href="/?view=quality" className="text-link">Explore quality framework <ArrowRight size={13}/></Link></div><div className="guardrail-grid">{guardrails.map(({ icon: Icon, title, text, section }) => <button key={title} className="guardrail-card" onClick={() => onInspect(section)}><Icon size={20} strokeWidth={1.6}/><h3>{title}</h3><p>{text}</p></button>)}</div></section>
    <div className="scope-note"><Radio size={16}/><p><strong>Phase 1 · Metadata foundation</strong><span> Real label inspection and geographic validation are available. Matching, registration, and all later processing remain unimplemented.</span></p><Link href="/?view=architecture" aria-label="Read the full architecture proposal"><ArrowUpRight size={16}/></Link></div>
  </>;
}
