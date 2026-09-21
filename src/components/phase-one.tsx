"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, Database, Download, FileSearch, FileText, Info, Link2, LoaderCircle, LockKeyhole, MapPin, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { sensors, type SensorId } from "@/lib/architecture";
import { MAX_HEADER_BYTES, MAX_METADATA_BYTES, type ScientificPair, type ScientificProduct } from "@/science/types";
import type { ProductSubmission } from "@/science/input";
import { Modal } from "./ui";

const label = (state: string) => state.replace(/_/g, " ");
const sensorName = (sensor: string) => sensor === "lro_nac" ? "LRO NAC" : sensors.find(item=>item.id===sensor)?.name ?? sensor;
async function scienceRequest<T>(url:string,body?:unknown):Promise<T> {
  const response=await fetch(url,{method:body===undefined?"GET":"POST",cache:"no-store",...(body===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error?.message??data.needed?.join("; ")??"The metadata service could not complete this request.");
  return data as T;
}
type InputChoice={mode:"upload"|"archive";file:File|null;url:string};
const blankChoice=():InputChoice=>({mode:"upload",file:null,url:""});
async function buildInput(choice:InputChoice):Promise<ProductSubmission["input"]> {
  if(choice.mode==="archive") {
    if(!choice.url.trim()) throw new Error("Provide the official metadata URL for both products.");
    return {kind:"archive",url:choice.url.trim()};
  }
  const file=choice.file;
  if(!file) throw new Error("Choose one source metadata file and one reference metadata file.");
  const header=/\.(img|cub)$/i.test(file.name);
  if(!header && file.size>MAX_METADATA_BYTES) throw new Error(`${file.name}: label exceeds 256 KiB. Large products are not uploaded.`);
  if(!/\.(xml|lbl|lab|pvl|json|img|cub)$/i.test(file.name)) throw new Error("Use XML/PVL labels, GDAL JSON, or an IMG/CUB text header. TIFF, ZIP and SPICE uploads are not accepted.");
  let bytes=new Uint8Array(await file.slice(0,header?MAX_HEADER_BYTES:MAX_METADATA_BYTES).arrayBuffer());
  if(header){
    let text="";for(const value of bytes)text+=String.fromCharCode(value);
    const match=text.match(/(?:^|\r?\n)END[ \t]*(?:\r?\n|$)/i);
    if(!match || match.index===undefined)throw new Error("No complete text label was found in the first 64 KiB. Supply its detached XML/PVL; no more of this product will be read.");
    bytes=bytes.slice(0,match.index+match[0].length);
  }
  let binary="";for(const value of bytes)binary+=String.fromCharCode(value);
  return {kind:"upload",fileName:file.name,contentBase64:btoa(binary),scope:header?"ATTACHED_LABEL_ONLY":"COMPLETE_METADATA_FILE",originalByteLength:file.size};
}

function ProductInput({role,sensor,value,onChange,disabled}:{role:"source"|"reference";sensor:string;value:InputChoice;onChange:(choice:InputChoice)=>void;disabled:boolean}) {
  const title=role==="source"?"Source":"Reference";
  return <section className="science-input-card"><div className="science-input-heading"><span>{title}</span><strong>{sensorName(sensor)}</strong><span className="neutral-badge">Exactly one</span></div>
    <div className="science-mode-switch"><button type="button" disabled={disabled} aria-pressed={value.mode==="upload"} onClick={()=>onChange({...value,mode:"upload"})}><Upload size={13}/> Local metadata</button><button type="button" disabled={disabled} aria-pressed={value.mode==="archive"} onClick={()=>onChange({...value,mode:"archive"})}><Link2 size={13}/> Official archive URL</button></div>
    {value.mode==="upload"?<><label className="science-file-label" htmlFor={`science-${role}-file`}><FileText size={21}/><span>{value.file?.name??`Choose ${title.toLowerCase()} label`}<small>{value.file?`${value.file.size.toLocaleString()} bytes on disk · read-only` : "XML · LBL · PVL · GDAL JSON · IMG/CUB header"}</small></span></label><input id={`science-${role}-file`} aria-label={`${title} metadata file`} type="file" accept=".xml,.lbl,.lab,.pvl,.json,.img,.cub" disabled={disabled} onChange={event=>onChange({...value,file:event.target.files?.length===1?event.target.files[0]:null})}/></>:<><label className="field-label" htmlFor={`science-${role}-url`}>{title} metadata URL</label><input className="text-input" id={`science-${role}-url`} type="url" value={value.url} disabled={disabled} placeholder="https://official-archive/…/product.xml" onChange={event=>onChange({...value,url:event.target.value})}/><p className="field-help">Allowlisted HTTPS archives only. Protected PRADAN data requires official login and an authorized local label.</p></>}
  </section>;
}

function PairInputDialog({sensor,onClose,onSubmit}:{sensor:SensorId;onClose:()=>void;onSubmit:(pair:ScientificPair)=>void}) {
  const [source,setSource]=useState<InputChoice>(blankChoice),[reference,setReference]=useState<InputChoice>(blankChoice);
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[error,setError]=useState("");
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError("");
    try{
      const [sourceInput,referenceInput]=await Promise.all([buildInput(source),buildInput(reference)]);
      // Sequential requests establish the HttpOnly owner cookie before creating the second product.
      setProgress("Inspecting source metadata…");
      const s=await scienceRequest<{product:ScientificProduct}>("/api/science/products",{role:"source",sensor,input:sourceInput});
      setProgress("Inspecting the single NAC reference…");
      const r=await scienceRequest<{product:ScientificProduct}>("/api/science/products",{role:"reference",sensor:"lro_nac",input:referenceInput});
      setProgress("Saving immutable one-to-one pair…");
      const response=await scienceRequest<{pair:ScientificPair}>("/api/science/pairs",{sourceProductId:s.product.id,referenceProductId:r.product.id});
      onSubmit(response.pair);
    }catch(caught){setError(caught instanceof Error?caught.message:"Metadata inspection could not be completed.");setBusy(false);setProgress("");}
  }
  return <Modal title="Inspect one real image pair" eyebrow="PHASE 1 / METADATA ONLY" className="science-input-modal" onClose={onClose} busy={busy}><form onSubmit={submit}><div className="modal-content">
    <div className="subtle-notice"><LockKeyhole size={17}/><p>Originals stay read-only. Only labels (up to 256 KiB) or complete text headers from the first 64 KiB of IMG/CUB files are inspected. No large products, TIFF pixels, or SPICE files are transferred.</p></div>
    <ProductInput role="source" sensor={sensor} value={source} onChange={setSource} disabled={busy}/><div className="science-pair-arrow"><ArrowRight size={17}/></div><ProductInput role="reference" sensor="lro_nac" value={reference} onChange={setReference} disabled={busy}/>
    <div className="science-authority-note"><Info size={15}/><p>Uploads are unverified unless their exact hash has been independently reviewed. Archive-origin metadata still needs an explicit lunar frame, datum and footprint. Missing values will not be guessed.</p></div>
    {busy&&<p className="science-progress" role="status"><LoaderCircle size={15} className="spin"/> {progress}</p>}{error&&<div className="error-notice" role="alert">{error}<small>Any inspected snapshots remain read-only. No registration was attempted.</small></div>}
    </div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy?<LoaderCircle size={15} className="spin"/>:<FileSearch size={15}/>} {busy?"VALIDATING":"Inspect metadata & create pair"}</button></div></form></Modal>;
}

function ProductSummary({product,title,onInspect}:{product:ScientificProduct|null;title:string;onInspect:()=>void}) {
  const metadata=product?.metadata;
  return <div className="science-product-summary"><div><span className="eyebrow">{title}</span><strong>{product?sensorName(product.selectedSensor):"NOT SELECTED"}</strong></div><p title={String(metadata?.fields.productId?.value??"")}>{String(metadata?.fields.productId?.value??"No metadata-confirmed product ID")}</p><dl><div><dt>Metadata</dt><dd data-state={metadata?.status??"NOT_EVALUATED"}>{label(metadata?.status??"NOT_EVALUATED")}</dd></div><div><dt>Footprint</dt><dd data-state={product?.footprint.status??"NOT_EVALUATED"}>{label(product?.footprint.status??"NOT_EVALUATED")}</dd></div></dl><button className="text-link" onClick={onInspect} disabled={!product}><FileSearch size={13}/> Inspect fields & provenance <ArrowRight size={12}/></button></div>;
}

function EvidenceDialog({product,onClose,initialFootprint}:{product:ScientificProduct;onClose:()=>void;initialFootprint:boolean}) {
  const [tab,setTab]=useState(initialFootprint?"footprint":"metadata");
  const fields=Object.entries(product.metadata.fields).filter(([,value])=>value!==null);
  return <Modal title={`${sensorName(product.selectedSensor)} · metadata evidence`} eyebrow={`${product.role.toUpperCase()} / READ-ONLY SNAPSHOT`} className="science-evidence-modal" onClose={onClose}><div className="modal-content">
    <div className="science-snapshot"><span>{product.snapshot.fileName}</span><code>SHA-256 {product.snapshot.sha256}</code><small>{product.snapshot.byteLength.toLocaleString()} inspected bytes · {label(product.snapshot.scope)} · {label(product.snapshot.authority.status)}</small><p>{product.snapshot.authority.reason}</p>{product.snapshot.authority.uri&&<p>Archive citation: {product.snapshot.authority.uri}</p>}</div>
    <div className="tabs"><button onClick={()=>setTab("metadata")} className={tab==="metadata"?"active":""}>Metadata fields</button><button onClick={()=>setTab("footprint")} className={tab==="footprint"?"active":""}>Footprint & CRS</button></div>
    {tab==="metadata"?<><div className="science-field-table">{fields.map(([name,value])=><details key={name}><summary><span>{name}</span><strong>{Array.isArray(value!.value)?value!.value.join(", "):String(value!.value)}{value!.unit&&<small> {value!.unit}</small>}</strong><ChevronDown size={12}/></summary><div>{value!.provenance.map((entry,i)=><dl key={i}>{Object.entries({File:entry.file,Field:entry.field,Method:entry.method,"Original units":entry.unit??"Not declared",CRS:entry.crs??"Not declared",Datum:entry.datum??"Not declared"}).map(([key,v])=><div key={key}><dt>{key}</dt><dd>{v}</dd></div>)}</dl>)}</div></details>)}</div><details className="science-raw"><summary>All parsed fields, including uninterpreted metadata</summary><pre>{JSON.stringify(product.metadata.rawFields,null,2)}</pre></details></>:<><div className="subtle-notice"><MapPin size={17}/><p>{label(product.footprint.status)} · {product.footprint.kind?label(product.footprint.kind):"No footprint"}. Coordinates belong to the declared lunar frame, not Earth WGS84.</p></div><pre className="science-json">{JSON.stringify(product.footprint,null,2)}</pre></>}
    <div className="science-required"><h3>Missing information</h3>{[...new Set([...product.metadata.missing,...product.footprint.missing])].length?<ul>{[...new Set([...product.metadata.missing,...product.footprint.missing])].map(item=><li key={item}>{item}</li>)}</ul>:<p>No required fields are absent. Provenance and geometry checks still determine overlap eligibility.</p>}</div><details className="science-raw"><summary>Limitations and interpretation</summary><ul>{[...product.metadata.limitations,...product.footprint.limitations].map((item,i)=><li key={i}>{item}</li>)}</ul></details>
    </div><div className="modal-footer"><span className="modal-scope-label">Inspection is not registration.</span><button className="button button-secondary" onClick={onClose}>Close</button></div></Modal>;
}

export function PhaseOnePanel({sensor,onSensor,requestedStage}:{sensor:SensorId;onSensor:(sensor:SensorId)=>void;requestedStage:{index:number;nonce:number}|null}) {
  const ref=useRef<HTMLElement>(null);
  const [pair,setPair]=useState<ScientificPair|null>(null),[inputOpen,setInputOpen]=useState(false),[inspected,setInspected]=useState<ScientificProduct|null>(null);
  const [footprintTab,setFootprintTab]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const result=await scienceRequest<{pairs:{id:string}[]}>("/api/science/pairs");
      if(result.pairs[0]) {const data=await scienceRequest<{pair:ScientificPair}>(`/api/science/pairs/${result.pairs[0].id}`);setPair(data.pair);onSensor(data.pair.source.selectedSensor as SensorId);}
    }catch(caught){setError(caught instanceof Error?caught.message:"Could not load metadata session.");}finally{setLoading(false);}
  },[onSensor]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(pair && pair.source.selectedSensor!==sensor)setPair(null);},[sensor,pair]);
  useEffect(()=>{
    if(!requestedStage)return;
    ref.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"center"});
    if(requestedStage.index<2)setInputOpen(true);
    else setFootprintTab(requestedStage.index===3);
  },[requestedStage]);
  async function validate(){if(!pair)return;setBusy(true);setError("");try{const result=await scienceRequest<{report:NonNullable<ScientificPair["report"]>}>(`/api/science/pairs/${pair.id}/overlap`,{});setPair({...pair,state:result.report.status,report:result.report});}catch(caught){setError(caught instanceof Error?caught.message:"Overlap validation was unavailable.");}finally{setBusy(false);}}
  const state=busy?"VALIDATING":pair?.state??"NOT_EVALUATED";
  return <section className="panel phase1-panel" ref={ref} id="phase1-foundation" aria-label="Phase 1 metadata and overlap">
    <div className="panel-header"><h2><Database size={17}/> Real-product metadata & overlap</h2><span className="neutral-badge">PHASE 1</span></div>
    <div className="phase1-content"><div className="phase1-intro"><p>Inspect one {sensorName(sensor)} product and one LRO NAC reference. Only metadata is processed.</p><button className="button button-secondary button-small" onClick={()=>setInputOpen(true)} disabled={busy||loading}><Upload size={13}/> {pair?"Inspect a new pair":"Inspect real products"}</button></div>
    {loading?<div className="science-progress"><LoaderCircle size={15} className="spin"/> Loading this session’s metadata…</div>:<div className="science-product-grid"><ProductSummary title="SOURCE" product={pair?.source??null} onInspect={()=>setInspected(pair!.source)}/><ProductSummary title="REFERENCE" product={pair?.reference??null} onInspect={()=>setInspected(pair!.reference)}/></div>}
    <div className="science-overlap-bar"><div><MapPin size={16}/><span>Geographic overlap</span><strong data-state={state} role="status">{label(state)}</strong></div><button className="button button-primary" disabled={!pair||busy||loading} onClick={()=>void validate()}>{busy?<LoaderCircle size={14} className="spin"/>:<RefreshCw size={14}/>} {busy?"Validating…":pair?.report?"Revalidate overlap":"Validate overlap"}</button></div>
    {pair?.report&&<div className="science-report"><p>{pair.report.reason}</p>{pair.report.intersection&&<div className="science-overlap-values"><span>Footprint intersection: <strong>{pair.report.intersection.areaSquareMetres.toLocaleString(undefined,{maximumFractionDigits:2})} m²</strong></span>{pair.report.overlapPercentage&&<span>Source / reference extent: <strong>{pair.report.overlapPercentage.source.toFixed(3)}% / {pair.report.overlapPercentage.reference.toFixed(3)}%</strong></span>}<small>Metadata geometry only; not valid-pixel coverage or registration metrics.</small></div>}{pair.report.missing.length>0&&<details className="science-missing" open><summary>Exactly what is needed <span>{pair.report.missing.length}</span></summary><ul>{pair.report.missing.map((item,i)=><li key={i}>{item}</li>)}</ul></details>}<details className="science-raw"><summary>Provenance, algorithm, and limitations</summary><p>{pair.report.algorithm.name}</p><ul>{pair.report.limitations.map((item,i)=><li key={i}>{item}</li>)}</ul></details><a className="text-link" href={`/api/science/pairs/${pair.id}/report?download=1`} download><Download size={14}/> Download overlap validation report</a></div>}
    {!pair?.report&&<p className="science-empty-note">{pair?"Metadata was inspected. Geographic overlap has not been evaluated; use the button above to request it.":"No pair has been submitted. Missing geography will be reported—not inferred from filenames, dimensions, or appearance."}</p>}
    {error&&<div className="error-notice" role="alert">{error}<button className="text-link" onClick={()=>void load()}>Reload stored metadata</button></div>}
    <div className="science-phase-limit"><ShieldCheck size={14}/><span>No matching, registration, RMSE, match points, or registered products. An overlap decision is not registration success.</span></div></div>
    {inputOpen&&<PairInputDialog sensor={sensor} onClose={()=>setInputOpen(false)} onSubmit={newPair=>{setPair(newPair);setInputOpen(false);setError("");}}/>}
    {inspected&&<EvidenceDialog product={inspected} initialFootprint={footprintTab} onClose={()=>setInspected(null)}/>}
  </section>;
}
