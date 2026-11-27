import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4173;
const origin = `http://${host}:${port}`;
const basePath = process.env.VITE_BASE_PATH || "/studioscout/";
const appUrl = new URL(basePath, origin).toString();
const storageKey = "studio-outreach-tracker-v1";
const previewEntry = path.resolve("node_modules/vite/bin/vite.js");

async function waitForPreview(server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error("Vite preview exited before becoming ready.");
    }
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await delay(250);
  }
  throw new Error("Vite preview did not become ready within 20 seconds.");
}

async function performWithDialog(page, action, accept) {
  const dialogResult = new Promise((resolve) => {
    page.once("dialog", async (dialog) => {
      const result = { type: dialog.type(), message: dialog.message() };
      if (accept) await dialog.accept();
      else await dialog.dismiss();
      resolve(result);
    });
  });

  const actionResult = action();
  const [, dialog] = await Promise.all([actionResult, dialogResult]);
  return dialog;
}

async function main() {
  assert.ok(existsSync(path.resolve("dist/index.html")), "Build the production site before browser tests.");
  assert.ok(existsSync(previewEntry), "Vite must be installed before browser tests.");

  const server = spawn(
    process.execPath,
    [previewEntry, "preview", "--host", host, "--port", String(port), "--strictPort"],
    { stdio: "ignore", env: process.env },
  );
  let browser;

  try {
    await waitForPreview(server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const pageErrors = [];
    const writeRequests = [];

    const posterFixture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
    const landscapeFixture = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215"><rect width="460" height="215" fill="#345"/><text x="230" y="118" fill="white" text-anchor="middle" font-size="24">Landscape artwork</text></svg>',
    );
    await page.route("**/*", async route => {
      const requestUrl = route.request().url();
      if (
        requestUrl.includes("images.igdb.com") ||
        requestUrl.includes("d4ngames.com") ||
        requestUrl.includes("www.ahoiii.com") ||
        requestUrl.includes("mzstatic.com")
      ) {
        await route.fulfill({ status: 200, contentType: "image/png", body: posterFixture });
        return;
      }
      if (!requestUrl.includes("steamstatic")) {
        await route.continue();
        return;
      }
      const url = new URL(requestUrl);
      const isTrailPortrait = url.pathname.includes("/steam/apps/3544920/") && url.pathname.includes("library_600x900");
      if (isTrailPortrait) {
        await route.fulfill({ status: 404 });
        return;
      }
      const isHeader = url.pathname.endsWith("/header.jpg");
      await route.fulfill({
        status: 200,
        contentType: isHeader ? "image/svg+xml" : "image/png",
        body: isHeader ? landscapeFixture : posterFixture,
      });
    });
    // Register the specific API mock after the catch-all route: Playwright uses
    // the most recently registered matching handler first.
    await page.route("https://api.github.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workflow_runs: [{
            status: "completed",
            conclusion: "success",
            updated_at: "2026-10-31T17:49:00Z",
            html_url: "https://github.com/hhaitam95/studioscout/actions/runs/41225527000",
          }],
        }),
      });
    });
    await page.addInitScript(() => {
      if (!localStorage.getItem("studio-outreach-theme-v1")) {
        localStorage.setItem("studio-outreach-theme-v1", "light");
      }
      Date.now = () => new Date("2026-10-31T18:00:00.000Z").getTime();
    });

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      if (!["GET", "HEAD"].includes(request.method())) {
        writeRequests.push({ method: request.method(), url: request.url() });
      }
    });

    await page.goto(appUrl, { waitUntil: "networkidle" });
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    assert.match(await page.title(), /StudioScout/);
    assert.equal(await page.locator(".workspace-label").count(), 0, "The redundant workspace label should not be displayed.");
    assert.equal(await page.locator(".theme-toggle svg.ui-icon").count(), 1, "The theme control should show an outline icon.");
    assert.ok(
      Number.parseFloat(await page.locator("body").evaluate(element => getComputedStyle(element).fontSize)) >= 17,
      "The global page typography should be larger than the 16px browser baseline.",
    );
    await page.getByRole("heading", { name: "Studio directory" }).waitFor();
    await page.getByText(/Last successful run:/).waitFor();

    const toolbarGeometry = await page.locator(".directory-toolbar").evaluate(element => {
      const children = Array.from(element.children).map(child => {
        const rect = child.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });
      const controls = Array.from(element.querySelectorAll(
        ".directory-filter-picker summary, .reset-filters-button",
      )).map(control => {
        const rect = control.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      });
      return { children, controls };
    });
    assert.equal(toolbarGeometry.children.length, 2);
    assert.ok(
      Math.abs(toolbarGeometry.children[0].left - toolbarGeometry.children[1].left) < 1 &&
      Math.abs(toolbarGeometry.children[0].width - toolbarGeometry.children[1].width) < 1,
      "The primary and secondary filter rows should span the same full-width column.",
    );
    assert.ok(
      toolbarGeometry.controls.every(control => Math.abs(control.top - toolbarGeometry.controls[0].top) < 1),
      "All secondary filter controls and Reset filters should share one aligned baseline.",
    );
    assert.ok(
      toolbarGeometry.controls.every(control => Math.abs(control.height - 40) < 1),
      "Every secondary filter control should have the same 40px height.",
    );
    assert.equal(await page.locator(".filter-picker-chevron").count(), 0, "Filter dropdowns should not render a redundant chevron.");
    assert.equal(await page.locator(".directory-filter-picker summary svg").count(), 0, "Filter dropdown summaries should remain text-only.");
    assert.equal(await page.locator(".directory-filter-field .directory-filter-label svg.ui-icon").count(), 5, "Each multi-select filter, including Work model, should show its icon on the label.");
    assert.equal(await page.locator(".work-model-filter .directory-filter-label svg.ui-icon").count(), 1, "Work model should have a label icon.");
    assert.equal(await page.locator(".reset-filters-button svg.ui-icon").count(), 1, "Reset filters should have a reset icon.");

    assert.deepEqual(
      await navigation.locator(".nav-label").allTextContents(),
      ["Studios", "My applications"],
      "Games, Matches and My profile should remain hidden from the active navigation.",
    );

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    assert.equal(await page.locator("html").getAttribute("data-bs-theme"), "dark");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("data-bs-theme"), "dark", "Theme choice should persist.");
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    assert.equal(await page.locator("html").getAttribute("data-bs-theme"), "light");

    await page.getByLabel("Rows per page").selectOption("100");
    const rows = page.locator(".studio-data-row");
    const initialCount = await rows.count();
    const totalResultsText = await page.locator(".directory-pagination-summary").textContent() || "";
    const totalResults = Number(totalResultsText.match(/of\s+(\d+)/)?.[1] || 0);
    const filteredTotal = async () => {
      const text = await page.locator(".directory-pagination-summary").textContent() || "";
      return Number(text.match(/of\s+(\d+)/)?.[1] || 0);
    };
    assert.ok(totalResults > 100, "The global directory should contain a substantial set of active studios.");
    assert.equal(initialCount, 100, "The selected page size should cap the initial directory view at 100 rows.");
    assert.ok(await page.locator(".studio-mark").count() > 50, "Studio marks should appear for visible directory rows.");
    assert.ok(await page.locator(".studio-table .location-cell .country-flag").count() > 50, "Known studio locations should display country flags.");
    assert.ok(await page.locator(".studio-scale-tag").count() > 0, "Classified studios should show a scale badge beside the name.");
    assert.ok(await page.locator(".studio-table .tag-list-platform .studio-facet-tag").count() > 0, "Platform should have its own column.");
    assert.ok(await page.locator(".studio-table .tag-list-focus .studio-facet-tag").count() > 0, "Focus should have its own column.");
    assert.deepEqual(
      await page.locator(".studio-table thead th").evaluateAll(headers => headers.map(header =>
        header.querySelector(".column-sort-button span:first-child")?.textContent?.trim() || header.textContent?.trim()
      )),
      ["Studio", "Location", "Notable work", "Scale", "Studio role", "Platform", "Focus", "Tracker"],
      "The main table should keep only general studio information and the tracker action.",
    );
    assert.equal(
      await rows.first().locator("td").count(),
      8,
      "Every studio data row should have one cell for each separate studio facet and the tracker action.",
    );
    const newStudioLabel = page.locator(".new-only-filter .form-check-label");
    assert.match(
      (await newStudioLabel.textContent() || "").trim(),
      /^✨ New studios \(\d+\)$/,
      "The New studios toggle should use the sparkle emoji label.",
    );
    assert.equal(
      await newStudioLabel.locator("svg").count(),
      0,
      "The New studios label should not render the former inline sparkle icon.",
    );
    const displayedNewStudioCount = Number((await newStudioLabel.textContent() || "").match(/\((\d+)\)/)?.[1]);
    assert.ok(Number.isInteger(displayedNewStudioCount), "The New studios filter should display its current count, including zero.");
    await page.getByLabel("Show only newly added studios").check();
    const newStudioCount = await rows.count();
    assert.equal(displayedNewStudioCount, newStudioCount, "The New studios counter should match the studios currently marked NEW.");
    assert.ok(newStudioCount > 0, "The persistent New studios filter should show the current discovery batch.");
    assert.equal(await page.getByText("NEW", { exact: true }).count(), newStudioCount, "Every filtered studio should carry the NEW marker.");
    await page.getByRole("button", { name: "Reset filters" }).click();
    assert.equal(await rows.count(), initialCount, "Reset filters should restore the full directory.");

    // Search and empty-state recovery.
    await page.getByLabel("Search", { exact: true }).fill("no-studio-with-this-name-9345");
    await page.getByText("No studios match these filters.").waitFor();
    await page.getByRole("button", { name: "Reset filters" }).click();
    assert.equal(await rows.count(), initialCount, "Clearing filters should restore the directory.");

    await page.getByLabel("Search", { exact: true }).fill("4A Games");
    assert.equal(await rows.count(), 1, "A matching studio search should return the intended studio.");
    await rows.getByText("4A Games").waitFor();
    const fourARow = rows.filter({ hasText: "4A Games" });
    const tablePosterEntries = fourARow.locator(".popular-work-list .popular-game-entry");
    assert.equal(await tablePosterEntries.count(), 2, "The Notable work table column should show two poster covers.");
    assert.equal(await tablePosterEntries.locator(".popular-game-caption small").count(), 2, "Both table posters should show their release year or verification status.");
    const tablePosterFrames = await tablePosterEntries.locator(".popular-game-cover").evaluateAll(frames =>
      frames.map(frame => {
        const rect = frame.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
    assert.ok(tablePosterFrames.every(frame => frame.width === 64 && frame.height === 96), "Both table posters should use the same 64×96 portrait frame.");
    await fourARow.getByRole("button", { name: "4A Games" }).click();
    const fourAPosters = page.locator(".game-poster-grid .game-poster-card");
    assert.equal(await fourAPosters.count(), 2, "Expanded studio profiles should render one poster card per notable game.");
    assert.deepEqual(
      await fourAPosters.evaluateAll(cards => cards.map(card => card.getAttribute("data-game-title"))),
      ["Metro Exodus", "Metro: Last Light Redux"],
    );
    assert.ok(
      await page.locator(".game-poster-grid img").count() > 0,
      "Listed games should render cover artwork images.",
    );
    const metroExodusPoster = page.locator('.game-poster-grid .game-poster-card[data-game-title="Metro Exodus"]');
    assert.equal(await page.locator(".studio-profile-close").count(), 0, "Expanded studio profiles should close by re-clicking the studio row.");
    assert.equal(await page.locator(".studio-detail-section .section-count").count(), 0, "Notable work should not show redundant selected-title metadata.");
    assert.equal((await page.locator(".studio-detail-section h3").filter({ hasText: "Notable work" }).textContent() || "").trim(), "Notable work");
    assert.equal(await fourAPosters.locator(".game-poster-caption small").count(), await fourAPosters.count(), "Every expanded-profile cover should show a release year or an explicit verification status.");
    const expandedPosterFrames = await fourAPosters.locator(".game-poster-art").evaluateAll(frames =>
      frames.map(frame => {
        const rect = frame.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
    assert.ok(expandedPosterFrames.every(frame => Math.abs(frame.height / frame.width - 1.5) < 0.01), "Every expanded-profile cover should keep the same 2:3 portrait frame.");
    const metroExodusImage = metroExodusPoster.locator('img[data-artwork-source="IGDB"]');
    await metroExodusImage.waitFor();
    assert.ok(
      (await metroExodusImage.getAttribute("src") || "").includes("/coaroh.jpg"),
      "When a game has both IGDB and Steam artwork, the IGDB cover should be displayed first.",
    );
    await fourARow.getByRole("button", { name: "4A Games" }).click();
    await page.getByLabel("Search", { exact: true }).fill("Youniverse Games");
    const youniverseRow = rows.filter({ hasText: "Youniverse Games" });
    assert.equal(await youniverseRow.count(), 1, "Youniverse Games should be searchable in the directory.");
    await youniverseRow.getByRole("button", { name: "Youniverse Games" }).click();
    const yoocaPoster = page.locator('.game-poster-grid .game-poster-card[data-game-title="Yooca: Your Life"]');
    assert.equal(await yoocaPoster.getAttribute("data-release-year"), "2026", "Yooca should display its source-verified 2026 launch year.");
    assert.equal((await yoocaPoster.locator(".game-poster-caption small").textContent() || "").trim(), "2026");
    await youniverseRow.getByRole("button", { name: "Youniverse Games" }).click();
    await page.getByLabel("Search", { exact: true }).fill("");
    assert.equal(await rows.count(), initialCount, "Clearing a successful search should restore the directory.");

    // Continent, country, normalized facets and route work-model filters must narrow the visible result set.
    const continent = page.getByLabel("Continent");
    const continentValues = await continent.locator("option").evaluateAll((options) =>
      options.map((option) => option.value),
    );
    assert.ok(continentValues.includes("Europe"), "The continent filter should include Europe.");
    assert.ok(continentValues.includes("Asia"), "The continent filter should include Asia.");
    assert.ok(continentValues.includes("Africa"), "The continent filter should include Africa.");
    assert.match(await continent.locator('option[value="Europe"]').textContent() || "", /🌍/, "Continent options should show their emoji.");
    assert.equal(continentValues.includes("Remote / distributed"), false, "Remote should not appear in the Continent filter.");
    assert.equal(continentValues.includes("Not stated"), false, "Not stated should not appear in the Continent filter.");
    await continent.selectOption("Europe");
    const europeRows = await rows.count();
    const europeTotal = await filteredTotal();
    assert.ok(europeRows > 0 && europeTotal > 0 && europeTotal < totalResults, "Europe filtering should narrow the full directory result set.");
    assert.equal(
      await rows.evaluateAll((tableRows) => tableRows.every((row) => (row.getAttribute("data-continents") || "").split("|").includes("Europe"))),
      true,
      "Every row shown by the Europe filter should have a European headquarters.",
    );
    await continent.selectOption("All continents");

    const country = page.getByLabel("Country");
    const countryValues = await country.locator("option").evaluateAll((options) =>
      options.map((option) => option.value),
    );
    const firstCountry = countryValues.find((value) => value !== "All countries");
    assert.ok(firstCountry, "The country filter should contain real countries.");
    const countryOptionText = await country.locator('option[value="' + firstCountry + '"]').textContent() || "";
    assert.ok(countryOptionText.trim().length > firstCountry.length, "Country options should show their flag emoji.");
    await country.selectOption(firstCountry);
    const countryCount = await filteredTotal();
    assert.ok(countryCount > 0 && countryCount < totalResults, "Country filtering should narrow the full directory result set.");
    await country.selectOption("All countries");

    const scalePicker = page.locator(".directory-filter-picker").nth(0);
    const platformPicker = page.locator(".directory-filter-picker").nth(1);
    await scalePicker.locator("summary").click();
    assert.notEqual(await scalePicker.getAttribute("open"), null, "A filter dropdown should open when its summary is selected.");
    await platformPicker.locator("summary").click();
    assert.equal(await scalePicker.getAttribute("open"), null, "Opening another filter should close the previously open dropdown.");
    assert.notEqual(await platformPicker.getAttribute("open"), null, "The newly selected filter should open.");
    await page.locator(".directory-page > .page-heading").click();
    assert.equal(await platformPicker.getAttribute("open"), null, "Clicking outside the filters should close an open dropdown.");
    await scalePicker.locator("summary").click();
    await page.keyboard.press("Escape");
    assert.equal(await scalePicker.getAttribute("open"), null, "Pressing Escape should close an open dropdown.");
    await platformPicker.locator("summary").click();
    const pcFilter = page.getByRole("checkbox", { name: "Platform: PC" });
    const mobileFilter = page.getByRole("checkbox", { name: "Platform: Mobile" });
    await pcFilter.check();
    await mobileFilter.check();
    const platformCount = await filteredTotal();
    assert.ok(platformCount > 0 && platformCount < totalResults, "Selecting multiple platforms should narrow the full directory result set.");
    assert.equal(await page.locator(".active-filter-chip").count(), 2, "Each selected platform should appear as a removable active filter chip.");
    await platformPicker.locator("summary").click();
    await page.locator(".active-filter-chip").first().click();
    assert.equal(await page.locator(".active-filter-chip").count(), 1, "Removing a filter chip should remove only that filter.");
    await page.getByRole("button", { name: "Reset filters" }).click();
    assert.equal(await rows.count(), initialCount);

    const workModelPicker = page.locator(".directory-filter-picker").nth(4);
    await workModelPicker.locator("summary").click();
    const remoteWorkModel = page.getByRole("checkbox", { name: "Work model: Remote" });
    const hybridWorkModel = page.getByRole("checkbox", { name: "Work model: Hybrid" });
    await remoteWorkModel.check();
    const remoteCount = await filteredTotal();
    assert.ok(remoteCount > 0 && remoteCount < totalResults, "Remote work-model filtering should narrow the directory.");
    await hybridWorkModel.check();
    const combinedWorkModelCount = await filteredTotal();
    assert.ok(combinedWorkModelCount >= remoteCount && combinedWorkModelCount < totalResults, "Selecting multiple work models should include studios matching either option.");
    assert.equal(await page.locator(".active-filter-chip").count(), 2, "Each selected work model should appear as a removable chip.");
    await workModelPicker.locator("summary").click();
    await page.locator(".active-filter-chip").first().click();
    assert.equal(await page.locator(".active-filter-chip").count(), 1, "Removing one work-model chip should retain the other selection.");
    await page.getByRole("button", { name: "Reset filters" }).click();
    await page.getByLabel("Search", { exact: true }).fill("Laki Studios");
    await country.selectOption("Poland");
    await page.getByRole("button", { name: "Reset filters" }).click();
    assert.equal(await rows.count(), initialCount, "Reset filters should clear search and selects.");

    // Column headers sort the table and expose the active sort direction accessibly.
    const locationHeader = page.getByRole("button", { name: /Sort by Location/ });
    await locationHeader.click();
    assert.equal(await locationHeader.locator("xpath=..").getAttribute("aria-sort"), "ascending");
    const locationsAreSorted = await rows.evaluateAll((tableRows) => {
      const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
      const values = tableRows.map((row) => ({
        name: row.querySelector(".studio-name")?.textContent?.trim() || "",
        location: row.cells[1]?.textContent?.trim() || "",
      }));
      return values.every((current, index) => {
        if (index === 0) return true;
        const previous = values[index - 1];
        const locationOrder = collator.compare(previous.location, current.location);
        return locationOrder < 0 || (locationOrder === 0 && collator.compare(previous.name, current.name) <= 0);
      });
    });
    assert.equal(locationsAreSorted, true, "Location header sorting should follow displayed location and studio-name order.");
    await locationHeader.click();
    assert.equal(await locationHeader.locator("xpath=..").getAttribute("aria-sort"), "descending");
    await page.getByRole("button", { name: /Sort by Studio \(ascending\)/ }).click();

    // Rows expand into a concise studio profile with up to three notable titles.
    const fourAGamesRow = rows.filter({ hasText: "4A Games" });
    assert.deepEqual(
      await fourAGamesRow.locator(".popular-game-cover").evaluateAll(covers =>
        covers.map(cover => cover.getAttribute("data-game-title")),
      ),
      ["Metro Exodus", "Metro: Last Light Redux"],
      "The compact studio table should show two notable game thumbnails.",
    );
    await fourAGamesRow.locator("td").nth(3).click();
    const fourAGamesDetails = page.locator("#studio-details-4a-games");
    await fourAGamesDetails.waitFor();
    assert.match(await fourAGamesDetails.textContent(), /About/);
    assert.match(await fourAGamesDetails.textContent(), /Metro Exodus/);
    assert.match(await fourAGamesDetails.textContent(), /Team size/);
    assert.match(await fourAGamesDetails.textContent(), /Platforms/);
    assert.match(await fourAGamesDetails.textContent(), /Focus/);
    assert.doesNotMatch(await fourAGamesDetails.textContent(), /Studio type|Industry scale|Platforms and focus|Studio highlights|Studio information sources|Source 1/);
    assert.doesNotMatch(await fourAGamesDetails.textContent(), /Application route notes|Listed hiring locations|Listed disciplines|Route last checked:/);
    const fullWidthDetails = await fourAGamesDetails.locator("td").evaluate(cell => ({
      colSpan: cell.colSpan,
      cellWidth: cell.getBoundingClientRect().width,
      tableWidth: cell.closest("table").getBoundingClientRect().width,
    }));
    assert.equal(fullWidthDetails.colSpan, 8);
    assert.ok(fullWidthDetails.cellWidth >= fullWidthDetails.tableWidth - 2, "The expanded profile should span the entire table width.");
    const applicationLink = fourAGamesDetails.getByRole("link", { name: /Application/ });
    assert.equal(await applicationLink.getAttribute("href"), "https://www.4a-games.com.mt/other-cv");
    assert.equal(await applicationLink.getAttribute("target"), "_blank");
    assert.match(await applicationLink.getAttribute("rel") || "", /noopener/);
    const websiteLink = fourAGamesDetails.getByRole("link", { name: /Official website/ });
    assert.equal(await websiteLink.getAttribute("href"), "https://www.4a-games.com.mt/");
    const expandedMetroExodusPoster = fourAGamesDetails.locator('.game-poster-card[data-game-title="Metro Exodus"]');
    assert.equal(await expandedMetroExodusPoster.getAttribute("data-release-year"), "2019");
    await expandedMetroExodusPoster.getByText("2019", { exact: true }).waitFor();
    const metroLastLightPoster = fourAGamesDetails.locator('.game-poster-card[data-game-title="Metro: Last Light Redux"]');
    assert.equal(await metroLastLightPoster.getAttribute("data-release-year"), "2014");
    await fourAGamesRow.getByRole("button", { name: /4A Games/ }).click();
    await fourAGamesDetails.waitFor({ state: "detached" });

    // Curated official social/storefront links appear with named labels in the expanded overview.
    const asoboRow = rows.filter({ hasText: "Asobo Studio" });
    await asoboRow.getByRole("button", { name: /Asobo Studio/ }).click();
    const asoboDetails = page.locator("#studio-details-asobo-studio");
    await asoboDetails.waitFor();
    const linkedinLink = asoboDetails.getByRole("link", { name: "LinkedIn" });
    assert.equal(await linkedinLink.getAttribute("href"), "https://www.linkedin.com/company/asobo-studio/");
    assert.equal(await linkedinLink.getAttribute("target"), "_blank");
    assert.match(await linkedinLink.getAttribute("rel") || "", /noopener/);
    await asoboRow.getByRole("button", { name: /Asobo Studio/ }).click();
    await asoboDetails.waitFor({ state: "detached" });

    // Search must find studios across directory pages, not only within the currently visible page.
    await page.getByLabel("Search", { exact: true }).fill("Hugecalf Studios");
    // IGDB artwork wins over Steam when both are present (the Stuck Together example).
    const hugecalfRow = rows.filter({ hasText: "Hugecalf Studios" });
    await hugecalfRow.getByRole("button", { name: /Hugecalf Studios/ }).click();
    const hugecalfDetails = page.locator("#studio-details-hugecalf-studios");
    await hugecalfDetails.waitFor();
    const stuckTogetherPoster = hugecalfDetails.locator('.game-poster-card[data-game-title="Stuck Together"]');
    const stuckTogetherImage = stuckTogetherPoster.locator('img[data-artwork-source="IGDB"]');
    await stuckTogetherImage.waitFor();
    assert.equal(
      await stuckTogetherImage.getAttribute("src"),
      "https://images.igdb.com/igdb/image/upload/t_cover_big/coa9za.webp",
      "Stuck Together should display the exact IGDB cover supplied for this example.",
    );
    assert.equal(await stuckTogetherPoster.getAttribute("href"), "https://store.steampowered.com/app/3295360/");
    assert.equal(await stuckTogetherPoster.getAttribute("data-release-year"), "2025");
    await hugecalfRow.getByRole("button", { name: /Hugecalf Studios/ }).click();
    await hugecalfDetails.waitFor({ state: "detached" });
    await page.getByLabel("Search", { exact: true }).fill("");

    // The compact table shows the two most notable titles; the expanded gallery can retain further projects.
    const twentyTwoCansRow = rows.filter({ hasText: "22cans" });
    assert.deepEqual(
      await twentyTwoCansRow.locator(".popular-game-cover").evaluateAll(covers =>
        covers.map(cover => cover.getAttribute("data-game-title")),
      ),
      ["Masters of Albion", "The Trail"],
      "The compact studio table should show its two most notable games.",
    );
    const twentyTwoCansButton = twentyTwoCansRow.getByRole("button", { name: /22cans/ });
    await twentyTwoCansButton.click();
    const twentyTwoCansDetails = page.locator("#studio-details-22cans");
    await twentyTwoCansDetails.waitFor();
    const trailPoster = page.locator('.game-poster-grid .game-poster-card[data-game-title="The Trail"]');
    const trailPosterImage = trailPoster.locator('img[data-artwork-layout="landscape"]');
    await trailPosterImage.waitFor();
    const trailPosterImageUrl = await trailPosterImage.getAttribute("src") || "";
    const trailArtworkPath = new URL(trailPosterImageUrl).pathname;
    assert.ok(
      trailArtworkPath.includes("/steam/apps/3544920/") && trailArtworkPath.endsWith("/header.jpg"),
      "The Trail should use its verified landscape Steam header in the expanded gallery. Actual URL: " + trailPosterImageUrl,
    );
    const posterMetrics = await trailPoster.locator(".game-poster-art").evaluate(element => {
      const rect = element.getBoundingClientRect();
      const image = element.querySelector("img");
      return {
        widthToHeight: rect.width / rect.height,
        objectFit: image ? getComputedStyle(image).objectFit : "",
      };
    });
    assert.ok(
      posterMetrics.widthToHeight > 0.62 && posterMetrics.widthToHeight < 0.71,
      "Wide source artwork should retain the same 2:3 portrait poster frame as every other cover.",
    );
    assert.equal(posterMetrics.objectFit, "contain", "Wide non-IGDB artwork should be contained inside the standard portrait frame.");
    await twentyTwoCansButton.click();
    await twentyTwoCansDetails.waitFor({ state: "detached" });

    // Official website artwork must work as a real fallback and link to the game's own page.
    const d4nRow = rows.filter({ hasText: "D4N Games" });
    await d4nRow.getByRole("button", { name: /D4N Games/ }).click();
    const d4nDetails = page.locator("#studio-details-d4n-games");
    await d4nDetails.waitFor();
    const tabletPoster = d4nDetails.locator('.game-poster-card[data-game-title="The Tablet of Destinies"]');
    const tabletImage = tabletPoster.locator('img[data-artwork-source="Official site"]');
    await tabletImage.waitFor();
    assert.ok(
      (await tabletImage.getAttribute("src") || "").endsWith("/images/tablet_thumbnail.webp"),
      "The Tablet of Destinies should use the image hosted on D4N Games' official website.",
    );
    assert.equal(
      await tabletPoster.getAttribute("href"),
      "https://www.d4ngames.com/games/tablet-of-destinies",
      "The Tablet of Destinies should link directly to its official game page.",
    );
    const tabletRatio = await tabletPoster.locator(".game-poster-art").evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.width / rect.height;
    });
    assert.ok(tabletRatio > 0.62 && tabletRatio < 0.71, "Official landscape artwork should remain inside the shared 2:3 portrait frame.");
    assert.equal(await tabletImage.evaluate(image => getComputedStyle(image).objectFit), "contain", "Official landscape artwork should be contained within the shared portrait frame.");
    await d4nRow.getByRole("button", { name: /D4N Games/ }).click();
    await d4nDetails.waitFor({ state: "detached" });

    // Square mobile-app art from a studio website should be contained in the same portrait frame as every other cover.
    const ahoiiiRow = rows.filter({ hasText: "Ahoiii Entertainment" });
    await ahoiiiRow.getByRole("button", { name: /Ahoiii Entertainment/ }).click();
    const ahoiiiDetails = page.locator("#studio-details-ahoiii-entertainment");
    await ahoiiiDetails.waitFor();
    const fietePoster = ahoiiiDetails.locator('.game-poster-card[data-game-title="Fiete World"]');
    const fieteImage = fietePoster.locator('img[data-artwork-source="Official site"][data-artwork-layout="square"]');
    await fieteImage.waitFor();
    assert.ok(
      (await fieteImage.getAttribute("src") || "").endsWith("FieteWorldKids-Games-Apps-180x180-2.png"),
      "Fiete World should use the official Ahoiii app artwork.",
    );
    const fieteRatio = await fietePoster.locator(".game-poster-art").evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.width / rect.height;
    });
    assert.ok(fieteRatio > 0.62 && fieteRatio < 0.71, "Official square app artwork should remain inside the shared 2:3 portrait frame.");
    assert.equal(await fieteImage.evaluate(image => getComputedStyle(image).objectFit), "contain", "Official square app artwork should be contained within the shared portrait frame.");
    await ahoiiiRow.getByRole("button", { name: /Ahoiii Entertainment/ }).click();
    await ahoiiiDetails.waitFor({ state: "detached" });

    // IGDB images are a live fallback source, and games still link to their exact IGDB page.
    await page.getByLabel("Search", { exact: true }).fill("Ocellus");
    const ocellusRow = rows.filter({ hasText: "Ocellus" });
    await ocellusRow.getByRole("button", { name: /Ocellus/ }).click();
    const ocellusDetails = page.locator("#studio-details-ocellus");
    await ocellusDetails.waitFor();
    const clashPoster = ocellusDetails.locator('.game-poster-card[data-game-title="Clash Royale"]').first();
    const clashImage = clashPoster.locator('img[data-artwork-source="IGDB"]');
    await clashImage.waitFor();
    assert.ok(
      (await clashImage.getAttribute("src") || "").includes("images.igdb.com/igdb/image/upload/"),
      "IGDB artwork URLs should be available under the site's Content Security Policy.",
    );
    assert.equal(
      await clashPoster.getAttribute("href"),
      "https://www.igdb.com/games/clash-royale",
      "IGDB-backed games should use their direct page, not a generic Steam search.",
    );
    await ocellusRow.getByRole("button", { name: /Ocellus/ }).click();
    await ocellusDetails.waitFor({ state: "detached" });
    await page.getByLabel("Search", { exact: true }).fill("Halfbrick Studios");

    // App Store art is a final fallback when earlier cover sources are absent.
    const halfbrickRow = rows.filter({ hasText: "Halfbrick Studios" });
    await halfbrickRow.getByRole("button", { name: /Halfbrick Studios/ }).click();
    const halfbrickDetails = page.locator("#studio-details-halfbrick-studios");
    await halfbrickDetails.waitFor();
    const fruitNinjaPoster = halfbrickDetails.locator('.game-poster-card[data-game-title="Fruit Ninja"]').first();
    const fruitNinjaImage = fruitNinjaPoster.locator('img[data-artwork-source="App Store"][data-artwork-layout="square"]');
    await fruitNinjaImage.waitFor();
    assert.ok((await fruitNinjaImage.getAttribute("src") || "").includes("mzstatic.com/image/thumb/"));
    assert.equal(await fruitNinjaPoster.getAttribute("href"), "https://apps.apple.com/us/app/fruit-ninja/id403858572?uo=4");
    const fruitNinjaRatio = await fruitNinjaPoster.locator(".game-poster-art").evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.width / rect.height;
    });
    assert.ok(
      Math.abs(fruitNinjaRatio - 2 / 3) < 0.02,
      "Square App Store artwork should be contained within the same 2:3 portrait frame as other studio-profile posters.",
    );
    await halfbrickRow.getByRole("button", { name: /Halfbrick Studios/ }).click();
    await halfbrickDetails.waitFor({ state: "detached" });
    await page.getByLabel("Search", { exact: true }).fill("");

    assert.equal(
      await page.locator('.game-poster-card[href*="store.steampowered.com/search/"], .popular-game-cover[href*="store.steampowered.com/search/"]').count(),
      0,
      "Game artwork cards must not fall back to generic Steam search URLs.",
    );

    // Saving, browser-local persistence and refresh.
    const studioRow = page.getByRole("row").filter({ hasText: "4A Games" });
    assert.equal(await studioRow.count(), 1, "The test studio should appear exactly once.");
    await studioRow.getByRole("button", { name: "Save" }).click();
    const viewInTracker = studioRow.getByRole("button", { name: /Saved/ });
    await viewInTracker.waitFor();
    await viewInTracker.click();
    await page.getByRole("heading", { name: "My applications" }).waitFor();

    const focusedTrackerRow = page.locator(".tracker-table tbody tr").filter({ has: page.locator(".status-select-label") }).filter({ hasText: "4A Games" });
    await focusedTrackerRow.waitFor();
    await focusedTrackerRow.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector('[id="tracker-row-4a-games"]')?.classList.contains("tracker-row-focused"));
    assert.equal(await page.getByLabel("Status for 4A Games").inputValue(), "saved");

    const storedBeforeReload = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), storageKey);
    assert.equal(storedBeforeReload.length, 1);
    assert.equal(storedBeforeReload[0].studioName, "4A Games");
    assert.equal(storedBeforeReload[0].countryCode, "MT", "The headquarters country code should be retained locally.");

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /My applications/ }).click();
    await page.getByRole("heading", { name: "My applications" }).waitFor();

    let trackedRow = page.locator(".tracker-table tbody tr").filter({ has: page.locator(".status-select-label") }).filter({ hasText: "4A Games" });
    assert.equal(await trackedRow.count(), 1, "A saved studio should survive a full page reload.");

    // The tracker preserves route type, check date, work-model caveats and the evidence source.
    await trackedRow.getByRole("button", { name: "View route context for 4A Games" }).click();
    const routeContext = page.locator("#tracker-route-4a-games");
    await routeContext.waitFor();
    await routeContext.getByText("Unsolicited application", { exact: true }).waitFor();
    await routeContext.getByText(/Malta \/ Kyiv studio network · remote eligibility not stated/).waitFor();
    const evidenceLink = routeContext.getByRole("link", { name: "Open source evidence" });
    assert.equal(await evidenceLink.getAttribute("href"), "https://www.4a-games.com.mt/careers");
    assert.match(await routeContext.innerText(), /No discipline scope recorded on this route/);
    await trackedRow.getByRole("button", { name: "Hide route context for 4A Games" }).click();

    let status = page.getByLabel("Status for 4A Games");
    assert.equal(await status.inputValue(), "saved");

    // The application tracker stays focused on status, route context and removal.
    assert.deepEqual(
      (await page.locator(".tracker-table thead th").allTextContents()).map(label => label.trim()),
      ["Studio", "Location", "Added", "Applied", "Official links", "Route context", "Status", "Remove"],
      "The tracker should not show Notes or Prepare columns.",
    );
    assert.equal(await trackedRow.locator("td").count(), 8);
    assert.equal(await trackedRow.locator(".tracker-row-actions button.btn-outline-danger").count(), 1, "Remove should appear as a bordered danger button.");
    assert.equal(await trackedRow.locator(".tracker-row-actions button svg.ui-icon").count(), 1, "The Remove button should show a trash icon.");
    assert.match(await trackedRow.locator(".tracker-row-actions button").getAttribute("aria-label") || "", /^Remove 4A Games$/);
    assert.equal(await page.locator(".tracker-table .notes-toggle, .tracker-table .tracker-preparation-count").count(), 0);
    assert.equal(await page.locator(".tracker-notes-row, .tracker-preparation-row").count(), 0);
    assert.equal(await page.getByRole("button", { name: /Export backup|Restore backup/ }).count(), 0);
    assert.equal(await page.locator(".tracker-page input[type=\"file\"]").count(), 0);

    const tabIconMetrics = await page.locator(".tracker-tab-icon svg").evaluateAll(icons =>
      icons.map(icon => ({
        width: Number.parseFloat(getComputedStyle(icon).width),
        height: Number.parseFloat(getComputedStyle(icon).height),
        color: getComputedStyle(icon).color,
      })),
    );
    assert.equal(tabIconMetrics.length, 6, "Each application status should have an icon.");
    assert.ok(tabIconMetrics.every(icon => icon.width === 18 && icon.height === 18), "Status icons should be slightly larger at 18px.");
    assert.equal(new Set(tabIconMetrics.map(icon => icon.color)).size, 6, "Each status icon should have its own color.");
    assert.equal(
      await page.locator(".status-icon-offer").first().evaluate(element => getComputedStyle(element).color),
      "rgb(192, 38, 211)",
      "Offer should use its distinct magenta status color.",
    );
    assert.equal(
      await page.locator(".status-select-icon svg").evaluate(icon => getComputedStyle(icon).width),
      "18px",
      "The status selector icon should use the larger size too.",
    );

    status = page.getByLabel("Status for 4A Games");

    // Move through every tracker status. The Applied transition must require confirmation.
    await status.selectOption("in_progress");
    await page.getByRole("tab", { name: /In progress/ }).click();
    status = page.getByLabel("Status for 4A Games");

    const bypassAttempt = await performWithDialog(page, () => status.selectOption("interview"), false);
    assert.equal(bypassAttempt.type, "confirm");
    assert.match(bypassAttempt.message, /Confirm that you have submitted an application/);
    assert.equal(await status.inputValue(), "in_progress", "An interview status must not bypass submission confirmation.");
    assert.equal((await trackedRow.locator(".applied-date").textContent())?.trim(), "—", "A cancelled interview transition must not create a submitted date.");

    const cancelledApply = await performWithDialog(page, () => status.selectOption("applied"), false);
    assert.equal(cancelledApply.type, "confirm");
    assert.match(cancelledApply.message, /Confirm that you have submitted an application/);
    assert.equal(await status.inputValue(), "in_progress", "Dismissing the application confirmation must preserve the status.");

    const acceptedApply = await performWithDialog(page, () => status.selectOption("applied"), true);
    assert.equal(acceptedApply.type, "confirm");
    await page.getByRole("tab", { name: /Applied/ }).click();
    status = page.getByLabel("Status for 4A Games");
    assert.notEqual((await trackedRow.locator(".applied-date").textContent())?.trim(), "—", "The tracker should display the application submission date.");
    await status.selectOption("interview");

    await page.getByRole("tab", { name: /Interview/ }).click();
    status = page.getByLabel("Status for 4A Games");
    await status.selectOption("offer");

    await page.getByRole("tab", { name: /Offer/ }).click();
    status = page.getByLabel("Status for 4A Games");
    await status.selectOption("archived");

    await page.getByRole("tab", { name: /Archived/ }).click();
    trackedRow = page.locator(".tracker-table tbody tr").filter({ has: page.locator(".status-select-label") }).filter({ hasText: "4A Games" });
    assert.equal(await trackedRow.count(), 1, "Archived applications should remain accessible in their status tab.");

    // The directory action mirrors the current status of the canonical tracker record.
    await page.getByRole("button", { name: "Browse studios" }).click();
    await page.getByLabel("Search", { exact: true }).fill("4A Games");
    const currentStatusAction = page.locator(".studio-data-row")
      .filter({ hasText: "4A Games" })
      .getByRole("button", { name: /Not moving forward/ });
    await currentStatusAction.waitFor();
    await currentStatusAction.click();
    await page.getByRole("heading", { name: "My applications" }).waitFor();
    assert.equal(
      await page.getByLabel("Status for 4A Games").inputValue(),
      "archived",
      "The directory action should show the latest status and reopen the same tracker record.",
    );
    trackedRow = page.locator(".tracker-table tbody tr")
      .filter({ has: page.locator(".status-select-label") })
      .filter({ hasText: "4A Games" });
    await trackedRow.waitFor();

    // Removal remains explicit and persists only in this browser.
    const cancelledRemoval = await performWithDialog(
      page,
      () => trackedRow.getByRole("button", { name: /Remove 4A Games/ }).click(),
      false,
    );
    assert.equal(cancelledRemoval.type, "confirm");
    assert.match(cancelledRemoval.message, /Remove 4A Games from your tracker/);
    assert.equal(await trackedRow.count(), 1, "Dismissing removal confirmation must keep the record.");

    await performWithDialog(
      page,
      () => trackedRow.getByRole("button", { name: /Remove 4A Games/ }).click(),
      true,
    );
    assert.equal(await trackedRow.count(), 0, "Confirming removal should delete the tracker record.");

    await page.getByRole("tab", { name: /Saved/ }).click();
    await page.getByText("No studios in this list yet.").waitFor();
    const storedAfterRemoval = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), storageKey);
    assert.deepEqual(storedAfterRemoval, [], "Removal should persist in browser storage.");
    assert.equal(await page.getByRole("button", { name: /Export backup|Restore backup/ }).count(), 0);

    // Check both mobile layouts and ensure the directory table scrolls inside its container.
    await page.getByRole("button", { name: "Browse studios" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("heading", { name: "Studio directory" }).waitFor();

    const mobileDirectory = await page.evaluate(() => {
      const wrapper = document.querySelector(".studio-table")?.parentElement;
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        tableClient: wrapper?.clientWidth ?? 0,
        tableScroll: wrapper?.scrollWidth ?? 0,
      };
    });
    assert.ok(
      mobileDirectory.document <= mobileDirectory.viewport + 1,
      "The mobile directory must not create horizontal page overflow.",
    );
    assert.ok(
      mobileDirectory.tableScroll > mobileDirectory.tableClient,
      "The wide directory table should scroll within its own container on mobile.",
    );

    await page.getByRole("button", { name: /My applications/ }).click();
    const mobileTracker = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert.ok(
      mobileTracker.document <= mobileTracker.viewport + 1,
      "The mobile tracker must not create horizontal page overflow.",
    );

    // Corrupt browser-local tracker data is preserved; there is no backup UI to import/export.
    const recoveryPage = await context.newPage();
    const recoveryPageErrors = [];
    recoveryPage.on("pageerror", (error) => recoveryPageErrors.push(error.message));
    const corruptedTrackerValue = "{not valid tracker JSON";
    await recoveryPage.addInitScript(
      ({ key, raw }) => localStorage.setItem(key, raw),
      { key: storageKey, raw: corruptedTrackerValue },
    );
    await recoveryPage.route("https://api.github.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ workflow_runs: [] }),
      });
    });
    await recoveryPage.goto(appUrl, { waitUntil: "networkidle" });
    const recoveryAlert = recoveryPage.getByRole("alert");
    await recoveryAlert.getByText(/not valid JSON/).waitFor();
    await recoveryAlert.getByText(/original browser data has been left untouched/).waitFor();
    assert.equal(await recoveryPage.getByRole("button", { name: /restore a backup/i }).count(), 0);
    await recoveryPage.getByRole("button", { name: /My applications/ }).click();
    await recoveryPage.getByRole("heading", { name: "My applications" }).waitFor();
    assert.equal(await recoveryPage.getByRole("button", { name: /Export backup|Restore backup/ }).count(), 0);
    assert.equal(await recoveryPage.locator(".tracker-page input[type=\"file\"]").count(), 0);
    assert.deepEqual(
      (await recoveryPage.locator(".tracker-table thead th").allTextContents()).map(label => label.trim()),
      ["Studio", "Location", "Added", "Applied", "Official links", "Route context", "Status", "Remove"],
    );
    const untouchedTrackerValue = await recoveryPage.evaluate(
      (key) => localStorage.getItem(key),
      storageKey,
    );
    assert.equal(
      untouchedTrackerValue,
      corruptedTrackerValue,
      "Loading malformed tracker data must not replace the original localStorage value.",
    );
    assert.deepEqual(recoveryPageErrors, [], "The tracker should report malformed local storage without browser errors.");
    await recoveryPage.close();

    assert.deepEqual(writeRequests, [], "Personal tracker actions must not issue network write requests.");
    assert.deepEqual(pageErrors, [], "The browser should not report uncaught application errors.");

    process.stdout.write(
      "Browser acceptance passed: simplified navigation, directory filters/sorting/links and artwork, live directory-to-tracker status handoff, color-coded tracker status icons, streamlined tracker columns, save and reload persistence, all tracker statuses, confirmation dialogs, removal, local-only storage, and desktop/mobile overflow checks.\n",
    );
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  process.stderr.write((error?.stack || String(error)) + "\n");
  process.exitCode = 1;
});
