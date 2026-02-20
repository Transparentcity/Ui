export type ExpectedConcept = {
  key: string
  label: string
  anyOf: string[]
}

function makeConcept(key: string, label: string, anyOf: string[]): ExpectedConcept {
  return { key, label, anyOf }
}

const COMMON_LOCATION_CONCEPTS: ExpectedConcept[] = [
  makeConcept("latitude", "Latitude", ["latitude", "lat", "y", "y_coord", "location_latitude"]),
  makeConcept("longitude", "Longitude", ["longitude", "lon", "lng", "x", "x_coord", "location_longitude"]),
  makeConcept("address", "Address", ["address", "street", "location", "intersection", "block", "on_street", "location_1"]),
  makeConcept("district", "District/Precinct/Ward", [
    "district",
    "precinct",
    "beat",
    "ward",
    "community_area",
    "police_district",
    "neighborhood",
  ]),
]

const CORE_EXPECTED: Record<string, ExpectedConcept[]> = {
  template_311_calls: [
    makeConcept("request_id", "Request ID", ["service_request_id", "request_id", "sr_number", "case_id", "ticket_id", "unique_key"]),
    makeConcept("created_at", "Created/opened date", ["created_date", "created_at", "open_date", "requested_datetime", "createdon", "requested_date"]),
    makeConcept("closed_at", "Closed date", ["closed_date", "closed_at", "resolution_date", "closedon", "completed_date"]),
    makeConcept("status", "Status", ["status", "request_status", "case_status"]),
    makeConcept("category", "Type/category", ["complaint_type", "service_name", "request_type", "category", "type", "sr_type"]),
    ...COMMON_LOCATION_CONCEPTS,
  ],
  template_911_calls: [
    makeConcept("call_id", "Call ID", ["call_id", "event_id", "incident_number", "cad_event_number", "id"]),
    makeConcept("received_at", "Received datetime", ["received_datetime", "call_datetime", "received_time", "call_received", "call_date", "received_at"]),
    makeConcept("dispatch_at", "Dispatch datetime", ["dispatch_datetime", "dispatch_time", "dispatched_at"]),
    makeConcept("arrival_at", "Arrival datetime", ["arrival_datetime", "arrival_time", "arrived_at", "unit_arrived"]),
    makeConcept("call_type", "Call type/priority", ["call_type", "event_type", "priority", "final_call_type", "type", "nature"]),
    ...COMMON_LOCATION_CONCEPTS,
  ],
  template_violent_crime_fbi_type_i: [
    makeConcept("incident_id", "Incident/case/complaint ID", ["incident_id", "case_id", "complaint_id", "report_number", "case_number", "unique_key"]),
    makeConcept("occurred_at", "Occurred/Reported datetime", ["occurred_datetime", "occur_date", "incident_datetime", "reported_date", "cmplnt_fr_dt", "date"]),
    makeConcept("offense", "Offense/category", ["offense", "ofns_desc", "crime_type", "category", "law_cat_cd", "offense_description"]),
    ...COMMON_LOCATION_CONCEPTS,
  ],
  template_property_crime_fbi_type_ii: [
    makeConcept("incident_id", "Incident/case/complaint ID", ["incident_id", "case_id", "complaint_id", "report_number", "case_number", "unique_key"]),
    makeConcept("occurred_at", "Occurred/Reported datetime", ["occurred_datetime", "occur_date", "incident_datetime", "reported_date", "cmplnt_fr_dt", "date"]),
    makeConcept("offense", "Offense/category", ["offense", "ofns_desc", "crime_type", "category", "law_cat_cd", "offense_description"]),
    ...COMMON_LOCATION_CONCEPTS,
  ],
  template_drug_crime: [
    makeConcept("incident_id", "Incident/case/complaint ID", ["incident_id", "case_id", "complaint_id", "report_number", "case_number", "unique_key"]),
    makeConcept("occurred_at", "Occurred/Reported datetime", ["occurred_datetime", "occur_date", "incident_datetime", "reported_date", "cmplnt_fr_dt", "date"]),
    makeConcept("offense", "Offense/category", ["offense", "ofns_desc", "crime_type", "category", "drug", "narcotics", "controlled_substance", "law_cat_cd"]),
    ...COMMON_LOCATION_CONCEPTS,
  ],
  template_building_permits: [
    makeConcept("permit_id", "Permit ID", ["permit_id", "permit_number", "application_id", "record_id", "id"]),
    makeConcept("issue_date", "Issue date", ["issue_date", "issued_date", "permit_issued", "permit_issue_date", "date_issued"]),
    makeConcept("permit_type", "Permit/work type", ["permit_type", "work_type", "permit_class", "description", "permit_description"]),
    makeConcept("status", "Status", ["status", "permit_status"]),
    makeConcept("valuation", "Valuation/cost", ["valuation", "estimated_cost", "job_value", "declared_valuation", "value"]),
    ...COMMON_LOCATION_CONCEPTS,
  ],
  template_business_registrations: [
    makeConcept("business_id", "Business/license ID", ["business_id", "license_id", "registration_id", "account_number", "id"]),
    makeConcept("start_date", "Start date", ["start_date", "issued_date", "effective_date", "license_start_date", "opened_date"]),
    makeConcept("end_date", "End date (if available)", ["end_date", "expired_date", "expiration_date", "closed_date"]),
    makeConcept("status", "Status", ["status", "license_status", "registration_status"]),
    makeConcept("category", "Category/NAICS", ["naics", "naics_code", "business_type", "category", "industry"]),
    ...COMMON_LOCATION_CONCEPTS,
  ],
}

export function getExpectedConcepts(metricKey: string, group?: string): ExpectedConcept[] {
  if (CORE_EXPECTED[metricKey]) return CORE_EXPECTED[metricKey]

  const g = (group || "").toLowerCase()
  if (g.includes("traffic")) {
    return [
      makeConcept("record_id", "Record ID", ["id", "citation_id", "stop_id", "collision_id", "case_id", "record_id"]),
      makeConcept("occurred_at", "Occurred date/time", ["date", "datetime", "occurred", "crash_date", "issue_date", "stop_date"]),
      makeConcept("type", "Type/category", ["type", "category", "violation", "primary_reason", "cause"]),
      ...COMMON_LOCATION_CONCEPTS,
    ]
  }
  if (g.includes("safety")) {
    return [
      makeConcept("record_id", "Record ID", ["id", "event_id", "incident_id", "call_id", "record_id"]),
      makeConcept("occurred_at", "Date/time", ["date", "datetime", "received", "dispatch", "arrival", "occurred"]),
      makeConcept("type", "Type/category", ["type", "category", "priority", "call_type", "nature"]),
      ...COMMON_LOCATION_CONCEPTS,
    ]
  }
  if (g.includes("housing")) {
    return [
      makeConcept("record_id", "Record ID", ["id", "case_id", "notice_id", "record_id"]),
      makeConcept("created_at", "Created/issued date", ["date", "created", "issued", "notice_date", "filed_date"]),
      makeConcept("status", "Status/outcome", ["status", "outcome", "disposition"]),
      ...COMMON_LOCATION_CONCEPTS,
    ]
  }
  if (g.includes("economy")) {
    return [
      makeConcept("record_id", "Record ID", ["id", "business_id", "license_id", "registration_id", "record_id"]),
      makeConcept("date", "Date", ["date", "start_date", "issue_date", "opened_date", "closed_date"]),
      makeConcept("status", "Status", ["status", "license_status", "registration_status"]),
      ...COMMON_LOCATION_CONCEPTS,
    ]
  }
  if (g.includes("public")) {
    return [
      makeConcept("request_id", "Request ID", ["service_request_id", "request_id", "case_id", "ticket_id", "unique_key"]),
      makeConcept("created_at", "Created date", ["created_date", "created_at", "open_date", "requested_datetime"]),
      makeConcept("category", "Category/type", ["type", "category", "complaint_type", "request_type"]),
      ...COMMON_LOCATION_CONCEPTS,
    ]
  }
  if (g.includes("crime")) {
    return CORE_EXPECTED.template_violent_crime_fbi_type_i
  }
  return [
    makeConcept("record_id", "Record ID", ["id", "record_id", "case_id", "incident_id"]),
    makeConcept("date", "Date/time", ["date", "datetime", "created", "occurred"]),
    makeConcept("type", "Type/category", ["type", "category", "description"]),
  ]
}

export function assessConceptCoverage(columns: string[], concepts: ExpectedConcept[]) {
  const cols = columns.map((c) => c.toLowerCase())
  const conceptFindings = concepts.map((concept) => {
    const hits = concept.anyOf.filter((alt) => cols.includes(alt.toLowerCase()))
    return { concept, matchedColumns: hits, ok: hits.length > 0 }
  })
  const okCount = conceptFindings.filter((f) => f.ok).length
  const ratio = concepts.length ? okCount / concepts.length : 0
  return { conceptFindings, okCount, total: concepts.length, ratio }
}

