#!/bin/bash
PYTHON_EXEC='/Users/adamwerbach/Dropbox/Coding Practice/Transparent CITY/TranparentCityPlatform/venv/bin/python3'
echo 'Refining New York City - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "rvmf-4sg6"
echo 'Refining New York City - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "uip8-fykc"
echo 'Refining New York City - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "ex6k-ym48"
echo 'Refining New York City - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "f6an-2v46"
echo 'Refining New York City - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "hn9i-dwpr"
echo 'Refining New York City - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "h9gi-nx95"
echo 'Refining New York City - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "h9gi-nx95"
echo 'Refining New York City - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "gpny-cuvw"
echo 'Refining New York City - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "8m42-w767"
echo 'Refining New York City - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_business_closures" --rejected-dataset-id "rpeq-j89e"
echo 'Refining New York City - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "u42f-se8e"
echo 'Refining New York City - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining New York City - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57035" --city-name "New York City" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Austin - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56718" --city-name "Austin" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "c7ck-438e"
echo 'Refining Chicago - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "dpt3-jri9"
echo 'Refining Chicago - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "t2rn-p8d7"
echo 'Refining Chicago - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "64yp-nqnb"
echo 'Refining Chicago - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "hhkd-xvj4"
echo 'Refining Chicago - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "gzaz-isa6"
echo 'Refining Chicago - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "gzaz-isa6"
echo 'Refining Chicago - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "s6ha-ppgi"
echo 'Refining Chicago - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Chicago - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56838" --city-name "Chicago" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Washington - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56493" --city-name "Washington" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "9bjs-7a7w"
echo 'Refining Seattle - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "m5wp-2cu4"
echo 'Refining Seattle - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_da_convictions" --rejected-dataset-id "i2q9-thny"
echo 'Refining Seattle - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "wps7-2x5k"
echo 'Refining Seattle - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "k7ra-jqqe"
echo 'Refining Seattle - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Seattle - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57414" --city-name "Seattle" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "y8y3-fqfu"
echo 'Refining Los Angeles - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "br3a-db9a"
echo 'Refining Los Angeles - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "8c4g-tg22"
echo 'Refining Los Angeles - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Los Angeles - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57201" --city-name "Los Angeles" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining San Francisco - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "huqr-9p9x"
echo 'Refining San Francisco - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "czsm-3ei3"
echo 'Refining San Francisco - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "dcjk-vw8q"
echo 'Refining San Francisco - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_da_convictions" --rejected-dataset-id "ynfy-z5kt"
echo 'Refining San Francisco - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "d5uh-bk84"
echo 'Refining San Francisco - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "ubqf-aqzw"
echo 'Refining San Francisco - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "nwes-mmgh"
echo 'Refining San Francisco - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "dau3-4s8f"
echo 'Refining San Francisco - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining San Francisco - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "ed3a-sn39"
echo 'Refining San Francisco - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "ed3a-sn39"
echo 'Refining San Francisco - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "jxrr-bmra"
echo 'Refining San Francisco - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining San Francisco - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining San Francisco - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining San Francisco - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "5cei-gny5"
echo 'Refining San Francisco - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining San Francisco - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining San Francisco - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57260" --city-name "San Francisco" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Dallas - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56729" --city-name "Dallas" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Baltimore - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56620" --city-name "Baltimore" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Indianapolis - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56593" --city-name "Indianapolis" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Louisville - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56608" --city-name "Louisville" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "crime-incidents"
echo 'Refining Philadelphia - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "district-attorney-dashboard"
echo 'Refining Philadelphia - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "district-attorney-dashboard"
echo 'Refining Philadelphia - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_da_convictions" --rejected-dataset-id "district-attorney-dashboard"
echo 'Refining Philadelphia - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "complaints-against-police"
echo 'Refining Philadelphia - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "traffic-preventative-maintenance-districts"
echo 'Refining Philadelphia - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "vision-zero-high-injury-network"
echo 'Refining Philadelphia - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "fatal-crashes"
echo 'Refining Philadelphia - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "affordable-housing-production"
echo 'Refining Philadelphia - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "tobacco-retailer-density-caps"
echo 'Refining Philadelphia - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Philadelphia - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56692" --city-name "Philadelphia" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Charlotte - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56656" --city-name "Charlotte" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=fc701d4b3e14413db2d9f78f0ae0a105&sublayer=0"
echo 'Refining Detroit - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=b7398ab13f7b4d378fedae128ecd4763&sublayer=0"
echo 'Refining Detroit - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=50f6659f20ac4628938b39c46482ffee&sublayer=0"
echo 'Refining Detroit - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=fc701d4b3e14413db2d9f78f0ae0a105&sublayer=0"
echo 'Refining Detroit - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=d837b05bdd9643698be30dfedbab0272"
echo 'Refining Detroit - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=d837b05bdd9643698be30dfedbab0272"
echo 'Refining Detroit - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=a5580d2dde964201ae026c6472d85397"
echo 'Refining Detroit - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=d157b0f3decd4c8ea1b0e12c82657552&sublayer=0"
echo 'Refining Detroit - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=d157b0f3decd4c8ea1b0e12c82657552&sublayer=0"
echo 'Refining Detroit - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=97f9196d8d134f09885cbce2cfa83ef3&sublayer=0"
echo 'Refining Detroit - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=b009a0341cd64dc5be58521f563c4b99&sublayer=0"
echo 'Refining Detroit - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "https://www.arcgis.com/home/item.html?id=5abb92d04b454ad1a32f336ef9065a48&sublayer=0"
echo 'Refining Detroit - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Detroit - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56919" --city-name "Detroit" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Boston - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56883" --city-name "Boston" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Memphis - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56709" --city-name "Memphis" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "c414a023-8e2c-4ed0-a0e0-2731913161a1"
echo 'Refining San Jose - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "918fb7f0-60c0-484e-b31c-334d1ec74e92"
echo 'Refining San Jose - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "918fb7f0-60c0-484e-b31c-334d1ec74e92"
echo 'Refining San Jose - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "8160209b-6da1-44d2-802b-c156a4b6feaf"
echo 'Refining San Jose - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "ca8c890b-5869-49b6-ad7d-7913d36b6bee"
echo 'Refining San Jose - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "84c74e2b-7dbd-47c7-a417-428ace6f5d0c"
echo 'Refining San Jose - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining San Jose - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57261" --city-name "San Jose" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining San Antonio - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56768" --city-name "San Antonio" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Nashville - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56711" --city-name "Nashville" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "cc08aace-9ca9-467f-b6c1-f0879ab1a358"
echo 'Refining Phoenix - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "6f58a024-6fc2-4405-9306-15f2021c3c06"
echo 'Refining Phoenix - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "50f5e1bf-c0de-4764-b8aa-e5ccad9f94a8"
echo 'Refining Phoenix - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "1e0ea85f-3aed-4f1f-93e8-ada3c15db86c"
echo 'Refining Phoenix - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "caf49f72-f22f-4ad9-9405-2a3db9619423"
echo 'Refining Phoenix - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "afc289c6-600f-4c24-a1f4-d0989f191cc7"
echo 'Refining Phoenix - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "024e45b8-ebb9-4320-ab19-42343b10d893"
echo 'Refining Phoenix - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "07ed9f17-3d70-474b-9afb-b73d985191a3"
echo 'Refining Phoenix - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Phoenix - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57110" --city-name "Phoenix" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining San Diego - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57259" --city-name "San Diego" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Houston - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56743" --city-name "Houston" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Columbus - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56577" --city-name "Columbus" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Las Vegas - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "57337" --city-name "Las Vegas" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_total_police_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_total_police_incidents" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_arrests_presented_to_da...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_arrests_presented_to_da" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_da_charges_filed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_da_charges_filed" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_da_convictions...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_da_convictions" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_autonomous_vehicle_complaints...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_autonomous_vehicle_complaints" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_speed_camera_warnings...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_speed_camera_warnings" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_speed_camera_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_speed_camera_citations" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_traffic_citations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_traffic_citations" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_traffic_stops...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_traffic_stops" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_traffic_injuries...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_traffic_injuries" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_traffic_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_traffic_fatalities" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_911_response_time_danger_to_life_minutes...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_911_response_time_danger_to_life_minutes" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_fire_incidents...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_fire_incidents" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_fire_fatalities...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_fire_fatalities" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_overdose_related_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_overdose_related_911_calls" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_narcan_overdose_reversals...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_narcan_overdose_reversals" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_unintentional_drug_overdose_deaths...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_unintentional_drug_overdose_deaths" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_police_drone_flights...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_police_drone_flights" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_homeless_complaint_911_calls...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_homeless_complaint_911_calls" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_homeless_concerns_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_homeless_concerns_311_cases" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_eviction_notices...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_eviction_notices" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_new_housing_units_completed...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_new_housing_units_completed" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_business_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_business_closures" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_new_retail_registrations...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_new_retail_registrations" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_retail_closures...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_retail_closures" --rejected-dataset-id "none"
echo 'Refining Fort Worth - dashboard_offensive_graffiti_311_cases...'
"$PYTHON_EXEC" scripts/smart_refine_match.py --city-id "56735" --city-name "Fort Worth" --metric-key "dashboard_offensive_graffiti_311_cases" --rejected-dataset-id "none"
