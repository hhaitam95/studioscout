import { Fragment, useEffect, useMemo, useState } from "react";
import type { TrackedApplication, TrackerStatus } from "./studio.types";
import StudioMark from "./StudioMark";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import { countryFlagsFor } from "./location";
import "./tracker.css";

const tabs: { id: string; label: string; status: TrackerStatus }[] = [
  { id: "saved", label: "Saved", status: "saved" },
  { id: "in_progress", label: "In progress", status: "in_progress" },
  { id: "applied", label: "Applied", status: "applied" },
  { id: "interview", label: "Interview", status: "interview" },
  { id: "offer", label: "Offer", status: "offer" },
  { id: "archived", label: "Archived", status: "archived" },
];

const routeTypeLabels: Record<string, string> = {
  spontaneous: "Spontaneous application",
  unsolicited: "Unsolicited application",
  open: "Open application",
  speculative: "Speculative application",
  general: "General application",
  discipline_specific: "Discipline-specific application",
};

const workModelLabels: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  on_site: "On-site",
  mixed: "Mixed / role-dependent",
  not_stated: "Not stated",
};

const statusLabels: Record<TrackerStatus, string> = {
  saved: "Saved",
  in_progress: "In progress",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  archived: "Not moving forward",
};

const statusIcons: Record<TrackerStatus, IconName> = {
  saved: "bookmark",
  in_progress: "wrench",
  applied: "send",
  interview: "mic",
  offer: "trophy",
  archived: "archive",
};

const statusIconClasses: Record<TrackerStatus, string> = {
  saved: "status-icon-saved",
  in_progress: "status-icon-in-progress",
  applied: "status-icon-applied",
  interview: "status-icon-interview",
  offer: "status-icon-offer",
  archived: "status-icon-archived",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function trackerRowId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function ApplicationTracker({
  initialTab = "saved",
  focusApplicationId,
  applications,
  onChangeStatus,
  onRemove,
  onOpenDirectory,
}: {
  initialTab?: string;
  focusApplicationId?: string | null;
  applications: TrackedApplication[];
  onChangeStatus: (id: string, status: TrackerStatus) => void;
  onRemove: (id: string) => void;
  onOpenDirectory: () => void;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  const counts = useMemo(
    () =>
      Object.fromEntries(
        tabs.map((tab) => [
          tab.id,
          applications.filter((application) => application.status === tab.status).length,
        ]),
      ),
    [applications],
  );

  const visible = applications
    .filter((application) => {
      const searchable = [
        application.studioName,
        application.country,
        application.hqLabel,
        application.applicationLocation || "",
        application.routeType || "",
        application.workModel || "",
        ...(application.disciplineScope || []),
        ...(application.eligibleLocations || []),
        application.routeNotes || "",
      ].join(" ").toLowerCase();
      return application.status === active.status && searchable.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  useEffect(() => {
    if (!focusApplicationId) return;
    const target = document.getElementById("tracker-row-" + trackerRowId(focusApplicationId));
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("tracker-row-focused");
    const timer = window.setTimeout(() => target.classList.remove("tracker-row-focused"), 2600);
    return () => window.clearTimeout(timer);
  }, [focusApplicationId, active.status]);

  return (
    <section className="tracker-page">
      <div className="page-heading tracker-page-heading">
        <div>
          <h1>My applications</h1>
          <p>Track studios you're considering and applications you've submitted.</p>
        </div>
        <div className="tracker-heading-actions">
          <button className="btn btn-primary" type="button" onClick={onOpenDirectory}>
            Browse studios
          </button>
        </div>
      </div>

      <div className="tracker-toolbar">
        <div className="tracker-tabs" role="tablist" aria-label="Application status">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "tracker-tab active" : "tracker-tab"}
              type="button"
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setExpandedRouteId(null);
              }}
            >
              <span className={"tracker-tab-icon status-icon " + statusIconClasses[tab.status]}>
                <Icon name={statusIcons[tab.status]} size={18} />
              </span>
              {tab.label}
              <span>{counts[tab.id] || 0}</span>
            </button>
          ))}
        </div>
        <label className="form-field tracker-search">
          <span>Search tracker</span>
          <input
            className="form-control"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Studio, country or route"
          />
        </label>
      </div>

      <div className="table-meta">
        <span>{active.label}</span>
        <span>{visible.length} {visible.length === 1 ? "studio" : "studios"}</span>
      </div>

      <div className="table-wrap">
        <table className="table table-sm table-hover align-middle tracker-table mb-0">
          <thead>
            <tr>
              <th scope="col">Studio</th>
              <th scope="col">Location</th>
              <th scope="col">Added</th>
              <th scope="col">Applied</th>
              <th scope="col">Official links</th>
              <th scope="col">Route context</th>
              <th scope="col">Status</th>
              <th scope="col">Remove</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((application) => {
              const flags = countryFlagsFor(application.country, application.countryCode);
              const routeExpanded = expandedRouteId === application.id;
              return (
                <Fragment key={application.id}>
                  <tr id={"tracker-row-" + trackerRowId(application.id)}>
                    <td>
                      <div className="studio-identity">
                        <StudioMark name={application.studioName} websiteUrl={application.websiteUrl} />
                        <span className="studio-name">{application.studioName}</span>
                      </div>
                    </td>
                    <td>
                      <span className="location-cell">
                        {flags.map((flag, index) => <span className="country-flag" key={flag + index} aria-hidden="true">{flag}</span>)}
                        <span>{application.country || "Not stated"}</span>
                      </span>
                    </td>
                    <td>{formatDate(application.createdAt)}</td>
                    <td className="applied-date">{formatDate(application.appliedAt)}</td>
                    <td>
                      <div className="tracker-links">
                        <a href={application.applicationUrl} target="_blank" rel="noopener noreferrer"><Icon name="send" size={13} />Open route</a>
                        <a href={application.websiteUrl} target="_blank" rel="noopener noreferrer"><Icon name="globe" size={13} />Studio website</a>
                      </div>
                    </td>
                    <td>
                      <div className="tracker-route-summary">
                        <strong>{routeTypeLabels[application.routeType || ""] || "Route type not recorded"}</strong>
                        <small>Checked {formatDate(application.routeCheckedAt)}</small>
                        <button
                          className="text-button"
                          type="button"
                          aria-expanded={routeExpanded}
                          aria-label={(routeExpanded ? "Hide route context for " : "View route context for ") + application.studioName}
                          onClick={() => setExpandedRouteId((current) => current === application.id ? null : application.id)}
                        >
                          {routeExpanded ? "Hide route context" : "View route context"}
                        </button>
                      </div>
                    </td>
                    <td>
                      <label className="status-select-label">
                        <span className={"status-select-icon status-icon " + statusIconClasses[application.status]}>
                          <Icon name={statusIcons[application.status]} size={18} />
                        </span>
                        <span className="visually-hidden">Status for {application.studioName}</span>
                        <select
                          className={"form-select status-" + application.status}
                          value={application.status}
                          onChange={(event) => onChangeStatus(application.id, event.target.value as TrackerStatus)}
                        >
                          {tabs.map((tab) => (
                            <option key={tab.id} value={tab.status}>{statusLabels[tab.status]}</option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td>
                      <div className="tracker-row-actions">
                        <button
                          className="btn btn-link btn-sm text-danger p-0"
                          type="button"
                          aria-label={"Remove " + application.studioName}
                          onClick={() => onRemove(application.id)}
                        >
                          × Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                  {routeExpanded ? (
                    <tr className="tracker-route-row" id={"tracker-route-" + trackerRowId(application.id)}>
                      <td colSpan={8}>
                        <div className="tracker-route-panel">
                          <div className="tracker-route-panel-heading">
                            <strong>Official route context · {application.studioName}</strong>
                            {application.routeEvidenceUrl ? (
                              <a href={application.routeEvidenceUrl} target="_blank" rel="noopener noreferrer">Open source evidence</a>
                            ) : null}
                          </div>
                          <dl className="tracker-route-facts">
                            <div><dt>Route on saved record</dt><dd>{routeTypeLabels[application.routeType || ""] || "Not recorded"}</dd></div>
                            <div><dt>Snapshot status</dt><dd>{application.routeStatus || "Not recorded"}</dd></div>
                            <div><dt>Last checked</dt><dd>{formatDate(application.routeCheckedAt)}</dd></div>
                            <div><dt>Work model</dt><dd>{workModelLabels[application.workModel || ""] || application.workModel || "Not stated"}</dd></div>
                            <div><dt>Disciplines stated</dt><dd>{application.disciplineScope?.length ? application.disciplineScope.join(", ") : "No discipline scope recorded on this route"}</dd></div>
                            <div><dt>Submission method</dt><dd>{application.submissionMethods?.length ? application.submissionMethods.join(", ") : "Not stated"}</dd></div>
                            <div><dt>Work / eligible locations</dt><dd>{application.eligibleLocations?.length ? application.eligibleLocations.join("; ") : application.applicationLocation || "Not stated"}</dd></div>
                          </dl>
                          {application.routeNotes ? <p className="tracker-route-notes">{application.routeNotes}</p> : null}
                          <p className="tracker-route-caveat">This is a saved snapshot, not a live vacancy or a guarantee of eligibility. Open the employer's current route and confirm the role, language, location, work authorisation, sponsorship and relocation requirements before applying.</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td className="empty-table" colSpan={8}>
                  {query ? "No matching studios in this status." : "No studios in this list yet."}
                  {!query && activeTab === "saved" ? (
                    <button className="text-button" type="button" onClick={onOpenDirectory}>
                      Browse the studio directory
                    </button>
                  ) : null}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="tracker-note">
        Your application tracker and dates are saved in this browser only. They are not connected to a server or shared with anyone.
      </p>
    </section>
  );
}
