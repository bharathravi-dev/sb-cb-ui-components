import { NsAccessControlConfig } from "../_models/access-control.model";

export const BATCH_RANGES = [
  { label: "1960-1990", start: 1960, end: 1990 },
  { label: "1991-2020", start: 1991, end: 2020 },
  { label: "2021-2025", start: 2021, end: 2025 },
];

export const CHECKBOX_OPTIONS = [
  { label: "Select All", value: "selectAll" },
  // { label: "Cadre Controlling Authority", value: "isCCA" },
];

// Criteria key used when a L0 MDO (ministry / state) selects every organisation of its hierarchy.
// The whole ministry / state is then stored as a single criteria instead of the expanded org list.
export const MINISTRY_OR_STATE_CRITERIA_KEY = "ministryOrStateId";
export const MINISTRY_OR_STATE_FILTER_KEY = "profileDetails.ministryOrStateId";

// MDO only. Every organisation picked through the "Select all" option of the Organisation condition.
// It is saved as an empty rootOrgId list, and stands in for it in the form so the condition is filled.
export const ALL_ORGANISATIONS_SELECTION = "ALL_ORGANISATIONS";

// MDO only. The most organisations that can be picked one by one in an Organisation condition.
export const MAX_ORGANISATION_SELECTIONS = 500;

export const ORGANISATION_SELECTION_MODES = [
  { label: "Manual Selection", value: "individual" },
  { label: "Select all", value: "all" },
];

export const CRITERIA_LABELS: { [key: string]: string } = {
  [NsAccessControlConfig.SelectionType.Organizations]: "Organisation",
  [MINISTRY_OR_STATE_CRITERIA_KEY]: "Organisation",
  [NsAccessControlConfig.SelectionType.Users]: "User",
  [NsAccessControlConfig.SelectionType.Group]: "Group",
  [NsAccessControlConfig.SelectionType.Designation]: "Designation",
  [NsAccessControlConfig.SelectionType.VerificationStatus]: "Verification status",
  [NsAccessControlConfig.SelectionType.Cadre]: "Cadre",
  [NsAccessControlConfig.SelectionType.Service]: "Service",
  [NsAccessControlConfig.SelectionType.Batch]: "Batch",
  [NsAccessControlConfig.SelectionType.CentralDeputation]: "Deputation flag"
};
