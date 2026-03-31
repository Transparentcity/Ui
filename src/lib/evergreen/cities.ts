import type { LaunchCity } from "./types";

export const LAUNCH_CITIES: LaunchCity[] = [
  {
    name: "San Francisco",
    slug: "san-francisco",
    state: "California",
    stateCode: "CA",
    policeDashboardUrl: "https://www.sanfranciscopolice.org/stay-safe/crime-data",
  },
  {
    name: "Los Angeles",
    slug: "los-angeles",
    state: "California",
    stateCode: "CA",
    policeDashboardUrl: "https://www.lapdonline.org/crime-mapping-and-compstat/",
  },
  {
    name: "Chicago",
    slug: "chicago",
    state: "Illinois",
    stateCode: "IL",
    policeDashboardUrl: "https://home.chicagopolice.org/statistics-data/",
  },
  {
    name: "Houston",
    slug: "houston",
    state: "Texas",
    stateCode: "TX",
    policeDashboardUrl: "https://www.houstontx.gov/police/cs/crime-stats-archives.htm",
  },
  {
    name: "Phoenix",
    slug: "phoenix",
    state: "Arizona",
    stateCode: "AZ",
    policeDashboardUrl: "https://www.phoenix.gov/police/resources-information/crime-stats",
  },
  {
    name: "Philadelphia",
    slug: "philadelphia",
    state: "Pennsylvania",
    stateCode: "PA",
    policeDashboardUrl: "https://www.phillypolice.com/crime-maps-stats/",
  },
  {
    name: "Seattle",
    slug: "seattle",
    state: "Washington",
    stateCode: "WA",
    policeDashboardUrl: "https://www.seattle.gov/police/information-and-data/crime-dashboard",
  },
  {
    name: "Denver",
    slug: "denver",
    state: "Colorado",
    stateCode: "CO",
    policeDashboardUrl: "https://www.denvergov.org/opendata/dataset/crime",
  },
  {
    name: "Austin",
    slug: "austin",
    state: "Texas",
    stateCode: "TX",
    policeDashboardUrl: "https://data.austintexas.gov/Public-Safety/Crime-Reports/fdj4-gpfu",
  },
  {
    name: "Portland",
    slug: "portland",
    state: "Oregon",
    stateCode: "OR",
    policeDashboardUrl: "https://www.portlandoregon.gov/police/71978",
  },
  {
    name: "Atlanta",
    slug: "atlanta",
    state: "Georgia",
    stateCode: "GA",
    policeDashboardUrl: "https://www.atlantapd.org/i-want-to/crime-data-downloads",
  },
  {
    name: "Miami",
    slug: "miami",
    state: "Florida",
    stateCode: "FL",
    policeDashboardUrl: "https://www.miamigov.com/Government/Departments-Organizations/Police/Crime-Statistics",
  },
  {
    name: "Boston",
    slug: "boston",
    state: "Massachusetts",
    stateCode: "MA",
    policeDashboardUrl: "https://data.boston.gov/dataset/crime-incident-reports-august-2015-to-date-source-new-system",
  },
  {
    name: "Minneapolis",
    slug: "minneapolis",
    state: "Minnesota",
    stateCode: "MN",
    policeDashboardUrl: "https://www.minneapolismn.gov/government/government-data/datasource/crime-dashboard/",
  },
  {
    name: "Nashville",
    slug: "nashville",
    state: "Tennessee",
    stateCode: "TN",
    policeDashboardUrl: "https://www.nashville.gov/departments/police/online-resources/crime-statistics",
  },
];

export function getLaunchCity(slug: string): LaunchCity | undefined {
  return LAUNCH_CITIES.find((c) => c.slug === slug);
}
