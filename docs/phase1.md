# LUNARIS Phase 1 — real metadata and geographic evidence

## Implemented scope

This release adds **metadata inspection and geographic overlap only** to the existing Next.js planning UI. It does not contain image matching, registration, sub-pixel refinement, registration metrics, match-point files, or registered products. `OVERLAP` means a traceable metadata-footprint intersection, never successful registration or passage of a future quality gate.

One scientific pair has exactly two distinct immutable foreign keys: one OHRC OR TMC-2 OR IIRS source, and one LRO NAC reference. Instrument identity comes from metadata, not the filename or UI selection. LROC needs an explicit NAC/left/right identity; WAC is rejected. TMC-2 arrays are not merged, IIRS is not routed through another source, and multi-array PDS4 labels are blocked until an explicit-array selector is implemented.

The existing planning records, architecture proposal, visual design, and all future gates are retained. Scientific pairs and reports are separate from planning drafts.

## Architecture changes

- `src/science/types.ts`: versioned field provenance, products, lunar CRS/footprints, and four-state reports.
- `input.ts`: strict one-product/one-pair request validation. Client authority flags, extra source keys, and gate overrides are rejected.
- `acquisition.ts`: read-only local adapter, bounded browser-upload snapshots, HTTPS official-archive allowlist, bounded header Range requests, redirect revalidation, authentication refusal, and exact-byte SHA-256.
- `readers.ts`: text-format readers without external resolution or asset dereferencing.
- `metadata.ts`: common extraction with sensor identity normalization and explicit-unit conversion. Raw uninterpreted fields are also retained with provenance.
- `footprints.ts`: coordinate normalization, convention checks, topology screening, authority qualification, and missing-data lists.
- `overlap.ts`: pure metadata-only geometry evaluator, independent of sensor and UI.
- `service.ts`: session ownership, bounded durable intake attempts, immutable products/pairs, report persistence through Drizzle.
- `http.ts`: bounded JSON streams, origin checks, stable error codes, private response headers.
- `src/components/phase-one.tsx`: inline scientific panel, existing-workflow integration, two-label input dialog, provenance inspection, explicit validation, JSON report download.

The small Phase 1 workload runs server-side in Next.js/Node. The proposed future Python/GDAL/ISIS worker architecture is not replaced or claimed implemented. These typed metadata/geometry contracts can be moved to the proposed scientific service later. No CPU image worker, message queue, or SPICE execution is needed for this release.

## Input and immutability

Upload **one small metadata file per logical product** or supply an allowed official HTTPS metadata URI. Ancillary references are recorded as metadata and never dereferenced. Limits:

- Complete XML/LBL/LAB/PVL/JSON metadata: **256 KiB** maximum.
- IMG/CUB: read at most **64 KiB of its prefix**, retain only a complete text label through `END`. Browser selection does not upload the whole file.
- No TIFF, ZIP, pixel-array, or SPICE uploads/downloads. For GeoTIFF, provide an existing `gdalinfo -json` inspection produced with read-only access, **without** statistics, histogram, or checksum options that scan pixels or can create sidecars. This application does not execute GDAL.
- HTTPS range-readable IMG/CUB endpoints must return a valid bounded `206 Content-Range`. A server returning `200` is cancelled before its payload is read. Detached-label transfers are capped both by Content-Length and streaming byte count. A bounded prefix may include discarded bytes after the text label; no raster is retained or processed.
- External requests have a 15-second timeout; redirects are revalidated (maximum 3). Credentials, query tokens, arbitrary hosts, and protected PRADAN paths are refused. No archive authentication is bypassed.
- 40 metadata operations per anonymous session per 15 minutes; up to 100 stored products per session. Failed fetches count as intake attempts.

Inputs are never opened for writing. Original bytes are retained exactly as a separate base64 metadata snapshot in PostgreSQL. Hashes cover **the inspected bytes**, not an entire referenced raster. Original raster size is a declared observation, not proof of integrity. A local offline adapter opens allowed files with `r` and bounded reads; no HTTP route accepts filesystem paths.

`phase1_products`, `phase1_pairs`, and `phase1_overlap_reports` are append-only. Run `npx drizzle-kit push` then `npx tsx scripts/harden-phase1.ts` after environment bootstrap to install database mutation-rejection triggers. Updating or deleting a product, pair or report is forbidden. Reinspection creates new evidence; revalidation appends a report. Pair foreign keys enforce role and ownership at the database level. Immutable evidence retention will need an audited administrator lifecycle policy before multi-user production rollout.

## Metadata formats actually supported

| Input | Extracted, when explicitly present | Important boundary |
|---|---|---|
| PDS4 `Product_Observational` XML | Logical ID, typed instrument component, mission/target, Line/Sample/Band axes, times, product GSD, ISDA refined/system corners, CART bounding/CRS fields | Namespace-bearing paths retained; XML structural validation only, no XSD/Schematron certification; multiple image arrays rejected; unknown mission fields retained, not guessed |
| PDS3 PVL `.lbl/.lab` or bounded IMG label | Product/instrument/mission/target IDs, LEFT/RIGHT NAC identity, image dimensions, exposure/sample info, explicit-unit GSD/radii/coordinates | Requires complete balanced PVL ending in END; never follows pointers; missing units are not inferred |
| ISIS text PVL / bounded CUB label | Instrument, dimensions, mapping/units where present, time/archive fields | Does not read ISIS polygon blobs, tables, camera models, OriginalXmlLabel blobs, or SPICE kernels; explicit EquatorialRadius supplies a/b only under ISIS semantics |
| GDAL JSON inspection of GeoTIFF-style data | Dataset size, metadata, CRS WKT, full six-term affine transform, explicitly supported map sampling | `wgs84Extent` is **never** used as lunar geography. Projected samples require explicit Moon frame/datum/radii/conventions. Fixed-sampling boundaries stay UNVERIFIED; no pixel mask or source authenticity is implied |
| `lunaris.metadata/1` evidence manifest | Explicit metadata and a single closed coverage polygon with boundary model, units and coordinate order | Not an archive standard. An upload is unverified unless its exact bytes have been reviewed against an authoritative source. No fabricated examples are bundled in the UI |

Every extracted value has file, byte SHA-256, field/keyword path, extraction method, original units, available CRS/datum, and authority. Canonical converted values also have output units. Nulls mean absent or ambiguous values. An unqualified `Selenographic` string does not identify latitude convention. Nominal sensor resolution is never used as product GSD.

### Lunar evidence manifest contract

A `lunaris.metadata/1` object uses explicit metadata fields at the root: `productId`, `instrument`, `mission`, `target`, `cameraView`, `width`, `height`, `start_time`, `stop_time`, `gsd`, `sampleGsd`, `lineGsd`, `frame`, `datum`, `radiusA`, `radiusB`, `radiusC`, `latitudeType`, `longitudeDirection`, and optional `longitudeDomain`. Dimensional quantities use an object with `value` and `unit`; metric GSD units are `m/pixel`, `km/pixel`, or supported exact equivalents. Radii require explicit `m`/`km` units.

For coverage polygons, `footprint.type` is `Polygon`; `coordinates` is one closed ring of `[longitude, latitude]` pairs, with at most 256 distinct vertices; `angularUnit` is `degrees`; `coordinateOrder` is `longitude, latitude`; and `boundaryModel` is explicitly `GREAT_CIRCLE` or `LON_LAT_LINEAR`. Holes, multipolygons, ambiguous boundaries, and nonlocal polar/global topology are not supported. Bounding extents can instead use explicit-unit `west`, `east`, `south`, `north` fields; these remain envelopes, never a positive-overlap proof.

This manifest describes existing authoritative evidence; it is not a means to invent or self-certify a lunar footprint. No public API accepts an authority/verification boolean. The selected sensor remains distinct from the extracted instrument.

## Authority policy

- `UNVERIFIED_UPLOAD`: all browser/local uploads by default. A user-supplied official URL does not upgrade trust.
- `AUTHORITATIVE_ARCHIVE`: bytes retrieved directly by the server from an allowlisted official archive. Confirms origin, not metadata completeness, geolocation accuracy, or actual image quality.
- `REVIEWED_HASH`: an administrator-reviewed exact-byte hash against an authoritative metadata document.

Optional server-only `LUNARIS_REVIEWED_METADATA_JSON` is an array of records with `sha256`, official HTTPS `uri`, and a nonempty `citation` documenting an independent review. It is **not configured by this implementation**. This is a trust-root administration operation, not a UI override. A review of a derived manifest must verify product association, full coverage boundary, units, frame/realization, and datum against the cited official records. It must not certify coordinates merely because they look plausible. A protected archive citation can document an authorized offline review without this application fetching or bypassing it.

Official hosts currently allowlisted: NASA PDS MCP (restricted to the LRO archive path), LROC PDS archive hosts, USGS PDS imaging archive, and ISDA/PRADAN under their allowed paths. Only metadata extensions or bounded IMG/CUB headers are requestable. The UI uses its existing anonymous HttpOnly private session for ownership; this is not an archive login or permanent scientific user account.

## Footprints and overlap algorithm

1. Inspect one source and one reference independently. Extract geography only from explicit metadata; dimensions, filenames, appearance, and feature counts are not geographic evidence.
2. Require documented Moon target and mission/instrument/product identity; explicit latitude type, longitude direction, frame/realization, datum, and all three metric radii. Missing values yield `INSUFFICIENT_DATA` and an exact list.
3. Convert explicitly west-positive longitudes to east-positive; normalize modulo 360 into `[-180,180]`; retain original domain or null. Unwrap local antimeridian crossings for geometry. Retain raw corner coordinates and provenance even when normalization is blocked.
4. Reject invalid coordinates, open/self-crossing/degenerate rings, pole-touching or hemisphere-spanning extents. Four-corner strip approximations and fixed-sampling raster boundaries remain `UNVERIFIED`.
5. Require independently traceable authority. Complete uploaded coordinates alone remain `UNVERIFIED`. Require identical named lunar frame/datum and compatible explicit radii. Ellipsoidal/triaxial models or transformations between different lunar frames are not silently approximated.
6. Bounding-box intersection is a screening result only. Disjoint authoritative enclosing boxes (or linear-boundary polygon envelopes) can establish `NO_OVERLAP`; positive screening returns `UNVERIFIED`, with area and percentages withheld.
7. For supported authoritative coverage polygons on a common explicit lunar sphere, select a local Lambert azimuthal equal-area projection with that radius, explicit zero false east/north offsets, and a conservative local-domain limit. **No Earth EPSG or default WGS84 conversion is used.**
8. Densify declared great-circle or lon/lat-linear edges at 0.05° and 0.025°. Limit vertices to bound work. Project, validate topology, and intersect via the Martinez–Rueda–Feito polygon-clipping algorithm. Calculate shoelace areas in projected lunar square metres, not degree-square or Earth-geography units.
9. Compare both resolutions. Topological disagreement, unstable area (>0.1% of intersection with a numerical floor), below-resolution intersections, invalid denominators, or clipping exceptions return `UNVERIFIED`. Boundary-only contact has no positive area and returns `NO_OVERLAP`.
10. Report `OVERLAP` only for a stable positive-area intersection of traceable coverage polygons. Percentages have two explicit denominators: intersection/source footprint and intersection/reference footprint. They are not valid-pixel coverage, registration metrics, or positional-accuracy guarantees.

The four scientific states are `OVERLAP`, `NO_OVERLAP`, `INSUFFICIENT_DATA`, and `UNVERIFIED`. The UI additionally shows `NOT EVALUATED` and transient `VALIDATING`. Geographic overlap does not relax or satisfy any future correspondence/registration quality gate.

## API

All responses are private/no-store. Mutations require same-origin JSON; errors have code, message, needed inputs, trace ID, and `registration: NOT_IMPLEMENTED`.

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/science/capabilities` | Formats, limits, honest capability/dependency boundaries |
| POST | `/api/science/products` | `{role, sensor, input}`; immutable inspected metadata product; 201 |
| GET | `/api/science/products` | This session’s product summaries |
| GET | `/api/science/products/{id}/metadata` | Extracted and uninterpreted fields, provenance, missing information |
| GET | `/api/science/products/{id}/footprint` | Raw-derived normalized lunar geometry, CRS, limitations, status |
| POST | `/api/science/pairs` | Exactly `{sourceProductId, referenceProductId}`; immutable pair; NOT_EVALUATED |
| GET | `/api/science/pairs` | This session’s latest pair IDs |
| GET | `/api/science/pairs/{id}` | Pair, checked metadata snapshot hashes, and latest overlap report |
| POST | `/api/science/pairs/{id}/overlap` | Empty object only; explicit validation; appends report |
| GET | `/api/science/pairs/{id}/report` | Structured report; 409 NOT_EVALUATED before validation |
| GET | `/api/science/pairs/{id}/report?download=1` | JSON validation-report attachment, including rejected/insufficient outcomes |

`input` is either `kind: upload` plus `fileName`, canonical `contentBase64`, `scope` (`COMPLETE_METADATA_FILE` or `ATTACHED_LABEL_ONLY`), optional `originalByteLength`/`claimedArchiveUrl`; or `kind: archive` plus `url`. Never send credentials. Sequential product POSTs establish the anonymous session cookie before submitting the pair. No matching endpoint exists.

## Test data and tests

`tests/fixtures/phase1/provenance.json` records exact source URLs, hashes, sizes, and caveats.

- Two real-label-derived OHRC/TMC-2 XML fixtures and one ISIS PVL fixture are verbatim copies from a pinned USGS ISIS repository commit. Upstream tests reduced the image dimensions; these are parser fixtures, **not verified production observations**. They are never seeded into the demo or granted authority.
- `M104318871LE.header.lbl` is the verbatim PDS3 attached label fetched in a bounded 32 KiB HTTP range from NASA’s official archive. Only 4,131 label bytes are retained. The referenced ~264 MB image was not downloaded. The genuine label lacks geographic corners and GSD, so tests require missing-data outcomes.
- Mathematical coordinate cases are private unit-test inputs only, explicitly named NOT-A-MISSION-PRODUCT. They test intersections and coordinate handling, not scientific observations or registration accuracy. They are never served, registered as trusted metadata, or shown in the UI.
- No authoritative IIRS fixture was available. Only identity/missing-data contract tests are present for IIRS; full real-IIRS dictionary validation remains an explicit data dependency.

Commands: `npx tsx --test tests/unit/phase1.test.ts`; after schema/hardening, `npx tsx --test tests/integration/phase1-db.test.ts`; `npx playwright test`; `npx next typegen`; `npm exec tsc -- --noEmit --pretty false`; `npm exec eslint -- src tests scripts playwright.config.ts`; `npm run build`; then platform `build_and_start` and `/api/health`.

## Exact outstanding prerequisites and Phase 2 boundary

- Legitimately acquired, unmodified ISDA OHRC/TMC-2/IIRS labels with documented longitude/latitude conventions, lunar frame/realization, datum and radii. The retrieved CH2 fixture labels supply corners but not these geodetic definitions.
- A single NAC observation’s authoritative geometry/index/footprint metadata, line/sample GSD and coordinate definitions. The genuine EDR header alone supplies neither GSD nor a footprint.
- A vetted authoritative IIRS product, its mission dictionary and band/axis interpretation. Nominal 80 m must not replace actual product metadata.
- An independently reviewed pair of real compatible **coverage** polygons or the supported camera/geolocation inputs required to derive them. No live real pair has been claimed to overlap in this release.
- For projected/raw products: a separate read-only native GDAL/ISIS/SPICE camera-model environment, validated instrument/processing-level support, authorized kernels and DEMs, and lineage-preserving footprint derivation. These are not installed/executed here.
- Further geometry support requires independently tested adaptive projected boundaries, polygon holes/multipolygons, polar-cap/global topology, and non-spherical lunar models/frame transformations.
- Before production: authenticated user accounts, audited review-registry administration, system-wide quotas, bounded XML semantic/dictionary certification, and immutable-evidence retention policy.

Phase 2 may address these explicit data/geolocation prerequisites and extend the product capability matrix after approval. It must preserve original files, current failure evidence, and future strict quality gates. This release **stops at Phase 1**; no matching, robust image geometry, registration, refinement, or registered output is implemented or automatically started.
