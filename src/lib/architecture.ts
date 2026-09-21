export type SensorId = "ohrc" | "tmc2" | "iirs";
export type ViewId = "workspace" | "architecture" | "pipeline" | "quality" | "plans" | "sources";

export const sensors: { id: SensorId; name: string; description: string; resolution: string; detail: string }[] = [
  { id: "ohrc", name: "OHRC", description: "High-resolution optical", resolution: "0.25 m", detail: "A single panchromatic observation. Actual line/sample GSD must come from its product metadata." },
  { id: "tmc2", name: "TMC-2", description: "Terrain mapping", resolution: "5 m", detail: "One fore, nadir, or aft image—not a stereo triplet. The selected view and camera geometry must be explicit." },
  { id: "iirs", name: "IIRS", description: "Imaging infrared", resolution: "80 m", detail: "One hyperspectral product. Use validated bands to derive a structural matching view; do not invent optical detail or route through another source sensor." },
];

export const workflow = [
  { name: "Select source", short: ["Select", "source"], section: "E", description: "Choose exactly one OHRC, one TMC-2 view, or one IIRS product. Labels and ancillary files belong to that single logical product." },
  { name: "Select LRO reference", short: ["LRO", "reference"], section: "F", description: "Choose exactly one LRO NAC image, including its left/right camera identity. A mosaic or a NAC left/right pair is not a substitute for a single reference image." },
  { name: "Metadata validation", short: ["Metadata", "validation"], section: "F", description: "Read labels and archive indexes first. Check Moon target, sensor, processing level, bands, nodata, line/sample GSD, coordinate conventions, and geolocation provenance." },
  { name: "Geographic overlap", short: ["Geographic", "overlap"], section: "G", description: "Normalize lunar coordinates, intersect validated footprints in a suitable lunar projection, and compute source, reference, and valid-mask overlap. Unknown overlap blocks processing." },
  { name: "Preprocessing", short: ["Pre-", "processing"], section: "H", description: "Crop to the overlap, normalize physical GSD, preserve long-thin strips, test orientation hypotheses, and tile the long axis with recorded overlap." },
  { name: "Correspondence", short: ["Corres-", "pondence"], section: "I", description: "Extract structural features; apply mutual nearest-neighbor matching, the fixed Lowe-ratio gate, and spatial balancing. Preserve rejected candidates and their reasons." },
  { name: "Registration", short: ["Regis-", "tration"], section: "J", description: "Fit physically defensible geometry with robust estimation, reject degeneracy, and refine accepted candidate points. A fitted matrix is not a successful registration." },
  { name: "Quality gate", short: ["Quality", "gate"], section: "J", description: "Evaluate every configured, versioned gate on final refined geometry. A missing, unknown, or failed required check prevents SUCCESS." },
  { name: "Metrics", short: ["Evaluation", "& metrics"], section: "K", description: "Expose fit and spatially held-out residuals separately, inlier count and ratio, overlap-relative coverage, and before/after sub-pixel refinement evidence." },
  { name: "Registered product", short: ["Registered", "product"], section: "K", description: "Publish an accepted registered derivative only after all required gates pass. Retain failed warps as diagnostic artifacts, never as accepted products." },
  { name: "Export", short: ["Report", "& export"], section: "L", description: "Export the derivative, measured correspondence points, metrics, gate decisions, all candidate evidence, checksums, environment, and reproducible processing manifest." },
];

export const directoryTree = `lunaris/
├── apps/
│   └── web/                         # Next.js App Router + TypeScript
│       ├── app/
│       │   ├── (workspace)/         # New pair, runs, results, evidence
│       │   └── api/                 # Session-aware BFF; no image processing
│       ├── components/
│       │   ├── pair-selector/
│       │   ├── workflow/
│       │   ├── lunar-viewer/
│       │   └── evidence-inspector/
│       └── lib/                     # Typed client, state, validation
├── services/
│   ├── api/                         # FastAPI orchestration
│   │   ├── routes/                  # Assets, metadata, overlap, runs, artifacts
│   │   ├── auth/                    # User and archive credential boundaries
│   │   ├── contracts/               # Pydantic/OpenAPI schemas
│   │   └── orchestration/           # Durable state transitions, cancellation
│   └── worker/                      # Isolated, resource-limited Python workers
│       ├── tasks/
│       ├── containers/              # GDAL and separate ISIS environments
│       └── instrumentation/
├── packages/
│   ├── sensors/                     # Base adapter; OHRC, TMC2, IIRS, LRO NAC
│   ├── formats/                     # PDS3, PDS4, ISIS3, GeoTIFF readers
│   ├── catalogs/                    # PRADAN and LROC metadata connectors
│   ├── footprints/                  # Lunar CRS, polygons, overlap, uncertainty
│   ├── preprocessing/              # Masks, GSD, crop, orientation, strip tiles
│   ├── correspondence/             # Representations, features, filters, fusion
│   ├── geometry/                    # Models, USAC/RANSAC, degeneracy
│   ├── refinement/                  # Local sub-pixel optimization
│   ├── evaluation/                  # Residuals, holdouts, coverage, gates
│   ├── products/                    # Warps, points, manifests, reports
│   └── contracts/                   # Versioned language-neutral JSON Schema
├── database/
│   ├── schema/                      # Drizzle schema; single migration owner
│   └── migrations/
├── config/
│   ├── gate-profiles/               # Ratified, immutable acceptance profiles
│   ├── sensor-profiles/
│   └── pipeline-profiles/
├── storage/                         # Mounted storage; never committed
│   ├── originals/                   # Read-only, content-addressed objects
│   ├── derived/                     # Per-run crops, masks, tiles, products
│   └── evidence/                    # All accepted and rejected candidates
├── tests/
│   ├── unit/
│   ├── contracts/
│   ├── integration/
│   ├── real-data/                   # Licensed manifests; no bundled big rasters
│   ├── e2e/
│   └── security/
├── infra/                           # Compose, images, storage, queue, observability
└── docs/                            # ADRs, data provenance, runbooks, validation`;

export interface ArchitectureSection {
  id: string;
  title: string;
  summary: string;
  groups: { heading: string; items: string[] }[];
}

export const architecture: ArchitectureSection[] = [
  {
    id: "A", title: "Recommended technology stack", summary: "A lightweight web control plane, a dedicated planetary-science processing plane.",
    groups: [
      { heading: "Web & control plane", items: ["Next.js App Router, TypeScript, React, and Tailwind CSS for a focused, accessible workflow. PostgreSQL with Drizzle owns application metadata and migrations; raster data never lives in database rows.", "FastAPI and Pydantic provide the scientific job API and versioned contracts. Redis plus Celery handles durable, bounded jobs; PostgreSQL is the authoritative run-state store. Next.js acts as a session-aware backend-for-frontend, not a CPU worker."] },
      { heading: "Scientific processing", items: ["Pin Python, NumPy, SciPy, GDAL/Rasterio, pyproj, Shapely, OpenCV, and scikit-image in reproducible containers. Use pds4_tools and PVL for label inspection. Keep USGS ISIS and compatible SPICE kernels in a dedicated worker image, with a sensor/product compatibility matrix.", "Use S3-compatible object storage for immutable originals and versioned derivatives. Read windows and overviews rather than loading whole strips. Add learned matchers only after a classical, real-data baseline is measured and weights, licensing, and provenance are recorded."] },
      { heading: "Operational boundaries", items: ["Use server-sent events for resumable job progress, structured logs and OpenTelemetry for diagnostics, and short-lived signed artifact URLs. Pin container digests, library builds, kernel hashes, seeds, and thread settings in each report."] },
    ],
  },
  {
    id: "B", title: "Complete project directory structure", summary: "Separate formats, sensors, algorithms, orchestration, and evidence.",
    groups: [{ heading: "Dependency rule", items: ["Sensor adapters and format readers depend on shared contracts—not on UI components, database sessions, or a particular matcher. The scientific packages can run from a command-line replay tool without the web application.", "The proposed repository structure below describes the future engine. It does not imply that these science services have already been implemented."] }],
  },
  {
    id: "C", title: "Backend architecture", summary: "A durable, auditable state machine with a strict boundary around raw data.",
    groups: [
      { heading: "Request to evidence", items: ["The BFF authenticates the user; FastAPI authorizes asset access, freezes the pair and configuration, and submits a versioned run manifest. Workers advance stages through idempotent jobs with leases, heartbeat, timeouts, cancellation, and bounded retries for transient infrastructure failures only.", "Use states DRAFT → PREFLIGHT → READY → QUEUED → RUNNING → SUCCEEDED | REJECTED | FAILED | CANCELLED. BLOCKED describes a preflight with missing prerequisites. SUCCEEDED is set only by the quality-gate evaluator, in the same transaction that publishes accepted artifacts."] },
      { heading: "Storage and safety", items: ["Original CUBE/IMG/TIFF/XML/PDS/SPICE objects are checksum-addressed and mounted read-only. All tools, including ISIS utilities that normally update cubes, receive derived working copies. Store every operation, transform chain, candidate, exclusion reason, and quality decision.", "Archive credentials remain server-side and are never written to reports. Follow official PRADAN login and authorization; no credential scraping or authentication bypass. Enforce per-user ownership, host allowlists, redirect checks, XML external-entity restrictions, path isolation, quotas, and download budgets.", "The scientific service uses a separately scoped database role for state transitions; schema changes remain owned by Drizzle migrations. Large evidence arrays are objects referenced by database records."] },
    ],
  },
  {
    id: "D", title: "Frontend architecture", summary: "One pair, one workflow, visible evidence—not a decorative dashboard.",
    groups: [
      { heading: "Workspace components", items: ["PairSelector enforces one source logical product and one NAC logical product. MetadataInspector shows values, units, provenance, and missing fields. OverlapViewer shows only validated lunar footprints, uncertainty, and the chosen overlap ROI.", "PipelineStepper is driven by server events, never by cosmetic timers. StageInspector shows input/output artifacts and errors. CorrespondenceViewer distinguishes tentative, accepted, rejected, and held-out points. RegistrationViewer supports linked pan/zoom, blink, swipe, valid-mask overlays, and residual vectors."] },
      { heading: "Honest presentation", items: ["MetricsPanel separates measured values from configuration. GatePanel lists every threshold, value, decision, and profile version. Unknown is never green. Product and export controls distinguish accepted derivatives from diagnostic failures.", "Use typed API responses and URL-addressable run stages. Reconnect progress with event IDs. Preserve accessible keyboard focus, reduced motion, readable status text, and responsive layouts. Real context mosaics are clearly credited and never substituted for selected inputs."] },
    ],
  },
  {
    id: "E", title: "Sensor abstraction design", summary: "Sensor knowledge at the edges. A sensor-independent core.",
    groups: [
      { heading: "Adapter contract", items: ["Each adapter declares capabilities and implements product identification, metadata normalization, label validation, asset enumeration, geolocation availability, line/sample GSD, valid-mask rules, windowed pixel access, and a matching-representation recipe. Every response includes provenance and uncertainty.", "Format readers handle bytes and labels; sensor adapters interpret their scientific meaning. No matcher contains branches on sensor names. A camera model is available only when the installed tools support that exact instrument and processing level—GDAL support alone is not a camera model."] },
      { heading: "Four independent adapters", items: ["OHRC: one panchromatic image, nominal 0.25 m GSD. TMC-2: exactly one fore/nadir/aft image, nominal 5 m GSD; do not combine stereo views implicitly. IIRS: one hyperspectral cube, nominal 80 m GSD; exclude invalid/thermal-dominated bands and record the structural representation.", "LRO NAC: one left OR right image, not an implicit camera pair; track EDR/CDR/map-projected state, calibration, line/sample scale, and camera geometry. Nominal resolutions are catalog context only, never a substitute for measured product metadata.", "An IIRS run goes directly from that IIRS product to its one NAC reference. No OHRC/TMC-2 bridge, fabricated grid-point correspondences, or assumption of cross-sensor alignment is allowed."] },
    ],
  },
  {
    id: "F", title: "Metadata and data models", summary: "Typed, unit-aware records with provenance at every transformation.",
    groups: [
      { heading: "Product and footprint", items: ["Product: UUID; archive product ID and version; role; mission/sensor/view; processing level; target body; source URI; authorization requirement; label and file hashes; acquisition time; width/height/bands; sample type, byte order, offsets, wavelength units, nodata/special pixels; calibration status.", "Geolocation: lunar radii/datum; planetocentric or planetographic latitude; east/west longitude direction and 180/360 domain; projection WKT; pixel convention; geotransform or camera/geolocation model; line/sample GSD in metres with source and uncertainty; footprint geometry with confidence; incidence/emission/phase and solar angles; DEM and SPICE lineage."] },
      { heading: "Run and evidence", items: ["Run has two explicit non-null product foreign keys: source_product_id and reference_product_id, with role constraints and an immutable pair after queueing. Ancillary files are children of those products, not extra images. Draft plans may be incomplete; executable runs may not.", "RunManifest stores schema/config/gate versions, checksums, common GSD, lunar projection, ROI, orientation hypotheses, tile layout and overlap, anisotropic-search bounds, seeds, resources, and environment. CoordinateTransform records every crop, rotation, resample, and warp with inverse mapping when valid.", "Candidate contains hypothesis, tile IDs, feature counts, matches, Lowe ratios, rejection reasons, model, residuals, and gate outcomes. MatchPoint includes original source/reference pixels, working pixels, world coordinate when valid, confidence, inlier/holdout flags, and pre/post-refinement coordinates.", "Metric includes name, value or null, unit, coordinate frame, population/denominator, stage, and uncertainty. GateDecision includes threshold, comparison, observed value, PASS/FAIL/UNKNOWN, and reason. Artifact includes role, object URI, media type, hash, producer stage, accepted/diagnostic status, and retention policy."] },
    ],
  },
  {
    id: "G", title: "Footprint and geographic overlap", summary: "Prove that the images meet before trying to make them match.",
    groups: [
      { heading: "Metadata-first discovery", items: ["Read official archive indexes, detached XML/PDS labels, authenticated metadata, and existing georeferencing first. Apply strict byte limits to headers/range requests; if an archive ignores Range, abort rather than downloading a large image. Catalog bounding boxes are discovery filters, not definitive footprint evidence.", "Derive or validate footprints from a map transform, geolocation arrays, or a supported camera model plus SPICE/DEM. Densify strip edges, retain footprint uncertainty, and reject unknown geolocation. Metadata-only catalog queries precede any user-approved large raster transfer."] },
      { heading: "Lunar geometry", items: ["Normalize latitude convention, longitude direction/domain, and lunar radii explicitly. Split antimeridian-crossing polygons and use polar-safe logic. Do not silently assume Earth EPSG:4326 or use Earth-geography area calculations.", "Compute the intersection in an appropriate Moon-fixed local equal-area projection; use separate map/working projections where needed. Report intersection area, intersection/source area, intersection/reference area, uncertainty, and a preliminary overlap ROI. Refine valid-data overlap from pixel masks after acquisition.", "NO_OVERLAP, OVERLAP_UNCERTAIN, INSUFFICIENT_OVERLAP, and GEOLOCATION_UNAVAILABLE block matching. Intersecting bounding boxes alone cannot pass the geographic gate. The ROI maps back to source windows using validated transforms and a recorded safety margin."] },
    ],
  },
  {
    id: "H", title: "Preprocessing pipeline", summary: "Physical scale first. Preserve the shape and information content of the data.",
    groups: [
      { heading: "Ordered operations", items: ["1. Verify checksums and read-only access. 2. Validate decoding, calibration, nodata/saturation/special-pixel masks, and usable bands. 3. Establish compatible lunar geolocation and map geometry; block unsupported raw line-scan models rather than pretending a global homography solves them.", "4. Read only overlap windows plus a documented margin. 5. Determine a defensible common physical GSD from actual, potentially varying line/sample scales, normally no finer than the coarser effective input. Apply anti-aliased downsampling and record kernels. Do not normalize by blindly resizing the maximum image side.", "6. Construct reproducible intensity and illumination-robust structural views while retaining calibrated pixels separately. 7. Test bounded orientation hypotheses around metadata priors, including 0/90/180/270 degrees when uncertainty warrants; reflections need a justified coordinate-convention cause."] },
      { heading: "Long strips and constrained search", items: ["8. Tile along the long axis, keep the short-axis sampling intact, use configurable overlapping windows with halos, and save every tile transform. Windowed IO and bounded feature budgets control memory without squashing strips.", "9. Only after common GSD and orientation handling may a bounded, physically justified anisotropic residual scale search run. It is optional, off by default, and cannot compensate for missing GSD. Record all hypotheses, including failed ones, and the reason the search was enabled.", "IIRS matching uses a justified band composite or structural reduction with selected wavelengths and coefficients in the manifest. NAC is filtered/downsampled to the common physical support. No enhancement or super-resolution may invent features to rescue a failing match."] },
    ],
  },
  {
    id: "I", title: "Correspondence and matching", summary: "Interchangeable matchers with shared, non-negotiable acceptance contracts.",
    groups: [
      { heading: "Measured baseline", items: ["Start with SIFT/RootSIFT on masked, normalized intensity and structural gradient or phase-congruency views. Enforce minimum usable features per image and per valid spatial cell before matching. Bound feature density and balance coverage without manufacturing points.", "Apply nearest and second-nearest descriptor matching, the immutable Lowe-ratio threshold, reciprocal matching, duplicate suppression, mask checks, and a metadata-derived search envelope. Track raw, ratio-passing, reciprocal, geometric, and final-refined counts separately."] },
      { heading: "Candidate registry", items: ["Each representation × orientation × tile combination is a separate candidate with configuration and evidence. Map candidates back into common/original frames, deduplicate overlap-tile points, then test global consistency. Rejected candidates remain exportable with reasons.", "Learned dense matchers are an optional later plugin, evaluated on real lunar holdouts. They cannot bypass the baseline ratio-tested evidence required by the ratified gate profile; learned-only candidates remain diagnostic until a separately validated equivalent acceptance contract is approved. Do not replace Lowe filtering with an arbitrary confidence cutoff.", "Select candidates using a predeclared validation policy, not by inspecting the final evaluation holdout. If no candidate has reliable spatially distributed evidence, report rejection. Direct IIRS–NAC correspondence may legitimately be infeasible for a given pair."] },
    ],
  },
  {
    id: "J", title: "Robust geometry and quality gates", summary: "An attractive overlay is not evidence of a successful registration.",
    groups: [
      { heading: "Defensible geometry", items: ["Start with the simplest physically supported residual model: translation/similarity, then affine; use a homography only for a justified map-projected/local planar overlap. Raw pushbroom strips and relief-induced distortion may require calibrated camera/DEM reprojection or validated local models. Unsupported geometry blocks execution.", "Use model-appropriate RANSAC or OpenCV USAC/MAGSAC++, with declared pixel/metric units, noise bounds, confidence, seed, and iteration cap. MAGSAC does not eliminate the need for an explicit final inlier threshold. Check collinearity, conditioning, scale, orientation, Jacobian sign, foldovers, extrapolation, and cross-tile continuity."] },
      { heading: "All-of quality decision", items: ["Require valid overlap and metadata; minimum features; the Lowe-ratio filter; robust consensus; minimum unique inlier count and inlier ratio; bounded fit and held-out residuals; adequate two-dimensional overlap-relative coverage and long-axis span; model plausibility; and valid refinement evidence.", "Coverage uses a grid over the valid intersection, occupied eligible cells in BOTH images, clipped convex-hull area, long-axis span, and clustering/degeneracy checks. Inlier ratio is final unique inliers divided by the explicitly reported unique tentative correspondences submitted to geometry—not a hand-picked subset.", "Threshold values were not supplied. Do not invent them or claim a gate passes: the initial state is BLOCKED_CONFIG. Establish immutable, sensor-pair-aware profiles from a separate real-data validation corpus before demonstration. Existing approved thresholds must be imported unchanged; run-time relaxation, candidate-specific weakening, and success-by-best-effort are forbidden.", "Run refinement inside registration, then evaluate every required gate on the final model. SUCCESS is the logical AND of all required PASS decisions plus verified artifact publication. UNKNOWN and missing checks cannot pass. Failed candidates and failure reports are preserved even when another candidate succeeds."] },
    ],
  },
  {
    id: "K", title: "Evaluation and sub-pixel refinement", summary: "Measure relative alignment honestly and keep it separate from absolute accuracy.",
    groups: [
      { heading: "Evaluation contract", items: ["Report radial 2D RMSE = sqrt(mean(dx² + dy²)), axis RMSE, median and p95 residual, unique inlier count, explicit inlier ratio, valid overlap area, occupied-cell coverage, hull coverage, and long-axis span. State pixel frame, common working GSD, reference-product pixels, and metre conversion assumptions.", "Keep fitting, model-selection, and spatially held-out evaluation populations separate before candidate search. Report fit residuals as fit residuals—not independent accuracy. Use independently established control points to assess absolute lunar accuracy where available; otherwise state that it is not established. Include reference geolocation uncertainty."] },
      { heading: "Refinement and products", items: ["Refine geometrically supported, masked local patches using phase correlation or inverse-compositional Lucas–Kanade on compatible structural views. Bound displacement and conditioning, require convergence, check forward/backward agreement, and retain pre/post coordinates and residuals. Refit robust geometry and rerun the complete gate afterward.", "Sub-pixel means fractional pixels in the explicitly named grid; it is not a claim of sub-metre truth or new IIRS spatial detail. Record accepted/rejected patches, convergence, displacement distribution, and held-out improvement. A non-convergent required refinement is a failure; a worsened solution is not quietly accepted.", "Publish a registered GeoTIFF/COG derivative with valid mask, lunar CRS, reference-aligned grid definition, source sampling provenance, and interpolation method. Default to a scientifically defensible common-GSD grid; finer reference-grid exports must be explicitly labeled interpolated, with effective source resolution retained.", "The eight deliverables are: registered derivative; measured match points in CSV/Parquet and lunar-CRS-aware geospatial form; RMSE; inlier count; inlier ratio; coverage evidence; refinement report; reproducible JSON manifest plus human-readable report. Failures export diagnostics and a failure report, never an accepted registered product."] },
    ],
  },
  {
    id: "L", title: "API design", summary: "Metadata and validation before transfers; explicit artifacts after a gated run.",
    groups: [
      { heading: "Proposed scientific API (not implemented)", items: ["GET /v1/catalogs/{catalog}/products — bounded metadata-only discovery with pagination. POST /v1/products — register an authorized product manifest; returns product ID and missing prerequisites. POST /v1/products/{id}/inspect — inspect permitted small labels/headers without bulk download.", "POST /v1/pairs/validate — accepts one source ID and one NAC reference ID; returns normalized metadata and blockers. POST /v1/pairs/overlap — returns footprint provenance, intersection, metrics, and status. POST /v1/transfers — explicit, quota-checked acquisition only after metadata preflight.", "GET /v1/gate-profiles — immutable approved profiles. POST /v1/runs — pair IDs, profile version, processing options, and idempotency key; returns 202 with run ID only if preconditions pass. GET /v1/runs/{id}; GET /v1/runs/{id}/events with Last-Event-ID; POST /v1/runs/{id}/cancel.", "GET /v1/runs/{id}/candidates; GET /v1/runs/{id}/metrics; GET /v1/runs/{id}/gates; GET /v1/runs/{id}/artifacts. POST /v1/runs/{id}/exports produces a hashed bundle or a failure-evidence bundle; artifact downloads use authorized short-lived URLs."] },
      { heading: "Contract and security", items: ["Use versioned JSON Schema/OpenAPI, UTC timestamps, typed units, stable error codes, trace IDs, field-level errors, and explicit retriable flags. A scientific rejection is not an HTTP 500. Use 401/403 for authentication/authorization, 409 for state conflicts, 422 for invalid manifests, and 429 for quotas.", "Current planning endpoints are deliberately separate: GET/POST /api/plans, PATCH/DELETE /api/plans/{id}, and GET /api/architecture for the proposal. These store anonymous session-scoped drafts only; they do not acquire products, run algorithms, or return scientific measurements."] },
    ],
  },
  {
    id: "M", title: "Frontend live-demo workflow", summary: "Eleven visible stages, with no silent shortcuts.",
    groups: [
      { heading: "Operator journey", items: ["Select Source → Select LRO Reference → Metadata Validation → Geographic Overlap → Preprocessing → Correspondence → Registration → Quality Gate → Metrics → Registered Product → Export.", "Begin with an authenticated archive manifest or locally provided real product and label. Show the one-to-one pair and provenance continuously. Require affirmative overlap before pixel processing. Expose chosen GSD, crop, orientation candidates, and strip tiling before starting the worker.", "During matching, show actual progress and candidate diagnostics, not made-up match animations. Perform and inspect sub-pixel refinement inside Registration, then show the final all-of gate. Metrics can also be inspected for rejected runs, clearly marked as diagnostics; the accepted-product stage stays locked.", "Export a complete manifest and report for every run, successful or not. Replaying creates a new immutable run. Changing a sensor or image invalidates downstream stages. No automatic chaining of OHRC, TMC-2, and IIRS occurs."] },
    ],
  },
  {
    id: "N", title: "Testing strategy", summary: "Real lunar pairs, difficult negatives, and replayable evidence.",
    groups: [
      { heading: "Layered verification", items: ["Unit and property tests cover label parsing, special pixels, units, transform round-trips, lunar longitude wrapping, polar areas, strip tiling, coverage denominators, deduplication, and gate truth tables. Synthetic coordinates may test mathematics, but never appear as user-demo imagery or scientific registration evidence.", "Contract tests enforce one source plus one NAC reference, capability declarations, API schemas, transitions, cancellation, ownership, and immutable manifests. Integration tests use small authorized real-data windows and real labels for every supported sensor, format, and processing level.", "Build a stratified real lunar evaluation corpus with positive and non-overlapping pairs, long-thin strips, varying scale/sun angle/terrain, polar and antimeridian cases, invalid bands, poor texture, and known failure cases. Hold out geography and acquisitions across tuning, model selection, and final testing; independently verify reference points."] },
      { heading: "Release criteria", items: ["Measure false acceptance as well as registration recall; publish results per sensor pair, not one flattering aggregate. Test time/memory limits and metadata-only network byte budgets. Verify originals remain byte-identical before and after every tool chain.", "E2E tests exercise both successful and rejected real runs, evidence exports, refresh/reconnect, cancellation, archive login boundaries, and malicious metadata. Replays use fixed environments and seeds; document numeric tolerances and remaining nondeterminism rather than promising bit identity across arbitrary hardware."] },
    ],
  },
  {
    id: "O", title: "Error and failure states", summary: "A failure is a scientific outcome with evidence, not an empty screen.",
    groups: [
      { heading: "Preflight blockers", items: ["AUTH_REQUIRED / ACCESS_DENIED — stop and use the official archive authentication path. INVALID_PAIR / MULTIPLE_SOURCE_IMAGES — require exactly one source product and one NAC image. UNSUPPORTED_FORMAT / UNSUPPORTED_PRODUCT_LEVEL — identify the missing reader or capability.", "MISSING_METADATA / GSD_UNKNOWN / CRS_AMBIGUOUS / GEOLOCATION_UNAVAILABLE / CAMERA_MODEL_UNSUPPORTED / SPICE_OR_DEM_MISSING — show missing fields and supported remediation; do not guess values. NO_OVERLAP / OVERLAP_UNCERTAIN / INSUFFICIENT_OVERLAP — stop before matching. BLOCKED_CONFIG — no approved gate profile."] },
      { heading: "Scientific rejection and operational failure", items: ["NO_VALID_PIXELS / INSUFFICIENT_FEATURES / TOO_FEW_MATCHES / DEGENERATE_GEOMETRY / LOW_INLIER_RATIO / POOR_COVERAGE / HIGH_RESIDUAL / AMBIGUOUS_ORIENTATION / REFINEMENT_FAILED / QUALITY_GATE_FAILED — preserve candidate artifacts, measurements, and reasons without lowering thresholds.", "CHECKSUM_MISMATCH / DECODE_ERROR / TRANSFER_LIMIT / RESOURCE_LIMIT / WORKER_TIMEOUT / ARCHIVE_UNAVAILABLE / CANCELLED — retain safe checkpoints and expose retryability. Transient retries cannot mutate the pair or gate profile. A failed export is distinct from a scientifically passing model; publication remains incomplete.", "Each error has a stage, stable code, human explanation, relevant evidence links, safe next action, and trace ID. No successful-looking overlay replaces a missing or failed measurement."] },
    ],
  },
  {
    id: "P", title: "Implementation phases", summary: "Prove data access and geometry before investing in matching or polish.",
    groups: [
      { heading: "Dependency-ordered delivery", items: ["Phase 0 — Architecture review only: freeze pair semantics, scope, acceptance policy, product-level capability matrix, and security boundary. No next phase begins automatically.", "Phase 1 — Real-data feasibility: authenticate legitimately; collect small labels/indexes for real OHRC–NAC, TMC-2–NAC, and IIRS–NAC candidate pairs; verify camera support, licensing, GSD, and overlap without bulk download. An unsupported product level is an explicit stop condition.", "Phase 2 — Contracts and immutable ingestion: adapters, format readers, metadata schema, original-object hashes, read-only access, session/authorization, and provenance. Exit only with validated real product manifests.", "Phase 3 — Footprints and overlap: lunar CRS conventions, poles/antimeridian, uncertainty, valid intersection, and window selection. Exit with independently checked overlap decisions.", "Phase 4 — Deterministic preprocessing: calibration/masks, supported map geometry, common GSD, orientation candidates, and long-axis tiling. Prove coordinate round-trips and no distortion of strip aspect ratio.", "Phase 5 — Baseline matching and robust geometry: measured features, fixed ratio filtering, spatial balancing, RANSAC/MAGSAC, candidate evidence, and failure handling. Develop on permitted real lunar windows.", "Phase 6 — Refinement and acceptance: spatial holdouts, sub-pixel evidence, uncertainty, full gate evaluator, and immutable ratified profiles. Demonstrate honest failure as well as repeatable acceptance separately for each sensor pair.", "Phase 7 — Scientific products and replay: masked registered derivatives, measured points, all metrics, complete reports, checksum verification, and command-line reproduction.", "Phase 8 — Worker orchestration and live UI: durable jobs, progress events, cancellation, linked viewers, diagnostics, and gated exports. Wire only verified scientific components.", "Phase 9 — Security, performance, and SIH rehearsal: resource budgets, interrupted jobs, archive outages, real-data negative cases, accessibility, and independent review. No mock success path ships."] },
    ],
  },
];

export const qualityRequirements = [
  { name: "Geographic overlap", description: "A validated lunar footprint intersection with adequate usable area.", category: "Preflight", section: "G" },
  { name: "Metadata & physical GSD", description: "Known lunar geometry, valid pixels, and traceable line/sample resolution.", category: "Preflight", section: "F" },
  { name: "Minimum feature support", description: "Enough independent, usable features in both images and spatial cells.", category: "Correspondence", section: "I" },
  { name: "Lowe-ratio & mutual matching", description: "Fixed ratio filtering, reciprocal correspondences, and no duplicate evidence.", category: "Correspondence", section: "I" },
  { name: "Robust consensus", description: "RANSAC/MAGSAC evidence with a declared residual threshold and model.", category: "Geometry", section: "J" },
  { name: "Inlier count & ratio", description: "Minimum unique inliers and a ratio with an explicit, honest denominator.", category: "Geometry", section: "J" },
  { name: "Spatial coverage", description: "Two-dimensional distribution and long-axis support across the valid overlap.", category: "Evaluation", section: "J" },
  { name: "Residuals & refinement", description: "Bounded held-out error and convergent, independently checked sub-pixel refinement.", category: "Evaluation", section: "K" },
];

export const deliverables = [
  { title: "Registered product", format: "GeoTIFF / COG", description: "A gated, masked derivative on a documented lunar grid." },
  { title: "Corresponding match points", format: "CSV / Parquet", description: "Measured points in original and working coordinate frames." },
  { title: "RMSE", format: "Pixels + metres", description: "Fit and spatially held-out residuals, reported separately." },
  { title: "Inlier count", format: "Unique points", description: "Deduplicated, geometrically supported measured matches." },
  { title: "Inlier ratio", format: "Defined denominator", description: "Final unique inliers over matches submitted to geometry." },
  { title: "Spatial distribution", format: "Coverage + map", description: "Overlap-relative cells, hull coverage, and long-axis span." },
  { title: "Sub-pixel refinement", format: "Before / after", description: "Convergence, displacement, rejected patches, and validation." },
  { title: "Reproducible report", format: "JSON + report", description: "Inputs, hashes, configuration, all candidates, gates, and environment." },
];

export const sources = [
  { name: "ISRO / ISSDC PRADAN", label: "CHANDRAYAAN-2", description: "Official OHRC, TMC-2, IIRS and ancillary product archive. Access protected products through the official authenticated flow.", url: "https://pradan.issdc.gov.in/ch2/", access: "Authentication required for protected data" },
  { name: "LROC PDS Archive", label: "LRO NAC", description: "Official LROC archive discovery and product metadata. Select one NAC image; inspect labels and indexes before acquiring large rasters.", url: "https://data.im-ldi.com/mds.html", access: "Public archive discovery" },
  { name: "LROC QuickMap", label: "FOOTPRINT DISCOVERY", description: "Explore lunar imagery and find potential NAC observations by geographic area. Discovery footprints still require validation.", url: "https://quickmap.lroc.asu.edu/", access: "Public lunar map" },
  { name: "NASA Photojournal — Nearside Spectacular", label: "CONTEXT IMAGERY", description: "The workspace displays a small preview of Nearside Spectacular (PIA14011), an LRO WAC mosaic assembled from approximately 1,300 observations in December 2010. Context only: this WAC mosaic is never a NAC reference or a run input.", url: "https://science.nasa.gov/photojournal/nearside-spectacular/", access: "Credit: NASA / GSFC / Arizona State University" },
  { name: "GDAL planetary format documentation", label: "FORMAT REFERENCE", description: "PDS4 label, georeferencing, mask, and subdataset semantics. Format decoding must not be confused with support for an instrument camera model.", url: "https://gdal.org/en/stable/drivers/raster/pds4.html", access: "Technical documentation" },
  { name: "OpenCV USAC documentation", label: "ROBUST GEOMETRY", description: "Model-specific robust estimation, MAGSAC scoring, noise thresholds, degeneracy checks, and reproducibility considerations.", url: "https://docs.opencv.org/4.x/de/d3e/tutorial_usac.html", access: "Technical documentation" },
];

export function proposalMarkdown() {
  const header = "# LUNARIS\n## Generic Lunar Image Correspondence & Registration\n### Smart India Hackathon — Problem Statement #26166\n\nArchitecture proposal v1.0. Planning only; the registration engine is not implemented. No sample or synthetic registration results.\n\n**Invariant:** exactly one source logical image (OHRC, TMC-2, or IIRS) and exactly one LRO NAC reference image per run.\n\n";
  return header + architecture.map((section) => `## ${section.id}. ${section.title}\n\n${section.summary}\n\n` + section.groups.map((group) => `### ${group.heading}\n\n` + group.items.map((item) => `- ${item}`).join("\n\n")).join("\n\n") + (section.id === "B" ? `\n\n\`\`\`text\n${directoryTree}\n\`\`\`` : "")).join("\n\n---\n\n") + "\n\n## References\n\n" + sources.map((source) => `- [${source.name}](${source.url}) — ${source.description}`).join("\n") + "\n\nEnd of architecture proposal. Subsequent scientific implementation requires a separate approval.\n";
}
