import { useEffect, useMemo, useState } from "react";
import type { TrackedApplication, TrackerStatus } from "./components/studio.types";
import StudioDirectory from "./components/StudioDirectory";
import ApplicationTracker from "./components/ApplicationTracker";
import Icon from "./components/Icon";
import studioDirectory from "./data/speculative-route-directory.json" with { type: "json" };
import { parseStoredApplicationTracker } from "./tracker/application-backup.mjs";
import { createApplicationId } from "./tracker/application-identity.mjs";
import { createEmptyApplicationPreparation } from "./tracker/application-preparation.mjs";

const STORAGE_KEY = "studio-outreach-tracker-v1";
const THEME_STORAGE_KEY = "studio-outreach-theme-v1";
type Theme = "light" | "dark";

function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

type NavigationIconName = "studios" | "applications";

function NavigationIcon({ name }: { name: NavigationIconName }) {
  return (
    <svg
      className="navigation-icon"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "studios" ? (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.7" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.7" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.7" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.7" />
        </>
      ) : null}
      {name === "applications" ? (
        <>
          <rect x="3" y="7.5" width="18" height="13" rx="2" />
          <path d="M8 7.5V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8v1.7M3 12h18M10 12v2h4v-2" />
        </>
      ) : null}
    </svg>
  );
}

type StudioSummary = {
  name: string;
  websiteUrl: string;
  applicationUrl: string;
  country: string;
  countryCode?: string;
  evidenceUrl?: string;
  checkedAt?: string;
  notes?: string;
  applicationResearch?: {
    routeType?: string;
    routeStatus?: string;
    workModel?: string;
    submissionMethods?: string[];
    eligibleLocations?: string[];
    disciplineScope?: string[];
  };
};

type StudioLocation = {
  country: string;
  countryCode?: string;
  hqLabel: string;
  applicationLocation: string;
};

export default function App() {
  const [page, setPage] = useState<"studios" | "applications">("studios");
  const [trackerInitialTab, setTrackerInitialTab] = useState("saved");
  const [trackerFocusApplicationId, setTrackerFocusApplicationId] = useState<string | null>(null);
  const [applications, setApplications] = useState<TrackedApplication[]>([]);
  const studioCount = useMemo(
    () => studioDirectory.filter(studio => studio.applicationResearch?.routeStatus === "active").length,
    [],
  );
  const [storageReady, setStorageReady] = useState(false);
  const [storageLoadError, setStorageLoadError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    try {
      const stored = parseStoredApplicationTracker(window.localStorage.getItem(STORAGE_KEY));
      if (!stored.ok) {
        setStorageLoadError(stored.message);
        return;
      }
      setApplications(stored.applications);
      setStorageReady(true);
    } catch {
      setStorageLoadError(
        "Your saved application tracker could not be read. The original browser data has been left untouched.",
      );
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme persistence is optional; the selected theme still applies in memory.
    }
  }, [theme]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [applications, storageReady]);

  const trackedCount = useMemo(() => applications.length, [applications]);

  function trackStudio(
    studio: StudioSummary,
    status: TrackerStatus,
    location?: StudioLocation,
  ) {
    if (!storageReady) {
      setStorageLoadError("The existing browser tracker data could not be read, so this studio was not saved.");
      return;
    }
    const normalizedName = studio.name.trim().toLocaleLowerCase();
    if (applications.some((item) => item.studioName.trim().toLocaleLowerCase() === normalizedName)) return;

    const timestamp = new Date().toISOString();
    setApplications((previous) => {
      if (previous.some((item) => item.studioName.trim().toLocaleLowerCase() === normalizedName)) return previous;

      const next: TrackedApplication = {
        id: createApplicationId(studio.name, previous.map((item) => item.id)),
        studioName: studio.name,
        websiteUrl: studio.websiteUrl,
        applicationUrl: studio.applicationUrl,
        country: location?.country || studio.country,
        countryCode: location?.countryCode || studio.countryCode || "",
        hqLabel: location?.hqLabel || "HQ",
        applicationLocation:
          location?.applicationLocation || "Not specified · see official route",
        routeType: studio.applicationResearch?.routeType || "general",
        routeStatus: studio.applicationResearch?.routeStatus || "unknown",
        routeCheckedAt: studio.checkedAt || "",
        routeEvidenceUrl: studio.evidenceUrl || "",
        routeNotes: studio.notes || "",
        workModel: studio.applicationResearch?.workModel || "not_stated",
        submissionMethods: studio.applicationResearch?.submissionMethods || [],
        eligibleLocations: studio.applicationResearch?.eligibleLocations || [],
        disciplineScope: studio.applicationResearch?.disciplineScope || [],
        status,
        createdAt: timestamp,
        updatedAt: timestamp,
        appliedAt: status === "applied" ? timestamp : null,
        note: "",
        preparation: createEmptyApplicationPreparation(),
      };
      return [next, ...previous];
    });
  }

  function changeStatus(id: string, status: TrackerStatus) {
    if (!storageReady) return;
    const current = applications.find((item) => item.id === id);
    if (!current || current.status === status) return;

    const representsSubmittedApplication =
      status === "applied" || status === "interview" || status === "offer";
    const needsSubmissionConfirmation = representsSubmittedApplication && !current.appliedAt;
    if (
      needsSubmissionConfirmation &&
      !window.confirm(
        "Confirm that you have submitted an application to " + current.studioName +
        " before recording this stage?",
      )
    ) {
      return;
    }

    const timestamp = new Date().toISOString();
    setApplications((previous) =>
      previous.map((item) =>
        item.id !== id
          ? item
          : {
              ...item,
              status,
              updatedAt: timestamp,
              appliedAt:
                representsSubmittedApplication
                  ? item.appliedAt || timestamp
                  : item.appliedAt,
            },
      ),
    );
  }

  function removeApplication(id: string) {
    if (!storageReady) return;
    const item = applications.find((application) => application.id === id);
    if (!item || !window.confirm("Remove " + item.studioName + " from your tracker?")) return;
    setApplications((previous) => previous.filter((application) => application.id !== id));
  }

  function openTracker(tab = "saved") {
    setTrackerFocusApplicationId(null);
    setTrackerInitialTab(tab);
    setPage("applications");
  }

  function openTrackedStudio(studioName: string) {
    const normalizedName = studioName.trim().toLocaleLowerCase();
    const application = applications.find(
      item => item.studioName.trim().toLocaleLowerCase() === normalizedName,
    );
    if (!application) return;
    setTrackerInitialTab(application.status);
    setTrackerFocusApplicationId(application.id);
    setPage("applications");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <button
            className="brand"
            type="button"
            onClick={() => setPage("studios")}
            aria-label="StudioScout home"
          >
            <span className="brand-mark">SS</span>
            <span className="brand-name">StudioScout</span>
          </button>

          <nav className="main-navigation" aria-label="Main navigation">
            <button
              className={page === "studios" ? "nav-link active" : "nav-link"}
              type="button"
              onClick={() => setPage("studios")}
              aria-current={page === "studios" ? "page" : undefined}
            >
              <NavigationIcon name="studios" />
              <span className="nav-label">Studios</span>
              <span className="nav-count">{studioCount}</span>
            </button>
            <button
              className={page === "applications" ? "nav-link active" : "nav-link"}
              type="button"
              onClick={() => openTracker()}
              aria-current={page === "applications" ? "page" : undefined}
            >
              <NavigationIcon name="applications" />
              <span className="nav-label">My applications</span>
              <span className="nav-count">{trackedCount}</span>
            </button>
          </nav>

          <div className="header-tools">
            <button
              className="btn btn-outline-secondary btn-sm theme-toggle"
              type="button"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={theme === "dark"}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="page-container">
        {storageLoadError ? (
          <p className="storage-warning" role="alert">
            {storageLoadError} Tracker changes are disabled to protect the existing browser data.
          </p>
        ) : null}
        {storageError ? (
          <p className="storage-warning" role="alert">
            Your browser could not save changes to local storage. Check your browser's site
            storage settings. Changes may remain only in memory until storage is available.
          </p>
        ) : null}
        {page === "studios" ? (
          <StudioDirectory
            applications={applications}
            onSave={(studio, location) => trackStudio(studio, "saved", location)}
            onOpenTracker={openTrackedStudio}
          />
        ) : null}
        {page === "applications" ? (
          <ApplicationTracker
            initialTab={trackerInitialTab}
            focusApplicationId={trackerFocusApplicationId}
            applications={applications}
            onChangeStatus={changeStatus}
            onRemove={removeApplication}
            onOpenDirectory={() => setPage("studios")}
          />
        ) : null}
      </main>

      <footer className="app-footer">
        <span>StudioScout</span>
        <span>Studio directory · Application tracker</span>
        <span>Application tracker data stays in this browser · Theme preference is saved locally</span>
      </footer>
    </div>
  );
}
