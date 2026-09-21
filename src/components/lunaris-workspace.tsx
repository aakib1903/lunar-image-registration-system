"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BookOpen, Check, CheckCheck, ChevronRight, CircleHelp, Database, Download, FileText, FolderOpen, GitBranch, Grid2X2, Info, Layers3, LayoutGrid, LoaderCircle, Menu, Plus, Radio, ShieldCheck, Trash2, X } from "lucide-react";
import { architecture, workflow, type SensorId, type ViewId } from "@/lib/architecture";
import type { MissionPlan, PlanPayload } from "@/lib/plan-validation";
import { LogoMark, Modal } from "./ui";
import { WorkspaceHome } from "./workspace-home";
import { ArchitectureView, PipelineView, PlansView, ProposalBody, QualityView, SourcesView } from "./proposal-views";
import { PlanDialog } from "./plan-dialog";

const views: Record<ViewId, { breadcrumb: string; eyebrow: string; title: string; subtitle: string }> = {
  workspace: { breadcrumb: "Registration workspace", eyebrow: "LUNAR IMAGE CORRESPONDENCE & REGISTRATION", title: "Different sensors. Common ground.", subtitle: "Reliable lunar registration, one source–reference pair at a time." },
  architecture: { breadcrumb: "System architecture", eyebrow: "THE BLUEPRINT / A–P", title: "A system built on sound science.", subtitle: "The complete architecture proposal. Sixteen sections, one consistent scientific contract." },
  pipeline: { breadcrumb: "Pipeline explorer", eyebrow: "FROM INPUT TO EVIDENCE", title: "Every step has a purpose.", subtitle: "Explore the proposed processing journey and the order in which it should be built." },
  quality: { breadcrumb: "Quality framework", eyebrow: "SCIENCE BEFORE SUCCESS", title: "Trust is a measurable outcome.", subtitle: "Explicit acceptance criteria, honest metrics, and evidence that survives a failed run." },
  plans: { breadcrumb: "Saved mission plans", eyebrow: "YOUR MISSION NOTEBOOK", title: "Plan the next point of connection.", subtitle: "Save study intent and a single source–reference pairing. Processing comes later." },
  sources: { breadcrumb: "Official data sources", eyebrow: "REAL DATA. KNOWN PROVENANCE.", title: "Start at the source.", subtitle: "Official lunar archives and the technical references behind this proposal." },
};

const primaryNav = [
  { id: "workspace" as ViewId, label: "Workspace", icon: LayoutGrid },
  { id: "architecture" as ViewId, label: "Architecture", icon: Layers3 },
  { id: "pipeline" as ViewId, label: "Pipeline explorer", icon: GitBranch },
  { id: "quality" as ViewId, label: "Quality framework", icon: ShieldCheck },
];

export default function LunarisWorkspace({ initialView }: { initialView: ViewId }) {
  const view = initialView;
  const info = views[view];
  const [sensor, setSensor] = useState<SensorId>("ohrc");
  const [plans, setPlans] = useState<MissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [planDialog, setPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MissionPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<MissionPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/plans", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load your mission plans.");
      setPlans(data.plans);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The planning service is temporarily unavailable.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadPlans(); }, [loadPlans]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setMobileNav(false); }, [view]);

  function newPlan() { setEditingPlan(null); setPlanDialog(true); }
  function editPlan(plan: MissionPlan) { setEditingPlan(plan); setPlanDialog(true); }
  async function savePlan(payload: PlanPayload, id?: string) {
    const response = await fetch(id ? `/api/plans/${id}` : "/api/plans", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not save your plan.");
    const saved: MissionPlan = data.plan;
    setPlans((previous) => [saved, ...previous.filter((plan) => plan.id !== saved.id)]);
    setSensor(saved.sourceSensor); setPlanDialog(false); setEditingPlan(null); setLoadError("");
    setToast({ title: id ? "Mission plan updated" : "Mission plan saved", message: "Your draft is saved. No data was acquired or processed." });
  }
  async function deletePlan() {
    if (!deletingPlan) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch(`/api/plans/${deletingPlan.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not delete this draft.");
      setPlans((previous) => previous.filter((plan) => plan.id !== deletingPlan.id));
      setDeletingPlan(null); setToast({ title: "Draft deleted", message: "The planning record was removed. No scientific files were affected." });
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "Please try again."); }
    finally { setDeleting(false); }
  }
  const section = architecture.find((item) => item.id === sectionId);
  const stage = stageIndex !== null ? workflow[stageIndex] : null;

  return <div className="app-shell">
    {mobileNav && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? "is-visible" : ""}`}>
      <Link href="/" className="brand" aria-label="Lunaris workspace"><span className="brand-symbol"><LogoMark/></span><span><strong>LUNARIS</strong><small>LUNAR IMAGE INTELLIGENCE</small></span></Link>
      <div className="sidebar-nav"><div className="nav-label">MISSION CONTROL</div><nav aria-label="Main navigation">{primaryNav.map(({ id, label, icon: Icon }) => <Link key={id} href={id === "workspace" ? "/" : `/?view=${id}`} className={`nav-item ${view === id ? "active" : ""}`} aria-current={view === id ? "page" : undefined}><Icon size={17} strokeWidth={1.7}/><span>{label}</span>{view === id && <i/>}</Link>)}</nav>
      <div className="nav-divider"/><div className="nav-label">YOUR PROJECT</div><nav aria-label="Project resources"><Link href="/?view=plans" className={`nav-item ${view === "plans" ? "active" : ""}`} aria-current={view === "plans" ? "page" : undefined}><FolderOpen size={17} strokeWidth={1.7}/><span>Saved plans</span>{plans.length > 0 && <span className="nav-count">{plans.length}</span>}{view === "plans" && <i/>}</Link><Link href="/?view=sources" className={`nav-item ${view === "sources" ? "active" : ""}`} aria-current={view === "sources" ? "page" : undefined}><Database size={17} strokeWidth={1.7}/><span>Data sources</span>{view === "sources" && <i/>}</Link><button className="nav-item" onClick={() => { setSectionId("P"); setMobileNav(false); }}><FileText size={17} strokeWidth={1.7}/><span>Implementation plan</span></button></nav></div>
      <div className="sidebar-bottom"><div className="science-card"><span className="science-card-label"><i/> REAL DATA. REAL SCIENCE.</span><p>No synthetic scenes.<br/>No shortcuts to success.</p><button onClick={() => setSectionId("J")}>Our scientific principles <ArrowUpRight size={13}/></button><span className="science-card-orbit" aria-hidden="true"/></div><button className="sidebar-project" onClick={() => setAboutOpen(true)}><span className="sih-mark">SIH</span><span><strong>Smart India Hackathon</strong><small>Problem statement #26166</small></span><ChevronRight size={14}/></button></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Menu size={19}/></button><Grid2X2 size={15} className="breadcrumb-icon"/><span>Mission control</span><ChevronRight size={12}/><strong>{info.breadcrumb}</strong></div><div className="topbar-right"><Link href="/?view=architecture" className="documentation-link"><BookOpen size={14}/><span>Documentation</span><ArrowUpRight size={11}/></Link><span className="topbar-separator"/><button className="preview-tag" onClick={() => setAboutOpen(true)}><i/> Phase 1 · Metadata</button><button className="avatar" onClick={() => setAboutOpen(true)} aria-label="About the Smart India Hackathon project">SI</button></div></header>
      <main className={`main-content view-${view}`} id="main-content"><div className="page-heading"><div><div className="eyebrow">{info.eyebrow}</div><h1>{info.title}</h1><p>{info.subtitle}</p></div><div className="heading-actions">{view === "architecture" ? <a className="button button-secondary" href="/api/architecture" download><Download size={15}/> Download proposal</a> : view === "workspace" ? <Link className="button button-secondary" href="/?view=architecture"><Layers3 size={15}/> View architecture</Link> : null}{(view === "workspace" || view === "plans") && <button className="button button-primary" onClick={newPlan}><Plus size={16}/> New plan</button>}{view === "quality" && <button className="button button-secondary" onClick={() => setSectionId("J")}><BookOpen size={15}/> Read the policy</button>}{view === "pipeline" && <button className="button button-secondary" onClick={() => setSectionId("P")}><FileText size={15}/> Delivery roadmap</button>}</div></div>
        {view === "workspace" && <WorkspaceHome sensor={sensor} onSensor={setSensor} onConfigure={newPlan} onInspect={setSectionId} onStage={setStageIndex} onContext={() => setContextOpen(true)}/>}
        {view === "architecture" && <ArchitectureView/>}
        {view === "pipeline" && <PipelineView onStage={setStageIndex} onInspect={setSectionId}/>}
        {view === "quality" && <QualityView onInspect={setSectionId}/>}
        {view === "sources" && <SourcesView/>}
        {view === "plans" && <PlansView plans={plans} loading={loading} error={loadError} onRetry={() => void loadPlans()} onCreate={newPlan} onEdit={editPlan} onDelete={(plan) => { setDeletingPlan(plan); setDeleteError(""); }} onExport={() => setToast({ title: "Planning draft exported", message: "Downloaded a JSON plan, not scientific data or registration results." })}/>}
        <footer className="workspace-footer"><span><span className="footer-mini-moon">◒</span> LUNARIS <span className="footer-slash">/</span> <span>ARCHITECTURE PROPOSAL V1.0</span></span><span><CheckCheck size={13}/> Designed for scientific reproducibility</span></footer>
      </main>
    </div>
    {planDialog && <PlanDialog plan={editingPlan} sensor={sensor} onClose={() => setPlanDialog(false)} onSave={savePlan}/>}
    {section && <Modal title={section.title} eyebrow={`ARCHITECTURE / SECTION ${section.id}`} onClose={() => setSectionId(null)} className="proposal-modal"><div className="modal-content"><ProposalBody section={section}/></div><div className="modal-footer"><span className="modal-scope-label"><Radio size={13}/> Proposed design · not an active engine</span><button className="button button-secondary" onClick={() => setSectionId(null)}>Close</button></div></Modal>}
    {stage && stageIndex !== null && <Modal title={stage.name} eyebrow={`PROPOSED WORKFLOW / STAGE ${String(stageIndex + 1).padStart(2, "0")} OF 11`} onClose={() => setStageIndex(null)} className="stage-modal"><div className="modal-content"><div className="stage-explainer"><span className="large-stage-number">{String(stageIndex + 1).padStart(2, "0")}</span><p>{stage.description}</p></div><div className="subtle-notice"><Info size={17}/><p>This is a workflow specification. No stage has been executed and no scientific results exist.</p></div><div className="stage-neighbors"><span>{stageIndex > 0 ? `Previous: ${workflow[stageIndex - 1].name}` : "Beginning of the workflow"}</span><span>{stageIndex < 10 ? `Next: ${workflow[stageIndex + 1].name}` : "End of the workflow"}</span></div></div><div className="modal-footer"><button className="button button-secondary" onClick={() => setStageIndex(null)}>Close</button><button className="button button-primary" onClick={() => { setStageIndex(null); setSectionId(stage.section); }}>Explore module architecture <ArrowRight size={15}/></button></div></Modal>}
    {contextOpen && <Modal title="The lunar nearside, through LRO" eyebrow="OFFICIAL NASA CONTEXT IMAGERY / LRO WAC" onClose={() => setContextOpen(false)} className="context-modal"><div className="expanded-moon"><Image src="/images/lro-nearside.jpg" alt="Nearside Spectacular, PIA14011: NASA LRO WAC mosaic from approximately 1,300 December 2010 observations." width={1024} height={1024} unoptimized/></div><div className="modal-content"><p className="context-credit-text">Nearside Spectacular (PIA14011), an LRO Wide Angle Camera mosaic assembled from approximately 1,300 observations in December 2010. Credit: NASA / GSFC / Arizona State University.</p><div className="subtle-notice"><Info size={16}/><p>Context only. This WAC mosaic is not a NAC reference, is not a selected run input, and provides no evidence of overlap or successful registration. Runs require exactly one separate NAC image.</p></div></div><div className="modal-footer"><a className="text-link" href="https://science.nasa.gov/photojournal/nearside-spectacular/" target="_blank" rel="noreferrer">View NASA source and credits <ArrowUpRight size={14}/></a><button className="button button-secondary" onClick={() => setContextOpen(false)}>Close</button></div></Modal>}
    {aboutOpen && <Modal title="A clear plan for real lunar science." eyebrow="LUNARIS / SIH PROBLEM STATEMENT #26166" onClose={() => setAboutOpen(false)}><div className="modal-content about-content"><LogoMark size={52}/><p>LUNARIS — Generic Lunar Image Correspondence &amp; Registration — is designed to register exactly one Chandrayaan-2 source image to exactly one LRO NAC reference.</p><div className="about-scope"><h3>Available in the current workspace</h3><ul><li><Check size={15}/> Complete A–P architecture and delivery proposal</li><li><Check size={15}/> Session-scoped, editable mission-plan drafts</li><li><Check size={15}/> Real metadata intake, field provenance, and overlap reports</li><li><Check size={15}/> Official data references and credited lunar context</li><li><Check size={15}/> Exportable architecture and planning documents</li></ul></div><div className="subtle-notice"><ShieldCheck size={18}/><p>Phase 1 inspects real product metadata and evaluates traceable geographic overlap. Original files stay read-only; large products are not downloaded. Matching and registration are not implemented, no registration quality gates have passed, and no registration results are fabricated.</p></div></div><div className="modal-footer"><a href="/api/architecture" className="button button-secondary" download><Download size={15}/> Download proposal</a><button className="button button-primary" onClick={() => setAboutOpen(false)}>Understood <Check size={15}/></button></div></Modal>}
    {deletingPlan && <Modal title="Delete this planning draft?" eyebrow="SAVED MISSION PLAN" onClose={() => setDeletingPlan(null)} busy={deleting}><div className="modal-content delete-content"><p><strong>{deletingPlan.name}</strong> will be permanently removed from this session. No original image files or scientific products will be changed.</p><p>Export the plan first if you want to keep a copy.</p>{deleteError && <div className="error-notice" role="alert">{deleteError}</div>}</div><div className="modal-footer"><button className="button button-secondary" onClick={() => setDeletingPlan(null)} disabled={deleting}>Keep plan</button><button className="button button-danger" onClick={() => void deletePlan()} disabled={deleting}>{deleting ? <LoaderCircle size={15} className="spin"/> : <Trash2 size={15}/>} {deleting ? "Deleting…" : "Delete draft"}</button></div></Modal>}
    {toast && <div className="toast" role="status"><span className="toast-check"><Check size={18}/></span><div><strong>{toast.title}</strong><p>{toast.message}</p></div><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15}/></button></div>}
    <button className="help-button" onClick={() => setAboutOpen(true)} aria-label="About this planning workspace" title="About this workspace"><CircleHelp size={18}/></button>
  </div>;
}
