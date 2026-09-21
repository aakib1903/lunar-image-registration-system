import { test, expect, request as apiRequest } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { validatePlan } from "../src/lib/plan-validation";
import { architecture, proposalMarkdown, workflow } from "../src/lib/architecture";

const draft = { name: "Browser-verified planning draft", sourceSensor: "iirs", referenceSensor: "lro_nac", sourceProductId: null, referenceProductId: null, tileOverlap: 20, notes: "Planning workflow verification only. No image products or scientific results." };

test("proposal covers A–P and all eleven workflow stages without scientific results", () => {
  expect(architecture.map((section) => section.id).join("")).toBe("ABCDEFGHIJKLMNOP");
  expect(workflow).toHaveLength(11);
  const proposal = proposalMarkdown();
  expect(proposal).toContain("BLOCKED_CONFIG");
  expect(proposal).toContain("Failed candidates");
  expect(proposal).toContain("An IIRS run goes directly");
  expect(proposal).toContain("No next phase begins automatically");
  expect(validatePlan(draft).sourceSensor).toBe("iirs");
  expect(() => validatePlan({ ...draft, sourceSensor: ["ohrc", "tmc2"] })).toThrow("exactly one");
  expect(() => validatePlan({ ...draft, referenceSensor: "lro_wac" })).toThrow("LRO NAC");
  expect(() => validatePlan({ ...draft, status: "success" })).toThrow("not implemented");
  expect(() => validatePlan({ ...draft, tileOverlap: 3 })).toThrow("between 10% and 50%");
});

test("draft API persists, isolates sessions, rejects fabricated success, and deletes", async ({ request, baseURL }) => {
  expect((await request.get("/api/plans")).status()).toBe(200);
  const created = await request.post("/api/plans", { data: draft });
  expect(created.status()).toBe(201);
  const { plan } = await created.json();
  expect(plan.status).toBe("draft");
  expect(plan.ownerId).toBeUndefined();
  const listed = await (await request.get("/api/plans")).json();
  expect(listed.plans.some((item: { id: string }) => item.id === plan.id)).toBe(true);
  const other = await apiRequest.newContext({ baseURL });
  try {
    expect((await (await other.get("/api/plans")).json()).plans).toHaveLength(0);
    expect((await other.patch(`/api/plans/${plan.id}`, { data: draft })).status()).toBe(404);
    expect((await other.delete(`/api/plans/${plan.id}`)).status()).toBe(404);
    expect((await request.post("/api/plans", { data: { ...draft, sourceSensor: ["ohrc", "iirs"] } })).status()).toBe(422);
    expect((await request.post("/api/plans", { data: { ...draft, status: "success" } })).status()).toBe(422);
    expect((await request.post("/api/plans", { data: draft, headers: { Origin: "https://untrusted.invalid" } })).status()).toBe(403);
    const patched = await request.patch(`/api/plans/${plan.id}`, { data: { ...draft, name: "Updated draft", tileOverlap: 35 } });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).plan.tileOverlap).toBe(35);
  } finally {
    expect((await request.delete(`/api/plans/${plan.id}`)).status()).toBe(200);
    await other.dispose();
  }
  const exportResponse = await request.get("/api/architecture");
  expect(exportResponse.headers()["content-type"]).toContain("text/markdown");
  expect(await exportResponse.text()).toContain("## P. Implementation phases");
});

test("one-source selector and complete saved-plan lifecycle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Different sensors. Common ground.");
  const iirs = page.getByRole("radio").filter({ hasText: "IIRS" });
  await iirs.click();
  await expect(iirs).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio").filter({ hasText: "OHRC" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Configure pair" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No imagery is downloaded or processed");
  await page.getByLabel("Study name").fill("Lunar planning lifecycle check");
  await page.getByLabel("Study notes").fill("An unexecuted draft created to verify persistence and export.");
  await page.getByRole("button", { name: "Processing intent" }).click();
  await page.getByLabel("Long-axis tile overlap").fill("35");
  await page.getByRole("button", { name: "Save mission plan" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Mission plan saved" })).toBeVisible();
  await page.getByRole("link", { name: /Saved plans/ }).click();
  await expect(page.getByRole("heading", { name: "Lunar planning lifecycle check" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lunar planning lifecycle check" })).toBeVisible();
  await expect(page.getByText("35% tile overlap", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Edit Lunar planning lifecycle check", exact: true }).click();
  await page.getByLabel("Study name").fill("Updated lunar planning check");
  await page.getByRole("button", { name: "Save mission plan" }).click();
  await expect(page.getByRole("heading", { name: "Updated lunar planning check" })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Updated lunar planning check", exact: true }).click();
  const download = await downloadEvent;
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadedPath!, "utf8"));
  expect(exported.documentType).toBe("LUNARIS_PLANNING_DRAFT");
  expect(exported.plan.sourceSensor).toBe("iirs");
  expect(exported.plan.tileOverlap).toBe(35);
  expect(exported.plan.status).toBe("draft");
  await page.getByRole("button", { name: "Delete Updated lunar planning check", exact: true }).click();
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Updated lunar planning check" })).not.toBeVisible();
});

test("architecture, pipeline, and quality evidence are readable and explicitly unexecuted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Stage 5: Preprocessing — read the proposal", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No stage has been executed");
  await page.getByRole("button", { name: "Explore module architecture" }).click();
  await expect(page.getByRole("dialog")).toContainText("Ordered operations");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Architecture", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A system built on sound science.");
  await page.getByLabel("Search architecture proposal").fill("antimeridian");
  await expect(page.getByText("No matching sections")).not.toBeVisible();
  await expect(page.locator(".architecture-section")).not.toHaveCount(16);
  await page.getByRole("button", { name: "Clear architecture search" }).click();
  await expect(page.locator(".architecture-section")).toHaveCount(16);
  await page.getByRole("link", { name: "Quality framework", exact: true }).click();
  await expect(page.getByText("Not evaluated", { exact: false })).toHaveCount(8);
  await expect(page.getByText("BLOCKED_CONFIG", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Scientific deliverables/ }).click();
  await expect(page.getByText("No result produced", { exact: false })).toHaveCount(8);
});

test("desktop and mobile layouts render without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator(".moon-image").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Different sensors. Common ground." })).toBeVisible();
  await page.screenshot({ path: "artifacts/lunaris-desktop.png", fullPage: true });
  const baseline = await page.locator(".moon-image").getAttribute("style");
  await page.getByRole("button", { name: "Zoom into lunar context" }).click();
  await expect(page.locator(".moon-image")).not.toHaveAttribute("style", baseline ?? "");
  await page.getByRole("button", { name: "Reset context zoom" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator(".sidebar").evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/lunaris-mobile.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Architecture", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A system built on sound science.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
